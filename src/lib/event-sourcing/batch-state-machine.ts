/**
 * Batch State Machine Service
 *
 * Manages import batch lifecycle through explicit state transitions.
 * Ported from twotreescap-app as part of M2 migration.
 */

import {
  getImportBatchById,
  createImportBatch,
  updateImportBatchStatus,
  updateImportBatchProgress,
  setImportBatchCalcPhase,
  failImportBatch,
  completeImportBatch,
  getActiveImportBatches,
} from "@/db/queries/importBatches";
import type {
  SelectImportBatch,
  BatchStatus,
  CalcPhase,
  BatchStateMachineInterface,
} from "@/types/event-sourcing";
import { VALID_TRANSITIONS, isValidTransition } from "@/types/event-sourcing";

export class BatchStateMachine implements BatchStateMachineInterface {
  async create(
    userId: string,
    source: string,
    filename: string,
    fileHash: string
  ): Promise<SelectImportBatch> {
    const batch = await createImportBatch({
      userId,
      source,
      filename,
      fileHash,
    });

    console.log(`Created import batch ${batch.id} for ${source}:${filename}`);
    return batch;
  }

  async transition(
    batchId: string,
    toStatus: BatchStatus,
    metadata?: Partial<SelectImportBatch>
  ): Promise<SelectImportBatch> {
    const current = await this.get(batchId);

    if (!isValidTransition(current.status as BatchStatus, toStatus)) {
      throw new Error(
        `Invalid state transition for batch ${batchId}: ${current.status} → ${toStatus}. ` +
        `Allowed transitions: ${VALID_TRANSITIONS[current.status as BatchStatus]?.join(', ') || 'none'}`
      );
    }

    const updated = await updateImportBatchStatus(batchId, toStatus, metadata);
    console.log(`Batch ${batchId}: ${current.status} → ${toStatus}`);
    return updated;
  }

  async updateProgress(batchId: string, processed: number, total: number): Promise<void> {
    await updateImportBatchProgress(batchId, processed, total);
  }

  async setCalcPhase(
    batchId: string,
    phase: CalcPhase,
    progress?: Record<string, unknown>
  ): Promise<void> {
    await setImportBatchCalcPhase(batchId, phase, progress);
    console.log(`Batch ${batchId}: calc phase → ${phase}`);
  }

  async fail(batchId: string, error: Error): Promise<void> {
    await failImportBatch(batchId, error);
    console.error(`Batch ${batchId} failed:`, error.message);
  }

  async complete(batchId: string): Promise<void> {
    await completeImportBatch(batchId);
    console.log(`Batch ${batchId} completed successfully`);
  }

  async get(batchId: string): Promise<SelectImportBatch> {
    const batch = await getImportBatchById(batchId);
    if (!batch) {
      throw new Error(`Import batch ${batchId} not found`);
    }
    return batch;
  }

  async getActive(userId: string): Promise<SelectImportBatch[]> {
    return getActiveImportBatches(userId);
  }

  async executePhase<T>(
    batchId: string,
    currentPhase: BatchStatus,
    nextPhase: BatchStatus,
    operation: () => Promise<T>
  ): Promise<T> {
    const batch = await this.get(batchId);
    if (batch.status !== currentPhase) {
      throw new Error(
        `Expected batch ${batchId} to be in ${currentPhase} state, but found ${batch.status}`
      );
    }

    try {
      const result = await operation();
      await this.transition(batchId, nextPhase);
      return result;
    } catch (error) {
      await this.fail(batchId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async executeCalcPhase<T>(
    batchId: string,
    phase: CalcPhase,
    operation: (updateProgress: (progress: Record<string, unknown>) => Promise<void>) => Promise<T>
  ): Promise<T> {
    await this.setCalcPhase(batchId, phase);

    const updateProgressFn = async (progress: Record<string, unknown>) => {
      await this.setCalcPhase(batchId, phase, progress);
    };

    try {
      return await operation(updateProgressFn);
    } catch (error) {
      await this.fail(batchId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  getStatusInfo(batch: SelectImportBatch): {
    label: string;
    description: string;
    progress: number;
    isTerminal: boolean;
  } {
    const statusInfo: Record<BatchStatus, { label: string; description: string; progress: number }> = {
      pending: { label: 'Pending', description: 'Waiting to start', progress: 0 },
      parsing: { label: 'Parsing', description: 'Reading file contents', progress: 10 },
      validating: { label: 'Validating', description: 'Checking data quality', progress: 30 },
      persisting: { label: 'Saving', description: 'Writing to database', progress: 50 },
      calculating: { label: 'Calculating', description: 'Computing derived values', progress: 70 },
      completed: { label: 'Completed', description: 'Successfully finished', progress: 100 },
      failed: { label: 'Failed', description: batch.errorMessage || 'An error occurred', progress: 0 },
    };

    const info = statusInfo[batch.status as BatchStatus] || {
      label: batch.status,
      description: 'Unknown status',
      progress: 0,
    };

    if (batch.status === 'calculating' && batch.calcPhase) {
      const calcPhaseProgress: Record<CalcPhase, number> = {
        sort_indexes: 72,
        running_quantity: 75,
        cost_basis: 80,
        average_cost_basis: 83,
        gbp_conversion: 85,
        daily_balances: 87,
        price_population: 90,
        market_value_enrichment: 93,
        daily_nav: 96,
        completed: 99,
      };
      info.progress = calcPhaseProgress[batch.calcPhase as CalcPhase] || info.progress;
      info.description = `Calculating: ${batch.calcPhase.replace(/_/g, ' ')}`;
    }

    return {
      ...info,
      isTerminal: batch.status === 'completed' || batch.status === 'failed',
    };
  }
}

let machineInstance: BatchStateMachine | null = null;

export function getBatchStateMachine(): BatchStateMachine {
  if (!machineInstance) {
    machineInstance = new BatchStateMachine();
  }
  return machineInstance;
}

export function resetBatchStateMachine(): void {
  machineInstance = null;
}
