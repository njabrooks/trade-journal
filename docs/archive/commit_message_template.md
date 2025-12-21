# Commit Message Template

This template provides a structure for commit messages that ensures clarity, traceability, and consistency.

## Format

```
<type>(<scope>): <subject>

<detailed description>

## Problem
- <issue or bug description>
- <context or background>

## Solution
- <what was changed>
- <how it was implemented>
- <key technical details>

## Impact
- <what this fixes or improves>
- <any breaking changes>
- <performance implications>

## Files Changed
- <file1>: <brief description of changes>
- <file2>: <brief description of changes>
```

## Commit Types

- `fix`: Bug fix
- `feat`: New feature
- `chore`: Maintenance tasks (dependencies, formatting, etc.)
- `refactor`: Code restructuring without changing functionality
- `docs`: Documentation changes
- `test`: Test additions or changes
- `perf`: Performance improvements
- `style`: Code style changes (formatting, no logic change)

## Examples

### Example 1: Bug Fix with Detailed Context

```
fix(triage): require underlying spot data for option triggers and add cleanup for recomputes

Fix false positive ITM triggers and ensure all position-level triggers that depend
on spot/ITM/sigma calculations require underlying spot data for options. Add cleanup
functionality to recompute endpoints to remove stale records when logic changes.

## Problem
- ITM triggers were firing incorrectly for options when underlying spot data was missing
- Old code used position.spot (option mark price) instead of underlying spot for ITM calculation
- Stale triage records persisted after logic changes or when underlying data was added later
- Upsert logic only deleted records when new ones were inserted, leaving orphaned records

## Solution

### 1. Require underlying spot data for options
- All position-level triggers (ITM, sigma, assignment risk) now require underlying spot
  data for options before creating triage records
- For options: only use underlyingSpot (never position.spot which is option mark price)
- For stocks: prefer underlyingSpot but fallback to position.spot
- Added hasRequiredSpotData check consistently across all spot-dependent triggers
- Added warning log if ITM calculation attempted without underlying spot

### 2. Cleanup functionality for recomputes
- Added deleteTriageRecordsForDate() and deleteTriageRecordsForDateRange() functions
- Modified computeTriageForDate() to accept cleanFirst parameter
- Full recomputes (date range) now clean all records first, then recompute fresh
- Strategy-specific recomputes (after merge/linking) clean only that strategy's records
- Daily incremental updates (ingestion) remain unchanged - use upsert logic, no cleanup

### 3. Updated recompute endpoints
- /api/recompute/all: cleans date range before recomputing
- Strategy merge: cleans target strategy records before recomputing
- Strategy linking: cleans affected strategy records before recomputing

## Impact
- Prevents false positive ITM triggers when underlying data is missing
- Ensures recomputes produce clean, accurate results
- Daily production workflow preserved (incremental updates unchanged)
- Strategy-specific recomputes are now thorough and reliable

## Files Changed
- src/lib/derived/triage.ts: Core logic fixes and cleanup functions
- src/app/api/recompute/all/route.ts: Added cleanup for date ranges
- src/lib/services/strategies.ts: Added cleanup for strategy merge
- src/lib/services/strategyLinking.ts: Added cleanup for strategy linking
```

### Example 2: Chore/Maintenance Commit

```
chore: update dependencies and fix PositionList duplicate fetch issue

- Update Supabase packages (2.84.0 → 2.87.0)
- Update TypeScript ESLint (8.47.0 → 8.49.0)
- Update other dev dependencies (drizzle-kit, browserslist, etc.)
- Fix PositionList component to prevent duplicate API calls on re-render
  - Added refs to track fetch state and prevent duplicate requests
  - Better component lifecycle handling for position/strategy changes
- Formatting cleanup in underlyings-iv ingestion page
```

## Guidelines

1. **Subject Line**: Keep under 72 characters, use imperative mood
2. **Detailed Description**: Explain the "what" and "why", not just "how"
3. **Problem Section**: Clearly state what issue this addresses
4. **Solution Section**: Break down into logical subsections if complex
5. **Impact Section**: Note any breaking changes, performance implications, or workflow changes
6. **Files Changed**: List key files and what changed in each

## When to Use Full Template

- **Always use full template for**: Bug fixes, feature additions, refactors that change behavior
- **Simplified format OK for**: Dependency updates, formatting, minor UI tweaks, documentation

## Quick Reference

**Simple commit:**
```
<type>(<scope>): <subject>

- <change 1>
- <change 2>
- <change 3>
```

**Complex commit:**
```
<type>(<scope>): <subject>

<brief description>

## Problem
- <issue>

## Solution
- <fix>

## Impact
- <result>

## Files Changed
- <file>: <change>
```

