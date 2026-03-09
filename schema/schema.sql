-- Cerebellum: Open Brain Schema
-- Run this once in your Supabase SQL editor

-- 1. Enable pgvector
create extension if not exists vector;

-- 2. Thoughts table
create table if not exists thoughts (
  id              uuid        primary key default gen_random_uuid(),
  content         text        not null,
  embedding       vector(1536),
  metadata        jsonb       not null default '{}',
  source          text        not null default 'cli',
  embedding_model text        not null default 'openai/text-embedding-3-small',
  parent_id       uuid        references thoughts(id),
  superseded_by   uuid        references thoughts(id),
  confidence      float       not null default 1.0,
  privacy_tier    text        not null default 'private',
  created_at      timestamptz not null default now()
);

-- metadata shape:
-- {
--   "type":         "observation" | "task" | "idea" | "reference" | "person_note",
--   "topics":       string[],   -- 1–3 tags
--   "people":       string[],   -- mentioned names
--   "action_items": string[]    -- implied next actions
-- }

-- 3. Cosine similarity index (HNSW)
-- HNSW builds incrementally — safe to create on empty tables, no minimum row count.
-- m=16, ef_construction=64 are good defaults for personal use (up to ~100K thoughts).
create index if not exists thoughts_embedding_idx
  on thoughts using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 4. Index for recency queries
create index if not exists thoughts_created_at_idx
  on thoughts (created_at desc);

-- 5. Row-level security (service role bypasses this)
alter table thoughts enable row level security;

-- Allow service role full access (used by the MCP server and capture pipeline)
create policy "service role full access"
  on thoughts
  to service_role
  using (true)
  with check (true);

-- 6. Semantic search function (used by db.ts searchByEmbedding)
create or replace function search_thoughts(
  query_embedding vector(1536),
  match_count     int   default 10,
  threshold       float default 0.7
)
returns table (
  id          uuid,
  content     text,
  metadata    jsonb,
  source      text,
  created_at  timestamptz,
  similarity  float
)
language sql stable
as $$
  select
    id,
    content,
    metadata,
    source,
    created_at,
    1 - (embedding <=> query_embedding) as similarity
  from thoughts
  where 1 - (embedding <=> query_embedding) >= threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 7. Stats aggregation function (used by db.ts getStats)
create or replace function get_stats()
returns json
language sql stable
as $$
  select json_build_object(
    'total', (select count(*) from thoughts),
    'by_type', coalesce(
      (select json_object_agg(type, cnt)
       from (
         select metadata->>'type' as type, count(*) as cnt
         from thoughts
         where metadata->>'type' is not null
         group by 1
       ) t),
      '{}'::json
    ),
    'top_topics', coalesce(
      (select json_agg(row_to_json(t))
       from (
         select topic, count(*)::int as count
         from thoughts,
              jsonb_array_elements_text(coalesce(metadata->'topics', '[]'::jsonb)) as topic
         group by 1
         order by count desc
         limit 10
       ) t),
      '[]'::json
    ),
    'top_people', coalesce(
      (select json_agg(row_to_json(p))
       from (
         select person, count(*)::int as count
         from thoughts,
              jsonb_array_elements_text(coalesce(metadata->'people', '[]'::jsonb)) as person
         group by 1
         order by count desc
         limit 10
       ) p),
      '[]'::json
    )
  );
$$;
