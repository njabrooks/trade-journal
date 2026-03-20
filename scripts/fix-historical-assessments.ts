import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const fix1 = await db.execute(sql`
    UPDATE signal_data_snapshots sds
    SET assessment = 'neutral'
    FROM signals s
    WHERE sds.signal_id = s.id
      AND s.type IN ('invalidation','warning')
      AND sds.data_source IN ('thesis_monitor','qualitative','research_routing')
      AND sds.assessment = 'strengthening'
      AND (
        sds.evidence_summary ILIKE '%no threat%'
        OR sds.evidence_summary ILIKE '%no new threat%'
        OR sds.evidence_summary ILIKE '%no material threat%'
        OR sds.evidence_summary ILIKE '%no active threat%'
      )
      AND sds.evidence_summary NOT ILIKE '%monitoring elevated%'
      AND sds.evidence_summary NOT ILIKE '%pressure increasing%'
  `);
  console.log(`Fix 1 (invalidation → neutral): ${fix1.rowCount} rows`);

  const fix2 = await db.execute(sql`
    UPDATE signal_data_snapshots
    SET assessment = 'weakening'
    WHERE assessment = 'strengthening'
      AND evidence_summary ILIKE '%counter-evidence to enforcement%'
  `);
  console.log(`Fix 2 (SPDJI → weakening): ${fix2.rowCount} rows`);

  const fix3 = await db.execute(sql`
    UPDATE signal_data_snapshots sds
    SET assessment = 'neutral'
    FROM signals s
    WHERE sds.signal_id = s.id
      AND s.type IN ('confirmation','completion')
      AND sds.data_source IN ('thesis_monitor','qualitative','research_routing')
      AND sds.assessment = 'strengthening'
      AND (
        sds.evidence_summary ILIKE '%not approaching%'
        OR sds.evidence_summary ILIKE '%not calculable%'
        OR sds.evidence_summary ILIKE '%no new developments%'
        OR sds.evidence_summary ILIKE '%0 mw online%'
      )
  `);
  console.log(`Fix 3 (conf/completion → neutral): ${fix3.rowCount} rows`);

  console.log(`\nTotal: ${(fix1.rowCount ?? 0) + (fix2.rowCount ?? 0) + (fix3.rowCount ?? 0)} rows corrected`);

  await closeDb();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
