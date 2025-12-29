# Integration Plan: Local Claude Workflow ↔ App Research Workflow

**Created**: 2025-12-26
**Status**: Planning
**Goal**: Enable seamless integration between local Claude Code research workflow and web app research workflow

---

## Executive Summary

This plan details how to integrate the local Claude Code research workflow (forensic Toulmin claim extraction) with the app's research workflow (macro theses and asset thesiss). The integration will preserve hierarchical claim structures, enable manual claim-to-thesis/view conversion, and support round-trip enhancement between local and app environments.

**Key Changes**:
1. **Schema Enhancement**: Preserve hierarchical Toulmin claim structure in `research_insights.key_claims`
2. **Upload Workflow**: Streamlined audit upload from local files
3. **UI Development**: Claims browser with convert-to-thesis/view functionality
4. **Draft State**: Allow claims to exist without immediate conversion
5. **Round-Trip Enhancement**: Support local deep-dive → app → local cycle

---

## Current State Analysis

### What Works Today

**Local Claude Workflow** ✅
- `/process-transcript` skill produces forensic audits with Toulmin structure
- `/synthesize-claims` cross-references against hierarchy
- `/deep-dive` develops claims into full theses/views
- All work git-trackable, zero API costs

**App Workflow** ✅
- Research artifacts storage
- AI recommendations system (hierarchy analysis)
- Create/accept recommendations → theses/views
- Research mappings for provenance

### What Doesn't Work

**Schema Limitation** ❌
- Current `research_insights.key_claims` JSONB is flat structure
- Cannot preserve hierarchical Toulmin relationships:
  - Main claims → supporting evidence claims
  - Main claims → rebutting evidence claims
  - Evidence hierarchy

**Upload Gap** ❌
- No streamlined path from local audit files → app
- Database timeouts on large batch uploads
- No claim-level conversion UI

**Integration Gap** ❌
- Cannot browse individual claims in app
- Cannot convert claims → theses/views while preserving evidence
- No draft state for claims
- No round-trip enhancement workflow

---

## Workflow Vision

### Full Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL CLAUDE WORKFLOW                        │
├─────────────────────────────────────────────────────────────────┤
│ 1. Drop transcript → 1-transcripts/                             │
│ 2. /process-transcript → 2-audits/ (Toulmin claims)            │
│ 3. /synthesize-claims → 3-syntheses/ (cross-reference)         │
│ 4. User reviews synthesis recommendations                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ UPLOAD AUDIT
┌─────────────────────────────────────────────────────────────────┐
│                      APP RESEARCH WORKFLOW                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Upload audit → research_artifact + research_insight          │
│    - All main claims preserved with Toulmin structure           │
│    - Supporting/rebutting evidence references intact            │
│                                                                  │
│ 2. Browse claims in UI:                                         │
│    - View hierarchical claim structure                          │
│    - Expand supporting/rebutting evidence                       │
│    - See confidence, categories, time horizons                  │
│                                                                  │
│ 3. Manual conversion (claim-by-claim):                          │
│    ┌─────────────────────────────────────────────────┐         │
│    │ For Each Main Claim:                            │         │
│    │  - Keep as draft (no action)                    │         │
│    │  - Convert to macro thesis → creates record     │         │
│    │  - Convert to asset thesis → creates record       │         │
│    │  - Full Toulmin structure transferred           │         │
│    └─────────────────────────────────────────────────┘         │
│                                                                  │
│ 4. Theses/views exist in app:                                   │
│    - Linked to source claims via research_mappings              │
│    - Provenance preserved                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ ENHANCE (optional)
┌─────────────────────────────────────────────────────────────────┐
│                  LOCAL CLAUDE WORKFLOW (ROUND 2)                 │
├─────────────────────────────────────────────────────────────────┤
│ 1. /deep-dive on thesis/view (reference existing record)        │
│ 2. Develop additional evidence, challenge assumptions           │
│ 3. Output → 4-deep-dives/enhanced-analysis.md                   │
│ 4. Upload enhancement as new insight linked to thesis/view      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schema Enhancement

### Current Schema (Flat)

```typescript
// src/db/schema.ts (CURRENT)
export const researchInsights = pgTable('research_insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  researchArtifactId: uuid('research_artifact_id').references(() => researchArtifacts.id),
  summary: text('summary').notNull(),
  keyThemes: text('key_themes').array(),
  keyClaims: jsonb('key_claims'), // ← FLAT, LOSES HIERARCHY
  supportingEvidence: jsonb('supporting_evidence'),
  counterEvidence: jsonb('counter_evidence'),
  relevantTickers: text('relevant_tickers').array(),
  timeHorizon: text('time_horizon'),
  confidenceLevel: text('confidence_level'),
  humanReviewNotes: text('human_review_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**Current JSONB Example**:
```json
{
  "claims": [
    {
      "claim": "AI will drive PMI expansion",
      "evidence": "Capex spending up 300%",
      "confidence": "medium"
    }
  ]
}
```

**Problem**: No hierarchy, no Toulmin structure, no evidence relationships.

### Enhanced Schema (Hierarchical Toulmin)

```typescript
// src/db/schema.ts (PROPOSED)
export const researchInsights = pgTable('research_insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  researchArtifactId: uuid('research_artifact_id').references(() => researchArtifacts.id),
  summary: text('summary').notNull(),
  keyThemes: text('key_themes').array(),

  // NEW: Hierarchical Toulmin structure
  claimsStructure: jsonb('claims_structure'), // ← NEW FIELD

  // DEPRECATED (keep for migration compatibility)
  keyClaims: jsonb('key_claims'),
  supportingEvidence: jsonb('supporting_evidence'),
  counterEvidence: jsonb('counter_evidence'),

  relevantTickers: text('relevant_tickers').array(),
  timeHorizon: text('time_horizon'),
  confidenceLevel: text('confidence_level'),
  humanReviewNotes: text('human_review_notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### New JSONB Schema: `claims_structure`

```typescript
// Type definition for claims_structure JSONB
interface ClaimsStructure {
  main_claims: MainClaim[];
  evidence_claims: EvidenceClaim[];
  metadata: {
    extraction_date: string;
    source_skill: string; // "/process-transcript"
    toulmin_version: string; // "1.0"
  };
}

interface MainClaim {
  id: string; // "claim-1"
  level: "main";
  type: "thesis_candidate" | "view_candidate";
  category: "macro" | "asset_specific";

  // Toulmin Framework
  claim: string; // The main assertion
  grounds: string; // Evidence (what we called "Evidence" in audit)
  warrant: string; // Reasoning (what we called "Reasoning" in audit)
  backing: string; // Additional support (what we called "Backing" in audit)
  qualifier: "high" | "medium" | "low" | "exploratory"; // Confidence
  rebuttal: string; // Counter-arguments

  // Metadata
  time_horizon?: "long_term" | "medium_term" | "short_term";
  relevant_tickers?: string[]; // For asset_specific claims

  // Hierarchical References
  supporting_evidence_claims: string[]; // IDs like ["claim-19", "claim-20"]
  rebutting_evidence_claims: string[]; // IDs like ["claim-25"]

  // Conversion Tracking
  converted_to?: {
    type: "macro_thesis" | "asset_view";
    id: string; // UUID of created thesis/view
    converted_at: string; // ISO timestamp
  };
}

interface EvidenceClaim {
  id: string; // "claim-19"
  level: "evidence";
  type: "supporting" | "rebutting";

  // Simplified Toulmin (evidence claims don't need full structure)
  claim: string;
  grounds?: string; // Optional additional context
  confidence: "high" | "medium" | "low";

  // References
  supports_main_claims: string[]; // Which main claims this supports
}
```

### Example Enhanced JSONB

```json
{
  "main_claims": [
    {
      "id": "claim-1",
      "level": "main",
      "type": "thesis_candidate",
      "category": "macro",
      "claim": "AI will drive US PMI expansion and reflation in 2025-2026",
      "grounds": "AI infrastructure capex driving manufacturing orders, datacenter construction accelerating, semiconductor demand increasing",
      "warrant": "Massive capex spending flows through to PMI surveys as equipment orders, construction activity, and manufacturing demand",
      "backing": "Historical correlation between tech capex cycles and PMI expansion (2010-2012, 2016-2018)",
      "qualifier": "medium",
      "rebuttal": "AI efficiency gains could reduce physical infrastructure needs; automation may not translate to traditional PMI metrics",
      "time_horizon": "medium_term",
      "supporting_evidence_claims": ["claim-19", "claim-20", "claim-34"],
      "rebutting_evidence_claims": [],
      "converted_to": null
    },
    {
      "id": "claim-2",
      "level": "main",
      "type": "view_candidate",
      "category": "asset_specific",
      "claim": "Industrials will outperform as AI drives PMI expansion",
      "grounds": "Caterpillar, Deere exposed to datacenter construction; electrical equipment manufacturers benefit",
      "warrant": "PMI expansion typically drives industrial equity outperformance",
      "backing": "2010-2011: Industrials +25% during PMI recovery; 2016-2017: +18%",
      "qualifier": "medium",
      "rebuttal": "Valuations already elevated; automation may limit labor/equipment needs",
      "time_horizon": "medium_term",
      "relevant_tickers": ["CAT", "DE", "EMR"],
      "supporting_evidence_claims": ["claim-21", "claim-22"],
      "rebutting_evidence_claims": ["claim-23"],
      "converted_to": null
    }
  ],
  "evidence_claims": [
    {
      "id": "claim-19",
      "level": "evidence",
      "type": "supporting",
      "claim": "US datacenter construction spending up 40% YoY in Q3 2024",
      "grounds": "Census Bureau construction spending data",
      "confidence": "high",
      "supports_main_claims": ["claim-1", "claim-2"]
    },
    {
      "id": "claim-20",
      "level": "evidence",
      "type": "supporting",
      "claim": "Semiconductor equipment orders (SEMI billings) up 25% YoY",
      "grounds": "SEMI North America equipment billings report",
      "confidence": "high",
      "supports_main_claims": ["claim-1"]
    },
    {
      "id": "claim-23",
      "level": "evidence",
      "type": "rebutting",
      "claim": "CAT forward P/E at 18x, above 10-year average of 14x",
      "grounds": "Bloomberg terminal data",
      "confidence": "high",
      "supports_main_claims": ["claim-2"]
    }
  ],
  "metadata": {
    "extraction_date": "2025-12-21",
    "source_skill": "/process-transcript",
    "toulmin_version": "1.0"
  }
}
```

---

## Database Migration

### Migration Strategy

**Option A: Additive Migration (Recommended)**
- Add new `claims_structure` column
- Keep old columns (`key_claims`, `supporting_evidence`, `counter_evidence`)
- Migrate existing data with transformation script
- Deprecate old columns in future release

**Option B: Clean Migration**
- Add `claims_structure` column
- Drop old columns immediately
- Requires reprocessing all existing insights

**Recommendation**: **Option A** for backward compatibility during transition.

### Migration SQL

```sql
-- Add new column
ALTER TABLE research_insights
ADD COLUMN claims_structure JSONB;

-- Add index for performance
CREATE INDEX idx_research_insights_claims_structure
ON research_insights USING GIN (claims_structure);

-- Migration script will transform existing key_claims → claims_structure
-- (Run via TypeScript script, not raw SQL)
```

### Migration Script: `scripts/migrate-claims-structure.ts`

```typescript
import { db } from '@/db';
import { researchInsights } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function migrateClaimsStructure() {
  console.log('Starting claims structure migration...');

  // Fetch all insights with old format
  const insights = await db
    .select()
    .from(researchInsights)
    .where(eq(researchInsights.claimsStructure, null)); // Only unmigrated

  console.log(`Found ${insights.length} insights to migrate`);

  for (const insight of insights) {
    try {
      const oldClaims = insight.keyClaims as any;
      const oldSupporting = insight.supportingEvidence as any;
      const oldCounter = insight.counterEvidence as any;

      // Transform to new structure
      const newStructure = transformToClaimsStructure(
        oldClaims,
        oldSupporting,
        oldCounter
      );

      // Update record
      await db
        .update(researchInsights)
        .set({ claimsStructure: newStructure })
        .where(eq(researchInsights.id, insight.id));

      console.log(`✓ Migrated insight ${insight.id}`);
    } catch (error) {
      console.error(`✗ Failed to migrate insight ${insight.id}:`, error);
    }
  }

  console.log('Migration complete!');
}

function transformToClaimsStructure(
  oldClaims: any,
  oldSupporting: any,
  oldCounter: any
) {
  // Transform old flat structure to new hierarchical structure
  const mainClaims = (oldClaims?.claims || []).map((c: any, idx: number) => ({
    id: `claim-${idx + 1}`,
    level: 'main',
    type: 'thesis_candidate', // Default, may need manual review
    category: 'macro',
    claim: c.claim || '',
    grounds: c.evidence || '',
    warrant: c.reasoning || '',
    backing: '',
    qualifier: c.confidence || 'medium',
    rebuttal: '',
    supporting_evidence_claims: [],
    rebutting_evidence_claims: [],
    converted_to: null,
  }));

  const evidenceClaims = [
    ...(oldSupporting || []).map((e: any, idx: number) => ({
      id: `evidence-${idx + 1}`,
      level: 'evidence',
      type: 'supporting',
      claim: e.evidence || e.claim || '',
      confidence: e.confidence || 'medium',
      supports_main_claims: [], // Cannot infer, needs manual review
    })),
    ...(oldCounter || []).map((e: any, idx: number) => ({
      id: `counter-${idx + 1}`,
      level: 'evidence',
      type: 'rebutting',
      claim: e.evidence || e.claim || '',
      confidence: e.confidence || 'medium',
      supports_main_claims: [],
    })),
  ];

  return {
    main_claims: mainClaims,
    evidence_claims: evidenceClaims,
    metadata: {
      extraction_date: new Date().toISOString().split('T')[0],
      source_skill: 'migration',
      toulmin_version: '1.0',
    },
  };
}

migrateClaimsStructure();
```

**Run Migration**:
```bash
npx tsx scripts/migrate-claims-structure.ts
```

---

## Upload Workflow

### Upload Skill Enhancement: `/finalize-for-upload`

Update existing skill to handle audit files with new structure.

**Current Behavior**:
- Auto-detects content type (artifact, insight, thesis, view)
- Uploads single entity

**New Behavior**:
- Detect audit files (frontmatter: `type: audit`)
- Upload as `research_artifact` + `research_insight` with `claims_structure`
- Preserve all main claims and evidence claims
- No automatic thesis/view creation (manual in app)

**Enhanced Skill Logic**:

```typescript
// .claude/skills/finalize-for-upload/instructions.md

// NEW: Detect audit files
if (frontmatter.type === 'audit') {
  // Upload transcript as artifact
  const artifact = await uploadArtifact({
    title: frontmatter.title,
    sourceType: frontmatter.source_type || 'transcript',
    sourceUrl: frontmatter.source_url,
    content: transcriptContent, // Original transcript
    tags: frontmatter.tags || [],
  });

  // Upload audit as insight with claims_structure
  const insight = await uploadInsight({
    researchArtifactId: artifact.id,
    summary: frontmatter.summary,
    keyThemes: extractedThemes,
    claimsStructure: {
      main_claims: parsedMainClaims,
      evidence_claims: parsedEvidenceClaims,
      metadata: {
        extraction_date: frontmatter.analyzed_date,
        source_skill: '/process-transcript',
        toulmin_version: '1.0',
      },
    },
    // Old fields for compatibility
    keyClaims: legacyFormat(parsedMainClaims),
    supportingEvidence: legacyFormat(parsedEvidenceClaims.filter(supporting)),
    counterEvidence: legacyFormat(parsedEvidenceClaims.filter(rebutting)),
    relevantTickers: extractedTickers,
    timeHorizon: inferTimeHorizon(parsedMainClaims),
    confidenceLevel: inferConfidence(parsedMainClaims),
  });

  return {
    artifactId: artifact.id,
    insightId: insight.id,
    mainClaimsCount: parsedMainClaims.length,
    evidenceClaimsCount: parsedEvidenceClaims.length,
    message: 'Audit uploaded successfully. View in app to convert claims.',
  };
}
```

### API Endpoint: Upload Audit

**New Route**: `/api/research/upload-audit`

```typescript
// src/app/api/research/upload-audit/route.ts

import { db } from '@/db';
import { researchArtifacts, researchInsights } from '@/db/schema';

export async function POST(request: Request) {
  const { auditContent, metadata } = await request.json();

  // Parse audit markdown
  const parsed = parseAuditMarkdown(auditContent);

  // 1. Create artifact
  const [artifact] = await db
    .insert(researchArtifacts)
    .values({
      title: parsed.title,
      sourceType: parsed.sourceType,
      sourceUrl: parsed.sourceUrl,
      content: parsed.transcriptContent,
      tags: parsed.tags,
      status: 'structured',
    })
    .returning();

  // 2. Create insight with claims_structure
  const [insight] = await db
    .insert(researchInsights)
    .values({
      researchArtifactId: artifact.id,
      summary: parsed.summary,
      keyThemes: parsed.themes,
      claimsStructure: {
        main_claims: parsed.mainClaims,
        evidence_claims: parsed.evidenceClaims,
        metadata: {
          extraction_date: parsed.analyzedDate,
          source_skill: '/process-transcript',
          toulmin_version: '1.0',
        },
      },
      relevantTickers: parsed.tickers,
      timeHorizon: parsed.timeHorizon,
      confidenceLevel: parsed.confidence,
    })
    .returning();

  return Response.json({
    success: true,
    artifactId: artifact.id,
    insightId: insight.id,
    mainClaimsCount: parsed.mainClaims.length,
    evidenceClaimsCount: parsed.evidenceClaims.length,
  });
}

function parseAuditMarkdown(content: string) {
  // Parse frontmatter
  // Extract main claims with Toulmin structure
  // Extract evidence claims
  // Extract metadata
  // Return structured data
}
```

---

## UI Development

### Component 1: Claims Browser

**Location**: `/src/components/research/ClaimsBrowser.tsx`

**Purpose**: Display all main claims from an insight with hierarchical structure.

```tsx
'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ClaimsBrowserProps {
  insightId: string;
  claimsStructure: {
    main_claims: MainClaim[];
    evidence_claims: EvidenceClaim[];
  };
  onConvertToThesis: (claimId: string) => void;
  onConvertToView: (claimId: string) => void;
}

export function ClaimsBrowser({
  insightId,
  claimsStructure,
  onConvertToThesis,
  onConvertToView,
}: ClaimsBrowserProps) {
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());

  const toggleClaim = (claimId: string) => {
    const newExpanded = new Set(expandedClaims);
    if (newExpanded.has(claimId)) {
      newExpanded.delete(claimId);
    } else {
      newExpanded.add(claimId);
    }
    setExpandedClaims(newExpanded);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Claims ({claimsStructure.main_claims.length} main)
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (expandedClaims.size === claimsStructure.main_claims.length) {
              setExpandedClaims(new Set());
            } else {
              setExpandedClaims(
                new Set(claimsStructure.main_claims.map((c) => c.id))
              );
            }
          }}
        >
          {expandedClaims.size === claimsStructure.main_claims.length
            ? 'Collapse All'
            : 'Expand All'}
        </Button>
      </div>

      <div className="space-y-3">
        {claimsStructure.main_claims.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            evidenceClaims={claimsStructure.evidence_claims}
            isExpanded={expandedClaims.has(claim.id)}
            onToggle={() => toggleClaim(claim.id)}
            onConvertToThesis={() => onConvertToThesis(claim.id)}
            onConvertToView={() => onConvertToView(claim.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ClaimCard({
  claim,
  evidenceClaims,
  isExpanded,
  onToggle,
  onConvertToThesis,
  onConvertToView,
}: {
  claim: MainClaim;
  evidenceClaims: EvidenceClaim[];
  isExpanded: boolean;
  onToggle: () => void;
  onConvertToThesis: () => void;
  onConvertToView: () => void;
}) {
  const supportingEvidence = evidenceClaims.filter((e) =>
    claim.supporting_evidence_claims.includes(e.id)
  );
  const rebuttingEvidence = evidenceClaims.filter((e) =>
    claim.rebutting_evidence_claims.includes(e.id)
  );

  const isConverted = !!claim.converted_to;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={onToggle}
          className="flex items-start gap-2 flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 mt-0.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={claim.type === 'thesis_candidate' ? 'default' : 'secondary'}>
                {claim.type === 'thesis_candidate' ? 'Thesis' : 'View'}
              </Badge>
              <Badge variant="outline">{claim.category}</Badge>
              <Badge variant="outline" className="capitalize">
                {claim.qualifier} confidence
              </Badge>
              {claim.time_horizon && (
                <Badge variant="outline">{claim.time_horizon.replace('_', ' ')}</Badge>
              )}
              {claim.relevant_tickers && claim.relevant_tickers.length > 0 && (
                <Badge variant="secondary">
                  {claim.relevant_tickers.join(', ')}
                </Badge>
              )}
              {isConverted && (
                <Badge variant="success">
                  Converted to {claim.converted_to.type.replace('_', ' ')}
                </Badge>
              )}
            </div>
            <p className="font-medium text-sm">{claim.claim}</p>
          </div>
        </button>

        {!isConverted && (
          <div className="flex gap-2 flex-shrink-0">
            {claim.type === 'thesis_candidate' && (
              <Button
                size="sm"
                variant="default"
                onClick={onConvertToThesis}
              >
                Convert to Thesis
              </Button>
            )}
            {claim.type === 'view_candidate' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onConvertToView}
              >
                Convert to View
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="pl-7 space-y-4 text-sm">
          {/* Toulmin Structure */}
          <div className="space-y-2">
            <div>
              <span className="font-semibold">Evidence (Grounds): </span>
              <span className="text-muted-foreground">{claim.grounds}</span>
            </div>
            <div>
              <span className="font-semibold">Reasoning (Warrant): </span>
              <span className="text-muted-foreground">{claim.warrant}</span>
            </div>
            {claim.backing && (
              <div>
                <span className="font-semibold">Backing: </span>
                <span className="text-muted-foreground">{claim.backing}</span>
              </div>
            )}
            {claim.rebuttal && (
              <div>
                <span className="font-semibold">Rebuttal: </span>
                <span className="text-muted-foreground">{claim.rebuttal}</span>
              </div>
            )}
          </div>

          {/* Supporting Evidence */}
          {supportingEvidence.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">
                Supporting Evidence ({supportingEvidence.length})
              </h4>
              <ul className="space-y-1.5">
                {supportingEvidence.map((evidence) => (
                  <li key={evidence.id} className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 flex-shrink-0">
                      {evidence.confidence}
                    </Badge>
                    <span className="text-muted-foreground">{evidence.claim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rebutting Evidence */}
          {rebuttingEvidence.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">
                Counter-Evidence ({rebuttingEvidence.length})
              </h4>
              <ul className="space-y-1.5">
                {rebuttingEvidence.map((evidence) => (
                  <li key={evidence.id} className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5 flex-shrink-0">
                      {evidence.confidence}
                    </Badge>
                    <span className="text-muted-foreground">{evidence.claim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isConverted && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Converted to {claim.converted_to.type.replace('_', ' ')} on{' '}
                {new Date(claim.converted_to.converted_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Component 2: Convert Claim Dialog

**Location**: `/src/components/research/ConvertClaimDialog.tsx`

**Purpose**: Convert a claim to thesis or view with confirmation and editing.

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';

interface ConvertClaimDialogProps {
  open: boolean;
  onClose: () => void;
  claim: MainClaim;
  targetType: 'macro_thesis' | 'asset_view';
  onConfirm: (data: ConversionData) => Promise<void>;
}

export function ConvertClaimDialog({
  open,
  onClose,
  claim,
  targetType,
  onConfirm,
}: ConvertClaimDialogProps) {
  const [formData, setFormData] = useState({
    title: claim.claim.slice(0, 100), // Truncate to reasonable title length
    description: `${claim.grounds}\n\n${claim.warrant}`,
    thesisType: 'secular', // For macro thesis
    viewType: 'bullish', // For asset thesis
    ticker: claim.relevant_tickers?.[0] || '', // For asset thesis
    timeHorizon: claim.time_horizon || 'medium_term',
    conviction: claim.qualifier,
    notes: claim.backing ? `Backing: ${claim.backing}\n\nRebuttal: ${claim.rebuttal}` : '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(formData);
      onClose();
    } catch (error) {
      console.error('Conversion failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Convert to {targetType === 'macro_thesis' ? 'Macro Thesis' : 'Asset Thesis'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <Label>Title</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter title..."
            />
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              placeholder="Enter description..."
            />
          </div>

          {/* Type-Specific Fields */}
          {targetType === 'macro_thesis' && (
            <div>
              <Label>Thesis Type</Label>
              <Select
                value={formData.thesisType}
                onValueChange={(value) => setFormData({ ...formData, thesisType: value })}
              >
                <option value="secular">Secular (5-20 years)</option>
                <option value="cyclical">Cyclical (1-5 years)</option>
                <option value="structural">Structural (3-10 years)</option>
                <option value="tactical">Tactical (&lt;1 year)</option>
              </Select>
            </div>
          )}

          {targetType === 'asset_view' && (
            <>
              <div>
                <Label>Ticker</Label>
                <Input
                  value={formData.ticker}
                  onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                  placeholder="NVDA"
                />
              </div>
              <div>
                <Label>View Type</Label>
                <Select
                  value={formData.viewType}
                  onValueChange={(value) => setFormData({ ...formData, viewType: value })}
                >
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                  <option value="complex">Complex</option>
                </Select>
              </div>
            </>
          )}

          {/* Time Horizon */}
          <div>
            <Label>Time Horizon</Label>
            <Select
              value={formData.timeHorizon}
              onValueChange={(value) => setFormData({ ...formData, timeHorizon: value })}
            >
              <option value="long_term">Long Term</option>
              <option value="medium_term">Medium Term</option>
              <option value="short_term">Short Term</option>
            </Select>
          </div>

          {/* Conviction */}
          <div>
            <Label>Conviction</Label>
            <Select
              value={formData.conviction}
              onValueChange={(value) => setFormData({ ...formData, conviction: value })}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="exploratory">Exploratory</option>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              placeholder="Additional notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Converting...' : 'Convert'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Component 3: Updated Research Detail Page

**Location**: `/src/app/research/[id]/page.tsx`

**Changes**: Add Claims Browser section.

```tsx
// ADD after InsightReview component

{insight && insight.claimsStructure && (
  <div className="space-y-4">
    <h2 className="text-2xl font-bold">Claims</h2>
    <ClaimsBrowser
      insightId={insight.id}
      claimsStructure={insight.claimsStructure}
      onConvertToThesis={(claimId) => handleConvertClaim(claimId, 'macro_thesis')}
      onConvertToView={(claimId) => handleConvertClaim(claimId, 'asset_view')}
    />
  </div>
)}

// ADD handler function
const [convertDialogOpen, setConvertDialogOpen] = useState(false);
const [selectedClaim, setSelectedClaim] = useState<MainClaim | null>(null);
const [targetType, setTargetType] = useState<'macro_thesis' | 'asset_view'>('macro_thesis');

function handleConvertClaim(claimId: string, type: 'macro_thesis' | 'asset_view') {
  const claim = insight.claimsStructure.main_claims.find((c) => c.id === claimId);
  if (!claim) return;

  setSelectedClaim(claim);
  setTargetType(type);
  setConvertDialogOpen(true);
}

async function handleConfirmConversion(data: ConversionData) {
  const response = await fetch(`/api/research/convert-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      insightId: insight.id,
      claimId: selectedClaim.id,
      targetType,
      ...data,
    }),
  });

  if (response.ok) {
    // Refresh page to show updated claim
    router.refresh();
  }
}
```

---

## API Endpoints

### Endpoint 1: Convert Claim

**Route**: `/api/research/convert-claim`

**Purpose**: Convert a main claim to macro thesis or asset thesis.

```typescript
// src/app/api/research/convert-claim/route.ts

import { db } from '@/db';
import { researchInsights, macroTheses, assetTheses, underlyings, researchMappings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const {
    insightId,
    claimId,
    targetType,
    ...conversionData
  } = await request.json();

  // 1. Fetch insight
  const [insight] = await db
    .select()
    .from(researchInsights)
    .where(eq(researchInsights.id, insightId));

  if (!insight) {
    return Response.json({ error: 'Insight not found' }, { status: 404 });
  }

  const claimsStructure = insight.claimsStructure as any;
  const claim = claimsStructure.main_claims.find((c: any) => c.id === claimId);

  if (!claim) {
    return Response.json({ error: 'Claim not found' }, { status: 404 });
  }

  if (claim.converted_to) {
    return Response.json({ error: 'Claim already converted' }, { status: 400 });
  }

  // 2. Create thesis or view
  let createdEntity;

  if (targetType === 'macro_thesis') {
    [createdEntity] = await db
      .insert(macroTheses)
      .values({
        title: conversionData.title,
        description: conversionData.description,
        thesisType: conversionData.thesisType,
        timeHorizon: conversionData.timeHorizon,
        confidenceLevel: conversionData.conviction,
        notes: conversionData.notes,
        status: 'active',
      })
      .returning();
  } else {
    // For asset thesis, get or create underlying
    const [underlying] = await db
      .select()
      .from(underlyings)
      .where(eq(underlyings.ticker, conversionData.ticker));

    if (!underlying) {
      return Response.json({ error: 'Underlying not found' }, { status: 404 });
    }

    [createdEntity] = await db
      .insert(assetTheses)
      .values({
        underlyingId: underlying.id,
        title: conversionData.title,
        description: conversionData.description,
        viewType: conversionData.viewType,
        timeHorizon: conversionData.timeHorizon,
        confidenceLevel: conversionData.conviction,
        notes: conversionData.notes,
        status: 'active',
      })
      .returning();
  }

  // 3. Create research mapping
  await db.insert(researchMappings).values({
    researchInsightId: insightId,
    entityType: targetType,
    entityId: createdEntity.id,
    mappingType: 'creates',
    notes: `Converted from claim: ${claimId}`,
  });

  // 4. Update claim in claims_structure
  claim.converted_to = {
    type: targetType,
    id: createdEntity.id,
    converted_at: new Date().toISOString(),
  };

  await db
    .update(researchInsights)
    .set({ claimsStructure })
    .where(eq(researchInsights.id, insightId));

  return Response.json({
    success: true,
    entityType: targetType,
    entityId: createdEntity.id,
    claim: claim,
  });
}
```

---

## Testing Plan

### Phase 1: Schema Migration Testing

1. **Backup Production Data**
   ```bash
   pg_dump <supabase-url> > backup-$(date +%Y%m%d).sql
   ```

2. **Test Migration Script Locally**
   - Run against dev database
   - Verify all insights migrated
   - Check transformed structure is valid

3. **Deploy to Production**
   - Run migration during low-traffic window
   - Monitor for errors
   - Rollback plan: restore from backup

### Phase 2: Upload Workflow Testing

1. **Test Audit Upload**
   - Upload `2-audits/2025-12-21-apps-to-agents-audit.md`
   - Verify artifact + insight created
   - Verify claims_structure populated correctly
   - Check all 18 main claims present

2. **Test Claim Browsing**
   - Navigate to research detail page
   - Verify ClaimsBrowser renders
   - Expand/collapse claims
   - Check evidence claims displayed

3. **Test Claim Conversion**
   - Click "Convert to Thesis" on Claim 1
   - Fill out form, submit
   - Verify thesis created
   - Verify research_mapping created
   - Verify claim marked as converted

### Phase 3: Round-Trip Testing

1. **Local → App**
   - Process transcript locally
   - Upload audit
   - Convert claim to thesis in app
   - Verify full provenance

2. **App → Local → App**
   - From app, note thesis ID
   - Run `/deep-dive` locally referencing thesis
   - Enhance with additional evidence
   - Upload enhancement
   - Verify linked to original thesis

---

## Rollout Plan

### Week 1: Schema & Migration
- ✅ Add `claims_structure` column to `research_insights`
- ✅ Write migration script
- ✅ Test on dev database
- ✅ Deploy to production

### Week 2: Upload Workflow
- ✅ Enhance `/finalize-for-upload` skill
- ✅ Create `/api/research/upload-audit` endpoint
- ✅ Test with apps-to-agents audit
- ✅ Verify all 18 claims uploaded

### Week 3: UI Components
- ✅ Build `ClaimsBrowser` component
- ✅ Build `ConvertClaimDialog` component
- ✅ Update research detail page
- ✅ Create `/api/research/convert-claim` endpoint

### Week 4: Integration Testing
- ✅ End-to-end test: local → app → local
- ✅ Test claim conversion workflow
- ✅ Test provenance chain
- ✅ Document workflows

### Week 5: Refinement
- ⚠️ Gather feedback
- ⚠️ Fix bugs
- ⚠️ Optimize UI/UX
- ⚠️ Add filtering/sorting to claims browser

---

## Success Metrics

**Technical**:
- ✅ 100% of audit claims preserved in `claims_structure`
- ✅ Zero data loss during migration
- ✅ < 2s page load for claims browser (with 20+ claims)
- ✅ Conversion API < 500ms response time

**Workflow**:
- ✅ Upload audit in < 30 seconds
- ✅ Convert claim to thesis in < 2 minutes
- ✅ Full round-trip (local → app → local) in < 10 minutes

**User Experience**:
- ✅ Clear visual hierarchy (main claims → evidence)
- ✅ One-click conversion to thesis/view
- ✅ Provenance preserved (can trace thesis back to source claim)
- ✅ Draft state supported (claims can remain unconverted)

---

## Future Enhancements

### Phase 2: Bulk Operations
- **Bulk Convert**: Select multiple claims, convert all at once
- **Claim Merging**: Merge similar claims before conversion
- **Template Application**: Apply thesis/view templates during conversion

### Phase 3: Enhanced Cross-Referencing
- **Duplicate Detection**: Warn when claim similar to existing thesis
- **Auto-Linking**: Suggest parent theses for new claims
- **Conflict Detection**: Flag claims that contradict existing views

### Phase 4: Collaborative Features
- **Claim Comments**: Discussion threads on individual claims
- **Vote on Conviction**: Team voting on confidence levels
- **Claim Status**: Track which claims need review, which are approved

### Phase 5: Advanced Analytics
- **Claim Network Graph**: Visualize claim relationships
- **Evidence Strength Scoring**: Quantify strength of Toulmin structure
- **Conversion Funnel**: Track claim → thesis/view conversion rates

---

## Appendix: Example Workflow Session

### Complete End-to-End Example

```bash
# ════════════════════════════════════════════════════════════════
# LOCAL: Claude Code Workflow
# ════════════════════════════════════════════════════════════════

# 1. Drop transcript
cp ~/Downloads/podcast-transcript.txt research-workspace/1-transcripts/2025-12-26-ai-infra.md

# 2. Process with forensic extraction
/process-transcript 1-transcripts/2025-12-26-ai-infra.md
# → Output: 2-audits/2025-12-26-ai-infra-audit.md (12 main claims, 23 evidence claims)

# 3. Cross-reference against hierarchy
/synthesize-claims 2-audits/2025-12-26-ai-infra-audit.md
# → Output: 3-syntheses/2025-12-26-ai-infra-synthesis.md
# → Recommendations:
#    - Claim 3: Create NEW "AI Infrastructure Bottleneck" thesis (high priority)
#    - Claim 7: Add to EXISTING "NVDA: AI Accelerator Dominance" view (medium)
#    - Claim 11: Keep as DRAFT (exploratory confidence)

# 4. Upload audit to app
/finalize-for-upload 2-audits/2025-12-26-ai-infra-audit.md
# → ✅ Uploaded successfully
#    Artifact ID: abc-123
#    Insight ID: xyz-789
#    Main Claims: 12
#    Evidence Claims: 23
# → Go to app: https://app.com/research/xyz-789

# ════════════════════════════════════════════════════════════════
# APP: Web UI Workflow
# ════════════════════════════════════════════════════════════════

# 5. Browse claims in app
# Navigate to /research/xyz-789
# See ClaimsBrowser with 12 main claims

# 6. Convert Claim 3 to macro thesis
# Click "Convert to Thesis" on Claim 3
# Dialog opens with pre-filled data:
#   Title: "AI Infrastructure Bottleneck: Power & Cooling Constraints"
#   Description: [Grounds + Warrant from Toulmin structure]
#   Thesis Type: structural
#   Time Horizon: medium_term
#   Conviction: medium
# Click "Convert"
# → ✅ Thesis created (ID: thesis-456)
# → ✅ Research mapping created (insight xyz-789 → thesis thesis-456)
# → ✅ Claim 3 marked as converted

# 7. Keep Claim 11 as draft
# Do nothing — claim remains in insight, not converted
# Can convert later when confidence increases

# 8. Enhance existing view with Claim 7
# Click "Convert to View" on Claim 7
# Pre-filled with NVDA ticker
# Convert to view
# → ✅ View created, linked to existing NVDA view as related

# ════════════════════════════════════════════════════════════════
# LOCAL: Enhancement Workflow (Round 2)
# ════════════════════════════════════════════════════════════════

# 9. Deep dive on newly created thesis
/deep-dive "AI Infrastructure Bottleneck"
# → Claude queries database, finds thesis-456
# → "I found existing thesis 'AI Infrastructure Bottleneck' (ID: thesis-456)"
# → "Would you like to ENHANCE it or CREATE a related thesis?"

# User: "Enhance it. I want to add more evidence on grid capacity limits."

# → Interactive deep dive session
# → Add 5 more evidence points
# → Challenge assumptions with counter-evidence
# → Output: 4-deep-dives/ai-infrastructure-bottleneck-enhanced.md

# 10. Upload enhancement
/finalize-for-upload 4-deep-dives/ai-infrastructure-bottleneck-enhanced.md
# → Detects thesis enhancement (frontmatter has thesis_id: thesis-456)
# → Creates new research_insight linked to thesis
# → Updates thesis notes with enhancement summary
# → ✅ Enhancement uploaded, linked to thesis-456

# ════════════════════════════════════════════════════════════════
# APP: View Enhanced Thesis
# ════════════════════════════════════════════════════════════════

# 11. Navigate to thesis detail page
# /theses/thesis-456
# See:
#   - Original description from Claim 3 conversion
#   - Research mappings showing:
#     * Source claim (xyz-789 → Claim 3)
#     * Enhancement insight (deep-dive)
#   - Evidence count: 5 supporting, 2 rebutting
#   - Conviction: medium → high (strengthened by enhancement)

# ✅ Full provenance chain preserved
# ✅ Local + app workflows integrated
# ✅ Round-trip enhancement successful
```

---

## Document Status

**Version**: 1.0
**Status**: Planning Complete
**Next Actions**:
1. Review with user
2. Prioritize implementation phases
3. Begin Week 1: Schema & Migration

**Questions for User**:
1. Does this workflow match your vision?
2. Any missing pieces in the UI/UX?
3. Should we proceed with Week 1 implementation?
