import * as rl from 'readline/promises';
import { readQueue, removeEntry } from './queue.js';
import { captureThought } from '../capture.js';
import type { QueueEntry } from './types.js';

// ─── display helpers ──────────────────────────────────────────────────────────

function separator() { console.log(`\n${'─'.repeat(62)}`); }

function displayEntry(entry: QueueEntry, index: number, total: number): void {
  const { verdict, status, source, capture_reason, content, is_axiom } = entry;

  separator();
  console.log(`[${index + 1}/${total}]  ${source} captured:`);
  console.log(`       "${content}"`);

  if (capture_reason) {
    console.log(`\n  Capture reason: ${capture_reason}`);
  }

  if (is_axiom) {
    console.log(`\n  ⚡ Pre-flagged as axiom by you.`);
  }

  if (status === 'gate-failed') {
    console.log(`\n  ⚠  Gate evaluation failed (OpenRouter unavailable). Make a manual call.`);
    return;
  }

  if (!verdict) {
    console.log(`\n  ⏳ Still evaluating — try again in a moment.`);
    return;
  }

  // Contradiction (highest priority — show first)
  if (verdict.contradiction) {
    const { severity, summary } = verdict.contradiction;
    if (severity === 'veto_violation') {
      console.log(`\n  🚨 AXIOM VIOLATION: ${summary}`);
    } else if (severity === 'hard') {
      console.log(`\n  ⚠  CONTRADICTION (hard): ${summary}`);
    } else {
      console.log(`\n  ↕  Soft contradiction: ${summary}`);
    }
  }

  // Score + analysis
  console.log(`\n  Gatekeeper [${verdict.quality_score}/10 — ${verdict.label}]`);
  console.log(`  ${verdict.analysis}`);

  if (verdict.reformulation) {
    console.log(`\n  → Reformulated: "${verdict.reformulation}"`);
  }

  if (verdict.adversarial_note) {
    console.log(`\n  Adversarial: ${verdict.adversarial_note}`);
  }
}

// ─── reformulation prompt ─────────────────────────────────────────────────────

async function offerReformulation(
  iface:         rl.Interface,
  reformulation: string,
  original:      string,
): Promise<string> {
  const answer = await iface.question(`\n  Use reformulated version? [y/n] `);
  return answer.trim().toLowerCase() === 'y' ? reformulation : original;
}

// ─── edit loop ────────────────────────────────────────────────────────────────

async function runEditLoop(
  iface:   rl.Interface,
  entry:   QueueEntry,
): Promise<{ content: string; is_axiom: boolean } | null> {
  console.log('\n  Describe the improvement or paste a new version:');
  const edited = await iface.question('  > ');
  if (!edited.trim()) return null;

  const finalContent = edited.trim();
  console.log(`\n  Using: "${finalContent}"`);
  const confirm = await iface.question('  [keep]  [drop]  [axiom]: ');
  const action  = confirm.trim().toLowerCase();

  if (action === 'keep')  return { content: finalContent, is_axiom: false };
  if (action === 'axiom') return { content: finalContent, is_axiom: true  };
  return null; // drop
}

// ─── resolve one entry ────────────────────────────────────────────────────────

async function resolveEntry(
  iface:   rl.Interface,
  entry:   QueueEntry,
  index:   number,
  total:   number,
): Promise<void> {
  displayEntry(entry, index, total);

  const action = await iface.question('\n  [keep]  [drop]  [axiom]  [edit]: ');
  const choice = action.trim().toLowerCase();

  switch (choice) {

    case 'keep': {
      const content = entry.verdict?.reformulation
        ? await offerReformulation(iface, entry.verdict.reformulation, entry.content)
        : entry.content;
      await captureThought(content, entry.source);
      console.log('  ✓ Stored.');
      removeEntry(entry.id);
      break;
    }

    case 'axiom': {
      const content = entry.verdict?.reformulation
        ? await offerReformulation(iface, entry.verdict.reformulation, entry.content)
        : entry.content;
      await captureThought(content, entry.source, 'veto');
      console.log('  ✓ Stored as axiom (permanent directive, confidence: 1.0).');
      removeEntry(entry.id);
      break;
    }

    case 'drop': {
      console.log('  ✓ Discarded.');
      removeEntry(entry.id);
      break;
    }

    case 'edit': {
      const result = await runEditLoop(iface, entry);
      if (!result) {
        console.log('  ✓ Discarded.');
        removeEntry(entry.id);
      } else {
        await captureThought(result.content, entry.source, result.is_axiom ? 'veto' : undefined);
        console.log(result.is_axiom ? '  ✓ Stored as axiom.' : '  ✓ Stored.');
        removeEntry(entry.id);
      }
      break;
    }

    default: {
      console.log('  ? Unrecognised option — entry stays in queue.');
      break;
    }
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

  const iface = rl.createInterface({ input: process.stdin, output: process.stdout });

  try {
    for (let i = 0; i < ready.length; i++) {
      // Re-read queue each loop iteration — entries are removed as we go
      const current  = readQueue();
      const readyNow = current.filter(e => e.status === 'evaluated' || e.status === 'gate-failed');
      if (i >= readyNow.length) break;
      await resolveEntry(iface, readyNow[i], i, ready.length);
    }
  } finally {
    iface.close();
  }

  const remaining = readQueue().length;
  if (remaining > 0) {
    console.log(`\n${remaining} item${remaining > 1 ? 's' : ''} remain in queue.`);
  } else {
    separator();
    console.log('✓ Queue cleared.');
  }
}
