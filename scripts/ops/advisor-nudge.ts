#!/usr/bin/env tsx
/**
 * advisor-nudge — SessionStart one-liner for fresh advisor recommendations
 * (docs/v2/21 Phase 4 login surfacing). Prints ONE line when there are active
 * recommendations created in the last 24h; silent otherwise (nudge discipline:
 * only speak when there's something new).
 *
 * Usage: npx tsx scripts/ops/advisor-nudge.ts --nudge
 */
import { db, closeDb } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const rows = await db.execute(sql`
    SELECT scenario, COUNT(*) AS n
    FROM advisor_recommendations
    WHERE status = 'active'
      AND expires_at > NOW()
      AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY scenario
    ORDER BY scenario
  `);
  const list = rows as unknown as Array<{ scenario: string; n: string }>;
  if (list.length > 0) {
    const total = list.reduce((a, r) => a + Number(r.n), 0);
    const parts = list.map((r) => `${r.scenario} ${r.n}`).join(' · ');
    console.log(`🟢 ${total} fresh advisor rec${total === 1 ? '' : 's'} (${parts}) → dashboard`);
  }
  await closeDb();
}

main().catch(() => process.exit(0)); // nudges never break session start
