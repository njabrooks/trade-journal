/**
 * consolidate-strategy-signals.ts
 *
 * One-time migration: consolidate per-target strategy price signals into
 * one signal per underlying with a `targets` array in explicit_details.
 *
 * Before: 13 signals (3 BTC, 5 GLXY, 5 HYPE) × N strategy links each
 * After:  3 signals (BTC, GLXY, HYPE) × N strategy links each
 *
 * Steps per underlying:
 *   1. Group existing signals by ticker
 *   2. Build a `targets` array from their explicit_details
 *   3. Insert one new consolidated signal
 *   4. Move all signal_entity_links to the new signal (deduplicated)
 *   5. Keep snapshots from the first USD target (rebind to new signal), delete rest
 *   6. Mark old signals as rejected with migration note
 *
 * Usage:
 *   npx tsx scripts/consolidate-strategy-signals.ts [--dry-run]
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and, sql, inArray } from 'drizzle-orm';

const { signals, signalEntityLinks, signalDataSnapshots, signalStatusHistory, journalEntries } = schema;

const DRY_RUN = process.argv.includes('--dry-run');

/** Build a SQL array literal for uuid[] — workaround for Drizzle's sql`` not handling JS arrays with ANY() */
function uuidArray(ids: string[]) {
  return sql.raw(`ARRAY[${ids.map(id => `'${id}'`).join(',')}]::uuid[]`);
}

interface OldSignalRow {
  id: string;
  type: string;
  statement: string;
  status: string;
  importance: string;
  explicit_details: Record<string, unknown>;
  ticker: string;
}

interface Target {
  level: number;
  label: string;
  price: number;
  denomination: 'BTC' | 'USD';
  positionPct: number | null;
  conditionType: string;
  tvDrawingId: string;
  tvSymbol: string;
  status: 'active' | 'complete';
}

function buildConsolidatedStatement(ticker: string, targets: Target[]): string {
  const usdTargets = targets.filter(t => t.denomination === 'USD').sort((a, b) => a.price - b.price);
  const btcTargets = targets.filter(t => t.denomination === 'BTC').sort((a, b) => a.price - b.price);

  const parts: string[] = [];

  if (usdTargets.length > 0) {
    const prices = usdTargets.map(t => `$${t.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    parts.push(prices.join(' / '));
  }

  if (btcTargets.length > 0) {
    const prices = btcTargets.map(t => t.price.toPrecision(4));
    parts.push(prices.join(' / ') + ' BTC');
  }

  return `${ticker} take-profit ladder: ${parts.join(', ')}`;
}

function extractLevel(label: string): number {
  const m = label.match(/TP(\d)/i);
  return m ? parseInt(m[1], 10) : 0;
}

async function main() {
  console.log(`\n🔄 consolidate-strategy-signals${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Fetch all active strategy-linked signals with their ticker
  const oldSignals = await db.execute<OldSignalRow>(sql`
    SELECT DISTINCT ON (s.id)
      s.id,
      s.type,
      s.statement,
      s.status,
      s.importance,
      s.explicit_details,
      COALESCE(u.ticker, '') as ticker
    FROM signals s
    JOIN signal_entity_links sel ON sel.signal_id = s.id
    LEFT JOIN strategies st ON sel.strategy_id = st.id
    LEFT JOIN asset_theses at2 ON st.asset_thesis_id = at2.id
    LEFT JOIN underlyings u ON at2.underlying_id = u.id
    WHERE sel.entity_type = 'strategy'
      AND s.status = 'active'
      AND s.explicit_details->>'tvDrawingId' IS NOT NULL
    ORDER BY s.id
  `);

  if (oldSignals.length === 0) {
    console.log('  No active strategy price signals found. Nothing to do.');
    await closeDb();
    return;
  }

  console.log(`  Found ${oldSignals.length} individual strategy price signals\n`);

  // 2. Group by ticker
  const byTicker = new Map<string, OldSignalRow[]>();
  for (const s of oldSignals) {
    const existing = byTicker.get(s.ticker) || [];
    existing.push(s);
    byTicker.set(s.ticker, existing);
  }

  let totalCreated = 0;
  let totalLinksCreated = 0;
  let totalSnapshotsMoved = 0;
  let totalSnapshotsDeleted = 0;
  let totalOldSignalsRetired = 0;

  for (const [ticker, tickerSignals] of byTicker) {
    console.log(`  ${ticker} — ${tickerSignals.length} signals to consolidate`);

    // 3. Build targets array
    const targets: Target[] = tickerSignals.map(s => {
      const d = s.explicit_details;
      return {
        level: extractLevel((d.tvLabel as string) || ''),
        label: (d.tvLabel as string) || '',
        price: d.price as number,
        denomination: (d.denomination as 'BTC' | 'USD') || 'USD',
        positionPct: (() => {
          const m = ((d.tvLabel as string) || '').match(/(\d+)%/);
          return m ? parseInt(m[1], 10) : null;
        })(),
        conditionType: (d.conditionType as string) || 'price_above',
        tvDrawingId: (d.tvDrawingId as string) || '',
        tvSymbol: (d.tvSymbol as string) || '',
        status: 'active',
      };
    });

    // Sort: USD targets by price ascending, then BTC targets by price ascending
    targets.sort((a, b) => {
      if (a.denomination !== b.denomination) return a.denomination === 'USD' ? -1 : 1;
      return a.price - b.price;
    });

    const statement = buildConsolidatedStatement(ticker, targets);
    console.log(`    Statement: "${statement}"`);
    console.log(`    Targets: ${targets.map(t => `${t.label} ${t.denomination === 'USD' ? '$' + t.price : t.price.toPrecision(4) + ' BTC'}`).join(', ')}`);

    const explicitDetails = {
      signalKind: 'strategy_price_ladder',
      ticker,
      targets,
      tvLayoutId: (tickerSignals[0].explicit_details.tvLayoutId as string) || '',
    };

    // 4. Collect all strategy links from old signals (deduplicated by strategyId)
    const oldSignalIds = tickerSignals.map(s => s.id);
    const existingLinks = await db.execute<{
      signal_id: string;
      strategy_id: string;
      position_pct: number | null;
    }>(sql`
      SELECT signal_id, strategy_id, position_pct
      FROM signal_entity_links
      WHERE signal_id = ANY(${uuidArray(oldSignalIds)})
        AND entity_type = 'strategy'
    `);

    // Deduplicate by strategy_id (keep first seen)
    const strategyIds = new Set<string>();
    const uniqueLinks: Array<{ strategyId: string }> = [];
    for (const link of existingLinks) {
      if (!strategyIds.has(link.strategy_id)) {
        strategyIds.add(link.strategy_id);
        uniqueLinks.push({ strategyId: link.strategy_id });
      }
    }

    console.log(`    Strategies: ${uniqueLinks.length}`);

    // Pick one old signal to preserve snapshots from (prefer first USD TP1)
    const snapshotDonor = tickerSignals.find(s => {
      const d = s.explicit_details;
      return d.denomination === 'USD' && ((d.tvLabel as string) || '').includes('TP1');
    }) || tickerSignals[0];
    const donorSnapshotCount = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text as count FROM signal_data_snapshots WHERE signal_id = ${snapshotDonor.id}
    `);
    const otherOldIds = oldSignalIds.filter(id => id !== snapshotDonor.id);

    console.log(`    Snapshot donor: ${snapshotDonor.statement} (${donorSnapshotCount[0]?.count || 0} snapshots)`);

    if (!DRY_RUN) {
      // 5a. Create the consolidated signal
      const [inserted] = await db.insert(signals).values({
        type: 'confirmation',
        statement,
        category: 'data_driven',
        importance: 'significant',
        status: 'active',
        explicitDetails: explicitDetails,
        linkedClaimIds: [],
      }).returning({ id: signals.id });

      const newSignalId = inserted.id;
      console.log(`    ✓ Created consolidated signal ${newSignalId}`);
      totalCreated++;

      // 5b. Create entity links for all strategies
      for (const link of uniqueLinks) {
        await db.insert(signalEntityLinks).values({
          signalId: newSignalId,
          entityType: 'strategy',
          strategyId: link.strategyId,
        }).onConflictDoNothing();
        totalLinksCreated++;
      }
      console.log(`    ✓ Created ${uniqueLinks.length} entity links`);

      // 5c. Move snapshots from donor signal to new signal
      const moveResult = await db.execute(sql`
        UPDATE signal_data_snapshots
        SET signal_id = ${newSignalId}
        WHERE signal_id = ${snapshotDonor.id}
      `);
      totalSnapshotsMoved += parseInt(donorSnapshotCount[0]?.count || '0', 10);
      console.log(`    ✓ Moved ${donorSnapshotCount[0]?.count || 0} snapshots to new signal`);

      // 5d. Delete snapshots from other old signals
      if (otherOldIds.length > 0) {
        const deleteResult = await db.execute(sql`
          DELETE FROM signal_data_snapshots
          WHERE signal_id = ANY(${uuidArray(otherOldIds)})
        `);
        const deletedCount = deleteResult.rowCount || 0;
        totalSnapshotsDeleted += deletedCount;
        console.log(`    ✓ Deleted ${deletedCount} duplicate snapshots`);
      }

      // 5e. (removed) signal_data_tracking cleanup — table dropped 2026-06 (v2 prune)

      // 5f. Delete old entity links
      await db.execute(sql`
        DELETE FROM signal_entity_links
        WHERE signal_id = ANY(${uuidArray(oldSignalIds)})
      `);

      // 5g. Delete signal_status_history for old signals
      await db.execute(sql`
        DELETE FROM signal_status_history
        WHERE signal_id = ANY(${uuidArray(oldSignalIds)})
      `);

      // 5h. Mark old signals as rejected
      await db.execute(sql`
        UPDATE signals
        SET status = 'rejected',
            notes = 'Consolidated into single per-underlying signal ' || ${newSignalId},
            updated_at = NOW()
        WHERE id = ANY(${uuidArray(oldSignalIds)})
      `);
      totalOldSignalsRetired += oldSignalIds.length;
      console.log(`    ✓ Retired ${oldSignalIds.length} old signals`);

      // 5i. Journal entry
      await db.insert(journalEntries).values({
        objectType: 'signal',
        objectId: newSignalId,
        objectTitle: statement,
        actionType: 'created',
        actionDescription: `Consolidated ${oldSignalIds.length} individual TP signals for ${ticker} into single price ladder signal with ${targets.length} targets`,
        source: 'automation',
      });
    } else {
      console.log(`    [DRY RUN] Would create consolidated signal, move links & snapshots, retire old signals`);
    }

    console.log('');
  }

  console.log('─'.repeat(50));
  console.log(`  Consolidated signals created: ${totalCreated}`);
  console.log(`  Entity links created: ${totalLinksCreated}`);
  console.log(`  Snapshots moved: ${totalSnapshotsMoved}`);
  console.log(`  Snapshots deleted (duplicates): ${totalSnapshotsDeleted}`);
  console.log(`  Old signals retired: ${totalOldSignalsRetired}`);
  if (DRY_RUN) console.log('  (dry run — no changes written)');

  await closeDb();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
