/**
 * Nightly Signal Day Synthesis
 *
 * For each active signal, reviews all qualitative observations from the previous
 * calendar day (UTC) and writes one daily_synthesis row to signal_data_snapshots.
 * If no observations exist for a signal that day, writes a neutral row to keep
 * the time series gap-free.
 *
 * Usage:
 *   npx tsx scripts/synthesize-signal-day.ts              # Synthesise yesterday (default)
 *   npx tsx scripts/synthesize-signal-day.ts --date 2026-03-17  # Synthesise a specific date
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, ne, and, sql } from 'drizzle-orm';

const { signals, signalDataSnapshots } = schema;

type Assessment = 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated';

function resolveTargetDate(): string {
  const dateArg = process.argv.find((_, i, arr) => arr[i - 1] === '--date');
  if (dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    return dateArg;
  }
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().split('T')[0];
}

function synthesise(observations: { assessment: string | null }[]): { assessment: Assessment; evidenceSummary: string } {
  if (observations.length === 0) {
    return { assessment: 'neutral', evidenceSummary: 'No observations — neutral by default.' };
  }

  const hasConfirmed = observations.some(o => o.assessment === 'confirmed');
  const hasInvalidated = observations.some(o => o.assessment === 'invalidated');

  if (hasConfirmed) {
    return {
      assessment: 'confirmed',
      evidenceSummary: `Day synthesis: confirmed (terminal state from ${observations.length} observation${observations.length !== 1 ? 's' : ''}).`,
    };
  }
  if (hasInvalidated) {
    return {
      assessment: 'invalidated',
      evidenceSummary: `Day synthesis: invalidated (terminal state from ${observations.length} observation${observations.length !== 1 ? 's' : ''}).`,
    };
  }

  const strengthening = observations.filter(o => o.assessment === 'strengthening').length;
  const weakening = observations.filter(o => o.assessment === 'weakening').length;
  const neutral = observations.filter(o => o.assessment === 'neutral').length;
  const score = strengthening - weakening;
  const assessment: Assessment = score > 0 ? 'strengthening' : score < 0 ? 'weakening' : 'neutral';

  return {
    assessment,
    evidenceSummary: `Day synthesis (${observations.length} observation${observations.length !== 1 ? 's' : ''}): ${strengthening} strengthening, ${weakening} weakening, ${neutral} neutral.`,
  };
}

async function main() {
  const targetDateStr = resolveTargetDate();
  console.log(`Synthesising signal day: ${targetDateStr}`);

  // Pre-pass: auto-accept any pending snapshots for this date
  const accepted = await db
    .update(signalDataSnapshots)
    .set({ status: 'accepted' })
    .where(
      and(
        eq(signalDataSnapshots.status, 'pending'),
        sql`${signalDataSnapshots.snapshotDate}::date = ${targetDateStr}::date`
      )
    );
  const acceptedCount = accepted.rowCount ?? 0;
  if (acceptedCount > 0) {
    console.log(`Pre-pass: auto-accepted ${acceptedCount} pending snapshot(s).`);
  }

  // Fetch all active signals
  const activeSignals = await db
    .select({ id: signals.id, statement: signals.statement })
    .from(signals)
    .where(eq(signals.status, 'active'));

  console.log(`Active signals: ${activeSignals.length}`);

  let written = 0;

  for (const signal of activeSignals) {
    // Fetch all non-synthesis, non-rejected snapshots for this signal on targetDate
    const observations = await db
      .select({ assessment: signalDataSnapshots.assessment })
      .from(signalDataSnapshots)
      .where(
        and(
          eq(signalDataSnapshots.signalId, signal.id),
          sql`${signalDataSnapshots.snapshotDate}::date = ${targetDateStr}::date`,
          ne(signalDataSnapshots.dataSource, 'daily_synthesis'),
          ne(signalDataSnapshots.status, 'rejected')
        )
      );

    const { assessment, evidenceSummary } = synthesise(observations);

    // Delete any existing synthesis row for this signal+date (supports re-runs)
    await db
      .delete(signalDataSnapshots)
      .where(
        and(
          eq(signalDataSnapshots.signalId, signal.id),
          sql`${signalDataSnapshots.snapshotDate}::date = ${targetDateStr}::date`,
          eq(signalDataSnapshots.dataSource, 'daily_synthesis')
        )
      );

    // Insert new synthesis row
    await db.insert(signalDataSnapshots).values({
      signalId: signal.id,
      snapshotDate: new Date(targetDateStr),
      assessment,
      dataSource: 'daily_synthesis',
      evidenceSummary,
    });

    written++;
    console.log(`  ${signal.statement.slice(0, 60)}... → ${assessment} (${observations.length} obs)`);
  }

  console.log(`Done. ${written} synthesis rows written for ${targetDateStr}.`);
  await closeDb();
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
