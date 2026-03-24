# assess-validation-evidence

**Type:** managed
**Description:** Assess content (SEC filings, presentations, news articles, transcripts) against existing thesis signals to identify confirmation or warning evidence. Cross-references content against active signals (via the `signal_entity_links` junction table), scores relevance, writes `signal_data_snapshots` rows with `data_source = 'qualitative'`, and generates a structured evidence report.

## Architecture Overview (current as of 2026)

Signals live in the `signals` table. They are linked to theses (macro or asset) via the `signal_entity_links` junction table — **not** via direct `thesis_id`/`thesis_type` columns on signals (those were dropped). All queries must join through `signal_entity_links`.

Qualitative assessments are stored as `signal_data_snapshots` rows with:
- `data_source = 'qualitative'`
- `assessment` = one of: `neutral` | `strengthening` | `confirmed` | `weakening` | `invalidated`
- `evidence_summary` = the note shown in the Signal Log — **must clearly explain WHY the assessment is what it is** (see format requirements below)

**Assessment is always relative to the signal itself:**
- For **confirmation signals**: `strengthening` when evidence supports the condition forming; `weakening` when evidence contradicts it
- For **invalidation/warning signals**: `strengthening` when the risk described is **growing** (bad for thesis); `weakening` when the risk is **receding** (good for thesis). Do NOT assign `strengthening` to evidence that reduces the probability of enforcement, default, or other adverse outcomes.
- `confirmed` / `invalidated` only for definitive (not directional) outcomes
- `neutral` when content is topically related but has no material bearing on whether the signal triggers

**Evidence summary format (critical — this is the note shown to the user in the Signal Log):**
1. State the specific finding with detail (names, numbers, quotes where available)
2. Explicitly state direction: "This [increases/reduces] the probability that [signal condition] triggers because..."
3. For invalidation signals specifically: state "Risk [growing/receding]: [reason]"
4. Never use vague openers alone ("Monitoring elevated", "No direct action", "Regulatory landscape evolving") without explaining the directional implication

**Bad**: `"Monitoring elevated — S&P DJI licensing is a meaningful positive counterweight today."`
**Good**: `"S&P DJI x Hyperliquid licensing partnership brings a regulated TradFi data institution publicly on-chain. Risk receding: an institution of SPDJI's standing co-signing Hyperliquid infrastructure materially complicates a targeted enforcement action and narrows the jurisdictional argument."`

The `generateQualitativeSnapshots()` function in `scripts/ingest-world-monitor.ts` is the authoritative reference for how automated qualitative scoring works. That function can only produce `neutral` or `strengthening` (it cannot determine direction). This skill applies human judgement to also assign `weakening`, `invalidated`, or `confirmed`.

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
5. **Assess** each signal: `neutral` | `strengthening` | `confirmed` | `weakening` | `invalidated`
6. **Write `signal_data_snapshots` rows** for all assessed signals
6c. **Write thesis-level `signal_evidence_received` journal entries** for non-neutral assessments
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
WHERE u.ticker = 'GLXY' AND at.status IN ('developing', 'monitoring')
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

Assessment is **directional relative to the signal**. The automated scoring above only determines relevance (score). Human judgement (this skill) determines direction.

**Step 1 — Check for neutral indicators:** phrases like `no evidence`, `no change`, `no new`, `status quo`, `unchanged`, `no significant`, `no notable`, `no material`.

**Step 2 — Determine direction:**

| Condition | Assessment |
|-----------|-----------|
| score = 0 OR neutral indicators found | `neutral` |
| Evidence moves signal *closer* to triggering | `strengthening` |
| Evidence moves signal *further* from triggering | `weakening` |
| Signal condition definitively met | `confirmed` |
| Signal condition definitively ruled out | `invalidated` |

**Key principle for warning signals:** `strengthening` means the risk is growing (bad for thesis); `weakening` means the risk is receding (good for thesis). For example, an SEC ruling reducing enforcement risk is `weakening` for an enforcement warning signal — not `strengthening`.

Use `confirmed` / `invalidated` conservatively — only when the content contains clear, unambiguous evidence that the signal's stated condition has been definitively met or ruled out.

---

## Step 5: Assess Each Signal

For each signal, produce:
- **Assessment**: `neutral` | `strengthening` | `confirmed` | `weakening` | `invalidated`
- **Confidence**: `high` | `medium` | `low`
- **Key findings**: bullet list of specific evidence from content (skip if `neutral`)
- **Relevant quotes**: direct quotes from source (skip if `neutral`)
- **Evidence summary** (1-2 sentences): plain text for `signal_data_snapshots.evidence_summary`
- **Recommendation**: what action, if any, to take

---

## Step 6: Write signal_data_snapshots Rows

Write a qualitative snapshot for **every** assessed signal (including `neutral` entries — this keeps the timeline complete, consistent with `generateQualitativeSnapshots()`).

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
    "assessment": "strengthening",
    "evidenceSummary": "Galaxy's Helios data centre reached 300MW operational capacity, ahead of 250MW target cited in signal.",
    "intelligenceItemId": null,
    "dataSource": "qualitative",
    "reportId": null
  }
]
```

**Important:** `dataSource` must be `'qualitative'` (not `'thesis_monitor'` — that's only for automated world-monitor ingestion).

---

## Step 6a: Write claim_signal_evidences Links

If the content being assessed originated from a **research claim** (i.e., a `main_claims` record exists for this content — check if a `claimId` was passed as context, or if the content was uploaded via `finalize-for-upload` and has a corresponding claim), write a row to `claim_signal_evidences` for each signal that received a non-neutral assessment.

This creates a navigable link between the claim and the signals it provides evidence for.

```bash
cd /Users/home-hub/projects/trade-journal
cat > scripts/tmp-claim-signal-evidences.ts << 'SCRIPT'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const { db, closeDb, schema } = await import('./lib/db.js');
  const { sql } = await import('drizzle-orm');
  const evidences = {{EVIDENCES_JSON}};
  for (const ev of evidences) {
    await db.insert(schema.claimSignalEvidences).values(ev)
      .onConflictDoUpdate({
        target: [schema.claimSignalEvidences.claimId, schema.claimSignalEvidences.signalId],
        set: { assessment: sql`excluded.assessment`, snapshotId: sql`excluded.snapshot_id` },
      });
  }
  console.log(JSON.stringify({ success: true, count: evidences.length }));
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
SCRIPT
npx tsx scripts/tmp-claim-signal-evidences.ts
rm scripts/tmp-claim-signal-evidences.ts
```

Replace `{{EVIDENCES_JSON}}` with an array like:

```json
[
  {
    "claimId": "<main_claims uuid>",
    "signalId": "<signal uuid>",
    "assessment": "strengthening",
    "snapshotId": null
  }
]
```

**Rules:**
- Only write links for signals with non-neutral assessments (strengthening, confirmed, weakening, invalidated)
- If `snapshotId` is available from the Step 6 insert (e.g., via RETURNING), include it; otherwise set to `null`
- Uses upsert — safe to re-run; updates assessment if the claim-signal pair already exists
- Skip this step entirely if no claim ID is available (e.g., content was pasted inline without a research source)

### Write signal/claim_evidenced journal entries

After writing `claim_signal_evidences` rows, write a journal entry for each row written (skip neutral assessments):

```bash
cd /Users/home-hub/projects/trade-journal

# Repeat for each (claim × signal) pair with non-neutral assessment:
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type signal \
  --id {{SIGNAL_ID}} \
  --note "Claim evidenced ({{assessment}}): \"{{claim_title}}\". Source: {{content_title}}."
```

Example message:
```
Claim evidenced (strengthening): "Dollar debasement accelerating as reserve share falls". Source: Luke Gromen — Feb 2026 interview.
```

---

## Step 6b: Add Journal Entry Per Signal Assessed

After writing snapshots, write a journal entry for **each** signal that received an assessment other than `neutral`. This provides narrative traceability on each signal's Journal tab.

```bash
cd /Users/home-hub/projects/trade-journal

# Repeat for each assessed signal (skip neutral signals):
npx tsx scripts/ops/add-journal-note.ts \
  --entity-type signal \
  --id {{SIGNAL_ID}} \
  --note "Evidence assessment ({{assessment}}): {{1-2 sentence evidence_summary from the snapshot}}. Source: {{content title or filename}}."
```

**Rules:**
- Skip signals with `neutral` assessment — they add noise without value
- The `--note` should include the assessment level and the evidence summary you wrote to the snapshot
- Use `--entity-type signal` (not `macro_thesis` or `asset_thesis`)
- Source should identify the content that was assessed (file name, article title, or URL)

---

## Step 6c: Write Thesis-Level signal_evidence_received Journal Entries

After writing signal-level journal entries, write **thesis-level** `signal_evidence_received` journal entries for each signal with a non-neutral assessment. These entries appear on the thesis Journal tab and provide the primary audit trail for evidence arriving against thesis signals.

```bash
cd /Users/home-hub/projects/trade-journal
cat > scripts/tmp-signal-evidence-journal.ts << 'SCRIPT'
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function main() {
  const { db, closeDb, schema, logToJournal } = await import('./lib/db.js');
  const entries = {{ENTRIES_JSON}};
  const batchId = crypto.randomUUID();
  for (const entry of entries) {
    await logToJournal({ ...entry, batchId });
  }
  console.log(JSON.stringify({ success: true, count: entries.length }));
  await closeDb();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
SCRIPT
npx tsx scripts/tmp-signal-evidence-journal.ts
rm scripts/tmp-signal-evidence-journal.ts
```

Replace `{{ENTRIES_JSON}}` with an array like:

```json
[
  {
    "objectType": "asset_thesis",
    "objectId": "<thesis-uuid>",
    "objectTitle": "Thesis Title",
    "actionType": "signal_evidence_received",
    "actionDescription": "Signal \"Helios reaches 300MW\" received strengthening evidence from research routing",
    "source": "skill",
    "metadata": {
      "signalId": "<signal-uuid>",
      "assessment": "strengthening",
      "dataSource": "qualitative"
    }
  }
]
```

**Rules:**
- `objectType` = `'macro_thesis'` or `'asset_thesis'` (the parent thesis, not the signal)
- `objectId` = the thesis ID (from Step 1)
- `actionType` = `'signal_evidence_received'` (always this value)
- `source` = `'skill'` (this skill is invoked by a skill or human)
- `metadata.signalId` = the signal UUID
- `metadata.assessment` = the assessment from the snapshot
- `metadata.dataSource` = `'qualitative'` (matching the snapshot data_source)
- `metadata.claimId` = include if a claim ID is available (from Step 6a)
- Skip signals with `neutral` assessment
- One entry per signal x thesis pair

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
**Type**: confirmation | invalidation
**Importance**: critical | significant | supporting
**Assessment**: Neutral | Strengthening | Confirmed | Weakening | Invalidated
**Confidence**: high | medium | low

**Key Findings**:
- [Specific finding from content]
- [Another finding with specifics — numbers, dates, quotes]

**Relevant Quotes**:
> "[Direct quote from content]"

**Recommendation**: [Update status? Flag for review? No action?]

---

[Repeat for each signal. For neutral signals, list them in a summary section at the end.]

### Signals with Neutral Assessment (N of M assessed)
- [signal statement] (importance: critical/significant/supporting)
- ...

---

### Summary
- **Signals assessed**: N total (M confirmation, K warning)
- **Confirmed / Invalidated**: N
- **Strengthening / Weakening**: N
- **Neutral**: N
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
  "journalEntriesWritten": 5,
  "assessments": [
    {
      "signalId": "<uuid>",
      "statement": "<signal statement>",
      "type": "confirmation|invalidation",
      "importance": "critical|significant|supporting",
      "assessment": "strengthening|confirmed|weakening|invalidated|neutral",
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
- **Write snapshots for ALL signals**, including `neutral` — the timeline completeness matters
- `dataSource` = `'qualitative'` for this skill (vs `'thesis_monitor'` for automated world-monitor runs)
- Assessment scale (`neutral | strengthening | confirmed | weakening | invalidated`) matches `signal_data_snapshots.assessment` column
- **Do NOT automatically update signal status** — only write snapshots and journal notes. Status changes require user review.
- This skill can be run repeatedly against the same thesis with different content — each run adds new snapshot rows
- `psql-query.ts` is **read-only** — use temp scripts for inserts
- **Write `claim_signal_evidences`** links when a claim ID is available — this enables navigating from claims to signals and vice versa

## Relationship to Other Skills

- **`process-inbox`** — calls this skill inline when routing to `signal_evidence` or `both` routes
- **`thesis-monitor`** — similar qualitative assessment but automated; uses `data_source = 'thesis_monitor'`
- **`configure-signal`** — sets up the `monitorKeywords` in `explicit_details` that this skill reads
