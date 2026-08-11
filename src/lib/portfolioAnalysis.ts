type JsonObject = Record<string, unknown>;

export interface PortfolioAnalysisContext {
  focus: string;
  portfolioSnapshot: {
    status: 'completed' | 'unavailable' | 'failed';
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
  if (!path || !/^\[?\d*\]?(?:\.?[A-Za-z][A-Za-z0-9_]*|\[\d+\])*$/.test(path)) {
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

function expectedStatus(context: PortfolioAnalysisContext): PortfolioAnalysisResult['status'] {
  if (context.portfolioSnapshot.status !== 'completed') {
    return context.portfolioSnapshot.status;
  }
  const incompleteOption = context.optionsAnalyses.some(
    ({ outcome }) => outcome.status !== 'completed',
  );
  return incompleteOption ? 'partial' : 'completed';
}

export function validatePortfolioAnalysisResult(
  context: PortfolioAnalysisContext,
  candidate: unknown,
): PortfolioAnalysisResult {
  if (!context.focus.trim()) throw new Error('focus must be non-empty');
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
    if (!Array.isArray(outcome.writes) || outcome.writes.length !== 0) {
      throw new Error('composed options analysis must have zero writes');
    }
    const persistence = outcome.persistence;
    if (isObject(persistence) && persistence.requested !== false) {
      throw new Error('composed options persistence must be forced off');
    }
  }
  for (const dependency of requiredUnavailable) {
    if (!unavailableDependencies.includes(dependency)) {
      throw new Error(`missing unavailable dependency: ${dependency}`);
    }
  }

  if (!Array.isArray(candidate.observations)) {
    throw new Error('observations must be an array');
  }
  if (context.portfolioSnapshot.status !== 'completed') {
    if (candidate.observations.length !== 0 || context.optionsAnalyses.length !== 0) {
      throw new Error('unavailable portfolio snapshot must stop analysis');
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
