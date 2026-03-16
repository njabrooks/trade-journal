/**
 * Test script for Laevitas x402 API
 *
 * Usage:
 *   LAEVITAS_SOLANA_PRIVATE_KEY=<base58-key> npx tsx scripts/test-laevitas.ts
 *
 * Or add LAEVITAS_SOLANA_PRIVATE_KEY to .env.local and run:
 *   npx tsx scripts/test-laevitas.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { laevitas } from './lib/laevitas.js';

async function main() {
  console.log('Testing Laevitas x402 API...\n');

  if (!process.env.LAEVITAS_SOLANA_PRIVATE_KEY) {
    console.error('ERROR: LAEVITAS_SOLANA_PRIVATE_KEY not set in .env.local');
    console.error('Add your base58-encoded Solana private key to .env.local');
    console.error('The wallet needs USDC on Solana (~$0.10 for 100 API calls)');
    process.exit(1);
  }

  try {
    // Test 1: Get Hyperliquid perp volume
    console.log('1. Fetching Hyperliquid perp volume...');
    const hlVolume = await laevitas.getPerpVolume('hyperliquid');
    console.log('   Result:', JSON.stringify(hlVolume, null, 2).slice(0, 500));
    console.log();

    // Test 2: Get global perp volume
    console.log('2. Fetching global perp volume...');
    const globalVolume = await laevitas.getPerpVolume();
    console.log('   Result:', JSON.stringify(globalVolume, null, 2).slice(0, 500));
    console.log();

    // Test 3: Get Hyperliquid perp snapshot
    console.log('3. Fetching Hyperliquid perp snapshot...');
    const snapshot = await laevitas.getPerpSnapshot('hyperliquid');
    console.log('   Result:', JSON.stringify(snapshot, null, 2).slice(0, 500));
    console.log();

    // Test 4: Get open interest
    console.log('4. Fetching perp open interest...');
    const oi = await laevitas.getPerpOpenInterest();
    console.log('   Result:', JSON.stringify(oi, null, 2).slice(0, 500));
    console.log();

    console.log('All tests passed!');
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
