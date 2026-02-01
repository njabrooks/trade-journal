/**
 * Process Tracking Service
 * 
 * Tracks ingestion and computation processes to prevent race conditions
 * and provide visibility into background operations.
 */

import { db } from '@/db';
import { ingestionRuns, NewIngestionRun } from '@/db/schema';
import { eq, and, desc, isNull, or } from 'drizzle-orm';

export type JobType =
  | 'trade_ingestion'
  | 'position_ingestion'
  | 'flex_automated_ingestion'
  | 'hyperliquid_ingestion'
  | 'coinbase_prime_ingestion'
  | 'kraken_ingestion'
  | 'recompute_all'
  | 'recompute_portfolio'
  | 'recompute_strategy_metrics'
  | 'recompute_triage'
  | 'recompute_blotter'
  | 'recompute_blotter_trades';

export type ProcessStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ProcessTrigger = 'manual' | 'auto' | 'scheduled' | 'api';

export interface ProcessPayload {
  accountId?: string;
  snapshotDate?: string;
  startDate?: string;
  endDate?: string;
  strategyId?: string;
  [key: string]: any;
}

export interface ProcessResult {
  [key: string]: any;
}

/**
 * Creates a new process tracking record
 */
export async function startProcess(
  jobType: JobType,
  trigger: ProcessTrigger = 'manual',
  payload?: ProcessPayload
): Promise<string> {
  const [run] = await db
    .insert(ingestionRuns)
    .values({
      jobType,
      status: 'pending',
      trigger,
      accountId: payload?.accountId ?? null,
      payload: payload ? payload : null,
      startedAt: new Date(),
    })
    .returning({ id: ingestionRuns.id });

  // Immediately mark as running
  await db
    .update(ingestionRuns)
    .set({
      status: 'running',
      updatedAt: new Date(),
    })
    .where(eq(ingestionRuns.id, run.id));

  return run.id;
}

/**
 * Marks a process as completed with results
 */
export async function completeProcess(
  runId: string,
  result?: ProcessResult
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      status: 'completed',
      finishedAt: new Date(),
      result: result ? result : null,
      updatedAt: new Date(),
    })
    .where(eq(ingestionRuns.id, runId));
}

/**
 * Marks a process as failed with error message
 */
export async function failProcess(
  runId: string,
  error: string
): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      error,
      updatedAt: new Date(),
    })
    .where(eq(ingestionRuns.id, runId));
}

/**
 * Gets all active (running or pending) processes
 */
export async function getActiveProcesses(accountId?: string) {
  const statusConditions = [
    eq(ingestionRuns.status, 'running'),
    eq(ingestionRuns.status, 'pending'),
  ];

  const whereConditions = [
    or(...statusConditions),
    isNull(ingestionRuns.finishedAt),
  ];

  if (accountId) {
    whereConditions.push(eq(ingestionRuns.accountId, accountId));
  }

  return db
    .select()
    .from(ingestionRuns)
    .where(and(...whereConditions))
    .orderBy(desc(ingestionRuns.startedAt));
}

/**
 * Gets recent process history
 */
export async function getRecentProcesses(
  limit = 50,
  accountId?: string,
  jobType?: JobType
) {
  const conditions = [];
  if (accountId) {
    conditions.push(eq(ingestionRuns.accountId, accountId));
  }
  if (jobType) {
    conditions.push(eq(ingestionRuns.jobType, jobType));
  }

  return db
    .select()
    .from(ingestionRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(limit);
}

/**
 * Checks if there are any active processes that might conflict
 */
export async function hasActiveProcesses(
  accountId?: string,
  excludeJobTypes?: JobType[]
): Promise<boolean> {
  const active = await getActiveProcesses(accountId);
  
  if (excludeJobTypes && excludeJobTypes.length > 0) {
    return active.some(
      (run) => !excludeJobTypes.includes(run.jobType as JobType)
    );
  }
  
  return active.length > 0;
}

/**
 * Wrapper function to run a process with tracking
 */
export async function trackProcess<T>(
  jobType: JobType,
  trigger: ProcessTrigger,
  payload: ProcessPayload | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const runId = await startProcess(jobType, trigger, payload);

  try {
    const result = await fn();
    await completeProcess(runId, { success: true, data: result });
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    await failProcess(runId, errorMessage);
    throw error;
  }
}
