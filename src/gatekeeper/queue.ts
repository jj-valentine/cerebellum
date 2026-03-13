import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import type { QueueEntry } from './types.js';
import { cfg } from '../config.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── read / write ─────────────────────────────────────────────────────────────

export function readQueue(): QueueEntry[] {
  const path = cfg.gate.queuePath;
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as QueueEntry[];
  } catch {
    console.warn('[queue] Could not parse queue file — treating as empty');
    return [];
  }
}

/**
 * Atomic write: write to a temp file then rename() so there is never a
 * partially-written queue.json even on power loss or kill -9.
 */
function writeQueue(entries: QueueEntry[]): void {
  const path = cfg.gate.queuePath;
  ensureDir(path);
  const tmp = join(dirname(path), `.cerebellum-queue-${Date.now()}.tmp`);
  writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
  renameSync(tmp, path);
}

// ─── public API ───────────────────────────────────────────────────────────────

export function enqueue(
  content:        string,
  source:         string,
  capture_reason?: string,
  is_axiom?:       boolean,
): QueueEntry {
  const entries = readQueue();

  if (entries.length >= cfg.gate.queueMax) {
    throw new Error(
      `Queue full (${cfg.gate.queueMax} items). Run 'brain review' to clear entries.`,
    );
  }

  const entry: QueueEntry = {
    id:             randomUUID(),
    content,
    source,
    capture_reason,
    queued_at:      new Date().toISOString(),
    status:         'pending',
    is_axiom,
  };

  writeQueue([...entries, entry]);
  return entry;
}

export function updateVerdict(
  id:      string,
  verdict: QueueEntry['verdict'],
  status:  QueueEntry['status'],
): void {
  const entries = readQueue();
  const updated = entries.map(e =>
    e.id === id ? { ...e, verdict, status } : e,
  );
  writeQueue(updated);
}

export function removeEntry(id: string): void {
  const entries = readQueue();
  writeQueue(entries.filter(e => e.id !== id));
}

/** Items ready for user review (evaluated or gate-failed). */
export function reviewableCount(): number {
  return readQueue().filter(
    e => e.status === 'evaluated' || e.status === 'gate-failed',
  ).length;
}
