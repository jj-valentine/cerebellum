#!/usr/bin/env node
/**
 * Cerebellum CLI
 *
 * Usage:
 *   brain "thought to capture"          Queue a thought for gatekeeper review
 *   brain --axiom "directive"           Queue as axiom (permanent hard directive)
 *   brain review                        Review queued thoughts one by one
 *   brain search "what was I thinking"  Semantic search
 *   brain recent [--days 7] [--limit 20]
 *   brain stats
 *   brain help
 *
 * Setup alias:
 *   alias brain="node --import tsx/esm /Users/james/dev/new/cerebellum/src/cli/index.ts"
 */

import { searchByEmbedding, listRecent, getStats } from '../db.js';
import { generateEmbedding } from '../embeddings.js';
import { enqueue, readQueue } from '../gatekeeper/queue.js';
import { evaluate } from '../gatekeeper/index.js';
import { runReview } from '../gatekeeper/review.js';

const args    = process.argv.slice(2);
const command = args[0];

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseIntSafe(val: string | undefined, fallback: number): number {
  const n = parseInt(val ?? '', 10);
  return isNaN(n) || n < 0 ? fallback : n;
}

function print_help() {
  console.log(`
cerebellum — personal second brain CLI

  brain "thought"                   Queue a thought for gatekeeper review
  brain --axiom "directive"         Queue as axiom (permanent directive)
  brain review                      Review queued thoughts interactively
  brain search "query"              Semantic search
  brain recent                      List recent thoughts (--days N  --limit N)
  brain stats                       Show thinking patterns
  brain help                        Show this message
`.trim());
}

// ─── capture (queues → gate evaluates async) ─────────────────────────────────

async function cmd_capture(text: string, is_axiom = false) {
  const entry = enqueue(text, 'cli', undefined, is_axiom || undefined);

  // Fire-and-forget: gate evaluation runs in background
  evaluate(entry).catch(err =>
    console.error('[gate] background evaluation error:', err),
  );

  const total = readQueue().length; // entry already written; count all statuses

  if (is_axiom) {
    console.log(`⚡ Queued as axiom (${total} in queue)`);
  } else {
    console.log(`✓ Queued (${total} in queue)`);
  }
  console.log(`  Run 'brain review' to evaluate and store.`);
}

// ─── search ───────────────────────────────────────────────────────────────────

async function cmd_search(query: string, limit = 10) {
  const embedding = await generateEmbedding(query);
  const results   = await searchByEmbedding(embedding, limit);

  if (!results.length) {
    console.log('No matching thoughts found.');
    return;
  }

  console.log(`\n${results.length} result${results.length > 1 ? 's' : ''} for "${query}":\n`);
  for (const [i, t] of results.entries()) {
    const m    = t.metadata;
    const date = new Date(t.created_at).toLocaleDateString();
    const sim  = t.similarity ? ` (${(t.similarity * 100).toFixed(0)}%)` : '';
    console.log(`[${i + 1}]${sim}  ${date}  ${m.type}`);
    console.log(`  ${t.content}`);
    if (m.topics.length)  console.log(`  topics:  ${m.topics.join(', ')}`);
    if (m.people.length)  console.log(`  people:  ${m.people.join(', ')}`);
    console.log();
  }
}

// ─── recent ───────────────────────────────────────────────────────────────────

async function cmd_recent(days = 7, limit = 20) {
  const thoughts = await listRecent(days, limit);

  if (!thoughts.length) {
    console.log(`No thoughts in the last ${days} day${days > 1 ? 's' : ''}.`);
    return;
  }

  console.log(`\n${thoughts.length} thought${thoughts.length > 1 ? 's' : ''} in the last ${days} day${days > 1 ? 's' : ''}:\n`);
  for (const [i, t] of thoughts.entries()) {
    const m    = t.metadata;
    const date = new Date(t.created_at).toLocaleString();
    console.log(`[${i + 1}]  ${date}  ${m.type}`);
    console.log(`  ${t.content}`);
    if (m.topics.length)       console.log(`  topics:  ${m.topics.join(', ')}`);
    if (m.people.length)       console.log(`  people:  ${m.people.join(', ')}`);
    if (m.action_items.length) console.log(`  actions: ${m.action_items.join(' · ')}`);
    console.log();
  }
}

// ─── stats ────────────────────────────────────────────────────────────────────

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

// ─── route ────────────────────────────────────────────────────────────────────

if (!command || command === 'help' || command === '--help' || command === '-h') {
  print_help();

} else if (command === 'review') {
  await runReview();

} else if (command === 'search') {
  const query = args[1];
  if (!query) { console.error('Usage: brain search "query"'); process.exit(1); }
  const limitFlag = args.indexOf('--limit');
  const limit     = limitFlag >= 0 ? parseIntSafe(args[limitFlag + 1], 10) : 10;
  await cmd_search(query, limit);

} else if (command === 'recent') {
  const daysFlag  = args.indexOf('--days');
  const limitFlag = args.indexOf('--limit');
  const days  = daysFlag  >= 0 ? parseIntSafe(args[daysFlag  + 1], 7)  : 7;
  const limit = limitFlag >= 0 ? parseIntSafe(args[limitFlag + 1], 20) : 20;
  await cmd_recent(days, limit);

} else if (command === 'stats') {
  await cmd_stats();

} else if (command === '--axiom') {
  const text = args.slice(1).join(' ');
  if (!text) { console.error('Usage: brain --axiom "directive"'); process.exit(1); }
  await cmd_capture(text, true);

} else {
  // Default: treat argument(s) as a thought to capture
  await cmd_capture(args.join(' '));
}
