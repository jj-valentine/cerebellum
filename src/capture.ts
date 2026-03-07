import { generateEmbedding } from './embeddings.js';
import { classifyThought } from './classify.js';
import { insertThought } from './db.js';
import { withRetry } from './utils/retry.js';

const MAX_CHARS = 30_000;
import type { Thought } from './types.js';

export interface CaptureResult {
  thought: Thought;
  elapsed_ms: number;
}

export async function captureThought(content: string): Promise<CaptureResult> {
  let trimmed = content.trim();
  if (!trimmed) throw new Error('Content cannot be empty');

  if (trimmed.length > MAX_CHARS) {
    console.warn(`[capture] Content truncated from ${trimmed.length} to ${MAX_CHARS} chars`);
    trimmed = trimmed.slice(0, MAX_CHARS);
  }

  const start = Date.now();

  // Run embedding and classification in parallel, with retry on transient failures
  const [embedding, metadata] = await withRetry(() => Promise.all([
    generateEmbedding(trimmed),
    classifyThought(trimmed),
  ]));

  const thought = await insertThought(trimmed, embedding, metadata);
  const elapsed_ms = Date.now() - start;

  return { thought, elapsed_ms };
}

export function formatConfirmation(result: CaptureResult): string {
  const { thought, elapsed_ms } = result;
  const m = thought.metadata;

  const lines = [
    `✓ Captured in ${elapsed_ms}ms`,
    `  type:    ${m.type}`,
    `  topics:  ${m.topics.length ? m.topics.join(', ') : '(none)'}`,
    `  people:  ${m.people.length ? m.people.join(', ') : '(none)'}`,
  ];

  if (m.action_items.length) {
    lines.push(`  actions: ${m.action_items.join(' · ')}`);
  }

  return lines.join('\n');
}
