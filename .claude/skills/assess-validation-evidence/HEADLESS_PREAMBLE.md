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

**Assessment — use the correct scale: `neutral | strengthening | weakening | confirmed | invalidated`**

Step 1 — Check for no-evidence indicators (phrases like `no evidence`, `no change`, `unchanged`, `no new`, `no material`). If found: `neutral`.

Step 2 — If score = 0: `neutral`.

Step 3 — Determine direction relative to the **signal type**:

| Signal type | `strengthening` means | `weakening` means |
|---|---|---|
| **confirmation** | Evidence moves the condition closer to being met | Evidence moves the condition further from being met |
| **invalidation / warning** | The risk described in the signal is **growing** (bad) | The risk described in the signal is **receding** (good) |

**Critical for invalidation signals — the double inversion**: Evidence that supports the thesis (i.e., confirms the thesis is playing out) reduces the chance the invalidation condition triggers. That means `weakening`, NOT `strengthening`. Pro-thesis evidence + invalidation signal = `weakening`.

**Examples for invalidation signals:**
- Signal: "USD reserve share rises above 60%". Evidence: "Central banks diversifying into gold after Russian asset freeze; structural shift away from dollar reserves" → `weakening` (invalidation risk receding — reserve share is NOT rising; the thesis is playing out)
- Signal: "USD reserve share rises above 60%". Evidence: "EM central banks increasing UST purchases; dollar strengthening" → `strengthening` (invalidation risk growing)
- Signal: "Regulatory enforcement against exchange". Evidence: "Regulatory pressure on offshore perps increasing" → `strengthening` (risk growing)
- Signal: "Regulatory enforcement". Evidence: "SEC drops investigation, clarifies asset is not a security" → `weakening` (risk receding)
- Signal: "Regulatory enforcement". Evidence: "SPDJI partnership complicates targeted CFTC action" → `weakening` (risk receding, not strengthening)
- "No regulatory news this week" → `neutral`

Use `confirmed` / `invalidated` only for clear, unambiguous threshold events (e.g., actual enforcement action filed).

**Evidence summary requirements — this is what appears in the signal log note column. It MUST:**
1. State the specific finding (quote/reference the actual evidence, with numbers/names where available)
2. Explicitly state the direction: "This [increases/reduces] the probability that [signal condition] triggers because..."
3. For **invalidation signals**: be especially explicit — "Risk [growing/receding] because [reason]"
4. Be 1-3 sentences. Never use vague openers like "Monitoring elevated" or "No direct action" alone.

**Bad**: "Monitoring elevated — regulatory environment evolving."
**Good**: "SPDJI x Hyperliquid data partnership co-signs regulated TradFi infrastructure on-chain, directly complicating a targeted CFTC/SEC enforcement action. Risk receding: a regulated institution's public endorsement reduces the probability of enforcement and shrinks the jurisdictional argument."

### 4. Write signal_data_snapshots for ALL signals

Include `neutral` signals — keeps timeline complete.

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
    "assessment": "strengthening",
    "evidenceSummary": "Specific finding. Direction rationale: [why this moves the signal closer to/further from triggering].",
    "intelligenceItemId": null,
    "dataSource": "qualitative",
    "reportId": null
  }
]
```

`assessment` must be one of: `neutral` | `strengthening` | `weakening` | `confirmed` | `invalidated`

### 5. Add journal entry per signal assessed

After writing snapshots, write a journal entry for **each** signal with an assessment other than `neutral`.

```bash
cd /Users/home-hub/projects/trade-journal

# Repeat for each assessed signal (skip neutral signals):
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type signal \
  --id {{SIGNAL_ID}} \
  --note "Evidence assessment ({{assessment}}): {{evidence_summary}}. Source: {{contentFile basename or title}}."
```

- Skip `neutral` signals
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
      "type": "confirmation|invalidation",
      "importance": "critical|significant|supporting",
      "assessment": "neutral|strengthening|weakening|confirmed|invalidated",
      "confidence": "high|medium|low",
      "evidenceSummary": "Specific finding. Direction rationale: why this moves the signal closer to/further from triggering.",
      "findings": ["Finding 1", "Finding 2"],
      "quotes": ["Direct quote from content"],
      "recommendedAction": "Brief recommendation"
    }
  ],
  "overallSummary": "2-3 sentence summary of key findings"
}
```

## Assessment Rules

- Include ALL signals in output, including those with `neutral` assessment
- Assessment scale is: `neutral | strengthening | weakening | confirmed | invalidated` — no other values
- Be conservative with `confirmed` / `invalidated` — require clear, unambiguous evidence the threshold was definitively met/ruled out
- For **invalidation/warning signals**: `strengthening` = risk growing (bad); `weakening` = risk receding (good). Do NOT score evidence that reduces enforcement/risk probability as `strengthening`
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
