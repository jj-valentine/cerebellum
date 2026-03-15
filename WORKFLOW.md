# Cerebellum — Workflow Context

> Inject this at the start of any session on this project.
> Keep it updated. Delete sections that don't apply.

## What This Is

Personal agent-readable second brain. Postgres + pgvector + MCP. Thoughts go in via CLI (`memo`) or MCP. Every AI tool can query it via a single MCP server registered globally. Current status: Tier 2 MVP live, gatekeeper (async LLM quality gate) built, Weaver (synthesis layer) planned, seeding blocked on Weaver completion.

## Standards

- **Language/runtime:** TypeScript, Node.js 22, `tsx` for dev execution
- **File structure:** `src/cli/`, `src/gatekeeper/`, `src/mcp/tools/`, `src/http/routes/`, `src/utils/`
- **Naming:** snake_case files, conventional commits (`type(scope): description`)
- **Key libraries:** `@supabase/supabase-js`, `@modelcontextprotocol/sdk`, `tsx`, `zod`, `inquirer`
- **Testing:** manual verification against live Supabase DB — no unit tests, test plan in each PR
- **Build:** `npm run build` required before any `node dist/...` invocation

## Active Spec

None — Weaver is the next major build. See HANDOFF.md for architecture decisions captured this session.

## What's Next

1. Merge current PR (feat/seed — covers gatekeeper + seed tooling + threshold fix)
2. Build Weaver (`feat/weaver`) — synthesis layer that sits before GK in the capture pipeline
3. Seed 93 mined entries through Weaver → GK → `memo review` → DB

## Known Landmines

- `/mcp` route **must** stay above `bearerAuth` middleware — standard MCP clients can't inject auth headers
- `deleteBySource` uses `LIKE` match — passing `'seed:'` deletes all `seed:*` variants (intentional)
- Queue uses atomic temp-file-rename — never edit `queue.json` directly or mid-write
- `npm run build` required after any TypeScript changes before testing compiled output
- CLI search default threshold is `0.5` — real-world thoughts rarely score above 0.7 with current data
- `gh pr edit --body` silently truncates multi-line content — always use `gh api repos/OWNER/REPO/pulls/N --method PATCH --field body="..."` instead
- Shell aliases live in `~/.zsh/aliases.zsh`, NOT `.zshrc`
- The `feat/seed` branch contains both GK and seed tooling commits — never got properly split into separate branches
- MCP server is registered globally via `claude mcp add --scope user cerebellum` — changes to `dist/` are picked up automatically on next session start
