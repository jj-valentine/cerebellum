# Cerebellum

Personal agent-readable second brain. Postgres + pgvector + MCP.

## What this is

A knowledge capture + retrieval system. Thoughts go in via CLI or MCP. Every AI
tool (Claude, ChatGPT, Cursor, VS Code) can query it via a single MCP server.

## Stack

- **Database**: Supabase (Postgres + pgvector)
- **Embeddings**: OpenRouter → `openai/text-embedding-3-small`
- **Classifier**: OpenRouter → `openai/gpt-4o-mini`
- **MCP server**: `src/mcp/server.ts` (Node.js, `@modelcontextprotocol/sdk`)
- **CLI**: `src/cli/index.ts`

## Commands

```bash
npm run build          # compile TypeScript
npm run mcp            # start MCP server
npm run cli -- "text"  # capture a thought
npm run cli -- search "query"  # search thoughts
```

## Key files

| File | Purpose |
|---|---|
| `schema/schema.sql` | Postgres schema — run once in Supabase SQL editor |
| `src/config.ts` | All env var loading + validation |
| `src/capture.ts` | Core pipeline: embed → classify → store |
| `src/mcp/server.ts` | MCP server entry point |

## Environment

Copy `.env.example` → `.env` and fill in:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (service role, not anon)
- `OPENROUTER_API_KEY`

## MCP setup (Claude Code)

After `npm run build`, add to `~/.claude/settings.json`:
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

## Dev workflow

- Branch: `feat/<scope>`, `fix/<scope>`, etc.
- Commits: conventional (`feat(mcp): add semantic_search tool`)
- Plans: `docs/plans/`
- Never commit `.env`
