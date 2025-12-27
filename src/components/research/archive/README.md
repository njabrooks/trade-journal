# Archived Research Components

This directory contains components from the **OLD in-app AI processing workflow** that have been deprecated in favor of the **NEW local-first claims workflow**.

## Archived Date
December 26, 2025

## Reason for Archival
These components implemented a workflow where:
1. Raw research was uploaded to the app
2. AI processing happened in-app (ProcessButton)
3. AI generated recommendations (HierarchyRecommendationsPanel)
4. Users manually created mappings (MappingsSection)

This workflow was replaced with a local-first approach:
1. AI processing happens locally in Claude Code (`/process-transcript`)
2. Structured claims are uploaded to the app
3. Users browse and convert claims directly (ClaimsBrowser)
4. Provenance is tracked automatically

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

### Old Manual Mapping
- `MappingsSection.tsx` - Manual research-to-hierarchy mappings
- `MappingsList.tsx` - Display of manual mappings
- `AddMappingDialog.tsx` - Dialog for adding manual mappings

## Current Workflow Components

The active components for the new workflow are:
- `ClaimsBrowser.tsx` - Browse hierarchical Toulmin claims
- `ConvertClaimDialog.tsx` - Convert claims to theses/views
- `WorkflowStatusCard.tsx` - Progress checklist
- `EmptyClaimsState.tsx` - Guidance for empty state

## References
- See `/docs/research-ux-overhaul-proposal.md` for full context
- See `/docs/claims-workflow-guide.md` for workflow documentation

## Can These Be Deleted?
Yes, but they're archived for historical reference. They can be safely deleted if git history is sufficient for recovery.
