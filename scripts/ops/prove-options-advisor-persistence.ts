/**
 * Deterministic provider boundary for the issue #53 governed-wrapper proof.
 *
 * The real wrapper invokes this in place of the external provider while still
 * traversing run_governed and exact adapter-digest validation. This command has
 * no network, market-data, database, or trade capability. It validates a
 * fixture result, applies the governed scenario/verification/max gates, and
 * persists only through saveAdvisorRecommendations with an in-memory store.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  saveAdvisorRecommendations,
  type AdvisorRecommendationRow,
  type AdvisorRecommendationStore,
  type BatchInput,
  type RecommendationInput,
} from './save-advisor-recommendations.js';

interface GovernedRequest {
  mode: 'morning-batch';
  scenarioFilters: string[];
  maxRecommendations: number;
}

interface VerificationResult {
  id: string;
  ticker?: string;
  status: 'verified' | 'unavailable';
  legs?: Array<{
    action?: string;
    expiry?: string;
    strike?: number;
    right?: string;
    bid?: number;
    ask?: number;
    mid?: number;
  }>;
}

interface GovernedRecommendation {
  scenario: string;
  verificationId: string;
  recommendation: RecommendationInput;
}

interface GovernedOutcome {
  request: GovernedRequest;
  verification: VerificationResult[];
  governedRecommendations: GovernedRecommendation[];
}

interface Fixture extends GovernedOutcome {
  noWriteOutcomes: Array<Omit<GovernedOutcome, 'request'> & { name: string }>;
}

const MORNING_SCENARIOS = new Set([
  'hedge',
  'income',
  'collar',
  'put_entry',
  'risk_reversal',
  'opportunistic',
]);

interface MemoryStore extends AdvisorRecommendationStore {
  effects: string[];
  rows: AdvisorRecommendationRow[];
}

function createMemoryStore(superseded = 0): MemoryStore {
  const effects: string[] = [];
  const rows: AdvisorRecommendationRow[] = [];
  return {
    effects,
    rows,
    async resolveUnderlyingIds(tickers) {
      effects.push(`resolve-underlyings:${tickers.join(',')}`);
      return new Map(tickers.map((ticker) => [ticker, `${ticker.toLowerCase()}-underlying`]));
    },
    async supersedeActive(scenario) {
      effects.push(`supersede:${scenario}`);
      return superseded;
    },
    async insertRecommendations(insertedRows) {
      effects.push(`insert:${insertedRows[0]?.scenario}:${insertedRows.length}`);
      rows.push(...insertedRows);
      return insertedRows.length;
    },
  };
}

function hasUsableVerification(
  result: VerificationResult | undefined,
  recommendation: RecommendationInput,
): boolean {
  const structureLegs = Array.isArray(recommendation.structure.legs)
    ? recommendation.structure.legs as Array<Record<string, unknown>>
    : [];
  const legKey = (leg: Record<string, unknown>) =>
    `${leg.action}|${leg.expiry}|${leg.strike}|${leg.right}`;
  const structureKeys = new Set(structureLegs.map(legKey));
  const verificationKeys = new Set(
    (result?.legs ?? []).map((leg) => legKey(leg as Record<string, unknown>)),
  );
  return result?.status === 'verified'
    && result.ticker === recommendation.ticker
    && Array.isArray(result.legs)
    && result.legs.length > 0
    && result.legs.length === structureLegs.length
    && verificationKeys.size === result.legs.length
    && structureKeys.size === structureLegs.length
    && result.legs.every((leg) =>
      Number.isFinite(leg.bid)
      && Number.isFinite(leg.ask)
      && Number.isFinite(leg.mid)
      && structureKeys.has(legKey(leg as Record<string, unknown>)));
}

export async function persistGovernedOutcome(
  outcome: GovernedOutcome,
  store: AdvisorRecommendationStore,
) {
  if (outcome.request.mode !== 'morning-batch') {
    throw new Error('Fixture proof accepts morning-batch mode only');
  }
  if (!Number.isInteger(outcome.request.maxRecommendations)
    || outcome.request.maxRecommendations < 1
    || outcome.request.maxRecommendations > 5) {
    throw new Error('maxRecommendations must be an integer from one to five');
  }
  if (outcome.request.scenarioFilters.some((scenario) => !MORNING_SCENARIOS.has(scenario))) {
    throw new Error('morning-batch contains a scenario outside the accepted six');
  }

  const verificationById = new Map(outcome.verification.map((item) => [item.id, item]));
  const byScenario = new Map<string, RecommendationInput[]>();
  for (const item of outcome.governedRecommendations) {
    if (!outcome.request.scenarioFilters.includes(item.scenario)) continue;
    if (!MORNING_SCENARIOS.has(item.scenario)) continue;
    if (!hasUsableVerification(
      verificationById.get(item.verificationId),
      item.recommendation,
    )) continue;
    const recommendations = byScenario.get(item.scenario) ?? [];
    if (recommendations.length < outcome.request.maxRecommendations) {
      recommendations.push(item.recommendation);
      byScenario.set(item.scenario, recommendations);
    }
  }

  const writes = [];
  for (const [scenario, recommendations] of byScenario) {
    const batch: BatchInput = { scenario, recommendations };
    writes.push(await saveAdvisorRecommendations(batch, {
      store,
      now: new Date('2026-08-07T08:05:00.000Z'),
      batchId: `fixture-${scenario}-batch`,
    }));
  }
  return writes;
}

async function main() {
  const fixtureIndex = process.argv.indexOf('--provider-fixture');
  const fixturePath = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1] : undefined;
  if (!fixturePath) throw new Error('Pass --provider-fixture <path>');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
  const promptIndex = process.argv.indexOf('-p');
  const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] : undefined;
  const requestMatch = prompt?.match(/^Request: (\{.*\})$/m);
  if (!requestMatch) throw new Error('Governed provider request was not supplied');
  const request = JSON.parse(requestMatch[1]) as GovernedRequest;
  const governedFixture = { ...fixture, request };

  const store = createMemoryStore(2);
  const writes = await persistGovernedOutcome(governedFixture, store);
  const noWriteOutcomes = [];
  for (const outcome of fixture.noWriteOutcomes) {
    const noWriteStore = createMemoryStore();
    const outcomeWrites = await persistGovernedOutcome(
      { ...outcome, request },
      noWriteStore,
    );
    noWriteOutcomes.push({
      name: outcome.name,
      writes: outcomeWrites,
      effects: noWriteStore.effects,
    });
  }

  console.log(JSON.stringify({
    request,
    writes,
    effects: store.effects,
    persisted: store.rows,
    noWriteOutcomes,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
