import { z } from 'zod';
import { cfg } from '../config.js';
import { generateEmbedding } from '../embeddings.js';
import { searchByEmbedding } from '../db.js';
import { GATE_SYSTEM_PROMPT, ADVERSARIAL_SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { updateVerdict } from './queue.js';
import type { QueueEntry, GatekeeperVerdict } from './types.js';

// ─── Zod schema for gate LLM response ────────────────────────────────────────

const VerdictSchema = z.object({
  quality_score:  z.number().int().min(1).max(10),
  label:          z.string(),
  analysis:       z.string(),
  recommendation: z.enum(['keep', 'drop', 'axiom', 'improve']),
  reformulation:    z.string().optional(),
  // .catch(undefined): if the LLM returns a malformed contradiction object (missing fields, nulls),
  // treat it as no contradiction rather than failing the entire verdict parse.
  contradiction:    z.object({
    severity:               z.enum(['soft', 'hard', 'veto_violation']),
    conflicting_thought_id: z.string(),
    summary:                z.string(),
  }).optional().catch(undefined),
  adversarial_note: z.string().optional(),
});

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fetchSimilarThoughts(content: string) {
  try {
    const embedding = await generateEmbedding(content);
    const results   = await searchByEmbedding(embedding, 5, 0.5);
    return results.map(t => ({
      id:      t.id,
      content: t.content,
      type:    t.metadata.type as string,
    }));
  } catch {
    return [];
  }
}

async function openrouterChat(
  model:   string,
  system:  string,
  user:    string,
  jsonMode = true,
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${cfg.openrouter.apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
      temperature:     0.3,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('OpenRouter returned no choices in response');
  }
  return data.choices[0].message.content;
}

// ─── adversarial review ───────────────────────────────────────────────────────

async function adversarialNote(
  original:      string,
  reformulation: string,
): Promise<string | undefined> {
  try {
    const text = await openrouterChat(
      cfg.gate.model,
      ADVERSARIAL_SYSTEM_PROMPT,
      `Original: ${original}\n\nReformulation: ${reformulation}`,
      false,  // plain text
    );
    return text.trim();
  } catch {
    return undefined;
  }
}

// ─── main gate call ───────────────────────────────────────────────────────────

async function callGate(entry: QueueEntry): Promise<GatekeeperVerdict> {
  const similarThoughts = await fetchSimilarThoughts(entry.content);
  const userMessage     = buildUserMessage(entry.content, entry.capture_reason, similarThoughts);

  const raw  = await openrouterChat(cfg.gate.model, GATE_SYSTEM_PROMPT, userMessage);
  const parsed = JSON.parse(raw) as unknown;
  const verdict = VerdictSchema.parse(parsed);

  // Adversarial review for borderline items (score 4–7) with a reformulation
  if (
    cfg.gate.adversarial &&
    verdict.quality_score >= 4 &&
    verdict.quality_score <= 7 &&
    verdict.reformulation
  ) {
    verdict.adversarial_note = await adversarialNote(entry.content, verdict.reformulation);
  }

  return verdict;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a queue entry asynchronously. Writes verdict back into queue.json.
 * Designed to run detached (fire-and-forget from the caller's perspective).
 *
 * Fail-open: on any error the entry is marked gate-failed (never silently lost).
 */
export async function evaluate(entry: QueueEntry): Promise<void> {
  try {
    const verdict = await callGate(entry);
    updateVerdict(entry.id, verdict, 'evaluated');
  } catch (err) {
    console.error('[gate] evaluation failed:', err instanceof Error ? err.message : err);
    updateVerdict(entry.id, undefined, 'gate-failed');
  }
}
