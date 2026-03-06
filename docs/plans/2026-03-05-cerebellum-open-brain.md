# Cerebellum: Open Brain Build Plan
_Plan file: docs/plans/2026-03-05-cerebellum-open-brain.md (copy here on execution)_

## Context
Building a personal agent-readable second brain based on Nate B Jones' "Open Brain" architecture. The project is named "cerebellum" — the coordination/procedural memory layer that runs underneath all AI tools rather than being one of them.

Core problem solved: every AI forgets you between sessions and across tools. Platform memory (Claude, ChatGPT) is siloed and creates lock-in. This system owns your memory in a Postgres database, exposes it via MCP to any AI tool, and compounds value over time as you capture thoughts.

**Decision: Tier 2 build from the start.** Start with the same core (Postgres+pgvector+MCP) but skip the Slack dependency — use a CLI capture tool and Claude Code MCP hook instead. Design is clean and extensible; Slack or other capture surfaces can be added later.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CAPTURE SURFACES                      │
│  CLI tool   │  Claude Code hook   │  (Slack later)       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP POST
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  CAPTURE PIPELINE                        │
│  validate → embed (OpenRouter) → classify (gpt-4o-mini)  │
│           → store to Postgres+pgvector                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              POSTGRES + PGVECTOR (Supabase)              │
│  thoughts: id, content, embedding[1536], metadata JSONB  │
│  Index: IVFFlat cosine similarity on embedding           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   MCP SERVER (local)                     │
│  Tools: semantic_search, list_recent, stats, capture     │
│  Any MCP client: Claude, ChatGPT, Cursor, VS Code        │
└─────────────────────────────────────────────────────────┘
```

---

## Stack

| Layer | Tech | Why |
|---|---|---|
| Database | Supabase (free tier) | Postgres + pgvector, Edge Functions, hosted |
| Embeddings | OpenRouter → text-embedding-3-small | $0.02/M tokens, reliable |
| Metadata LLM | OpenRouter → gpt-4o-mini | Cheap classifier for type/topics/people/actions |
| MCP Server | TypeScript (Node) | Matches Claude Code ecosystem, npm published MCP SDK |
| Capture CLI | TypeScript (tsx) | Single file, fast startup |
| Config | .env + ~/.cerebellum/config.json | Local secrets, local prefs |

---

## File Structure

```
cerebellum/
├── CLAUDE.md                    # instructions for Claude Code in this project
├── RESEARCH.md                  # existing research doc
├── package.json
├── tsconfig.json
├── .env.example
│
├── schema/
│   └── schema.sql               # CREATE TABLE thoughts + pgvector index
│
├── src/
│   ├── config.ts                # load + validate env vars
│   ├── db.ts                    # Supabase client, DB helpers
│   ├── embeddings.ts            # OpenRouter embedding generation
│   ├── classify.ts              # gpt-4o-mini metadata extraction
│   ├── capture.ts               # shared capture pipeline (embed + classify + store)
│   │
│   ├── mcp/
│   │   ├── server.ts            # MCP server entry point
│   │   └── tools/
│   │       ├── semantic_search.ts
│   │       ├── list_recent.ts
│   │       ├── stats.ts
│   │       └── capture.ts       # capture tool (write from any MCP client)
│   │
│   └── cli/
│       └── index.ts             # CLI: `cerebellum "thought goes here"`
│
├── prompts/
│   ├── memory-migration.md
│   ├── second-brain-migration.md
│   ├── open-brain-spark.md
│   ├── capture-templates.md
│   └── weekly-review.md
│
└── scripts/
    └── migrate.ts               # import existing notes / AI memories
```

---

## Schema

```sql
-- Enable pgvector
create extension if not exists vector;

create table thoughts (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(1536),
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- metadata shape:
-- { "type": "observation|task|idea|reference|person_note",
--   "topics": ["tag1", "tag2"],
--   "people": ["name"],
--   "action_items": ["..."] }

-- Cosine similarity index
create index on thoughts using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

---

## MCP Tools

```typescript
// semantic_search: { query: string, limit?: number } → thoughts[]
// list_recent: { days?: number, limit?: number } → thoughts[]
// stats: {} → { total, by_type, top_topics, top_people }
// capture: { content: string } → thought (write directly from any AI client)
```

---

## Dev-Workflow Steps

```
Branch:   feat/open-brain-core
PR:       Open immediately on branch creation (before any code)
Commits:  feat(cerebellum): ... / chore(setup): ... etc.
Plans:    docs/plans/2026-03-05-cerebellum-open-brain.md
```

Execution via: `feature-dev:feature-dev` (current session)

---

## Implementation Sequence

### Phase 1: Foundation
1. `package.json` + `tsconfig.json` + `.env.example` + `CLAUDE.md`
2. `schema/schema.sql` — thoughts table + vector index
3. `src/config.ts` — load/validate `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`
4. `src/db.ts` — Supabase client, `insertThought()`, `searchByEmbedding()`, `listRecent()`, `getStats()`
5. `src/embeddings.ts` — `generateEmbedding(text: string): Promise<number[]>`
6. `src/classify.ts` — `classifyThought(text: string): Promise<Metadata>`
7. `src/capture.ts` — shared pipeline: embed + classify + store → confirmation

### Phase 2: CLI Capture
8. `src/cli/index.ts` — `cerebellum "thought"` → runs capture pipeline → prints confirmation
   - Quick invocation: `npx ts-node src/cli/index.ts "thought"`
   - Shell alias: `brain "thought"`

### Phase 3: MCP Server
9. `src/mcp/server.ts` — MCP server setup (using `@modelcontextprotocol/sdk`)
10. `src/mcp/tools/semantic_search.ts`
11. `src/mcp/tools/list_recent.ts`
12. `src/mcp/tools/stats.ts`
13. `src/mcp/tools/capture.ts`

### Phase 4: Content
14. `prompts/` — all 5 lifecycle prompts adapted to this stack
15. `scripts/migrate.ts` — basic import from markdown files / JSON

---

## Environment Variables

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx        # service role key (bypasses RLS)
OPENROUTER_API_KEY=xxx
EMBEDDING_MODEL=openai/text-embedding-3-small
CLASSIFIER_MODEL=openai/gpt-4o-mini
```

---

## Claude Code MCP Config

After build, add to `~/.claude/claude_desktop_config.json` (or Claude settings):
```json
{
  "mcpServers": {
    "cerebellum": {
      "command": "node",
      "args": ["/Users/james/dev/new/cerebellum/dist/mcp/server.js"]
    }
  }
}
```

---

## Verification

1. **Schema**: `psql` into Supabase → confirm `thoughts` table + vector index exist
2. **Capture CLI**: `brain "test thought about project planning"` → see type/topics/people printed
3. **Search**: `brain search "project"` → returns semantically similar thoughts
4. **MCP**: Ask Claude (with MCP connected): "Search my brain for notes about project planning" → returns the test thought
5. **Stats**: MCP `stats` tool returns total count, type breakdown, top topics
6. **Cross-tool**: Verify same search works from ChatGPT or Cursor via same MCP URL

---

## Open Questions (resolved)
- Slack vs CLI: **CLI** (lower friction for technical user, no SaaS dependency)
- Self-hosted vs Supabase: **Supabase** free tier (faster start, same Postgres core)
- Language: **TypeScript** (MCP SDK is TS-first, matches Claude Code ecosystem)
- Embeddings: **OpenRouter** (not direct OpenAI — one API key for everything)
