/**
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
async function computePnlPctOfCost(strategyId: string): Promise<number | null> {
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

  // Get latest metrics
  const latestMetrics = await db
    .select({
      totalUnrealizedPnl: strategyMetricsSnapshots.totalUnrealizedPnl,
    })
    .from(strategyMetricsSnapshots)
    .where(eq(strategyMetricsSnapshots.strategyId, strategyId))
    .orderBy(sql`${strategyMetricsSnapshots.snapshotDate} DESC`)
    .limit(1);

  const unrealizedPnl = latestMetrics[0]?.totalUnrealizedPnl
    ? toNumber(latestMetrics[0].totalUnrealizedPnl)
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
    if (!pos.underlyingId || !pos.spot || !pos.strike || !pos.expiry) continue;

    // Get IV for underlying
    const ivResult = await db
      .select({ iv30: underlyingsIvHistory.iv30 })
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

    // Compute DTE
    const expiryDate = new Date(pos.expiry + 'T00:00:00Z');
    const diffTime = expiryDate.getTime() - snapshotDateObj.getTime();
    const dte = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (dte <= 0) continue;

    // Compute sigma-to-strike
    const S = toNumber(pos.spot);
    const K = toNumber(pos.strike);
    if (!S || !K || S <= 0 || K <= 0) continue;

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
  const pnlPctOfCost = await computePnlPctOfCost(strategyId);
  const worstShortSigma = await computeWorstShortSigma(strategyId, snapshotDate);
  const assignmentRisk = await hasAssignmentRisk(strategyId, snapshotDate);
  const hasItm = await hasItmLegs(strategyId, snapshotDate);

  // Evaluate each playbook item's criteria
  for (const item of playbookItemsList) {
    if (!item.criteria) continue;

    const criteria = item.criteria;
    let matches = true;

    // Parse criteria (simplified parser - handles common patterns)
    // Examples:
    // "MaxDTE > 90 AND PnlPctOfCost ≤ 0.3"
    // "WorstShortSigma ≤ 0.5σ"
    // "HasAssignmentRisk = Yes"

    // Check MaxDTE conditions
    const maxDteMatch = criteria.match(/MaxDTE\s*([><=]+)\s*(\d+)/i);
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
          (operator === '=' && maxDte === threshold);
        if (!conditionMet) matches = false;
      }
    }

    // Check PnlPctOfCost conditions
    const pnlMatch = criteria.match(/PnlPctOfCost\s*([><=]+)\s*([\d.]+)/i);
    if (pnlMatch) {
      const operator = pnlMatch[1].trim();
      const threshold = parseFloat(pnlMatch[2]);
      if (pnlPctOfCost === null) {
        matches = false;
      } else {
        const conditionMet =
          (operator === '>' && pnlPctOfCost > threshold) ||
          (operator === '>=' && pnlPctOfCost >= threshold) ||
          (operator === '<' && pnlPctOfCost < threshold) ||
          (operator === '<=' && pnlPctOfCost <= threshold) ||
          (operator === '=' && pnlPctOfCost === threshold);
        if (!conditionMet) matches = false;
      }
    }

    // Check WorstShortSigma conditions
    const sigmaMatch = criteria.match(/WorstShortSigma\s*([><=]+)\s*([\d.]+)σ?/i);
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
          (operator === '=' && worstShortSigma === threshold);
        if (!conditionMet) matches = false;
      }
    }

    // Check AssignmentRisk
    if (criteria.includes('HasAssignmentRisk') || criteria.includes('AssignmentRisk')) {
      const assignmentMatch = criteria.match(/AssignmentRisk\s*=\s*(Yes|True|"Yes")/i);
      if (assignmentMatch) {
        if (!assignmentRisk) matches = false;
      } else {
        const noAssignmentMatch = criteria.match(/AssignmentRisk\s*≠\s*("Yes"|Yes)/i);
        if (noAssignmentMatch && assignmentRisk) matches = false;
      }
    }

    // Check ITM
    if (criteria.includes('ITM') || criteria.includes('is_itm')) {
      const itmMatch = criteria.match(/(Legs\s+)?ITM\s*=\s*(True|Yes)/i);
      if (itmMatch && !hasItm) matches = false;
    }

    // Check for "not" conditions (e.g., "not LC2/LC3/LC4")
    const notMatch = criteria.match(/not\s+([A-Z0-9\/]+)/i);
    if (notMatch) {
      const excludedCodes = notMatch[1].split('/');
      if (excludedCodes.includes(item.code)) {
        matches = false;
      }
    }

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
  return null;
}

/**
 * Detects state code changes between two snapshot dates
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

