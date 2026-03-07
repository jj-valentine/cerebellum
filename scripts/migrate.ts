#!/usr/bin/env node
/**
 * Migration script for importing existing notes into cerebellum.
 *
 * Usage:
 *   # Import from JSON file (array of {content, type} objects)
 *   node --import tsx/esm scripts/migrate.ts --json ./export.json
 *
 *   # Import from a directory of markdown files
 *   node --import tsx/esm scripts/migrate.ts --dir ./my-notes
 *
 *   # Dry run (show what would be imported without storing)
 *   node --import tsx/esm scripts/migrate.ts --json ./export.json --dry-run
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { captureThought, formatConfirmation } from '../src/capture.js';

interface ImportItem {
  content: string;
  type?: string;
}

function parse_args() {
  const args = process.argv.slice(2);
  return {
    json_path:  args[args.indexOf('--json')  + 1] as string | undefined,
    dir_path:   args[args.indexOf('--dir')   + 1] as string | undefined,
    dry_run:    args.includes('--dry-run'),
    limit:      args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : Infinity,
  };
}

function load_json(path: string): ImportItem[] {
  const raw = readFileSync(path, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('JSON file must be an array');
  return data as ImportItem[];
}

function load_markdown_dir(dir: string): ImportItem[] {
  const items: ImportItem[] = [];
  const files = readdirSync(dir);

  for (const file of files) {
    const full = join(dir, file);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      items.push(...load_markdown_dir(full));
    } else if (extname(file) === '.md') {
      const content = readFileSync(full, 'utf-8').trim();
      if (content.length > 10) {
        items.push({ content });
      }
    }
  }

  return items;
}

async function run() {
  const { json_path, dir_path, dry_run, limit } = parse_args();

  if (!json_path && !dir_path) {
    console.error('Usage: migrate.ts --json <file> | --dir <directory> [--dry-run] [--limit N]');
    process.exit(1);
  }

  const items = json_path ? load_json(json_path) : load_markdown_dir(dir_path!);
  const to_import = items.slice(0, limit);

  console.log(`\nFound ${items.length} items. Importing ${to_import.length}${dry_run ? ' (DRY RUN)' : ''}...\n`);

  let success = 0, failed = 0;

  for (const [i, item] of to_import.entries()) {
    const label = `[${i + 1}/${to_import.length}]`;
    const preview = item.content.slice(0, 60) + (item.content.length > 60 ? '...' : '');

    if (dry_run) {
      console.log(`${label} WOULD capture: "${preview}"`);
      continue;
    }

    try {
      const result = await captureThought(item.content);
      console.log(`${label} ✓ ${formatConfirmation(result).split('\n')[0]}`);
      success++;
    } catch (err) {
      console.error(`${label} ✗ Failed: "${preview}" — ${(err as Error).message}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    if (i < to_import.length - 1) await new Promise(r => setTimeout(r, 200));
  }

  if (!dry_run) {
    console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
  }
}

await run();
