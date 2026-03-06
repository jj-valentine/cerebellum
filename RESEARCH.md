# Cerebellum: Open Brain Research Report
_Compiled March 5, 2026_

---

## 1. Primary Source: Video Analysis

### Video Metadata
| Field | Value |
|---|---|
| Title | You Don't Need SaaS. The $0.10 System That Replaced My AI Workflow (45 Min No-Code Build) |
| Channel | AI News & Strategy Daily \| Nate B Jones |
| Subscribers | 230K |
| Published | March 2, 2026 |
| Views | 137,502 |
| Duration | 30:15 |
| URL | https://www.youtube.com/watch?v=2JiMmye2ezg |

### Video Chapters
| Timestamp | Chapter |
|---|---|
| 0:00 | Your AI Agent Probably Doesn't Have a Brain |
| 3:24 | The Memory Problem Hiding Inside Your Prompting |
| 7:48 | Why Platform Memory Creates Lock-In |
| 10:18 | Autonomous Agents Need Your Context Too |
| 13:03 | The Internet Is Forking—So Is Your Memory |
| 15:19 | **What Open Brain Architecture Actually Looks Like** ← t=994s |
| 19:22 | Semantic Search: A Different Universe From Control-F |
| 21:32 | The 45-Minute Setup That Costs a Dime a Month |

The requested timestamp (t=994s = 16:34) lands inside chapter 6: the core architecture reveal.

---

## 2. The Problem: AI Memory is Broken

Nate's core argument, built across multiple videos and articles:

**Every AI you use forgets you.** Claude's memory doesn't know what you told ChatGPT. ChatGPT doesn't follow you into Cursor. Your phone app doesn't share context with your coding agent. Every platform has built a **walled garden of memory** — and none of them talk to each other.

This creates three compounding costs:
1. **Context re-explanation tax** — you waste your best thinking catching AI up every session
2. **Tool lock-in** — you stay on one platform because switching means losing your history
3. **Agent blindness** — autonomous agents can't act intelligently without access to your accumulated context

Key stat from the video: Harvard Business Review found digital workers toggle between apps ~1,200 times/day. Every switch loses context. At AI speeds, this compounds.

> "Memory architecture determines agent capabilities much more than model selection does. That's widely misunderstood."

The trigger for the *upgrade* to Open Brain: the **agent revolution went mainstream in Feb 2026**. OpenClaw hit 190K GitHub stars, spawned 1.5M autonomous agents in weeks. Anthropic and OpenAI both shipping agents. The old "human second brain" (Notion + Zapier) wasn't agent-readable — a structural mismatch, not a config problem.

---

## 3. The Solution: Open Brain Architecture

### Philosophy
> "Instead of storing your thoughts in an app designed for humans, store them in infrastructure designed for anything."

Three properties define Open Brain:
- **Real database** (Postgres) — boring, battle-tested, not VC-backed, not going away
- **Vector embeddings** — captures *meaning*, not just keywords; natively AI-readable
- **Standard protocol** (MCP) — any AI can speak it; your data stays in one place

Called "Open Brain" because the architecture is what matters — you should not be forced to choose any given model.

### The Two-Part System

**Part 1: Capture Layer**
```
Input (Slack msg / any MCP client)
  → Supabase Edge Function
    → [in parallel] Generate vector embedding (text-embedding-3-small)
                    Extract metadata via LLM (gpt-4o-mini)
  → Store: raw text + 1536-dim embedding + JSON metadata
  → Reply with confirmation (type, topics, people, action items)
Round trip: < 10 seconds
```

**Part 2: Retrieval Layer**
```
MCP Server (hosted Edge Function)
  Tools exposed:
    - semantic_search: query → embedding → cosine similarity → ranked results
    - list_recent: browse thoughts captured this week
    - stats: see your patterns

Accessible from: Claude, ChatGPT, Cursor, VS Code, Claude Code, any MCP client
```

### Metadata Schema Per Thought
```json
{
  "raw_text": "...",
  "embedding": [1536 floats],
  "type": "observation | task | idea | reference | person_note",
  "topics": ["tag1", "tag2"],
  "people": ["Sarah"],
  "action_items": ["Follow up on consulting idea"]
}
```

**Important caveat from Nate:** Metadata classification isn't always perfect — the LLM makes its best guess. It doesn't matter much because semantic search via embeddings does the heavy lifting regardless of classification accuracy.

### Cost Model
| Component | Cost |
|---|---|
| Supabase (Postgres + pgvector) | Free tier |
| Slack | Free tier |
| Embeddings (20 thoughts/day) | ~$0.02/month |
| Metadata extraction LLM | ~$0.08/month |
| **Total** | **~$0.10–0.30/month** |

### Security
- Row-level security on Supabase (service role only)
- MCP server validates via access key in URL or header
- You own all data; no third-party has access

---

## 4. The Prior "Human" Second Brain (January 2026)

Nate's earlier guide ("Why 2026 Is the Year to Build a Second Brain") used a SaaS-based stack:
- **Tools**: Slack + Notion + Zapier + Claude/ChatGPT
- **Philosophy**: reduce human input to one reliable behavior; AI handles the rest

### Eight Building Blocks
| Block | Role |
|---|---|
| The Dropbox | Single frictionless capture channel |
| The Sorter | AI classification system |
| The Form | Consistent data schema |
| The Filing Cabinet | Structured database (Notion) |
| The Receipt | Audit trail with confidence scores |
| The Bouncer | Quality filter (prevents garbage data) |
| The Tap on the Shoulder | Scheduled nudges + summaries |
| The Fix Button | One-step error correction |

### Twelve Engineering Principles
**System Design:**
- Reduce human input to one reliable behavior
- Separate memory, compute, and interface layers
- Treat prompts as APIs with fixed input/output
- Build trust mechanisms (audits, confidence scores)

**Operational:**
- Default to safe behavior when uncertain
- Create small, frequent, actionable outputs
- Use "next action" as execution unit (not intentions)
- Prefer routing over organizing

**Sustainability:**
- Keep categories and fields minimal to reduce friction
- Design for restart, not perfection
- Build core loop first, then add modules
- Optimize for maintainability over cleverness

**Why it needed to evolve:** Notion is built for human eyes, not agent queries. Zapier is SaaS (can break, reprice, disappear). The stack couldn't be queried by meaning — only by folder structure. When agents arrived, the structural mismatch became critical.

---

## 5. The Five Lifecycle Prompts

Available at https://promptkit.natebjones.com/20260224_uq1_promptkit_1

| Prompt | Purpose | When to Use |
|---|---|---|
| **Memory Migration** | Extracts existing AI platform memory (Claude/ChatGPT) → saves to Open Brain | Immediately after setup |
| **Second Brain Migration** | Transfers Notion/Obsidian/Apple Notes → Open Brain without losing history | Once, during onboarding |
| **Open Brain Spark** | Interview that generates personalized capture list based on your tools/decisions/people | When you don't know what to capture |
| **Quick Capture Templates** | 5 sentence starters (Decision/Person/Insight/Meeting/AI Save) optimized for metadata extraction | First week of use |
| **Weekly Review** | Friday synthesis: clusters topics, surfaces action items, detects patterns, finds gaps | Every Friday ~5 min |

### Capture Template Structure (examples)
- `Decision: [what]. Context: [why]. Owner: [who].` → triggers task classification + people extraction
- `Person note: [name]. Context: [meeting/situation]. Key thing: [insight].`
- `Insight: [observation]. Related to: [topic].`

---

## 6. Key Quotes from Transcript

> "Your AI agent probably doesn't have a brain. And what I mean by that is it doesn't have a system that allows it to read and think through context that you have developed over months and years."

> "Memory is supposed to be a lock-in on ChatGPT, ditto on other systems. Your knowledge should not be a hostage to any single platform."

> "MCP — it started as Anthropic's open-source experiment in November 2024, but it's since become the HTTP infrastructure of the AI age. It's the USB-C of AI."

> "Person A opens Claude, spends four minutes explaining their role, their project, their constraints... Person B opens Claude. It already knows her role, her active projects, her constraints, her team members, and the decisions she made last week... All of it is loaded up before she types a word."

> "The gap between 'I use AI sometimes' and 'AI is embedded in how I think and work' is the career gap of this decade. And it comes down to memory and context infrastructure."

> "AI is forcing a clarity of thought in our work in our lives that has a tremendous amount of human benefit."

---

## 7. Top Comments (Community Signal)

| Author | Comment (excerpt) | Likes |
|---|---|---|
| @heyoub | "I've been working on this! I'm building it in Rust, about a week away from shipping. It fuses memory, context, and a few other things. I will be open sourcing it." | **296** |
| @JCHansen | "Nate has been an absolute godsend... He's easily jumped into the number one spot for my favorite AI content creator." | 150 |
| @mohammadusmani8043 | Wrote a full technical blueprint in the comment: Supabase vault → Slack intake → OpenRouter processor → Postgres+pgvector filing cabinet → MCP retrieval | 114 |
| @sptrsn | "I built a 2nd brain as a Laravel app with Postgres, then layered on OpenClaw capability. All my vscode AI extensions connect via MCP. It has given me the ability to accomplish things by myself..." | 57 |
| @la_vida_es_corta | "I hope Nate even half appreciates how much so many of us out here appreciate what he's doing to prepare people for the future world of AI productivity" | 29 |
| @Miss_Elaine_ | "One brain to rule them all..." | 23 |
| @MarcoZamora | "I have 25+ years of text file notes with timestamped entries of everything I thought was noteworthy... It has always [been the thing I wanted to make searchable by meaning]" | 23 |
| @balancemuse | "This is spot on. I was coming to this realization myself when I was talking to Claude and I felt like I was in the movie '50 First Dates.'" | 17 |
| @covati | "Persistent agent memory is going to become a huge infrastructure layer over the next few years." | — |
| @ThomasMeli | "The vendor is an implementation detail! The way you bring clean code + clean architectural principles (decoupling from vendors) to the AI Agent stack is absolutely AWESOME." | 8 |

**Top comment insight**: The highest-liked comment (@heyoub, 296 likes) is someone shipping an OSS Rust implementation that "fuses memory, context, and a few other things." The community is actively building beyond the tutorial.

---

## 8. Broader Ecosystem

### Commercial / Emerging Products
| Product | Approach |
|---|---|
| Supermemory | Universal Memory API for AI apps |
| OpenMemory MCP | Local mem0-based memory layer |
| memcync | VC-backed cross-platform memory sync |
| one context | VC-backed AI context platform |

### Open Source Projects
| Repo | Stack | Notes |
|---|---|---|
| [benclawbot/open-brain](https://github.com/benclawbot/open-brain) | Postgres+pgvector, OpenRouter/Ollama, MCP+REST+Streamlit | Multi-source ingestion (Telegram, WhatsApp, Gmail, Claude Code sessions) |
| [flepied/second-brain-agent](https://github.com/flepied/second-brain-agent) | LangChain, ChromaDB, MCP | Indexes markdown files |
| [raold/second-brain](https://github.com/raold/second-brain) | 100% local, LLaVA/CLIP, Postgres+pgvector | Multimodal (images+docs), no API keys, no cloud |
| [2ndbrainai/Second-Brain-AI-agent](https://github.com/2ndbrainai/Second-Brain-AI-agent) | LangChain, RAG | General PKM framework |
| open-brain-rs | Rust, Qdrant, Gemini embeddings | Performance-focused |
| mcp-brain | Ollama, Qdrant | 100% local, privacy-first |

### Obsidian + Claude Code Integration (2026 trend)
The most active 2026 pattern: connecting Claude Code to Obsidian via MCP, turning a vault into a live workspace Claude can read, search, and modify. Enables bidirectional knowledge flow between human note-taking and AI coding.

---

## 9. Synthesis: What Actually Matters

The insight Nate is articulating (and others are converging on independently):

**The real bottleneck in AI productivity is not model quality — it's memory architecture.**

Three-tier problem:
1. **Human web tools** (Notion, Obsidian) = built for browsing, not for machine query
2. **Platform memory** (Claude memory, ChatGPT memory) = siloed, not agent-readable, creates lock-in
3. **No standard** = every tool reinvents memory, nothing interoperates

The solution that's emerging as consensus:
- **Postgres + pgvector** as the universal, boring, reliable storage layer
- **MCP** as the universal access protocol (the "USB-C" or "HTTP" of AI memory)
- **Semantic embeddings** as the retrieval mechanism (meaning over keywords)
- **Self-hosted** to own your data and eliminate SaaS risk

The compounding advantage is real: context accumulates over months/years → every AI session gets smarter → gap between those who have this and those who don't widens weekly.

---

## 10. Build Plan for Cerebellum

### What "cerebellum" implies as a name
The cerebellum handles: coordination, procedural memory, automatic skill execution, pattern completion. Perfect metaphor — this isn't the "thinking" brain (that's Claude/ChatGPT), it's the **coordination layer** that lets the thinking brain work well. It runs in the background, remembers the patterns, makes the right things automatic.

### Three Tiers of Ambition

**Tier 1: Tutorial Build (45 min)**
Follow Nate's guide exactly:
- Supabase (free) + Slack bot + OpenRouter + MCP Edge Function
- Pros: works immediately, validated by thousands of people
- Cons: Slack as capture is friction for some, limited ingestion sources

**Tier 2: Enhanced Build (custom)**
Same core (Postgres+pgvector+MCP) but:
- Replace Slack with multiple capture surfaces (CLI, web, API, Claude Code hook)
- Multiple embedding providers (OpenAI, Ollama local fallback)
- Richer metadata schema
- Dashboard for pattern visualization
- More MCP tools (graph traversal, timeline view, entity search)

**Tier 3: Agent-First Build (ambitious)**
Like @heyoub's Rust project: fuse memory + context + agent coordination:
- Cerebellum becomes the "coordination layer" for a personal agent fleet
- Agents can read AND write to the brain (not just retrieve)
- Proactive surfacing (the "tap on the shoulder")
- Graph structure (not just vector similarity — relationships between nodes)

### Recommended Starting Point
**Start with Tier 1 to validate the core loop, then evolve toward Tier 2.**

Key decisions for the cerebellum project:
1. **Capture interface**: start with CLI + Claude Code MCP (lower friction than Slack for technical users), add more later
2. **Stack**: Supabase is fine for start; Docker+Postgres if you want fully self-hosted
3. **Embeddings**: OpenRouter (OpenAI text-embedding-3-small) for start; add Ollama local later
4. **Extra**: the `benclawbot/open-brain` repo is already a good reference implementation to fork/study

### Critical Files to Create
```
cerebellum/
├── README.md           — project overview + philosophy
├── CLAUDE.md           — instructions for Claude Code working in this project
├── schema.sql          — Postgres schema (thoughts table + pgvector index)
├── mcp-server/         — MCP server Edge Function
├── capture/            — capture interface(s)
│   ├── cli.py/ts       — CLI tool for quick capture
│   └── webhook/        — webhook handler for other integrations
├── prompts/            — the 5 lifecycle prompts adapted to this stack
└── scripts/
    └── migrate.py      — migration script for existing notes/memories
```

---

## Sources

- [YouTube: Nate B Jones - You Don't Need SaaS](https://www.youtube.com/watch?v=2JiMmye2ezg)
- [Nate's Substack guide](https://natesnewsletter.substack.com/p/every-ai-you-use-forgets-you-heres)
- [Open Brain Setup Guide](https://promptkit.natebjones.com/20260224_uq1_guide_main)
- [Open Brain Prompt Kit](https://promptkit.natebjones.com/20260224_uq1_promptkit_1)
- [Nate's Second Brain product page](https://www.natebjones.com/prompts-and-guides/products/second-brain)
- [GlobalAdvisors quote on Second Brains](https://globaladvisors.biz/2026/01/30/quote-nate-b-jones-on-second-brains/)
- [Podwise: Why 2026 Is the Year to Build a Second Brain](https://podwise.ai/dashboard/episodes/6761600)
- [GitHub: kani3894/nate-jones-transcripts](https://github.com/kani3894/nate-jones-transcripts)
- [GitHub: benclawbot/open-brain](https://github.com/benclawbot/open-brain)
- [Stickybit: Agent-Readable Brain](https://stickybit.com.br/agent-readable-brain/)
- [Supermemory](https://supermemory.ai/)
