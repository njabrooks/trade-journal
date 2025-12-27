# Claims Parser Integration Guide

## Overview

The `parseClaimsMarkdown` function converts forensic audit markdown (from `/process-transcript` skill) into the structured JSON format expected by the ClaimsBrowser component.

## Parser Location

```
src/lib/research/parseClaimsMarkdown.ts
```

## Usage in Scripts

```typescript
import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';

// Read audit file
const auditContent = await fs.readFile('path/to/audit.md', 'utf-8');

// Parse to JSON
const claimsStructure = parseClaimsMarkdown(auditContent);

// claimsStructure is now ready for database insertion
await db.insert(researchInsights).values({
  claimsStructure: claimsStructure,
  // ... other fields
});
```

## Integration into `/finalize-for-upload` Skill

The skill needs to detect when uploading an audit file and automatically parse claims structure.

### Detection Logic

When the user uploads a file with:
1. Frontmatter contains `audit_date` field
2. OR filename matches pattern `*-audit.md`
3. OR frontmatter contains `total_claims` / `main_claims` / `evidence_claims` fields

→ This is an audit file requiring claims parsing

### Updated Skill Flow

```
User: /finalize-for-upload research-workspace/2-audits/my-audit.md

↓

1. Read file and parse frontmatter
2. Detect file type:
   - Has audit_date → AUDIT file
   - Has source_type → ARTIFACT file
   - Has ticker → ASSET VIEW
   - Has thesis_type → MACRO THESIS

3. For AUDIT files:
   a. Parse claims structure using parseClaimsMarkdown()
   b. Create insight with claimsStructure field
   c. Link to existing artifact OR create new artifact if missing

4. For other file types:
   - Follow existing upload logic
```

### Example Code for Skill

```typescript
// Inside finalize-for-upload skill logic

import { parseClaimsMarkdown } from '../src/lib/research/parseClaimsMarkdown.js';

// After reading file
const frontmatter = parseFrontmatter(fileContent);

// Detect audit file
const isAudit = frontmatter.audit_date ||
                frontmatter.total_claims ||
                filename.includes('-audit.md');

if (isAudit) {
  console.log('📋 Detected audit file - parsing claims structure...');

  // Parse claims
  const claimsStructure = parseClaimsMarkdown(fileContent);

  console.log(`✅ Parsed ${claimsStructure.main_claims.length} main claims, ${claimsStructure.evidence_claims.length} evidence claims`);

  // Check if artifact already exists
  let artifactId = frontmatter.artifact_id;

  if (!artifactId && frontmatter.source_transcript) {
    // Look for existing artifact by searching for transcript
    const transcriptPath = frontmatter.source_transcript;
    // Query database for artifact with matching title or source
    artifactId = await findArtifactByTranscript(transcriptPath);
  }

  if (!artifactId) {
    console.log('⚠️  No existing artifact found. Creating placeholder artifact...');
    // Create minimal artifact
    const artifact = await db.insert(researchArtifacts).values({
      title: frontmatter.title || 'Research Artifact',
      sourceType: 'transcript',
      rawContent: '(Audit uploaded without original transcript)',
      status: 'raw',
    }).returning();

    artifactId = artifact.id;
  }

  // Create insight with claims structure
  const insight = await db.insert(researchInsights).values({
    researchArtifactId: artifactId,
    summary: frontmatter.summary || generateSummaryFromClaims(claimsStructure),
    keyThemes: extractThemesFromClaims(claimsStructure),
    claimsStructure: claimsStructure, // ← Parsed JSON structure
    timeHorizon: frontmatter.time_horizon || 'medium_term',
    confidenceLevel: frontmatter.confidence_level || 'medium',
    relevantTickers: extractTickersFromClaims(claimsStructure),
    structuredBy: 'ai',
    aiModel: frontmatter.processed_by || 'process-transcript',
  }).returning();

  // Update artifact status
  await db.update(researchArtifacts)
    .set({ status: 'structured' })
    .where({ id: artifactId });

  console.log(`✅ Insight created: ${insight.id}`);
  console.log(`🔗 View at: http://localhost:3000/research/${insight.id}`);
}
```

## Helper Functions for Skill

```typescript
/**
 * Generate summary from claims structure
 */
function generateSummaryFromClaims(claims: ClaimsStructure): string {
  const mainCount = claims.main_claims.length;
  const evidenceCount = claims.evidence_claims.length;
  const thesisCount = claims.main_claims.filter(c => c.type === 'thesis_candidate').length;
  const viewCount = claims.main_claims.filter(c => c.type === 'view_candidate').length;

  return `Forensic audit with ${mainCount} main claims (${thesisCount} thesis candidates, ${viewCount} view candidates) and ${evidenceCount} evidence claims.`;
}

/**
 * Extract themes from claims
 */
function extractThemesFromClaims(claims: ClaimsStructure): string[] {
  const themes = new Set<string>();

  claims.main_claims.forEach(claim => {
    // Extract key concepts from claim title
    const words = claim.title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4); // Only meaningful words

    words.forEach(w => themes.add(w));
  });

  return Array.from(themes).slice(0, 10); // Top 10 themes
}

/**
 * Extract all tickers mentioned in claims
 */
function extractTickersFromClaims(claims: ClaimsStructure): string[] {
  const tickers = new Set<string>();

  claims.main_claims.forEach(claim => {
    claim.tickers.forEach(t => {
      if (t && t !== 'N/A') tickers.add(t);
    });
  });

  return Array.from(tickers);
}
```

## Validation

The parser expects this markdown structure:

### Main Claims Section

```markdown
## Main Claims (Thesis/View Candidates)

### Claim 1: Title Here

**Level**: main
**Type**: thesis_candidate
**Category**: macro
**Tickers**: NVDA, TSLA
**Time Horizon**: medium_term
**Qualifier**: high

**Claim**:
The actual claim text...

**Evidence**:
- Evidence point 1
- Evidence point 2

**Reasoning**:
The reasoning paragraph...

**Backing**:
The backing paragraph...

**Rebuttal**:
- Rebuttal point 1
- Rebuttal point 2

**Supporting Evidence Claims**: claim-19, claim-20
**Rebutting Evidence Claims**: claim-30

---
```

### Evidence Claims Section

```markdown
## Evidence Claims (Supporting/Rebutting)

### Claim 19: Title Here

**Level**: evidence
**Type**: supporting
**Supports**: Claim 1 (context)

**Claim**:
The evidence claim text...

**Evidence**:
- Data point 1
- Data point 2

**Qualifier**: high

**Rebuttal**: Optional rebuttal text

---
```

## Output Structure

The parser produces:

```typescript
{
  main_claims: [
    {
      id: "claim-1",
      title: "AI Will Drive PMI Expansion...",
      level: "main",
      type: "thesis_candidate",
      category: "macro",
      tickers: ["NVDA", "TSLA"],
      time_horizon: "medium_term",
      qualifier: "high",
      claim: "AI adoption will drive...",
      evidence: ["Risk-on indicators...", "PMIs overlaid..."],
      reasoning: "The shift from centralized...",
      backing: "Previous cloud cycles...",
      rebuttal: ["PMI expansion assumes...", "Regulatory concerns..."],
      supporting_evidence_claims: ["claim-19", "claim-20"],
      rebutting_evidence_claims: []
    },
    // ... 17 more main claims
  ],
  evidence_claims: [
    {
      id: "claim-19",
      title: "Dollar Weakness Signals Reflation",
      level: "evidence",
      type: "supporting",
      supports: "Claim 1 (AI-driven PMI expansion)",
      claim: "MACD sell signal in dollar...",
      evidence: ["Dollar MACD potential sell...", "MSCI World ex-US rising..."],
      qualifier: "medium",
      rebuttal: "Technical indicators can give false signals"
    },
    // ... 59 more evidence claims
  ]
}
```

## Testing

Test the parser:

```bash
npx tsx scripts/upload-audit-with-claims.ts
```

Expected output:
```
Parsing claims structure from markdown...
✅ Parsed 18 main claims, 60 evidence claims
Creating research artifact...
✅ Artifact created: [UUID]
Creating research insight with claims structure...
✅ Insight created: [UUID]
✅ Artifact status updated to "structured"

📊 Upload Summary:
────────────────────────────────────────────────────────────
Artifact ID: [UUID]
Insight ID:  [UUID]
Title:       From Apps to Agents: Why 2026 Is the Real AI Inflection Point
Claims:      18 main, 60 evidence (78 total)
Tickers:     CSCO, MU, NVDA, TSLA, BTC, ORCL, GOOGL, MSFT, META, AMD, IWM

✅ Ready to browse in app at:
   http://localhost:3000/research/[UUID]
```

## Next Steps for Skill Integration

1. Update `.claude/skills/finalize-for-upload/skill.md` with audit file detection logic
2. Add import for `parseClaimsMarkdown` in skill implementation
3. Add helper functions for summary/theme/ticker extraction
4. Test with multiple audit files to ensure robustness
5. Handle edge cases (malformed markdown, missing sections, etc.)

## Error Handling

The parser should handle:
- Missing sections (returns empty strings/arrays)
- Malformed frontmatter (parses body only)
- Inconsistent formatting (regex patterns are flexible)
- Extra whitespace (all text is trimmed)

If critical sections are missing, the parser will still return a valid structure with empty arrays rather than throwing errors.
