import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import { cfg } from './config.js';

// ─── event types ─────────────────────────────────────────────────────────────

interface ThoughtStoredEvent {
  event: 'thought_stored';
  thought_id: string;
  source: string;
}

interface ThoughtRetrievedEvent {
  event: 'thought_retrieved';
  thought_id: string;
  query: string;
  rank: number;
  score: number;
  source: string;
}

interface ReviewActionEvent {
  event: 'review_action';
  action: 'keep' | 'drop' | 'reformulate' | 'axiom';
  gate_score: number;
  agreed_with_gate: boolean;
  auto: boolean;
}

export type TelemetryEvent =
  | ThoughtStoredEvent
  | ThoughtRetrievedEvent
  | ReviewActionEvent;

// ─── logger setup ────────────────────────────────────────────────────────────

let logger: pino.Logger | null = null;
let destination: pino.DestinationStream | null = null;

function getLogger(): pino.Logger | null {
  if (logger) return logger;
  if (!cfg.telemetry.enabled) return null;

  try {
    const dir = cfg.telemetry.dir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const now = new Date();
    const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.jsonl`;

    const dest = pino.destination({ dest: join(dir, filename), sync: false });
    const log = pino(
      { base: undefined, timestamp: () => `,"ts":"${new Date().toISOString()}"` },
      dest,
    );
    destination = dest;
    logger = log;

    return logger;
  } catch {
    return null;
  }
}

// ─── public API ──────────────────────────────────────────────────────────────

export function emit(event: TelemetryEvent): void {
  const log = getLogger();
  if (!log) return;
  log.info(event);
}

export function flushTelemetry(): void {
  if (destination && typeof (destination as any).flushSync === 'function') {
    (destination as any).flushSync();
  }
}
