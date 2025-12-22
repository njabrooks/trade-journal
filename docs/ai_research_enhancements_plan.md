# AI Research Enhancements: Multi-Model Support & Intelligent Hierarchy Proposals

**Status**: Phase 0, 1, 2 & 3 Complete
**Created**: 2025-12-22
**Last Updated**: 2025-12-22

---

## Overview

Enhance the AI research processing system to:
1. Support multiple AI models (Claude, ChatGPT, Google Gemini)
2. Analyze research insights against existing macro theses and asset views
3. Propose new theses/views or recommend linking to existing ones
4. Provide UI for accepting/rejecting AI recommendations
5. **Editable prompt management** for all AI workflows (insight extraction, hierarchy analysis, recommendations)

---

## Current State

### Limitations
- ✅ Only Claude Sonnet 4 supported (hardcoded)
- ✅ Research insights can only be linked to **existing** theses/views via manual dropdown selection
- ❌ No AI analysis comparing insights against existing hierarchy
- ❌ No AI proposals for new theses/views
- ❌ No confidence scoring for recommendations
- ❌ **Prompts are hardcoded** - cannot iterate on prompt quality

### Current Workflow
1. User uploads research → AI extracts structured insights
2. User manually selects existing thesis/view from dropdown
3. User creates mapping manually

---

## Proposed Enhancements

### Phase 1: Multi-Model AI Support ✅

**Goal**: Allow users to select AI model for processing (Claude, ChatGPT, Gemini)

**Changes**:
- Abstract AI service interface
- Implement providers for:
  - Anthropic Claude (existing)
  - OpenAI ChatGPT (new)
  - Google Gemini (new)
- Model selection in processing UI
- Cost tracking per model
- Fallback logic if model fails

**Files to Create/Modify**:
- `src/lib/services/ai-research.ts` → Refactor to abstract interface
- `src/lib/services/ai-providers/claude.ts` (extract from current)
- `src/lib/services/ai-providers/openai.ts` (new)
- `src/lib/services/ai-providers/gemini.ts` (new)
- `src/lib/services/ai-providers/index.ts` (factory)
- Update processing API to accept `model` parameter
- Update UI to show model selector

**Environment Variables**:
- `ANTHROPIC_API_KEY` (existing)
- `OPENAI_API_KEY` (new)
- `GOOGLE_AI_API_KEY` (new)

---

### Phase 2: Hierarchy Analysis & Recommendations

**Goal**: AI analyzes insights against existing theses/views and proposes actions

**New AI Analysis Step**:
After extracting structured insights, run a second AI call that:
1. Fetches all existing macro theses (titles, descriptions, status)
2. Fetches all existing asset views (titles, narratives, tickers)
3. Compares research insights against existing items
4. Generates recommendations:
   - **New Macro Thesis**: If insights represent a new macro theme
   - **New Asset View**: If insights represent a new asset-specific view
   - **Link to Existing**: If insights align with existing thesis/view (with confidence score)
   - **Refute Existing**: If insights contradict existing thesis/view

**Recommendation Structure**:
```typescript
interface HierarchyRecommendation {
  type: 'new_macro_thesis' | 'new_asset_view' | 'link_existing' | 'refute_existing';
  
  // For new items
  proposedTitle?: string;
  proposedDescription?: string;
  proposedThesisType?: 'secular' | 'cyclical' | 'structural';
  proposedTimeHorizon?: 'long_term' | 'medium_term' | 'short_term';
  proposedConfidenceLevel?: 'high' | 'medium' | 'low' | 'exploratory';
  proposedUnderlyingTicker?: string; // For asset views
  
  // For existing items
  existingThesisId?: string;
  existingThesisTitle?: string;
  existingViewId?: string;
  existingViewTitle?: string;
  
  // Evidence relationship
  mappingType?: 'supports' | 'refutes' | 'neutral' | 'exploratory';
  confidenceScore: number; // 0-1
  reasoning: string; // Why this recommendation
  
  // Metadata
  aiModel: string;
  generatedAt: Date;
}
```

**Database Changes**:
- Add `research_hierarchy_recommendations` table to store AI recommendations
- Link to `research_insights` table
- Store recommendation status: `pending` | `accepted` | `rejected` | `modified`

**Files to Create/Modify**:
- `src/lib/services/ai-hierarchy-analysis.ts` (new)
- `src/db/schema.ts` - Add recommendations table
- `src/db/queries/research.ts` - Add recommendation queries
- `src/app/api/research/analyze-hierarchy/route.ts` (new endpoint)
- Update `processResearchArtifact` to optionally run hierarchy analysis

---

### Phase 3: Recommendation UI

**Goal**: Display AI recommendations and allow user to accept/reject/modify

**UI Components**:
- `HierarchyRecommendationsPanel` - Shows all recommendations for an insight
- `RecommendationCard` - Individual recommendation with:
  - Recommendation type badge
  - Confidence score visualization
  - Reasoning explanation
  - Action buttons (Accept, Reject, Modify)
- `CreateThesisFromRecommendation` - Pre-filled form for new thesis
- `CreateAssetViewFromRecommendation` - Pre-filled form for new asset view
- `LinkToExistingDialog` - Pre-filled mapping dialog

**Workflow**:
1. After AI processing completes, show "Analyze Hierarchy" button
2. User clicks → AI analyzes and generates recommendations
3. Recommendations panel appears with cards
4. User can:
   - Accept recommendation → Auto-create thesis/view or create mapping
   - Reject recommendation → Mark as rejected
   - Modify recommendation → Edit before accepting
   - Ignore → Leave as pending

**Files to Create**:
- `src/components/research/HierarchyRecommendationsPanel.tsx`
- `src/components/research/RecommendationCard.tsx`
- `src/components/research/CreateThesisFromRecommendation.tsx`
- `src/components/research/CreateAssetViewFromRecommendation.tsx`
- Update `src/app/research/[id]/page.tsx` to show recommendations

---

## Implementation Plan

### Step 0: Prompt Management System ✅ COMPLETE
1. ✅ Create `ai_prompts` table schema (via Supabase MCP)
2. ✅ Build prompt CRUD queries
3. ✅ Create prompt manager service
4. ✅ Refactor AI services to use prompts from DB
5. ✅ Build admin UI for prompt management
6. ✅ Seed default prompts (via Supabase MCP)

### Step 1: Multi-Model Support ✅ COMPLETE
1. ✅ Refactor AI service to abstract interface
2. ✅ Implement OpenAI provider
3. ✅ Implement Gemini provider
4. ✅ Update processing API
5. ✅ Add model selector to UI
6. ✅ Provider factory and cost tracking implemented

### Step 2: Hierarchy Analysis Service ✅ COMPLETE
1. ✅ Create hierarchy analysis service
2. ✅ Add recommendations table to schema (via Supabase MCP)
3. ✅ Implement recommendation generation logic
4. ✅ Create analysis API endpoint
5. ✅ Integrate with processing workflow

### Step 3: Recommendation UI ✅ COMPLETE
1. ✅ Build recommendation components
2. ✅ Create acceptance workflows
3. ✅ Integrate with existing forms
4. ✅ Add recommendation status tracking
5. ✅ Auto-create theses/views from recommendations

**Total Estimated Effort**: 8-12 days (with prompt management)

---

### Phase 0: Prompt Management System ⭐ NEW

**Goal**: Make all AI prompts editable and versioned so users can iterate on prompt quality

**Why This Matters**:
- Prompt quality directly impacts AI output quality
- Different research types may need different prompts
- Users need to test and iterate on prompts based on results
- Version control allows rolling back to previous prompts

**Three Prompt Types**:
1. **Insight Extraction Prompt** - Used for structuring research content
2. **Hierarchy Analysis Prompt** - Used for comparing insights against existing theses/views
3. **Recommendation Generation Prompt** - Used for generating hierarchy recommendations

**Database Changes**:
- Add `ai_prompts` table to store prompts with versioning
- Support multiple prompt versions (active, draft, archived)
- Track which prompt version was used for each processing run

**Files to Create/Modify**:
- `src/db/schema.ts` - Add `ai_prompts` table
- `src/db/queries/prompts.ts` - CRUD operations for prompts
- `src/lib/services/prompt-manager.ts` - Service to fetch active prompts
- `src/lib/services/ai-research.ts` - Use prompts from DB instead of hardcoded
- `src/lib/services/ai-hierarchy-analysis.ts` - Use prompts from DB
- `src/app/api/prompts/route.ts` - API for prompt management
- `src/app/admin/prompts/page.tsx` - Admin UI for managing prompts
- `src/components/admin/PromptEditor.tsx` - Rich text editor for prompts

**Prompt Structure**:
```typescript
interface AIPrompt {
  id: string;
  promptType: 'insight_extraction' | 'hierarchy_analysis' | 'recommendation_generation';
  name: string; // User-friendly name
  content: string; // The actual prompt template
  version: number; // Version number
  status: 'active' | 'draft' | 'archived';
  isDefault: boolean; // System default prompt
  variables: string[]; // Available template variables (e.g., {{artifact.title}})
  description: string; // What this prompt does
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // User ID
}
```

**Template Variables**:
Prompts support template variables that get replaced at runtime:
- `{{artifact.title}}` - Research artifact title
- `{{artifact.sourceType}}` - Source type
- `{{artifact.author}}` - Author
- `{{artifact.rawContent}}` - Full content
- `{{insight.summary}}` - Extracted insight summary
- `{{insight.keyThemes}}` - Key themes
- `{{existingTheses}}` - JSON array of existing theses (for hierarchy analysis)
- `{{existingViews}}` - JSON array of existing views (for hierarchy analysis)

**UI Features**:
- **Prompt Library Page** (`/admin/prompts`) - List all prompts by type
- **Prompt Editor** - Rich text editor with:
  - Syntax highlighting for template variables
  - Preview mode (shows how prompt looks with sample data)
  - Version history
  - Test button (run prompt against sample research)
- **Prompt Selector** - In processing UI, allow selecting which prompt to use
- **Prompt Versioning** - View and restore previous versions

**Default Prompts**:
- System includes default prompts for each type
- Users can create custom prompts
- Can mark custom prompt as "active" to use instead of default
- Can duplicate and modify existing prompts

**Files to Create**:
- `src/db/schema.ts` - Add `ai_prompts` table
- `src/db/queries/prompts.ts` - Prompt queries
- `src/lib/services/prompt-manager.ts` - Prompt resolution service
- `src/app/api/prompts/route.ts` - CRUD API
- `src/app/api/prompts/[id]/route.ts` - Single prompt operations
- `src/app/admin/prompts/page.tsx` - Prompt management page
- `src/components/admin/PromptEditor.tsx` - Prompt editor component
- `src/components/admin/PromptSelector.tsx` - Prompt selection dropdown
- `src/components/admin/PromptPreview.tsx` - Preview with sample data
- Migration SQL file for `ai_prompts` table

**Estimated Effort**: 2-3 days

**Dependencies**: None (can be done first or in parallel)

**Example Prompt Template** (Insight Extraction):

```
You are an expert investment research analyst. Analyze the following research content and extract structured insights.

Research Title: {{artifact.title}}
Source Type: {{artifact.sourceType}}
Author: {{artifact.author}}
Published: {{artifact.publishedDate}}

Content:
{{artifact.rawContent}}

Extract the following information in JSON format:

1. **summary**: A concise 2-3 sentence summary of the main thesis and key findings
2. **keyThemes**: Array of 3-5 main themes or topics covered
3. **keyClaims**: Array of key claims made in the research, each with:
   - claim: The specific claim or thesis
   - evidence: Supporting evidence or data mentioned
   - confidence: Your assessment of claim strength (high/medium/low)
[... rest of prompt ...]

Return ONLY valid JSON matching this structure. Be thorough but concise.
```

**Usage in Code**:
```typescript
// Before (hardcoded)
const prompt = `You are an expert... ${artifact.title}...`;

// After (from database)
const promptTemplate = await getActivePrompt('insight_extraction');
const prompt = renderPrompt(promptTemplate.content, {
  artifact: {
    title: artifact.title,
    sourceType: artifact.sourceType,
    author: artifact.author,
    rawContent: artifact.rawContent,
  }
});
```

**Prompt Testing Workflow**:
1. User edits prompt in admin UI
2. Clicks "Test Prompt" button
3. System shows sample research artifact
4. User can modify sample or use real artifact
5. System runs prompt against sample
6. Shows AI response preview
7. User iterates on prompt based on results
8. Saves as new version when satisfied

---

## Technical Considerations

### Model Selection Strategy
- Default to Claude (best quality)
- Allow user override per artifact
- Support batch processing with model selection
- Cost comparison display

### Performance
- Hierarchy analysis requires fetching all theses/views (could be large)
- Consider pagination or summary fields for large datasets
- Cache existing hierarchy for batch processing

### Cost Management
- Hierarchy analysis adds second AI call (additional cost)
- Track costs separately for insight extraction vs hierarchy analysis
- Allow users to skip hierarchy analysis if cost-sensitive

### Error Handling
- Model failures should fallback gracefully
- Invalid recommendations should be caught and rejected
- User should always have manual override option

---

## Database Schema Changes

### New Table: `ai_prompts`

```sql
CREATE TABLE ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Prompt identification
  prompt_type TEXT NOT NULL, -- 'insight_extraction' | 'hierarchy_analysis' | 'recommendation_generation'
  name TEXT NOT NULL, -- User-friendly name (e.g., "Default Insight Extraction", "Transcript Optimized")
  description TEXT, -- What this prompt does
  
  -- Prompt content
  content TEXT NOT NULL, -- The actual prompt template
  variables TEXT[], -- Available template variables (e.g., ['{{artifact.title}}', '{{artifact.rawContent}}'])
  
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL, -- Previous version
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- 'active' | 'draft' | 'archived'
  is_default BOOLEAN NOT NULL DEFAULT FALSE, -- System default prompt
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by TEXT, -- User ID (nullable for system prompts)
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0, -- How many times this prompt has been used
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_prompts_type_status ON ai_prompts(prompt_type, status);
CREATE INDEX idx_prompts_default ON ai_prompts(prompt_type, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_prompts_active ON ai_prompts(prompt_type, status) WHERE status = 'active';
```

**Constraints**:
- Only one active prompt per type (enforced in application logic)
- Only one default prompt per type (enforced in application logic)
- Version numbers increment per prompt name

### New Table: `research_hierarchy_recommendations`

```sql
CREATE TABLE research_hierarchy_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_insight_id UUID NOT NULL REFERENCES research_insights(id) ON DELETE CASCADE,
  
  -- Recommendation type
  recommendation_type TEXT NOT NULL, -- 'new_macro_thesis' | 'new_asset_view' | 'link_existing' | 'refute_existing'
  
  -- Proposed new item data (JSONB for flexibility)
  proposed_data JSONB,
  
  -- Existing item reference
  existing_thesis_id UUID REFERENCES macro_theses(id) ON DELETE CASCADE,
  existing_view_id UUID REFERENCES asset_views(id) ON DELETE CASCADE,
  
  -- Evidence relationship (if linking)
  mapping_type TEXT, -- 'supports' | 'refutes' | 'neutral' | 'exploratory'
  confidence_score NUMERIC(3, 2), -- 0.00 to 1.00
  
  -- Reasoning
  reasoning TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected' | 'modified'
  
  -- AI metadata
  ai_model TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- User action
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  modified_by_user BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recommendations_insight ON research_hierarchy_recommendations(research_insight_id);
CREATE INDEX idx_recommendations_status ON research_hierarchy_recommendations(status);
CREATE INDEX idx_recommendations_type ON research_hierarchy_recommendations(recommendation_type);
```

---

## API Endpoints

### Prompt Management Endpoints

**GET `/api/prompts`**
- List all prompts
- Filter by `promptType`, `status`
- Returns active prompts by default

**GET `/api/prompts/[id]`**
- Get single prompt with version history

**POST `/api/prompts`**
- Create new prompt or new version
- Validate template variables
- Set as active if specified

**PATCH `/api/prompts/[id]`**
- Update prompt (creates new version)
- Change status (active/draft/archived)

**POST `/api/prompts/[id]/test`**
- Test prompt against sample data
- Returns AI response preview
- Useful for iterating on prompts

**POST `/api/prompts/[id]/activate`**
- Set prompt as active (deactivates previous active)
- Only one active per type

**GET `/api/prompts/[id]/versions`**
- Get version history for a prompt
- Can restore previous version

### Research Processing Endpoints

**POST `/api/research/analyze-hierarchy`**
- Analyze research insight against existing hierarchy
- Generate recommendations
- Returns array of recommendations

**POST `/api/research/recommendations/[id]/accept`**
- Accept a recommendation
- Auto-create thesis/view or mapping based on type
- Update recommendation status

**POST `/api/research/recommendations/[id]/reject`**
- Reject a recommendation
- Update status to rejected

**GET `/api/research/recommendations?insightId=xyz`**
- Get all recommendations for an insight
- Filter by status

---

## Success Criteria

### Phase 0 (Prompt Management) ⭐ COMPLETE ✅
- ✅ User can view all prompts in admin UI
- ✅ User can create/edit prompts with template variables
- ✅ User can test prompts against sample data
- ✅ User can set active prompt per type
- ✅ AI services use prompts from database
- ✅ Prompt versioning works correctly
- ✅ Default prompts are seeded on first run
- ✅ Database table created via Supabase MCP
- ✅ Admin UI fully functional at `/admin/prompts`

### Phase 1 (Multi-Model) ✅ COMPLETE
- ✅ User can select AI model in processing UI
- ✅ All three models successfully process research (Claude, OpenAI, Gemini)
- ✅ Cost tracking works per model
- ✅ Provider factory abstracts model selection
- ✅ Model selector shows pricing information

### Phase 2 (Hierarchy Analysis) ✅ COMPLETE
- ✅ AI generates accurate recommendations
- ✅ Recommendations include confidence scores
- ✅ Recommendations stored in database
- ✅ Analysis completes in reasonable time (<30s)
- ✅ Both hierarchy_analysis and recommendation_generation prompts are used sequentially

### Phase 3 (Recommendation UI) ✅ COMPLETE
- ✅ User can view all recommendations
- ✅ User can accept recommendations (auto-creates items)
- ✅ User can reject recommendations
- ✅ User can modify recommendations before accepting
- ✅ Accepted recommendations create proper database records
- ✅ Recommendations grouped by status (Pending, Accepted, Rejected, Modified)

---

## Future Enhancements

### Prompt Management
- **Prompt A/B testing**: Test multiple prompts and compare results
- **Prompt performance metrics**: Track which prompts produce better results
- **Prompt templates library**: Pre-built prompts for common use cases
- **Prompt sharing**: Export/import prompts between instances
- **Auto-optimization**: AI suggests prompt improvements based on results

### Recommendations
- **Batch recommendation processing**: Analyze multiple insights at once
- **Recommendation learning**: Track which recommendations users accept/reject to improve future suggestions
- **Confidence threshold filtering**: Only show recommendations above certain confidence
- **Recommendation comparison**: Compare recommendations from different models
- **Auto-accept high-confidence recommendations**: Option to auto-accept recommendations above threshold

