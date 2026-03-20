import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`
    UPDATE signal_data_snapshots
    SET assessment = 'neutral'
    WHERE id = 'c329d880-c05e-4e51-afad-48c57c7720d3'
      AND assessment = 'strengthening'
  `);

  const check = await db.execute(sql`
    SELECT data_source, assessment, LEFT(evidence_summary, 100) as summary
    FROM signal_data_snapshots
    WHERE signal_id = 'edf9f246-d76e-4fee-a04c-9867bfab7b69'
      AND snapshot_date::date = '2026-03-18'
      AND data_source != 'daily_synthesis'
    ORDER BY snapshot_date
  `);
  console.log('18 Mar observations after fix:');
  for (const row of check.rows as { data_source: string; assessment: string; summary: string }[]) {
    console.log(`  [${row.data_source}] ${row.assessment}: ${row.summary}`);
  }

  await closeDb();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
