# Main Claims Workflow Fixes (2025-12-28)

## Issues Identified

1. **Missing Evidence Linking** - Promoting a claim didn't create `main_claim_evidence` records
2. **Workflow Confusion** - Unclear whether to "convert" claims or "link" them to theses/views
3. **Missing Create Functions** - No standalone creation endpoints for theses/views with claim linkage

## Fixes Applied

### 1. ✅ Fixed Promote-Claim to Auto-Link Evidence

**File**: `/src/app/api/research/promote-claim/route.ts`

**Changes**:
- Now automatically creates `main_claim_evidence` records when promoting
- Links both supporting AND rebutting evidence claims
- Returns `linkedEvidenceCount` in response

**Before**:
```typescript
// Only created main_claims entry
const [createdMainClaim] = await db.insert(mainClaims).values(...).returning();
return { success: true, mainClaimId: createdMainClaim.id };
```

**After**:
```typescript
// Creates main_claims entry
const [createdMainClaim] = await db.insert(mainClaims).values(...).returning();

// Auto-links evidence claims
const evidenceLinks = [
  ...supportingClaimIds.map(...),
  ...rebuttingClaimIds.map(...),
];
await db.insert(mainClaimEvidence).values(evidenceLinks);

return {
  success: true,
  mainClaimId: createdMainClaim.id,
  linkedEvidenceCount: evidenceLinks.length
};
```

---

### 2. ✅ Created Standalone Thesis Creation Endpoint

**File**: `/src/app/api/theses/create/route.ts`

**Endpoint**: `POST /api/theses/create`

**Purpose**: Create macro theses independently (not from claim conversion)

**Request Body**:
```json
{
  "title": "Physical AI Infrastructure Buildout (2025-2026)",
  "thesisType": "cyclical",
  "timeHorizon": "medium_term",
  "confidenceLevel": "high",
  "status": "active",

  // Position structure
  "sectors": ["Technology", "Hardware"],
  "direction": "bullish",
  "positionStartDate": "2025-01-01",
  "positionEndDate": "2026-12-31",

  // Link to existing main claims (optional)
  "linkedMainClaimIds": ["<main-claim-uuid>", "..."],

  "notes": {}
}
```

**Response**:
```json
{
  "success": true,
  "thesisId": "<uuid>",
  "linkedClaimsCount": 2,
  "message": "Macro thesis created successfully with 2 main claims linked"
}
```

---

### 3. ✅ Created Standalone Asset View Creation Endpoint

**File**: `/src/app/api/asset-views/create/route.ts`

**Endpoint**: `POST /api/asset-views/create`

**Purpose**: Create asset views independently (not from claim conversion)

**Request Body**:
```json
{
  "title": "Cisco Long: On-Premise AI Networking",
  "ticker": "CSCO",
  "viewType": "long",
  "timeHorizon": "medium_term",
  "confidenceLevel": "high",
  "status": "active",

  // Position structure
  "direction": "bullish",
  "positionStartDate": "2025-01-01",
  "positionEndDate": "2026-06-30",
  "targetPrice": "65",

  // Link to existing main claims (optional)
  "linkedMainClaimIds": ["<main-claim-uuid>", "..."],

  // Link to parent theses (optional)
  "linkedThesisIds": ["<thesis-uuid>", "..."],

  "notes": {}
}
```

**Response**:
```json
{
  "success": true,
  "viewId": "<uuid>",
  "ticker": "CSCO",
  "linkedClaimsCount": 1,
  "linkedThesesCount": 1,
  "message": "Asset view created successfully with 1 main claims linked and 1 parent theses referenced"
}
```

---

### 4. ✅ Created Main Claim Linking Endpoint

**File**: `/src/app/api/main-claims/link-to-entity/route.ts`

**Endpoint**: `POST /api/main-claims/link-to-entity`

**Purpose**: Link existing main claims to existing theses/views after creation

**Request Body**:
```json
{
  "mainClaimId": "<main-claim-uuid>",
  "entityType": "thesis",  // or "view"
  "entityId": "<thesis-uuid>",
  "relationshipType": "supports"  // or "rebuts" or "contextualizes"
}
```

**Response**:
```json
{
  "success": true,
  "linkId": "<link-uuid>",
  "message": "Main claim linked to thesis successfully (supports)"
}
```

---

## Updated Workflow

### Two Paths: Link vs Convert

#### Path 1: Link Workflow (Preferred for Standalone Creation)

```
1. Process Transcript
   ↓ /process-transcript skill
   research_insights (with claims_structure JSONB)

2. Promote Main Claim
   ↓ UI "Promote" button → POST /api/research/promote-claim
   main_claims table + main_claim_evidence table (auto-linked)

3. Create Thesis (standalone)
   ↓ POST /api/theses/create
   macro_theses table

4. Link Main Claim to Thesis
   ↓ POST /api/main-claims/link-to-entity
   claim_thesis_mappings table
```

**When to use**: When you want to create theses/views as first-class entities and then link supporting claims.

---

#### Path 2: Convert Workflow (Provenance-Tracked)

```
1. Process Transcript
   ↓ /process-transcript skill
   research_insights (with claims_structure JSONB)

2. Promote Main Claim
   ↓ UI "Promote" button → POST /api/research/promote-claim
   main_claims table + main_claim_evidence table (auto-linked)

3. Convert Main Claim to Thesis
   ↓ UI "Convert" button → POST /api/research/convert-claim
   macro_theses table (with source_claim_id provenance)
   + claim_thesis_mappings table
```

**When to use**: When a claim IS the thesis (1:1 relationship with strong provenance tracking).

---

## Key Distinctions

| Action | Creates | Links | Provenance | Use Case |
|--------|---------|-------|------------|----------|
| **Promote** | `main_claims` + `main_claim_evidence` | Evidence to claim | Audit ID | First-class claim entity |
| **Create** | `macro_theses` or `asset_views` | Optional claim linkage | None (standalone) | Independent thesis/view |
| **Link** | `claim_thesis_mappings` | Claim to thesis/view | None (manual) | Post-creation linking |
| **Convert** | `macro_theses` or `asset_views` | Automatic claim linkage | Claim ID | 1:1 claim→thesis with provenance |

---

## Example Workflow with Your Audit

Using the "Apps to Agents" audit:

```bash
# 1. Upload audit (already done)
# Insight ID: <your-insight-id>

# 2. Promote Claim 1 (AI PMI Expansion)
curl -X POST http://localhost:3000/api/research/promote-claim \
  -H "Content-Type: application/json" \
  -d '{
    "insightId": "<your-insight-id>",
    "claimId": "claim-1"
  }'

# Returns: { mainClaimId: "b2a492c4-...", linkedEvidenceCount: 3 }

# 3. Create a macro thesis (standalone)
curl -X POST http://localhost:3000/api/theses/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Physical AI Infrastructure Buildout (2025-2026)",
    "thesisType": "cyclical",
    "timeHorizon": "medium_term",
    "confidenceLevel": "high",
    "sectors": ["Technology", "Hardware"],
    "direction": "bullish",
    "linkedMainClaimIds": ["b2a492c4-..."]
  }'

# Returns: { thesisId: "...", linkedClaimsCount: 1 }

# 4. Link another main claim to the thesis
curl -X POST http://localhost:3000/api/main-claims/link-to-entity \
  -H "Content-Type: application/json" \
  -d '{
    "mainClaimId": "<another-claim-id>",
    "entityType": "thesis",
    "entityId": "<thesis-id>",
    "relationshipType": "supports"
  }'
```

---

## Testing

### Verify Evidence Linking Works

```bash
# Check evidence links for your promoted claim
npx tsx scripts/psql-query.ts "SELECT * FROM main_claim_evidence WHERE main_claim_id = 'b2a492c4-52b5-45e1-86d2-bdc2996c20b1'" --format json
```

**Expected**: Should see 3+ evidence claim records (supporting evidence from Claim 1).

**If empty**: The claim was promoted before the fix. Re-promote it to auto-link evidence.

---

### Run Full Workflow Test

```bash
npx tsx scripts/test-main-claims-workflow-fixed.ts
```

**Expected Output**:
```
📊 Main Claim Evidence Links: 3
📊 Claim-to-Thesis Links: 1
📈 Claim-to-View Links: 1

🎯 Key Workflow Verified:
  1. ✅ Promote claim (auto-links evidence)
  2. ✅ Create standalone thesis
  3. ✅ Link claim to thesis
  4. ✅ Create standalone view
  5. ✅ Link claim to view
```

---

## Migration Notes

### For Existing Promoted Claims

If you promoted claims BEFORE this fix (like the `b2a492c4-...` claim), evidence wasn't auto-linked.

**Option 1: Re-promote** (will fail if claim already exists - need to delete first)

**Option 2: Manual evidence linking**:
```bash
# Link evidence claims manually
curl -X POST http://localhost:3000/api/research/link-evidence \
  -H "Content-Type: application/json" \
  -d '{
    "mainClaimId": "b2a492c4-52b5-45e1-86d2-bdc2996c20b1",
    "evidenceClaimIds": ["claim-19", "claim-20", "claim-34"],
    "relationshipType": "supports"
  }'
```

---

## API Endpoint Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/research/promote-claim` | POST | Promote audit claim to main_claims (auto-links evidence) |
| `/api/research/link-evidence` | POST | Link evidence claims to main claim |
| `/api/research/convert-claim` | POST | Convert claim to thesis/view (with provenance) |
| `/api/theses/create` | POST | Create standalone macro thesis |
| `/api/asset-views/create` | POST | Create standalone asset view |
| `/api/main-claims/link-to-entity` | POST | Link main claim to thesis/view |

---

## Updated Documentation

- ✅ `docs/main-claims-implementation-progress.md` - Updated workflow summary
- ✅ `docs/main-claims-workflow-fixes.md` - This file (comprehensive fix summary)
