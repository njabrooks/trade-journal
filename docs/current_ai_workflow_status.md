# Current AI Research Workflow Status

**Last Updated**: 2025-12-22
**Status**: All Phases Complete ✅

## Overview

This document explains how the three AI prompts are used in the application. **All three prompts are now fully implemented and active!** ✅

The complete workflow: Extract insights → Analyze hierarchy → Generate recommendations → Accept/reject recommendations

---

## The Three Prompts

### 1. ✅ `insight_extraction` - **IMPLEMENTED & ACTIVE**

**Purpose**: Extract structured insights from raw research content

**Where It's Used**:
- `src/lib/services/ai-research.ts` → `extractInsights()` function
- Triggered when user clicks "Process with AI" button on research detail page
- Called via `processResearchArtifact()` function

**Current Flow**:
1. User uploads research artifact (raw text/URL)
2. User clicks "Process with AI" button
3. System fetches `insight_extraction` prompt from database
4. Prompt is rendered with `{{artifact.*}}` variables
5. AI processes the prompt and returns structured JSON
6. System saves structured insights to `research_insights` table

**Output**: Creates a `ResearchInsight` record with:
- Summary
- Key themes
- Key claims
- Supporting/counter evidence
- Time horizon
- Confidence level
- Relevant tickers

**Status**: ✅ **Fully functional**

---

### 2. ✅ `hierarchy_analysis` - **IMPLEMENTED & ACTIVE**

**Purpose**: Analyze research insights against existing macro theses and asset views to determine relationships

**Where It's Used**:
- Service: `src/lib/services/ai-hierarchy-analysis.ts` ✅
- API endpoint: `/api/research/analyze-hierarchy` ✅
- Triggered when user clicks "Analyze Hierarchy" button

**Current Flow**:
1. After insight extraction completes
2. User clicks "Analyze Hierarchy" button
3. System fetches all existing macro theses and asset views
4. System fetches `hierarchy_analysis` prompt from database
5. Prompt is rendered with:
   - `{{insight.summary}}`
   - `{{insight.keyThemes}}`
   - `{{insight.keyClaims}}`
   - `{{insight.relevantTickers}}`
   - `{{existingTheses}}` (JSON array)
   - `{{existingViews}}` (JSON array)
6. AI analyzes and returns analysis JSON
7. System then runs `recommendation_generation` prompt
8. Recommendations stored in `research_hierarchy_recommendations` table ✅

**Output**: Creates recommendation records with analysis results

**Status**: ✅ **Fully functional - Phase 2 Complete**

---

### 3. ✅ `recommendation_generation` - **IMPLEMENTED & ACTIVE**

**Purpose**: Generate specific recommendations for creating new theses/views or linking to existing ones

**Where It's Used**:
- Part of hierarchy analysis service (`ai-hierarchy-analysis.ts`) ✅
- Runs immediately after `hierarchy_analysis` prompt
- Generates actionable recommendations

**Current Flow**:
1. After hierarchy analysis completes
2. System fetches `recommendation_generation` prompt from database
3. Prompt is rendered with:
   - `{{insight.summary}}`
   - `{{existingTheses}}`
   - `{{existingViews}}`
4. AI generates recommendations in JSON format
5. Recommendations parsed and stored in `research_hierarchy_recommendations` table ✅

**Output**: Creates recommendation records with:
- `recommendation_type`: 'new_macro_thesis' | 'new_asset_view' | 'link_existing' | 'refute_existing'
- Proposed data for new items (title, description, etc.)
- Existing item references for linking
- Confidence scores
- Reasoning

**Status**: ✅ **Fully functional - Phase 2 Complete**

---

## Current Manual Workflow

Since Phase 2 is not implemented, users must manually link research to the hierarchy:

### Step 1: Process Research ✅
- User uploads research
- Clicks "Process with AI"
- System extracts insights using `insight_extraction` prompt
- Insights displayed on research detail page

### Step 2: Manually Link to Hierarchy ✅
- User clicks "+ Link to Hierarchy" button
- `AddMappingDialog` opens
- User manually selects:
  - Hierarchy level (thesis/view/strategy)
  - Existing item from dropdown
  - Evidence type (supports/refutes/neutral/exploratory)
  - Confidence level
- System creates `research_mappings` record

### Step 3: Create New Theses/Views (Separate Process) ✅
- User must navigate to `/theses` or `/asset-views` pages
- Create new thesis/view manually (or via Supabase console)
- Then return to research page to link it

**Limitation**: No way to create new theses/views directly from research insights. User must create them separately first.

---

## What Was Implemented (Phase 2 & 3) ✅

### 1. Hierarchy Analysis Service ✅
**File**: `src/lib/services/ai-hierarchy-analysis.ts` ✅

**Does**:
- Fetches all existing theses and views
- Uses `hierarchy_analysis` prompt
- Analyzes insights against existing hierarchy
- Then uses `recommendation_generation` prompt
- Returns and stores recommendations

### 2. Recommendation Generation ✅
**Part of**: Hierarchy analysis service ✅

**Does**:
- Uses `recommendation_generation` prompt
- Generates specific recommendations
- Stores in `research_hierarchy_recommendations` table

### 3. Database Table ✅
**Table**: `research_hierarchy_recommendations` ✅ (created via Supabase MCP)

**Schema**: Complete with all fields including:
- recommendation_type, proposed_data, existing_thesis_id, existing_view_id
- mapping_type, confidence_score, reasoning
- status, ai_model, generated_at
- accepted_at, rejected_at, modified_by_user

### 4. API Endpoint ✅
**Endpoint**: `POST /api/research/analyze-hierarchy` ✅

**Does**:
- Accepts `insightId` and optional `model` parameter
- Runs hierarchy analysis
- Generates recommendations
- Returns recommendations array

### 5. UI Components ✅
**Components** (all implemented):
- `HierarchyRecommendationsPanel` ✅ - Display recommendations
- `RecommendationCard` ✅ - Individual recommendation with actions
- Auto-create functionality ✅ - Built into accept action

**Allows**:
- View AI recommendations grouped by status
- Accept recommendation → Auto-creates thesis/view or mapping ✅
- Reject recommendation ✅
- Modify recommendation (marks as modified) ✅

---

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| `insight_extraction` prompt | ✅ Active | Used in `ai-research.ts` |
| `hierarchy_analysis` prompt | ✅ Active | Used in `ai-hierarchy-analysis.ts` |
| `recommendation_generation` prompt | ✅ Active | Used in `ai-hierarchy-analysis.ts` |
| Manual linking workflow | ✅ Functional | `AddMappingDialog` works |
| AI recommendations | ✅ Implemented | Phase 2 Complete |
| Create from recommendations | ✅ Implemented | Phase 3 Complete |
| Recommendations UI | ✅ Functional | Full accept/reject/modify workflow |

---

## Completed Implementation ✅

The full AI research workflow is now complete:

1. **Phase 2.5.2**: ✅ Hierarchy analysis service implemented
   - ✅ Created `ai-hierarchy-analysis.ts`
   - ✅ Created `research_hierarchy_recommendations` table (via Supabase MCP)
   - ✅ Created `/api/research/analyze-hierarchy` endpoint
   - ✅ Added "Analyze Hierarchy" button to research detail page

2. **Phase 2.5.3**: ✅ Recommendation UI built
   - ✅ Created recommendation components (`HierarchyRecommendationsPanel`, `RecommendationCard`)
   - ✅ Added accept/reject/modify workflows
   - ✅ Auto-create theses/views when recommendations accepted
   - ✅ Integrated into research detail page

**All three prompts are now active and working together!**

---

## Testing the Current System

### Test Insight Extraction:
1. Go to `/research/upload`
2. Upload some research content
3. Go to research detail page
4. Click "Process with AI"
5. Verify insights are extracted and displayed

### Test Manual Linking:
1. After processing, click "+ Link to Hierarchy"
2. Select an existing thesis/view/strategy
3. Choose evidence type and confidence
4. Submit
5. Verify mapping appears in mappings list

### Test Prompt Management:
1. Go to `/admin/prompts`
2. View/edit the three prompts
3. Test prompts with sample data
4. Verify changes affect AI processing

