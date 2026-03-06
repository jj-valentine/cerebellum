#!/usr/bin/env node
/**
 * Cerebellum CLI
 *
 * Usage:
 *   brain "thought to capture"
 *   brain search "what was I thinking about X"
 *   brain recent [--days 7] [--limit 20]
 *   brain stats
 *
 * Setup alias:
 *   alias brain="node --import tsx/esm /Users/james/dev/new/cerebellum/src/cli/index.ts"
 */

import { captureThought, formatConfirmation } from '../capture.js';
import { searchByEmbedding, listRecent, getStats } from '../db.js';
import { generateEmbedding } from '../embeddings.js';

const args = process.argv.slice(2);
const command = args[0];

function print_help() {
  console.log(`
cerebellum — personal second brain CLI

  brain "thought"          Capture a thought
  brain search "query"     Semantic search
  brain recent             List recent thoughts (--days N  --limit N)
  brain stats              Show thinking patterns
  brain help               Show this message
`.trim());
}

async function cmd_capture(text: string) {
  process.stdout.write('Capturing... ');
  const result = await captureThought(text);
  console.log('\n' + formatConfirmation(result));
}

async function cmd_search(query: string, limit = 10) {
  const embedding = await generateEmbedding(query);
  const results = await searchByEmbedding(embedding, limit);

  if (!results.length) {
    console.log('No matching thoughts found.');
    return;
  }

  console.log(`\n${results.length} result${results.length > 1 ? 's' : ''} for "${query}":\n`);
  for (const [i, t] of results.entries()) {
    const m = t.metadata;
    const date = new Date(t.created_at).toLocaleDateString();
    const sim = t.similarity ? ` (${(t.similarity * 100).toFixed(0)}%)` : '';
    console.log(`[${i + 1}]${sim}  ${date}  ${m.type}`);
    console.log(`  ${t.content}`);
    if (m.topics.length)  console.log(`  topics:  ${m.topics.join(', ')}`);
    if (m.people.length)  console.log(`  people:  ${m.people.join(', ')}`);
    console.log();
  }
}

async function cmd_recent(days = 7, limit = 20) {
  const thoughts = await listRecent(days, limit);

  if (!thoughts.length) {
    console.log(`No thoughts in the last ${days} day${days > 1 ? 's' : ''}.`);
    return;
  }

  console.log(`\n${thoughts.length} thought${thoughts.length > 1 ? 's' : ''} in the last ${days} day${days > 1 ? 's' : ''}:\n`);
  for (const [i, t] of thoughts.entries()) {
    const m = t.metadata;
    const date = new Date(t.created_at).toLocaleString();
    console.log(`[${i + 1}]  ${date}  ${m.type}`);
    console.log(`  ${t.content}`);
    if (m.topics.length)       console.log(`  topics:  ${m.topics.join(', ')}`);
    if (m.people.length)       console.log(`  people:  ${m.people.join(', ')}`);
    if (m.action_items.length) console.log(`  actions: ${m.action_items.join(' · ')}`);
    console.log();
  }
}

async function cmd_stats() {
  const s = await getStats();

  console.log(`\nTotal thoughts: ${s.total}\n`);

  if (Object.keys(s.by_type).length) {
    console.log('By type:');
    for (const [type, count] of Object.entries(s.by_type).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type.padEnd(14)} ${count}`);
    }
    console.log();
  }

  if (s.top_topics.length) {
    console.log('Top topics:');
    for (const { topic, count } of s.top_topics) {
      console.log(`  ${topic.padEnd(20)} ${count}`);
    }
    console.log();
  }

  if (s.top_people.length) {
    console.log('Top people:');
    for (const { person, count } of s.top_people) {
      console.log(`  ${person.padEnd(20)} ${count}`);
    }
    console.log();
  }
}

// --- Route ---

if (!command || command === 'help' || command === '--help' || command === '-h') {
  print_help();
} else if (command === 'search') {
  const query = args[1];
  if (!query) { console.error('Usage: brain search "query"'); process.exit(1); }
  const limitFlag = args.indexOf('--limit');
  const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1] ?? '10') : 10;
  await cmd_search(query, limit);
} else if (command === 'recent') {
  const daysFlag  = args.indexOf('--days');
  const limitFlag = args.indexOf('--limit');
  const days  = daysFlag  >= 0 ? parseInt(args[daysFlag  + 1] ?? '7')  : 7;
  const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1] ?? '20') : 20;
  await cmd_recent(days, limit);
} else if (command === 'stats') {
  await cmd_stats();
} else {
  // Default: treat the argument as a thought to capture
  await cmd_capture(args.join(' '));
}
