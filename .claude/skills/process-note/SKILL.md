---
name: process-note
description: Process general notes and content with Toulmin claim extraction. No investment-specific fields. Use for non-finance content that you want to extract ideas from without feeding into the investment pipeline.
allowed-tools: Read, Write, Bash
---

# Process Note (General Claim Extraction)

## Purpose

Process general notes, articles, and content with **Toulmin framework claim extraction**:
1. **Extract claims** using core Toulmin structure
2. **Identify relationships** between main claims and supporting evidence
3. **Preserve context** for future reference
4. **Move processed files** from inbox to transcripts-audits folder

This is for **non-investment content** - ideas, essays, general research. No tickers, no thesis candidates, no database upload prompts.

## Document Flow

```
research-workspace/inbox/           ← Raw content lands here
         ↓ (process-note)
research-workspace/transcripts-audits/  ← Completed audits + original files move here
```

## When to Use

Use `/process-note` for:
- Personal development content
- General essays and articles
- Non-finance podcasts/videos
- Ideas you want to capture but not invest around

Use `/process-transcript` instead for:
- Investment research
- Market analysis
- Content with tickers and trade ideas
- Material that should feed into theses

## Instructions

When the user asks to process a note:
- "Process this note"
- "Extract claims from this article"
- "/process-note [filename]"

Follow these steps:

### Step 0: Determine Paths

The document flow uses these directories:
- **Inbox**: `research-workspace/inbox/` - where raw content lands
- **Transcripts-Audits**: `research-workspace/transcripts-audits/` - where processed files go

When processing a file:
1. If user provides a path, use it directly
2. If user provides just a filename, look in `research-workspace/inbox/`
3. Output audits to `research-workspace/transcripts-audits/`
4. Move original files from inbox to `transcripts-audits/` after processing

### Step 1: Read Content

Read the file and understand the structure. If it needs formatting cleanup (raw paste, missing frontmatter), clean it up first.

### Step 2: Toulmin Claim Extraction

Extract claims using core Toulmin framework. Each claim gets:

**1. Claim** (The assertion)
- What is being asserted?

**2. Evidence** (Data supporting the claim)
- Direct quotes, examples, data from the source
- Use bullet points for multiple items

**3. Reasoning** (Why evidence supports claim)
- Logical connection between evidence and claim

**4. Backing** (Support for reasoning)
- Additional theoretical or empirical support
- Historical precedents, research, patterns

**5. Qualifier** (Degree of confidence)
- high, medium, low, exploratory

**6. Rebuttal** (Counter-arguments)
- What could invalidate this claim?

### Claim Categorization (Simplified)

**Level**:
- **main**: Stands alone as a key idea
- **evidence**: Supports another claim

**Category** (flexible, based on content):
- Examples: productivity, health, psychology, technology, philosophy, creativity, etc.
- Use whatever categories fit the content naturally

### Step 3: Identify Relationships

For each evidence claim, note which main claims it supports:

```
Main Claim 1: "Deep work requires distraction-free blocks"
  ├─ Evidence Claim 2: "Cal Newport's research shows..." (supports)
  └─ Evidence Claim 3: "Multitasking reduces productivity by 40%" (supports)
```

### Step 4: Generate Audit Document

Create audit in `research-workspace/transcripts-audits/`:

```markdown
---
source_file: "research-workspace/transcripts-audits/[filename].md"
audit_date: "20260122"
content_type: general
total_claims: X
main_claims: Y
evidence_claims: Z
---

# Audit: [Title]

**Source**: [URL or description]
**Processed**: 20260122
**Total Claims**: X (Y main, Z evidence)

---

## Main Claims

### Claim 1: [Title]

**Level**: main
**Category**: [category]
**Qualifier**: [high/medium/low/exploratory]

**Claim**:
[The assertion]

**Evidence**:
- [Supporting data/quotes]

**Reasoning**:
[Why evidence supports claim]

**Backing**:
[Additional support]

**Rebuttal**:
- [Counter-arguments]

**Supporting Evidence Claims**: claim-X, claim-Y

---

## Evidence Claims

### Claim 2: [Title]

**Level**: evidence
**Supports**: claim-1

**Claim**:
[The assertion]

**Evidence**:
- [Supporting data/quotes]

**Reasoning**:
[Why evidence supports claim]

**Backing**:
[Additional support]

**Qualifier**: [confidence level]

---

## Claim Relationships

```
Main Claim 1 (...)
  ├─ SUPPORTED BY
  │   ├─ Claim 2 (...)
  │   └─ Claim 3 (...)
```

---

## Summary

**Main Claims**: X
**Evidence Claims**: Y
**Categories**: [list of categories found]
```

### Step 5: Update Original File with Tags

Add/update frontmatter with extracted themes:

```yaml
---
title: "[Title]"
source_type: "note"
processed_date: "20260122"
tags: ["productivity", "focus", "deep work"]
---
```

### Step 6: Move Original File

Move from inbox to transcripts-audits:

```bash
mv research-workspace/inbox/[filename].md research-workspace/transcripts-audits/
```

## Output Format

```
research-workspace/transcripts-audits/YYYYMMDD-slug-audit.md  (audit)
research-workspace/transcripts-audits/YYYYMMDD-slug.md        (original, moved)
```

## Key Principles

**Core Toulmin Only**:
- No tickers, novelty scores, or consensus views
- No macro thesis/asset thesis candidate categorization
- No database upload prompts

**Flexibility**:
- Categories emerge from content (not forced)
- Simpler structure than investment audits

**Same Rigor**:
- Still extract ALL claims
- Still use full Toulmin framework
- Still identify claim relationships

## Notes

- This skill does NOT prompt for database upload
- Output is for personal reference and idea capture
- Claims stay local in markdown - no investment pipeline integration
- ALWAYS move the original file from inbox/ to transcripts-audits/ after processing
