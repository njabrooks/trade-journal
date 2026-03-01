import { db } from "@/db";
import { sql } from "drizzle-orm";
import { eq, ne } from "drizzle-orm";
import { toNumber } from "@/lib/numbers";
import { desc } from "drizzle-orm";
import {
  reconciliationResolutions,
  reconciliationCheckpoints,
  type ReconciliationResolution,
  type ReconciliationCheckpoint,
  type ResolutionStatus,
  type DiscrepancyNature,
} from "@/db/schema";

// Single-user system (from TTC migration)
const USER_ID = "user_2mYzScugP7zfcqv8Ox21i7q9nyW";

// --- Types ---

export interface NavComparisonPoint {
  date: string;
  snapshotNav: number | null;
  eventSourcedNav: number | null;
  delta: number | null;
  deltaPct: number | null;
}

export interface AccountNavComparison {
  snapshotAccount: string | null;
  snapshotAccountId: string | null;
  snapshotNav: number | null;
  eventSourcedAccount: string | null;
  eventSourcedNav: number | null;
  matchStatus: "matched" | "snapshot_only" | "event_sourced_only";
}

export interface OwnerNavComparison {
  owner: string;
  snapshotNavTotal: number | null;
  eventSourcedNavTotal: number | null;
  delta: number | null;
  deltaPct: number | null;
  accounts: AccountNavComparison[];
}

export interface PositionResolutionInfo {
  id: string;
  status: ResolutionStatus;
  nature: DiscrepancyNature | null;
  notes: string | null;
  qtyDeltaAtAction: number | null;
  mvDeltaAtAction: number | null;
  updatedAt: string;
}

export interface PositionReconciliation {
  ticker: string;
  assetClass: string | null;
  owner: string;
  account: string;
  matchMethod: "conid" | "ticker" | "alias" | null;
  snapshotQty: number | null;
  eventSourcedQty: number | null;
  qtyDelta: number | null;
  snapshotMv: number | null;
  eventSourcedMv: number | null;
  mvDelta: number | null;
  status:
    | "match"
    | "qty_mismatch"
    | "mv_mismatch"
    | "snapshot_only"
    | "event_sourced_only";
  resolution: PositionResolutionInfo | null;
}

export interface EventSourceFreshness {
  source: string;
  lastEventDate: string;
  eventCount: number;
}

export interface ReconciliationSummaryData {
  comparisonDate: string;
  snapshotDate: string;
  eventSourcedDate: string;
  eventSourceFreshness: EventSourceFreshness[];
  snapshotNav: number;
  eventSourcedNav: number;
  navDelta: number;
  navDeltaPct: number;
  totalPositions: number;
  matchedPositions: number;
  mismatchedPositions: number;
  snapshotOnlyPositions: number;
  eventSourcedOnlyPositions: number;
  // Resolution disposition counts (for discrepancies only)
  unresolvedCount: number;
  acceptedCount: number;
  flaggedCount: number;
  resolvedCount: number;
}

export interface BottleneckInfo {
  source: string;
  lastEventDate: string;
  daysBehind: number;
  leadingSource: string;
  leadingDate: string;
}

export interface CheckpointSummary {
  id: string;
  comparisonDate: string;
  snapshotNav: number;
  eventSourcedNav: number;
  navDelta: number;
  navDeltaPct: number;
  totalPositions: number;
  matchedPositions: number;
  discrepancyCount: number;
  acceptedCount: number;
  flaggedCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  notes: string | null;
  createdAt: string;
}

export interface ReconciliationData {
  summary: ReconciliationSummaryData;
  ownerBreakdown: OwnerNavComparison[];
  positions: PositionReconciliation[];
  lastCheckpoint: CheckpointSummary | null;
  bottleneck: BottleneckInfo | null;
}

// --- Query Functions ---

/**
 * Determines the last date on which ALL position-affecting event sources have
 * complete data.
 *
 * After this date, the calculation engine carries forward quantities with updated
 * prices, but the positions don't reflect actual transactions. Reconciliation should
 * compare at this date for meaningful results.
 *
 * Takes MIN(MAX(timestamp) per position-affecting source). Sources like ibkr_sof
 * (dividends, fees, interest) and manual are excluded — they affect cash balances
 * but not security position quantities.
 */
export async function getLastCompleteEventDate(): Promise<{
  comparisonDate: string;
  sources: EventSourceFreshness[];
}> {
  const rows = (await db.execute(sql`
    SELECT source, MAX(timestamp::date)::text AS last_date, COUNT(*)::int AS event_count
    FROM events
    WHERE user_id = ${USER_ID} AND deleted_at IS NULL
    GROUP BY source
    ORDER BY last_date
  `)) as any[];

  const sources: EventSourceFreshness[] = rows.map((r: any) => ({
    source: r.source,
    lastEventDate: r.last_date,
    eventCount: r.event_count,
  }));

  // Position-affecting sources: ibkr_trade (buy/sell securities) and koinly_raw
  // (crypto transactions). Excluded: ibkr_sof (cash events like dividends/fees),
  // manual (one-off historical entries).
  const NON_POSITION_SOURCES = ["ibkr_sof", "manual"];
  const positionSources = sources.filter(
    (s) => !NON_POSITION_SOURCES.includes(s.source)
  );

  // Use MIN across position-affecting sources — reconciliation needs ALL accounts
  // to have actual transaction data. After the slowest source's last date, positions
  // for those accounts are carried forward (stale), making comparison meaningless.
  const comparisonDate =
    positionSources.length > 0
      ? positionSources.reduce(
          (min, s) => (s.lastEventDate < min ? s.lastEventDate : min),
          positionSources[0].lastEventDate
        )
      : new Date().toISOString().slice(0, 10);

  return { comparisonDate, sources };
}

/**
 * NAV time series comparison: snapshot vs event-sourced over time.
 *
 * Snapshot accounts have different update frequencies (IBKR: weekdays, crypto: daily).
 * We forward-fill per account so each date shows the total across ALL accounts using
 * each account's most recent known NAV.
 */
export async function getNavComparison(
  daysBack: number
): Promise<NavComparisonPoint[]> {
  const cutoffDate =
    daysBack >= 99999
      ? "1900-01-01"
      : new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);

  // 1. Get all account-level snapshots within range
  const accountSnapshots = (await db.execute(sql`
    SELECT ps.snapshot_date AS date, ps.account_id, ps.nav_at_snapshot_usd::numeric AS nav
    FROM portfolio_snapshots ps
    WHERE ps.level = 'account'
      AND ps.snapshot_date >= ${cutoffDate}
    ORDER BY ps.snapshot_date
  `)) as any[];

  // 2. Get event-sourced grand total NAV
  const eventRows = (await db.execute(sql`
    SELECT dpv.date, dpv.total_market_value::numeric AS nav
    FROM daily_portfolio_values dpv
    WHERE dpv.user_id = ${USER_ID}
      AND dpv.owner IS NULL
      AND dpv.account IS NULL
      AND dpv.date >= ${cutoffDate}
    ORDER BY dpv.date
  `)) as any[];

  // 3. Collect all dates and build per-account snapshots by date
  const allDates = new Set<string>();
  const accountNavByDate = new Map<string, Map<string, number>>(); // date -> (accountId -> nav)

  for (const row of accountSnapshots) {
    allDates.add(row.date);
    if (!accountNavByDate.has(row.date)) accountNavByDate.set(row.date, new Map());
    accountNavByDate.get(row.date)!.set(row.account_id, toNumber(row.nav) ?? 0);
  }

  const eventNavByDate = new Map<string, number>();
  for (const row of eventRows) {
    allDates.add(row.date);
    eventNavByDate.set(row.date, toNumber(row.nav) ?? 0);
  }

  // 4. Forward-fill per account: for each date, carry forward each account's last known NAV
  const sortedDates = [...allDates].sort();
  const lastKnownNav = new Map<string, number>(); // accountId -> latest known nav

  return sortedDates.map((date) => {
    // Update last known values for accounts that have data on this date
    const dayData = accountNavByDate.get(date);
    if (dayData) {
      for (const [accountId, nav] of dayData) {
        lastKnownNav.set(accountId, nav);
      }
    }

    // Sum all accounts with their latest known value
    let snapshotTotal = 0;
    for (const nav of lastKnownNav.values()) snapshotTotal += nav;

    const sNav = lastKnownNav.size > 0 ? snapshotTotal : null;
    const eNav = eventNavByDate.get(date) ?? null;
    const delta = sNav != null && eNav != null ? sNav - eNav : null;
    const deltaPct =
      delta != null && eNav != null && eNav !== 0
        ? (delta / Math.abs(eNav)) * 100
        : null;

    return { date, snapshotNav: sNav, eventSourcedNav: eNav, delta, deltaPct };
  });
}

/**
 * Per-owner and per-account NAV comparison at a specific comparison date.
 * Both sides are anchored to the same date for meaningful comparison.
 */
export async function getOwnerAccountNavComparison(
  comparisonDate: string
): Promise<OwnerNavComparison[]> {
  // 1. Snapshot side: per-account NAV at latest snapshot on or before comparison date
  const snapshotRows = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM portfolio_snapshots
      WHERE level = 'account'
        AND snapshot_date <= ${comparisonDate}
      GROUP BY account_id
    )
    SELECT
      a.owner,
      CASE WHEN a.broker_name = 'IBKR' THEN 'IBKR' ELSE 'Koinly' END AS account_name,
      a.broker_account_id AS account_id,
      ps.nav_at_snapshot_usd::numeric AS nav,
      ps.snapshot_date
    FROM portfolio_snapshots ps
    JOIN accounts a ON a.id = ps.account_id
    JOIN latest_per_account lpa ON lpa.account_id = ps.account_id AND lpa.latest_date = ps.snapshot_date
    WHERE ps.level = 'account'
    ORDER BY a.owner, account_name
  `)) as any[];

  // 2. Event-sourced side: per-account NAV at comparison date
  const eventSourcedRows = (await db.execute(sql`
    SELECT
      dpv.owner,
      dpv.account AS account_name,
      dpv.total_market_value::numeric AS nav,
      dpv.date
    FROM daily_portfolio_values dpv
    WHERE dpv.user_id = ${USER_ID}
      AND dpv.owner IS NOT NULL
      AND dpv.account IS NOT NULL
      AND dpv.date = ${comparisonDate}
    ORDER BY dpv.owner, dpv.account
  `)) as any[];

  // 3. Build per-owner structures
  // Group snapshot accounts by owner
  const snapshotByOwner = new Map<
    string,
    { accountName: string; accountId: string; nav: number }[]
  >();
  for (const row of snapshotRows) {
    const owner = row.owner ?? "Unknown";
    if (!snapshotByOwner.has(owner)) snapshotByOwner.set(owner, []);
    snapshotByOwner.get(owner)!.push({
      accountName: row.account_name,
      accountId: row.account_id,
      nav: toNumber(row.nav) ?? 0,
    });
  }

  // Group event-sourced accounts by owner
  const eventByOwner = new Map<
    string,
    { accountName: string; nav: number }[]
  >();
  for (const row of eventSourcedRows) {
    const owner = row.owner;
    if (!eventByOwner.has(owner)) eventByOwner.set(owner, []);
    eventByOwner.get(owner)!.push({
      accountName: row.account_name,
      nav: toNumber(row.nav) ?? 0,
    });
  }

  // 4. Merge owners from both sides
  const allOwners = new Set([
    ...snapshotByOwner.keys(),
    ...eventByOwner.keys(),
  ]);
  const result: OwnerNavComparison[] = [];

  for (const owner of [...allOwners].sort()) {
    const snapshotAccounts = snapshotByOwner.get(owner) ?? [];
    const eventAccounts = eventByOwner.get(owner) ?? [];

    const snapshotTotal =
      snapshotAccounts.length > 0
        ? snapshotAccounts.reduce((sum, a) => sum + a.nav, 0)
        : null;
    const eventTotal =
      eventAccounts.length > 0
        ? eventAccounts.reduce((sum, a) => sum + a.nav, 0)
        : null;

    const delta =
      snapshotTotal != null || eventTotal != null
        ? (snapshotTotal ?? 0) - (eventTotal ?? 0)
        : null;
    const deltaPct =
      delta != null && (snapshotTotal ?? 0) !== 0
        ? (delta / Math.abs(snapshotTotal ?? eventTotal ?? 1)) * 100
        : null;

    // Build account-level detail
    const accounts: AccountNavComparison[] = [];

    // Categorize snapshot accounts: IBKR vs crypto exchanges
    const snapshotIbkr = snapshotAccounts.filter(
      (a) => a.accountName === "IBKR"
    );
    const snapshotCrypto = snapshotAccounts.filter(
      (a) => a.accountName !== "IBKR"
    );

    // Event-sourced accounts
    const eventIbkr = eventAccounts.filter((a) => a.accountName === "IBKR");
    const eventKoinly = eventAccounts.filter(
      (a) => a.accountName === "Koinly"
    );

    // Match IBKR accounts
    if (snapshotIbkr.length > 0 || eventIbkr.length > 0) {
      const sNav =
        snapshotIbkr.length > 0
          ? snapshotIbkr.reduce((sum, a) => sum + a.nav, 0)
          : null;
      const eNav =
        eventIbkr.length > 0
          ? eventIbkr.reduce((sum, a) => sum + a.nav, 0)
          : null;

      // Show individual IBKR snapshot accounts if multiple
      if (snapshotIbkr.length > 1) {
        for (const sa of snapshotIbkr) {
          accounts.push({
            snapshotAccount: `IBKR (${sa.accountId})`,
            snapshotAccountId: sa.accountId,
            snapshotNav: sa.nav,
            eventSourcedAccount: null,
            eventSourcedNav: null,
            matchStatus:
              eventIbkr.length > 0 ? "matched" : "snapshot_only",
          });
        }
        // Show event-sourced IBKR total as aggregate match
        if (eventIbkr.length > 0) {
          accounts.push({
            snapshotAccount: null,
            snapshotAccountId: null,
            snapshotNav: sNav,
            eventSourcedAccount: "IBKR",
            eventSourcedNav: eNav,
            matchStatus: "matched",
          });
        }
      } else {
        accounts.push({
          snapshotAccount:
            snapshotIbkr.length > 0
              ? `IBKR (${snapshotIbkr[0].accountId})`
              : null,
          snapshotAccountId:
            snapshotIbkr.length > 0 ? snapshotIbkr[0].accountId : null,
          snapshotNav: sNav,
          eventSourcedAccount: eventIbkr.length > 0 ? "IBKR" : null,
          eventSourcedNav: eNav,
          matchStatus:
            snapshotIbkr.length > 0 && eventIbkr.length > 0
              ? "matched"
              : snapshotIbkr.length > 0
                ? "snapshot_only"
                : "event_sourced_only",
        });
      }
    }

    // Match Koinly/crypto accounts (snapshot crypto exchanges vs event-sourced Koinly)
    const snapshotKoinlyTotal =
      snapshotCrypto.length > 0
        ? snapshotCrypto.reduce((sum, a) => sum + a.nav, 0)
        : null;
    const eventKoinlyTotal =
      eventKoinly.length > 0
        ? eventKoinly.reduce((sum, a) => sum + a.nav, 0)
        : null;

    if (snapshotCrypto.length > 0 || eventKoinly.length > 0) {
      accounts.push({
        snapshotAccount: snapshotCrypto.length > 0 ? "Koinly" : null,
        snapshotAccountId: null,
        snapshotNav: snapshotKoinlyTotal,
        eventSourcedAccount: eventKoinly.length > 0 ? "Koinly" : null,
        eventSourcedNav: eventKoinlyTotal,
        matchStatus:
          snapshotCrypto.length > 0 && eventKoinly.length > 0
            ? "matched"
            : snapshotCrypto.length > 0
              ? "snapshot_only"
              : "event_sourced_only",
      });
    }

    result.push({
      owner,
      snapshotNavTotal: snapshotTotal,
      eventSourcedNavTotal: eventTotal,
      delta,
      deltaPct,
      accounts,
    });
  }

  return result;
}

/**
 * Position-level reconciliation: match snapshot positions to event-sourced balances.
 * Both sides are anchored to the comparison date for meaningful comparison.
 */
export async function getPositionReconciliation(
  comparisonDate: string
): Promise<PositionReconciliation[]> {
  // 1. Snapshot positions at latest snapshot on or before comparison date per account
  const snapshotPositions = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM positions
      WHERE is_open = true
        AND snapshot_date <= ${comparisonDate}
      GROUP BY account_id
    )
    SELECT
      p.symbol,
      p.conid,
      p.quantity::numeric AS qty,
      p.market_value_usd::numeric AS mv,
      p.asset_class,
      p.snapshot_date,
      a.owner,
      CASE WHEN a.broker_name = 'IBKR' THEN 'IBKR' ELSE 'Koinly' END AS broker_name
    FROM positions p
    JOIN accounts a ON a.id = p.account_id
    JOIN latest_per_account lpa ON lpa.account_id = p.account_id AND lpa.latest_date = p.snapshot_date
    WHERE p.is_open = true
      AND ABS(p.quantity::numeric) > 0.0001
      AND COALESCE(p.asset_class, '') != 'PERP'
  `)) as any[];

  // 1b. Snapshot cash balances (per-currency from all exchange sources)
  const snapshotCash = (await db.execute(sql`
    WITH latest_cash_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM cash_balances
      WHERE snapshot_date <= ${comparisonDate}
      GROUP BY account_id
    )
    SELECT
      cb.currency AS symbol,
      cb.balance::numeric AS qty,
      cb.balance_usd::numeric AS mv,
      'CASH' AS asset_class,
      cb.snapshot_date,
      a.owner,
      CASE WHEN a.broker_name = 'IBKR' THEN 'IBKR' ELSE 'Koinly' END AS broker_name
    FROM cash_balances cb
    JOIN accounts a ON a.id = cb.account_id
    JOIN latest_cash_per_account lca ON lca.account_id = cb.account_id AND lca.latest_date = cb.snapshot_date
    WHERE ABS(cb.balance::numeric) > 0.0001
  `)) as any[];

  // 2. Event-sourced positions at comparison date
  // Exclude pricing_tier='zero' (crypto dust) but keep fiat currencies (pricing_tier='market')
  const eventPositions = (await db.execute(sql`
    SELECT
      pdb.asset AS asset_id,
      pdb.quantity::numeric AS qty,
      pdb.market_value::numeric AS mv,
      pdb.owner,
      pdb.account_type,
      pdb.asset_class,
      ast.ticker,
      ast.ibkr_conid,
      ast.name AS asset_name,
      ast.pricing_tier
    FROM portfolio_daily_balances pdb
    JOIN assets ast ON pdb.asset = ast.id::text
    WHERE pdb.user_id = ${USER_ID}
      AND pdb.date = ${comparisonDate}
      AND ABS(pdb.quantity::numeric) > 0.0001
      AND COALESCE(ast.pricing_tier, 'market') != 'zero'
  `)) as any[];

  // 3. Aggregate both sides by (owner, ticker) before matching.
  // Snapshot positions may have the same ticker across multiple accounts (e.g., HYPE on
  // HyperLiquid + CoinbasePrime + Solana). Event-sourced aggregates all exchange data per
  // owner anyway, so we aggregate snapshot to match.
  interface AggPos {
    ticker: string;
    conids: number[];
    qty: number;
    mv: number | null;
    owner: string;
    accounts: string[];
    assetClass: string | null;
    matched: boolean;
  }

  // Aggregate snapshot by (owner, symbol)
  const snapshotAgg = new Map<string, AggPos>();
  for (const sp of snapshotPositions) {
    const owner = sp.owner ?? "Unknown";
    const symbol: string = sp.symbol;
    const key = `${owner}::${symbol}`;
    const existing = snapshotAgg.get(key);
    const qty = toNumber(sp.qty) ?? 0;
    const mv = toNumber(sp.mv);
    const conid = sp.conid ? Number(sp.conid) : null;

    if (existing) {
      existing.qty += qty;
      existing.mv = (existing.mv ?? 0) + (mv ?? 0);
      if (conid && !existing.conids.includes(conid)) existing.conids.push(conid);
      const broker: string = sp.broker_name;
      if (!existing.accounts.includes(broker)) existing.accounts.push(broker);
    } else {
      snapshotAgg.set(key, {
        ticker: symbol,
        conids: conid ? [conid] : [],
        qty,
        mv,
        owner,
        accounts: [sp.broker_name],
        assetClass: sp.asset_class,
        matched: false,
      });
    }
  }

  // Merge per-currency cash balances into snapshot aggregation
  for (const sc of snapshotCash) {
    const owner = sc.owner ?? "Unknown";
    const symbol: string = sc.symbol;
    const key = `${owner}::${symbol}`;
    const existing = snapshotAgg.get(key);
    const qty = toNumber(sc.qty) ?? 0;
    const mv = toNumber(sc.mv);

    if (existing) {
      existing.qty += qty;
      existing.mv = (existing.mv ?? 0) + (mv ?? 0);
      const broker: string = sc.broker_name;
      if (!existing.accounts.includes(broker)) existing.accounts.push(broker);
    } else {
      snapshotAgg.set(key, {
        ticker: symbol,
        conids: [],
        qty,
        mv,
        owner,
        accounts: [sc.broker_name],
        assetClass: sc.asset_class,
        matched: false,
      });
    }
  }

  // Aggregate event-sourced by (owner, ticker)
  const eventAgg = new Map<string, AggPos>();
  for (const row of eventPositions) {
    const key = `${row.owner}::${row.ticker}`;
    const existing = eventAgg.get(key);
    const qty = toNumber(row.qty) ?? 0;
    const mv = toNumber(row.mv);
    const conid = row.ibkr_conid ? Number(row.ibkr_conid) : null;

    if (existing) {
      existing.qty += qty;
      existing.mv = (existing.mv ?? 0) + (mv ?? 0);
      if (conid && !existing.conids.includes(conid)) existing.conids.push(conid);
      if (!existing.accounts.includes(row.account_type))
        existing.accounts.push(row.account_type);
    } else {
      eventAgg.set(key, {
        ticker: row.ticker,
        conids: conid ? [conid] : [],
        qty,
        mv,
        owner: row.owner,
        accounts: [row.account_type],
        assetClass: row.asset_class,
        matched: false,
      });
    }
  }

  // Build conid lookup for event-sourced positions
  const eventByConid = new Map<string, string>(); // "owner::conid" → "owner::ticker"
  for (const [key, ep] of eventAgg) {
    for (const conid of ep.conids) {
      eventByConid.set(`${ep.owner}::${conid}`, key);
    }
  }

  // 4. Match aggregated positions
  const results: PositionReconciliation[] = [];

  for (const [snapKey, sp] of snapshotAgg) {
    const { owner, ticker: symbol } = sp;

    // Try 3-tier asset matching
    let matchedKey: string | null = null;
    let matchMethod: "conid" | "ticker" | "alias" | null = null;

    // Tier 1: conid match
    for (const conid of sp.conids) {
      const conidLookup = `${owner}::${conid}`;
      const eventKey = eventByConid.get(conidLookup);
      if (eventKey) {
        matchedKey = eventKey;
        matchMethod = "conid";
        break;
      }
    }

    // Tier 2: ticker match
    if (!matchedKey) {
      const tickerKey = `${owner}::${symbol}`;
      if (eventAgg.has(tickerKey)) {
        matchedKey = tickerKey;
        matchMethod = "ticker";
      }
    }

    if (matchedKey) {
      const ep = eventAgg.get(matchedKey)!;
      ep.matched = true;
      sp.matched = true;

      const qtyDelta = sp.qty - ep.qty;
      const mvDelta =
        sp.mv != null && ep.mv != null ? sp.mv - ep.mv : null;

      // Classify
      let status: PositionReconciliation["status"];
      const qtyMatch = Math.abs(qtyDelta) < 0.0001;
      const mvMatch =
        mvDelta != null
          ? Math.abs(mvDelta) /
              Math.max(Math.abs(sp.mv ?? 0), Math.abs(ep.mv ?? 0), 1) <
            0.01
          : true;

      if (qtyMatch && mvMatch) {
        status = "match";
      } else if (!qtyMatch) {
        status = "qty_mismatch";
      } else {
        status = "mv_mismatch";
      }

      results.push({
        ticker: symbol,
        assetClass: sp.assetClass ?? ep.assetClass,
        owner,
        account: sp.accounts.join(", "),
        matchMethod,
        snapshotQty: sp.qty,
        eventSourcedQty: ep.qty,
        qtyDelta,
        snapshotMv: sp.mv,
        eventSourcedMv: ep.mv,
        mvDelta,
        status,
        resolution: null,
      });
    } else {
      results.push({
        ticker: symbol,
        assetClass: sp.assetClass,
        owner,
        account: sp.accounts.join(", "),
        matchMethod: null,
        snapshotQty: sp.qty,
        eventSourcedQty: null,
        qtyDelta: null,
        snapshotMv: sp.mv,
        eventSourcedMv: null,
        mvDelta: null,
        status: "snapshot_only",
        resolution: null,
      });
    }
  }

  // 5. Event-sourced-only positions (not matched by any snapshot position)
  for (const [, ep] of eventAgg) {
    if (!ep.matched) {
      results.push({
        ticker: ep.ticker,
        assetClass: ep.assetClass,
        owner: ep.owner,
        account: ep.accounts.join(", "),
        matchMethod: null,
        snapshotQty: null,
        eventSourcedQty: ep.qty,
        qtyDelta: null,
        snapshotMv: null,
        eventSourcedMv: ep.mv,
        mvDelta: null,
        status: "event_sourced_only",
        resolution: null,
      });
    }
  }

  // Sort: discrepancies first, then by absolute MV delta descending
  results.sort((a, b) => {
    const statusOrder = {
      qty_mismatch: 0,
      mv_mismatch: 1,
      snapshot_only: 2,
      event_sourced_only: 3,
      match: 4,
    };
    const sa = statusOrder[a.status];
    const sb = statusOrder[b.status];
    if (sa !== sb) return sa - sb;
    const aMv = Math.abs(a.mvDelta ?? a.snapshotMv ?? a.eventSourcedMv ?? 0);
    const bMv = Math.abs(b.mvDelta ?? b.snapshotMv ?? b.eventSourcedMv ?? 0);
    return bMv - aMv;
  });

  return results;
}

// --- Resolution Functions ---

/**
 * Fetch all non-default resolutions keyed by "owner::ticker" for O(1) enrichment.
 * Only fetches records where user has taken an action (not 'unresolved' default).
 */
export async function getResolutionsMap(): Promise<Map<string, ReconciliationResolution>> {
  const rows = await db
    .select()
    .from(reconciliationResolutions)
    .where(ne(reconciliationResolutions.status, "unresolved"));

  const map = new Map<string, ReconciliationResolution>();
  for (const row of rows) {
    map.set(`${row.owner}::${row.ticker}`, row);
  }
  return map;
}

/**
 * Upsert a resolution record. Creates on first action, updates on subsequent.
 */
export async function upsertResolution(params: {
  owner: string;
  ticker: string;
  status: ResolutionStatus;
  nature?: DiscrepancyNature | null;
  notes?: string | null;
  discrepancyType?: string | null;
  qtyDeltaAtAction?: number | null;
  mvDeltaAtAction?: number | null;
}): Promise<ReconciliationResolution> {
  const now = new Date();
  const resolvedAt = params.status === "resolved" ? now : null;

  const result = await db
    .insert(reconciliationResolutions)
    .values({
      owner: params.owner,
      ticker: params.ticker,
      status: params.status,
      nature: params.nature ?? null,
      notes: params.notes ?? null,
      discrepancyType: params.discrepancyType ?? null,
      qtyDeltaAtAction: params.qtyDeltaAtAction?.toString() ?? null,
      mvDeltaAtAction: params.mvDeltaAtAction?.toString() ?? null,
      resolvedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [reconciliationResolutions.owner, reconciliationResolutions.ticker],
      set: {
        status: params.status,
        nature: params.nature ?? null,
        notes: params.notes ?? null,
        discrepancyType: params.discrepancyType ?? null,
        qtyDeltaAtAction: params.qtyDeltaAtAction?.toString() ?? null,
        mvDeltaAtAction: params.mvDeltaAtAction?.toString() ?? null,
        resolvedAt,
        updatedAt: now,
      },
    })
    .returning();

  return result[0];
}

/**
 * Get a single resolution by owner + ticker.
 */
export async function getResolution(
  owner: string,
  ticker: string
): Promise<ReconciliationResolution | null> {
  const rows = await db
    .select()
    .from(reconciliationResolutions)
    .where(
      sql`${reconciliationResolutions.owner} = ${owner}
        AND ${reconciliationResolutions.ticker} = ${ticker}`
    )
    .limit(1);

  return rows[0] ?? null;
}

// --- Checkpoint Functions ---

const SOURCE_LABELS: Record<string, string> = {
  ibkr_trade: "IBKR Trades",
  koinly_raw: "Koinly",
  ibkr_sof: "IBKR Cash",
  manual: "Manual",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function toCheckpointSummary(r: ReconciliationCheckpoint): CheckpointSummary {
  return {
    id: r.id,
    comparisonDate: r.comparisonDate,
    snapshotNav: Number(r.snapshotNav),
    eventSourcedNav: Number(r.eventSourcedNav),
    navDelta: Number(r.navDelta),
    navDeltaPct: Number(r.navDeltaPct),
    totalPositions: r.totalPositions,
    matchedPositions: r.matchedPositions,
    discrepancyCount: r.discrepancyCount,
    acceptedCount: r.acceptedCount,
    flaggedCount: r.flaggedCount,
    resolvedCount: r.resolvedCount,
    unresolvedCount: r.unresolvedCount,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function createCheckpoint(params: {
  reconciliationData: ReconciliationData;
  notes?: string;
}): Promise<ReconciliationCheckpoint> {
  const { summary, positions } = params.reconciliationData;

  const result = await db
    .insert(reconciliationCheckpoints)
    .values({
      comparisonDate: summary.comparisonDate,
      snapshotNav: summary.snapshotNav.toString(),
      eventSourcedNav: summary.eventSourcedNav.toString(),
      navDelta: summary.navDelta.toString(),
      navDeltaPct: summary.navDeltaPct.toString(),
      totalPositions: summary.totalPositions,
      matchedPositions: summary.matchedPositions,
      discrepancyCount:
        summary.mismatchedPositions +
        summary.snapshotOnlyPositions +
        summary.eventSourcedOnlyPositions,
      acceptedCount: summary.acceptedCount,
      flaggedCount: summary.flaggedCount,
      resolvedCount: summary.resolvedCount,
      unresolvedCount: summary.unresolvedCount,
      eventSourceFreshness: summary.eventSourceFreshness,
      positionSnapshot: positions,
      notes: params.notes ?? null,
    })
    .returning();

  return result[0];
}

export async function getLatestCheckpoint(): Promise<CheckpointSummary | null> {
  const rows = await db
    .select()
    .from(reconciliationCheckpoints)
    .orderBy(desc(reconciliationCheckpoints.createdAt))
    .limit(1);

  return rows[0] ? toCheckpointSummary(rows[0]) : null;
}

export async function getCheckpoints(): Promise<CheckpointSummary[]> {
  const rows = await db
    .select()
    .from(reconciliationCheckpoints)
    .orderBy(desc(reconciliationCheckpoints.createdAt));

  return rows.map(toCheckpointSummary);
}

function computeBottleneck(
  sources: EventSourceFreshness[]
): BottleneckInfo | null {
  const NON_POSITION_SOURCES = ["ibkr_sof", "manual"];
  const positionSources = sources.filter(
    (s) => !NON_POSITION_SOURCES.includes(s.source)
  );
  if (positionSources.length < 2) return null;

  let minSource = positionSources[0];
  let maxSource = positionSources[0];
  for (const s of positionSources) {
    if (s.lastEventDate < minSource.lastEventDate) minSource = s;
    if (s.lastEventDate > maxSource.lastEventDate) maxSource = s;
  }

  if (minSource.lastEventDate === maxSource.lastEventDate) return null;

  const minDate = new Date(minSource.lastEventDate);
  const maxDate = new Date(maxSource.lastEventDate);
  const daysBehind = Math.round(
    (maxDate.getTime() - minDate.getTime()) / 86400000
  );

  return {
    source: minSource.source,
    lastEventDate: minSource.lastEventDate,
    daysBehind,
    leadingSource: maxSource.source,
    leadingDate: maxSource.lastEventDate,
  };
}

export { sourceLabel };

/**
 * Full reconciliation: summary + owner breakdown + position details.
 *
 * All comparisons are anchored to the "last complete event date" — the latest date
 * where ALL event sources (IBKR, Koinly) have actual transaction data. After that date,
 * the calculation engine just carries forward quantities with updated prices, so comparing
 * against fresh snapshot data would produce meaningless deltas.
 */
export async function getReconciliation(): Promise<ReconciliationData> {
  // 1. Determine comparison anchor date
  const { comparisonDate, sources: eventSourceFreshness } =
    await getLastCompleteEventDate();

  // 2. Run comparisons anchored to that date
  const [ownerBreakdown, positions, resolutionsMap, lastCheckpoint] =
    await Promise.all([
      getOwnerAccountNavComparison(comparisonDate),
      getPositionReconciliation(comparisonDate),
      getResolutionsMap(),
      getLatestCheckpoint(),
    ]);

  // 3. Compute bottleneck from source freshness
  const bottleneck = computeBottleneck(eventSourceFreshness);

  // 3. Enrich positions with resolution data
  for (const pos of positions) {
    const key = `${pos.owner}::${pos.ticker}`;
    const res = resolutionsMap.get(key);
    if (res) {
      pos.resolution = {
        id: res.id,
        status: res.status as ResolutionStatus,
        nature: (res.nature as DiscrepancyNature) ?? null,
        notes: res.notes,
        qtyDeltaAtAction: res.qtyDeltaAtAction ? Number(res.qtyDeltaAtAction) : null,
        mvDeltaAtAction: res.mvDeltaAtAction ? Number(res.mvDeltaAtAction) : null,
        updatedAt: res.updatedAt.toISOString(),
      };
    }
  }

  // Compute summary from owner breakdown
  const snapshotNav = ownerBreakdown.reduce(
    (sum, o) => sum + (o.snapshotNavTotal ?? 0),
    0
  );
  const eventSourcedNav = ownerBreakdown.reduce(
    (sum, o) => sum + (o.eventSourcedNavTotal ?? 0),
    0
  );
  const navDelta = snapshotNav - eventSourcedNav;
  const navDeltaPct =
    eventSourcedNav !== 0 ? (navDelta / Math.abs(eventSourcedNav)) * 100 : 0;

  // Get actual snapshot date used (latest per account on or before comparison date)
  const snapshotDateRow = (await db.execute(sql`
    WITH latest_per_account AS (
      SELECT account_id, MAX(snapshot_date) AS latest_date
      FROM portfolio_snapshots
      WHERE level = 'account'
        AND snapshot_date <= ${comparisonDate}
      GROUP BY account_id
    )
    SELECT MIN(latest_date) AS d_min, MAX(latest_date) AS d_max
    FROM latest_per_account
  `)) as any[];

  const matchedPositions = positions.filter((p) => p.status === "match").length;
  const mismatchedPositions = positions.filter(
    (p) => p.status === "qty_mismatch" || p.status === "mv_mismatch"
  ).length;
  const snapshotOnlyPositions = positions.filter(
    (p) => p.status === "snapshot_only"
  ).length;
  const eventSourcedOnlyPositions = positions.filter(
    (p) => p.status === "event_sourced_only"
  ).length;

  // Resolution disposition counts (only for discrepancies, not matches)
  const discrepancies = positions.filter((p) => p.status !== "match");
  const acceptedCount = discrepancies.filter(
    (p) => p.resolution?.status === "accepted"
  ).length;
  const flaggedCount = discrepancies.filter(
    (p) => p.resolution?.status === "flagged"
  ).length;
  const resolvedCount = discrepancies.filter(
    (p) => p.resolution?.status === "resolved"
  ).length;
  const unresolvedCount = discrepancies.length - acceptedCount - flaggedCount - resolvedCount;

  return {
    summary: {
      comparisonDate,
      snapshotDate: snapshotDateRow[0]?.d_min === snapshotDateRow[0]?.d_max
        ? (snapshotDateRow[0]?.d_max ?? "")
        : `${snapshotDateRow[0]?.d_min ?? ""} – ${snapshotDateRow[0]?.d_max ?? ""}`,
      eventSourcedDate: comparisonDate,
      eventSourceFreshness,
      snapshotNav,
      eventSourcedNav,
      navDelta,
      navDeltaPct,
      totalPositions: positions.length,
      matchedPositions,
      mismatchedPositions,
      snapshotOnlyPositions,
      eventSourcedOnlyPositions,
      unresolvedCount,
      acceptedCount,
      flaggedCount,
      resolvedCount,
    },
    ownerBreakdown,
    positions,
    lastCheckpoint,
    bottleneck,
  };
}
