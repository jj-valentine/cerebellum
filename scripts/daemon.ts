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
