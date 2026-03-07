# Quick Capture Templates

Five sentence starters optimized for clean metadata extraction.
Use these in the first week while you build the habit.

After a week, you'll develop your own patterns and won't need them.

---

## Decision

```
Decision: [what you decided]. Context: [why this option]. Alternatives considered: [what else you thought about]. Owner: [who makes it stick].
```

**Example:**
> Decision: use OpenRouter instead of direct OpenAI. Context: one API key for all models, easier to switch embeddings later. Alternatives considered: direct OpenAI, Ollama only. Owner: me.

---

## Person Note

```
Person note: [name]. Met/talked: [context]. Key thing: [what matters about them right now]. Follow up: [if applicable].
```

**Example:**
> Person note: Sarah Chen. Met at the product review Thursday. Key thing: she's leading the Q2 roadmap and wants to add AI features but her eng team is stretched. Follow up: send her the RAG architecture overview.

---

## Insight

```
Insight: [the observation]. Why it matters: [implication]. Related to: [project or topic].
```

**Example:**
> Insight: users who capture more than 5 thoughts per day retain the habit; below 5 and they drop off. Why it matters: the UI should prioritize speed of capture over anything else. Related to: cerebellum UX.

---

## Meeting Debrief

```
Meeting: [who with]. Topic: [what it covered]. Key takeaway: [the one thing that matters]. Action: [what happens next and who owns it].
```

**Example:**
> Meeting: eng team standup. Topic: deployment blockers for v1. Key takeaway: Supabase edge functions have a 150ms cold start, need to pre-warm. Action: James sets up a cron to ping the function every 5 min.

---

## AI Save

Use this when an AI conversation surfaces something worth keeping:

```
AI save: [the insight or output]. From: [what prompt/task]. Worth keeping because: [why this is reusable].
```

**Example:**
> AI save: pgvector cosine similarity is faster than L2 for normalized vectors. From: architecture comparison for cerebellum. Worth keeping because: applies to any vector search system I build.
