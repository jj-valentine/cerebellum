import { select, confirm, input } from '@inquirer/prompts';
import { readQueue, removeEntry } from './queue.js';
import { captureThought } from '../capture.js';
import type { QueueEntry } from './types.js';

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
    if (severity === 'veto_violation') {
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

// ─── reformulation prompt ─────────────────────────────────────────────────────

async function chooseContent(entry: QueueEntry): Promise<string> {
  if (!entry.verdict?.reformulation) return entry.content;

  const useReformulated = await confirm({
    message: 'Use the suggested reformulation?',
    default: true,
  });

  return useReformulated ? entry.verdict.reformulation : entry.content;
}

// ─── edit loop ────────────────────────────────────────────────────────────────

async function runEditLoop(
  entry: QueueEntry,
): Promise<{ content: string; is_axiom: boolean } | null> {

  const edited = await input({
    message: 'Paste improved version:',
    validate: v => v.trim().length > 0 || 'Cannot be empty',
  });

  console.log(`\n  Using: "${edited.trim()}"\n`);

  const action = await select({
    message: 'What to do with the edited version?',
    choices: [
      { name: '✓ Keep', value: 'keep' },
      { name: '⚡ Axiom', value: 'axiom' },
      { name: '✗ Drop', value: 'drop' },
    ],
  });

  if (action === 'keep')  return { content: edited.trim(), is_axiom: false };
  if (action === 'axiom') return { content: edited.trim(), is_axiom: true  };
  return null;
}

// ─── resolve one entry ────────────────────────────────────────────────────────

/**
 * Returns true if the entry was resolved (removed from queue),
 * false if the user chose to skip it.
 */
async function resolveEntry(
  entry:  QueueEntry,
  index:  number,
  total:  number,
): Promise<boolean> {
  displayEntry(entry, index, total);

  // Gate-failed entries get a simplified choice set
  const isFailed  = entry.status === 'gate-failed';
  const isPending = !entry.verdict;

  if (isPending) return false; // still evaluating — skip silently

  const choices = isFailed
    ? [
        { name: '✓ Keep as-is', value: 'keep'  },
        { name: '✎ Edit',       value: 'edit'  },
        { name: '⚡ Axiom',     value: 'axiom' },
        { name: '✗ Drop',       value: 'drop'  },
        { name: '→ Skip',       value: 'skip'  },
      ]
    : [
        { name: `✓ Keep`,   value: 'keep'  },
        { name: '✗ Drop',   value: 'drop'  },
        { name: '⚡ Axiom', value: 'axiom' },
        { name: '✎ Edit',   value: 'edit'  },
        { name: '→ Skip',   value: 'skip'  },
      ];

  const choice = await select({ message: 'Decision:', choices });

  switch (choice) {

    case 'keep': {
      const content = await chooseContent(entry);
      await captureThought(content, entry.source);
      console.log('  ✓ Stored.');
      removeEntry(entry.id);
      return true;
    }

    case 'axiom': {
      const content = await chooseContent(entry);
      await captureThought(content, entry.source, 'veto');
      console.log('  ✓ Stored as axiom (permanent directive, confidence: 1.0).');
      removeEntry(entry.id);
      return true;
    }

    case 'drop': {
      console.log('  ✓ Discarded.');
      removeEntry(entry.id);
      return true;
    }

    case 'edit': {
      const result = await runEditLoop(entry);
      if (!result) {
        console.log('  ✓ Discarded.');
      } else {
        await captureThought(result.content, entry.source, result.is_axiom ? 'veto' : undefined);
        console.log(result.is_axiom ? '  ✓ Stored as axiom.' : '  ✓ Stored.');
      }
      removeEntry(entry.id);
      return true;
    }

    case 'skip':
    default:
      console.log('  → Skipped (stays in queue).');
      return false;
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

  // Iterate over the fixed initial list by ID — re-read the queue each time
  // so that entries removed by previous actions are naturally skipped.
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
