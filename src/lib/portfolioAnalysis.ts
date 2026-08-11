type JsonObject = Record<string, unknown>;

const RADON_QUOTE_CAPABILITY = 'capability:scope:radon/ibkr-option-quote';
const RADON_QUOTE_UNAVAILABLE_REASON =
  'Radon publishes no accepted immutable option-quote Capability Package or current Adapter Conformance evidence.';

export interface PortfolioAnalysisContext {
  requestStatus: 'accepted' | 'refused';
  focus: string;
  portfolioSnapshot: {
    status: 'completed' | 'unavailable' | 'failed' | 'not_invoked';
    result: JsonObject | null;
    unavailableInputs: string[];
    errors: string[];
  };
  optionsAnalyses: Array<{
    request: JsonObject;
    outcome: JsonObject;
  }>;
}

export interface PortfolioAnalysisResult extends JsonObject {
  status: 'completed' | 'partial' | 'unavailable' | 'refused' | 'failed';
  focus: string;
  portfolioSnapshot: JsonObject | null;
  observations: Array<{
    kind: string;
    statement: string;
    evidence: Array<{
      dependency: 'portfolio-snapshot' | 'options-vol-analysis';
      path: string;
      value: unknown;
    }>;
  }>;
  optionsAnalyses: Array<{
    request: JsonObject;
    outcome: JsonObject;
  }>;
  unavailableDependencies: string[];
  limitations: string[];
  errors: string[];
  writes: [];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactFields(value: JsonObject, fields: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolvePath(root: unknown, path: string): unknown {
  if (!/^(?:[A-Za-z][A-Za-z0-9_]*|\[\d+\])(?:\.[A-Za-z][A-Za-z0-9_]*|\[\d+\])*$/.test(path)) {
    throw new Error(`Unsupported evidence path: ${path}`);
  }
  const segments = path.match(/[A-Za-z][A-Za-z0-9_]*|\d+/g) ?? [];
  let current = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isObject(current)) {
      current = current[segment];
    } else {
      throw new Error(`Evidence path does not resolve: ${path}`);
    }
  }
  return current;
}

function validateOptionsRequest(request: unknown, index: number): asserts request is JsonObject {
  if (!isObject(request)) throw new Error(`options request ${index} must be an object`);
  const allowedFields = new Set([
    'ticker',
    'direction',
    'targetBase',
    'targetHigh',
    'horizonMonths',
    'downsideFloor',
    'horizonRange',
    'riskFreeRate',
    'snapshotDate',
    'persist',
    'notes',
    'quoteVerification',
  ]);
  if (Object.keys(request).some((field) => !allowedFields.has(field))) {
    throw new Error(`options request ${index} has unsupported fields`);
  }
  if (typeof request.ticker !== 'string' || !request.ticker.trim()) {
    throw new Error(`options request ${index} ticker must be non-empty`);
  }
  if (request.direction !== 'bullish' && request.direction !== 'bearish') {
    throw new Error(`options request ${index} direction is unsupported`);
  }
  for (const field of ['targetBase', 'targetHigh', 'horizonMonths', 'downsideFloor']) {
    if (typeof request[field] !== 'number' || !Number.isFinite(request[field])) {
      throw new Error(`options request ${index} ${field} must be finite`);
    }
  }
  if (request.persist !== undefined && request.persist !== false) {
    throw new Error(`options request ${index} persistence must be forced off`);
  }
  for (const field of ['horizonRange', 'riskFreeRate']) {
    if (request[field] !== undefined && (
      typeof request[field] !== 'number' || !Number.isFinite(request[field])
    )) {
      throw new Error(`options request ${index} ${field} must be finite`);
    }
  }
  if (request.snapshotDate !== undefined && (
    typeof request.snapshotDate !== 'string' || !request.snapshotDate.trim()
  )) {
    throw new Error(`options request ${index} snapshotDate must be non-empty`);
  }
  if (request.notes !== undefined && typeof request.notes !== 'string') {
    throw new Error(`options request ${index} notes must be a string`);
  }
  if (request.quoteVerification !== undefined && typeof request.quoteVerification !== 'boolean') {
    throw new Error(`options request ${index} quoteVerification must be boolean`);
  }
}

function validateOptionsOutcome(
  outcome: unknown,
  request: JsonObject,
  index: number,
): asserts outcome is JsonObject {
  if (!isObject(outcome)) throw new Error(`options outcome ${index} must be an object`);
  exactFields(
    outcome,
    ['status', 'analysis', 'quoteVerification', 'persistence', 'writes', 'unavailableInputs', 'errors'],
    `options outcome ${index}`,
  );
  if (!['completed', 'unavailable', 'refused', 'failed'].includes(String(outcome.status))) {
    throw new Error(`options outcome ${index} status is unsupported`);
  }
  if (outcome.status === 'completed' ? !isObject(outcome.analysis) : outcome.analysis !== null) {
    throw new Error(`options outcome ${index} analysis does not match status`);
  }
  if (!isObject(outcome.quoteVerification)) {
    throw new Error(`options outcome ${index} quoteVerification is invalid`);
  }
  if (request.quoteVerification === true) {
    exactFields(outcome.quoteVerification, ['status', 'reason'], `options outcome ${index} quoteVerification`);
    if (
      outcome.quoteVerification.status !== 'unavailable' ||
      outcome.quoteVerification.reason !== RADON_QUOTE_UNAVAILABLE_REASON
    ) {
      throw new Error(`options outcome ${index} quoteVerification must preserve Radon unavailability`);
    }
    const unavailableInputs = stringArray(
      outcome.unavailableInputs,
      `options outcome ${index} unavailableInputs`,
    );
    if (!unavailableInputs.includes(RADON_QUOTE_CAPABILITY)) {
      throw new Error(`options outcome ${index} must identify unavailable Radon quote capability`);
    }
  } else {
    exactFields(outcome.quoteVerification, ['status'], `options outcome ${index} quoteVerification`);
    if (outcome.quoteVerification.status !== 'not_requested') {
      throw new Error(`options outcome ${index} quoteVerification must be not_requested`);
    }
  }
  if (!isObject(outcome.persistence)) {
    throw new Error(`options outcome ${index} persistence is invalid`);
  }
  exactFields(
    outcome.persistence,
    ['requested', 'status', 'reportId'],
    `options outcome ${index} persistence`,
  );
  if (
    outcome.persistence.requested !== false ||
    outcome.persistence.status !== 'not_requested' ||
    outcome.persistence.reportId !== null
  ) {
    throw new Error('composed options persistence must be forced off');
  }
  if (!Array.isArray(outcome.writes) || outcome.writes.length !== 0) {
    throw new Error('composed options analysis must have zero writes');
  }
  stringArray(outcome.unavailableInputs, `options outcome ${index} unavailableInputs`);
  stringArray(outcome.errors, `options outcome ${index} errors`);
}

function validateContext(context: unknown): asserts context is PortfolioAnalysisContext {
  if (!isObject(context)) throw new Error('context must be an object');
  exactFields(context, ['requestStatus', 'focus', 'portfolioSnapshot', 'optionsAnalyses'], 'context');
  if (context.requestStatus !== 'accepted' && context.requestStatus !== 'refused') {
    throw new Error('requestStatus is unsupported');
  }
  if (typeof context.focus !== 'string') {
    throw new Error('focus must be a string');
  }
  if (context.requestStatus === 'accepted' && !context.focus.trim()) {
    throw new Error('focus must be non-empty');
  }
  if (!isObject(context.portfolioSnapshot)) {
    throw new Error('portfolioSnapshot context must be an object');
  }
  exactFields(
    context.portfolioSnapshot,
    ['status', 'result', 'unavailableInputs', 'errors'],
    'portfolioSnapshot context',
  );
  if (!['completed', 'unavailable', 'failed', 'not_invoked'].includes(String(context.portfolioSnapshot.status))) {
    throw new Error('portfolioSnapshot context status is unsupported');
  }
  if (
    context.portfolioSnapshot.status === 'completed'
      ? !isObject(context.portfolioSnapshot.result)
      : context.portfolioSnapshot.result !== null
  ) {
    throw new Error('portfolioSnapshot context result does not match status');
  }
  stringArray(context.portfolioSnapshot.unavailableInputs, 'portfolioSnapshot unavailableInputs');
  stringArray(context.portfolioSnapshot.errors, 'portfolioSnapshot errors');
  if (!Array.isArray(context.optionsAnalyses) || context.optionsAnalyses.length > 5) {
    throw new Error('optionsAnalyses must contain at most five items');
  }
  if (
    context.requestStatus === 'refused' &&
    (context.portfolioSnapshot.status !== 'not_invoked' || context.optionsAnalyses.length !== 0)
  ) {
    throw new Error('refused request must not invoke dependencies');
  }
  if (context.requestStatus === 'accepted' && context.portfolioSnapshot.status === 'not_invoked') {
    throw new Error('accepted request must invoke portfolio-snapshot');
  }
  if (context.portfolioSnapshot.status !== 'completed' && context.optionsAnalyses.length !== 0) {
    throw new Error('options analysis cannot run without a completed portfolio snapshot');
  }
  context.optionsAnalyses.forEach((item, index) => {
    if (!isObject(item)) throw new Error(`options analysis ${index} must be an object`);
    exactFields(item, ['request', 'outcome'], `options analysis ${index}`);
    validateOptionsRequest(item.request, index);
    validateOptionsOutcome(item.outcome, item.request, index);
  });
}

function expectedStatus(context: PortfolioAnalysisContext): PortfolioAnalysisResult['status'] {
  if (context.requestStatus === 'refused') return 'refused';
  if (context.portfolioSnapshot.status !== 'completed') {
    return context.portfolioSnapshot.status as 'unavailable' | 'failed';
  }
  const incompleteOption = context.optionsAnalyses.some(
    ({ outcome }) => outcome.status !== 'completed',
  );
  return incompleteOption ? 'partial' : 'completed';
}

export function validatePortfolioAnalysisResult(
  context: unknown,
  candidate: unknown,
): PortfolioAnalysisResult {
  validateContext(context);
  if (!isObject(candidate)) throw new Error('result must be an object');
  exactFields(candidate, [
    'status',
    'focus',
    'portfolioSnapshot',
    'observations',
    'optionsAnalyses',
    'unavailableDependencies',
    'limitations',
    'errors',
    'writes',
  ], 'result');

  if (candidate.status !== expectedStatus(context)) {
    throw new Error('result status does not match dependency outcomes');
  }
  if (candidate.focus !== context.focus) throw new Error('focus was not preserved');
  if (!equal(candidate.portfolioSnapshot, context.portfolioSnapshot.result)) {
    throw new Error('portfolio snapshot was recalculated, reordered, omitted, or replaced');
  }
  if (!equal(candidate.optionsAnalyses, context.optionsAnalyses)) {
    throw new Error('options outcomes were recalculated, reordered, omitted, or replaced');
  }
  if (!Array.isArray(candidate.writes) || candidate.writes.length !== 0) {
    throw new Error('portfolio analysis must have zero writes');
  }

  const unavailableDependencies = stringArray(
    candidate.unavailableDependencies,
    'unavailableDependencies',
  );
  stringArray(candidate.limitations, 'limitations');
  stringArray(candidate.errors, 'errors');

  const requiredUnavailable = new Set(context.portfolioSnapshot.unavailableInputs);
  for (const { outcome } of context.optionsAnalyses) {
    const unavailableInputs = outcome.unavailableInputs;
    if (Array.isArray(unavailableInputs)) {
      for (const input of unavailableInputs) {
        if (typeof input === 'string') requiredUnavailable.add(input);
      }
    }
  }
  if (!equal(unavailableDependencies, [...requiredUnavailable])) {
    throw new Error('unavailableDependencies must exactly match dependency outcomes');
  }

  if (!Array.isArray(candidate.observations)) {
    throw new Error('observations must be an array');
  }
  if (context.portfolioSnapshot.status !== 'completed') {
    if (candidate.observations.length !== 0 || context.optionsAnalyses.length !== 0) {
      throw new Error('non-completed portfolio snapshot must stop analysis');
    }
    return candidate as PortfolioAnalysisResult;
  }
  if (candidate.observations.length === 0) {
    throw new Error('completed portfolio analysis requires grounded observations');
  }

  const crossContextIndexes = new Set<number>();
  for (const [index, rawObservation] of candidate.observations.entries()) {
    if (!isObject(rawObservation)) throw new Error(`observation ${index} must be an object`);
    exactFields(rawObservation, ['kind', 'statement', 'evidence'], `observation ${index}`);
    if (typeof rawObservation.kind !== 'string' || !rawObservation.kind.trim()) {
      throw new Error(`observation ${index} kind must be non-empty`);
    }
    if (typeof rawObservation.statement !== 'string' || !rawObservation.statement.trim()) {
      throw new Error(`observation ${index} statement must be non-empty`);
    }
    if (!Array.isArray(rawObservation.evidence) || rawObservation.evidence.length === 0) {
      throw new Error(`observation ${index} requires evidence`);
    }

    const dependencies = new Set<string>();
    const optionIndexes = new Set<number>();
    for (const rawEvidence of rawObservation.evidence) {
      if (!isObject(rawEvidence)) throw new Error(`observation ${index} evidence must be an object`);
      exactFields(rawEvidence, ['dependency', 'path', 'value'], `observation ${index} evidence`);
      if (rawEvidence.dependency !== 'portfolio-snapshot' && rawEvidence.dependency !== 'options-vol-analysis') {
        throw new Error(`observation ${index} has unsupported dependency evidence`);
      }
      if (typeof rawEvidence.path !== 'string') {
        throw new Error(`observation ${index} evidence path must be a string`);
      }
      const root = rawEvidence.dependency === 'portfolio-snapshot'
        ? candidate.portfolioSnapshot
        : candidate.optionsAnalyses;
      const actual = resolvePath(root, rawEvidence.path);
      if (!equal(actual, rawEvidence.value)) {
        throw new Error(`observation ${index} evidence value does not match ${rawEvidence.path}`);
      }
      dependencies.add(rawEvidence.dependency);
      if (rawEvidence.dependency === 'options-vol-analysis') {
        const match = rawEvidence.path.match(/^\[(\d+)\]/);
        if (match) optionIndexes.add(Number(match[1]));
      }
    }

    if (
      rawObservation.kind === 'portfolio_options_context' &&
      dependencies.has('portfolio-snapshot') &&
      dependencies.has('options-vol-analysis')
    ) {
      for (const optionIndex of optionIndexes) crossContextIndexes.add(optionIndex);
    }
  }

  context.optionsAnalyses.forEach(({ outcome }, index) => {
    if (outcome.status === 'completed' && !crossContextIndexes.has(index)) {
      throw new Error(`completed options analysis ${index} lacks portfolio cross-reference evidence`);
    }
  });

  return candidate as PortfolioAnalysisResult;
}
