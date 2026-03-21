import { db } from '@/db';
import {
  intelligenceReports,
  intelligenceItems,
  secFilings,
  economicEvents,
  earningsEvents,
  analystActions,
  insiderTransactions,
  signalDataSnapshots,
  claimSignalEvidences,
  mainClaims,
  signals,
  signalEntityLinks,
  macroTheses,
  assetTheses,
  underlyings,
  strategies,
} from '@/db/schema';
import { desc, gte, lte, and, eq, sql, not, inArray, isNotNull, lt } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedItemSource =
  | 'world_monitor'
  | 'thesis_monitor'
  | 'sec_filing'
  | 'economic_event'
  | 'earnings_event'
  | 'analyst_action'
  | 'insider_transaction'
  | 'claim_evidence'
  | 'quant_snapshot';

export interface FeedItem {
  id: string;
  source: FeedItemSource;
  timestamp: Date;
  headline: string;
  body?: string;
  severity?: 'critical' | 'high' | 'medium' | 'info';
  assessment?: 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated';
  observedValue?: number;
  thresholdValue?: number;
  pctToThreshold?: number;
  unit?: string;
  tickers?: string[];
  signalId?: string;
  signalStatement?: string;
  thesisId?: string;
  thesisType?: 'macro' | 'asset';
  thesisTitle?: string;
  sourceUrls?: string[];
  sector?: string;
  filingType?: string;
  filingCategory?: string;
  impactLevel?: string;
  isMaterial?: boolean;
  sourceRecordId?: string;
  // Economic event structured data
  country?: string;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  // Earnings structured data
  epsActual?: string | null;
  epsEstimate?: string | null;
  revenueActual?: string | null;
  revenueEstimate?: string | null;
  quarter?: string | null;
  year?: string | number | null;
  reportTime?: string | null;
  // Analyst action structured data
  analystFirm?: string;
  analystAction?: string;
  fromGrade?: string | null;
  toGrade?: string | null;
  // Insider transaction structured data
  insiderName?: string;
  transactionCode?: string;
  shareChange?: number | null;
  transactionPrice?: number | null;
  // Entity chain (resolved from ticker → underlying → asset_thesis → strategy)
  linkedAssetTheses?: { id: string; title: string; direction?: string }[];
  linkedStrategies?: { id: string; strategyKey: string }[];
  // Intelligence report section
  reportSection?: string;
}

export interface UnifiedFeedOptions {
  limit?: number;       // max items to return (default 200)
  offset?: number;      // pagination offset (default 0)
  sources?: FeedItemSource[];
  ticker?: string;
  days?: number;        // lookback window (default 3)
  minPerSource?: number; // guaranteed minimum items per source (default 8)
}

export interface UnifiedFeedResult {
  items: FeedItem[];
  hasMore: boolean;
}

export interface UpcomingCalendarData {
  economicEvents: {
    id: string;
    eventName: string;
    eventDate: string;
    eventTime: string | null;
    category: string | null;
    impact: string | null;
    country: string | null;
    actualValue: string | null;
    forecastValue: string | null;
    previousValue: string | null;
  }[];
  earningsEvents: {
    id: string;
    ticker: string;
    reportDate: string;
    reportTime: string | null;
    epsEstimate: string | null;
    epsActual: string | null;
    quarter: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Upcoming Calendar (forward-looking)
// ---------------------------------------------------------------------------

export async function getUpcomingCalendar(days = 7): Promise<UpcomingCalendarData> {
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  const impactOrder = sql`CASE impact_level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

  const [econ, earnings] = await Promise.all([
    db
      .select({
        id: economicEvents.id,
        eventName: economicEvents.title,
        eventDate: sql<string>`DATE(${economicEvents.eventDate})::text`,
        eventTime: sql<string | null>`NULLIF(TO_CHAR(${economicEvents.eventDate} AT TIME ZONE 'UTC', 'HH24:MI'), '00:00')`,
        category: economicEvents.category,
        impact: economicEvents.impactLevel,
        country: economicEvents.country,
        actualValue: sql<string | null>`${economicEvents.actual}::text`,
        forecastValue: sql<string | null>`${economicEvents.forecast}::text`,
        previousValue: sql<string | null>`${economicEvents.previous}::text`,
      })
      .from(economicEvents)
      .where(and(
        gte(economicEvents.eventDate, new Date()),
        lte(economicEvents.eventDate, futureDate),
      ))
      .orderBy(economicEvents.eventDate, impactOrder),

    db
      .select({
        id: earningsEvents.id,
        ticker: earningsEvents.ticker,
        reportDate: earningsEvents.reportDate,
        reportTime: earningsEvents.reportTime,
        epsEstimate: sql<string | null>`${earningsEvents.epsEstimate}::text`,
        epsActual: sql<string | null>`${earningsEvents.epsActual}::text`,
        quarter: earningsEvents.quarter,
      })
      .from(earningsEvents)
      .where(and(
        gte(earningsEvents.reportDate, new Date().toISOString().split('T')[0]),
        lte(earningsEvents.reportDate, futureDateStr),
      ))
      .orderBy(earningsEvents.reportDate),
  ]);

  return { economicEvents: econ, earningsEvents: earnings };
}

// ---------------------------------------------------------------------------
// Unified Feed (historical, reverse-chronological)
// ---------------------------------------------------------------------------

export async function getUnifiedFeed(options: UnifiedFeedOptions = {}): Promise<UnifiedFeedResult> {
  const {
    limit = 200,
    offset = 0,
    sources,
    ticker,
    days = 3,
    minPerSource = 8,
  } = options;

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Fetch enough per source to guarantee representation
  const perSourceLimit = Math.max(limit, minPerSource * 3);

  const allSources: FeedItemSource[] = [
    'world_monitor', 'thesis_monitor', 'sec_filing',
    'economic_event', 'earnings_event', 'analyst_action', 'insider_transaction',
    'claim_evidence', 'quant_snapshot',
  ];
  const activeSources = sources && sources.length > 0 ? sources : allSources;

  // Helper: wrap each query so individual failures don't crash the whole feed
  function safe(label: string, fn: () => Promise<FeedItem[]>): Promise<FeedItem[]> {
    return fn().catch((err) => {
      console.error(`[UnifiedFeed] ${label} failed:`, err?.message ?? err);
      return [];
    });
  }

  type SourceQuery = { source: FeedItemSource; promise: Promise<FeedItem[]> };
  const sourceQueries: SourceQuery[] = [];

  if (activeSources.includes('world_monitor')) {
    sourceQueries.push({ source: 'world_monitor', promise: safe('world_monitor', () => fetchWorldMonitorItems(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('thesis_monitor')) {
    sourceQueries.push({ source: 'thesis_monitor', promise: safe('thesis_monitor', () => fetchThesisMonitorItems(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('sec_filing')) {
    sourceQueries.push({ source: 'sec_filing', promise: safe('sec_filing', () => fetchSecFilings(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('economic_event')) {
    sourceQueries.push({ source: 'economic_event', promise: safe('economic_event', () => fetchPastEconomicEvents(cutoffDate, perSourceLimit)) });
  }
  if (activeSources.includes('earnings_event')) {
    sourceQueries.push({ source: 'earnings_event', promise: safe('earnings_event', () => fetchPastEarningsEvents(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('analyst_action')) {
    sourceQueries.push({ source: 'analyst_action', promise: safe('analyst_action', () => fetchAnalystActions(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('insider_transaction')) {
    sourceQueries.push({ source: 'insider_transaction', promise: safe('insider_transaction', () => fetchInsiderTransactions(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('claim_evidence')) {
    sourceQueries.push({ source: 'claim_evidence', promise: safe('claim_evidence', () => fetchClaimEvidence(cutoffDate, perSourceLimit, ticker)) });
  }
  if (activeSources.includes('quant_snapshot')) {
    sourceQueries.push({ source: 'quant_snapshot', promise: safe('quant_snapshot', () => fetchQuantSnapshots(cutoffDate, perSourceLimit, ticker)) });
  }

  // Run queries in batches of 3 to avoid overwhelming the connection pool
  const sourceResults: { source: FeedItemSource; items: FeedItem[] }[] = [];
  for (let i = 0; i < sourceQueries.length; i += 3) {
    const batch = sourceQueries.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map((sq) => sq.promise));
    for (let j = 0; j < batch.length; j++) {
      sourceResults.push({ source: batch[j].source, items: batchResults[j] });
    }
  }

  // Balanced merge: guarantee minPerSource items from each source,
  // then fill remaining slots chronologically
  const guaranteed: FeedItem[] = [];
  const overflow: FeedItem[] = [];

  for (const { items } of sourceResults) {
    // Sort each source by timestamp desc
    const sorted = items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    guaranteed.push(...sorted.slice(0, minPerSource));
    overflow.push(...sorted.slice(minPerSource));
  }

  // Sort guaranteed by timestamp, then append overflow sorted by timestamp
  guaranteed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  overflow.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Merge: guaranteed items first, then overflow to fill up to limit
  const merged = [...guaranteed, ...overflow];
  // De-duplicate by id (guaranteed items appear in overflow too — they don't, but be safe)
  const seen = new Set<string>();
  const unique = merged.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  const sliced = unique.slice(offset, offset + limit);
  const hasMore = unique.length > offset + limit;

  // Enrich ticker-based items with entity chain
  await enrichWithEntityChain(sliced);

  return { items: sliced, hasMore };
}

// ---------------------------------------------------------------------------
// Source-specific fetch functions (all use Drizzle query builder)
// ---------------------------------------------------------------------------

async function fetchIntelligenceItems(
  reportType: 'world-monitor' | 'thesis-monitor',
  feedSource: FeedItemSource,
  cutoff: Date,
  limit: number,
  ticker?: string,
): Promise<FeedItem[]> {
  const conditions = [
    eq(intelligenceReports.reportType, reportType),
    gte(intelligenceReports.generatedAt, cutoff),
  ];
  if (ticker) {
    conditions.push(sql`${ticker} = ANY(${intelligenceItems.relevantTickers})`);
  }

  const rows = await db
    .select({
      id: intelligenceItems.id,
      generatedAt: intelligenceReports.generatedAt,
      severity: intelligenceItems.severity,
      sector: intelligenceItems.sector,
      headline: intelligenceItems.headline,
      body: intelligenceItems.body,
      sourceUrls: intelligenceItems.sourceUrls,
      relevantTickers: intelligenceItems.relevantTickers,
      section: intelligenceItems.section,
      sortOrder: intelligenceItems.sortOrder,
    })
    .from(intelligenceItems)
    .innerJoin(intelligenceReports, eq(intelligenceReports.id, intelligenceItems.reportId))
    .where(and(...conditions))
    .orderBy(desc(intelligenceReports.generatedAt), intelligenceItems.sortOrder, intelligenceItems.createdAt)
    .limit(limit);

  return rows.map((r) => {
    // Offset timestamp by sortOrder (in seconds) so items preserve report order in merged feed
    const ts = new Date(r.generatedAt);
    if (r.sortOrder != null) ts.setSeconds(ts.getSeconds() - r.sortOrder);
    return {
      id: r.id,
      source: feedSource,
      timestamp: ts,
      headline: r.headline,
      body: r.body ?? undefined,
      severity: r.severity as FeedItem['severity'],
      tickers: r.relevantTickers ?? undefined,
      sourceUrls: r.sourceUrls ?? undefined,
      sector: r.sector ?? undefined,
      reportSection: r.section ?? undefined,
      sourceRecordId: r.id,
    };
  });
}

async function fetchWorldMonitorItems(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  return fetchIntelligenceItems('world-monitor', 'world_monitor', cutoff, limit, ticker);
}

async function fetchThesisMonitorItems(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  return fetchIntelligenceItems('thesis-monitor', 'thesis_monitor', cutoff, limit, ticker);
}

async function fetchSecFilings(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const conditions = [gte(secFilings.filedDate, cutoffStr)];
  if (ticker) {
    conditions.push(eq(sql`UPPER(${secFilings.ticker})`, sql`UPPER(${ticker})`));
  }

  const rows = await db
    .select()
    .from(secFilings)
    .where(and(...conditions))
    .orderBy(desc(secFilings.filedDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    source: 'sec_filing' as const,
    timestamp: new Date(r.filedDate + 'T00:00:00Z'),
    headline: `${r.filingType} filing: ${r.ticker}`,
    body: r.description ?? undefined,
    tickers: [r.ticker],
    filingType: r.filingType,
    filingCategory: r.filingCategory ?? undefined,
    isMaterial: r.isMaterial ?? undefined,
    sourceUrls: [r.filingUrl],
    sourceRecordId: r.id,
  }));
}

async function fetchPastEconomicEvents(cutoff: Date, limit: number): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: economicEvents.id,
      title: economicEvents.title,
      eventDate: economicEvents.eventDate,
      impactLevel: economicEvents.impactLevel,
      actual: sql<string | null>`${economicEvents.actual}::text`,
      forecast: sql<string | null>`${economicEvents.forecast}::text`,
      previous: sql<string | null>`${economicEvents.previous}::text`,
      unit: economicEvents.unit,
      country: economicEvents.country,
    })
    .from(economicEvents)
    .where(and(
      lt(economicEvents.eventDate, new Date()),
      gte(economicEvents.eventDate, cutoff),
    ))
    .orderBy(desc(economicEvents.eventDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    source: 'economic_event' as const,
    timestamp: r.eventDate,
    headline: r.title,
    impactLevel: r.impactLevel,
    country: r.country ?? undefined,
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
    unit: r.unit ?? undefined,
    sourceRecordId: r.id,
  }));
}

async function fetchPastEarningsEvents(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  const conditions = [
    lt(earningsEvents.reportDate, todayStr),
    gte(earningsEvents.reportDate, cutoffStr),
  ];
  if (ticker) {
    conditions.push(eq(sql`UPPER(${earningsEvents.ticker})`, sql`UPPER(${ticker})`));
  }

  const rows = await db
    .select({
      id: earningsEvents.id,
      ticker: earningsEvents.ticker,
      reportDate: earningsEvents.reportDate,
      reportTime: earningsEvents.reportTime,
      epsEstimate: sql<string | null>`${earningsEvents.epsEstimate}::text`,
      epsActual: sql<string | null>`${earningsEvents.epsActual}::text`,
      revenueEstimate: sql<string | null>`${earningsEvents.revenueEstimate}::text`,
      revenueActual: sql<string | null>`${earningsEvents.revenueActual}::text`,
      quarter: earningsEvents.quarter,
      year: earningsEvents.year,
    })
    .from(earningsEvents)
    .where(and(...conditions))
    .orderBy(desc(earningsEvents.reportDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    source: 'earnings_event' as const,
    timestamp: new Date(r.reportDate + 'T00:00:00Z'),
    headline: `${r.ticker} earnings`,
    tickers: [r.ticker],
    epsActual: r.epsActual,
    epsEstimate: r.epsEstimate,
    revenueActual: r.revenueActual,
    revenueEstimate: r.revenueEstimate,
    quarter: r.quarter,
    year: r.year,
    reportTime: r.reportTime,
    sourceRecordId: r.id,
  }));
}

async function fetchClaimEvidence(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  const conditions = [gte(claimSignalEvidences.createdAt, cutoff)];
  if (ticker) {
    conditions.push(sql`${ticker} = ANY(${mainClaims.relevantTickers})`);
  }

  const rows = await db
    .select({
      id: claimSignalEvidences.id,
      createdAt: claimSignalEvidences.createdAt,
      assessment: claimSignalEvidences.assessment,
      claimTitle: mainClaims.title,
      claimText: mainClaims.claim,
      claimTickers: mainClaims.relevantTickers,
      signalId: signals.id,
      signalStatement: signals.statement,
    })
    .from(claimSignalEvidences)
    .innerJoin(mainClaims, eq(mainClaims.id, claimSignalEvidences.claimId))
    .innerJoin(signals, eq(signals.id, claimSignalEvidences.signalId))
    .where(and(...conditions))
    .orderBy(desc(claimSignalEvidences.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // Batch-resolve signal → thesis links
  const signalIds = [...new Set(rows.map((r) => r.signalId))];
  const thesisLinks = await resolveSignalThesisLinks(signalIds);

  return rows.map((r) => {
    const link = thesisLinks.get(r.signalId);
    return {
      id: r.id,
      source: 'claim_evidence' as const,
      timestamp: r.createdAt,
      headline: r.claimTitle,
      body: r.claimText,
      assessment: r.assessment as FeedItem['assessment'],
      tickers: r.claimTickers ?? undefined,
      signalId: r.signalId,
      signalStatement: r.signalStatement,
      thesisId: link?.thesisId ?? undefined,
      thesisType: link?.thesisType as FeedItem['thesisType'] ?? undefined,
      thesisTitle: link?.thesisTitle ?? undefined,
      sourceRecordId: r.id,
    };
  });
}

async function fetchQuantSnapshots(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: signalDataSnapshots.id,
      snapshotDate: signalDataSnapshots.snapshotDate,
      observedValue: sql<string | null>`${signalDataSnapshots.observedValue}::text`,
      thresholdValue: sql<string | null>`${signalDataSnapshots.thresholdValue}::text`,
      pctToThreshold: sql<string | null>`${signalDataSnapshots.pctToThreshold}::text`,
      unit: signalDataSnapshots.unit,
      assessment: signalDataSnapshots.assessment,
      evidenceSummary: signalDataSnapshots.evidenceSummary,
      signalId: signals.id,
      signalStatement: signals.statement,
    })
    .from(signalDataSnapshots)
    .innerJoin(signals, eq(signals.id, signalDataSnapshots.signalId))
    .where(and(
      gte(signalDataSnapshots.snapshotDate, cutoff),
      not(inArray(signalDataSnapshots.dataSource, ['thesis_monitor', 'research_routing'])),
      isNotNull(signalDataSnapshots.observedValue),
      eq(signalDataSnapshots.status, 'accepted'),
    ))
    .orderBy(desc(signalDataSnapshots.snapshotDate))
    .limit(limit);

  if (rows.length === 0) return [];

  // Batch-resolve signal → thesis/ticker links
  const signalIds = [...new Set(rows.map((r) => r.signalId))];
  const thesisLinks = await resolveSignalThesisLinks(signalIds);

  let items = rows.map((r) => {
    const link = thesisLinks.get(r.signalId);
    return {
      id: r.id,
      source: 'quant_snapshot' as const,
      timestamp: r.snapshotDate,
      headline: r.signalStatement,
      body: r.evidenceSummary ?? undefined,
      assessment: (r.assessment as FeedItem['assessment']) ?? undefined,
      observedValue: r.observedValue ? Number(r.observedValue) : undefined,
      thresholdValue: r.thresholdValue ? Number(r.thresholdValue) : undefined,
      pctToThreshold: r.pctToThreshold ? Number(r.pctToThreshold) : undefined,
      unit: r.unit ?? undefined,
      tickers: link?.ticker ? [link.ticker] : undefined,
      signalId: r.signalId,
      signalStatement: r.signalStatement,
      thesisId: link?.thesisId ?? undefined,
      thesisType: link?.thesisType as FeedItem['thesisType'] ?? undefined,
      thesisTitle: link?.thesisTitle ?? undefined,
      sourceRecordId: r.id,
    };
  });

  if (ticker) {
    const upper = ticker.toUpperCase();
    items = items.filter((i) => i.tickers?.some((t) => t.toUpperCase() === upper));
  }

  return items;
}

async function fetchAnalystActions(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const conditions = [gte(analystActions.actionDate, cutoffStr)];
  if (ticker) {
    conditions.push(eq(sql`UPPER(${analystActions.ticker})`, sql`UPPER(${ticker})`));
  }

  const rows = await db
    .select()
    .from(analystActions)
    .where(and(...conditions))
    .orderBy(desc(analystActions.actionDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    source: 'analyst_action' as const,
    timestamp: new Date(r.actionDate + 'T00:00:00Z'),
    headline: `${r.ticker} analyst action`,
    tickers: [r.ticker],
    analystFirm: r.analystFirm,
    analystAction: r.action,
    fromGrade: r.fromGrade,
    toGrade: r.toGrade,
    sourceRecordId: r.id,
  }));
}

async function fetchInsiderTransactions(cutoff: Date, limit: number, ticker?: string): Promise<FeedItem[]> {
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const conditions = [gte(insiderTransactions.transactionDate, cutoffStr)];
  if (ticker) {
    conditions.push(eq(sql`UPPER(${insiderTransactions.ticker})`, sql`UPPER(${ticker})`));
  }

  const rows = await db
    .select()
    .from(insiderTransactions)
    .where(and(...conditions))
    .orderBy(desc(insiderTransactions.transactionDate))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    source: 'insider_transaction' as const,
    timestamp: new Date(r.transactionDate + 'T00:00:00Z'),
    headline: `${r.ticker} insider transaction`,
    tickers: [r.ticker],
    insiderName: r.insiderName,
    transactionCode: r.transactionCode ?? undefined,
    shareChange: r.change ? Number(r.change) : null,
    transactionPrice: r.transactionPrice ? Number(r.transactionPrice) : null,
    sourceRecordId: r.id,
  }));
}

// ---------------------------------------------------------------------------
// Shared helper: batch-resolve tickers → entity chain (underlying → asset_thesis → strategy)
// ---------------------------------------------------------------------------

async function enrichWithEntityChain(items: FeedItem[]): Promise<void> {
  // Collect unique tickers from all sources that have ticker data
  const tickerSources: FeedItemSource[] = [
    'sec_filing', 'earnings_event', 'analyst_action', 'insider_transaction',
    'world_monitor', 'thesis_monitor',
    'quant_snapshot', 'claim_evidence',
  ];
  const allTickers = new Set<string>();
  for (const item of items) {
    if (tickerSources.includes(item.source) && item.tickers) {
      for (const t of item.tickers) allTickers.add(t.toUpperCase());
    }
  }
  if (allTickers.size === 0) return;

  const tickerList = [...allTickers];

  // Resolve tickers → underlyings → active asset theses + active strategies
  const tickerEntities = await db
    .select({
      ticker: underlyings.ticker,
      atId: assetTheses.id,
      atTitle: assetTheses.title,
      atDirection: assetTheses.direction,
      atStatus: assetTheses.status,
      sId: strategies.id,
      sKey: strategies.strategyKey,
      sStatus: strategies.status,
    })
    .from(underlyings)
    .leftJoin(assetTheses, eq(assetTheses.underlyingId, underlyings.id))
    .leftJoin(strategies, eq(strategies.assetThesisId, assetTheses.id))
    .where(inArray(underlyings.ticker, tickerList));

  // Build per-ticker maps
  const tickerToTheses = new Map<string, Map<string, { id: string; title: string; direction?: string }>>();
  const tickerToStrategies = new Map<string, Map<string, { id: string; strategyKey: string }>>();

  for (const row of tickerEntities) {
    const t = row.ticker.toUpperCase();
    if (row.atId && row.atStatus === 'active') {
      if (!tickerToTheses.has(t)) tickerToTheses.set(t, new Map());
      tickerToTheses.get(t)!.set(row.atId, {
        id: row.atId,
        title: row.atTitle ?? '',
        direction: row.atDirection ?? undefined,
      });
    }
    if (row.sId && row.sKey && row.sStatus === 'active') {
      if (!tickerToStrategies.has(t)) tickerToStrategies.set(t, new Map());
      tickerToStrategies.get(t)!.set(row.sId, {
        id: row.sId,
        strategyKey: row.sKey,
      });
    }
  }

  // Apply to items
  for (const item of items) {
    if (!tickerSources.includes(item.source) || !item.tickers) continue;
    const thesesMap = new Map<string, { id: string; title: string; direction?: string }>();
    const strategiesMap = new Map<string, { id: string; strategyKey: string }>();
    for (const t of item.tickers) {
      const upper = t.toUpperCase();
      const at = tickerToTheses.get(upper);
      if (at) for (const [k, v] of at) thesesMap.set(k, v);
      const st = tickerToStrategies.get(upper);
      if (st) for (const [k, v] of st) strategiesMap.set(k, v);
    }
    if (thesesMap.size > 0) item.linkedAssetTheses = [...thesesMap.values()];
    if (strategiesMap.size > 0) item.linkedStrategies = [...strategiesMap.values()];
  }
}

// ---------------------------------------------------------------------------
// Shared helper: batch-resolve signal IDs → thesis/ticker info
// ---------------------------------------------------------------------------

interface SignalThesisLink {
  thesisId: string | null;
  thesisType: string | null;
  thesisTitle: string | null;
  ticker: string | null;
}

async function resolveSignalThesisLinks(signalIds: string[]): Promise<Map<string, SignalThesisLink>> {
  if (signalIds.length === 0) return new Map();

  // Get all entity links for these signals, preferring thesis links over strategy links
  const links = await db
    .select({
      signalId: signalEntityLinks.signalId,
      entityType: signalEntityLinks.entityType,
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
      strategyId: signalEntityLinks.strategyId,
    })
    .from(signalEntityLinks)
    .where(inArray(signalEntityLinks.signalId, signalIds));

  // Group by signal_id, preferring thesis links
  const bestLink = new Map<string, typeof links[number]>();
  for (const link of links) {
    const existing = bestLink.get(link.signalId);
    if (!existing || (link.entityType === 'thesis' && existing.entityType !== 'thesis')) {
      bestLink.set(link.signalId, link);
    }
  }

  // Collect thesis IDs and strategy IDs to resolve titles/tickers
  const macroIds: string[] = [];
  const assetIds: string[] = [];
  const strategyIds: string[] = [];

  for (const link of bestLink.values()) {
    if (link.entityType === 'thesis' && link.thesisId) {
      if (link.thesisType === 'macro') macroIds.push(link.thesisId);
      else if (link.thesisType === 'asset') assetIds.push(link.thesisId);
    } else if (link.entityType === 'strategy' && link.strategyId) {
      strategyIds.push(link.strategyId);
    }
  }

  // Resolve titles and tickers in parallel
  const [macroMap, assetMap, strategyTickerMap] = await Promise.all([
    macroIds.length > 0
      ? db.select({ id: macroTheses.id, title: macroTheses.title })
          .from(macroTheses)
          .where(inArray(macroTheses.id, macroIds))
          .then((rows) => new Map(rows.map((r) => [r.id, r.title])))
      : Promise.resolve(new Map<string, string>()),

    assetIds.length > 0
      ? db.select({ id: assetTheses.id, title: assetTheses.title, underlyingId: assetTheses.underlyingId })
          .from(assetTheses)
          .where(inArray(assetTheses.id, assetIds))
          .then(async (rows) => {
            const uIds = rows.map((r) => r.underlyingId).filter(Boolean) as string[];
            const tickers = uIds.length > 0
              ? await db.select({ id: underlyings.id, ticker: underlyings.ticker })
                  .from(underlyings)
                  .where(inArray(underlyings.id, uIds))
                  .then((uRows) => new Map(uRows.map((u) => [u.id, u.ticker])))
              : new Map<string, string>();
            return new Map(rows.map((r) => [r.id, {
              title: r.title,
              ticker: r.underlyingId ? tickers.get(r.underlyingId) ?? null : null,
            }]));
          })
      : Promise.resolve(new Map<string, { title: string; ticker: string | null }>()),

    strategyIds.length > 0
      ? db.select({
            id: strategies.id,
            assetThesisId: strategies.assetThesisId,
          })
          .from(strategies)
          .where(inArray(strategies.id, strategyIds))
          .then(async (rows) => {
            const atIds = rows.map((r) => r.assetThesisId).filter(Boolean) as string[];
            if (atIds.length === 0) return new Map<string, string | null>();
            const ats = await db.select({ id: assetTheses.id, underlyingId: assetTheses.underlyingId })
              .from(assetTheses)
              .where(inArray(assetTheses.id, atIds));
            const uIds = ats.map((a) => a.underlyingId).filter(Boolean) as string[];
            const tickers = uIds.length > 0
              ? await db.select({ id: underlyings.id, ticker: underlyings.ticker })
                  .from(underlyings)
                  .where(inArray(underlyings.id, uIds))
                  .then((uRows) => new Map(uRows.map((u) => [u.id, u.ticker])))
              : new Map<string, string>();
            const atTickerMap = new Map(ats.map((a) => [a.id, a.underlyingId ? tickers.get(a.underlyingId) ?? null : null]));
            return new Map(rows.map((r) => [r.id, r.assetThesisId ? atTickerMap.get(r.assetThesisId) ?? null : null]));
          })
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  // Build final map
  const result = new Map<string, SignalThesisLink>();
  for (const [signalId, link] of bestLink) {
    if (link.entityType === 'thesis' && link.thesisId) {
      if (link.thesisType === 'macro') {
        result.set(signalId, {
          thesisId: link.thesisId,
          thesisType: 'macro',
          thesisTitle: macroMap.get(link.thesisId) ?? null,
          ticker: null,
        });
      } else if (link.thesisType === 'asset') {
        const info = assetMap.get(link.thesisId);
        result.set(signalId, {
          thesisId: link.thesisId,
          thesisType: 'asset',
          thesisTitle: info?.title ?? null,
          ticker: info?.ticker ?? null,
        });
      }
    } else if (link.entityType === 'strategy' && link.strategyId) {
      result.set(signalId, {
        thesisId: null,
        thesisType: null,
        thesisTitle: null,
        ticker: strategyTickerMap.get(link.strategyId) ?? null,
      });
    }
  }

  return result;
}
