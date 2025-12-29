import { db } from '../src/db/index.js';
import { mainClaims, macroTheses, assetTheses } from '../src/db/schema.js';

async function checkCounts() {
  const counts = await Promise.all([
    db.select().from(mainClaims),
    db.select().from(macroTheses),
    db.select().from(assetTheses),
  ]);

  console.log('Database counts:');
  console.log('Main Claims:', counts[0].length);
  console.log('Macro Theses:', counts[1].length);
  console.log('Asset Thesiss:', counts[2].length);

  process.exit(0);
}

checkCounts();
