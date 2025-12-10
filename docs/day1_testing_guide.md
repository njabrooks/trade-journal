# Day 1 Testing Guide - Quick Reference

**Date**: 2025-11-20  
**Status**: 🔄 Ready to Start

## Step 1: Upload Day 1 Data

1. Go to `/admin/ingestion/flex`
2. Upload `2025-11-20_positions.csv`:
   - ✅ Check "Process all sections (POST, EQUT, MTMP)"
   - Click Upload
   - Verify success message
3. Upload `2025-11-20_trades.csv`:
   - Click Upload
   - Verify success message
4. Go to `/admin/ingestion/underlyings-iv`
5. Upload IV history for 2025-11-20 (if available)

## Step 2: Check Current State (Before Recompute)

1. Go to `/triage`
2. Note any existing triggers
3. Look for GLXY 21NOV25 40P position
4. Check if assignment risk trigger exists (should be SHORT, ITM, DTE <= 14)

## Step 3: Recompute Triage

1. The system should auto-recompute after ingestion
2. If not, trigger manual recompute (check if there's a button/API)
3. Wait for completion

## Step 4: Verify Expected Triggers

### Expected Triggers for Day 1:

1. **ASSIGNMENT_RISK≤14_DTE** (GLXY 21NOV25 40P)
   - Position: GLXY 21NOV25 40P
   - Side: SHORT
   - DTE: 1 (expires 2025-11-21)
   - Severity: `urgent`
   - Notes: Should mention assignment risk

2. **QUANTITY_CHANGE** triggers:
   - GLXY stock: 40000 → 43700 (add)
   - GLXY 21NOV25 40P: -38 → -1 (reduce - assignment)
   - Other option positions that changed

3. **REVIEW_DTE** triggers:
   - Options with DTE <= 30
   - GLXY 21NOV25 20P, 45C, 50C (expiring next day)

4. **CONFIRM_STRATEGIES** (if strategies not confirmed)

## Step 5: Test Each Scenario

### Test 1.1: Assignment Risk Detection
- [ ] Find GLXY 21NOV25 40P trigger
- [ ] Verify severity is `urgent`
- [ ] Verify notes mention assignment risk
- [ ] Test TRADE action
- [ ] Test MONITOR action (3-day period)
- [ ] Test DISMISS action

### Test 1.2: QUANTITY_CHANGE Detection
- [ ] Find QUANTITY_CHANGE triggers
- [ ] Verify GLXY stock change (40000 → 43700)
- [ ] Verify GLXY 21NOV25 40P change (-38 → -1)
- [ ] Check if strategy-level aggregation works
- [ ] Verify trade stage is correct ("add" or "reduce")

### Test 1.3: Record Pending TRADE Action
- [ ] Find a position-level trigger (e.g., REVIEW_DTE)
- [ ] Click Actions → Trade
- [ ] Fill in trade details
- [ ] Submit
- [ ] Verify blotter entry created
- [ ] Verify triage record severity → `pending`

### Test 1.4: Strategy Confirmation
- [ ] Find CONFIRM_STRATEGIES trigger
- [ ] Click Actions → Update
- [ ] Fill in strategy metadata
- [ ] Submit
- [ ] Verify strategy confirmed
- [ ] Verify triage record → `complete`

### Test 1.5: MONITOR and DISMISS Actions
- [ ] Test MONITOR action (7-day period)
- [ ] Verify `overrideExpiresDate` = 2025-11-27
- [ ] Verify severity → `monitor`
- [ ] Test DISMISS action
- [ ] Verify severity → `info`
- [ ] Verify `overrideExpiresDate` = null

## Step 6: Document Results

Update `docs/daily_ingestion_test_plan_data_driven.md` with:
- ✅ What worked
- ❌ What didn't work
- 🐛 Bugs found
- 🔧 Fixes applied

