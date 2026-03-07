<div align="center">
  <img src="assets/logo.svg?v=2" alt="cerebellum" width="420"/>
  <br/><br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-7c3aed?style=flat-square)](https://modelcontextprotocol.io/)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-3ecf8e?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-embeddings-ff6b35?style=flat-square)](https://openrouter.ai/)

</div>

---

Capture thoughts from anywhere. Retrieve them semantically. Every AI tool you use — Claude, Cursor, VS Code — connects to the same brain via a single MCP server.

## How it works

```
capture "thought text"
    ↓
embed (text-embedding-3-small)  +  classify (gpt-4o-mini)
    ↓
Postgres + pgvector (Supabase)
    ↓
semantic_search / list_recent / stats  ←  any MCP client
```

**Cost**: ~$0.10–0.30/month at 20 thoughts/day.

## Stack

| Layer | Tech |
|---|---|
| Storage | Supabase (Postgres + pgvector, HNSW index) |
| Embeddings | `openai/text-embedding-3-small` via OpenRouter |
| Classifier | `openai/gpt-4o-mini` via OpenRouter |
| Protocol | MCP (`@modelcontextprotocol/sdk`) |
| CLI | Node.js + TypeScript |

## MCP Tools

| Tool | Description |
|---|---|
| `semantic_search` | Find thoughts by meaning, not keywords |
| `list_recent` | Retrieve thoughts by time window |
| `stats` | Totals, type breakdown, top topics & people |
| `capture` | Write to the brain from any MCP client |

## CLI

```bash
npm run cli -- "I noticed that X tends to happen when Y"   # capture
npm run cli -- search "project planning"                    # semantic search
npm run cli -- recent --days 7 --limit 20                  # recent thoughts
npm run cli -- stats                                        # overview
```

## Setup

**1. Clone and install**
```bash
git clone https://github.com/jj-valentine/cerebellum
cd cerebellum
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENROUTER_API_KEY
```

**3. Run schema in Supabase SQL editor**
```bash
# Copy contents of schema/schema.sql → paste into Supabase SQL Editor → Run
```

**4. Build and register MCP server**
```bash
npm run build
claude mcp add --transport stdio --scope user cerebellum -- node /path/to/dist/mcp/server.js
```

## Metadata auto-extracted per thought

Each captured thought is automatically classified into:

- **Type** — `observation` · `task` · `idea` · `reference` · `person_note`
- **Topics** — 1–3 tags
- **People** — mentioned names
- **Action items** — implied next steps

## License

MIT
