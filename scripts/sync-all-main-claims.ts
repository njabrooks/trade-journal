import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.local') });

import { db } from '../src/db/index.js';
import { mainClaims } from '../src/db/schema.js';
import { syncDatabaseToFile } from '../src/lib/obsidian/sync.js';

async function syncAllMainClaims() {
  try {
    const claims = await db.select().from(mainClaims);

    console.log(`Found ${claims.length} main claims in database\n`);
    console.log('Syncing all claims to Obsidian...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const claim of claims) {
      const result = await syncDatabaseToFile(claim, 'main_claim');
      if (result.success) {
        console.log('✅', claim.title.substring(0, 80));
        console.log('   → ', result.filePath);
        successCount++;
      } else {
        console.error('❌', claim.title.substring(0, 80));
        console.error('   Error:', result.error);
        errorCount++;
      }
    }

    console.log(`\n✅ Synced ${successCount} claims successfully`);
    if (errorCount > 0) {
      console.error(`❌ Failed to sync ${errorCount} claims`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error syncing claims:', error);
    process.exit(1);
  }
}

syncAllMainClaims();
