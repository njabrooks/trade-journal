/**
 * Auto-link strategies to their asset thesis (W8 follow-on) — DB layer.
 *
 * Every strategy belongs to an asset thesis (hedges/tactical included — they're just
 * strategies under the same long-term belief). This sweep ensures that: for each
 * active/draft strategy with no asset_thesis_id, it resolves the canonical underlying
 * (following underlyings.parent_underlying_id, e.g. IBIT→BTC), then links to that
 * underlying's thesis, creates a placeholder thesis for a direct underlying, or flags
 * an unresolvable proxy (e.g. PURR, an option whose real underlying isn't mapped) for
 * judgment. Pure decision logic + direction inference live in ./strategyThesisLinkRules.
 *
 * Runs inside recomputeAccountStrategyStatuses (before the cascade, so newly-linked
 * theses get promoted in the same pass). Idempotent — only touches null-thesis strategies.
 */
import { db } from '@/db';
import { strategies, strategyTemplates, underlyings, assetTheses, positions, journalEntries } from '@/db/schema';
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import { logToJournal } from '@/lib/workflow/lifecycleDetection';
import { decideStrategyThesisAction, inferThesisDirection, type StrategyThesisAction } from '@/lib/derived/strategyThesisLinkRules';

/** Cash-equivalents that never get a thesis. */
const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'USD', 'USDE', 'FDUSD', 'TUSD', 'BUSD', 'PYUSD', 'GUSD', 'USDD', 'USDS', 'CASH']);

export interface StrategyThesisResult {
  strategyId: string;
  strategyKey: string;
  canonicalTicker: string | null;
  action: StrategyThesisAction;
  thesisId?: string;
  thesisTitle?: string;
  direction?: string;
  detail: string;
}

interface Canonical { id: string; ticker: string; assetClass: string | null }

/** Follow parent_underlying_id to the root (depth-capped against cycles). */
async function resolveCanonical(underlyingId: string): Promise<Canonical | null> {
  let cur: string | null = underlyingId;
  let last: Canonical | null = null;
  for (let i = 0; i < 6 && cur; i++) {
    const [u] = await db
      .select({ id: underlyings.id, ticker: underlyings.ticker, assetClass: underlyings.assetClass, parent: underlyings.parentUnderlyingId })
      .from(underlyings)
      .where(eq(underlyings.id, cur))
      .limit(1);
    if (!u) break;
    last = { id: u.id, ticker: u.ticker, assetClass: u.assetClass };
    cur = u.parent;
  }
  return last;
}

/** Net signed quantity across the strategy's latest-snapshot positions (for placeholder direction). */
async function netSignedQuantity(strategyId: string): Promise<number> {
  const [row] = await db
    .select({ net: sql<number>`coalesce(sum(${positions.quantity}), 0)` })
    .from(positions)
    .where(and(eq(positions.strategyId, strategyId), eq(positions.snapshotDate, sql`(select max(snapshot_date) from positions p2 where p2.strategy_id = ${strategyId})`)));
  return Number(row?.net ?? 0);
}

export interface EnsureOptions {
  accountId?: string;
  dryRun?: boolean;
  /** When live (not dry-run), raise a DecisionStrip item for `flag` outcomes. */
  raiseDecisions?: boolean;
}

export async function ensureAssetThesesForStrategies(opts: EnsureOptions = {}): Promise<StrategyThesisResult[]> {
  const dryRun = opts.dryRun ?? false;
  // Active (live) strategies only — a thesis tracks a live exposure. Draft strategies
  // (no positions) and resolved ones don't get auto-linked.
  const where = [eq(strategies.status, 'active'), isNull(strategies.assetThesisId)];
  if (opts.accountId) where.push(eq(strategies.accountId, opts.accountId));

  const rows = await db
    .select({ id: strategies.id, strategyKey: strategies.strategyKey, underlyingId: strategyTemplates.underlyingId })
    .from(strategies)
    .leftJoin(strategyTemplates, eq(strategyTemplates.id, strategies.strategyTemplateId))
    .where(and(...where));

  const results: StrategyThesisResult[] = [];

  for (const s of rows) {
    if (!s.underlyingId) {
      results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: null, action: 'flag', detail: 'no underlying on strategy template' });
      continue;
    }
    const canonical = await resolveCanonical(s.underlyingId);
    if (!canonical) {
      results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: null, action: 'flag', detail: 'could not resolve canonical underlying' });
      continue;
    }

    // Defensive: never create a thesis for a corrupted (non-ASCII homoglyph) ticker —
    // flag it; corrupted strategies should be cleaned up (flag-corrupted-strategies).
    if (!/^[\x00-\x7F]*$/.test(canonical.ticker)) {
      results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: canonical.ticker, action: 'flag', detail: 'corrupted (non-ASCII ticker) — clean up, do not thesis' });
      continue;
    }

    const isStablecoin = STABLECOINS.has(canonical.ticker.toUpperCase());
    const [existingThesis] = await db
      .select({ id: assetTheses.id, title: assetTheses.title })
      .from(assetTheses)
      .where(and(eq(assetTheses.underlyingId, canonical.id), sql`${assetTheses.status} != 'rejected'`))
      .orderBy(sql`CASE ${assetTheses.status} WHEN 'monitoring' THEN 0 WHEN 'developing' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END`, desc(assetTheses.updatedAt))
      .limit(1);

    const action = decideStrategyThesisAction({
      alreadyLinked: false,
      isStablecoin,
      hasThesisOnCanonical: !!existingThesis,
      canonicalAssetClass: canonical.assetClass,
      unresolvedProxy: false,
    });

    if (action === 'skip') {
      results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: canonical.ticker, action, detail: isStablecoin ? 'stablecoin/cash — no thesis' : 'skip' });
      continue;
    }

    if (action === 'link') {
      if (!dryRun) {
        await db.update(strategies).set({ assetThesisId: existingThesis!.id, updatedAt: new Date() }).where(eq(strategies.id, s.id));
        await logToJournal({ objectType: 'strategy', objectId: s.id, objectTitle: s.strategyKey, actionType: 'thesis_linked', actionDescription: `Auto-linked to asset thesis "${existingThesis!.title}" (canonical ${canonical.ticker})`, source: 'automation' });
      }
      results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: canonical.ticker, action, thesisId: existingThesis!.id, thesisTitle: existingThesis!.title, detail: 'linked to existing thesis' });
      continue;
    }

    if (action === 'create_placeholder') {
      const dir = inferThesisDirection(await netSignedQuantity(s.id));
      const dirLabel = dir === 'bearish' ? 'Bearish' : dir === 'neutral' ? 'Neutral' : 'Bullish';
      const title = `${dirLabel} ${canonical.ticker}`;
      let thesisId: string | undefined;
      if (!dryRun) {
        const [created] = await db
          .insert(assetTheses)
          .values({
            underlyingId: canonical.id,
            title,
            description: `Auto-created placeholder from live strategy ${s.strategyKey}. Develop via research (Tana-first) — claims, digest and signals will follow.`,
            direction: dir,
            status: 'developing',
            confidenceLevel: 'exploratory',
            timeHorizon: 'medium_term',
          })
          .returning({ id: assetTheses.id });
        thesisId = created.id;
        await db.update(strategies).set({ assetThesisId: thesisId, updatedAt: new Date() }).where(eq(strategies.id, s.id));
        await logToJournal({ objectType: 'asset_thesis', objectId: thesisId, objectTitle: title, actionType: 'created', actionDescription: `Placeholder asset thesis auto-created for live strategy ${s.strategyKey} (${canonical.ticker}); to be developed via research.`, source: 'automation' });
        await logToJournal({ objectType: 'strategy', objectId: s.id, objectTitle: s.strategyKey, actionType: 'thesis_linked', actionDescription: `Auto-linked to new placeholder thesis "${title}"`, source: 'automation' });
      }
      results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: canonical.ticker, action, thesisId, thesisTitle: title, direction: dir, detail: 'created placeholder thesis' });
      continue;
    }

    // flag — unresolved proxy; surface a decision (live) for an agent/user to map it.
    if (!dryRun && opts.raiseDecisions) {
      const existing = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.objectId, s.id), eq(journalEntries.actionType, 'decision_required'), eq(journalEntries.status, 'active')))
        .limit(1);
      if (existing.length === 0) {
        await logToJournal({
          objectType: 'strategy',
          objectId: s.id,
          objectTitle: s.strategyKey,
          actionType: 'decision_required',
          actionDescription: `Strategy ${s.strategyKey} (${canonical.ticker}, ${canonical.assetClass}) has no asset thesis and its real underlying can't be auto-resolved`,
          rationale: `This looks like a proxy/derivative (e.g. an option or ETF) whose economic underlying differs from the instrument. Map it: set underlyings.parent_underlying_id for ${canonical.ticker} to its real underlying (then it auto-links), or link the strategy to the right asset thesis directly.`,
          source: 'automation',
        });
      }
    }
    results.push({ strategyId: s.id, strategyKey: s.strategyKey, canonicalTicker: canonical.ticker, action, detail: `unresolved proxy (${canonical.assetClass}) — needs judgment` });
  }

  return results;
}
