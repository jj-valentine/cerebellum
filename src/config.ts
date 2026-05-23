import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';

// Resolve .env relative to this file, not cwd — needed when spawned by MCP clients
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

function require_env(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional_env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const env = optional_env('CEREBELLUM_ENV', 'production') as 'production' | 'test';
const isTest = env === 'test';

export const cfg = {
  env,
  supabase: {
    url:        require_env('SUPABASE_URL'),
    serviceKey: require_env('SUPABASE_SERVICE_KEY'),
  },
  openrouter: {
    apiKey:          require_env('OPENROUTER_API_KEY'),
    embeddingModel:  optional_env('EMBEDDING_MODEL',  'openai/text-embedding-3-small'),
    classifierModel: optional_env('CLASSIFIER_MODEL', 'openai/gpt-4o-mini'),
  },
  http: {
    apiKey: optional_env('CEREBELLUM_API_KEY', ''),
    port:   parseInt(optional_env('CEREBELLUM_PORT', '4891'), 10),
  },
  gate: {
    model:       optional_env('GATE_MODEL',       'openai/gpt-4o-mini'),
    queuePath:   optional_env('CEREBELLUM_QUEUE_PATH', join(homedir(), '.cerebellum', isTest ? 'queue-test.json' : 'queue.json')),
    queueMax:    parseInt(optional_env('GATE_QUEUE_MAX', '100'), 10),
    adversarial: optional_env('GATE_ADVERSARIAL', 'true') !== 'false',
  },
  operator: {
    model:               optional_env('OPERATOR_MODEL',                  'anthropic/claude-sonnet-4-6'),
    webPath:             optional_env('OPERATOR_WEB_PATH',               join(homedir(), '.cerebellum', isTest ? 'web-test.json' : 'web.json')),
    ttlPersonalHours:    parseInt(optional_env('OPERATOR_TTL_PERSONAL_HOURS',     '168'), 10), // 7d
    ttlOperationalHours: parseInt(optional_env('OPERATOR_TTL_OPERATIONAL_HOURS',   '24'), 10), // 1d
  },
  seed: {
    // 'direct' — straight to DB, no quality gate (fastest, for pre-vetted batches)
    // 'gk'     — skip Operator, land in GK queue for memo review (recommended for curated batches)
    // 'full'   — through Operator + GK queue (for raw/uncertain batches)
    pipeline: optional_env('SEED_PIPELINE', 'gk') as 'direct' | 'gk' | 'full',
  },
  import: {
    // 'full' — through Operator + GK (default: clusters overlapping entries from multi-file imports)
    // 'gk'   — skip Operator, land in GK queue for memo review
    // 'direct' — straight to DB (use after --dry-run verification)
    pipeline: optional_env('IMPORT_PIPELINE', 'full') as 'direct' | 'gk' | 'full',
    model:    optional_env('IMPORT_MODEL', optional_env('GATE_MODEL', 'openai/gpt-4o-mini')),
  },
  telemetry: {
    enabled: optional_env('CEREBELLUM_TELEMETRY', 'true') === 'true',
    dir:     optional_env('CEREBELLUM_TELEMETRY_DIR', join(homedir(), '.cerebellum', 'telemetry')),
  },
} as const;
