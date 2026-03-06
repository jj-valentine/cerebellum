import { createClient } from '@supabase/supabase-js';
import { cfg } from './config.js';
import type { Thought, ThoughtMetadata, ThoughtWithSimilarity } from './types.js';

const supabase = createClient(cfg.supabase.url, cfg.supabase.serviceKey);

export async function insertThought(
  content: string,
  embedding: number[],
  metadata: ThoughtMetadata,
): Promise<Thought> {
  const { data, error } = await supabase
    .from('thoughts')
    .insert({ content, embedding: `[${embedding.join(',')}]`, metadata })
    .select('id, content, metadata, created_at')
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return data as Thought;
}

export async function searchByEmbedding(
  embedding: number[],
  limit = 10,
): Promise<ThoughtWithSimilarity[]> {
  const { data, error } = await supabase.rpc('search_thoughts', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: limit,
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
    .select('id, content, metadata, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`DB list failed: ${error.message}`);
  return (data ?? []) as Thought[];
}

export async function getStats(): Promise<{
  total: number;
  by_type: Record<string, number>;
  top_topics: Array<{ topic: string; count: number }>;
  top_people: Array<{ person: string; count: number }>;
}> {
  const { data, error } = await supabase
    .from('thoughts')
    .select('metadata');

  if (error) throw new Error(`DB stats failed: ${error.message}`);

  const rows = (data ?? []) as { metadata: { type?: string; topics?: string[]; people?: string[] } }[];

  const by_type: Record<string, number> = {};
  const topic_counts: Record<string, number> = {};
  const people_counts: Record<string, number> = {};

  for (const { metadata: m } of rows) {
    if (m.type) by_type[m.type] = (by_type[m.type] ?? 0) + 1;
    for (const t of m.topics ?? []) topic_counts[t] = (topic_counts[t] ?? 0) + 1;
    for (const p of m.people ?? []) people_counts[p] = (people_counts[p] ?? 0) + 1;
  }

  const top_topics = Object.entries(topic_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  const top_people = Object.entries(people_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([person, count]) => ({ person, count }));

  return { total: rows.length, by_type, top_topics, top_people };
}
