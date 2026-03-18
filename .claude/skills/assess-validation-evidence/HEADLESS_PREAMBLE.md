# HEADLESS MODE — Assess Validation Evidence

You are running in **HEADLESS/AUTONOMOUS** mode. Do NOT ask for user input.

## Parameters

- **Thesis ID:** `{{thesisId}}`
- **Thesis Type:** `{{thesisType}}`
- **Content file:** `{{contentFile}}`

## Task

Analyze the content in the file at `{{contentFile}}` against active signals for thesis `{{thesisId}}` ({{thesisType}}). Write `signal_data_snapshots` rows for all signals and output a JSON result.

## Environment Setup

```bash
cd /Users/home-hub/projects/trade-journal
set -a && source .env.local && set +a
```

## Steps

### 1. Load thesis and signals via junction table

**CRITICAL: signals do NOT have thesis_id/thesis_type columns. Always use signal_entity_links.**

```bash
cd /Users/home-hub/projects/trade-journal

# Load thesis details
npx tsx scripts/psql-query.ts "
SELECT id, title, status FROM {{thesisTable}} WHERE id = '{{thesisId}}'
" --format json

# Load active signals via junction table
npx tsx scripts/psql-query.ts "
SELECT
  s.id, s.statement, s.type, s.importance, s.status,
  s.explicit_details, s.notes,
  sel.thesis_id, sel.thesis_type
FROM signals s
JOIN signal_entity_links sel ON sel.signal_id = s.id
WHERE sel.thesis_id = '{{thesisId}}'
  AND sel.thesis_type = '{{thesisType}}'
  AND sel.entity_type = 'thesis'
  AND s.status = 'active'
ORDER BY s.importance, s.type
" --format json

# If asset thesis, also get the ticker for scoring
npx tsx scripts/psql-query.ts "
SELECT u.ticker FROM asset_theses at
JOIN underlyings u ON at.underlying_id = u.id
WHERE at.id = '{{thesisId}}'
" --format json
```

### 2. Read the content file

```bash
cat "{{contentFile}}"
```

### 3. Score and assess each signal

For each signal, apply the scoring algorithm:

**Score:**
- Ticker match: +3 pts (if asset thesis ticker appears in content)
- Each `explicit_details.monitorKeywords` match: +1 pt per keyword (case-insensitive)
- Each `explicit_details.conditions[].monitorKeywords` match: +1 pt per keyword
- Each signal statement word (length > 4) found in content: +0.5 pts

**Assessment thresholds:**
- no-evidence phrases found in content (e.g., "no change", "unchanged", "no evidence") → `no_evidence`
- score = 0 → `no_evidence`
- score < 3 → `emerging`
- 3 ≤ score < 5 → `partial`
- score ≥ 5 → `strong`
- unambiguous threshold met → `confirmed` (use conservatively)

**Evidence summary** (1-2 sentences for the snapshot row): concise, factual, with specific data points.

### 4. Write signal_data_snapshots for ALL signals

Include `no_evidence` signals — keeps timeline complete.

```bash
cd /Users/home-hub/projects/trade-journal
cat > scripts/tmp-headless-snapshots.ts << 'SCRIPT'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const { db, closeDb, schema } = await import('./lib/db.js');
  const snapshots = SNAPSHOTS_PLACEHOLDER;
  await db.insert(schema.signalDataSnapshots).values(snapshots);
  console.log(JSON.stringify({ success: true, count: snapshots.length }));
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
SCRIPT
npx tsx scripts/tmp-headless-snapshots.ts
rm scripts/tmp-headless-snapshots.ts
```

Replace `SNAPSHOTS_PLACEHOLDER` with the actual array of snapshot objects:
```json
[
  {
    "signalId": "<uuid>",
    "snapshotDate": "new Date()",
    "assessment": "<assessment>",
    "evidenceSummary": "<1-2 sentence summary or null>",
    "intelligenceItemId": null,
    "dataSource": "qualitative",
    "reportId": null
  }
]
```

### 5. Add journal entry per signal assessed

After writing snapshots, write a journal entry for **each** signal with an assessment other than `no_evidence`. This provides narrative traceability on each signal's Journal tab.

```bash
cd /Users/home-hub/projects/trade-journal

# Repeat for each assessed signal (skip no_evidence signals):
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type signal \
  --id {{SIGNAL_ID}} \
  --note "Evidence assessment ({{assessment}}): {{evidence_summary}}. Source: {{contentFile basename or title}}."
```

- Skip `no_evidence` signals
- Include the assessment level and evidence summary from the snapshot
- Use `--entity-type signal`

### 6. Output JSON result

Output a single JSON result as your final output:

```json
{
  "success": true,
  "thesisId": "<uuid>",
  "thesisType": "macro|asset",
  "thesisTitle": "Thesis Title",
  "signalsAssessed": 8,
  "snapshotsWritten": 8,
  "journalEntriesWritten": 5,
  "assessments": [
    {
      "signalId": "<uuid>",
      "statement": "<signal statement>",
      "type": "confirmation|warning",
      "importance": "critical|significant|supporting",
      "assessment": "strong|partial|emerging|no_evidence|confirmed",
      "confidence": "high|medium|low",
      "evidenceSummary": "1-2 sentence summary",
      "findings": ["Finding 1", "Finding 2"],
      "quotes": ["Direct quote from content"],
      "recommendedAction": "Brief recommendation"
    }
  ],
  "overallSummary": "2-3 sentence summary of key findings"
}
```

## Assessment Rules

- Include ALL signals in output, even those with `no_evidence` assessment
- Be conservative with `confirmed` — require clear, unambiguous evidence the threshold was met
- Use exact quotes from the content for the `quotes` field
- `dataSource` must be `'qualitative'` (not `'thesis_monitor'`)
- Do NOT automatically update signal status — only write snapshots

On failure:
```json
{
  "success": false,
  "error": "<specific error message>"
}
```
