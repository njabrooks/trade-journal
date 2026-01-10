# Validation Assessment Workflow

**Status:** ✅ Implemented (Phase 3.2A + assess-validation-evidence skill)
**Created:** 2026-01-05
**Related:** [Thesis Synthesis & Monitoring](260107-thesis-synthesis-monitoring.md), [Research Workflow](251231-research-workflow.md)

## Overview

The Validation Assessment Workflow enables **top-down evidence evaluation** of content against existing thesis validation points. This complements the bottom-up research discovery workflow by specifically targeting validation/invalidation evidence in new content (SEC filings, presentations, transcripts, etc.).

## Conceptual Distinction

### Bottom-Up Discovery (process-transcript)
- **Purpose:** Extract ALL claims from content
- **Output:** Comprehensive audit of assertions with Toulmin framework
- **Use case:** Research ingestion, building evidence base
- **Flow:** Content → Claims → Link to existing theses/views → Build evidence

### Top-Down Validation (assess-validation-evidence)
- **Purpose:** Assess SPECIFIC validation points against content
- **Output:** Evidence assessment for each validation point
- **Use case:** Monitoring theses, tracking validation progress
- **Flow:** Validation Points + Content → Evidence assessment → Status updates

## Architecture

### Data Flow

```
Thesis with Validation Points
         ↓
User identifies new content (SEC filing, presentation, etc.)
         ↓
/assess-validation-evidence skill
         ↓
Fetch validation points from Supabase
         ↓
Analyze content against each point
         ↓
Generate evidence assessment report (markdown)
         ↓
User reviews findings
         ↓
Update validation point statuses (via UI)
         ↓
Record monitoring events for audit trail
```

### Components

1. **Claude Code Skill:** `assess-validation-evidence`
   - Location: `.claude/skills/assess-validation-evidence/`
   - Fetches validation points from database
   - Orchestrates LLM analysis
   - Generates markdown assessment report

2. **Database Script:** `scripts/assess-validation-evidence.ts`
   - Queries `validation_points` table
   - Loads content from URLs/files/text
   - Prepares data for LLM analysis
   - Outputs structured assessment report

3. **UI Integration:** Existing Phase 3.2A components
   - [ValidationPointsList.tsx](../../src/components/thesis-synthesis/ValidationPointsList.tsx) - Displays validation points with inline monitoring
   - [UpdateValidationStatusModal.tsx](../../src/components/thesis-synthesis/UpdateValidationStatusModal.tsx) - Status update workflow
   - [ManualCheckDialog.tsx](../../src/components/thesis-synthesis/ManualCheckDialog.tsx) - Record manual monitoring events

## Usage

### Basic Invocation

```bash
/assess-validation-evidence <thesis-type> <thesis-id> <content-source>
```

### Examples

```bash
# Assess SEC filing against asset thesis
/assess-validation-evidence asset clxyz123 https://sec.gov/Archives/edgar/data/1844971/000184497124000012/glxy-8k.htm

# Assess downloaded presentation
/assess-validation-evidence macro clxyz456 ~/Downloads/galaxy-corporate-presentation.pdf

# Assess pasted transcript
/assess-validation-evidence asset clxyz789 "Transcript content here..."
```

### Typical Workflow

1. **User discovers new content** (monitoring spec triggers, manual discovery)
2. **Run assessment:** `/assess-validation-evidence asset <id> <url>`
3. **Claude fetches validation points** from database
4. **Claude analyzes content** against each validation point
5. **Review generated report** (saved to Desktop by default)
6. **Update statuses** via UI based on evidence strength
7. **Record monitoring event** documenting the assessment

## Output Format

The skill generates a structured markdown report with:

### Summary Section
- Total validation points assessed
- Count by evidence type (strong/weak validation/invalidation)
- Points requiring review

### Evidence Sections (grouped by assessment type)

Each validation point includes:
- **Statement:** The validation point being assessed
- **Current Status:** not_triggered | monitoring | triggered | superseded
- **Assessment:** strong_validation | weak_validation | neutral | weak_invalidation | strong_invalidation
- **Confidence:** high | medium | low | none
- **Key Findings:** Bullet list of specific observations
- **Relevant Quotes:** Direct quotes from content supporting findings
- **Recommendation:** Suggested status update or action
- **Notes:** Additional context

### Next Steps Section
- Recommended actions based on findings
- Prioritization guidance
- Strategic implications

## Example Output

```markdown
# Validation Evidence Assessment

**Thesis:** Galaxy Digital: Bitcoin infrastructure play (GLXY)
**Content Source:** https://sec.gov/.../glxy-8k.htm
**Assessed:** 2026-01-05T14:30:22Z

---

## Summary
- Total Validation Points: 9
- Points with Significant Evidence: 3
- Strong Validation Evidence: 2
- Weak Validation Evidence: 1
- Neutral/No Evidence: 6

### Points Requiring Review
🟢 **Bitcoin adoption accelerates** (strong_validation)
🟢 **Institutional demand grows** (strong_validation)
🔵 **Energy costs remain competitive** (weak_validation)

---

## 🟢 Strong Validation Evidence

### Validation Point: Bitcoin adoption accelerates

**Type:** validation
**Importance:** critical
**Current Status:** monitoring
**Confidence:** high

**Key Findings:**
- Corporate presentation shows 75% of revenue from digital asset services (up from 62% in Q2)
- New institutional custody mandates signed with 3 Fortune 500 companies
- Trading volume up 120% YoY

**Relevant Quotes:**
> "Digital asset services now represent three-quarters of total revenue, reflecting accelerating institutional adoption"

> "We've onboarded significant new custody clients this quarter, including several Fortune 500 enterprises"

**Recommendation:** Update status to "triggered" - strong evidence of acceleration

---

[... additional validation points ...]

## Next Steps
1. Review strong validation evidence for points #2, #5
2. Consider updating statuses from "monitoring" → "triggered"
3. Record monitoring event with this filing as source
4. Evaluate strategic implications for position sizing
```

## Integration with Monitoring System

The assessment workflow integrates with Phase 3.2A monitoring:

### Manual Monitoring Flow
1. User creates monitoring spec for validation point
2. Monitoring check identifies new SEC filing
3. User clicks filing link → runs assessment
4. Evidence found → update validation point status
5. Record monitoring event → audit trail

### Automated Monitoring Flow (Future)
1. Scheduled monitoring check runs
2. New content detected (SEC filing, news, data)
3. Auto-trigger assessment for relevant validation points
4. Generate evidence summary → notify user
5. User reviews and approves status updates

## Database Tables

### validation_points
Stores thesis validation/invalidation criteria:
```sql
CREATE TABLE validation_points (
  id UUID PRIMARY KEY,
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL, -- 'macro' | 'asset'
  type TEXT NOT NULL,        -- 'validation' | 'invalidation'
  category TEXT NOT NULL,    -- 'explicit' | 'judgment_required'
  importance TEXT NOT NULL,  -- 'critical' | 'significant' | 'supporting'
  status TEXT NOT NULL,      -- 'not_triggered' | 'monitoring' | 'triggered' | 'superseded'
  statement TEXT NOT NULL,
  rationale TEXT,
  ...
);
```

### monitoring_specs
Defines monitoring configuration for validation points:
```sql
CREATE TABLE monitoring_specs (
  id UUID PRIMARY KEY,
  validation_point_id UUID REFERENCES validation_points(id),
  sources TEXT[] NOT NULL,    -- ['fred', 'news', 'price_iv', 'sec_filings']
  keywords TEXT[] NOT NULL,
  frequency TEXT NOT NULL,    -- 'daily' | 'weekly' | 'on_demand'
  enabled BOOLEAN DEFAULT true,
  ...
);
```

### monitoring_events
Audit trail of monitoring activities:
```sql
CREATE TABLE monitoring_events (
  id UUID PRIMARY KEY,
  monitoring_spec_id UUID REFERENCES monitoring_specs(id),
  checked_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  result_summary JSONB,
  user_assessment TEXT,
  ...
);
```

## Design Decisions

### Why Separate from process-transcript?

1. **Different Intent:**
   - process-transcript: exhaustive claim extraction (bottom-up)
   - assess-validation-evidence: targeted validation check (top-down)

2. **Different Output:**
   - process-transcript: comprehensive audit → upload to database
   - assess-validation-evidence: focused assessment → immediate action

3. **Different Workflow:**
   - process-transcript: research ingestion flow
   - assess-validation-evidence: monitoring/validation flow

### Why Not Auto-Update Database?

User review is intentional:
- Evidence interpretation requires judgment
- Multiple pieces of evidence may accumulate before triggering
- User may want to investigate further before updating status
- Audit trail should reflect conscious decisions, not automatic updates

### Why Markdown Output?

- Provides permanent record of assessment
- Easily shareable and archivable
- User can annotate and track over time
- Can be uploaded as research artifact if needed

## Future Enhancements

1. **Batch Assessment:** Assess multiple content sources against same validation points
2. **Comparative Analysis:** Track evidence trends over time
3. **Automatic Triggering:** Integration with monitoring specs to auto-run on new content
4. **Evidence Aggregation:** Combine assessments from multiple sources
5. **Confidence Scoring:** Quantitative scoring of validation progress
6. **Alert Thresholds:** Notify when accumulation of evidence suggests status update

## Related Documentation

- [Thesis Synthesis & Monitoring](260107-thesis-synthesis-monitoring.md) - Overall Phase 3.2 context
- [Research Workflow](251231-research-workflow.md) - Bottom-up discovery workflow
- [Data Sources Strategy](260104-data-sources-strategy.md) - Multi-source monitoring
- [CLAUDE.md](../../CLAUDE.md) - Skills reference

## Example Use Cases

### Use Case 1: SEC Filing Analysis
**Context:** Galaxy Digital (GLXY) files 8-K with corporate presentation
**Action:**
```bash
/assess-validation-evidence asset cm5abc123 https://sec.gov/.../glxy-8k.htm
```
**Outcome:** Identifies strong validation evidence for "institutional adoption" point, user updates status to "triggered"

### Use Case 2: Earnings Call Transcript
**Context:** Quarterly earnings call discusses regulatory developments
**Action:**
```bash
/assess-validation-evidence macro cm5xyz789 ~/Downloads/earnings-transcript.txt
```
**Outcome:** Finds weak invalidation evidence for "regulatory clarity improves" point, user keeps status as "monitoring" but notes concern

### Use Case 3: Economic Data Release
**Context:** Fed releases new labor market data
**Action:**
```bash
/assess-validation-evidence macro cm5def456 "Fed labor market report: unemployment 4.2%, continuing claims 1.85M, JOLTS openings 7.7M..."
```
**Outcome:** Mixed evidence - some validation, some invalidation. User records monitoring event with notes for next review.

## Testing

Test the skill with:

```bash
# Test database connectivity
npx tsx scripts/assess-validation-evidence.ts asset <test-thesis-id> "test content"

# Test with actual thesis (requires existing validation points)
/assess-validation-evidence asset <real-thesis-id> <sec-filing-url>
```

Verify:
- ✅ Validation points fetched correctly
- ✅ Content loaded from all source types (URL/file/text)
- ✅ Assessment report generated
- ✅ Output saved to specified location
- ✅ Report contains all expected sections
