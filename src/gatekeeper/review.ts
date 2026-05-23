import { select, confirm } from '@inquirer/prompts';
import { readQueue, removeEntry } from './queue.js';
import { evaluate } from './index.js';
import { captureThought } from '../capture.js';
import { keypress } from '../cli/keypress.js';
import type { KeyChoice } from '../cli/keypress.js';
import type { QueueEntry } from './types.js';
import { emit } from '../telemetry.js';

type ReviewAction = 'keep' | 'drop' | 'axiom' | 'skip' | 'quit' | 'retry';

// ─── display helpers ──────────────────────────────────────────────────────────

function separator() { console.log(`\n${'─'.repeat(62)}`); }

function agreedWithGate(action: 'keep' | 'drop' | 'axiom', entry: QueueEntry): boolean {
  const rec = entry.verdict?.recommendation;
  if (!rec) return false;
  if (action === 'drop') return rec === 'drop';
  if (action === 'axiom') return rec === 'axiom' || rec === 'keep';
  // action === 'keep'
  return rec === 'keep' || rec === 'improve';
}

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

// ─── resolve one entry ────────────────────────────────────────────────────────

function buildChoices(entry: QueueEntry): KeyChoice<ReviewAction>[] {
  const quit: KeyChoice<ReviewAction> = { key: 'q', alias: 'escape', label: 'Quit', value: 'quit' };

  if (entry.status === 'gate-failed') {
    return [
      { key: 'r', label: 'Retry', value: 'retry' },
      { key: 'k', label: 'Keep',  value: 'keep'  },
      { key: 'a', label: 'Axiom', value: 'axiom' },
      { key: 'd', label: 'Drop',  value: 'drop'  },
      { key: 's', label: 'Skip',  value: 'skip'  },
      quit,
    ];
  }

  return [
    { key: 'k', label: 'Keep',  value: 'keep'  },
    { key: 'd', label: 'Drop',  value: 'drop'  },
    { key: 'a', label: 'Axiom', value: 'axiom' },
    { key: 's', label: 'Skip',  value: 'skip'  },
    quit,
  ];
}

/**
 * Returns true if the entry was resolved (removed from queue),
 * false if skipped, or 'quit' to break out of the review loop.
 */
async function resolveEntry(
  entry: QueueEntry,
  index: number,
  total: number,
): Promise<boolean | 'quit'> {
  let current = entry;

  while (true) {
    displayEntry(current, index, total);

    // Only true-pending entries (still evaluating) get silently skipped
    if (current.status === 'pending') return false;

    const choice = await keypress('Decision:', buildChoices(current));

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
        let usedReformulation = false;
        if (current.verdict?.reformulation) {
          const result = await _offerReformulation(current.verdict.reformulation, current.content);
          if (result.tag === 'back') continue;
          usedReformulation = result.value === current.verdict.reformulation;
          await captureThought(result.value, current.source);
        } else {
          await captureThought(current.content, current.source);
        }
        emit({
          event: 'review_action',
          action: usedReformulation ? 'reformulate' : 'keep',
          gate_score: current.verdict?.quality_score ?? -1,
          agreed_with_gate: agreedWithGate('keep', current),
          auto: false,
        });
        process.stdout.write(' → ✓ Stored.\n');
        removeEntry(current.id);
        return true;
      }

      case 'axiom': {
        if (current.verdict?.reformulation) {
          const result = await _offerReformulation(current.verdict.reformulation, current.content);
          if (result.tag === 'back') continue;
          await captureThought(result.value, current.source, 'axiom');
        } else {
          await captureThought(current.content, current.source, 'axiom');
        }
        emit({
          event: 'review_action',
          action: 'axiom',
          gate_score: current.verdict?.quality_score ?? -1,
          agreed_with_gate: agreedWithGate('axiom', current),
          auto: false,
        });
        process.stdout.write(' → ✓ Stored as axiom.\n');
        removeEntry(current.id);
        return true;
      }

      case 'drop': {
        emit({
          event: 'review_action',
          action: 'drop',
          gate_score: current.verdict?.quality_score ?? -1,
          agreed_with_gate: agreedWithGate('drop', current),
          auto: false,
        });
        process.stdout.write(' → ✓ Discarded.\n');
        removeEntry(current.id);
        return true;
      }

      case 'quit':
        return 'quit';

      case 'skip':
      default:
        process.stdout.write(' → Skipped.\n');
        return false;
    }
  }
}

type ReformulationResult = { tag: 'back' } | { tag: 'content'; value: string };

async function _offerReformulation(
  reformulation: string,
  original: string,
): Promise<ReformulationResult> {
  const ac = new AbortController();
  const onEsc = (_s: unknown, key: { name?: string }) => {
    if (key?.name === 'escape') ac.abort();
  };
  process.stdin.on('keypress', onEsc);
  let choice: string;
  try {
    choice = await select({
      message: 'Which version to store?',
      choices: [
        { name: `Suggested: "${reformulation}"`, value: 'reformulated' },
        { name: `Original:  "${original}"`,      value: 'original'     },
        { name: '← Back',                        value: 'back'         },
      ],
    }, { signal: ac.signal });
  } catch {
    return { tag: 'back' };
  } finally {
    process.stdin.removeListener('keypress', onEsc);
  }
  if (choice === 'back') return { tag: 'back' };
  return { tag: 'content', value: choice === 'reformulated' ? reformulation : original };
}

// ─── auto mode ───────────────────────────────────────────────────────────────

interface FlushBucket {
  accept:  QueueEntry[];
  drop:    QueueEntry[];
  review:  QueueEntry[];
  pending: QueueEntry[];
}

function classifyForFlush(entries: QueueEntry[]): FlushBucket {
  const result: FlushBucket = { accept: [], drop: [], review: [], pending: [] };

  for (const entry of entries) {
    if (entry.status === 'pending') {
      result.pending.push(entry);
      continue;
    }
    if (entry.status === 'gate-failed') {
      result.review.push(entry);
      continue;
    }

    const v = entry.verdict;
    if (!v) { result.review.push(entry); continue; }

    const hasHardContradiction = v.contradiction &&
      (v.contradiction.severity === 'hard' || v.contradiction.severity === 'axiom_violation');
    if (hasHardContradiction) { result.review.push(entry); continue; }

    const { recommendation, quality_score } = v;

    if (entry.is_axiom || recommendation === 'axiom') {
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

  if (buckets.accept.length) {
    console.log('\n  Will accept:\n');
    for (const entry of buckets.accept) {
      const v = entry.verdict!;
      const content = (v.recommendation === 'improve' && v.reformulation) ? v.reformulation : entry.content;
      const usesReformulation = v.recommendation === 'improve' && !!v.reformulation;
      const tag = v.recommendation === 'axiom' ? '⚡' : usesReformulation ? '↻' : '✓';
      console.log(`    ${tag} [${v.quality_score}/10 ${v.recommendation}] ${content.slice(0, 100)}${content.length > 100 ? '…' : ''}`);
    }
  }

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

  let stored = 0;
  let errors = 0;
  for (const entry of buckets.accept) {
    const v = entry.verdict!;
    const content = (v.recommendation === 'improve' && v.reformulation) ? v.reformulation : entry.content;
    const typeOverride = v.recommendation === 'axiom' ? 'axiom' as const : undefined;

    try {
      await captureThought(content, entry.source, typeOverride);
      emit({
        event: 'review_action',
        action: v.recommendation === 'axiom' ? 'axiom' : (v.reformulation ? 'reformulate' : 'keep'),
        gate_score: v.quality_score,
        agreed_with_gate: true,
        auto: true,
      });
      removeEntry(entry.id);
      stored++;
      process.stdout.write(`  ✓ ${stored}/${buckets.accept.length}\r`);
    } catch (err) {
      errors++;
      console.error(`  ✗ Failed to store entry ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let dropped = 0;
  for (const entry of buckets.drop) {
    try {
      emit({
        event: 'review_action',
        action: 'drop',
        gate_score: entry.verdict?.quality_score ?? -1,
        agreed_with_gate: true,
        auto: true,
      });
      removeEntry(entry.id);
      dropped++;
    } catch (err) {
      errors++;
      console.error(`  ✗ Failed to drop entry ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  separator();
  console.log(`  ✓ Flush complete: ${stored} stored, ${dropped} dropped${errors ? `, ${errors} errors` : ''}`);

  const remaining = readQueue().length;
  if (remaining > 0) {
    console.log(`  ${remaining} entries remain in queue (run \`memo review\` for manual review).`);
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

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
  let quit = false;

  for (let i = 0; i < ready.length; i++) {
    const current = readQueue();
    const entry   = current.find(e => e.id === ready[i].id);
    if (!entry) continue; // already removed

    const resolved = await resolveEntry(entry, i, ready.length);
    if (resolved === 'quit') { quit = true; break; }
    if (resolved) reviewed++;
  }

  const remaining = readQueue().filter(
    e => e.status === 'evaluated' || e.status === 'gate-failed',
  ).length;

  separator();
  if (quit) {
    console.log(`✓ Reviewed ${reviewed}. Quit with ${remaining} remaining in queue.`);
  } else if (remaining > 0) {
    console.log(`✓ Done. ${reviewed} stored  •  ${remaining} skipped (still in queue).`);
  } else {
    console.log(`✓ Queue cleared. ${reviewed} thought${reviewed !== 1 ? 's' : ''} stored.`);
  }
}
