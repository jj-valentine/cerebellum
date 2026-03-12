import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

export const cfg = {
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
} as const;
