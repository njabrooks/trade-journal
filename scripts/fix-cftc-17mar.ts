import { db, closeDb } from './lib/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.execute(sql`
    UPDATE signal_data_snapshots
    SET assessment = 'neutral'
    WHERE id = 'bcd8866b-0312-454c-8f53-fd53747ab2c5'
      AND assessment = 'strengthening'
  `);
  console.log(`Updated rows: ${result.rowCount ?? '(pooler)'}`);

  const check = await db.execute(sql`
    SELECT assessment FROM signal_data_snapshots WHERE id = 'bcd8866b-0312-454c-8f53-fd53747ab2c5'
  `);
  const row = check.rows[0] as { assessment: string };
  console.log('Current assessment:', row?.assessment);

  await closeDb();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
