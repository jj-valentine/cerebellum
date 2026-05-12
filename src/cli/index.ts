#!/usr/bin/env node
/**
 * Cerebellum CLI
 *
 * Usage:
 *   memo "thought to capture"          Route through Operator → GK queue
 *   memo --axiom "directive"           Bypass Operator → GK queue as axiom
 *   memo review                        Review queued thoughts one by one
 *   memo review --auto                 Auto-accept high-score, auto-drop noise
 *   memo web                           Inspect/force-synthesise/discard held web entries
 *   memo search "what was I thinking"  Semantic search
 *   memo recent [--days 7] [--limit 20]
 *   memo stats
 *   memo test <command>                Run any command against sandbox
 *   memo test:reset                    Wipe sandbox data
 *   memo help
 *
 * Setup alias:
 *   alias memo="node --import tsx/esm /Users/james/dev/new/cerebellum/src/cli/index.ts"
 */

// "memo test <command>" — set env BEFORE any imports so config.ts picks it up
const _rawArgs = process.argv.slice(2);
if (_rawArgs[0] === 'test' && _rawArgs.length > 1) {
  process.env.CEREBELLUM_ENV = 'test';
  process.argv.splice(2, 1); // remove 'test' so downstream sees the real command
}

const { cfg } = await import('../config.js');
const { searchByEmbedding, listRecent, getStats, truncateTestTable } = await import('../db.js');
const { generateEmbedding } = await import('../embeddings.js');
const { enqueue, readQueue } = await import('../gatekeeper/queue.js');
const { evaluate } = await import('../gatekeeper/index.js');
const { runReview, runAuto } = await import('../gatekeeper/review.js');
const { intake } = await import('../operator/index.js');
const { cmd_seed, cmd_seed_undo } = await import('./seed.js');
const { cmd_import } = await import('./import.js');
const { runWebReview } = await import('./web.js');

if (cfg.env === 'test') {
  process.stderr.write('⚠ TEST MODE — using sandbox queue + thoughts_test table\n');
}

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

  memo "thought"                   Route through Operator → GK queue
  memo --axiom "directive"         Bypass Operator → GK queue as axiom
  memo review                      Review queued thoughts interactively
  memo web                         Inspect/force-synthesise/discard held entries
  memo search "query"              Semantic search
  memo recent                      List recent thoughts (--days N  --limit N)
  memo stats                       Show thinking patterns
  memo seed <file.json>             Batch capture from JSON (via SEED_PIPELINE)
  memo seed --inject <file.json>   Bypass gate — direct to DB
  memo seed --dry-run <file.json>  Preview entries without writing
  memo seed --undo                 Delete all seeded thoughts
  memo import --claude [path]      Import CLAUDE.md via LLM distillation
  memo import --cursor [path]      Import .cursorrules / CURSOR.md
  memo import --gemini [path]      Import GEMINI.md
  memo import --memory [path]      Import Claude memory notes
  memo import --dry-run --<platform>   Preview without writing
  memo import --undo --<platform>      Delete all import:<platform> thoughts
  memo import --force --<platform>     Bypass dedup guard
  memo test:reset                  Wipe sandbox data (requires CEREBELLUM_ENV=test)
  memo help                        Show this message
`.trim());
}

// ─── capture ─────────────────────────────────────────────────────────────────

async function cmd_capture(text: string, is_axiom = false) {
  if (is_axiom) {
    // --axiom bypasses Operator entirely → straight to GK
    const entry = enqueue(text, 'cli', undefined, true);
    evaluate(entry).catch(err =>
      console.error('[gate] background evaluation error:', err),
    );
    const total = readQueue().length;
    console.log(`⚡ Queued as axiom (${total} in queue)`);
    console.log(`  Run 'memo review' to evaluate and store.`);
  } else {
    // Normal capture → Operator (holds in web.json, evaluates async)
    await intake(text, 'cli');
    console.log(`✓ Held for synthesis`);
    console.log(`  Run 'memo web' to inspect or 'memo review' to see GK queue.`);
  }
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
    if (m.mentions.length)  console.log(`  people:  ${m.mentions.join(', ')}`);
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
    if (m.mentions.length)     console.log(`  people:  ${m.mentions.join(', ')}`);
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

try {

if (!command || command === 'help' || command === '--help' || command === '-h') {
  print_help();

} else if (command === 'review') {
  if (args.includes('--auto')) {
    await runAuto();
  } else {
    await runReview();
  }

} else if (command === 'web') {
  await runWebReview();

} else if (command === 'search') {
  const query = args[1];
  if (!query) { console.error('Usage: memo search "query"'); process.exit(1); }
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

} else if (command === 'seed') {
  if (args.includes('--undo')) {
    await cmd_seed_undo();
  } else {
    const dryRun = args.includes('--dry-run');
    const inject = args.includes('--inject');
    const file = args.slice(1).find(a => !a.startsWith('--'));
    if (!file) { console.error('Usage: memo seed [--dry-run] [--inject] <file.json>'); process.exit(1); }
    try {
      await cmd_seed(file, dryRun, inject);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

} else if (command === 'import') {
  const platforms = ['claude', 'cursor', 'gemini', 'memory'] as const;
  type Platform = typeof platforms[number];

  const platform = platforms.find(p => args.includes(`--${p}`));
  if (!platform) {
    console.error('Usage: memo import --<platform> [path]\nPlatforms: --claude  --cursor  --gemini  --memory');
    process.exit(1);
  }

  // Explicit path: value after the --platform flag, if it doesn't start with '--'
  const platformFlagIdx = args.indexOf(`--${platform}`);
  const maybePath       = args[platformFlagIdx + 1];
  const explicitPath    = maybePath && !maybePath.startsWith('--') ? maybePath : undefined;

  const modeArg  = args.find(a => a.startsWith('--mode='));
  const modeVal  = modeArg?.split('=')[1];
  if (modeVal && modeVal !== 'distill' && modeVal !== 'parse') {
    console.error(`Unknown --mode value: "${modeVal}". Valid values: distill, parse`);
    process.exit(1);
  }
  const mode = (modeVal ?? 'distill') as 'distill' | 'parse';

  await cmd_import({
    platform,
    explicitPath,
    mode,
    dryRun: args.includes('--dry-run'),
    undo:   args.includes('--undo'),
    force:  args.includes('--force'),
  });

} else if (command === 'test:reset') {
  if (cfg.env !== 'test') {
    console.error('Refused — test:reset requires CEREBELLUM_ENV=test');
    process.exit(1);
  }
  const { unlinkSync, existsSync } = await import('fs');
  let dbCount = 0;
  try { dbCount = await truncateTestTable(); } catch (e) {
    console.error(`DB wipe failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  let queueCleared = false;
  if (existsSync(cfg.gate.queuePath)) { unlinkSync(cfg.gate.queuePath); queueCleared = true; }
  let webCleared = false;
  if (existsSync(cfg.operator.webPath)) { unlinkSync(cfg.operator.webPath); webCleared = true; }
  console.log(`✓ Sandbox reset: ${dbCount} thoughts deleted, queue ${queueCleared ? 'cleared' : 'empty'}, web ${webCleared ? 'cleared' : 'empty'}`);

} else if (command === '--axiom') {
  const text = args.slice(1).join(' ');
  if (!text) { console.error('Usage: memo --axiom "directive"'); process.exit(1); }
  await cmd_capture(text, true);

} else {
  // Default: treat argument(s) as a thought to capture
  await cmd_capture(args.join(' '));
}

} catch (err) {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    process.exit(0);
  }
  throw err;
}

// Exit cleanly — don't hang on fire-and-forget async evaluations
process.exit(0);
