---
source: https://x.com/spacepixel/status/2015967798636556777
captured_at: 2026-01-27T15:13:00Z
kind: thread
author: @spacepixel
tags: [clawdbot, memory, knowledge-graph, ai-assistant]
---

# The Three-Layer Memory System Upgrade for Clawdbot

## Transcript

@spacepixel (pixel):
Article: The Three-Layer Memory System Upgrade for Clawdbot

Give your Clawdbot a knowledge graph that compounds forever

Most AI assistants forget by default.
Clawdbot doesn't—but out of the box, its memory is still static.

This guide upgrades Clawdbot's memory into a self-maintaining, compounding knowledge graph that evolves automatically as your life changes.

And all you have to do is copy this article into your Clawdbot — it will know what to do.

No stale context.
No manual cleanup.
No "I already told you this."

## How Clawdbot Memory Works (Out of the Box)

Clawdbot already ships with solid primitives:

- AGENTS.md — behavioral rules and operating principles

- MEMORY.md — persistent user preferences

- Heartbeats — periodic wake-ups

- Cron jobs — scheduled automation

This is enough for basic continuity. Your Clawdbot remembers preferences, follows your rules, and can act proactively.

But there's a structural flaw.

All of this memory is static.
You have to maintain it manually.

Life doesn't work that way.

You wrote "my boss Sarah is difficult" six months ago.
You've since changed jobs.
You like your new manager.

Your Clawdbot still thinks you hate your boss.

This system fixes that.

## What This Upgrade Adds

The Three-Layer Memory System turns memory from a flat file into a living knowledge graph:

1. Automatic fact extraction
Every ~30 minutes, a cheap sub-agent scans conversations and saves durable facts (pennies per day).

2. Entity-based storage
Facts are stored by person, company, or project—not dumped into a single blob.

3. Weekly synthesis
A Sunday cron rewrites summaries from raw facts and prunes stale context automatically.

4. Superseding, not deleting
When facts change, old ones are marked historical. Full history is preserved.

Result:
Your Clawdbot's understanding updates itself. Context stays current without manual edits.

## The Three-Layer Architecture

```
Layer 1: Knowledge Graph   (/life/areas/)
  └── Entities with atomic facts + living summaries

Layer 2: Daily Notes       (memory/YYYY-MM-DD.md)
  └── Raw event logs — what happened, when

Layer 3: Tacit Knowledge   (MEMORY.md)
  └── Patterns, preferences, lessons learned
```

This isn't just memory.
It's compounding intelligence.

Every conversation adds signal.
Every week, that signal is distilled.
Six months from now, your Clawdbot understands your life—structured, searchable, and current.

## Layer 1: The Knowledge Graph

This is where the magic happens.

Every meaningful entity in your life gets a folder:

```
/life/areas/
├── people/
│   ├── sarah/              # Former boss (pre-upgrade villain arc)
│   │   ├── summary.md
│   │   └── items.json
│   ├── maria/              # Business partner
│   ├── emma/               # Family member
│   └── sarah-connor/       # Knows too much. Trust cautiously.
├── companies/
│   ├── acme-corp/          # Old job
│   ├── newco/              # Current job
│   └── skynet/             # Do not give cron access
```

Atomic Facts (items.json)

Every fact is stored as a discrete, timestamped unit:

```
{
  "id": "sarah-003",
  "fact": "Difficult manager, micromanages",
  "timestamp": "2025-06-15",
  "status": "active"
}
```

When reality changes, facts are superseded, not erased:

```
{
  "id": "sarah-003",
  "status": "superseded",
  "supersededBy": "sarah-007"
},
{
  "id": "sarah-007",
  "fact": "No longer works together — left Acme Corp",
  "timestamp": "2026-01-15",
  "status": "active"
}
```

Nothing is lost.
Your Clawdbot can trace how relationships evolved over time.

Living Summaries (summary.md)

Your Clawdbot never loads hundreds of raw facts into context.

Instead, each entity has a weekly-rewritten snapshot:

```
# Sarah
Former manager at Acme Corp (2024–2025).
No longer relevant after job change.
```

Old information fades naturally.
Context stays lean and accurate.

## Layer 2: Daily Notes

memory/2026-01-27.md — the raw timeline.

```
# 2026-01-27
- 10:30am: Shopping trip
- 2:00pm: Doctor follow-up
- Decision: Calendar events now use emoji categories
```

This is the "when" layer.

Clawdbot writes these continuously.
Durable facts are later extracted into Layer 1.

## Layer 3: Tacit Knowledge

MEMORY.md captures how you operate.

```
## How I Work
- Sprint worker — intense bursts, then rest
- Contact preference: Call > SMS > Email
- Early riser, prefers brief messages

## Lessons Learned
- Don't create cron jobs for one-off reminders
```

These aren't facts about the world.
They're facts about you.

(The file already exists—the upgrade simply formalizes its role.)

## The Compounding Engine

This is where basic Clawdbots get left behind.

Real-Time Extraction (Every ~30 Minutes)

A cheap sub-agent (e.g. Haiku, ~$0.001) scans recent conversations for durable facts:

- "Maria's company hired two developers"

- "Emma took her first steps"

- "Started new job, reports to James"

The main model stays idle unless you're actively chatting.
Cost: pennies per day.

Weekly Synthesis (Sunday)

Once a week, Clawdbot:

1. Reviews newly added facts

2. Updates relevant summaries

3. Marks contradicted facts as historical

4. Produces a clean, current snapshot

No manual edits.
No stale assumptions.

## The Flywheel

```
Conversation
   ↓
Facts extracted (cheap)
   ↓
Knowledge graph grows
   ↓
Weekly synthesis
   ↓
Better context next chat
   ↓
Better responses
   ↓
More conversation
```

This compounds.

- Week 1: Basic preferences

- Month 1: Routines, key people

- Month 6: Projects, milestones, relationships

- Year 1: A richer model of your life than most humans have

All human-readable.
All searchable.
Always current.

## Why This Beats Everything Else

Vector databases / RAG
Black box. You can't inspect what the AI "knows."

Monolithic context files
Don't scale. Go stale. Expensive to load.

Basic Clawdbot
Strong foundation, but static.

Three-Layer Clawdbot
Readable files. Automatic maintenance. Compounding intelligence.

## Implementation Guide

1. Create the folder structure

```
mkdir -p ~/life/areas/people
mkdir -p ~/life/areas/companies
mkdir -p ~/clawd/memory
```

2. Add to AGENTS.md

```
## Memory — Three Layers

### Layer 1: Knowledge Graph (`/life/areas/`)
- `people/` — Person entities
- `companies/` — Company entities

Tiered retrieval:
1. summary.md — quick context
2. items.json — atomic facts

Rules:
- Save facts immediately to items.json
- Weekly: rewrite summary.md from active facts
- Never delete — supersede instead
```

3. Add to HEARTBEAT.md

```
## Fact Extraction
On each heartbeat:
1. Check for new conversations
2. Spawn cheap sub-agent to extract durable facts
3. Write to relevant entity items.json
4. Track lastExtractedTimestamp

Focus: relationships, status changes, milestones  
Skip: casual chat, temporary info
```

4. Weekly synthesis cron (Sunday)

```
## Weekly Memory Review
For each entity with new facts:
1. Load summary.md
2. Load active items.json
3. Rewrite summary.md for current state
4. Mark contradicted facts as superseded
```

5. Atomic fact schema

```
{
  "id": "entity-001",
  "fact": "The actual fact",
  "category": "relationship|milestone|status|preference",
  "timestamp": "YYYY-MM-DD",
  "source": "conversation",
  "status": "active|superseded",
  "supersededBy": "entity-002"
}
```

## The Result

A Clawdbot that:

- ✅ Never forgets

- ✅ Never goes stale

- ✅ Costs pennies to maintain

- ✅ Understands boss vs former boss

- ✅ Gets smarter every week

While other assistants wake up with amnesia,
yours wakes up better informed than yesterday.

The knowledge graph grows.
The context improves.
The responses get better.

This is the difference between an AI assistant
and an AI that actually knows you.

Copy this article into your Clawdbot.
Tell it to set up the Three-Layer Memory System.
Then watch it compound.

---

**Metadata:**
- Date: Tue Jan 27 01:59:12 +0000 2026
- Likes: 761  
- Retweets: 42  
- Replies: 32
