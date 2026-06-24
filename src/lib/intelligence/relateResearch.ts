/**
 * relate-research engine (W8) — anticipatory claim→thesis relating.
 *
 * Replaces the unconditional Tana→Trade Journal claim promotion (D2). For each
 * newly-extracted investment claim, this resolves it against the ACTIVE thesis
 * set and lands only the genuinely relevant minority:
 *   - developing theses → claim_thesis_mappings (semantic relevance: mapping_type + confidence)
 *   - monitoring theses → signal evidence (signal_data_snapshots + claim_signal_evidences)
 *   - no relevant thesis → not promoted; the claim stays in Tana only (the gate)
 *
 * Clear matches auto-link silently; genuine decisions (ambiguous links, and ALL
 * refuting evidence) emit `decision_required` journal entries that surface in the
 * dashboard DecisionStrip — a digest, not a queue (D2/D5).
 *
 * Architecture (mirrors the W7 options-advisor split):
 *   - This module is DETERMINISTIC: it resolves candidates, scores the signal
 *     route, and owns every DB write + the auto-link-vs-decision POLICY.
 *   - The SEMANTIC JUDGMENT (supports / refutes / foundation + confidence over a
 *     developing thesis) runs on Claude inside the /relate-research skill, which
 *     pipes a judged plan back into `applyJudgedPlan`. We do NOT call an API LLM
 *     here — per ai-providers, Claude judgment goes through spawned agents.
 *
 * The deterministic signal route (monitoring theses) can be applied without any
 * judgment via `applySignalEvidence` — it is pure ticker-matched scoring.
 *
 * Dry-run parity: `applyJudgedPlan` computes its counts from the SAME existence
 * checks in dry-run and real mode (the writers take a `dryRun` flag), so a dry-run
 * preview faithfully predicts the real apply — including on idempotent re-runs.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  researchInsights,
  mainClaims,
  claimThesisMappings,
  signalDataSnapshots,
  claimSignalEvidences,
  journalEntries,
  macroTheses,
  assetTheses,
  underlyings,
} from '../../db/schema.js';
import { resolveRelevanceContext } from './resolver.js';
import { scoreContentAgainstSignal, type ContentForScoring, type Assessment } from './scoring.js';
import { buildDecisionPacket } from '../types/decisions.js';

// ---------------------------------------------------------------------------
// Tunable policy (relevance thresholds). Centralised so validation can tune.
// ---------------------------------------------------------------------------

/** Below this confidence a developing-thesis link is not created at all. */
export const RELEVANCE_FLOOR = 0.4;
/** supports/foundation at or above this confidence: auto-link silently. */
export const AUTO_LINK_CONFIDENCE = 0.7;
/** Confidence bucket cutoff for claim_thesis_mappings.confidence ('medium'). */
export const MEDIUM_CONFIDENCE = 0.5;

const DATA_SOURCE = 'research_routing'; // signal_data_snapshots.data_source for this job
const MAPPED_BY = 'relate_research'; // claim_thesis_mappings.mapped_by provenance

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CandidateClaim {
  insightId: string;
  sourceClaimId: string; // e.g. "claim-1" from claims_structure
  title: string;
  category: string; // 'macro' | 'asset_specific'
  claim: string;
  evidence: string[] | null;
  reasoning: string | null;
  backing: string | null;
  qualifier: string | null;
  rebuttal: string[] | null;
  timeHorizon: string | null;
  relevantTickers: string[];
}

/** An active thesis the skill judges each claim against (the full set, not a keyword pre-filter). */
export interface CatalogThesis {
  id: string;
  type: 'macro' | 'asset';
  title: string;
  description: string | null;
  direction: string | null;
  status: string; // 'developing' | 'monitoring'
  ticker: string | null; // asset theses only
  sectors: string[] | null; // macro theses only
  themes: string[] | null; // macro theses only
}

export interface SignalMatch {
  signalId: string;
  thesisId: string;
  thesisType: string;
  signalType: string;
  statement: string;
  score: number;
  /** True when the claim shares the signal-thesis ticker (+3 component fired). */
  tickerMatched: boolean;
  assessment: string;
  evidenceSummary: string;
}

/** Per-claim payload: the claim plus its deterministic ticker-matched signal hits. */
export interface ClaimWorksheet {
  claim: CandidateClaim;
  /** Monitoring-phase signal hits with a ticker match — deterministic, applied without judgment. */
  monitoringSignalMatches: SignalMatch[];
}

/** A single judged link, supplied by the skill, fed into applyJudgedPlan. */
export interface JudgedLink {
  insightId: string;
  sourceClaimId: string;
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  mappingType: 'supports' | 'refutes' | 'foundation';
  confidence: number; // 0..1
  reasoning: string;
}

export interface ApplySummary {
  claimsPromoted: number; // distinct claims promoted/refreshed into main_claims
  linksCreated: number;
  linksSkippedExisting: number;
  decisionsEmitted: number;
  signalEvidence: number;
  belowFloor: number;
  /** Links the skill proposed against non-active theses (draft/closed/complete/rejected) — rejected. */
  skippedNonActive: number;
  /** Detail on every dropped link so the operator can tell expected noise from real loss. */
  droppedLinks: Array<{
    insightId: string;
    sourceClaimId: string;
    thesisId: string;
    thesisTitle: string;
    reason: 'unknown-claim' | 'non-active';
  }>;
}

// ---------------------------------------------------------------------------
// Loading claims from research insights
// ---------------------------------------------------------------------------

interface RawMainClaim {
  id?: string;
  title?: string;
  category?: string;
  claim?: string;
  evidence?: unknown;
  reasoning?: string;
  backing?: string;
  qualifier?: string;
  rebuttal?: unknown;
  time_horizon?: string;
  relevant_tickers?: unknown;
  level?: string;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x) => typeof x === 'string') as string[];
  return out.length ? out : null;
}

/** Load the main-level candidate claims out of one or more research insights. */
export async function loadCandidateClaimsFromInsights(
  insightIds: string[],
  dbInstance?: typeof defaultDb,
): Promise<CandidateClaim[]> {
  const d = dbInstance ?? defaultDb;
  if (insightIds.length === 0) return [];

  const rows = await d
    .select({ id: researchInsights.id, claimsStructure: researchInsights.claimsStructure })
    .from(researchInsights)
    .where(inArray(researchInsights.id, insightIds));

  const out: CandidateClaim[] = [];
  for (const row of rows) {
    const cs = row.claimsStructure as { main_claims?: RawMainClaim[] } | null;
    if (!cs || !Array.isArray(cs.main_claims)) continue;

    for (const mc of cs.main_claims) {
      if (!mc?.id || !mc?.claim) continue;
      const th = mc.time_horizon && mc.time_horizon !== 'N/A' ? mc.time_horizon : null;
      out.push({
        insightId: row.id,
        sourceClaimId: String(mc.id),
        title: mc.title ?? mc.claim.slice(0, 80),
        category: mc.category ?? 'macro',
        claim: mc.claim,
        evidence: asStringArray(mc.evidence),
        reasoning: mc.reasoning ?? null,
        backing: mc.backing ?? null,
        qualifier: mc.qualifier ?? null,
        rebuttal: asStringArray(mc.rebuttal),
        timeHorizon: th,
        relevantTickers: (asStringArray(mc.relevant_tickers) ?? []).map((t) => t.toUpperCase()),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Worksheet preparation (deterministic resolution + signal scoring)
// ---------------------------------------------------------------------------

function claimText(claim: CandidateClaim): string {
  // Resolve/score against the core assertion only. Including reasoning/backing/
  // evidence floods the keyword matcher with incidental words (>4 chars) and
  // makes almost every thesis "match" — title + claim keeps it topical.
  return [claim.title, claim.claim].filter(Boolean).join(' ');
}

/**
 * Thesis-centric assessment for a deterministic (ticker-matched) signal hit.
 *
 * `assessment` is THESIS-CENTRIC wherever it is read: `strengthening`/`confirmed` mean the
 * THESIS got stronger and `weakening`/`invalidated` mean it got weaker — independent of
 * whether the signal encodes a confirmation or an invalidation criterion (see
 * `thesisHealthRules.isWeakening` and the daily-scores `DELTA_MAP`).
 *
 * The deterministic route knows only that a claim is TOPICALLY relevant to a signal (a
 * ticker/keyword score) — NOT whether the evidence advances or contradicts the signal's
 * criterion. The old `invalidation → weakening` mapping inferred thesis-direction from the
 * signal *type*, which inverts the common case: thesis-supportive evidence that makes an
 * invalidation LESS likely (capex accelerating against a "capex is cut" signal) was
 * mislabelled `weakening`, tripping false health alarms.
 *
 * Stance is unknowable here, so the route ABSTAINS and records `neutral`; the snapshot
 * still preserves the evidence text + claim↔signal link as provenance. The thesis
 * DIRECTION is supplied by judgment — the supports/refutes `mapping_type` the
 * relate-research skill sets on the thesis link in Step 2 — never inferred from the
 * signal's type here.
 */
function assessSignal(): Assessment {
  return 'neutral';
}

/** Build a relating worksheet per candidate claim. Pure reads — no writes. */
export async function prepareWorksheets(
  claims: CandidateClaim[],
  dbInstance?: typeof defaultDb,
): Promise<ClaimWorksheet[]> {
  const d = dbInstance ?? defaultDb;
  const worksheets: ClaimWorksheet[] = [];

  for (const claim of claims) {
    const text = claimText(claim);
    // Resolve by TICKER ONLY. The worksheet keeps only ticker-matched signal hits
    // (asset theses), so the resolver's text/sector macro scan can never produce a kept
    // match — passing `text` would just run a dead per-claim 34-row macro scan.
    const ctx = await resolveRelevanceContext(claim.relevantTickers, d);

    // Monitoring-phase signals → deterministic evidence route.
    const monitoringThesisIds = new Set(
      ctx.allTheses.filter((t) => t.status === 'monitoring').map((t) => t.id),
    );
    const content: ContentForScoring = { text, tickers: claim.relevantTickers };
    const monitoringSignalMatches: SignalMatch[] = [];

    for (const signal of ctx.signals) {
      if (!monitoringThesisIds.has(signal.thesisId)) continue;
      const thesisTicker = ctx.tickerMap[signal.thesisId] ?? null;
      const tickerMatched =
        !!thesisTicker && claim.relevantTickers.some((t) => t.toUpperCase() === thesisTicker.toUpperCase());
      // Only ticker-matched hits are kept (asset-thesis ticker match) — skip the rest cheaply.
      if (!tickerMatched) continue;
      const score = scoreContentAgainstSignal(content, signal, thesisTicker, false);
      if (score > 0) {
        monitoringSignalMatches.push({
          signalId: signal.id,
          thesisId: signal.thesisId,
          thesisType: signal.thesisType,
          signalType: signal.type,
          statement: signal.statement,
          score,
          tickerMatched,
          assessment: assessSignal(),
          evidenceSummary: buildEvidenceSummary(claim),
        });
      }
    }

    worksheets.push({ claim, monitoringSignalMatches });
  }

  return worksheets;
}

function buildEvidenceSummary(claim: CandidateClaim): string {
  const t = claim.title.length > 150 ? claim.title.slice(0, 150) + '…' : claim.title;
  return `[research] ${t}`;
}

/**
 * The full active thesis set (developing + monitoring) the skill judges claims against.
 * This replaces keyword pre-filtering: Claude reads the catalog and decides genuine
 * relevance per claim. Descriptions are truncated to bound the judgment context.
 */
export async function getActiveThesisCatalog(dbInstance?: typeof defaultDb): Promise<CatalogThesis[]> {
  const d = dbInstance ?? defaultDb;
  const ACTIVE = ['developing', 'monitoring'];
  const clip = (s: string | null): string | null => (s && s.length > 300 ? s.slice(0, 300) + '…' : s);

  const macros = await d
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      description: macroTheses.description,
      direction: macroTheses.direction,
      status: macroTheses.status,
      sectors: macroTheses.sectors,
      themes: macroTheses.themes,
    })
    .from(macroTheses)
    .where(inArray(macroTheses.status, ACTIVE));

  const assets = await d
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      description: assetTheses.description,
      direction: assetTheses.direction,
      status: assetTheses.status,
      ticker: underlyings.ticker,
    })
    .from(assetTheses)
    .leftJoin(underlyings, eq(assetTheses.underlyingId, underlyings.id))
    .where(inArray(assetTheses.status, ACTIVE));

  return [
    ...macros.map((m): CatalogThesis => ({
      id: m.id,
      type: 'macro',
      title: m.title,
      description: clip(m.description),
      direction: m.direction ?? null,
      status: m.status ?? 'developing',
      ticker: null,
      sectors: m.sectors ?? null,
      themes: (m.themes as string[] | null) ?? null,
    })),
    ...assets.map((a): CatalogThesis => ({
      id: a.id,
      type: 'asset',
      title: a.title,
      description: clip(a.description),
      direction: a.direction ?? null,
      status: a.status ?? 'developing',
      ticker: a.ticker ?? null,
      sectors: null,
      themes: null,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Existence checks (single source of truth — used by both writers and dry-run)
// ---------------------------------------------------------------------------

async function findExistingClaimId(
  insightId: string,
  sourceClaimId: string,
  d: typeof defaultDb,
): Promise<string | null> {
  const [row] = await d
    .select({ id: mainClaims.id })
    .from(mainClaims)
    .where(and(eq(mainClaims.sourceInsightId, insightId), eq(mainClaims.sourceClaimId, sourceClaimId)))
    .limit(1);
  return row?.id ?? null;
}

async function findExistingMappingId(
  claimId: string,
  thesisType: 'macro' | 'asset',
  thesisId: string,
  d: typeof defaultDb,
): Promise<string | null> {
  const thesisFilter =
    thesisType === 'macro'
      ? eq(claimThesisMappings.macroThesisId, thesisId)
      : eq(claimThesisMappings.assetThesisId, thesisId);
  const [row] = await d
    .select({ id: claimThesisMappings.id })
    .from(claimThesisMappings)
    .where(and(eq(claimThesisMappings.mainClaimId, claimId), thesisFilter))
    .limit(1);
  return row?.id ?? null;
}

async function findActiveDecisionId(
  thesisId: string,
  insightId: string,
  sourceClaimId: string,
  d: typeof defaultDb,
): Promise<string | null> {
  const open = await d
    .select({ id: journalEntries.id, metadata: journalEntries.metadata })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.objectId, thesisId),
        eq(journalEntries.actionType, 'decision_required'),
        eq(journalEntries.status, 'active'),
      ),
    );
  const hit = open.find((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    return m.insightId === insightId && m.sourceClaimId === sourceClaimId;
  });
  return hit?.id ?? null;
}

// ---------------------------------------------------------------------------
// Persistence helpers (dryRun-aware so dry-run counts match real writes exactly)
// ---------------------------------------------------------------------------

function confidenceBucket(c: number): 'high' | 'medium' | 'low' {
  if (c >= AUTO_LINK_CONFIDENCE) return 'high';
  if (c >= MEDIUM_CONFIDENCE) return 'medium';
  return 'low';
}

function journalValues(entry: {
  objectType: string;
  objectId: string;
  objectTitle?: string;
  actionType: string;
  actionDescription: string;
  source: 'user' | 'skill' | 'automation';
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  return { ...entry, firstDetectedAt: now, lastSeenAt: now, occurrenceCount: 1, status: 'active' as const };
}

/**
 * Upsert a candidate claim into main_claims, deduped on (sourceInsightId, sourceClaimId)
 * via the unique index + onConflictDoUpdate (atomic, concurrency-safe). In dry-run it
 * only reads the existing id.
 */
export async function promoteClaim(
  claim: CandidateClaim,
  dbInstance?: typeof defaultDb,
  opts: { dryRun?: boolean } = {},
): Promise<{ id: string | null }> {
  const d = dbInstance ?? defaultDb;
  if (opts.dryRun) {
    return { id: await findExistingClaimId(claim.insightId, claim.sourceClaimId, d) };
  }

  const fields = {
    title: claim.title,
    category: claim.category,
    claim: claim.claim,
    evidence: claim.evidence,
    reasoning: claim.reasoning,
    backing: claim.backing,
    qualifier: claim.qualifier,
    rebuttal: claim.rebuttal,
    timeHorizon: claim.timeHorizon,
    relevantTickers: claim.relevantTickers,
  };

  const [row] = await d
    .insert(mainClaims)
    .values({ ...fields, status: 'draft', sourceInsightId: claim.insightId, sourceClaimId: claim.sourceClaimId })
    .onConflictDoUpdate({
      target: [mainClaims.sourceInsightId, mainClaims.sourceClaimId],
      set: { ...fields, updatedAt: new Date() },
    })
    .returning({ id: mainClaims.id });
  return { id: row.id };
}

/**
 * Create a claim↔thesis mapping if absent (mapping + both audit journal entries committed
 * atomically). Returns 'created' | 'would-create' | 'exists'.
 */
export async function ensureMapping(
  args: {
    claimId: string | null;
    claimTitle: string;
    thesisId: string;
    thesisType: 'macro' | 'asset';
    thesisTitle: string;
    mappingType: 'supports' | 'refutes' | 'foundation';
    confidence: number;
    reasoning: string;
  },
  dbInstance?: typeof defaultDb,
  opts: { dryRun?: boolean } = {},
): Promise<'created' | 'would-create' | 'exists'> {
  const d = dbInstance ?? defaultDb;

  if (args.claimId) {
    const existing = await findExistingMappingId(args.claimId, args.thesisType, args.thesisId, d);
    if (existing) return 'exists';
  }
  if (opts.dryRun) return 'would-create';
  if (!args.claimId) throw new Error('ensureMapping: claimId required for a real write');

  return await d.transaction(async (tx) => {
    const inserted = await tx
      .insert(claimThesisMappings)
      .values({
        mainClaimId: args.claimId!,
        macroThesisId: args.thesisType === 'macro' ? args.thesisId : undefined,
        assetThesisId: args.thesisType === 'asset' ? args.thesisId : undefined,
        mappingType: args.mappingType,
        confidence: confidenceBucket(args.confidence),
        mappedBy: MAPPED_BY,
        notes: args.reasoning,
      })
      .onConflictDoNothing()
      .returning({ id: claimThesisMappings.id });

    if (inserted.length === 0) return 'exists' as const; // raced between check and insert

    const pct = Math.round(args.confidence * 100);
    // Audit trail on both entities (does NOT surface in the DecisionStrip).
    await tx.insert(journalEntries).values(
      journalValues({
        objectType: 'claim',
        objectId: args.claimId!,
        objectTitle: args.claimTitle,
        actionType: 'claim_linked',
        actionDescription: `Auto-linked to ${args.thesisType} thesis "${args.thesisTitle}" as ${args.mappingType} (${pct}%) by relate-research`,
        source: 'automation',
        metadata: { thesisId: args.thesisId, thesisType: args.thesisType, mappingType: args.mappingType, confidence: args.confidence },
      }),
    );
    await tx.insert(journalEntries).values(
      journalValues({
        objectType: args.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis',
        objectId: args.thesisId,
        objectTitle: args.thesisTitle,
        actionType: 'claim_linked',
        actionDescription: `Claim "${args.claimTitle}" auto-linked as ${args.mappingType} by relate-research`,
        source: 'automation',
        metadata: { claimId: args.claimId, mappingType: args.mappingType, confidence: args.confidence },
      }),
    );
    return 'created' as const;
  });
}

/** Emit a decision_required journal entry (deduped per claim+thesis). 'emitted' | 'would-emit' | 'exists'. */
export async function emitDecision(
  args: {
    thesisId: string;
    thesisType: 'macro' | 'asset';
    thesisTitle: string;
    claim: CandidateClaim;
    kind: 'tentative_link' | 'refuting';
    mappingType: string;
    confidence: number;
    reasoning: string;
  },
  dbInstance?: typeof defaultDb,
  opts: { dryRun?: boolean } = {},
): Promise<'emitted' | 'would-emit' | 'exists'> {
  const d = dbInstance ?? defaultDb;
  const existing = await findActiveDecisionId(args.thesisId, args.claim.insightId, args.claim.sourceClaimId, d);
  if (existing) return 'exists';
  if (opts.dryRun) return 'would-emit';

  const objectType = args.thesisType === 'macro' ? 'macro_thesis' : 'asset_thesis';
  const pct = Math.round(args.confidence * 100);
  const desc =
    args.kind === 'refuting'
      ? `Refuting evidence for "${args.thesisTitle}": claim "${args.claim.title}" (${pct}%). Review whether the thesis still holds.`
      : `Possible link for "${args.thesisTitle}": claim "${args.claim.title}" as ${args.mappingType} (${pct}%). Confirm or sever.`;

  await d.insert(journalEntries).values(
    journalValues({
      objectType,
      objectId: args.thesisId,
      objectTitle: args.thesisTitle,
      actionType: 'decision_required',
      actionDescription: desc,
      source: 'automation',
      metadata: {
        // Flat keys retained — findActiveDecisionId dedups on metadata.insightId/sourceClaimId.
        insightId: args.claim.insightId,
        sourceClaimId: args.claim.sourceClaimId,
        claimTitle: args.claim.title,
        kind: args.kind,
        mappingType: args.mappingType,
        confidence: args.confidence,
        reasoning: args.reasoning,
        decision: buildDecisionPacket({
          decision_type: args.kind === 'refuting' ? 'review_refuting_claim' : 'confirm_claim_link',
          why_raised: args.reasoning,
          evidence_context: {
            claimTitle: args.claim.title,
            mappingType: args.mappingType,
            confidence: args.confidence,
            insightId: args.claim.insightId,
            sourceClaimId: args.claim.sourceClaimId,
          },
          recommended_actions:
            args.kind === 'refuting'
              ? [
                  { action: 'acknowledge', label: 'Acknowledge — fold into evidence gaps' },
                  { action: 'downgrade', label: 'Downgrade thesis confidence' },
                  { action: 'reject_thesis', label: 'Reject the thesis' },
                ]
              : [
                  { action: 'confirm', label: 'Confirm the link' },
                  { action: 'sever', label: 'Sever the link' },
                  { action: 'adjust', label: 'Adjust mapping type' },
                ],
          default_recommendation:
            args.kind === 'refuting'
              ? { action: 'acknowledge', confidence: 'medium' }
              : { action: 'confirm', confidence: args.confidence >= 0.6 ? 'high' : 'low' },
        }),
      },
    }),
  );
  return 'emitted';
}

/**
 * Record one signal-evidence snapshot + claim↔signal link for a promoted claim, atomically.
 * Re-runs heal a missing evidence row instead of skipping it (the snapshot dedup no longer
 * short-circuits the link). Returns true when a NEW claim↔signal link was created.
 */
export async function recordSignalEvidence(
  args: { claimId: string; match: SignalMatch },
  dbInstance?: typeof defaultDb,
): Promise<boolean> {
  const d = dbInstance ?? defaultDb;

  return await d.transaction(async (tx) => {
    // Snapshot: deduped by the partial unique (signal_id, claim_id) WHERE research_routing.
    const ins = await tx
      .insert(signalDataSnapshots)
      .values({
        signalId: args.match.signalId,
        assessment: args.match.assessment,
        evidenceSummary: args.match.evidenceSummary,
        dataSource: DATA_SOURCE,
        status: 'pending',
        claimId: args.claimId,
      })
      .onConflictDoNothing()
      .returning({ id: signalDataSnapshots.id });

    let snapshotId = ins[0]?.id ?? null;
    if (!snapshotId) {
      // Snapshot already existed (prior run) — fetch it so the evidence row keeps provenance.
      const [ex] = await tx
        .select({ id: signalDataSnapshots.id })
        .from(signalDataSnapshots)
        .where(
          and(
            eq(signalDataSnapshots.signalId, args.match.signalId),
            eq(signalDataSnapshots.claimId, args.claimId),
            eq(signalDataSnapshots.dataSource, DATA_SOURCE),
          ),
        )
        .limit(1);
      snapshotId = ex?.id ?? null;
    }

    // Always attempt the claim↔signal link — heals a row missing from a prior partial run.
    const ev = await tx
      .insert(claimSignalEvidences)
      .values({ claimId: args.claimId, signalId: args.match.signalId, assessment: args.match.assessment, snapshotId })
      .onConflictDoNothing()
      .returning({ id: claimSignalEvidences.id });

    return ev.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Appliers
// ---------------------------------------------------------------------------

/**
 * Apply the deterministic monitoring/signal route for a set of worksheets.
 * Promotes any claim with ≥1 ticker-matched signal hit and records the evidence. No judgment.
 */
export async function applySignalEvidence(
  worksheets: ClaimWorksheet[],
  opts: { dryRun?: boolean } = {},
  dbInstance?: typeof defaultDb,
): Promise<{ claimsPromoted: number; signalEvidence: number }> {
  const d = dbInstance ?? defaultDb;
  let claimsPromoted = 0;
  let signalEvidence = 0;

  for (const ws of worksheets) {
    // monitoringSignalMatches is already the ticker-matched subset (prepareWorksheets).
    const applicable = ws.monitoringSignalMatches;
    if (applicable.length === 0) continue;
    if (opts.dryRun) {
      signalEvidence += applicable.length;
      claimsPromoted += 1;
      continue;
    }
    const { id: claimId } = await promoteClaim(ws.claim, d);
    if (!claimId) continue;
    claimsPromoted += 1;
    for (const match of applicable) {
      if (await recordSignalEvidence({ claimId, match }, d)) signalEvidence += 1;
    }
  }
  return { claimsPromoted, signalEvidence };
}

/**
 * Apply a Claude-judged plan of developing-thesis links. The engine owns the
 * auto-link-vs-decision policy; the skill supplies (mappingType, confidence, reasoning).
 *
 * Single code path for dry-run and real: existence checks run in both modes (so the
 * dry-run counts match the real apply), only the writes are gated on `!dryRun`.
 */
export async function applyJudgedPlan(
  links: JudgedLink[],
  opts: { dryRun?: boolean } = {},
  dbInstance?: typeof defaultDb,
): Promise<ApplySummary> {
  const d = dbInstance ?? defaultDb;
  const dryRun = !!opts.dryRun;
  const summary: ApplySummary = {
    claimsPromoted: 0,
    linksCreated: 0,
    linksSkippedExisting: 0,
    decisionsEmitted: 0,
    signalEvidence: 0,
    belowFloor: 0,
    skippedNonActive: 0,
    droppedLinks: [],
  };

  // Reload candidate claims for every referenced insight (provenance + full fields).
  const insightIds = [...new Set(links.map((l) => l.insightId))];
  const claims = await loadCandidateClaimsFromInsights(insightIds, d);
  const claimByKey = new Map(claims.map((c) => [`${c.insightId}:${c.sourceClaimId}`, c]));

  // Active-thesis law (docs/v2/10 §7): claim links target ACTIVE theses — developing
  // OR monitoring. `monitoring` is a position flag, not an information gate; info attaches
  // by bearing regardless of whether you currently hold the position (this dissolves the
  // ENTG-style stranding). Reject only NON-active theses (draft/closed/complete/rejected)
  // so a killed/archived thesis can't accrue new evidence. Enforced here so a mis-judged
  // plan can't violate it. (Sequential queries — the script pool caps at 1 connection.)
  const ACTIVE_STATUSES = ['developing', 'monitoring'];
  const actMacro = await d.select({ id: macroTheses.id }).from(macroTheses).where(inArray(macroTheses.status, ACTIVE_STATUSES));
  const actAsset = await d.select({ id: assetTheses.id }).from(assetTheses).where(inArray(assetTheses.status, ACTIVE_STATUSES));
  const activeIds = new Set([...actMacro, ...actAsset].map((r) => r.id));

  const idByKey = new Map<string, string | null>(); // claimKey → mainClaims.id (or null if not yet in DB)
  const countedClaims = new Set<string>();

  for (const link of links) {
    if (link.confidence < RELEVANCE_FLOOR) {
      summary.belowFloor += 1;
      continue;
    }
    const key = `${link.insightId}:${link.sourceClaimId}`;
    const claim = claimByKey.get(key);
    if (!claim) {
      console.warn(`relate-research: judged link references unknown claim ${key} — skipped`);
      summary.droppedLinks.push({ insightId: link.insightId, sourceClaimId: link.sourceClaimId, thesisId: link.thesisId, thesisTitle: link.thesisTitle, reason: 'unknown-claim' });
      continue;
    }
    if (!activeIds.has(link.thesisId)) {
      summary.skippedNonActive += 1;
      summary.droppedLinks.push({ insightId: link.insightId, sourceClaimId: link.sourceClaimId, thesisId: link.thesisId, thesisTitle: link.thesisTitle, reason: 'non-active' });
      continue;
    }

    // Promote the claim once (real: upsert; dry: resolve existing id). Counts in both modes.
    if (!countedClaims.has(key)) {
      countedClaims.add(key);
      const { id } = await promoteClaim(claim, d, { dryRun });
      idByKey.set(key, id);
      summary.claimsPromoted += 1;
    }
    const claimId = idByKey.get(key) ?? null;

    // Mapping (created / would-create / exists — same existence check in both modes).
    const mres = await ensureMapping(
      {
        claimId,
        claimTitle: claim.title,
        thesisId: link.thesisId,
        thesisType: link.thesisType,
        thesisTitle: link.thesisTitle,
        mappingType: link.mappingType,
        confidence: link.confidence,
        reasoning: link.reasoning,
      },
      d,
      { dryRun },
    );
    if (mres === 'exists') summary.linksSkippedExisting += 1;
    else summary.linksCreated += 1;

    // Policy: ALL refuting links surface a decision (they already cleared the floor);
    // ambiguous supports/foundation (below the auto-link bar) also surface one.
    const refuting = link.mappingType === 'refutes';
    const ambiguous = link.mappingType !== 'refutes' && link.confidence < AUTO_LINK_CONFIDENCE;
    if (refuting || ambiguous) {
      const dres = await emitDecision(
        {
          thesisId: link.thesisId,
          thesisType: link.thesisType,
          thesisTitle: link.thesisTitle,
          claim,
          kind: refuting ? 'refuting' : 'tentative_link',
          mappingType: link.mappingType,
          confidence: link.confidence,
          reasoning: link.reasoning,
        },
        d,
        { dryRun },
      );
      if (dres !== 'exists') summary.decisionsEmitted += 1;
    }
  }

  return summary;
}
