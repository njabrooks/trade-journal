import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validatePortfolioAnalysisResult,
  type PortfolioAnalysisContext,
  type PortfolioAnalysisResult,
} from '../src/lib/portfolioAnalysis.js';

const capabilityRoot = resolve(process.cwd(), 'capabilities/portfolio-analysis');
const fixturePath = resolve(process.cwd(), 'tests/fixtures/portfolio-analysis-adapter-equivalence.json');

function read(path: string): string {
  return readFileSync(resolve(capabilityRoot, path), 'utf8');
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

function digest(path: string): string {
  return `sha256:${createHash('sha256').update(read(path)).digest('hex')}`;
}

function repositoryDigest(path: string): string {
  return `sha256:${createHash('sha256')
    .update(readFileSync(resolve(process.cwd(), path), 'utf8'))
    .digest('hex')}`;
}

function normalizeAdapter(adapter: string): string {
  return adapter
    .replace(/^## (Claude|Codex) Provider Adapter\n\n/, '')
    .replace('Ask for missing required inputs in an interactive request.', 'Refuse a request with missing required inputs.')
    .replace('Refuse a headless request with missing required inputs.', 'Refuse a request with missing required inputs.')
    .replaceAll('exact Claude adapter', 'exact provider adapter')
    .replaceAll('exact Codex adapter', 'exact provider adapter');
}

describe('portfolio-analysis Capability', () => {
  it('composes only the two governed dependencies', () => {
    const capability = readJson('capability-package.json');
    expect(capability.id).toBe('capability:scope:trade-journal/portfolio-analysis');
    expect(capability.authority).toBe('scope:trade-journal');
    expect(capability.dependencies).toEqual([
      {
        id: 'capability:scope:trade-journal/portfolio-snapshot',
        version_constraint: '>=1.0.0 <2.0.0',
      },
      {
        id: 'capability:scope:trade-journal/options-vol-analysis',
        version_constraint: '>=1.0.0 <2.0.0',
      },
    ]);
  });

  it('keeps exact provider semantics equivalent apart from missing-input interaction', () => {
    const claude = read('adapters/claude.md');
    const codex = read('adapters/codex.md');
    expect(normalizeAdapter(claude)).toBe(normalizeAdapter(codex));

    for (const adapter of [claude, codex]) {
      expect(adapter).toContain('capability:scope:trade-journal/portfolio-snapshot');
      expect(adapter).toContain('capability:scope:trade-journal/options-vol-analysis');
      expect(adapter).toContain('from the immutable Registry Lock');
      expect(adapter).toContain('`persist: false`');
      expect(adapter).toContain('Preserve the complete snapshot result');
      expect(adapter).toContain('Preserve the complete result envelope and `AnalysisOutput`');
      expect(adapter).toContain('without recalculation, reordering, omission, or replacement');
      expect(adapter).toContain('exact JSON field path');
      expect(adapter).toContain('A valid snapshot plus any refused, unavailable, or failed options dependency is `partial`');
      expect(adapter).toContain('`writes` is always `[]`');
    }
  });

  it('binds equivalent observable analysis requirements to the exact adapters', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      limitation: string;
      context: PortfolioAnalysisContext;
      result: PortfolioAnalysisResult;
      providers: Record<string, { adapterDigest: string }>;
    };

    expect(fixture.limitation).toContain('No live Claude or Codex provider invocation is claimed');
    expect(fixture.context.portfolioSnapshot.result?.snapshotDate).toBe('2026-08-11');
    expect(fixture.context.optionsAnalyses).toHaveLength(1);

    const outputs: PortfolioAnalysisResult[] = [];
    for (const adapter of ['claude', 'codex'] as const) {
      const body = read(`adapters/${adapter}.md`);
      expect(fixture.providers[adapter].adapterDigest).toBe(digest(`adapters/${adapter}.md`));
      outputs.push(validatePortfolioAnalysisResult(fixture.context, fixture.result));
      for (const field of [
        '`status`',
        '`focus`',
        '`portfolioSnapshot`',
        '`observations`',
        '`optionsAnalyses`',
        '`unavailableDependencies`',
        '`limitations`',
        '`errors`',
        '`writes`',
      ]) {
        expect(body).toContain(field);
      }
      expect(body).toContain('portfolio_options_context');
      expect(body).toContain('scripts/portfolio-analysis.ts --validate-result');
    }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]).toEqual(fixture.result);
  });

  it('rejects a completed option analysis without portfolio cross-reference evidence', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      context: PortfolioAnalysisContext;
      result: PortfolioAnalysisResult;
    };
    const candidate = structuredClone(fixture.result);
    candidate.observations = candidate.observations.filter(
      ({ kind }) => kind !== 'portfolio_options_context',
    );

    expect(() => validatePortfolioAnalysisResult(fixture.context, candidate)).toThrow(
      /lacks portfolio cross-reference evidence/,
    );
  });

  it('rejects unsupported evidence, changed dependency results, and write-capable outcomes', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      context: PortfolioAnalysisContext;
      result: PortfolioAnalysisResult;
    };

    const unsupportedEvidence = structuredClone(fixture.result);
    unsupportedEvidence.observations[0].evidence[0].value = 0.2;
    expect(() => validatePortfolioAnalysisResult(fixture.context, unsupportedEvidence)).toThrow(
      /evidence value does not match/,
    );

    const changedResults = structuredClone(fixture.result);
    changedResults.optionsAnalyses = [];
    expect(() => validatePortfolioAnalysisResult(fixture.context, changedResults)).toThrow(
      /options outcomes were recalculated/,
    );

    const writeCapableContext = structuredClone(fixture.context);
    writeCapableContext.optionsAnalyses[0].outcome.persistence = {
      ...writeCapableContext.optionsAnalyses[0].outcome.persistence as Record<string, unknown>,
      requested: true,
    };
    const writeCapableResult = structuredClone(fixture.result);
    writeCapableResult.optionsAnalyses = structuredClone(writeCapableContext.optionsAnalyses);
    expect(() => validatePortfolioAnalysisResult(writeCapableContext, writeCapableResult)).toThrow(
      /persistence must be forced off/,
    );
  });

  it('rejects unvalidated dependency contexts and incomplete option envelopes', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      context: PortfolioAnalysisContext;
      result: PortfolioAnalysisResult;
    };

    const invalidStatus = structuredClone(fixture.context) as unknown as {
      portfolioSnapshot: { status: string };
    };
    invalidStatus.portfolioSnapshot.status = 'bogus';
    expect(() => validatePortfolioAnalysisResult(invalidStatus, fixture.result)).toThrow(
      /context status is unsupported/,
    );

    const incompleteOutcome = structuredClone(fixture.context) as unknown as {
      optionsAnalyses: Array<{ outcome: Record<string, unknown> }>;
    };
    delete incompleteOutcome.optionsAnalyses[0].outcome.quoteVerification;
    expect(() => validatePortfolioAnalysisResult(incompleteOutcome, fixture.result)).toThrow(
      /options outcome 0 has unsupported or missing fields/,
    );
  });

  it('rejects malformed and root-only evidence paths', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      context: PortfolioAnalysisContext;
      result: PortfolioAnalysisResult;
    };

    for (const path of [']', '[]', '.underlyingBreakdown', '']) {
      const candidate = structuredClone(fixture.result);
      candidate.observations[0].evidence[0].path = path;
      candidate.observations[0].evidence[0].value = fixture.result.portfolioSnapshot;
      expect(() => validatePortfolioAnalysisResult(fixture.context, candidate)).toThrow(
        /Unsupported evidence path/,
      );
    }
  });

  it('validates refusal envelopes without invoking either dependency', () => {
    const context: PortfolioAnalysisContext = {
      requestStatus: 'refused',
      focus: '',
      portfolioSnapshot: {
        status: 'not_invoked',
        result: null,
        unavailableInputs: [],
        errors: [],
      },
      optionsAnalyses: [],
    };
    const result: PortfolioAnalysisResult = {
      status: 'refused',
      focus: '',
      portfolioSnapshot: null,
      observations: [],
      optionsAnalyses: [],
      unavailableDependencies: [],
      limitations: [],
      errors: ['A non-empty focus is required.'],
      writes: [],
    };

    expect(validatePortfolioAnalysisResult(context, result)).toEqual(result);
  });

  it('rejects fabricated quote authority and unsupported unavailability claims', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      context: PortfolioAnalysisContext;
      result: PortfolioAnalysisResult;
    };

    const fabricatedQuote = structuredClone(fixture.context);
    fabricatedQuote.optionsAnalyses[0].outcome.quoteVerification = {
      status: 'completed',
      executableQuote: 12.34,
    };
    const fabricatedQuoteResult = structuredClone(fixture.result);
    fabricatedQuoteResult.optionsAnalyses = structuredClone(fabricatedQuote.optionsAnalyses);
    expect(() => validatePortfolioAnalysisResult(fabricatedQuote, fabricatedQuoteResult)).toThrow(
      /quoteVerification has unsupported or missing fields/,
    );

    for (const unavailableDependencies of [
      ['capability:scope:radon/ibkr-option-quote', 'capability:scope:trade-journal/portfolio-snapshot'],
      ['capability:scope:radon/ibkr-option-quote', 'capability:scope:radon/ibkr-option-quote'],
    ]) {
      const unsupported = structuredClone(fixture.result);
      unsupported.unavailableDependencies = unavailableDependencies;
      expect(() => validatePortfolioAnalysisResult(fixture.context, unsupported)).toThrow(
        /must exactly match dependency outcomes/,
      );
    }
  });

  it('preserves the read-only and unavailable-dependency boundary', () => {
    for (const provider of ['claude', 'codex']) {
      const adapter = read(`adapters/${provider}.md`);
      expect(adapter).toContain('This adapter is read-only.');
      expect(adapter).toContain('do not invoke options analysis');
      expect(adapter).toContain('Do not substitute connector data');
      expect(adapter).toContain('must not use Supabase MCP, Massive connector tooling, ad hoc SQL');
      expect(adapter).toContain('must not mutate portfolio, journal, thesis, claim, signal, strategy, position, Decision Item');
      expect(adapter).not.toMatch(/execute_sql|apply_migration|store_as=|query_data/);
      expect(adapter).not.toMatch(/scripts\/ibkr-option-quote\.py|scripts\/ibkr-quote-contracts\.py/);
    }
  });

  it('records exact dependency, publication, legacy, and scope evidence', () => {
    const receipt = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'evidence/issue-65-portfolio-analysis.json'),
        'utf8',
      ),
    ) as Record<string, Record<string, unknown>>;

    expect(receipt.fixed_point).toBe('91422545e8104ad80d70781ed9fecc0b7702f49b');
    expect(receipt.release_revision).toBe('548fc84a0720c439e40c281715a302b7c07673c4');

    const dependencies = receipt.dependencies as unknown as Array<Record<string, unknown>>;
    expect(dependencies.map(({ id }) => id)).toEqual([
      'capability:scope:trade-journal/portfolio-snapshot',
      'capability:scope:trade-journal/options-vol-analysis',
    ]);
    expect(dependencies.every(({ unavailable_behavior }) =>
      String(unavailable_behavior).includes('zero writes'))).toBe(true);

    expect(receipt.observable_equivalence).toMatchObject({
      fixture_digest: repositoryDigest(
        'tests/fixtures/portfolio-analysis-adapter-equivalence.json',
      ),
      exact_adapter_semantics_equivalent: true,
      live_provider_invocation_claimed: false,
      complete_dependency_results_preserved: true,
      observations_require_exact_field_evidence: true,
      options_persistence_forced_off: true,
      writes: [],
    });

    expect(receipt.published_artifacts).toMatchObject({
      registry_lock: repositoryDigest('capability-registry-lock.json'),
      claude_staging: repositoryDigest(
        'docs/agents/provider-entry-points/staging/claude.md',
      ),
      codex_staging: repositoryDigest(
        'docs/agents/provider-entry-points/staging/codex.md',
      ),
      interactive_inventory: repositoryDigest(
        'docs/agents/provider-adapters/interactive-inventory.json',
      ),
      headless_inventory: repositoryDigest(
        'docs/agents/provider-adapters/headless-inventory.json',
      ),
      generation_eligibility: repositoryDigest(
        'docs/agents/provider-adapters/generation-eligibility.json',
      ),
      inventory_entries: 74,
      generation_eligible_entries: 56,
    });

    expect(receipt.legacy_inventory_disposition).toMatchObject({
      action: 'replace',
      current_binding: 'governed-provider-adapter',
      active_discovery_changed: false,
    });
    expect(receipt.scope_confirmation).toMatchObject({
      active_discovery_changed: false,
      legacy_inputs_changed: false,
      scheduler_or_credential_changed: false,
      generic_connector_invoked: false,
      database_write: false,
      volatility_report_persisted: false,
      gateway_inspected_or_operated: false,
      executable_quote_requested_or_fabricated: false,
      contract_qualification_invoked: false,
      status_or_decision_item_changed: false,
      strategy_position_order_or_trade_authority: false,
    });
  });

  it('binds both exact adapters to complete current evidence', () => {
    const packageDigest = digest('capability-package.json');
    for (const provider of ['claude', 'codex']) {
      const evidence = readJson(`evidence/${provider}.json`);
      const results = evidence.results as Record<string, { status: string }>;
      expect(evidence.package_digest).toBe(packageDigest);
      expect(evidence.adapter_digest).toBe(digest(`adapters/${provider}.md`));
      expect(evidence.support_state).toBe('current');
      expect(Object.values(results).every(({ status }) => status === 'passed')).toBe(true);
    }
  });
});
