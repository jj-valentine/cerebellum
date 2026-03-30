import { select, input, confirm } from '@inquirer/prompts';
import { readQueue, removeEntry } from './queue.js';
import { evaluate } from './index.js';
import { captureThought } from '../capture.js';
import type { QueueEntry, GatekeeperVerdict } from './types.js';

// ─── display helpers ──────────────────────────────────────────────────────────

function separator() { console.log(`\n${'─'.repeat(62)}`); }

function displayEntry(entry: QueueEntry, index: number, total: number): void {
  const { verdict, status, source, capture_reason, content, is_axiom } = entry;

  separator();
  console.log(`[${index + 1}/${total}]  ${source} captured:`);
  console.log(`\n       "${content}"\n`);

  if (capture_reason) {
    console.log(`  Capture reason: ${capture_reason}`);
  }

  if (is_axiom) {
    console.log(`  ⚡ Pre-flagged as axiom by you.`);
  }

  if (status === 'gate-failed') {
    console.log(`  ⚠  Gate evaluation failed — make a manual call.`);
    return;
  }

  if (!verdict) {
    console.log(`  ⏳ Still evaluating — try again in a moment.`);
    return;
  }

  // Contradiction (highest priority — show first)
  if (verdict.contradiction) {
    const { severity, summary } = verdict.contradiction;
    if (severity === 'axiom_violation') {
      console.log(`  🚨 AXIOM VIOLATION: ${summary}`);
    } else if (severity === 'hard') {
      console.log(`  ⚠  CONTRADICTION (hard): ${summary}`);
    } else {
      console.log(`  ↕  Soft contradiction: ${summary}`);
    }
  }

  // Score + analysis
  const score = verdict.quality_score;
  const bar   = '█'.repeat(score) + '░'.repeat(10 - score);
  console.log(`  Gatekeeper [${score}/10 — ${verdict.label}]`);
  console.log(`  ${bar}`);
  console.log(`\n  ${verdict.analysis}`);

  if (verdict.reformulation) {
    console.log(`\n  → Suggested: "${verdict.reformulation}"`);
  }

  if (verdict.adversarial_note) {
    console.log(`\n  Adversarial: ${verdict.adversarial_note}`);
  }

  console.log('');
}

// ─── edit loop ────────────────────────────────────────────────────────────────

// Returns: { content, is_axiom } to store, null to drop, 'cancel' to go back to menu
async function runEditLoop(
  entry: QueueEntry,
): Promise<{ content: string; is_axiom: boolean } | null | 'cancel'> {
  let edited: string;

  try {
    edited = await input({ message: 'Paste improved version:' });
  } catch {
    // Esc pressed — go back to decision menu
    return 'cancel';
  }

  if (!edited.trim()) return 'cancel';

  console.log(`\n  Using: "${edited.trim()}"\n`);

  const action = await select({
    message: 'What to do with the edited version?',
    choices: [
      { name: '✓ Keep',  value: 'keep'  },
      { name: '★ Axiom', value: 'axiom' },
      { name: '✗ Drop',  value: 'drop'  },
    ],
  });

  if (action === 'keep')  return { content: edited.trim(), is_axiom: false };
  if (action === 'axiom') return { content: edited.trim(), is_axiom: true  };
  return null; // drop
}

// ─── resolve one entry ────────────────────────────────────────────────────────

function buildChoices(entry: QueueEntry) {
  return entry.status === 'gate-failed'
    ? [
        { name: '↺ Retry gate', value: 'retry' },
        { name: '✓ Keep as-is', value: 'keep'  },
        { name: '✎ Edit',       value: 'edit'  },
        { name: '★ Axiom',      value: 'axiom' },
        { name: '✗ Drop',       value: 'drop'  },
        { name: '→ Skip',       value: 'skip'  },
      ]
    : [
        { name: '✓ Keep',  value: 'keep'  },
        { name: '✗ Drop',  value: 'drop'  },
        { name: '★ Axiom', value: 'axiom' },
        { name: '✎ Edit',  value: 'edit'  },
        { name: '→ Skip',  value: 'skip'  },
      ];
}

/**
 * Returns true if the entry was resolved (removed from queue),
 * false if skipped.
 */
async function resolveEntry(
  entry: QueueEntry,
  index: number,
  total: number,
): Promise<boolean> {
  let current = entry;

  while (true) {
    displayEntry(current, index, total);

    // Only true-pending entries (still evaluating) get silently skipped
    if (current.status === 'pending') return false;

    const choice = await select({ message: 'Decision:', choices: buildChoices(current) });

    switch (choice) {

      case 'retry': {
        console.log('  ↺ Re-evaluating…');
        await evaluate(current);
        const updated = readQueue().find(e => e.id === current.id);
        if (!updated) return false;
        if (updated.status !== 'evaluated') {
          console.log('  ⚠  Re-evaluation failed again. Make a manual call.');
        }
        current = updated;
        continue;
      }

      case 'keep': {
        const content = current.verdict?.reformulation
          ? await _offerReformulation(current.verdict.reformulation, current.content)
          : current.content;
        await captureThought(content, current.source);
        console.log('  ✓ Stored.');
        removeEntry(current.id);
        return true;
      }

      case 'axiom': {
        const content = current.verdict?.reformulation
          ? await _offerReformulation(current.verdict.reformulation, current.content)
          : current.content;
        await captureThought(content, current.source, 'axiom');
        console.log('  ✓ Stored as axiom (permanent directive, confidence: 1.0).');
        removeEntry(current.id);
        return true;
      }

      case 'drop': {
        console.log('  ✓ Discarded.');
        removeEntry(current.id);
        return true;
      }

      case 'edit': {
        const result = await runEditLoop(current);
        if (result === 'cancel') continue; // Esc — loop back to decision menu
        if (!result) {
          console.log('  ✓ Discarded.');
        } else {
          await captureThought(result.content, current.source, result.is_axiom ? 'axiom' : undefined);
          console.log(result.is_axiom ? '  ✓ Stored as axiom.' : '  ✓ Stored.');
        }
        removeEntry(current.id);
        return true;
      }

      case 'skip':
      default:
        console.log('  → Skipped (stays in queue).');
        return false;
    }
  }
}

async function _offerReformulation(reformulation: string, original: string): Promise<string> {
  const choice = await select({
    message: 'Which version to store?',
    choices: [
      { name: `Suggested: "${reformulation}"`, value: 'reformulated' },
      { name: `Original:  "${original}"`,      value: 'original'     },
    ],
  });
  return choice === 'reformulated' ? reformulation : original;
}

// ─── public API ───────────────────────────────────────────────────────────────

// ─── auto mode ──────────────────────────────────────────────────────────────

interface FlushBucket {
  accept:  QueueEntry[];   // auto-store (axiom/keep ≥ 5, or improve with reformulation ≥ 5)
  drop:    QueueEntry[];   // auto-discard (rec=drop or score ≤ 3)
  review:  QueueEntry[];   // needs manual review
  pending: QueueEntry[];   // unevaluated (gate-failed or pending)
}

function classifyForFlush(entries: QueueEntry[]): FlushBucket {
  const result: FlushBucket = { accept: [], drop: [], review: [], pending: [] };

  for (const entry of entries) {
    if (entry.status === 'pending' || entry.status === 'gate-failed') {
      result.pending.push(entry);
      continue;
    }

    const v = entry.verdict;
    if (!v) { result.review.push(entry); continue; }

    const { recommendation, quality_score } = v;

    // Auto-accept: axioms, keeps, and improves with reformulations (all score ≥ 5)
    if (recommendation === 'axiom') {
      result.accept.push(entry);
    } else if (recommendation === 'keep' && quality_score >= 5) {
      result.accept.push(entry);
    } else if (recommendation === 'improve' && v.reformulation && quality_score >= 5) {
      result.accept.push(entry);
    } else if (recommendation === 'drop' || quality_score <= 3) {
      result.drop.push(entry);
    } else {
      result.review.push(entry);
    }
  }

  return result;
}

export async function runAuto(): Promise<void> {
  const allEntries = readQueue();
  if (!allEntries.length) {
    console.log('\nNo items in queue.');
    return;
  }

  const buckets = classifyForFlush(allEntries);

  // Display summary
  separator();
  console.log('  Queue auto analysis:\n');
  console.log(`    ✓ Auto-accept:     ${buckets.accept.length} entries`);
  console.log(`    ✗ Auto-drop:       ${buckets.drop.length} entries`);
  console.log(`    → Needs review:    ${buckets.review.length} entries`);
  console.log(`    ⏳ Unevaluated:    ${buckets.pending.length} entries`);
  console.log(`\n    Net: ${buckets.accept.length} stored, ${buckets.drop.length} dropped, ${buckets.review.length + buckets.pending.length} remaining`);
  separator();

  if (!buckets.accept.length && !buckets.drop.length) {
    console.log('\nNothing to auto-process. Run `memo review` for manual review.');
    return;
  }

  // Show what will be accepted
  if (buckets.accept.length) {
    console.log('\n  Will accept:\n');
    for (const entry of buckets.accept) {
      const v = entry.verdict!;
      const content = (v.recommendation === 'improve' && v.reformulation) ? v.reformulation : entry.content;
      const tag = v.recommendation === 'axiom' ? '⚡' : v.reformulation ? '↻' : '✓';
      console.log(`    ${tag} [${v.quality_score}/10 ${v.recommendation}] ${content.slice(0, 100)}${content.length > 100 ? '…' : ''}`);
    }
  }

  // Show what will be dropped
  if (buckets.drop.length) {
    console.log('\n  Will drop:\n');
    for (const entry of buckets.drop) {
      const score = entry.verdict?.quality_score ?? '?';
      console.log(`    ✗ [${score}/10] ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '…' : ''}`);
    }
  }

  console.log('');
  const proceed = await confirm({ message: 'Proceed with auto?', default: false });
  if (!proceed) {
    console.log('  Aborted.');
    return;
  }

  // Process accepts
  let stored = 0;
  let errors = 0;
  for (const entry of buckets.accept) {
    const v = entry.verdict!;
    const content = (v.recommendation === 'improve' && v.reformulation) ? v.reformulation : entry.content;
    const typeOverride = v.recommendation === 'axiom' ? 'axiom' as const : undefined;

    try {
      await captureThought(content, entry.source, typeOverride);
      removeEntry(entry.id);
      stored++;
      process.stdout.write(`  ✓ ${stored}/${buckets.accept.length}\r`);
    } catch (err) {
      errors++;
      console.error(`  ✗ Failed to store entry ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Process drops
  let dropped = 0;
  for (const entry of buckets.drop) {
    removeEntry(entry.id);
    dropped++;
  }

  separator();
  console.log(`  ✓ Flush complete: ${stored} stored, ${dropped} dropped${errors ? `, ${errors} errors` : ''}`);

  const remaining = readQueue().length;
  if (remaining > 0) {
    console.log(`  ${remaining} entries remain in queue (run \`memo review\` for manual review).`);
  }
}

export async function runReview(): Promise<void> {
  const allEntries = readQueue();
  const ready = allEntries.filter(
    e => e.status === 'evaluated' || e.status === 'gate-failed',
  );

  if (!ready.length) {
    const pending = allEntries.filter(e => e.status === 'pending').length;
    if (pending > 0) {
      console.log(`\n${pending} item${pending > 1 ? 's' : ''} still being evaluated. Try again shortly.`);
    } else {
      console.log('\nNo items in queue.');
    }
    return;
  }

  console.log(`\n📋 Queue: ${ready.length} item${ready.length > 1 ? 's' : ''} to review`);

  let reviewed = 0;

  for (let i = 0; i < ready.length; i++) {
    const current = readQueue();
    const entry   = current.find(e => e.id === ready[i].id);
    if (!entry) continue; // already removed

    const resolved = await resolveEntry(entry, i, ready.length);
    if (resolved) reviewed++;
  }

  const remaining = readQueue().filter(
    e => e.status === 'evaluated' || e.status === 'gate-failed',
  ).length;

  separator();
  if (remaining > 0) {
    console.log(`✓ Done. ${reviewed} stored  •  ${remaining} skipped (still in queue).`);
  } else {
    console.log(`✓ Queue cleared. ${reviewed} thought${reviewed !== 1 ? 's' : ''} stored.`);
  }
}
