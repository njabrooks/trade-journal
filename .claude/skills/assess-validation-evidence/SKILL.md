# assess-validation-evidence

**Type:** managed
**Description:** Assess content (SEC filings, presentations, transcripts) against existing validation points to identify evidence of validation/invalidation. Use when you have a thesis with validation points and want to check if new content provides evidence of movement toward validation or invalidation.

## Workflow

1. **User provides:**
   - Thesis identifier (ticker, or macro/asset thesis ID)
   - Content to analyze (file path or text)

2. **Skill fetches:**
   - All validation points for the thesis (from Supabase)
   - Content from provided source

3. **Skill analyzes:**
   - Cross-references content against each validation point
   - Identifies specific evidence supporting or contradicting each point
   - Assesses significance and confidence
   - Extracts relevant quotes/data

4. **Skill outputs:**
   - Markdown report with findings for each validation point
   - Evidence categorized as: strong validation, weak validation, neutral, weak invalidation, strong invalidation
   - Recommendations for status updates
   - Suggested monitoring events to record

5. **User workflow:**
   - Review evidence
   - Update validation point statuses via UI
   - Record monitoring events
   - Take strategic actions as needed

## Usage

```bash
/assess-validation-evidence <thesis-identifier> <content-source>
```

**Thesis identifier can be:**
- `ticker:SYMBOL` - Find asset thesis by ticker (e.g., `ticker:GLXY`)
- `asset:<uuid>` - Direct asset thesis ID
- `macro:<uuid>` - Direct macro thesis ID

**Examples:**

```bash
# Assess SEC filing against GLXY thesis (by ticker)
/assess-validation-evidence ticker:GLXY ~/Desktop/galaxy-presentation.html

# Assess local presentation file (by thesis ID)
/assess-validation-evidence asset:7ce262f7-45c6-4a22-b2ab-11e6a532c3ca ~/Downloads/presentation.pdf

# Assess macro thesis with direct text
/assess-validation-evidence macro:abc123-def456 "Paste content here..."
```

**Note:** For SEC.gov URLs, download the HTML file first using curl with proper User-Agent header, as SEC blocks automated access without proper identification.

## Output Format

The skill generates a markdown report:

```markdown
# Validation Evidence Assessment

**Thesis:** [Thesis Title]
**Content Source:** [URL/File]
**Assessed:** [Timestamp]

---

## Summary
- X validation points assessed
- Y points with significant evidence found
- Z points suggest status updates

---

## Validation Point 1: [Statement]
**Current Status:** monitoring
**Type:** validation
**Importance:** critical

### Evidence Found
**Assessment:** Strong Validation Evidence
**Confidence:** High

**Key Findings:**
- [Specific finding with quote/data]
- [Specific finding with quote/data]

**Relevant Quotes:**
> "[Direct quote from content]"
> "[Another relevant quote]"

**Recommendation:** Update status to "triggered" - threshold appears met

---

## Validation Point 2: [Statement]
**Current Status:** not_triggered
**Type:** invalidation
**Importance:** significant

### Evidence Found
**Assessment:** No Significant Evidence
**Confidence:** N/A

**Notes:**
No relevant information found in this content.

---

[... repeat for each validation point ...]

---

## Next Steps
1. Review validation points with significant evidence
2. Update statuses as appropriate via UI
3. Record monitoring events for audit trail
4. Consider strategic implications
```

## Implementation Notes

- Uses Supabase queries to fetch validation points (via `scripts/psql-query.ts`)
- Supports multiple content sources: URLs (via WebFetch), local files (via Read), or direct text
- Uses LLM to perform cross-reference analysis
- Does NOT automatically update database - user reviews and approves changes
- Output saved to local markdown file for review
- Can be run multiple times against same thesis with different content

## Database Queries

The skill needs to:

1. **Fetch thesis details:**
```sql
SELECT id, title, type, status, conviction
FROM macro_theses
WHERE id = $1

-- OR

SELECT id, title, ticker, status, conviction
FROM asset_theses
WHERE id = $1
```

2. **Fetch validation points:**
```sql
SELECT
  id, statement, type, category, importance, status,
  rationale, timeframe,
  explicit_details, judgment_details, response_protocol,
  created_at, updated_at
FROM validation_points
WHERE thesis_id = $1 AND thesis_type = $2
ORDER BY importance DESC, type ASC
```

## Skill Parameters

- `thesis_type` (required): "macro" or "asset"
- `thesis_id` (required): UUID of thesis
- `content_source` (required): URL, file path, or text content
- `--output` (optional): Custom output path for markdown report (default: `~/Desktop/validation-assessment-{timestamp}.md`)

## Example Session

```
User: /assess-validation-evidence asset clxyz123 https://sec.gov/Archives/edgar/data/1844971/000184497124000012/glxy-20241211.htm

Claude: I'll assess that SEC filing against the Galaxy Digital asset thesis validation points.

[Fetches validation points from Supabase]
Found 9 validation points for thesis "Galaxy Digital: Bitcoin infrastructure play"

[Fetches SEC filing content]
Retrieved 8-K filing from December 11, 2024

[Analyzes content against each validation point]
Analyzing evidence for each validation point...

✓ Assessment complete

I've generated a validation evidence assessment report at:
~/Desktop/validation-assessment-2026-01-05-143022.md

**Key Findings:**

🟢 **Strong Validation Evidence (3 points)**
- "Bitcoin adoption accelerates" - Corporate presentation shows 75% revenue from digital assets
- "Institutional demand grows" - Q3 assets under management up 45% QoQ
- "Regulatory clarity improves" - References new SEC framework

⚠️ **Weak Invalidation Evidence (1 point)**
- "Energy costs remain competitive" - Helios data center power costs up 12%

📊 **Neutral/No Evidence (5 points)**
- Other points had no relevant information in this filing

**Recommended Actions:**
1. Review strong validation evidence for points #2, #5, #7
2. Consider updating statuses from "monitoring" → "triggered"
3. Record monitoring event with this filing as source
4. Investigate energy cost increase (point #8)

Would you like me to help update any validation point statuses?
```

## Notes

- This skill complements `process-transcript` (discovery) with targeted validation (assessment)
- Designed for monitoring workflow - evidence feeds into status updates
- Does not create new validation points - only assesses existing ones
- Can be run repeatedly as new content becomes available
- Output provides audit trail for why statuses were updated
