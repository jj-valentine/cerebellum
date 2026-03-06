import { config } from 'dotenv';

// Load .env from project root
config();

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
} as const;
