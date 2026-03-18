# assess-validation-evidence

**Type:** managed
**Description:** Assess content (SEC filings, presentations, news articles, transcripts) against existing thesis signals to identify confirmation or warning evidence. Cross-references content against active signals (via the `signal_entity_links` junction table), scores relevance, writes `signal_data_snapshots` rows with `data_source = 'qualitative'`, and generates a structured evidence report.

## Architecture Overview (current as of 2026)

Signals live in the `signals` table. They are linked to theses (macro or asset) via the `signal_entity_links` junction table — **not** via direct `thesis_id`/`thesis_type` columns on signals (those were dropped). All queries must join through `signal_entity_links`.

Qualitative assessments are stored as `signal_data_snapshots` rows with:
- `data_source = 'qualitative'`
- `assessment` = one of: `no_evidence` | `emerging` | `partial` | `strong` | `confirmed`
- `evidence_summary` = 1-2 sentence human-readable summary of what was found

The `generateQualitativeSnapshots()` function in `scripts/ingest-world-monitor.ts` is the authoritative reference for how qualitative scoring works. This skill applies the same scoring logic to manually-supplied content.

## Usage

```bash
/assess-validation-evidence ticker:GLXY ~/Desktop/galaxy-presentation.html
/assess-validation-evidence asset:<uuid> ~/Downloads/filing.pdf
/assess-validation-evidence macro:<uuid> "pasted content text..."
```

**Thesis identifier:**
- `ticker:SYMBOL` — find asset thesis by ticker (e.g., `ticker:GLXY`)
- `asset:<uuid>` — direct asset thesis ID
- `macro:<uuid>` — direct macro thesis ID

**Content source:**
- File path — read with `cat`
- URL — fetch with WebFetch tool
- Inline text — use directly

**Note:** For SEC.gov URLs, download HTML first with curl using a proper User-Agent, as SEC blocks automated access.

## Workflow

1. **Resolve thesis** from identifier → get thesis ID + type
2. **Fetch active signals** for the thesis via `signal_entity_links` junction table
3. **Read content** from provided source
4. **Score each signal** against content (ticker overlap + keyword overlap + statement overlap)
5. **Assess** each signal: `no_evidence` | `emerging` | `partial` | `strong` | `confirmed`
6. **Write `signal_data_snapshots` rows** for all assessed signals
7. **Add journal note** on the thesis summarising key findings
8. **Output structured report**

---

## Step 1: Resolve Thesis

### By ticker

```bash
cd /Users/home-hub/projects/trade-journal
npx tsx scripts/psql-query.ts "
SELECT at.id, at.title, at.status, u.ticker, 'asset' as thesis_type
FROM asset_theses at
JOIN underlyings u ON at.underlying_id = u.id
WHERE u.ticker = 'GLXY' AND at.status = 'active'
LIMIT 1
" --format json
```

### By direct ID

```bash
cd /Users/home-hub/projects/trade-journal
npx tsx scripts/psql-query.ts "
SELECT id, title, status, 'macro' as thesis_type FROM macro_theses WHERE id = '<UUID>'
UNION ALL
SELECT id, title, status, 'asset' as thesis_type FROM asset_theses WHERE id = '<UUID>'
" --format json
```

---

## Step 2: Fetch Active Signals via Junction Table

**Always use the junction table — there are no direct thesis_id/thesis_type columns on the signals table.**

```bash
cd /Users/home-hub/projects/trade-journal
npx tsx scripts/psql-query.ts "
SELECT
  s.id,
  s.type,
  s.statement,
  s.category,
  s.importance,
  s.status,
  s.explicit_details,
  s.notes,
  sel.thesis_id,
  sel.thesis_type
FROM signals s
JOIN signal_entity_links sel ON sel.signal_id = s.id
WHERE sel.thesis_id = '{{THESIS_ID}}'
  AND sel.thesis_type = '{{THESIS_TYPE}}'
  AND sel.entity_type = 'thesis'
  AND s.status = 'active'
ORDER BY s.importance, s.type
" --format json
```

---

## Step 3: Read Content

- **File path**: `cat /path/to/file.html` or use Read tool
- **URL**: Use WebFetch tool
- **Inline text**: use directly

---

## Step 4: Score Each Signal Against Content

Apply the same scoring logic used by `generateQualitativeSnapshots()` in `scripts/ingest-world-monitor.ts`:

### Extract from signal

1. **Ticker** — if asset thesis, get the ticker from the thesis
2. **monitorKeywords** — from `explicit_details.monitorKeywords` (array of strings), also check `explicit_details.conditions[].monitorKeywords`
3. **Statement words** — split signal statement on whitespace, keep words > 4 chars

### Score the content

```
score = 0

# Ticker match (strong signal)
if ticker appears in content (any tickers array or inline text):
  score += 3

# Keyword matches
for each keyword in monitorKeywords:
  if keyword appears in content (case-insensitive):
    score += 1

# Statement word overlap
for each word in signal statement (len > 4, lowercased):
  if word appears in content:
    score += 0.5
```

### Determine assessment level

Check content for no-evidence indicators first: phrases like `no evidence`, `no change`, `no new`, `status quo`, `unchanged`, `no significant`, `no notable`, `no material`.

| Score | Assessment |
|-------|-----------|
| score = 0 OR no-evidence indicators found | `no_evidence` |
| score < 3 (and no no-evidence indicators) | `emerging` |
| 3 ≤ score < 5 | `partial` |
| score ≥ 5 | `strong` |
| Independently, unambiguous direct confirmation of signal threshold | `confirmed` |

Use `confirmed` conservatively — only when the content contains clear, unambiguous evidence that the signal's stated threshold/condition has been met (e.g., price explicitly above target, metric explicitly crossed threshold).

---

## Step 5: Assess Each Signal

For each signal, produce:
- **Assessment**: `no_evidence` | `emerging` | `partial` | `strong` | `confirmed`
- **Confidence**: `high` | `medium` | `low`
- **Key findings**: bullet list of specific evidence from content (skip if `no_evidence`)
- **Relevant quotes**: direct quotes from source (skip if `no_evidence`)
- **Evidence summary** (1-2 sentences): plain text for `signal_data_snapshots.evidence_summary`
- **Recommendation**: what action, if any, to take

---

## Step 6: Write signal_data_snapshots Rows

Write a qualitative snapshot for **every** assessed signal (including `no_evidence` entries — this keeps the timeline complete, consistent with `generateQualitativeSnapshots()`).

```bash
cd /Users/home-hub/projects/trade-journal
cat > scripts/tmp-signal-snapshots.ts << 'SCRIPT'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const { db, closeDb, schema } = await import('./lib/db.js');
  const snapshots = {{SNAPSHOTS_JSON}};
  await db.insert(schema.signalDataSnapshots).values(snapshots);
  console.log(JSON.stringify({ success: true, count: snapshots.length }));
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
SCRIPT
npx tsx scripts/tmp-signal-snapshots.ts
rm scripts/tmp-signal-snapshots.ts
```

Replace `{{SNAPSHOTS_JSON}}` with an array like:

```json
[
  {
    "signalId": "<uuid>",
    "snapshotDate": "new Date()",
    "assessment": "partial",
    "evidenceSummary": "Galaxy's Helios data centre reached 300MW operational capacity, ahead of 250MW target cited in signal.",
    "intelligenceItemId": null,
    "dataSource": "qualitative",
    "reportId": null
  }
]
```

**Important:** `dataSource` must be `'qualitative'` (not `'thesis_monitor'` — that's only for automated world-monitor ingestion).

---

## Step 7: Add Journal Note on Thesis

```bash
cd /Users/home-hub/projects/trade-journal
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type {{macro_thesis|asset_thesis}} \
  --id {{THESIS_ID}} \
  --note "Signal evidence assessment: [N] signals assessed against [content title]. [summary of key findings — confirmations and warnings]."
```

---

## Step 8: Output Report

Generate a structured markdown report. This is the output that `process-inbox` embeds in audit files when routing through `signal_evidence`.

```markdown
## Signal Evidence Assessment

**Assessed against**: [N] active signals for thesis: "[Thesis Title]" ([macro|asset] — [ticker if asset])
**Assessment date**: YYYY-MM-DD
**Content source**: [file/URL/description]

---

### Signal: [signal statement]
**Type**: confirmation | warning
**Importance**: critical | significant | supporting
**Assessment**: No Evidence | Emerging | Partial | Strong | Confirmed
**Confidence**: high | medium | low

**Key Findings**:
- [Specific finding from content]
- [Another finding with specifics — numbers, dates, quotes]

**Relevant Quotes**:
> "[Direct quote from content]"

**Recommendation**: [Update status? Flag for review? No action?]

---

[Repeat for each signal. For no_evidence signals, list them in a summary section at the end.]

### Signals with No Evidence (N of M assessed)
- [signal statement] (importance: critical/significant/supporting)
- ...

---

### Summary
- **Signals assessed**: N total (M confirmation, K warning)
- **Strong / Confirmed**: N
- **Partial / Emerging**: N
- **No evidence**: N
- **Recommended actions**: [bullet list of any status update suggestions or triage flags]
```

---

## Output Format (Headless / JSON mode)

When invoked from `process-inbox` or another headless skill, output JSON instead of markdown:

```json
{
  "success": true,
  "thesisId": "<uuid>",
  "thesisType": "macro|asset",
  "thesisTitle": "Thesis Title",
  "signalsAssessed": 8,
  "snapshotsWritten": 8,
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
      "quotes": ["Direct quote"],
      "recommendedAction": "Brief recommendation"
    }
  ],
  "overallSummary": "2-3 sentence summary of key findings across all signals"
}
```

---

## Implementation Notes

- **Always use `signal_entity_links`** for fetching thesis signals — the `signals` table has no direct `thesis_id`/`thesis_type` columns
- **Write snapshots for ALL signals**, including `no_evidence` — the timeline completeness matters
- `dataSource` = `'qualitative'` for this skill (vs `'thesis_monitor'` for automated world-monitor runs)
- Assessment scale (`no_evidence | emerging | partial | strong | confirmed`) matches `signal_data_snapshots.assessment` column
- **Do NOT automatically update signal status** — only write snapshots and journal notes. Status changes require user review.
- This skill can be run repeatedly against the same thesis with different content — each run adds new snapshot rows
- `psql-query.ts` is **read-only** — use temp scripts for inserts

## Relationship to Other Skills

- **`process-inbox`** — calls this skill inline when routing to `signal_evidence` or `both` routes
- **`thesis-monitor`** — similar qualitative assessment but automated; uses `data_source = 'thesis_monitor'`
- **`configure-signal`** — sets up the `monitorKeywords` in `explicit_details` that this skill reads
