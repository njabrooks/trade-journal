#!/usr/bin/env tsx

import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export type ThesisType = 'macro' | 'asset';
export type AssessmentValue =
  | 'neutral'
  | 'strengthening'
  | 'confirmed'
  | 'weakening'
  | 'invalidated';
export type SignalType = 'confirmation' | 'invalidation' | 'completion';
export type SignalConditionEffect =
  | 'risk_receding'
  | 'risk_growing'
  | 'condition_cleared'
  | 'condition_triggered'
  | 'no_bearing';

export interface UnderwritingClaimContext {
  id: string;
  title: string;
  category: string;
  claim: string;
  evidence: string[] | null;
  reasoning: string | null;
  backing: string | null;
  qualifier: string | null;
  rebuttal: string[] | null;
  timeHorizon: string | null;
  status: string;
  mappingType: string;
  provenance: {
    sourceInsightId: string | null;
    sourceClaimId: string | null;
    sourceArtifactId: string | null;
    sourceType: string | null;
    sourceTitle: string | null;
    sourceUrl: string | null;
    publishedDate: string | null;
    rawContent: string | null;
  };
}

export interface PriorSignalEvidenceContext {
  id: string;
  signalId: string;
  snapshotDate: Date;
  assessment: string | null;
  evidenceSummary: string | null;
  dataSource: string;
  claimId: string | null;
}

export interface BoundAssessmentTarget {
  thesisId: string;
  thesisType: ThesisType;
  articulationId: string;
  articulationVersion: number;
  signalIds: string[];
}

export interface CurrentAssessmentTarget {
  thesis: {
    id: string;
    type: ThesisType;
    title: string;
    status: string;
  };
  articulation: {
    id: string;
    version: number;
    coreArgument: string;
    keyDrivers: unknown;
    keyAssumptions: unknown;
    timeframe: unknown;
    notes: unknown;
    claimIdsUsed: string[];
  };
  signals: Array<{
    id: string;
    statement: string;
    type: SignalType;
    importance: string;
    notes: string | null;
    linkedClaimIds: string[];
  }>;
  claimsAndObservations: UnderwritingClaimContext[];
  priorEvidence: PriorSignalEvidenceContext[];
}

interface PromotedClaim {
  id: string;
  sourceInsightId: string | null;
  sourceClaimId: string | null;
  sourceArtifactId: string | null;
}

export interface AssessmentSnapshotRow {
  signalId: string;
  snapshotDate: Date;
  assessment: AssessmentValue;
  evidenceSummary: string;
  dataSource: 'qualitative';
}

export interface ClaimSignalEvidenceRow {
  claimId: string;
  signalId: string;
  assessment: Exclude<AssessmentValue, 'neutral'>;
  snapshotId: string;
}

export interface AssessmentJournalRow {
  objectType: 'macro_thesis' | 'asset_thesis';
  objectId: string;
  objectTitle: string;
  actionType:
    | 'belief_evidence_assessment_recorded'
    | 'signal_evidence_received';
  actionDescription: string;
  skillInvoked: 'belief-evidence-assessment';
  source: 'skill';
  metadata: Record<string, unknown>;
  batchId: string;
  firstDetectedAt: Date;
  lastSeenAt: Date;
  occurrenceCount: 1;
  status: 'active';
}

export interface BeliefEvidenceAssessmentTransaction {
  loadCurrentTarget(
    thesisId: string,
    thesisType: ThesisType,
  ): Promise<CurrentAssessmentTarget | null>;
  loadPromotedClaim(claimId: string): Promise<PromotedClaim | null>;
  insertSnapshots(
    rows: AssessmentSnapshotRow[],
  ): Promise<Array<{ id: string; signalId: string }>>;
  upsertClaimSignalEvidences(rows: ClaimSignalEvidenceRow[]): Promise<void>;
  insertJournalEntries(rows: AssessmentJournalRow[]): Promise<void>;
}

export interface BeliefEvidenceAssessmentStore {
  transaction<T>(
    work: (transaction: BeliefEvidenceAssessmentTransaction) => Promise<T>,
  ): Promise<T>;
}

interface PromotedClaimSource {
  kind: 'promoted_claim';
  claimId: string;
}

interface ExternalSource {
  kind: 'source';
  title: string;
  sourceType: string;
  contentSha256: string;
  stableUrl?: string;
  fileLabel?: string;
  observedAt?: string;
  publishedAt?: string;
}

export interface SignalAssessment {
  signalId: string;
  statement: string;
  type: SignalType;
  importance: string;
  assessment: AssessmentValue;
  confidence: 'high' | 'medium' | 'low';
  semanticBearing: 'direct' | 'retrieval_only' | 'none';
  evidenceSummary: string;
  findings: string[];
  quotations: string[];
  limitations: string[];
  recommendation: string;
  conditionEffect?: SignalConditionEffect;
}

export interface AssessmentEnvelope {
  recordingRequested: true;
  target: BoundAssessmentTarget;
  source: PromotedClaimSource | ExternalSource;
  assessments: SignalAssessment[];
  overallSummary: string;
}

export class AssessmentRecordingError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'unavailable' | 'stale_target',
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'AssessmentRecordingError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ASSESSMENTS = new Set<AssessmentValue>([
  'neutral',
  'strengthening',
  'confirmed',
  'weakening',
  'invalidated',
]);
const SIGNAL_TYPES = new Set<SignalType>([
  'confirmation',
  'invalidation',
  'completion',
]);
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const BEARING = new Set(['direct', 'retrieval_only', 'none']);

function fail(message: string): never {
  throw new AssessmentRecordingError('invalid_input', message);
}

function requireObjectRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      `${path} fields are invalid` +
      `${missing.length > 0 ? `; missing ${missing.join(', ')}` : ''}` +
      `${unknown.length > 0 ? `; forbidden ${unknown.join(', ')}` : ''}`,
    );
  }
}

function nonempty(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function uuid(value: unknown, path: string): string {
  const parsed = nonempty(value, path);
  if (!UUID.test(parsed)) fail(`${path} must be a UUID`);
  return parsed;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    fail(`${path} must be an array of strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function isoDate(value: unknown, path: string): string {
  const parsed = nonempty(value, path);
  if (!Number.isFinite(Date.parse(parsed))) fail(`${path} must be an ISO date-time`);
  return parsed;
}

function parseTarget(value: unknown): BoundAssessmentTarget {
  const target = requireObjectRecord(value, 'target');
  exactKeys(
    target,
    ['thesisId', 'thesisType', 'articulationId', 'articulationVersion', 'signalIds'],
    [],
    'target',
  );
  const thesisType = target.thesisType;
  if (thesisType !== 'macro' && thesisType !== 'asset') {
    fail('target.thesisType must be macro or asset');
  }
  if (!Number.isInteger(target.articulationVersion) || Number(target.articulationVersion) < 1) {
    fail('target.articulationVersion must be a positive integer');
  }
  if (!Array.isArray(target.signalIds) || target.signalIds.length === 0) {
    fail('target.signalIds must contain the complete active signal set');
  }
  const signalIds = target.signalIds.map((id, index) => uuid(id, `target.signalIds[${index}]`));
  if (new Set(signalIds).size !== signalIds.length) {
    fail('target.signalIds must not contain duplicates');
  }
  return {
    thesisId: uuid(target.thesisId, 'target.thesisId'),
    thesisType,
    articulationId: uuid(target.articulationId, 'target.articulationId'),
    articulationVersion: Number(target.articulationVersion),
    signalIds,
  };
}

function parseSource(value: unknown): PromotedClaimSource | ExternalSource {
  const source = requireObjectRecord(value, 'source');
  if (source.kind === 'promoted_claim') {
    exactKeys(source, ['kind', 'claimId'], [], 'source');
    return { kind: 'promoted_claim', claimId: uuid(source.claimId, 'source.claimId') };
  }
  if (source.kind !== 'source') fail('source.kind must be promoted_claim or source');
  exactKeys(
    source,
    ['kind', 'title', 'sourceType', 'contentSha256'],
    ['stableUrl', 'fileLabel', 'observedAt', 'publishedAt'],
    'source',
  );
  const contentSha256 = nonempty(source.contentSha256, 'source.contentSha256');
  if (!SHA256.test(contentSha256)) {
    fail('source.contentSha256 must be a hexadecimal SHA-256 digest');
  }
  const parsed: ExternalSource = {
    kind: 'source',
    title: nonempty(source.title, 'source.title'),
    sourceType: nonempty(source.sourceType, 'source.sourceType'),
    contentSha256: contentSha256.toLowerCase(),
  };
  if (source.stableUrl !== undefined) parsed.stableUrl = nonempty(source.stableUrl, 'source.stableUrl');
  if (source.fileLabel !== undefined) parsed.fileLabel = nonempty(source.fileLabel, 'source.fileLabel');
  if (source.observedAt !== undefined) parsed.observedAt = isoDate(source.observedAt, 'source.observedAt');
  if (source.publishedAt !== undefined) parsed.publishedAt = isoDate(source.publishedAt, 'source.publishedAt');
  return parsed;
}

function parseAssessment(value: unknown, index: number): SignalAssessment {
  const path = `assessments[${index}]`;
  const assessment = requireObjectRecord(value, path);
  exactKeys(
    assessment,
    [
      'signalId',
      'statement',
      'type',
      'importance',
      'assessment',
      'confidence',
      'semanticBearing',
      'evidenceSummary',
      'findings',
      'quotations',
      'limitations',
      'recommendation',
    ],
    ['conditionEffect'],
    path,
  );
  if (!SIGNAL_TYPES.has(assessment.type as SignalType)) fail(`${path}.type is invalid`);
  if (!ASSESSMENTS.has(assessment.assessment as AssessmentValue)) {
    fail(`${path}.assessment is invalid`);
  }
  if (!CONFIDENCE.has(String(assessment.confidence))) fail(`${path}.confidence is invalid`);
  if (!BEARING.has(String(assessment.semanticBearing))) {
    fail(`${path}.semanticBearing is invalid`);
  }
  if (assessment.assessment !== 'neutral' && assessment.semanticBearing !== 'direct') {
    fail(`${path} requires direct semantic bearing for a non-neutral result`);
  }
  let conditionEffect: SignalConditionEffect | undefined;
  if (assessment.type === 'invalidation') {
    const effect = assessment.conditionEffect;
    const allowedEffects = new Set<SignalConditionEffect>([
      'risk_receding',
      'risk_growing',
      'condition_cleared',
      'condition_triggered',
      'no_bearing',
    ]);
    if (!allowedEffects.has(effect as SignalConditionEffect)) {
      fail(`${path}.conditionEffect is required for an invalidation signal`);
    }
    conditionEffect = effect as SignalConditionEffect;
    const expected = assessmentForInvalidationCondition(conditionEffect);
    if (assessment.assessment !== expected) {
      fail(`${path}.assessment must be ${expected} for invalidation conditionEffect ${conditionEffect}`);
    }
  } else if (assessment.conditionEffect !== undefined) {
    fail(`${path}.conditionEffect is only valid for an invalidation signal`);
  }
  return {
    signalId: uuid(assessment.signalId, `${path}.signalId`),
    statement: nonempty(assessment.statement, `${path}.statement`),
    type: assessment.type as SignalType,
    importance: nonempty(assessment.importance, `${path}.importance`),
    assessment: assessment.assessment as AssessmentValue,
    confidence: assessment.confidence as SignalAssessment['confidence'],
    semanticBearing: assessment.semanticBearing as SignalAssessment['semanticBearing'],
    evidenceSummary: nonempty(assessment.evidenceSummary, `${path}.evidenceSummary`),
    findings: stringArray(assessment.findings, `${path}.findings`),
    quotations: stringArray(assessment.quotations, `${path}.quotations`),
    limitations: stringArray(assessment.limitations, `${path}.limitations`),
    recommendation: nonempty(assessment.recommendation, `${path}.recommendation`),
    ...(conditionEffect === undefined ? {} : { conditionEffect }),
  };
}

function parseEnvelope(value: unknown): AssessmentEnvelope {
  const envelope = requireObjectRecord(value, 'assessment envelope');
  exactKeys(
    envelope,
    ['recordingRequested', 'target', 'source', 'assessments', 'overallSummary'],
    [],
    'assessment envelope',
  );
  if (envelope.recordingRequested !== true) {
    fail('recordingRequested must be explicitly true');
  }
  const target = parseTarget(envelope.target);
  if (!Array.isArray(envelope.assessments)) fail('assessments must be an array');
  const assessments = envelope.assessments.map(parseAssessment);
  if (assessments.length !== target.signalIds.length) {
    fail('assessments must contain exactly one result for every targeted signal');
  }
  const assessmentIds = assessments.map(({ signalId }) => signalId);
  if (new Set(assessmentIds).size !== assessmentIds.length) {
    fail('assessments must not contain duplicate signal IDs');
  }
  if (assessmentIds.slice().sort().join(',') !== target.signalIds.slice().sort().join(',')) {
    fail('assessments must match the complete targeted signal set');
  }
  return {
    recordingRequested: true,
    target,
    source: parseSource(envelope.source),
    assessments,
    overallSummary: nonempty(envelope.overallSummary, 'overallSummary'),
  };
}

function assessmentForInvalidationCondition(
  effect: SignalConditionEffect,
): AssessmentValue {
  return {
    risk_receding: 'strengthening',
    risk_growing: 'weakening',
    condition_cleared: 'confirmed',
    condition_triggered: 'invalidated',
    no_bearing: 'neutral',
  }[effect] as AssessmentValue;
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.slice().sort().every((id, index) => id === right.slice().sort()[index]);
}

function validateCurrentTarget(
  bound: BoundAssessmentTarget,
  current: CurrentAssessmentTarget | null,
  assessments: SignalAssessment[],
): asserts current is CurrentAssessmentTarget {
  if (!current) {
    throw new AssessmentRecordingError(
      'unavailable',
      'no current governed articulation and active resolution-signal set exists',
    );
  }
  if (
    current.thesis.id !== bound.thesisId
    || current.thesis.type !== bound.thesisType
    || current.articulation.id !== bound.articulationId
    || current.articulation.version !== bound.articulationVersion
    || !sameIds(current.signals.map(({ id }) => id), bound.signalIds)
  ) {
    throw new AssessmentRecordingError(
      'stale_target',
      'the latest articulation or complete active signal set changed before persistence',
    );
  }

  const currentSignals = new Map(current.signals.map((signal) => [signal.id, signal]));
  for (const assessment of assessments) {
    const signal = currentSignals.get(assessment.signalId);
    if (
      !signal
      || signal.statement !== assessment.statement
      || signal.type !== assessment.type
      || signal.importance !== assessment.importance
    ) {
      throw new AssessmentRecordingError(
        'stale_target',
        `signal ${assessment.signalId} no longer matches the assessed resolution statement`,
      );
    }
  }
}

function hasPromotedClaimProvenance(claim: PromotedClaim): boolean {
  return claim.sourceArtifactId !== null
    || (claim.sourceInsightId !== null && claim.sourceClaimId !== null);
}

export async function recordBeliefEvidenceAssessment(
  input: unknown,
  dependencies: {
    store: BeliefEvidenceAssessmentStore;
    now?: Date;
    batchId?: string;
  },
) {
  const envelope = parseEnvelope(input);
  const now = dependencies.now ?? new Date();
  const batchId = dependencies.batchId ?? randomUUID();

  return dependencies.store.transaction(async (transaction) => {
    const current = await transaction.loadCurrentTarget(
      envelope.target.thesisId,
      envelope.target.thesisType,
    );
    validateCurrentTarget(envelope.target, current, envelope.assessments);

    let claim: PromotedClaim | null = null;
    if (envelope.source.kind === 'promoted_claim') {
      claim = await transaction.loadPromotedClaim(envelope.source.claimId);
      if (!claim || !hasPromotedClaimProvenance(claim)) {
        throw new AssessmentRecordingError(
          'unavailable',
          'the referenced promoted claim does not exist with source provenance',
        );
      }
    }

    const assessmentBySignal = new Map(
      envelope.assessments.map((assessment) => [assessment.signalId, assessment]),
    );
    const orderedAssessments = envelope.target.signalIds.map((signalId) =>
      assessmentBySignal.get(signalId) as SignalAssessment);
    const snapshots = await transaction.insertSnapshots(
      orderedAssessments.map((assessment) => ({
        signalId: assessment.signalId,
        snapshotDate: now,
        assessment: assessment.assessment,
        evidenceSummary: assessment.evidenceSummary,
        dataSource: 'qualitative',
      })),
    );
    if (snapshots.length !== orderedAssessments.length) {
      throw new Error('snapshot insertion did not return one row per targeted signal');
    }
    const snapshotBySignal = new Map(snapshots.map((snapshot) => [snapshot.signalId, snapshot.id]));
    const nonNeutral = orderedAssessments.filter(
      (assessment): assessment is SignalAssessment & {
        assessment: Exclude<AssessmentValue, 'neutral'>;
      } => assessment.assessment !== 'neutral',
    );

    if (claim && nonNeutral.length > 0) {
      await transaction.upsertClaimSignalEvidences(
        nonNeutral.map((assessment) => ({
          claimId: claim.id,
          signalId: assessment.signalId,
          assessment: assessment.assessment,
          snapshotId: snapshotBySignal.get(assessment.signalId) as string,
        })),
      );
    }

    const objectType = envelope.target.thesisType === 'macro'
      ? 'macro_thesis' as const
      : 'asset_thesis' as const;
    const commonJournal = {
      objectType,
      objectId: envelope.target.thesisId,
      objectTitle: current.thesis.title,
      skillInvoked: 'belief-evidence-assessment' as const,
      source: 'skill' as const,
      batchId,
      firstDetectedAt: now,
      lastSeenAt: now,
      occurrenceCount: 1 as const,
      status: 'active' as const,
    };
    const journalRows: AssessmentJournalRow[] = [
      {
        ...commonJournal,
        actionType: 'belief_evidence_assessment_recorded',
        actionDescription: `Recorded qualitative evidence assessment for ${orderedAssessments.length} governed signal(s)`,
        metadata: {
          target: envelope.target,
          sourceProvenance: envelope.source,
          snapshotIds: orderedAssessments.map(({ signalId }) => snapshotBySignal.get(signalId)),
          overallSummary: envelope.overallSummary,
          recordingDisposition: 'recorded',
        },
      },
      ...nonNeutral.map((assessment): AssessmentJournalRow => ({
        ...commonJournal,
        actionType: 'signal_evidence_received',
        actionDescription: `Signal "${assessment.statement}" received ${assessment.assessment} qualitative evidence`,
        metadata: {
          signalId: assessment.signalId,
          snapshotId: snapshotBySignal.get(assessment.signalId),
          assessment: assessment.assessment,
          confidence: assessment.confidence,
          dataSource: 'qualitative',
          claimId: claim?.id ?? null,
          batchId,
        },
      })),
    ];
    await transaction.insertJournalEntries(journalRows);

    return {
      status: 'recorded' as const,
      batchId,
      target: envelope.target,
      snapshotIds: orderedAssessments.map(({ signalId }) => snapshotBySignal.get(signalId) as string),
      claimEvidenceCount: claim ? nonNeutral.length : 0,
      journalEntryCount: journalRows.length,
    };
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log([
      'Usage:',
      '  npx tsx scripts/ops/record-belief-evidence-assessment.ts --target --thesis-id <uuid> --thesis-type <macro|asset>',
      '  <assessment-envelope.json npx tsx scripts/ops/record-belief-evidence-assessment.ts --stdin',
      '',
      '--target is read-only. --stdin records only the validated, target-bound write set.',
    ].join('\n'));
    return;
  }
  if (!process.argv.includes('--stdin') && !process.argv.includes('--target')) {
    throw new AssessmentRecordingError(
      'invalid_input',
      'pass --target --thesis-id <uuid> --thesis-type <macro|asset> or pipe an envelope with --stdin',
    );
  }
  const [{ db, closeDb }, { createDatabaseStore }] = await Promise.all([
    import('../lib/db.js'),
    import('./lib/belief-evidence-assessment-db.js'),
  ]);
  const store = createDatabaseStore(db);
  try {
    if (process.argv.includes('--target')) {
      const thesisId = uuid(argument('--thesis-id'), '--thesis-id');
      const thesisType = argument('--thesis-type');
      if (thesisType !== 'macro' && thesisType !== 'asset') {
        fail('--thesis-type must be macro or asset');
      }
      const current = await store.transaction((transaction) =>
        transaction.loadCurrentTarget(thesisId, thesisType));
      if (!current) {
        throw new AssessmentRecordingError(
          'unavailable',
          'no current governed articulation and active resolution-signal set exists',
        );
      }
      const target: BoundAssessmentTarget = {
        thesisId,
        thesisType,
        articulationId: current.articulation.id,
        articulationVersion: current.articulation.version,
        signalIds: current.signals.map(({ id }) => id),
      };
      console.log(JSON.stringify({ status: 'available', target, context: current }));
      return;
    }

    const result = await recordBeliefEvidenceAssessment(
      JSON.parse(await readStdin()) as unknown,
      { store },
    );
    console.log(JSON.stringify(result));
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof AssessmentRecordingError ? error.code : 'failed';
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'failed', code, error: message }));
    process.exit(1);
  });
}
