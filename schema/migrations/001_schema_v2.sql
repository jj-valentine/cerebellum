-- Migration: Schema v2
-- Run in Supabase SQL editor on an existing cerebellum database.
-- Safe to run multiple times (all statements are idempotent).

alter table thoughts add column if not exists source          text  not null default 'cli';
alter table thoughts add column if not exists embedding_model text  not null default 'openai/text-embedding-3-small';
alter table thoughts add column if not exists parent_id       uuid  references thoughts(id);
alter table thoughts add column if not exists superseded_by   uuid  references thoughts(id);
alter table thoughts add column if not exists confidence      float not null default 1.0;
alter table thoughts add column if not exists privacy_tier    text  not null default 'private';

-- Drop first — cannot change return type with CREATE OR REPLACE
drop function if exists search_thoughts(vector, integer, double precision);

create function search_thoughts(
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
