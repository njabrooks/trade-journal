# Research Section UX Overhaul Proposal

## Problem Statement

The research section currently mixes TWO fundamentally different workflows, creating confusion:

### OLD Workflow (In-App AI Processing)
1. Upload raw transcript to app
2. Click "Process" button → AI generates insight
3. Click "Analyze Hierarchy" → AI generates recommendations
4. Review AI recommendations
5. Manually create mappings to theses/views
6. Complex UI with multiple panels and buttons

### NEW Workflow (Local-First Claims)
1. **Local Claude Code**: `/process-transcript` → forensic Toulmin extraction
2. **Local Claude Code**: `/finalize-for-upload` → upload structured data
3. **App**: Browse hierarchical claims in ClaimsBrowser
4. **App**: Convert claims to theses/views via dialog
5. Done! Provenance tracked automatically

**The Issue**: Research detail pages show BOTH workflows, making it unclear what users should do.

---

## Current State Analysis

### Research Detail Page Sections

#### ✅ KEEP (Aligned with NEW workflow)
1. **Metadata Card** - Shows artifact info (source, author, dates, tags)
2. **ClaimsBrowser** - Interactive claims browsing with conversion
3. **Raw Content** - Original transcript for reference

#### ❌ REMOVE (OLD workflow, deprecated)
1. **ProcessButton** - OLD in-app AI processing
2. **InsightReview** - Legacy format, replaced by ClaimsBrowser
3. **AnalyzeHierarchyButton** - OLD in-app AI analysis
4. **HierarchyRecommendationsPanel** - OLD AI recommendations
5. **MappingsSection** - OLD manual mappings system
6. **RecommendationCard** - Part of OLD recommendations
7. **CreateThesisFromRecommendation** - OLD workflow
8. **CreateAssetViewFromRecommendation** - OLD workflow
9. **AddMappingDialog** - OLD manual mapping
10. **MappingsList** - OLD mappings display
11. **EvidenceDisplay** - OLD format evidence

### Components to Archive/Delete
```
src/components/research/
  ❌ InsightReview.tsx
  ❌ ProcessButton.tsx
  ❌ AnalyzeHierarchyButton.tsx
  ❌ HierarchyRecommendationsPanel.tsx
  ❌ RecommendationCard.tsx
  ❌ CreateThesisFromRecommendation.tsx
  ❌ CreateAssetViewFromRecommendation.tsx
  ❌ MappingsSection.tsx
  ❌ MappingsList.tsx
  ❌ AddMappingDialog.tsx
  ❌ EvidenceDisplay.tsx
```

### Components to Keep
```
src/components/research/
  ✅ ClaimsBrowser.tsx (NEW workflow)
  ✅ ConvertClaimDialog.tsx (NEW workflow)
```

---

## Proposed NEW User Experience

### 1. Research List Page (`/research`)

**Current**: Good - shows artifact list
**Enhancement**: Add status indicator for claims

```tsx
Status column shows:
- "📊 X claims" (if has claims_structure)
- "📄 Raw" (if no claims_structure)
- "🔄 Processing" (if status = processing)
- "❌ Error" (if status = error)
```

### 2. Research Detail Page (`/research/[id]`)

**Streamlined Layout** (remove all OLD workflow elements):

```
┌─────────────────────────────────────────────────┐
│ Research: [Title]                               │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ METADATA CARD                           │   │
│ │ - Source Type, Status, Author, etc.     │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ WORKFLOW STATUS CARD (NEW!)             │   │
│ │                                           │   │
│ │ ✅ Uploaded to database                  │   │
│ │ ✅ Claims extracted (8 main, 15 evidence)│   │
│ │ ⏳ 6 claims not yet converted            │   │
│ │ ✅ 2 claims converted to hierarchy       │   │
│ │                                           │   │
│ │ [View Unconverted Claims →]              │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ IF claims_structure exists:                    │
│ ┌─────────────────────────────────────────┐   │
│ │ FORENSIC CLAIMS ANALYSIS                │   │
│ │ (ClaimsBrowser component)               │   │
│ │ - Filter, search, sort claims           │   │
│ │ - Expand to see Toulmin structure       │   │
│ │ - Convert button for each claim         │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ELSE (no claims_structure):                    │
│ ┌─────────────────────────────────────────┐   │
│ │ NO CLAIMS EXTRACTED                     │   │
│ │                                           │   │
│ │ This research hasn't been processed     │   │
│ │ through the claims extraction workflow. │   │
│ │                                           │   │
│ │ To extract claims:                       │   │
│ │ 1. Download raw content                  │   │
│ │ 2. Run /process-transcript locally      │   │
│ │ 3. Re-upload with /finalize-for-upload  │   │
│ │                                           │   │
│ │ [Download Raw Content]                   │   │
│ │ [View Workflow Guide →]                  │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ RAW CONTENT (collapsible)               │   │
│ │ [Show/Hide Raw Content]                  │   │
│ │ ... transcript text ...                  │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ [← Back to Library]                            │
└─────────────────────────────────────────────────┘
```

### 3. New "Workflow Status" Card

Shows user exactly where they are in the process:

```tsx
<WorkflowStatusCard>
  <ChecklistItem done={true}>
    Uploaded to database
  </ChecklistItem>
  <ChecklistItem done={hasClaimsStructure}>
    Claims extracted ({mainClaimsCount} main, {evidenceCount} evidence)
  </ChecklistItem>
  <ChecklistItem done={unconvertedCount === 0} inProgress={unconvertedCount > 0}>
    {unconvertedCount > 0
      ? `${unconvertedCount} claims not yet converted`
      : 'All claims converted to hierarchy'
    }
  </ChecklistItem>
  <ChecklistItem done={convertedCount > 0}>
    {convertedCount} claims converted to theses/views
  </ChecklistItem>

  {unconvertedCount > 0 && (
    <Button onClick={scrollToClaimsBrowser}>
      View Unconverted Claims →
    </Button>
  )}
</WorkflowStatusCard>
```

### 4. Empty State (No Claims)

Clear guidance when `claims_structure` is null:

```tsx
<EmptyClaimsState>
  <Icon>📋</Icon>
  <Title>No Claims Extracted</Title>
  <Description>
    This research hasn't been processed through the claims extraction workflow.
  </Description>

  <WorkflowSteps>
    <Step>1. Download raw content</Step>
    <Step>2. Run /process-transcript in local Claude Code</Step>
    <Step>3. Re-upload with /finalize-for-upload</Step>
  </WorkflowSteps>

  <Actions>
    <Button variant="outline" onClick={downloadRawContent}>
      Download Raw Content
    </Button>
    <Link href="/docs/claims-workflow-guide">
      View Workflow Guide →
    </Link>
  </Actions>
</EmptyClaimsState>
```

### 5. Conversion Success Flow

After converting a claim, show clear feedback:

```tsx
// After conversion via ConvertClaimDialog
toast.success(
  `Claim converted to ${type === 'macro_thesis' ? 'macro thesis' : 'asset view'}!`,
  {
    action: {
      label: 'View',
      onClick: () => router.push(`/${type === 'macro_thesis' ? 'theses' : 'asset-views'}/${id}`)
    }
  }
)

// Refresh page to show updated claim status
router.refresh()
```

---

## Migration Strategy

### Phase 1: Create New Components
1. Create `WorkflowStatusCard.tsx` component
2. Create `EmptyClaimsState.tsx` component
3. Update `ClaimsBrowser.tsx` to auto-scroll when unconverted filter applied

### Phase 2: Update Research Detail Page
1. Remove all OLD workflow sections:
   - Remove `<ProcessButton>` (line 40)
   - Remove `<InsightReview>` (line 130)
   - Remove `<AnalyzeHierarchyButton>` section (lines 133-146)
   - Remove `<HierarchyRecommendationsPanel>` (lines 150-155)
   - Remove `<MappingsSection>` (line 158)
2. Add new sections:
   - Add `<WorkflowStatusCard>` after metadata
   - Add `<EmptyClaimsState>` when no claims_structure
3. Make Raw Content collapsible

### Phase 3: Archive OLD Components
Move to `src/components/research/archive/`:
- All components listed in "Components to Archive/Delete" section

### Phase 4: Update Upload Page
Clarify that upload page is for ALREADY PROCESSED audits:

```tsx
// /research/upload page

<Notice type="info">
  <strong>Upload Processed Research</strong>

  This page is for uploading audit files that have already been processed
  with forensic claims extraction via local Claude Code.

  Workflow:
  1. Process raw transcript with /process-transcript locally
  2. Upload the generated audit file here OR via /finalize-for-upload

  For raw transcripts, use /process-transcript first.
</Notice>
```

---

## Benefits

### User Clarity
- ✅ Clear, linear workflow visible at a glance
- ✅ No confusing "Process" or "Analyze" buttons
- ✅ Status checklist shows progress
- ✅ Empty states guide next steps

### Technical Simplicity
- ✅ Remove ~2000 lines of OLD workflow code
- ✅ One workflow, not two competing systems
- ✅ Cleaner component tree
- ✅ Easier to maintain

### Workflow Integrity
- ✅ All AI work happens locally (better quality, user control)
- ✅ App is for browsing and converting (clear purpose)
- ✅ Provenance tracked automatically in claims_structure
- ✅ No manual mapping complexity

---

## Implementation Checklist

### New Components to Create
- [ ] `WorkflowStatusCard.tsx` - Shows checklist of workflow progress
- [ ] `EmptyClaimsState.tsx` - Guidance when no claims_structure

### Components to Modify
- [ ] `src/app/research/[id]/page.tsx` - Remove OLD sections, add NEW
- [ ] `src/app/research/upload/page.tsx` - Add workflow clarification
- [ ] `ClaimsBrowser.tsx` - Add auto-scroll for unconverted filter

### Components to Archive
- [ ] Move all OLD workflow components to `archive/` directory
- [ ] Update imports to remove archived components
- [ ] Test build passes after removal

### Documentation to Update
- [ ] `claims-workflow-guide.md` - Update with new UX screenshots
- [ ] Add user-facing guide: "How to process research" tutorial
- [ ] Update README with workflow overview

### Testing
- [ ] Test empty state (artifact with no claims_structure)
- [ ] Test claims browsing and conversion flow
- [ ] Test workflow status card with various states
- [ ] Verify all OLD workflow code removed
- [ ] Build passes successfully

---

## Expected Outcome

### Before (Confusing)
User sees research detail page with:
- Process button (what does this do?)
- Analyze Hierarchy button (when do I click this?)
- AI Recommendations panel (where did these come from?)
- Mappings section (how is this different from recommendations?)
- Claims Browser (is this the same as the other stuff?)
- Raw Content (why is this last?)

**User thinks**: "I don't understand what I'm supposed to do here"

### After (Clear)
User sees research detail page with:
- Metadata (basic info)
- **Workflow Status** (I'm at step 3 of 4, 6 claims left to convert)
- Claims Browser (my to-do list, with Convert buttons)
- Raw Content (reference material, collapsed by default)

**User thinks**: "I need to convert 6 more claims. Let me start with the high-confidence thesis candidates."

---

## Timeline Estimate

- **Phase 1** (New components): 2 hours
- **Phase 2** (Update pages): 1 hour
- **Phase 3** (Archive old): 30 minutes
- **Phase 4** (Upload page): 30 minutes
- **Testing**: 1 hour

**Total**: ~5 hours

---

## Questions for User

1. **Archive vs Delete**: Should we archive OLD components or delete entirely?
   - Archive: Move to `archive/` for historical reference
   - Delete: Remove completely (can always recover from git)

2. **Upload Page**: Should upload page be in-app or CLI-only?
   - Keep in-app upload for convenience
   - CLI-only (/finalize-for-upload) for purity

3. **Raw Content**: Always show or make collapsible?
   - Collapsible (recommended): Cleaner, focus on claims
   - Always show: More transparent, easier to reference

4. **Migration**: Apply to existing research or new only?
   - All research: Consistent experience
   - New only: Don't break existing workflows

---

## Recommendation

**Proceed with full overhaul**:
1. Archive (not delete) OLD components for historical reference
2. Keep in-app upload for convenience
3. Make raw content collapsible by default
4. Apply to all research (both new and existing)

This will result in a **dramatically clearer, simpler user experience** aligned with the local-first, claims-based workflow we've built.

Should I proceed with implementation?
