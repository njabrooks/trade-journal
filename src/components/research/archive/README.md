# Archived Research Components

This directory contains components from the **OLD in-app AI processing workflow** that have been deprecated in favor of the **NEW local-first claims workflow**.

## Archived Date
- Initial archival: December 26, 2025 (old in-app AI workflow)
- Updated: December 29, 2025 (ClaimsBrowser unified)

## Reason for Archival
These components implemented workflows that have been replaced with better approaches:

### Old In-App AI Workflow (archived Dec 26, 2025)
These components implemented a workflow where:
1. Raw research was uploaded to the app
2. AI processing happened in-app (ProcessButton)
3. AI generated recommendations (HierarchyRecommendationsPanel)
4. Users manually created mappings (MappingsSection)

This workflow was replaced with a local-first approach:
1. AI processing happens locally in Claude Code (`/process-transcript`)
2. Structured claims are uploaded to the app
3. Users browse and convert claims directly
4. Provenance is tracked automatically

### JSONB-Based ClaimsBrowser (archived Dec 29, 2025)
The original `ClaimsBrowser.tsx` component worked with JSONB `claims_structure` from `research_insights` table.
This was replaced with `UnifiedClaimsBrowser` which:
1. Works with normalized `main_claims` table (single source of truth)
2. Provides consistent UI for both "all claims" and "single artifact claims" views
3. Supports optional filtering by artifact ID for single-source display
4. Eliminates duplicate UI code between two different claims browsing components

## Archived Components

### Old Workflow UI
- `ProcessButton.tsx` - In-app AI processing trigger
- `AnalyzeHierarchyButton.tsx` - In-app hierarchy analysis trigger
- `HierarchyRecommendationsPanel.tsx` - AI-generated recommendations display
- `RecommendationCard.tsx` - Individual recommendation cards
- `CreateThesisFromRecommendation.tsx` - Create thesis from AI recommendation
- `CreateAssetViewFromRecommendation.tsx` - Create view from AI recommendation

### Old Data Display
- `InsightReview.tsx` - Legacy insight format (pre-claims structure)
- `EvidenceDisplay.tsx` - Legacy evidence display
- `ClaimsBrowser.tsx` - JSONB-based claims browser (replaced by UnifiedClaimsBrowser)

### Old Manual Mapping
- `MappingsSection.tsx` - Manual research-to-hierarchy mappings
- `MappingsList.tsx` - Display of manual mappings
- `AddMappingDialog.tsx` - Dialog for adding manual mappings

## Current Workflow Components

The active components for the new workflow are:
- `UnifiedClaimsBrowser.tsx` - Unified claims browser (works for all claims or filtered by artifact)
- `ConvertClaimToEntityDialog.tsx` - Convert claims to theses/views (from main_claims table)
- `WorkflowStatusCard.tsx` - Progress checklist
- `EmptyClaimsState.tsx` - Guidance for empty state

## References
- See `/docs/research-ux-overhaul-proposal.md` for full context
- See `/docs/claims-workflow-guide.md` for workflow documentation

## Can These Be Deleted?
Yes, but they're archived for historical reference. They can be safely deleted if git history is sufficient for recovery.
