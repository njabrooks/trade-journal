/**
 * @deprecated This module is DEPRECATED as of January 2026.
 *
 * State codes have been replaced by Strategy Signals which provide:
 * - User-configurable trigger conditions (DTE, sigma, PnL%, price)
 * - Auto-evaluation during data ingestion
 * - TradingView webhook integration for price-based signals
 * - Full audit trail via signal_status_history
 *
 * See: /src/lib/derived/signalEvaluation.ts for the replacement
 * See: /src/components/signals/ for UI components
 *
 * This file is kept for historical reference only.
 * DO NOT import or use functions from this module in new code.
 *
 * ---
 *
 * ORIGINAL DOCUMENTATION:
 * State Code Computation
 *
 * Computes the current state code for a strategy based on playbook criteria.
 * State codes change based on:
 * - PnlPctOfCost (profit/loss percentage)
 * - MaxDTE (maximum days to expiry)
 * - WorstShortSigma (worst sigma-to-strike for short positions)
 * - AssignmentRisk (boolean)
 * - Legs ITM (boolean)
 */

import { db } from '@/db';
import { strategies, strategyMetricsSnapshots, positions, playbookItems, underlyingsIvHistory } from '@/db/schema';
import { eq, and, sql, isNotNull, inArray } from 'drizzle-orm';
import { toNumber } from '@/lib/numbers';

export interface StateCodeInput {
  strategyId: string;
  snapshotDate: string;
}

export interface StateCodeResult {
  stateCode: string | null;
  strategyType: string | null;
  criteria: string | null;
  label: string | null;
}

/**
 * Computes PnlPctOfCost for a strategy
 * PnlPctOfCost = (total_unrealized_pnl / entry_notional) * 100
 */
async function computePnlPctOfCost(strategyId: string, snapshotDate: string): Promise<number | null> {
  const strategy = await db
    .select({
      entryNotional: strategies.entryNotional,
    })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (!strategy[0]?.entryNotional) {
    return null;
  }

  // Get metrics for the specific snapshot date
  const metrics = await db
    .select({
      totalUnrealizedPnl: strategyMetricsSnapshots.totalUnrealizedPnl,
    })
    .from(strategyMetricsSnapshots)
    .where(
      and(
        eq(strategyMetricsSnapshots.strategyId, strategyId),
        eq(strategyMetricsSnapshots.snapshotDate, snapshotDate)
      )
    )
    .limit(1);

  const unrealizedPnl = metrics[0]?.totalUnrealizedPnl
    ? toNumber(metrics[0].totalUnrealizedPnl)
    : null;
  const entryNotional = toNumber(strategy[0].entryNotional);

  if (unrealizedPnl === null || entryNotional === null || entryNotional === 0) {
    return null;
  }

  return (unrealizedPnl / entryNotional) * 100;
}

/**
 * Computes WorstShortSigma for a strategy
 * Finds the minimum sigma-to-strike for all short option positions
 */
async function computeWorstShortSigma(
  strategyId: string,
  snapshotDate: string
): Promise<number | null> {
  const shortPositions = await db
    .select({
      spot: positions.spot,
      strike: positions.strike,
      expiry: positions.expiry,
      underlyingId: positions.underlyingId,
    })
    .from(positions)
    .where(
      and(
        eq(positions.strategyId, strategyId),
        eq(positions.snapshotDate, snapshotDate),
        eq(positions.side, 'SHORT'),
        eq(positions.assetClass, 'OPT'),
        isNotNull(positions.expiry),
        sql`${positions.quantity} != 0`
      )
    );

  if (shortPositions.length === 0) {
    return null;
  }

  const snapshotDateObj = new Date(snapshotDate + 'T00:00:00Z');
  const sigmaValues: number[] = [];

  for (const pos of shortPositions) {
    if (!pos.underlyingId || !pos.strike || !pos.expiry) continue;

    // Get IV and spot for underlying (need underlying spot, not option mark price)
    const ivResult = await db
      .select({ 
        iv30: underlyingsIvHistory.iv30,
        spot: underlyingsIvHistory.spot,
      })
      .from(underlyingsIvHistory)
      .where(
        and(
          eq(underlyingsIvHistory.underlyingId, pos.underlyingId),
          eq(underlyingsIvHistory.asOfDate, snapshotDate)
        )
      )
      .limit(1);

    const iv30 = ivResult[0]?.iv30 ? toNumber(ivResult[0].iv30) : null;
    if (!iv30 || iv30 <= 0) continue;

    // Use underlying spot for sigma calculation (not option mark price)
    const underlyingSpot = ivResult[0]?.spot ? toNumber(ivResult[0].spot) : null;
    if (!underlyingSpot || underlyingSpot <= 0) continue;

    // Compute DTE
    const expiryDate = new Date(pos.expiry + 'T00:00:00Z');
    const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
    const dte = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (dte <= 0) continue;

    // Compute sigma-to-strike using underlying spot
    const S = underlyingSpot;
    const K = toNumber(pos.strike);
    if (!K || K <= 0) continue;

    const T = dte / 365;
    const logRatio = Math.log(S / K);
    const denominator = iv30 * Math.sqrt(T);
    if (denominator === 0) continue;

    const sigma = Math.abs(logRatio) / denominator;
    sigmaValues.push(sigma);
  }

  return sigmaValues.length > 0 ? Math.min(...sigmaValues) : null;
}

/**
 * Checks if strategy has assignment risk
 */
async function hasAssignmentRisk(strategyId: string, snapshotDate: string): Promise<boolean> {
  const triageResult = await db
    .select({ flagAssignment: sql<boolean>`BOOL_OR(${sql.identifier('flag_assignment')})` })
    .from(sql`triage_records`)
    .where(
      and(
        sql`${sql.identifier('strategy_id')} = ${strategyId}`,
        sql`${sql.identifier('snapshot_date')} = ${snapshotDate}`,
        sql`${sql.identifier('context_level')} = 'position'`
      )
    )
    .limit(1);

  return triageResult[0]?.flagAssignment ?? false;
}

/**
 * Checks if any legs are ITM
 */
async function hasItmLegs(strategyId: string, snapshotDate: string): Promise<boolean> {
  const triageResult = await db
    .select({ isItm: sql<boolean>`BOOL_OR(${sql.identifier('is_itm')})` })
    .from(sql`triage_records`)
    .where(
      and(
        sql`${sql.identifier('strategy_id')} = ${strategyId}`,
        sql`${sql.identifier('snapshot_date')} = ${snapshotDate}`,
        sql`${sql.identifier('context_level')} = 'position'`
      )
    )
    .limit(1);

  return triageResult[0]?.isItm ?? false;
}

/**
 * Computes the current state code for a strategy based on playbook criteria
 */
export async function computeStateCode(
  input: StateCodeInput
): Promise<StateCodeResult | null> {
  const { strategyId, snapshotDate } = input;

  // Get strategy info
  const strategy = await db
    .select({
      strategyType: strategies.strategyType,
    })
    .from(strategies)
    .where(eq(strategies.id, strategyId))
    .limit(1);

  if (!strategy[0]?.strategyType) {
    return null;
  }

  const strategyType = strategy[0].strategyType;

  // Get all playbook items for this strategy type
  const playbookItemsList = await db
    .select()
    .from(playbookItems)
    .where(
      and(
        eq(playbookItems.strategyType, strategyType),
        eq(playbookItems.isActive, true)
      )
    )
    .orderBy(playbookItems.code);

  if (playbookItemsList.length === 0) {
    return null;
  }

  // Get strategy metrics
  const metrics = await db
    .select({
      maxDte: strategyMetricsSnapshots.maxDte,
    })
    .from(strategyMetricsSnapshots)
    .where(
      and(
        eq(strategyMetricsSnapshots.strategyId, strategyId),
        eq(strategyMetricsSnapshots.snapshotDate, snapshotDate)
      )
    )
    .limit(1);

  const maxDte = metrics[0]?.maxDte ?? null;

  // Compute values needed for criteria evaluation
  const pnlPctOfCost = await computePnlPctOfCost(strategyId, snapshotDate);
  const worstShortSigma = await computeWorstShortSigma(strategyId, snapshotDate);
  const assignmentRisk = await hasAssignmentRisk(strategyId, snapshotDate);
  const hasItm = await hasItmLegs(strategyId, snapshotDate);

  // Debug logging (can be removed later)
  if (playbookItemsList.length > 0 && (!pnlPctOfCost && !maxDte && worstShortSigma === null)) {
    console.log(`[StateCode Debug] Strategy ${strategyId} (${strategyType}) on ${snapshotDate}:`, {
      maxDte,
      pnlPctOfCost,
      worstShortSigma,
      assignmentRisk,
      hasItm,
      playbookItemsCount: playbookItemsList.length,
    });
  }

  // Evaluate each playbook item's criteria
  for (const item of playbookItemsList) {
    // Empty or null criteria = catch-all/default state code (always matches)
    // This ensures every strategy always has a state code
    if (!item.criteria || item.criteria.trim() === '') {
      return {
        stateCode: item.code,
        strategyType: item.strategyType,
        criteria: item.criteria || '',
        label: item.label,
      };
    }

    const criteria = item.criteria;
    
    // Handle OR conditions: split by " OR " and check if any clause matches
    // Handle both top-level OR (e.g., "PnlPctOfCost > 1.0 OR PnlPctOfCost < -0.5")
    // and nested OR in parentheses (e.g., "MaxDTE > 120 AND (WorstShortSigma is blank OR > 1.0σ)")
    if (criteria.includes(' OR ')) {
      // Check if OR is at top level (not inside parentheses with AND before it)
      // Simple heuristic: if criteria starts with a field name or number, OR is likely top-level
      // If it has "AND (" before OR, it's nested
      const hasNestedOr = /AND\s*\([^)]*OR[^)]*\)/i.test(criteria);
      
      if (hasNestedOr) {
        // Handle nested OR: evaluate the whole criteria, but handle OR parts specially
        // For now, let evaluateCriteriaClause handle it via the "is blank OR" pattern
        // This works for patterns like "(WorstShortSigma is blank OR > 1.0σ)"
        const matches = await evaluateCriteriaClause(
          criteria,
          maxDte,
          pnlPctOfCost,
          worstShortSigma,
          assignmentRisk,
          hasItm,
          item.code
        );
        if (matches) {
          return {
            stateCode: item.code,
            strategyType: item.strategyType,
            criteria: item.criteria,
            label: item.label,
          };
        }
        continue;
      } else {
        // Top-level OR: split and check each clause
        const orClauses = criteria.split(/\s+OR\s+/i);
        let anyClauseMatches = false;
        
        for (const clause of orClauses) {
          // Remove parentheses from clause if present
          let cleanClause = clause.trim();
          if (cleanClause.startsWith('(') && cleanClause.endsWith(')')) {
            cleanClause = cleanClause.slice(1, -1).trim();
          }
          
          // Evaluate this clause as if it were the full criteria
          const clauseMatches = await evaluateCriteriaClause(
            cleanClause,
            maxDte,
            pnlPctOfCost,
            worstShortSigma,
            assignmentRisk,
            hasItm,
            item.code
          );
          if (clauseMatches) {
            anyClauseMatches = true;
            break;
          }
        }
        
        if (!anyClauseMatches) {
          continue; // Try next playbook item
        }
        // If we get here, at least one OR clause matched, so this item matches
        return {
          stateCode: item.code,
          strategyType: item.strategyType,
          criteria: item.criteria,
          label: item.label,
        };
      }
    }
    
    // No OR conditions - evaluate normally with AND logic
    const matches = await evaluateCriteriaClause(
      criteria,
      maxDte,
      pnlPctOfCost,
      worstShortSigma,
      assignmentRisk,
      hasItm,
      item.code
    );

    if (matches) {
      return {
        stateCode: item.code,
        strategyType: item.strategyType,
        criteria: item.criteria,
        label: item.label,
      };
    }
  }

  // No matching state code found
  // Log warning with debug info and actionable guidance
  const missingData: string[] = [];
  if (pnlPctOfCost === null) {
    missingData.push('entryNotional (needed for PnlPctOfCost)');
  }
  if (maxDte === null && playbookItemsList.some(item => item.criteria?.includes('MaxDTE'))) {
    missingData.push('options positions (needed for MaxDTE)');
  }
  if (worstShortSigma === null && playbookItemsList.some(item => item.criteria?.includes('WorstShortSigma'))) {
    missingData.push('IV history data (needed for WorstShortSigma)');
  }
  
  const dataIssue = missingData.length > 0 
    ? ` Missing data: ${missingData.join(', ')}.`
    : '';
  
  console.warn(
    `No state code matched for strategy ${strategyId} (type: ${strategyType}) on ${snapshotDate}.` +
    ` Values: maxDte=${maxDte}, pnlPctOfCost=${pnlPctOfCost}, worstShortSigma=${worstShortSigma}, ` +
    `assignmentRisk=${assignmentRisk}, hasItm=${hasItm}.${dataIssue} ` +
    `Solution: Add a catch-all state code (empty criteria) for "${strategyType}" in the playbook admin, ` +
    `or fix missing data (e.g., set entryNotional on strategies).`
  );
  return null;
}

/**
 * Evaluates a single criteria clause (handles AND logic, but not OR)
 */
async function evaluateCriteriaClause(
  criteria: string,
  maxDte: number | null,
  pnlPctOfCost: number | null,
  worstShortSigma: number | null,
  assignmentRisk: boolean,
  hasItm: boolean,
  itemCode: string
): Promise<boolean> {
  let matches = true;

  // Strip comments in parentheses (e.g., "PnlPctOfCost > 1.0 (100%+ gain)" -> "PnlPctOfCost > 1.0")
  // This prevents regex from getting confused by parenthetical comments
  let cleanCriteria = criteria.replace(/\s*\([^)]*\)/g, '').trim();

  // Parse criteria (simplified parser - handles common patterns)
  // Examples:
  // "MaxDTE > 90 AND PnlPctOfCost ≤ 0.3"
  // "0.3 < PnlPctOfCost ≤ 1.0" (range condition)
  // "WorstShortSigma ≤ 0.5σ"
  // "HasAssignmentRisk = Yes"
  // "PnlPctOfCost > 1.0 OR PnlPctOfCost < -0.5" (handled at higher level)

  // Check for range conditions FIRST (e.g., "0.3 < PnlPctOfCost ≤ 1.0")
  // Pattern: lowerBound < Field ≤ upperBound
  const pnlRangeMatch = cleanCriteria.match(/([-\d.]+)\s*([<>≤≥=]+)\s*PnlPctOfCost\s*([<>≤≥=]+)\s*([-\d.]+)/i);
    if (pnlRangeMatch) {
      const lowerBound = parseFloat(pnlRangeMatch[1]);
      const lowerOp = pnlRangeMatch[2].trim();
      const upperOp = pnlRangeMatch[3].trim();
      const upperBound = parseFloat(pnlRangeMatch[4]);
      
      if (pnlPctOfCost === null) {
        matches = false;
      } else {
        // Lower bound: if "0.3 < PnlPctOfCost", then PnlPctOfCost > 0.3
        // If "0.3 ≤ PnlPctOfCost", then PnlPctOfCost >= 0.3
        const lowerMet = 
          (lowerOp === '<' && pnlPctOfCost > lowerBound) ||
          (lowerOp === '<=' && pnlPctOfCost >= lowerBound) ||
          (lowerOp === '≤' && pnlPctOfCost >= lowerBound) ||
          (lowerOp === '=' && pnlPctOfCost === lowerBound);
        
        // Upper bound: if "PnlPctOfCost ≤ 1.0", then PnlPctOfCost <= 1.0
        // If "PnlPctOfCost < 1.0", then PnlPctOfCost < 1.0
        const upperMet =
          (upperOp === '<=' && pnlPctOfCost <= upperBound) ||
          (upperOp === '≤' && pnlPctOfCost <= upperBound) ||
          (upperOp === '<' && pnlPctOfCost < upperBound) ||
          (upperOp === '=' && pnlPctOfCost === upperBound);
        
        if (!lowerMet || !upperMet) matches = false;
      }
    } else {
      // Only check single PnlPctOfCost condition if no range was found
      const pnlMatch = cleanCriteria.match(/PnlPctOfCost\s*([><=≤≥]+)\s*([-\d.]+)/i);
      if (pnlMatch) {
        const operator = pnlMatch[1].trim();
        const threshold = parseFloat(pnlMatch[2]);
        if (pnlPctOfCost === null) {
          // If PnlPctOfCost is null and criteria requires it, this condition fails
          // But only fail if this is the ONLY condition (no AND with other conditions)
          // If there are other conditions (like MaxDTE), we should still check those
          // For now, fail this condition but continue checking others
          matches = false;
        } else {
          const conditionMet =
            (operator === '>' && pnlPctOfCost > threshold) ||
            (operator === '>=' && pnlPctOfCost >= threshold) ||
            (operator === '<' && pnlPctOfCost < threshold) ||
            (operator === '<=' && pnlPctOfCost <= threshold) ||
            (operator === '≤' && pnlPctOfCost <= threshold) ||
            (operator === '≥' && pnlPctOfCost >= threshold) ||
            (operator === '=' && pnlPctOfCost === threshold);
          if (!conditionMet) matches = false;
        }
      }
    }

    // Check MaxDTE conditions
    const maxDteMatch = cleanCriteria.match(/MaxDTE\s*([><=≤≥]+)\s*(\d+)/i);
    if (maxDteMatch) {
      const operator = maxDteMatch[1].trim();
      const threshold = parseInt(maxDteMatch[2]);
      if (maxDte === null) {
        matches = false;
      } else {
        const conditionMet =
          (operator === '>' && maxDte > threshold) ||
          (operator === '>=' && maxDte >= threshold) ||
          (operator === '<' && maxDte < threshold) ||
          (operator === '<=' && maxDte <= threshold) ||
          (operator === '≤' && maxDte <= threshold) ||
          (operator === '≥' && maxDte >= threshold) ||
          (operator === '=' && maxDte === threshold);
        if (!conditionMet) matches = false;
      }
    }

    // Check for WorstShortSigma range conditions (e.g., "0.5σ < WorstShortSigma ≤ 1.0σ")
    const sigmaRangeMatch = cleanCriteria.match(/([-\d.]+)σ?\s*([<>≤≥=]+)\s*WorstShortSigma\s*([<>≤≥=]+)\s*([-\d.]+)σ?/i);
    if (sigmaRangeMatch) {
      const lowerBound = parseFloat(sigmaRangeMatch[1]);
      const lowerOp = sigmaRangeMatch[2].trim();
      const upperOp = sigmaRangeMatch[3].trim();
      const upperBound = parseFloat(sigmaRangeMatch[4]);
      
      if (worstShortSigma === null) {
        matches = false;
      } else {
        const lowerMet = 
          (lowerOp === '<' && worstShortSigma > lowerBound) ||
          (lowerOp === '<=' && worstShortSigma >= lowerBound) ||
          (lowerOp === '≤' && worstShortSigma >= lowerBound) ||
          (lowerOp === '=' && worstShortSigma === lowerBound);
        
        const upperMet =
          (upperOp === '<=' && worstShortSigma <= upperBound) ||
          (upperOp === '≤' && worstShortSigma <= upperBound) ||
          (upperOp === '<' && worstShortSigma < upperBound) ||
          (upperOp === '=' && worstShortSigma === upperBound);
        
        if (!lowerMet || !upperMet) matches = false;
      }
    } else {
      // Only check single WorstShortSigma condition if no range was found
      const sigmaMatch = cleanCriteria.match(/WorstShortSigma\s*([><=≤≥]+)\s*([-\d.]+)σ?/i);
      if (sigmaMatch) {
        const operator = sigmaMatch[1].trim();
        const threshold = parseFloat(sigmaMatch[2]);
        if (worstShortSigma === null) {
          matches = false;
        } else {
          const conditionMet =
            (operator === '>' && worstShortSigma > threshold) ||
            (operator === '>=' && worstShortSigma >= threshold) ||
            (operator === '<' && worstShortSigma < threshold) ||
            (operator === '<=' && worstShortSigma <= threshold) ||
            (operator === '≤' && worstShortSigma <= threshold) ||
            (operator === '≥' && worstShortSigma >= threshold) ||
            (operator === '=' && worstShortSigma === threshold);
          if (!conditionMet) matches = false;
        }
      }
    }

    // Check AssignmentRisk
    if (cleanCriteria.includes('HasAssignmentRisk') || cleanCriteria.includes('AssignmentRisk')) {
      const assignmentMatch = cleanCriteria.match(/AssignmentRisk\s*=\s*(Yes|True|"Yes")/i);
      if (assignmentMatch) {
        if (!assignmentRisk) matches = false;
      } else {
        const noAssignmentMatch = cleanCriteria.match(/AssignmentRisk\s*≠\s*("Yes"|Yes)/i);
        if (noAssignmentMatch && assignmentRisk) matches = false;
      }
    }

    // Check ITM
    if (cleanCriteria.includes('ITM') || cleanCriteria.includes('is_itm')) {
      const itmMatch = cleanCriteria.match(/(Legs\s+)?ITM\s*=\s*(True|Yes)/i);
      if (itmMatch && !hasItm) matches = false;
    }

    // Check for "not" conditions (e.g., "not LC2/LC3/LC4")
    const notMatch = cleanCriteria.match(/not\s+([A-Z0-9\/]+)/i);
    if (notMatch) {
      const excludedCodes = notMatch[1].split('/');
      if (excludedCodes.includes(itemCode)) {
        matches = false;
      }
    }
    
    // Check for "is blank" conditions (e.g., "WorstShortSigma is blank")
    // Also handle "is blank OR > X" pattern (e.g., "WorstShortSigma is blank OR > 1.0σ")
    if (cleanCriteria.includes('is blank') || cleanCriteria.includes('is null')) {
      if (cleanCriteria.includes('WorstShortSigma')) {
        // Pattern: "WorstShortSigma is blank OR > 1.0σ"
        const blankOrMatch = cleanCriteria.match(/WorstShortSigma\s+is\s+blank\s+OR\s+([><=≤≥]+)\s*([-\d.]+)σ?/i);
        if (blankOrMatch) {
          // This means: (worstShortSigma is null) OR (worstShortSigma > threshold)
          const operator = blankOrMatch[1].trim();
          const threshold = parseFloat(blankOrMatch[2]);
          if (worstShortSigma === null) {
            // null is acceptable, so this condition passes
            // matches stays true
          } else {
            // Must satisfy the comparison
            const conditionMet =
              (operator === '>' && worstShortSigma > threshold) ||
              (operator === '>=' && worstShortSigma >= threshold) ||
              (operator === '<' && worstShortSigma < threshold) ||
              (operator === '<=' && worstShortSigma <= threshold) ||
              (operator === '≤' && worstShortSigma <= threshold) ||
              (operator === '≥' && worstShortSigma >= threshold) ||
              (operator === '=' && worstShortSigma === threshold);
            if (!conditionMet) matches = false;
          }
        } else {
          // Simple "is blank" check
          if (worstShortSigma !== null) {
            matches = false;
          }
        }
      }
      // Could extend for other fields if needed
    }

    return matches;
}

/**
 * Fast state code change detection by reading from stored metrics
 * This is much faster than recomputing state codes since they're already stored
 * in strategy_metrics_snapshots.state_code during metrics computation
 */
export async function detectStateCodeChangeFromStored(
  strategyId: string,
  previousDate: string,
  currentDate: string
): Promise<{ previous: string | null; current: string | null; changed: boolean }> {
  // Read state codes from stored metrics (fast - just a query)
  const [previousMetric, currentMetric] = await Promise.all([
    db
      .select({ stateCode: strategyMetricsSnapshots.stateCode })
      .from(strategyMetricsSnapshots)
      .where(
        and(
          eq(strategyMetricsSnapshots.strategyId, strategyId),
          eq(strategyMetricsSnapshots.snapshotDate, previousDate)
        )
      )
      .limit(1),
    db
      .select({ stateCode: strategyMetricsSnapshots.stateCode })
      .from(strategyMetricsSnapshots)
      .where(
        and(
          eq(strategyMetricsSnapshots.strategyId, strategyId),
          eq(strategyMetricsSnapshots.snapshotDate, currentDate)
        )
      )
      .limit(1),
  ]);

  const previous = previousMetric[0]?.stateCode ?? null;
  const current = currentMetric[0]?.stateCode ?? null;

  return {
    previous,
    current,
    changed: previous !== current,
  };
}

/**
 * Detects state code changes between two snapshot dates
 * 
 * @deprecated Use detectStateCodeChangeFromStored() for better performance.
 * This function recomputes state codes which is expensive.
 * Only use this if state codes haven't been computed/stored yet.
 */
export async function detectStateCodeChange(
  strategyId: string,
  previousDate: string,
  currentDate: string
): Promise<{ previous: string | null; current: string | null; changed: boolean }> {
  const previous = await computeStateCode({ strategyId, snapshotDate: previousDate });
  const current = await computeStateCode({ strategyId, snapshotDate: currentDate });

  return {
    previous: previous?.stateCode ?? null,
    current: current?.stateCode ?? null,
    changed: (previous?.stateCode ?? null) !== (current?.stateCode ?? null),
  };
}

