import { db, closeDb } from './lib/db.js';
import { getUnifiedTriageQueue } from '../src/db/queries/triage.js';

async function test() {
  const accountId = 'f5b31a5d-f80f-40a9-aee8-a8e88e0cad35';
  const result = await getUnifiedTriageQueue(accountId);

  console.log('Total records:', result.records.length);

  // Check for QUANTITY_CHANGE
  const qcRecords = result.records.filter((r) => r.trigger === 'QUANTITY_CHANGE');
  console.log('QUANTITY_CHANGE records:', qcRecords.length);
  if (qcRecords.length > 0) {
    console.log('QUANTITY_CHANGE details:', qcRecords.map(r => ({ id: r.id, title: r.title, objectType: r.objectType })));
  }

  // Show trigger distribution
  const triggerCounts: Record<string, number> = {};
  for (const r of result.records) {
    triggerCounts[r.trigger] = (triggerCounts[r.trigger] || 0) + 1;
  }
  console.log('Trigger distribution:', triggerCounts);

  // Show object type distribution
  const objectTypeCounts: Record<string, number> = {};
  for (const r of result.records) {
    objectTypeCounts[r.objectType] = (objectTypeCounts[r.objectType] || 0) + 1;
  }
  console.log('Object type distribution:', objectTypeCounts);

  await closeDb();
  process.exit(0);
}

test().catch(e => { console.error(e); process.exit(1); });
