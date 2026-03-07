import { generateEmbedding } from './embeddings.js';
import { classifyThought } from './classify.js';
import { insertThought } from './db.js';
import type { Thought } from './types.js';

export interface CaptureResult {
  thought: Thought;
  elapsed_ms: number;
}

export async function captureThought(content: string): Promise<CaptureResult> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Content cannot be empty');

  const start = Date.now();

  // Run embedding and classification in parallel
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(trimmed),
    classifyThought(trimmed),
  ]);

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
