import { readFileSync } from 'fs';
import { captureThought } from '../capture.js';
import { deleteBySource } from '../db.js';
import type { ThoughtType } from '../types.js';

export interface SeedEntry {
  content: string;
  type?: ThoughtType;
  source_tag?: string;  // appended to 'seed:' — e.g. 'memory', 'plan', 'git', 'prefs'
}

function parseFile(path: string): SeedEntry[] {
  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Seed file must be a JSON array');

  for (const [i, entry] of parsed.entries()) {
    if (!entry.content || typeof entry.content !== 'string' || !entry.content.trim()) {
      throw new Error(`Entry ${i} has empty or missing content`);
    }
  }
  return parsed as SeedEntry[];
}

async function runBatch(
  entries: SeedEntry[],
  concurrency: number,
): Promise<{ stored: number; failed: number; errors: string[] }> {
  let stored = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((entry, j) => {
        const idx = i + j;
        const source = `seed:${entry.source_tag ?? 'unknown'}`;
        return captureThought(entry.content, source, entry.type)
          .then(result => {
            stored++;
            const preview = entry.content.length > 60
              ? entry.content.slice(0, 57) + '...'
              : entry.content;
            console.log(`  [${idx + 1}/${entries.length}] ✓ ${result.thought.metadata.type} — "${preview}"`);
          });
      }),
    );

    for (const [j, result] of results.entries()) {
      if (result.status === 'rejected') {
        const idx = i + j;
        failed++;
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push(`[${idx + 1}] ${msg}`);
        console.error(`  [${idx + 1}/${entries.length}] ✗ ${msg}`);
      }
    }
  }

  return { stored, failed, errors };
}

export async function cmd_seed(filePath: string, dryRun: boolean): Promise<void> {
  const entries = parseFile(filePath);

  console.log(`\n${entries.length} entries in ${filePath}\n`);

  if (dryRun) {
    for (const [i, entry] of entries.entries()) {
      const tag = entry.source_tag ?? 'unknown';
      const type = entry.type ?? '(auto)';
      const preview = entry.content.length > 70
        ? entry.content.slice(0, 67) + '...'
        : entry.content;
      console.log(`  [${i + 1}] ${tag} / ${type} — "${preview}"`);
    }
    console.log(`\nDry run — nothing written. Remove --dry-run to capture.`);
    return;
  }

  console.log(`Capturing ${entries.length} thoughts (concurrency 3)...\n`);
  const { stored, failed, errors } = await runBatch(entries, 3);

  console.log(`\n✓ Done. ${stored} stored, ${failed} failed.`);
  if (errors.length) {
    console.log('\nErrors:');
    for (const err of errors) console.log(`  ${err}`);
  }
}

export async function cmd_seed_undo(): Promise<void> {
  console.log('Deleting all thoughts with source starting with "seed:"...');
  const count = await deleteBySource('seed:');
  console.log(`✓ Deleted ${count} seeded thought${count !== 1 ? 's' : ''}.`);
}
