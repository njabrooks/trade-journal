---
name: backfill-claims
description: Reprocess existing claims for lifecycle-aware thesis linkage suggestions and signal evidence evaluation. Runs the same logic as process-inbox Steps 3a and 7, but against claims already in the database.
---

# Backfill Claims — Linkage Suggestions + Signal Evidence

## Purpose

Reprocess existing `main_claims` that were created before lifecycle-aware routing existed. For each claim:

- **Draft/developing theses**: generate thesis linkage suggestions (same as process-inbox Step 7)
- **Monitoring theses**: evaluate as signal evidence and write `signal_data_snapshots` + `claim_signal_evidences` (same as process-inbox Step 3a + 6b)

This skill uses the **exact same reasoning and assessment logic** as `/process-inbox` — it's the same LLM performing the same evaluation, just against claims that already exist in the database rather than newly extracted ones.

## Usage

```
/backfill-claims                          # Process all eligible claims (dry-run first)
/backfill-claims --limit 20              # Process up to 20 claims
/backfill-claims --insight-id <uuid>     # Process claims from a specific research insight
/backfill-claims --claim-id <uuid>       # Process a single claim
```

## MANDATORY RULES

1. **Dry-run first.** Always show the candidate claims and what will be done before executing.
2. **Same assessment quality as process-inbox.** Apply the same directional reasoning documented in `/assess-validation-evidence`. Never use vague assessments.
3. **Lifecycle-aware routing.** Claim linkage suggestions go to draft/developing theses ONLY. Signal evidence goes to monitoring theses ONLY.
4. **Idempotent.** Use `onConflictDoUpdate` for `claim_signal_evidences` (unique on claimId + signalId). Check for existing pending suggestions before inserting duplicates.

---

## Step 1: Identify Candidate Claims

Parse arguments to determine scope, then query for eligible claims.

```bash
cd /Users/home-hub/projects/trade-journal

# All active claims with their source context
npx tsx scripts/psql-query.ts "
SELECT
  mc.id,
  mc.title,
  mc.claim,
  mc.category,
  mc.qualifier,
  mc.relevant_tickers,
  mc.evidence,
  mc.source_insight_id,
  mc.status,
  ri.title as insight_title,
  ra.title as artifact_title,
  ra.source_url
FROM main_claims mc
LEFT JOIN research_insights ri ON mc.source_insight_id = ri.id
LEFT JOIN research_artifacts ra ON ri.research_artifact_id = ra.id
WHERE mc.status = 'active'
  {{AND mc.source_insight_id = 'INSIGHT_ID'  -- if --insight-id specified}}
  {{AND mc.id = 'CLAIM_ID'                   -- if --claim-id specified}}
ORDER BY mc.created_at DESC
{{LIMIT N                                     -- if --limit specified}}
" --format json
```

### Determine what each claim needs

For each claim, check what's already been done:

```bash
cd /Users/home-hub/projects/trade-journal

# Claims that already have thesis links
npx tsx scripts/psql-query.ts "
SELECT DISTINCT main_claim_id FROM claim_thesis_mappings
" --format json

# Claims that already have pending suggestions
npx tsx scripts/psql-query.ts "
SELECT DISTINCT main_claim_id FROM research_hierarchy_recommendations
WHERE status = 'pending' AND main_claim_id IS NOT NULL
" --format json

# Claims that already have signal evidence links
npx tsx scripts/psql-query.ts "
SELECT DISTINCT claim_id FROM claim_signal_evidences
" --format json
```

Categorize each claim:
- **Needs linkage suggestions**: no thesis links AND no pending suggestions
- **Needs signal evidence evaluation**: no claim_signal_evidences rows
- **Fully processed**: has both (skip)

### Present dry-run summary

```
Backfill candidates: N claims

Claims needing linkage suggestions: N
  - "Claim title" (category, qualifier) — from "Artifact Title"
  - ...

Claims needing signal evidence evaluation: N
  - "Claim title" (tickers: X, Y) — from "Artifact Title"
  - ...

Claims already fully processed: N (skipped)

Proceed? (waiting for confirmation, or auto-proceed if --execute flag)
```

Wait for user confirmation before proceeding unless `--execute` was passed.

---

## Step 2: Query Theses and Signals

Fetch the thesis hierarchy once for the entire batch.

### Draft/developing theses (for linkage suggestions)

```bash
cd /Users/home-hub/projects/trade-journal

npx tsx scripts/psql-query.ts "
SELECT id, title, description, thesis_type, direction, confidence_level, sectors
FROM macro_theses
WHERE status IN ('draft', 'developing')
ORDER BY updated_at DESC
" --format json

npx tsx scripts/psql-query.ts "
SELECT at.id, at.title, at.description, at.direction, at.confidence_level, u.ticker
FROM asset_theses at
JOIN underlyings u ON at.underlying_id = u.id
WHERE at.status IN ('draft', 'developing')
ORDER BY at.updated_at DESC
" --format json
```

### Monitoring theses + their signals (for signal evidence)

```bash
cd /Users/home-hub/projects/trade-journal

npx tsx scripts/psql-query.ts "
SELECT
  s.id as signal_id,
  s.type as signal_type,
  s.statement,
  s.explicit_details,
  s.importance,
  s.notes as signal_notes,
  sel.thesis_id,
  sel.thesis_type,
  COALESCE(mt.title, at.title) as thesis_title,
  COALESCE(mt.status, at.status) as thesis_status,
  u.ticker
FROM signals s
JOIN signal_entity_links sel ON sel.signal_id = s.id AND sel.entity_type = 'thesis'
LEFT JOIN macro_theses mt ON sel.thesis_type = 'macro' AND sel.thesis_id = mt.id
LEFT JOIN asset_theses at ON sel.thesis_type = 'asset' AND sel.thesis_id = at.id
LEFT JOIN underlyings u ON at.underlying_id = u.id
WHERE s.status = 'active'
  AND COALESCE(mt.status, at.status) = 'monitoring'
ORDER BY s.importance, s.updated_at DESC
" --format json
```

---

## Step 3: Process Each Claim

Process claims one at a time (or in small batches grouped by insight). For each claim:

### 3a: Signal Evidence Evaluation (monitoring theses)

**Skip if claim already has `claim_signal_evidences` rows.**

Build content text from the claim:
```
Content = claim.title + "\n" + claim.claim + "\n" + (claim.evidence || []).join("\n")
```

For each active signal on a monitoring thesis, score and assess:

**Scoring** (same algorithm as process-inbox Step 2b-ii):
```
score = 0
for each ticker in claim.relevant_tickers:
  if ticker matches signal's thesis ticker: score += 3
for each keyword in signal.explicit_details.monitorKeywords:
  if keyword found in content (case-insensitive): score += 1
for each word in signal.statement (length > 4 chars):
  if word found in content (case-insensitive): score += 0.5
```

**Assessment** (same reasoning as `/assess-validation-evidence`):

For signals with score > 0, assess directionally using the claim text:

- For **confirmation signals**: `strengthening` when the claim supports the condition forming; `weakening` when it contradicts
- For **invalidation signals**: `strengthening` when the risk described is growing (bad for thesis); `weakening` when the risk is receding (good for thesis)
- `confirmed` / `invalidated` only for definitive outcomes
- `neutral` when topically related but no material bearing on whether the signal triggers
- Score < 3 with no clear directional evidence → `neutral`

**Evidence summary format** (critical — shown in Signal Log):
1. State the specific finding from the claim with detail
2. Explicitly state direction: "This [increases/reduces] the probability that [signal condition] triggers because..."
3. For invalidation signals: "Risk [growing/receding]: [reason]"

**Write signal_data_snapshots** for signals with non-neutral assessment:

```bash
cd /Users/home-hub/projects/trade-journal
cat > scripts/tmp-backfill-snapshots.ts << 'SCRIPT'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const { db, closeDb, schema } = await import('./lib/db.js');
  const snapshots = {{SNAPSHOTS_JSON_ARRAY}};
  const inserted = await db.insert(schema.signalDataSnapshots).values(snapshots).returning({ id: schema.signalDataSnapshots.id, signalId: schema.signalDataSnapshots.signalId });
  console.log(JSON.stringify({ success: true, count: inserted.length, snapshots: inserted }));
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
SCRIPT
npx tsx scripts/tmp-backfill-snapshots.ts
rm scripts/tmp-backfill-snapshots.ts
```

Snapshot format:
```json
[
  {
    "signalId": "<signal uuid>",
    "snapshotDate": "<claim created_at or now>",
    "assessment": "strengthening",
    "evidenceSummary": "Detailed directional assessment...",
    "intelligenceItemId": null,
    "dataSource": "research_routing",
    "status": "pending",
    "claimId": "<main_claim uuid>",
    "reportId": null
  }
]
```

**Note**: Unlike process-inbox, we can set `claimId` immediately since the claim already exists. No backfill step needed.

**Write claim_signal_evidences** for each (claim, signal) pair with non-neutral assessment:

```bash
cd /Users/home-hub/projects/trade-journal
cat > scripts/tmp-backfill-evidences.ts << 'SCRIPT'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const { db, closeDb, schema } = await import('./lib/db.js');
  const evidences = {{EVIDENCES_JSON_ARRAY}};
  for (const row of evidences) {
    await db.insert(schema.claimSignalEvidences).values(row)
      .onConflictDoUpdate({
        target: [schema.claimSignalEvidences.claimId, schema.claimSignalEvidences.signalId],
        set: { assessment: row.assessment, snapshotId: row.snapshotId },
      });
  }
  console.log(JSON.stringify({ success: true, count: evidences.length }));
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
SCRIPT
npx tsx scripts/tmp-backfill-evidences.ts
rm scripts/tmp-backfill-evidences.ts
```

Evidence format:
```json
[
  {
    "claimId": "<main_claim uuid>",
    "signalId": "<signal uuid>",
    "assessment": "strengthening",
    "snapshotId": "<snapshot uuid from insert above>"
  }
]
```

**Write journal entries** for non-neutral assessments:

```bash
cd /Users/home-hub/projects/trade-journal

# Per signal assessed:
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type signal \
  --id {{SIGNAL_ID}} \
  --note "Claim evidence ({{assessment}}): \"{{claim_title}}\". Source: {{artifact_title}}."

# Per thesis with assessed signals:
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type {{macro_thesis|asset_thesis}} \
  --id {{THESIS_ID}} \
  --note "Backfill signal evidence from '{{artifact_title}}': {{N}} signals assessed, {{M}} with evidence."
```

### 3b: Linkage Suggestions (draft/developing theses)

**Skip if claim already has thesis links or pending suggestions.**

For each claim, assess against all draft/developing theses using these criteria:

- **Ticker overlap** (high weight) — claim's `relevant_tickers` vs asset thesis ticker
- **Category alignment** (high weight) — `macro` claims → macro theses, `asset_specific` claims → asset theses
- **Thematic relevance** (high weight) — semantic match between claim text and thesis description
- **Directional alignment** (medium weight) — both bullish → `supports`; opposing → `refutes`

Determine: `mappingType` (supports | refutes | foundation), `confidence` (0.40-1.00), `reasoning` (1-2 sentences).

Rules:
- Max 3 suggestions per claim
- Only suggest matches with confidence >= 0.40
- Skip claims with no plausible thesis match

**Insert suggestions**:

```bash
cd /Users/home-hub/projects/trade-journal
echo '{{SUGGESTIONS_JSON_ARRAY}}' | npx tsx scripts/ops/insert-claim-suggestions.ts --insight-id {{INSIGHT_ID}}
```

Suggestion format:
```json
[
  {
    "claimId": "<main_claim uuid>",
    "thesisId": "<macro_thesis uuid>",
    "mappingType": "supports",
    "confidence": 0.75,
    "reasoning": "Explanation of why this claim relates to the thesis"
  }
]
```

For asset theses, use `assetThesisId` instead of `thesisId`:
```json
{
  "claimId": "<main_claim uuid>",
  "assetThesisId": "<asset_thesis uuid>",
  "mappingType": "supports",
  "confidence": 0.80,
  "reasoning": "Explanation"
}
```

---

## Step 4: Progress Report

After processing each claim (or batch), report progress:

```
Processed: "Claim Title"
  Signal evidence: N signals assessed, M with evidence (strengthening: X, weakening: Y)
  Linkage suggestions: N suggestions created (thesis1, thesis2, ...)
```

## Final Report

```
Backfill complete.

Claims processed: N
Signal evidence:
  - Snapshots written: N
  - Claim-signal links: N
  - Signals assessed: N across M monitoring theses
Linkage suggestions:
  - Suggestions created: N across M developing theses
Skipped (already processed): N
Errors: N
```

---

## Key Principles

**Same quality as process-inbox.** This skill exists because we want the exact same LLM reasoning applied to existing claims. Don't shortcut the assessment — each signal evaluation should explain the directional impact clearly.

**Lifecycle boundary is the law.** Draft/developing theses get claim suggestions. Monitoring theses get signal evidence. Never cross the boundary.

**Idempotent and safe.** The `claim_signal_evidences` unique constraint and suggestion duplicate checking mean this skill can be re-run safely. Already-processed claims are skipped.

**Batch sensibly.** For large backlogs, process 10-20 claims per run to keep context manageable. Use `--limit` to control batch size.
