# Memory Migration Prompt

Run this once, right after setup. Extracts accumulated context from your existing
AI tools and seeds your cerebellum with it.

---

## Prompt

```
I'm setting up a new personal knowledge system called cerebellum.
Before I start using it, I want to extract everything you currently know about me
and save it as structured thoughts.

For each piece of context you have about me, format it as a JSON object with this shape:
{
  "content": "<the actual memory, written as a first-person thought>",
  "type": "observation" | "task" | "idea" | "reference" | "person_note"
}

Include:
- My role, work context, and active projects
- My stated preferences and working style
- Important decisions I've described to you
- Key people I've mentioned
- Goals or constraints I've shared
- Technical or domain knowledge specific to my context

Output a JSON array of these objects. I'll save each one to my new system.
```

---

## After you receive the JSON

For each item in the array, run:
```bash
brain "<content text here>"
```

Or save them in bulk using the migration script:
```bash
node --import tsx/esm scripts/migrate.ts --json <path-to-file.json>
```
