import { describe, expect, it } from 'vitest';
import {
  assessmentForSignalCondition,
  recordBeliefEvidenceAssessment,
  type AssessmentJournalRow,
  type AssessmentSnapshotRow,
  type BeliefEvidenceAssessmentStore,
  type BeliefEvidenceAssessmentTransaction,
  type ClaimSignalEvidenceRow,
  type CurrentAssessmentTarget,
} from '../scripts/ops/record-belief-evidence-assessment.js';

const THESIS_ID = '00000000-0000-4000-8000-000000000001';
const ARTICULATION_ID = '00000000-0000-4000-8000-000000000002';
const CONFIRMATION_SIGNAL_ID = '00000000-0000-4000-8000-000000000003';
const INVALIDATION_SIGNAL_ID = '00000000-0000-4000-8000-000000000004';
const CLAIM_ID = '00000000-0000-4000-8000-000000000005';
const BATCH_ID = '00000000-0000-4000-8000-000000000006';
const CONFIRMATION_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000007';
const INVALIDATION_SNAPSHOT_ID = '00000000-0000-4000-8000-000000000008';

const currentTarget: CurrentAssessmentTarget = {
  thesis: {
    id: THESIS_ID,
    type: 'asset',
    title: 'Durable infrastructure adoption',
    status: 'closed',
  },
  articulation: {
    id: ARTICULATION_ID,
    version: 3,
    coreArgument: 'Adoption compounds while the principal regulatory risk recedes.',
    keyDrivers: ['Institutional adoption'],
    keyAssumptions: ['Regulatory access remains available'],
    timeframe: { horizon: 'medium_term' },
    notes: null,
    claimIdsUsed: [CLAIM_ID],
  },
  signals: [
    {
      id: CONFIRMATION_SIGNAL_ID,
      statement: 'Regulated institutions adopt the infrastructure.',
      type: 'confirmation',
      importance: 'critical',
      notes: 'Direct adoption evidence.',
      linkedClaimIds: [CLAIM_ID],
    },
    {
      id: INVALIDATION_SIGNAL_ID,
      statement: 'A regulator blocks institutional access.',
      type: 'invalidation',
      importance: 'critical',
      notes: 'The central falsification test.',
      linkedClaimIds: [CLAIM_ID],
    },
  ],
};

function validEnvelope() {
  return {
    recordingRequested: true,
    target: {
      thesisId: THESIS_ID,
      thesisType: 'asset',
      articulationId: ARTICULATION_ID,
      articulationVersion: 3,
      signalIds: [CONFIRMATION_SIGNAL_ID, INVALIDATION_SIGNAL_ID],
    },
    source: {
      kind: 'promoted_claim',
      claimId: CLAIM_ID,
    },
    assessments: [
      {
        signalId: CONFIRMATION_SIGNAL_ID,
        statement: 'Regulated institutions adopt the infrastructure.',
        type: 'confirmation',
        importance: 'critical',
        assessment: 'neutral',
        confidence: 'low',
        semanticBearing: 'none',
        evidenceSummary: 'The source does not report an adoption outcome.',
        findings: [],
        quotations: [],
        limitations: ['The event is scheduled but has no reported outcome.'],
        recommendation: 'Continue through the existing thesis-health path.',
      },
      {
        signalId: INVALIDATION_SIGNAL_ID,
        statement: 'A regulator blocks institutional access.',
        type: 'invalidation',
        importance: 'critical',
        assessment: 'strengthening',
        confidence: 'high',
        semanticBearing: 'direct',
        evidenceSummary: 'The regulator definitively closed the investigation, so the falsification risk receded and the thesis strengthened.',
        findings: ['The investigation was closed without enforcement.'],
        quotations: ['The investigation is closed.'],
        limitations: [],
        recommendation: 'Retain the evidence for thesis-health review.',
      },
    ],
    overallSummary: 'One neutral result and one thesis-strengthening result.',
  };
}

class MemoryStore implements BeliefEvidenceAssessmentStore {
  readonly committed = {
    snapshots: [] as AssessmentSnapshotRow[],
    claimEvidences: [] as ClaimSignalEvidenceRow[],
    journals: [] as AssessmentJournalRow[],
  };

  constructor(
    private readonly target: CurrentAssessmentTarget | null = currentTarget,
    private readonly claim: {
      id: string;
      sourceInsightId: string | null;
      sourceClaimId: string | null;
      sourceArtifactId: string | null;
    } = {
      id: CLAIM_ID,
      sourceInsightId: '00000000-0000-4000-8000-000000000009',
      sourceClaimId: 'claim-1',
      sourceArtifactId: null,
    },
  ) {}

  async transaction<T>(
    work: (transaction: BeliefEvidenceAssessmentTransaction) => Promise<T>,
  ): Promise<T> {
    const pending = {
      snapshots: [] as AssessmentSnapshotRow[],
      claimEvidences: [] as ClaimSignalEvidenceRow[],
      journals: [] as AssessmentJournalRow[],
    };
    const transaction: BeliefEvidenceAssessmentTransaction = {
      loadCurrentTarget: async () => this.target,
      loadPromotedClaim: async (claimId) =>
        claimId === this.claim.id ? this.claim : null,
      insertSnapshots: async (rows) => {
        pending.snapshots.push(...rows);
        return rows.map((row) => ({
          id: row.signalId === CONFIRMATION_SIGNAL_ID
            ? CONFIRMATION_SNAPSHOT_ID
            : INVALIDATION_SNAPSHOT_ID,
          signalId: row.signalId,
        }));
      },
      upsertClaimSignalEvidences: async (rows) => {
        pending.claimEvidences.push(...rows);
      },
      insertJournalEntries: async (rows) => {
        pending.journals.push(...rows);
      },
    };

    const result = await work(transaction);
    this.committed.snapshots.push(...pending.snapshots);
    this.committed.claimEvidences.push(...pending.claimEvidences);
    this.committed.journals.push(...pending.journals);
    return result;
  }
}

describe('belief-evidence assessment recorder', () => {
  it('binds the exact governed target and writes only the accepted atomic set', async () => {
    const store = new MemoryStore();

    const result = await recordBeliefEvidenceAssessment(validEnvelope(), {
      store,
      batchId: BATCH_ID,
      now: new Date('2026-08-08T15:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'recorded',
      batchId: BATCH_ID,
      target: validEnvelope().target,
      snapshotIds: [CONFIRMATION_SNAPSHOT_ID, INVALIDATION_SNAPSHOT_ID],
      claimEvidenceCount: 1,
      journalEntryCount: 2,
    });
    expect(store.committed.snapshots).toEqual([
      expect.objectContaining({
        signalId: CONFIRMATION_SIGNAL_ID,
        assessment: 'neutral',
        dataSource: 'qualitative',
      }),
      expect.objectContaining({
        signalId: INVALIDATION_SIGNAL_ID,
        assessment: 'strengthening',
        dataSource: 'qualitative',
      }),
    ]);
    expect(store.committed.claimEvidences).toEqual([{
      claimId: CLAIM_ID,
      signalId: INVALIDATION_SIGNAL_ID,
      assessment: 'strengthening',
      snapshotId: INVALIDATION_SNAPSHOT_ID,
    }]);
    expect(store.committed.journals.map(({ actionType }) => actionType)).toEqual([
      'belief_evidence_assessment_recorded',
      'signal_evidence_received',
    ]);
    expect(store.committed.journals.every(({ objectId }) => objectId === THESIS_ID)).toBe(true);
  });

  it('uses thesis-centric polarity for invalidation signals', () => {
    expect(assessmentForSignalCondition('invalidation', 'risk_receding')).toBe('strengthening');
    expect(assessmentForSignalCondition('invalidation', 'risk_growing')).toBe('weakening');
    expect(assessmentForSignalCondition('invalidation', 'condition_cleared')).toBe('confirmed');
    expect(assessmentForSignalCondition('invalidation', 'condition_triggered')).toBe('invalidated');
  });

  it.each([
    ['missing underwriting', null],
    ['stale articulation', {
      ...currentTarget,
      articulation: { ...currentTarget.articulation, id: '00000000-0000-4000-8000-000000000010' },
    }],
    ['stale active-signal set', {
      ...currentTarget,
      signals: currentTarget.signals.slice(0, 1),
    }],
  ])('rejects %s without partial writes', async (_name, target) => {
    const store = new MemoryStore(target);

    await expect(recordBeliefEvidenceAssessment(validEnvelope(), {
      store,
      batchId: BATCH_ID,
    })).rejects.toThrow(/unavailable|stale_target/);
    expect(store.committed).toEqual({ snapshots: [], claimEvidences: [], journals: [] });
  });

  it('requires complete source provenance and reuses a provenance-bearing promoted claim', async () => {
    const missingClaimStore = new MemoryStore(currentTarget, {
      id: '00000000-0000-4000-8000-000000000099',
      sourceInsightId: null,
      sourceClaimId: null,
      sourceArtifactId: null,
    });
    await expect(recordBeliefEvidenceAssessment(validEnvelope(), {
      store: missingClaimStore,
      batchId: BATCH_ID,
    })).rejects.toThrow(/promoted claim/);
    expect(missingClaimStore.committed.snapshots).toEqual([]);

    const sourceEnvelope = {
      ...validEnvelope(),
      source: {
        kind: 'source',
        title: 'Regulator decision',
        sourceType: 'filing',
        contentSha256: 'a'.repeat(64),
        stableUrl: 'https://example.test/decision',
      },
    };
    const sourceStore = new MemoryStore();
    await recordBeliefEvidenceAssessment(sourceEnvelope, {
      store: sourceStore,
      batchId: BATCH_ID,
    });
    expect(sourceStore.committed.claimEvidences).toEqual([]);
  });

  it('refuses malformed, indirect, incomplete, and authority-expanding input before writes', async () => {
    const forbiddenInputs = [
      { ...validEnvelope(), recordingRequested: false },
      { ...validEnvelope(), source: { kind: 'source', title: 'Untethered source' } },
      {
        ...validEnvelope(),
        assessments: validEnvelope().assessments.map((assessment) =>
          assessment.assessment === 'strengthening'
            ? { ...assessment, semanticBearing: 'retrieval_only' }
            : assessment),
      },
      { ...validEnvelope(), thesisStatus: 'monitoring' },
      { ...validEnvelope(), signalStatus: 'complete' },
      { ...validEnvelope(), decisionItem: { action: 'raise' } },
      { ...validEnvelope(), strategy: { status: 'active' } },
      { ...validEnvelope(), position: { quantity: 1 } },
      { ...validEnvelope(), trade: { side: 'BUY' } },
      { ...validEnvelope(), createClaim: { title: 'Duplicate' } },
      { ...validEnvelope(), manualSignal: { explicitDetails: {} } },
      { ...validEnvelope(), adHocWrite: 'UPDATE signals SET status = complete' },
    ];

    for (const input of forbiddenInputs) {
      const store = new MemoryStore();
      await expect(recordBeliefEvidenceAssessment(input, {
        store,
        batchId: BATCH_ID,
      })).rejects.toThrow();
      expect(store.committed).toEqual({ snapshots: [], claimEvidences: [], journals: [] });
    }
  });
});
