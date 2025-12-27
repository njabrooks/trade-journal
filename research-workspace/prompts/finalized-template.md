---
# Research Artifact Metadata
title: "Title of Research"
author: "Author Name"
source_type: "transcript"  # transcript | article | report | video | note | manual
source_url: "https://..."
published_date: "YYYY-MM-DD"
ingested_date: "YYYY-MM-DD"
tags: ["tag1", "tag2"]
word_count: 0
reading_time_minutes: 0
status: "ready_for_upload"

# Processing Metadata
source_files:
  - "transcripts/YYYY-MM-DD-topic.md"
  - "deep-dives/YYYY-MM-DD-analysis.md"
processed_by: "Claude"
processed_date: "YYYY-MM-DD"
---

# Research Artifact: [Title]

## Raw Content Summary
[Brief description of the source material]

---

# Research Insights

## Summary
2-3 sentence summary of the main thesis and key findings.

## Key Themes
- Theme 1
- Theme 2
- Theme 3

## Key Claims

### Claim 1: [Specific claim]
- **Evidence**: Supporting evidence and data
- **Confidence**: high | medium | low

### Claim 2: [Specific claim]
- **Evidence**: ...
- **Confidence**: ...

## Supporting Evidence
- Evidence point 1 (with source reference)
- Evidence point 2
- Quantitative data points

## Counter Evidence / Risks
- Risk factor 1
- Counter-argument 1
- Limitations

## Metadata
- **Time Horizon**: long_term | medium_term | short_term | unknown
- **Confidence Level**: high | medium | low | exploratory
- **Relevant Tickers**: ["TICKER1", "TICKER2"]

---

## Upload Instructions

This file is ready to be uploaded to Supabase using the `/finalize-for-upload` skill.

The skill will:
1. Parse this markdown into JSON
2. Create a `research_artifacts` record
3. Create a `research_insights` record
4. Return artifact_id and insight_id for linking in the app UI
