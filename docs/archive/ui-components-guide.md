# UI Components Guide - Main Claims Workflow

## New Components Created (2025-12-28)

### 1. Create Macro Thesis Dialog

**Component**: `/src/components/theses/CreateThesisDialog.tsx`
**Button**: `/src/components/theses/CreateThesisButton.tsx`
**Location**: `/theses` page - Top right "Create New Thesis" button

**Features**:
- Title, description, type (secular/cyclical/structural)
- Time horizon, confidence level, direction
- Sectors (comma-separated)
- Position start/end dates
- Optional: Pre-link main claims via `prefilledMainClaimIds` prop

**Usage**:
```tsx
<CreateThesisDialog
  onClose={() => setShowDialog(false)}
  prefilledMainClaimIds={["<main-claim-uuid>"]} // Optional
/>
```

---

### 2. Create Asset View Dialog

**Component**: `/src/components/asset-views/CreateAssetViewDialog.tsx`
**Button**: `/src/components/asset-views/CreateAssetViewButton.tsx`
**Location**: `/asset-views` page - Top right "Create New View" button

**Features**:
- Title, ticker (required), description
- View type (long/short/neutral)
- Time horizon, confidence level, direction
- Target price (optional)
- Position start/end dates
- Optional: Pre-link main claims via `prefilledMainClaimIds` prop
- Optional: Pre-link parent theses via `prefilledThesisIds` prop

**Usage**:
```tsx
<CreateAssetViewDialog
  onClose={() => setShowDialog(false)}
  prefilledMainClaimIds={["<main-claim-uuid>"]} // Optional
  prefilledThesisIds={["<thesis-uuid>"]} // Optional
/>
```

---

### 3. Link Claim to Entity Dialog

**Component**: `/src/components/research/LinkClaimDialog.tsx`
**Location**: Can be triggered from research pages (needs integration)

**Features**:
- Select entity type: Macro Thesis or Asset View
- Search theses/views by title (or ticker for views)
- Select target entity from list
- Choose relationship type: supports/rebuts/contextualizes
- Real-time entity loading from API

**Usage**:
```tsx
<LinkClaimDialog
  mainClaimId="<main-claim-uuid>"
  mainClaimTitle="Your claim title here"
  onClose={() => setShowDialog(false)}
/>
```

---

## Workflow Examples

### Example 1: Create Standalone Thesis

1. Navigate to `/theses`
2. Click **"Create New Thesis"** button (top right)
3. Fill in form:
   - Title: "Physical AI Infrastructure Buildout (2025-2026)"
   - Type: Cyclical
   - Time Horizon: Medium Term
   - Confidence: High
   - Direction: Bullish
   - Sectors: Technology, Hardware, Networking
   - Position dates: 2025-01-01 to 2026-12-31
4. Click **"Create Thesis"**
5. Redirects to new thesis page

---

### Example 2: Create Asset View for CSCO

1. Navigate to `/asset-views`
2. Click **"Create New View"** button (top right)
3. Fill in form:
   - Title: "Cisco Long: On-Premise AI Networking"
   - Ticker: CSCO
   - View Type: Long
   - Confidence: High
   - Direction: Bullish
   - Target Price: 65.00
   - Position dates: 2025-01-01 to 2026-06-30
4. Click **"Create Asset View"**
5. Redirects to new view page

---

### Example 3: Link Main Claim to Existing Thesis

(Requires integration in research page - see below)

1. On research insight page with promoted claims
2. Click **"Link"** button next to a promoted main claim
3. Select entity type: **Macro Thesis**
4. Search for thesis by title
5. Select target thesis from list
6. Choose relationship: **Supports**
7. Click **"Link to Thesis"**
8. Success! Page refreshes with link created

---

## Integration Complete ✅

### Add Main Claim Functionality

The Link functionality has been moved from ClaimsBrowser to the thesis and view detail pages. This follows the correct workflow:

**Workflow:**
1. Research page: **Promote** claims → Creates entries in `main_claims` table
2. Thesis detail page: **Add Main Claim** → Links existing main_claims to thesis
3. View detail page: **Add Main Claim** → Links existing main_claims to view

**Why this approach:**
- ClaimsBrowser shows audit-level claims (IDs like "claim-1") from `research_insights.claims_structure`
- These are NOT in the `main_claims` table yet
- Linking requires UUIDs from the `main_claims` table
- Therefore, linking happens AFTER promotion, on the entity pages

**Components Created:**

1. **AddMainClaimDialog** (`/src/components/research/AddMainClaimDialog.tsx`)
   - Loads all main claims from `/api/main-claims`
   - Searchable by claim text, title, or ticker
   - Shows confidence, category, time horizon
   - Relationship type selection (supports/rebuts/contextualizes)
   - Works for both theses and views via `entityType` prop

2. **AddMainClaimButton** (`/src/components/theses/AddMainClaimButton.tsx`)
   - Button wrapper for thesis pages
   - Opens AddMainClaimDialog with `entityType="thesis"`

3. **AddMainClaimButtonForView** (`/src/components/asset-views/AddMainClaimButtonForView.tsx`)
   - Button wrapper for view pages
   - Opens AddMainClaimDialog with `entityType="view"`

**Pages Updated:**

1. **Thesis Detail** (`/src/app/theses/[id]/page.tsx`)
   - Added `getLinkedMainClaimsForThesis()` query
   - Added "Main Claims" section with claim display
   - Added "Add Main Claim" button
   - Shows relationship type badges (supports/rebuts/contextualizes)

2. **Asset View Detail** (`/src/app/asset-views/[id]/page.tsx`)
   - Added `getLinkedMainClaimsForAssetView()` query
   - Added "Main Claims" section with claim display
   - Added "Add Main Claim" button
   - Shows relationship type badges (supports/rebuts/contextualizes)

**API Endpoints:**

- `GET /api/main-claims` - Fetch all main claims (used by AddMainClaimDialog)
- `POST /api/main-claims/link-to-entity` - Link main claim to thesis/view (existing)

---

## API Endpoints Used

All dialogs call the new API endpoints:

| Dialog | Endpoint | Method |
|--------|----------|--------|
| CreateThesisDialog | `/api/theses/create` | POST |
| CreateAssetViewDialog | `/api/asset-views/create` | POST |
| LinkClaimDialog | `/api/main-claims/link-to-entity` | POST |
| LinkClaimDialog (load entities) | `/api/theses`, `/api/asset-views` | GET |

---

## Validation & Error Handling

All dialogs include:

✅ Required field validation
✅ Loading states during API calls
✅ Success messages with auto-redirect
✅ Error messages with retry capability
✅ Form disable during submission

---

## Next Steps

1. ✅ **DONE**: Create thesis dialog
2. ✅ **DONE**: Create asset view dialog
3. ✅ **DONE**: Link claim dialog
4. ✅ **DONE**: Add "Create" buttons to pages
5. ✅ **DONE**: Integrate LinkClaimDialog into ClaimsBrowser
6. ⏳ **TODO**: Test full UI workflow end-to-end

---

## Files Created

```
src/
├── components/
│   ├── theses/
│   │   ├── CreateThesisDialog.tsx       (Form dialog)
│   │   └── CreateThesisButton.tsx       (Trigger button)
│   ├── asset-views/
│   │   ├── CreateAssetViewDialog.tsx    (Form dialog)
│   │   └── CreateAssetViewButton.tsx    (Trigger button)
│   └── research/
│       └── LinkClaimDialog.tsx          (Link dialog)
└── app/
    ├── theses/
    │   └── page.tsx                     (Updated with Create button)
    └── asset-views/
        └── page.tsx                     (Updated with Create button)
```

---

## Testing the UI

1. **Start dev server**: `npm run dev`
2. **Test create thesis**: Navigate to `/theses` → Click "Create New Thesis"
3. **Test create view**: Navigate to `/asset-views` → Click "Create New View"
4. **Test linking**: (Once integrated) Click "Link" on a promoted claim

All forms include validation and will show errors if required fields are missing!
