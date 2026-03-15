import { createClient } from '@supabase/supabase-js';
import { cfg } from './config.js';
import type { Thought, ThoughtMetadata, ThoughtWithSimilarity } from './types.js';

const supabase = createClient(cfg.supabase.url, cfg.supabase.serviceKey);

const THOUGHT_COLUMNS = 'id, content, metadata, source, embedding_model, parent_id, superseded_by, confidence, privacy_tier, created_at';

export async function insertThought(
  content: string,
  embedding: number[],
  metadata: ThoughtMetadata,
  source: string,
  embeddingModel: string,
): Promise<Thought> {
  const { data, error } = await supabase
    .from('thoughts')
    .insert({ content, embedding: `[${embedding.join(',')}]`, metadata, source, embedding_model: embeddingModel })
    .select(THOUGHT_COLUMNS)
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return data as Thought;
}

export async function searchByEmbedding(
  embedding: number[],
  limit = 10,
  threshold = 0.5,
): Promise<ThoughtWithSimilarity[]> {
  const { data, error } = await supabase.rpc('search_thoughts', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: limit,
    threshold,
  });

  if (error) throw new Error(`DB search failed: ${error.message}`);
  return (data ?? []) as ThoughtWithSimilarity[];
}

export async function listRecent(
  days = 7,
  limit = 20,
): Promise<Thought[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('thoughts')
    .select(THOUGHT_COLUMNS)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`DB list failed: ${error.message}`);
  return (data ?? []) as Thought[];
}

export async function deleteBySource(sourcePrefix: string): Promise<number> {
  const { data, error } = await supabase
    .from('thoughts')
    .delete()
    .like('source', `${sourcePrefix}%`)
    .select('id');

  if (error) throw new Error(`DB delete failed: ${error.message}`);
  return data?.length ?? 0;
}

export async function getStats(): Promise<{
  total: number;
  by_type: Record<string, number>;
  top_topics: Array<{ topic: string; count: number }>;
  top_people: Array<{ person: string; count: number }>;
}> {
  const { data, error } = await supabase.rpc('get_stats');

  if (error) throw new Error(`DB stats failed: ${error.message}`);

  const stats = data as {
    total: number;
    by_type: Record<string, number> | null;
    top_topics: Array<{ topic: string; count: number }> | null;
    top_people: Array<{ person: string; count: number }> | null;
  };

  return {
    total:      stats.total      ?? 0,
    by_type:    stats.by_type    ?? {},
    top_topics: stats.top_topics ?? [],
    top_people: stats.top_people ?? [],
  };
}
