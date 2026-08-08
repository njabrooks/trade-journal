import { createHash } from 'node:crypto';

export interface ClaimsSynthesisSourceClaim {
  sourceClaimId: string;
  title: string;
  category: 'macro' | 'asset_specific';
  claim: string;
  evidence: string[];
  reasoning: string | null;
  backing: string | null;
  qualifier: string | null;
  rebuttal: string[];
  timeHorizon: string | null;
  relevantTickers: string[];
}

export interface ClaimsSynthesisSource {
  authority: 'scope:notes';
  artifactId: string;
  insightId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  contentSha256: string;
  observedAt: string | null;
  claims: ClaimsSynthesisSourceClaim[];
}

export interface ClaimsSynthesisMainClaim {
  id: string;
  title: string;
  category: 'macro' | 'asset_specific';
  claim: string;
  status: string;
  sourceInsightId: string | null;
  sourceClaimId: string | null;
  provenanceMatch: 'exact' | 'none';
}

export interface ClaimsSynthesisThesisTarget {
  id: string;
  type: 'macro' | 'asset';
  title: string;
  description: string | null;
  direction: string | null;
  status: 'developing' | 'monitoring';
  ticker: string | null;
}

export interface ClaimsSynthesisContext {
  contractVersion: '1.0.0';
  source: Omit<ClaimsSynthesisSource, 'claims'>;
  sourceEvidence: ClaimsSynthesisSourceClaim[];
  existingMainClaims: ClaimsSynthesisMainClaim[];
  thesisTargets: ClaimsSynthesisThesisTarget[];
}

export interface ClaimsSynthesisRepositorySnapshot {
  existingMainClaims: Array<Omit<ClaimsSynthesisMainClaim, 'provenanceMatch'>>;
  theses: ClaimsSynthesisThesisTarget[];
}

export type ClaimsSynthesisUnavailableReason =
  | 'database_unavailable'
  | 'source_unavailable'
  | 'environment_unavailable';

export interface ClaimsSynthesisUnavailableResult {
  contractVersion: '1.0.0';
  status: 'unavailable';
  reason: ClaimsSynthesisUnavailableReason;
  detail: string;
  execution: { mode: 'recommendation_only'; writes: [] };
}

export interface ClaimsSynthesisReadyResult {
  contractVersion: '1.0.0';
  contextDigest: string;
  status: 'ready';
  sourceEvidence: Array<{ insightId: string; sourceClaimId: string }>;
  existingMainClaims: Array<{
    sourceClaimId: string;
    mainClaimId: string;
    disposition: 'reuse_exact_provenance';
  }>;
  synthesizedInvestmentClaims: Array<ClaimsSynthesisSourceClaim & {
    ref: string;
    synthesisRationale: string;
  }>;
  thesisMappings: Array<{
    sourceClaimId: string;
    mainClaimRef: string;
    thesisId: string;
    thesisType: 'macro' | 'asset';
    relationship: 'supports' | 'refutes' | 'foundation';
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
  }>;
  ambiguities: Array<{
    sourceClaimId: string;
    axis: 'claim_identity' | 'thesis_mapping';
    kind: 'semantic_match' | 'claim_distinction' | 'thesis_bearing';
    candidateMainClaimIds: string[];
    candidateThesisIds: string[];
    reason: string;
  }>;
  recommendations: Array<{
    sourceClaimId: string;
    action: 'reuse_existing_claim' | 'synthesize_investment_claim' | 'defer_ambiguous' | 'no_investment_claim';
    rationale: string;
  }>;
  execution: { mode: 'recommendation_only'; writes: [] };
  limitations: string[];
}

function fail(path: string, message: string): never {
  throw new Error(`${path} ${message}`);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  return value;
}

function nullableStringAt(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringAt(value, path);
}

function stringArrayAt(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    fail(path, 'must be a string array');
  }
  return [...value];
}

function arrayAt(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  if (value.length > maximum) fail(path, `must contain at most ${maximum} items`);
  return value;
}

function assertAllowedKeys(value: Record<string, unknown>, path: string, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) fail(path, `contains unsupported fields: ${unexpected.join(', ')}`);
}

function uuidAt(value: unknown, path: string): string {
  const result = stringAt(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    fail(path, 'must be a UUID');
  }
  return result;
}

function nullableUuidAt(value: unknown, path: string): string | null {
  if (value === null) return null;
  return uuidAt(value, path);
}

const CLAIM_KEYS = [
  'sourceClaimId', 'title', 'category', 'claim', 'evidence', 'reasoning', 'backing',
  'qualifier', 'rebuttal', 'timeHorizon', 'relevantTickers',
];

function claimAt(
  value: unknown,
  index: number,
  collection = 'source.claims',
  extraAllowed: string[] = [],
): ClaimsSynthesisSourceClaim {
  const path = `${collection}[${index}]`;
  const claim = objectAt(value, path);
  assertAllowedKeys(claim, path, [...CLAIM_KEYS, ...extraAllowed]);
  const category = stringAt(claim.category, `${path}.category`);
  if (category !== 'macro' && category !== 'asset_specific') {
    fail(`${path}.category`, 'must be macro or asset_specific');
  }
  return {
    sourceClaimId: stringAt(claim.sourceClaimId, `${path}.sourceClaimId`),
    title: stringAt(claim.title, `${path}.title`),
    category,
    claim: stringAt(claim.claim, `${path}.claim`),
    evidence: stringArrayAt(claim.evidence, `${path}.evidence`),
    reasoning: nullableStringAt(claim.reasoning, `${path}.reasoning`),
    backing: nullableStringAt(claim.backing, `${path}.backing`),
    qualifier: nullableStringAt(claim.qualifier, `${path}.qualifier`),
    rebuttal: stringArrayAt(claim.rebuttal, `${path}.rebuttal`),
    timeHorizon: nullableStringAt(claim.timeHorizon, `${path}.timeHorizon`),
    relevantTickers: stringArrayAt(claim.relevantTickers, `${path}.relevantTickers`),
  };
}

export function validateClaimsSynthesisSource(value: unknown): ClaimsSynthesisSource {
  const source = objectAt(value, 'source');
  if (source.authority !== 'scope:notes') {
    fail('source.authority', 'must be scope:notes');
  }
  if (!Array.isArray(source.claims) || source.claims.length === 0) {
    fail('source.claims', 'must contain at least one claim');
  }
  if (source.claims.length > 25) fail('source.claims', 'must contain at most 25 claims');
  const contentSha256 = stringAt(source.contentSha256, 'source.contentSha256');
  if (!/^sha256:[0-9a-f]{64}$/i.test(contentSha256)) {
    fail('source.contentSha256', 'must be a SHA-256 digest');
  }
  const claims = source.claims.map((claim, index) => claimAt(claim, index));
  if (new Set(claims.map((claim) => claim.sourceClaimId)).size !== claims.length) {
    fail('source.claims.sourceClaimId', 'must be unique within the insight');
  }
  return {
    authority: 'scope:notes',
    artifactId: uuidAt(source.artifactId, 'source.artifactId'),
    insightId: uuidAt(source.insightId, 'source.insightId'),
    title: stringAt(source.title, 'source.title'),
    sourceType: stringAt(source.sourceType, 'source.sourceType'),
    sourceUrl: nullableStringAt(source.sourceUrl, 'source.sourceUrl'),
    contentSha256,
    observedAt: nullableStringAt(source.observedAt, 'source.observedAt'),
    claims,
  };
}

function mainClaimAt(value: unknown, index: number): Omit<ClaimsSynthesisMainClaim, 'provenanceMatch'> {
  const path = `context.existingMainClaims[${index}]`;
  const claim = objectAt(value, path);
  assertAllowedKeys(claim, path, [
    'id', 'title', 'category', 'claim', 'status', 'sourceInsightId', 'sourceClaimId',
    'provenanceMatch',
  ]);
  const category = stringAt(claim.category, `${path}.category`);
  if (category !== 'macro' && category !== 'asset_specific') {
    fail(`${path}.category`, 'must be macro or asset_specific');
  }
  if (claim.provenanceMatch !== 'exact' && claim.provenanceMatch !== 'none') {
    fail(`${path}.provenanceMatch`, 'must be exact or none');
  }
  return {
    id: uuidAt(claim.id, `${path}.id`),
    title: stringAt(claim.title, `${path}.title`),
    category,
    claim: stringAt(claim.claim, `${path}.claim`),
    status: stringAt(claim.status, `${path}.status`),
    sourceInsightId: nullableUuidAt(claim.sourceInsightId, `${path}.sourceInsightId`),
    sourceClaimId: nullableStringAt(claim.sourceClaimId, `${path}.sourceClaimId`),
  };
}

function thesisAt(value: unknown, index: number): ClaimsSynthesisThesisTarget {
  const path = `context.thesisTargets[${index}]`;
  const thesis = objectAt(value, path);
  assertAllowedKeys(thesis, path, [
    'id', 'type', 'title', 'description', 'direction', 'status', 'ticker',
  ]);
  if (thesis.type !== 'macro' && thesis.type !== 'asset') {
    fail(`${path}.type`, 'must be macro or asset');
  }
  if (thesis.status !== 'developing' && thesis.status !== 'monitoring') {
    fail(`${path}.status`, 'must be developing or monitoring');
  }
  return {
    id: uuidAt(thesis.id, `${path}.id`),
    type: thesis.type,
    title: stringAt(thesis.title, `${path}.title`),
    description: nullableStringAt(thesis.description, `${path}.description`),
    direction: nullableStringAt(thesis.direction, `${path}.direction`),
    status: thesis.status,
    ticker: nullableStringAt(thesis.ticker, `${path}.ticker`),
  };
}

export function validateClaimsSynthesisContext(value: unknown): ClaimsSynthesisContext {
  const context = objectAt(value, 'context');
  assertAllowedKeys(context, 'context', [
    'contractVersion', 'source', 'sourceEvidence', 'existingMainClaims', 'thesisTargets',
  ]);
  if (context.contractVersion !== '1.0.0') fail('context.contractVersion', 'must be 1.0.0');
  const sourceHeader = objectAt(context.source, 'context.source');
  assertAllowedKeys(sourceHeader, 'context.source', [
    'authority', 'artifactId', 'insightId', 'title', 'sourceType', 'sourceUrl',
    'contentSha256', 'observedAt',
  ]);
  const sourceEvidence = arrayAt(context.sourceEvidence, 'context.sourceEvidence', 25);
  const source = validateClaimsSynthesisSource({ ...sourceHeader, claims: sourceEvidence });
  const existingValues = arrayAt(context.existingMainClaims, 'context.existingMainClaims', 100000);
  const existingMainClaims = existingValues.map(mainClaimAt);
  if (new Set(existingMainClaims.map((claim) => claim.id)).size !== existingMainClaims.length) {
    fail('context.existingMainClaims', 'must contain unique claim IDs');
  }
  const thesisValues = arrayAt(context.thesisTargets, 'context.thesisTargets', 300);
  const theses = thesisValues.map(thesisAt);
  if (new Set(theses.map((thesis) => thesis.id)).size !== theses.length) {
    fail('context.thesisTargets', 'must contain unique thesis IDs');
  }
  const rebuilt = buildClaimsSynthesisContext(source, { existingMainClaims, theses });
  const suppliedProvenance = existingValues.map((value, index) =>
    objectAt(value, `context.existingMainClaims[${index}]`).provenanceMatch);
  if (rebuilt.existingMainClaims.some((claim, index) => claim.provenanceMatch !== suppliedProvenance[index])) {
    fail('context.existingMainClaims.provenanceMatch', 'must match deterministic source provenance');
  }
  return rebuilt;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function digestClaimsSynthesisContext(context: ClaimsSynthesisContext): string {
  const bytes = JSON.stringify(canonicalize(context));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function createUnavailableClaimsSynthesisResult(
  reason: ClaimsSynthesisUnavailableReason,
  detail: string,
): ClaimsSynthesisUnavailableResult {
  return {
    contractVersion: '1.0.0',
    status: 'unavailable',
    reason,
    detail: stringAt(detail, 'unavailable.detail'),
    execution: { mode: 'recommendation_only', writes: [] },
  };
}

function validateExecution(value: unknown): { mode: 'recommendation_only'; writes: [] } {
  const execution = objectAt(value, 'result.execution');
  assertAllowedKeys(execution, 'result.execution', ['mode', 'writes']);
  if (execution.mode !== 'recommendation_only') {
    fail('result.execution.mode', 'must be recommendation_only');
  }
  if (!Array.isArray(execution.writes) || execution.writes.length !== 0) {
    fail('result.execution.writes', 'must be empty');
  }
  return { mode: 'recommendation_only', writes: [] };
}

export function validateClaimsSynthesisResult(
  context: ClaimsSynthesisContext,
  value: unknown,
): ClaimsSynthesisReadyResult {
  const result = objectAt(value, 'result');
  assertAllowedKeys(result, 'result', [
    'contractVersion',
    'contextDigest',
    'status',
    'sourceEvidence',
    'existingMainClaims',
    'synthesizedInvestmentClaims',
    'thesisMappings',
    'ambiguities',
    'recommendations',
    'execution',
    'limitations',
  ]);
  if (result.contractVersion !== '1.0.0') fail('result.contractVersion', 'must be 1.0.0');
  if (result.status !== 'ready') fail('result.status', 'must be ready');
  const expectedDigest = digestClaimsSynthesisContext(context);
  if (result.contextDigest !== expectedDigest) fail('result.contextDigest', 'does not match the supplied context');
  const execution = validateExecution(result.execution);

  const sourceIds = new Set(context.sourceEvidence.map((claim) => claim.sourceClaimId));
  const evidence = arrayAt(result.sourceEvidence, 'result.sourceEvidence', 25).map((item, index) => {
    const row = objectAt(item, `result.sourceEvidence[${index}]`);
    assertAllowedKeys(row, `result.sourceEvidence[${index}]`, ['insightId', 'sourceClaimId']);
    const insightId = uuidAt(row.insightId, `result.sourceEvidence[${index}].insightId`);
    const sourceClaimId = stringAt(row.sourceClaimId, `result.sourceEvidence[${index}].sourceClaimId`);
    if (insightId !== context.source.insightId || !sourceIds.has(sourceClaimId)) {
      fail(`result.sourceEvidence[${index}]`, 'must reference supplied source evidence');
    }
    return { insightId, sourceClaimId };
  });
  if (evidence.length !== sourceIds.size || new Set(evidence.map((row) => row.sourceClaimId)).size !== sourceIds.size) {
    fail('result.sourceEvidence', 'must reference every source claim exactly once');
  }

  const exactBySourceId = new Map(
    context.existingMainClaims
      .filter((claim) => claim.provenanceMatch === 'exact' && claim.sourceClaimId)
      .map((claim) => [claim.sourceClaimId as string, claim]),
  );
  const knownMainClaimIds = new Set(context.existingMainClaims.map((claim) => claim.id));
  const existing = arrayAt(result.existingMainClaims, 'result.existingMainClaims', 25).map((item, index) => {
    const row = objectAt(item, `result.existingMainClaims[${index}]`);
    assertAllowedKeys(row, `result.existingMainClaims[${index}]`, [
      'sourceClaimId', 'mainClaimId', 'disposition',
    ]);
    const sourceClaimId = stringAt(row.sourceClaimId, `result.existingMainClaims[${index}].sourceClaimId`);
    const mainClaimId = uuidAt(row.mainClaimId, `result.existingMainClaims[${index}].mainClaimId`);
    if (row.disposition !== 'reuse_exact_provenance') {
      fail(`result.existingMainClaims[${index}].disposition`, 'must be reuse_exact_provenance');
    }
    const exact = exactBySourceId.get(sourceClaimId);
    if (!exact || exact.id !== mainClaimId) {
      fail(`result.existingMainClaims[${index}]`, 'must reuse the exact provenance-bearing claim');
    }
    return { sourceClaimId, mainClaimId, disposition: 'reuse_exact_provenance' as const };
  });

  const synthesized = arrayAt(
    result.synthesizedInvestmentClaims,
    'result.synthesizedInvestmentClaims',
    25,
  ).map((item, index) => {
    const row = objectAt(item, `result.synthesizedInvestmentClaims[${index}]`);
    assertAllowedKeys(row, `result.synthesizedInvestmentClaims[${index}]`, [
      ...CLAIM_KEYS, 'ref', 'synthesisRationale',
    ]);
    const sourceClaimId = stringAt(row.sourceClaimId, `result.synthesizedInvestmentClaims[${index}].sourceClaimId`);
    if (exactBySourceId.has(sourceClaimId)) {
      fail(`result.synthesizedInvestmentClaims[${index}]`, 'exact provenance exists and must be reused');
    }
    const sourceClaim = context.sourceEvidence.find((claim) => claim.sourceClaimId === sourceClaimId);
    if (!sourceClaim) fail(`result.synthesizedInvestmentClaims[${index}]`, 'references unknown source evidence');
    const parsed = claimAt(
      row,
      index,
      'result.synthesizedInvestmentClaims',
      ['ref', 'synthesisRationale'],
    );
    if (parsed.qualifier !== sourceClaim.qualifier) {
      fail(`result.synthesizedInvestmentClaims[${index}].qualifier`, 'must preserve the source qualifier');
    }
    if (!sourceClaim.rebuttal.every((rebuttal) => parsed.rebuttal.includes(rebuttal))) {
      fail(`result.synthesizedInvestmentClaims[${index}].rebuttal`, 'must preserve every source rebuttal');
    }
    const ref = stringAt(row.ref, `result.synthesizedInvestmentClaims[${index}].ref`);
    if (ref !== `synthesized:${sourceClaimId}`) {
      fail(`result.synthesizedInvestmentClaims[${index}].ref`, 'must be derived from sourceClaimId');
    }
    return {
      ...parsed,
      ref,
      synthesisRationale: stringAt(
        row.synthesisRationale,
        `result.synthesizedInvestmentClaims[${index}].synthesisRationale`,
      ),
    };
  });

  for (const [sourceClaimId] of exactBySourceId) {
    if (!existing.some((row) => row.sourceClaimId === sourceClaimId)) {
      fail('result.existingMainClaims', `exact provenance for ${sourceClaimId} must be reused`);
    }
  }

  const thesisById = new Map(context.thesisTargets.map((thesis) => [thesis.id, thesis]));
  const ambiguities = arrayAt(result.ambiguities, 'result.ambiguities', 25).map((item, index) => {
    const row = objectAt(item, `result.ambiguities[${index}]`);
    assertAllowedKeys(row, `result.ambiguities[${index}]`, [
      'sourceClaimId', 'axis', 'kind', 'candidateMainClaimIds', 'candidateThesisIds', 'reason',
    ]);
    const sourceClaimId = stringAt(row.sourceClaimId, `result.ambiguities[${index}].sourceClaimId`);
    if (!sourceIds.has(sourceClaimId)) fail(`result.ambiguities[${index}]`, 'references unknown source evidence');
    if (!['semantic_match', 'claim_distinction', 'thesis_bearing'].includes(String(row.kind))) {
      fail(`result.ambiguities[${index}].kind`, 'is unsupported');
    }
    if (!['claim_identity', 'thesis_mapping'].includes(String(row.axis))) {
      fail(`result.ambiguities[${index}].axis`, 'is unsupported');
    }
    const expectedAxis = row.kind === 'thesis_bearing' ? 'thesis_mapping' : 'claim_identity';
    if (row.axis !== expectedAxis) {
      fail(`result.ambiguities[${index}].axis`, `must be ${expectedAxis} for ${String(row.kind)}`);
    }
    const candidateMainClaimIds = stringArrayAt(
      row.candidateMainClaimIds,
      `result.ambiguities[${index}].candidateMainClaimIds`,
    );
    const candidateThesisIds = stringArrayAt(
      row.candidateThesisIds,
      `result.ambiguities[${index}].candidateThesisIds`,
    );
    if (candidateMainClaimIds.some((id) => !knownMainClaimIds.has(id))) {
      fail(`result.ambiguities[${index}].candidateMainClaimIds`, 'contains an unknown claim');
    }
    if (candidateThesisIds.some((id) => !thesisById.has(id))) {
      fail(`result.ambiguities[${index}].candidateThesisIds`, 'contains an unknown thesis');
    }
    return {
      sourceClaimId,
      axis: row.axis as ClaimsSynthesisReadyResult['ambiguities'][number]['axis'],
      kind: row.kind as ClaimsSynthesisReadyResult['ambiguities'][number]['kind'],
      candidateMainClaimIds,
      candidateThesisIds,
      reason: stringAt(row.reason, `result.ambiguities[${index}].reason`),
    };
  });
  const ambiguityKeys = ambiguities.map((row) => `${row.sourceClaimId}:${row.axis}`);
  if (new Set(ambiguityKeys).size !== ambiguityKeys.length) {
    fail('result.ambiguities', 'must contain at most one ambiguity per source claim and axis');
  }
  const ambiguousSourceIds = new Set(ambiguities.map((row) => row.sourceClaimId));
  const claimIdentityAmbiguousSourceIds = new Set(
    ambiguities.filter((row) => row.axis === 'claim_identity').map((row) => row.sourceClaimId),
  );
  const synthesizedRefs = new Set(synthesized.map((claim) => claim.ref));
  const reusedRefs = new Set(existing.map((claim) => claim.mainClaimId));
  if (reusedRefs.size !== existing.length) {
    fail('result.existingMainClaims', 'must resolve each source claim at most once');
  }
  if (synthesizedRefs.size !== synthesized.length) {
    fail('result.synthesizedInvestmentClaims', 'must resolve each source claim at most once');
  }
  const resolvedRefBySource = new Map<string, string>();
  for (const claim of existing) resolvedRefBySource.set(claim.sourceClaimId, claim.mainClaimId);
  for (const claim of synthesized) resolvedRefBySource.set(claim.sourceClaimId, claim.ref);
  for (const sourceClaimId of claimIdentityAmbiguousSourceIds) {
    if (resolvedRefBySource.has(sourceClaimId)) {
      fail(
        `result.ambiguities.${sourceClaimId}.claim_identity`,
        'claim_identity ambiguity must not have a resolved claim',
      );
    }
  }

  const thesisMappings = arrayAt(result.thesisMappings, 'result.thesisMappings', 50).map((item, index) => {
    const row = objectAt(item, `result.thesisMappings[${index}]`);
    assertAllowedKeys(row, `result.thesisMappings[${index}]`, [
      'sourceClaimId', 'mainClaimRef', 'thesisId', 'thesisType', 'relationship',
      'confidence', 'rationale',
    ]);
    const sourceClaimId = stringAt(row.sourceClaimId, `result.thesisMappings[${index}].sourceClaimId`);
    if (!sourceIds.has(sourceClaimId)) {
      fail(`result.thesisMappings[${index}]`, 'references unknown source evidence');
    }
    if (ambiguousSourceIds.has(sourceClaimId)) {
      fail(`result.thesisMappings[${index}]`, 'ambiguous source evidence must not have thesis mappings');
    }
    const mainClaimRef = stringAt(row.mainClaimRef, `result.thesisMappings[${index}].mainClaimRef`);
    if (!reusedRefs.has(mainClaimRef) && !synthesizedRefs.has(mainClaimRef)) {
      fail(`result.thesisMappings[${index}].mainClaimRef`, 'must reference a reused or synthesized investment claim');
    }
    if (resolvedRefBySource.get(sourceClaimId) !== mainClaimRef) {
      fail(`result.thesisMappings[${index}].mainClaimRef`, 'must resolve the same source claim as the mapping');
    }
    const thesisId = uuidAt(row.thesisId, `result.thesisMappings[${index}].thesisId`);
    const thesis = thesisById.get(thesisId);
    if (!thesis || thesis.type !== row.thesisType) {
      fail(`result.thesisMappings[${index}]`, 'must reference an eligible thesis with the exact type');
    }
    if (!['supports', 'refutes', 'foundation'].includes(String(row.relationship))) {
      fail(`result.thesisMappings[${index}].relationship`, 'is unsupported');
    }
    if (!['high', 'medium', 'low'].includes(String(row.confidence))) {
      fail(`result.thesisMappings[${index}].confidence`, 'is unsupported');
    }
    return {
      sourceClaimId,
      mainClaimRef,
      thesisId,
      thesisType: row.thesisType as 'macro' | 'asset',
      relationship: row.relationship as 'supports' | 'refutes' | 'foundation',
      confidence: row.confidence as 'high' | 'medium' | 'low',
      rationale: stringAt(row.rationale, `result.thesisMappings[${index}].rationale`),
    };
  });
  const mappingsBySource = new Map<string, number>();
  for (const mapping of thesisMappings) {
    const count = (mappingsBySource.get(mapping.sourceClaimId) ?? 0) + 1;
    if (count > 5) fail('result.thesisMappings', 'must contain at most 5 mappings per source claim');
    mappingsBySource.set(mapping.sourceClaimId, count);
  }

  const recommendations = arrayAt(result.recommendations, 'result.recommendations', 25).map((item, index) => {
    const row = objectAt(item, `result.recommendations[${index}]`);
    assertAllowedKeys(row, `result.recommendations[${index}]`, [
      'sourceClaimId', 'action', 'rationale',
    ]);
    const sourceClaimId = stringAt(row.sourceClaimId, `result.recommendations[${index}].sourceClaimId`);
    if (!sourceIds.has(sourceClaimId)) fail(`result.recommendations[${index}]`, 'references unknown source evidence');
    if (!['reuse_existing_claim', 'synthesize_investment_claim', 'defer_ambiguous', 'no_investment_claim'].includes(String(row.action))) {
      fail(`result.recommendations[${index}].action`, 'is unsupported');
    }
    return {
      sourceClaimId,
      action: row.action as ClaimsSynthesisReadyResult['recommendations'][number]['action'],
      rationale: stringAt(row.rationale, `result.recommendations[${index}].rationale`),
    };
  });
  if (
    recommendations.length !== sourceIds.size
    || new Set(recommendations.map((recommendation) => recommendation.sourceClaimId)).size !== sourceIds.size
  ) {
    fail('result.recommendations', 'must cover every source claim exactly once');
  }
  for (const sourceClaimId of sourceIds) {
    const recommendation = recommendations.find((item) => item.sourceClaimId === sourceClaimId);
    const expectedAction = ambiguousSourceIds.has(sourceClaimId)
      ? 'defer_ambiguous'
      : existing.some((claim) => claim.sourceClaimId === sourceClaimId)
        ? 'reuse_existing_claim'
        : synthesized.some((claim) => claim.sourceClaimId === sourceClaimId)
          ? 'synthesize_investment_claim'
          : 'no_investment_claim';
    if (recommendation?.action !== expectedAction) {
      fail(
        `result.recommendations.${sourceClaimId}.action`,
        `must be ${expectedAction} for the validated disposition`,
      );
    }
  }

  return {
    contractVersion: '1.0.0',
    contextDigest: expectedDigest,
    status: 'ready',
    sourceEvidence: evidence,
    existingMainClaims: existing,
    synthesizedInvestmentClaims: synthesized,
    thesisMappings,
    ambiguities,
    recommendations,
    execution,
    limitations: stringArrayAt(result.limitations, 'result.limitations'),
  };
}

export function buildClaimsSynthesisContext(
  sourceInput: unknown,
  repository: ClaimsSynthesisRepositorySnapshot,
): ClaimsSynthesisContext {
  const source = validateClaimsSynthesisSource(sourceInput);
  const sourceProvenance = new Set(
    source.claims.map((claim) => `${source.insightId}\u0000${claim.sourceClaimId}`),
  );
  const { claims, ...sourceHeader } = source;

  return {
    contractVersion: '1.0.0',
    source: sourceHeader,
    sourceEvidence: claims,
    existingMainClaims: repository.existingMainClaims.map((claim) => ({
      ...claim,
      provenanceMatch: claim.sourceInsightId && claim.sourceClaimId
        && sourceProvenance.has(`${claim.sourceInsightId}\u0000${claim.sourceClaimId}`)
        ? 'exact'
        : 'none',
    })),
    thesisTargets: repository.theses.filter(
      (thesis) => thesis.status === 'developing' || thesis.status === 'monitoring',
    ),
  };
}
