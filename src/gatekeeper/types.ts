export type CaptureSource = 'cli' | 'mcp' | 'hook' | 'browser' | string;

export type QueueStatus =
  | 'pending'      // waiting for gate evaluation
  | 'evaluated'    // gate ran; awaiting user review
  | 'gate-failed'; // gate call failed; user decides manually

export type ContradictionSeverity = 'soft' | 'hard' | 'veto_violation';

export interface Contradiction {
  severity:               ContradictionSeverity;
  conflicting_thought_id: string;
  summary:                string;
}

export interface GatekeeperVerdict {
  quality_score:    number;      // 1–10
  label:            string;      // Noise | Low signal | Context-grade | Decision-grade | Insight-grade
  analysis:         string;      // human-readable assessment
  recommendation:   'keep' | 'drop' | 'axiom' | 'improve';
  reformulation?:   string;      // stronger version, if applicable
  contradiction?:   Contradiction;
  adversarial_note?: string;     // appended for borderline items (score 4–7)
}

export interface QueueEntry {
  id:               string;      // uuid
  content:          string;
  source:           CaptureSource;
  capture_reason?:  string;      // required for auto-captures; missing → score 1, recommend drop
  queued_at:        string;      // ISO timestamp
  status:           QueueStatus;
  verdict?:         GatekeeperVerdict;
  is_axiom?:        boolean;     // pre-flagged via --axiom flag
}
