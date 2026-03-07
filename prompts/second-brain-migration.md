# Second Brain Migration Prompt

If you have an existing second brain in Notion, Obsidian, Apple Notes, or similar,
use this to extract the most valuable content and move it to cerebellum.

---

## For Notion

1. Export your workspace: Settings → Export → Markdown & CSV
2. Run the migration script (see scripts/migrate.ts) against the exported files
3. Or use the prompt below with a subset of pages

## For Obsidian

1. Your vault is already markdown — point the migration script at the vault directory
2. Or use the prompt below for targeted extraction

## Prompt (for AI-assisted migration)

```
I have an existing second brain in [Notion/Obsidian/etc] and I want to migrate
the most valuable content to a new system called cerebellum that supports
semantic search.

Here are the key notes/pages I want to migrate:
[paste content or describe the pages]

For each note, extract the core knowledge as plain-language thoughts, one per
capture, and format them as:

{
  "content": "<the thought in plain first-person language>",
  "type": "observation" | "task" | "idea" | "reference" | "person_note"
}

Focus on:
- Key decisions and why they were made
- Insights that took effort to develop
- Important people and what matters about them
- Reference information you keep needing to look up

Skip: status updates, meeting agendas, links that are likely dead, one-off tasks.

Output a JSON array I can import directly.
```

---

## After migration

Import the JSON:
```bash
node --import tsx/esm scripts/migrate.ts --json <path-to-exported.json>
```
