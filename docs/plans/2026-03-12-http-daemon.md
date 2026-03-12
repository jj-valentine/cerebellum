# HTTP Daemon Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent local HTTP server to cerebellum so any process on the machine can capture thoughts via REST and any MCP-capable client can connect via HTTP transport.

**Architecture:** Single Express app on `127.0.0.1:4891` with two concerns: a REST API (`/api/*`) wrapping the existing pipeline, and an HTTP MCP endpoint (`/mcp`) using `StreamableHTTPServerTransport` in stateless mode. PM2 manages the daemon lifecycle with cross-platform auto-start.

**Tech Stack:** Express, `@modelcontextprotocol/sdk` (StreamableHTTPServerTransport), PM2, TypeScript, Node.js crypto

---

## Chunk 1: Foundation — Utility, Config, Auth

### Task 1: Create `src/utils/execFileNoThrow.ts`

The security hook forbids `exec`/`execSync` and references this utility. It doesn't exist yet — create it first so all daemon scripts can use it safely.

**Files:**
- Create: `src/utils/execFileNoThrow.ts`

- [ ] **Step 1: Write the file**

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
}

/**
 * Run an executable with an argument list. Never throws — returns ok:false on failure.
 * Use this instead of exec/execSync to avoid shell injection.
 */
export async function execFileNoThrow(
  cmd: string,
  args: string[] = [],
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFilePromise(cmd, args);
    return { stdout, stderr, exitCode: 0, ok: true };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
      ok: false,
    };
  }
}
```

- [ ] **Step 2: Build to verify compilation**

```bash
npm run build
```

Expected: no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/utils/execFileNoThrow.ts
git commit -m "feat(utils): add execFileNoThrow helper for safe subprocess calls"
```

---

### Task 2: Update `src/config.ts` — add http block

**Files:**
- Modify: `src/config.ts`

Current `cfg` export has `supabase` and `openrouter` blocks. Add `http`.

- [ ] **Step 1: Edit config.ts**

In `src/config.ts`, add to the `cfg` object after the `openrouter` block:

```typescript
  http: {
    apiKey: optional_env('CEREBELLUM_API_KEY', ''),
    port:   parseInt(optional_env('CEREBELLUM_PORT', '4891'), 10),
  },
```

`apiKey` is optional here (empty string default) — the REST server validates it at runtime and rejects requests if it's missing. The daemon installer auto-generates it before starting PM2.

- [ ] **Step 2: Update `.env.example`**

Add to `.env.example`:

```
# HTTP Daemon
CEREBELLUM_API_KEY=    # Required for HTTP server — generate with: openssl rand -hex 32
CEREBELLUM_PORT=4891   # Optional, default 4891
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/config.ts .env.example
git commit -m "feat(config): add http.apiKey and http.port env vars"
```

---

### Task 3: Create `src/http/auth.ts`

Custom bearer middleware. **Do not use the SDK's `requireBearerAuth()`** — it enforces `expiresAt` on token info objects, which a static API key doesn't have, causing 401 on every request.

**Files:**
- Create: `src/http/auth.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { cfg } from '../config.js';

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!cfg.http.apiKey) {
    res.status(503).json({ error: 'Server not configured: CEREBELLUM_API_KEY not set' });
    return;
  }
  if (!header?.startsWith('Bearer ') || header.slice(7) !== cfg.http.apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/http/auth.ts
git commit -m "feat(http): add bearer auth middleware"
```

---

## Chunk 2: REST API + MCP Transport

### Task 4: Create `src/http/routes/api.ts`

Express router wrapping existing pipeline functions.

**Files:**
- Create: `src/http/routes/api.ts`

Pipeline functions to import:
- `captureThought` from `../../capture.js`
- `listRecent` from `../../db.js` (or the tool's underlying function — verify the actual export name)
- `getStats` from `../../db.js`
- For search: use the embeddings module to embed, then `searchThoughts` from db

> **Note for implementer:** Before writing this file, run `grep -n "^export" src/db.ts src/capture.ts` to confirm exact export names. Adjust imports accordingly.

- [ ] **Step 1: Verify pipeline exports**

```bash
grep -n "^export" src/db.ts src/capture.ts src/embeddings.ts
```

Note the exact function names for: capture, search, recent, stats.

- [ ] **Step 2: Write the file**

```typescript
import { Router, type Request, type Response } from 'express';
import { captureThought } from '../../capture.js';
import { searchThoughts, listRecent, getStats } from '../../db.js';
import { embedText } from '../../embeddings.js';

const router = Router();

// POST /api/capture
router.post('/capture', async (req: Request, res: Response) => {
  const { content } = req.body as { content?: string };
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: '`content` is required and must be a non-empty string' });
    return;
  }
  try {
    const thought = await captureThought(content.trim(), 'api');
    res.json({ success: true, id: thought.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/search?q=&limit=&threshold=
router.get('/search', async (req: Request, res: Response) => {
  const { q, limit = '10', threshold = '0.5' } = req.query as Record<string, string>;
  if (!q?.trim()) {
    res.status(400).json({ error: '`q` query parameter is required' });
    return;
  }
  try {
    const embedding = await embedText(q.trim());
    const results = await searchThoughts(embedding, parseInt(limit, 10), parseFloat(threshold));
    res.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/recent?days=&limit=
router.get('/recent', async (req: Request, res: Response) => {
  const { days = '7', limit = '20' } = req.query as Record<string, string>;
  try {
    const thoughts = await listRecent(parseInt(days, 10), parseInt(limit, 10));
    res.json({ thoughts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
```

> **Implementer note:** Adjust import paths and function names based on Step 1 findings. `captureThought` may return `void` — if so, remove `thought.id` from the response and just return `{ success: true }`.

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Fix any import/type errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/http/routes/api.ts
git commit -m "feat(http): add REST API routes for capture, search, recent, stats"
```

---

### Task 5: Create `src/http/mcp.ts`

HTTP MCP transport handler. **Single module-level McpServer instance, new transport per request** — this is the official SDK stateless pattern (per the TypeScript SDK guide). Do NOT create a new McpServer per request.

**Files:**
- Create: `src/http/mcp.ts`

Tool registration functions to import from existing MCP tools:
- `registerSemanticSearch` from `../mcp/tools/semantic_search.js`
- `registerListRecent` from `../mcp/tools/list_recent.js`
- `registerStats` from `../mcp/tools/stats.js`
- `registerCapture` from `../mcp/tools/capture.js`

> **Note for implementer:** Check `src/mcp/server.ts` to confirm the exact function signatures used to register tools. The HTTP server reuses the same registration functions.

- [ ] **Step 1: Verify MCP tool registration function names**

```bash
grep -n "^export\|server.tool\|registerTool" src/mcp/tools/*.ts src/mcp/server.ts
```

- [ ] **Step 2: Write the file**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { registerSemanticSearch } from '../mcp/tools/semantic_search.js';
import { registerListRecent } from '../mcp/tools/list_recent.js';
import { registerStats } from '../mcp/tools/stats.js';
import { registerCapture } from '../mcp/tools/capture.js';

// Module-level server — created once, reused across all stateless requests
const httpMcpServer = new McpServer(
  { name: 'cerebellum', version: '0.1.0' },
  { instructions: 'Personal semantic memory. Use capture to save thoughts, semantic_search to retrieve by meaning, list_recent for chronological review, stats for overview.' },
);
registerSemanticSearch(httpMcpServer);
registerListRecent(httpMcpServer);
registerStats(httpMcpServer);
registerCapture(httpMcpServer);

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. MCP endpoint accepts POST only.' });
    return;
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode — no cross-request state
    enableJsonResponse: true,
  });
  res.on('close', () => { transport.close().catch(() => undefined); });
  await httpMcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
```

> **Implementer note:** If the MCP tool files don't export named register functions, adapt to match how `src/mcp/server.ts` registers them. The key constraint is: one McpServer instance, one transport per request.

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/http/mcp.ts
git commit -m "feat(http): add HTTP MCP transport handler (stateless)"
```

---

## Chunk 3: Server, Entry Point, Daemon Scripts

### Task 6: Create `src/http/server.ts`

Express app wiring. Binds to loopback only for network isolation.

**Files:**
- Create: `src/http/server.ts`

- [ ] **Step 1: Write the file**

```typescript
import express from 'express';
import { bearerAuth } from './auth.js';
import apiRouter from './routes/api.js';
import { handleMcpRequest } from './mcp.js';

export function startServer(port: number): ReturnType<typeof express.application.listen> {
  const app = express();
  app.use(express.json());

  // Health check — no auth (usable by PM2 health checks and monitoring)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), version: '0.1.0' });
  });

  // All other routes require bearer auth
  app.use(bearerAuth);
  app.use('/api', apiRouter);
  app.post('/mcp', handleMcpRequest);

  // Bind to loopback only — no access from other hosts on the network
  return app.listen(port, '127.0.0.1', () => {
    console.log(`[cerebellum] HTTP daemon running on http://127.0.0.1:${port}`);
  });
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/http/server.ts
git commit -m "feat(http): add Express server factory (loopback-bound)"
```

---

### Task 7: Create `src/http/main.ts` (entry point)

Entry point lives in `src/` so TypeScript compiles it. (`bin/` is outside `rootDir: "./src"` and won't compile.)

**Files:**
- Create: `src/http/main.ts`

- [ ] **Step 1: Write the file**

```typescript
import { cfg } from '../config.js';
import { startServer } from './server.js';

startServer(cfg.http.port);
```

- [ ] **Step 2: Add npm scripts to `package.json`**

Add these to the `"scripts"` block:

```json
"http": "node dist/http/main.js",
"daemon:install": "node --import tsx/esm scripts/daemon.ts install",
"daemon:uninstall": "node --import tsx/esm scripts/daemon.ts uninstall",
"daemon:status": "node --import tsx/esm scripts/daemon.ts status",
"daemon:logs": "pm2 logs cerebellum-http"
```

- [ ] **Step 3: Install express dependency**

```bash
npm install express
npm install -D @types/express
```

- [ ] **Step 4: Build and smoke-test manually**

```bash
npm run build
CEREBELLUM_API_KEY=test123 npm run http &
sleep 2
curl -s http://127.0.0.1:4891/api/health
kill %1
```

Expected: `{"status":"ok","uptime":...,"version":"0.1.0"}`

- [ ] **Step 5: Commit**

```bash
git add src/http/main.ts package.json package-lock.json
git commit -m "feat(http): add entry point and npm daemon scripts"
```

---

### Task 8: Create `scripts/daemon.ts` (PM2 manager)

PM2 is cross-platform (macOS/Linux/Windows). `pm2 startup` generates OS-appropriate startup scripts automatically. This makes the daemon work out of the box for any contributor without OS-specific knowledge.

Uses `execFileNoThrow` from Task 1 — safe subprocess execution, no shell injection.

**dotenv note:** `src/config.ts` resolves `.env` via `__dirname`-relative path (`join(__dirname, '../.env')`). When compiled to `dist/config.js`, `__dirname` = `dist/`, so `.env` is always found at the project root regardless of PM2's CWD or boot environment. No `--env-file` flag needed.

**import path note:** `scripts/daemon.ts` runs via `node --import tsx/esm`, so TypeScript ESM resolution is active. Importing with `.js` extension is correct — tsx/esm maps it to the `.ts` source file.

**Prerequisites:** Before running `daemon:install`, ensure `npm run build` has been run. The script checks for the built binary and exits with a clear error if it's missing.

**Files:**
- Create: `scripts/daemon.ts`

- [ ] **Step 1: Run build first**

```bash
npm run build
```

- [ ] **Step 2: Write the file**

```typescript
#!/usr/bin/env node
/**
 * PM2-based daemon manager for cerebellum HTTP server.
 * Usage: npm run daemon:install | daemon:uninstall | daemon:status
 *
 * dotenv note: config.ts loads .env via __dirname-relative path, so the daemon
 * finds credentials at project root regardless of how PM2 invokes it.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { execFileNoThrow } from '../src/utils/execFileNoThrow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envFile = join(projectRoot, '.env');
const daemonEntry = join(projectRoot, 'dist', 'http', 'main.js');
const daemonName = 'cerebellum-http';

async function pm2(...args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return execFileNoThrow('pm2', args);
}

async function checkPm2(): Promise<void> {
  const result = await execFileNoThrow('pm2', ['--version']);
  if (!result.ok) {
    console.error('pm2 not found. Install with: npm install -g pm2');
    process.exit(1);
  }
}

function ensureApiKey(): string {
  let env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const match = env.match(/^CEREBELLUM_API_KEY=(.+)$/m);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }
  const key = randomBytes(32).toString('hex');
  if (env && !env.endsWith('\n')) env += '\n';
  env += `CEREBELLUM_API_KEY=${key}\n`;
  writeFileSync(envFile, env, 'utf8');
  console.log('[daemon] Generated CEREBELLUM_API_KEY and saved to .env');
  return key;
}

async function install(): Promise<void> {
  await checkPm2();

  if (!existsSync(daemonEntry)) {
    console.error(`Build not found at ${daemonEntry}. Run: npm run build`);
    process.exit(1);
  }

  const apiKey = ensureApiKey();

  const start = await pm2(
    'start', daemonEntry,
    '--name', daemonName,
    '--cwd', projectRoot,
  );
  if (!start.ok) {
    console.error('[daemon] pm2 start failed:\n', start.stderr);
    process.exit(1);
  }

  await pm2('save');

  const port = process.env.CEREBELLUM_PORT ?? '4891';
  console.log(`
[daemon] cerebellum-http started via PM2
  Health:   http://127.0.0.1:${port}/api/health
  API key:  ${apiKey}

To auto-start on login, run:
  pm2 startup
  (follow the printed command — it requires sudo)
`);
}

async function uninstall(): Promise<void> {
  await checkPm2();
  await pm2('stop', daemonName);
  await pm2('delete', daemonName);
  await pm2('save');
  console.log('[daemon] cerebellum-http removed from PM2');
}

async function status(): Promise<void> {
  await checkPm2();
  const describe = await pm2('describe', daemonName);
  console.log(describe.stdout || describe.stderr);

  const port = process.env.CEREBELLUM_PORT ?? '4891';
  const health = await execFileNoThrow('curl', ['-sf', `http://127.0.0.1:${port}/api/health`]);
  if (health.ok) {
    console.log('\nHealth check:', health.stdout);
  } else {
    console.log('\nHealth check: FAILED (daemon may not be running)');
  }
}

const subcommand = process.argv[2];
if (subcommand === 'install') {
  await install();
} else if (subcommand === 'uninstall') {
  await uninstall();
} else if (subcommand === 'status') {
  await status();
} else {
  console.error('Usage: npm run daemon:install | daemon:uninstall | daemon:status');
  process.exit(1);
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/daemon.ts
git commit -m "feat(daemon): add PM2-based daemon install/uninstall/status script"
```

---

## Chunk 4: Verification

### Task 9: End-to-end verification

Run through all verification steps before opening the PR.

**No new files — verification only.**

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: zero errors

- [ ] **Step 2: Manual HTTP server test**

```bash
CEREBELLUM_API_KEY=test123 npm run http &
sleep 2

# Health (no auth)
curl -s http://127.0.0.1:4891/api/health

# Capture (with auth)
curl -s -X POST http://127.0.0.1:4891/api/capture \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{"content": "HTTP daemon smoke test"}'

# Search
curl -s "http://127.0.0.1:4891/api/search?q=daemon&limit=3" \
  -H "Authorization: Bearer test123"

# Recent
curl -s "http://127.0.0.1:4891/api/recent?days=1&limit=5" \
  -H "Authorization: Bearer test123"

# Stats
curl -s http://127.0.0.1:4891/api/stats \
  -H "Authorization: Bearer test123"

# Auth rejection (should return 401)
curl -s http://127.0.0.1:4891/api/stats \
  -H "Authorization: Bearer wrongkey"

kill %1
```

Expected: health returns ok, capture returns `{success:true}`, search/recent return arrays, stats returns counts, bad key returns 401.

- [ ] **Step 3: MCP transport smoke test**

```bash
CEREBELLUM_API_KEY=test123 npm run http &
sleep 2

curl -s -X POST http://127.0.0.1:4891/mcp \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

kill %1
```

Expected: JSON response listing the four MCP tools (semantic_search, list_recent, stats, capture).

- [ ] **Step 4: PM2 daemon test**

```bash
npm run daemon:install
npm run daemon:status
curl -s http://127.0.0.1:4891/api/health
npm run daemon:logs
npm run daemon:uninstall
```

Expected: daemon starts, health check passes, logs appear, uninstall removes it cleanly.

- [ ] **Step 5: Open PR**

Use `commit-commands:commit-push-pr` skill to open the PR.

PR title: `feat(http): local HTTP capture daemon + HTTP MCP transport`

PR body:
```
## Summary
- Adds Express HTTP server on 127.0.0.1:4891 so any process can POST thoughts to cerebellum
- REST API: /api/health (public), /api/capture, /api/search, /api/recent, /api/stats (bearer auth)
- HTTP MCP endpoint at /mcp for claude.ai web and remote MCP clients
- PM2-based daemon scripts: `npm run daemon:install/uninstall/status`
- Cross-platform: works macOS, Linux, Windows — no OS-specific knowledge required

## Test plan
- [ ] `npm run build` passes
- [ ] Health endpoint returns ok without auth
- [ ] Capture via POST stores a thought
- [ ] Search returns relevant results
- [ ] Bad bearer token returns 401
- [ ] MCP tools/list returns all 4 tools
- [ ] `npm run daemon:install` starts PM2 process
- [ ] `npm run daemon:status` shows running + health ok

## Related
- Plan: docs/plans/2026-03-12-http-daemon.md
- Spec: /Users/james/.claude/plans/functional-roaming-thacker.md
```
