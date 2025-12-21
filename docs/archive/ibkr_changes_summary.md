# IBKR Integration Changes Summary

## Overview
This document summarizes all changes made for IBKR integration. The final architecture is **on-demand ingestion** triggered when the user opens the app, fetching historical spot prices from IBKR's historical endpoint.

## Final Architecture
- **On-demand sync**: User opens app → checks for missing IBKR spot data → fetches historical data
- **Data strategy**: IBKR for historical spot prices, Massive for IV data
- **Source priority**: Spot from IBKR first, then Massive; IV always from Massive
- **CONID management**: Extracted from trades `rawRow` and stored in `underlyings` table

---

## ✅ CORE FUNCTIONALITY (Keep - Currently Used)

### 1. Database Schema Changes
**File**: `src/db/schema.ts`
- ✅ Added `conid: bigint('conid', { mode: 'number' })` to `underlyings` table
- **Status**: Active - Required for IBKR API calls

### 2. IBKR Service Layer (Core)
**Directory**: `src/lib/services/ibkr/`

#### ✅ `client.ts` - HTTP client
- Handles requests to IBKR Gateway
- SSL verification handling for self-signed certs
- Error handling with "no bridge" detection
- **Status**: Active - Core infrastructure

#### ✅ `contracts.ts` - Contract search
- `searchContract()` - Find CONID by ticker
- `getConid()`, `getConidCached()`, `getConidsBatch()` - CONID lookup
- **Status**: Active - Used for finding CONIDs when not in database

#### ✅ `marketdata.ts` - Market data API
- `getSnapshot()` - Current market data (spot, IV30)
- `getHistorical()` - Historical price data
- `extractSpot()`, `extractIv30()`, `extractBidAsk()` - Data extraction
- **Status**: Active - Core API functions

#### ✅ `historical-spot.ts` - Historical spot fetching
- `getHistoricalSpotForDate()` - Single date
- `getHistoricalSpotsForDates()` - Multiple dates (used by sync)
- **Status**: Active - Primary function for fetching historical spot data

#### ✅ `missing-data.ts` - Missing data detection
- `getTickersWithFirstPositionDate()` - Finds first trade date per ticker, extracts CONID from trades
- `findMissingDataRanges()` - Detects missing IBKR spot data
- `getMissingDataSummary()` - Summary stats for UI
- **Status**: Active - Used by sync API

#### ✅ `data-priority.ts` - Source priority logic
- `getIvDataWithPriority()` - Single underlying
- `getIvDataBatchWithPriority()` - Batch (used by triage)
- Priority: Spot (IBKR → Massive), IV (Massive only)
- **Status**: Active - Used by triage and strategies

#### ✅ `types.ts` - TypeScript interfaces
- API response types
- **Status**: Active - Type safety

#### ✅ `errors.ts` - Error classes
- `IbkrApiError`, `IbkrGatewayError`, `IbkrAuthError`, `IbkrContractNotFoundError`
- **Status**: Active - Error handling

#### ⚠️ `iv-data.ts` - IV snapshot fetching
- `fetchIvSnapshot()`, `fetchIvSnapshots()` - Fetch current IV/spot from snapshot API
- **Status**: Partially redundant - Was for snapshot API (current data only)
- **Note**: Not used by sync route (uses `historical-spot.ts` instead)
- **Decision**: Keep for potential future use (current day data), but not actively used

### 3. API Routes
**Directory**: `src/app/api/ibkr/`

#### ✅ `sync-data/route.ts` - On-demand sync endpoint
- `GET` - Check sync status and missing data summary
- `POST` - Trigger sync (fetches historical spot data)
- **Status**: Active - Primary entry point

### 4. UI Components
**Directory**: `src/components/ibkr/`

#### ✅ `DataSyncBanner.tsx` - Sync status banner
- Shows missing data status
- Triggers sync on button click
- **Status**: Active - User-facing UI

#### ✅ `src/components/ui/alert.tsx` - Alert component
- Used by DataSyncBanner
- **Status**: Active - UI component

### 5. Integration Points (Modified Files)

#### ✅ `src/lib/ingestion/flex/underlyings.ts`
- Modified `ensureUnderlyingId()` to extract CONID from trades when creating new underlyings
- **Status**: Active - Future-proofing

#### ✅ `src/lib/ingestion/underlyingsIvHistory.ts`
- Updated `RawIvSnapshot` interface (removed separate source fields)
- **Status**: Active - Data ingestion

#### ✅ `src/lib/derived/triage.ts`
- Updated to use `getIvDataBatchWithPriority()` for fetching IV/spot
- **Status**: Active - Triage calculations

#### ✅ `src/lib/services/strategies.ts`
- Updated to use priority-based fetching for `entryIv30`
- **Status**: Active - Strategy entry context

#### ✅ `src/components/layout/DashboardShell.tsx`
- Added `DataSyncBanner` component
- **Status**: Active - UI integration

---

## ⚠️ POTENTIALLY REDUNDANT (Review/Remove)

### 1. Scripts

#### ⚠️ `scripts/ingest-underlyings-ibkr.ts`
- Standalone script for ingesting IBKR data
- Originally for scheduled ingestion
- **Current status**: Not used (on-demand sync replaces this)
- **Decision**: **REMOVE** - Superseded by on-demand sync API route

#### ⚠️ `scripts/ibkr-gateway-service.ts`
- Long-running service for maintaining gateway connection
- Calls `/tickle` every minute
- Runs scheduled ingestion
- **Current status**: Not used (on-demand architecture doesn't need this)
- **Decision**: **REMOVE** - On-demand architecture doesn't require continuous service

### 2. GitHub Actions

#### ⚠️ `.github/workflows/ibkr-ingestion.yml`
- Scheduled daily ingestion via GitHub Actions
- **Current status**: Not used (on-demand sync replaces this)
- **Decision**: **REMOVE** - Superseded by on-demand sync

---

## 📚 DOCUMENTATION (Keep for Reference)

### ✅ Keep - Setup & Architecture
- `docs/ibkr_api_gateway_setup.md` - Gateway setup guide (useful reference)
- `docs/ibkr_on_demand_architecture.md` - Current architecture documentation
- `docs/ibkr_multi_source_strategy.md` - Multi-source data strategy
- `docs/ibkr_priority_strategy.md` - Source priority explanation

### ⚠️ Review - Historical/Deprecated Docs
- `docs/ibkr_implementation_summary.md` - May be outdated
- `docs/ibkr_local_service_setup.md` - For service architecture (deprecated)
- `docs/ibkr_service_architecture.md` - For service architecture (deprecated)
- **Decision**: Review and either update or remove if outdated

---

## 📝 MODIFIED EXISTING FILES

### Database
- `src/db/schema.ts` - Added `conid` to `underlyings` table

### Ingestion
- `src/lib/ingestion/flex/underlyings.ts` - CONID extraction on creation
- `src/lib/ingestion/underlyingsIvHistory.ts` - Interface updates

### Derived Data
- `src/lib/derived/triage.ts` - Priority-based data fetching
- `src/lib/services/strategies.ts` - Priority-based data fetching

### UI
- `src/components/layout/DashboardShell.tsx` - Added sync banner

### Docs
- `docs/FUTURE_ENHANCEMENTS.md` - Updated with IBKR status

---

## 🗑️ RECOMMENDED REMOVALS

### High Confidence (Safe to Remove)
1. ✅ `scripts/ingest-underlyings-ibkr.ts` - Replaced by on-demand sync
2. ✅ `scripts/ibkr-gateway-service.ts` - Not needed for on-demand
3. ✅ `.github/workflows/ibkr-ingestion.yml` - Replaced by on-demand sync

### Review First
4. ⚠️ `src/lib/services/ibkr/iv-data.ts` - Not currently used, but might be useful for current-day data
   - **Recommendation**: Keep but document it's for current-day snapshots only

5. ⚠️ Deprecated documentation files:
   - `docs/ibkr_local_service_setup.md`
   - `docs/ibkr_service_architecture.md`
   - `docs/ibkr_implementation_summary.md`
   - **Recommendation**: Review and consolidate or remove

---

## 📊 SUMMARY STATISTICS

### New Files Created
- **Services**: 11 TypeScript files in `src/lib/services/ibkr/`
- **API Routes**: 1 route in `src/app/api/ibkr/`
- **Components**: 1 component in `src/components/ibkr/`
- **Scripts**: 2 scripts (both recommended for removal)
- **Workflows**: 1 GitHub Action (recommended for removal)
- **Documentation**: 7 markdown files

### Modified Files
- 7 existing files modified

### Total Changes
- ~2,000+ lines of new code
- ~300 lines modified in existing files

---

## ✅ FINAL RECOMMENDATIONS

### Keep (Core Functionality)
1. All files in `src/lib/services/ibkr/` (except maybe `iv-data.ts` - see review)
2. `src/app/api/ibkr/sync-data/route.ts`
3. `src/components/ibkr/DataSyncBanner.tsx`
4. All modified files (schema, ingestion, derived data, UI)
5. Setup documentation (`ibkr_api_gateway_setup.md`)
6. Architecture documentation (`ibkr_on_demand_architecture.md`, `ibkr_multi_source_strategy.md`, `ibkr_priority_strategy.md`)

### Remove (Redundant)
1. `scripts/ingest-underlyings-ibkr.ts`
2. `scripts/ibkr-gateway-service.ts`
3. `.github/workflows/ibkr-ingestion.yml`

### Review & Consolidate
1. `src/lib/services/ibkr/iv-data.ts` - Keep if useful for current-day snapshots, otherwise remove
2. Deprecated documentation files - Review and consolidate or remove

---

## 🎯 CURRENT WORKING FLOW

1. User opens app → `DataSyncBanner` checks sync status
2. `GET /api/ibkr/sync-data` → Checks gateway auth, finds missing data
3. User clicks "Sync" → `POST /api/ibkr/sync-data` → Fetches historical spot data
4. `missing-data.ts` → Finds first trade date per ticker, extracts CONID from trades
5. `historical-spot.ts` → Fetches historical spot prices from IBKR
6. `upsertIvSnapshots()` → Stores spot data (source: 'ibkr')
7. `data-priority.ts` → When querying, prioritizes IBKR spot, Massive IV

