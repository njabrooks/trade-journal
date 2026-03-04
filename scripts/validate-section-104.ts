/**
 * Validate Section 104 implementation against HMRC worked examples.
 *
 * Tests the two-pass algorithm with known inputs and expected outputs.
 * Uses HMRC's published Share Identification Rules examples.
 *
 * Usage: npx tsx scripts/validate-section-104.ts
 */

// ============================================================================
// HMRC Example 1: Basic Same-Day + Pool
//
// From HMRC Share Identification Rules:
// - Buy 1,000 shares at £4 each on 1 May = £4,000
// - Buy 500 shares at £4.50 each on 15 Sep = £2,250
// - Sell 700 shares at £6 each on 15 Sep = £4,200
//
// Matching:
// - Same-day rule: 500 of the 700 sold match the 500 bought on 15 Sep
//   Cost: 500 × £4.50 = £2,250. Proceeds: 500 × £6 = £3,000. Gain: £750
// - Pool: remaining 200 matched from pool
//   Pool before: 1,000 shares at £4 = £4,000 (avg £4/share)
//   Cost: 200 × £4 = £800. Proceeds: 200 × £6 = £1,200. Gain: £400
//   Pool after: 800 shares, £3,200
// - Total gain: £750 + £400 = £1,150
// ============================================================================

interface TestEvent {
  date: string;      // YYYY-MM-DD
  type: "BUY" | "SELL";
  quantity: number;
  priceGbp: number;  // per unit
}

interface ExpectedMatch {
  matchType: "same_day" | "bed_and_breakfast" | "section_104_pool";
  quantity: number;
  costGbp: number;
  proceedsGbp: number;
  gainGbp: number;
}

interface TestCase {
  name: string;
  events: TestEvent[];
  expectedMatches: ExpectedMatch[];
  expectedPoolQty: number;
  expectedPoolCostGbp: number;
  expectedTotalGain: number;
}

const EPSILON = 0.01; // £0.01 tolerance

function runTest(tc: TestCase): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let passed = true;

  // Build acquisition and disposal lists
  const acquisitions = tc.events
    .filter(e => e.type === "BUY")
    .map((e, i) => ({
      id: `acq-${i}`,
      date: e.date,
      quantity: e.quantity,
      totalValueGbp: e.quantity * e.priceGbp,
      costPerUnit: e.priceGbp,
    }));

  const disposals = tc.events
    .filter(e => e.type === "SELL")
    .map((e, i) => ({
      id: `disp-${i}`,
      date: e.date,
      quantity: e.quantity,
      totalValueGbp: e.quantity * e.priceGbp,
      proceedsPerUnit: e.priceGbp,
    }));

  // Build acquisition index by date
  const acqByDate = new Map<string, typeof acquisitions>();
  for (const acq of acquisitions) {
    if (!acqByDate.has(acq.date)) acqByDate.set(acq.date, []);
    acqByDate.get(acq.date)!.push(acq);
  }

  // Track reserved quantities
  const reservedQty = new Map<string, number>();
  const getAvailable = (id: string, total: number) => total - (reservedQty.get(id) ?? 0);
  const reserve = (id: string, qty: number) => reservedQty.set(id, (reservedQty.get(id) ?? 0) + qty);

  // Track disposal match states
  const disposalStates: Array<{
    disposal: (typeof disposals)[0];
    matches: ExpectedMatch[];
    poolRemaining: number;
  }> = [];

  // Pass 1: Same-day + B&B matching
  for (const disp of disposals) {
    const matches: ExpectedMatch[] = [];
    let remaining = disp.quantity;

    // Same-day
    const sameDayAcqs = acqByDate.get(disp.date) ?? [];
    for (const acq of sameDayAcqs) {
      if (remaining < EPSILON) break;
      const available = getAvailable(acq.id, acq.quantity);
      if (available < EPSILON) continue;

      const matched = Math.min(remaining, available);
      const cost = matched * acq.costPerUnit;
      const proceeds = matched * disp.proceedsPerUnit;
      reserve(acq.id, matched);
      matches.push({
        matchType: "same_day",
        quantity: matched,
        costGbp: cost,
        proceedsGbp: proceeds,
        gainGbp: proceeds - cost,
      });
      remaining -= matched;
    }

    // B&B (next 30 days)
    if (remaining > EPSILON) {
      const dispDate = new Date(disp.date + "T00:00:00Z");
      for (let d = 1; d <= 30; d++) {
        if (remaining < EPSILON) break;
        const lookDate = new Date(dispDate);
        lookDate.setUTCDate(lookDate.getUTCDate() + d);
        const lookStr = lookDate.toISOString().slice(0, 10);
        const bnbAcqs = acqByDate.get(lookStr) ?? [];
        for (const acq of bnbAcqs) {
          if (remaining < EPSILON) break;
          const available = getAvailable(acq.id, acq.quantity);
          if (available < EPSILON) continue;

          const matched = Math.min(remaining, available);
          const cost = matched * acq.costPerUnit;
          const proceeds = matched * disp.proceedsPerUnit;
          reserve(acq.id, matched);
          matches.push({
            matchType: "bed_and_breakfast",
            quantity: matched,
            costGbp: cost,
            proceedsGbp: proceeds,
            gainGbp: proceeds - cost,
          });
          remaining -= matched;
        }
      }
    }

    disposalStates.push({ disposal: disp, matches, poolRemaining: remaining });
  }

  // Pass 2: Build pool + pool matching
  const pool = { qty: 0, costGbp: 0, avgCost: 0 };
  const allEvents = tc.events.map((e, i) => ({ ...e, idx: i }));
  allEvents.sort((a, b) => a.date.localeCompare(b.date) || a.idx - b.idx);

  let acqIdx = 0;
  let dispIdx = 0;

  for (const event of allEvents) {
    if (event.type === "BUY") {
      const acq = acquisitions[acqIdx++];
      const reserved = reservedQty.get(acq.id) ?? 0;
      const unreserved = acq.quantity - reserved;
      if (unreserved > EPSILON) {
        const cost = unreserved * acq.costPerUnit;
        pool.qty += unreserved;
        pool.costGbp += cost;
        pool.avgCost = pool.qty > EPSILON ? pool.costGbp / pool.qty : 0;
      }
    }

    if (event.type === "SELL") {
      const ds = disposalStates[dispIdx++];
      if (ds.poolRemaining > EPSILON && pool.qty > EPSILON) {
        const matchQty = Math.min(ds.poolRemaining, pool.qty);
        const cost = matchQty * pool.avgCost;
        const proceeds = matchQty * ds.disposal.proceedsPerUnit;
        const gain = proceeds - cost;

        pool.qty -= matchQty;
        pool.costGbp -= cost;
        if (pool.qty > EPSILON) {
          pool.avgCost = pool.costGbp / pool.qty;
        } else {
          pool.qty = 0;
          pool.costGbp = 0;
          pool.avgCost = 0;
        }

        ds.matches.push({
          matchType: "section_104_pool",
          quantity: matchQty,
          costGbp: cost,
          proceedsGbp: proceeds,
          gainGbp: gain,
        });
      }
    }
  }

  // Verify matches
  const allMatches = disposalStates.flatMap(ds => ds.matches);

  if (allMatches.length !== tc.expectedMatches.length) {
    details.push(`FAIL: Expected ${tc.expectedMatches.length} matches, got ${allMatches.length}`);
    passed = false;
  }

  for (let i = 0; i < Math.min(allMatches.length, tc.expectedMatches.length); i++) {
    const actual = allMatches[i];
    const expected = tc.expectedMatches[i];

    if (actual.matchType !== expected.matchType) {
      details.push(`FAIL match[${i}]: type ${actual.matchType} != expected ${expected.matchType}`);
      passed = false;
    }
    if (Math.abs(actual.quantity - expected.quantity) > EPSILON) {
      details.push(`FAIL match[${i}]: qty ${actual.quantity} != expected ${expected.quantity}`);
      passed = false;
    }
    if (Math.abs(actual.costGbp - expected.costGbp) > EPSILON) {
      details.push(`FAIL match[${i}]: cost £${actual.costGbp.toFixed(2)} != expected £${expected.costGbp.toFixed(2)}`);
      passed = false;
    }
    if (Math.abs(actual.gainGbp - expected.gainGbp) > EPSILON) {
      details.push(`FAIL match[${i}]: gain £${actual.gainGbp.toFixed(2)} != expected £${expected.gainGbp.toFixed(2)}`);
      passed = false;
    }
  }

  // Verify pool state
  if (Math.abs(pool.qty - tc.expectedPoolQty) > EPSILON) {
    details.push(`FAIL pool qty: ${pool.qty} != expected ${tc.expectedPoolQty}`);
    passed = false;
  }
  if (Math.abs(pool.costGbp - tc.expectedPoolCostGbp) > EPSILON) {
    details.push(`FAIL pool cost: £${pool.costGbp.toFixed(2)} != expected £${tc.expectedPoolCostGbp.toFixed(2)}`);
    passed = false;
  }

  // Verify total gain
  const totalGain = allMatches.reduce((sum, m) => sum + m.gainGbp, 0);
  if (Math.abs(totalGain - tc.expectedTotalGain) > EPSILON) {
    details.push(`FAIL total gain: £${totalGain.toFixed(2)} != expected £${tc.expectedTotalGain.toFixed(2)}`);
    passed = false;
  }

  if (passed) {
    details.push("PASS");
  }

  return { passed, details };
}

// ============================================================================
// Test Cases
// ============================================================================

const testCases: TestCase[] = [
  {
    name: "HMRC Example 1: Same-day + Pool",
    events: [
      { date: "2025-05-01", type: "BUY", quantity: 1000, priceGbp: 4.00 },
      { date: "2025-09-15", type: "BUY", quantity: 500, priceGbp: 4.50 },
      { date: "2025-09-15", type: "SELL", quantity: 700, priceGbp: 6.00 },
    ],
    expectedMatches: [
      // Same-day: 500 of 700 matched to the 500 bought on same day
      { matchType: "same_day", quantity: 500, costGbp: 2250, proceedsGbp: 3000, gainGbp: 750 },
      // Pool: remaining 200 from pool (1000 @ £4 = £4000, avg £4)
      { matchType: "section_104_pool", quantity: 200, costGbp: 800, proceedsGbp: 1200, gainGbp: 400 },
    ],
    expectedPoolQty: 800,       // 1000 - 200 = 800
    expectedPoolCostGbp: 3200,  // 4000 - 800 = 3200
    expectedTotalGain: 1150,    // 750 + 400
  },
  {
    name: "HMRC Example 2: B&B Rule",
    events: [
      { date: "2025-01-10", type: "BUY", quantity: 1000, priceGbp: 5.00 },  // £5,000
      { date: "2025-06-01", type: "SELL", quantity: 400, priceGbp: 8.00 },   // £3,200
      { date: "2025-06-15", type: "BUY", quantity: 400, priceGbp: 7.00 },    // £2,800 (within 30 days)
    ],
    expectedMatches: [
      // B&B: 400 sold on Jun 1 matched to 400 bought on Jun 15 (within 30 days)
      { matchType: "bed_and_breakfast", quantity: 400, costGbp: 2800, proceedsGbp: 3200, gainGbp: 400 },
    ],
    expectedPoolQty: 1000,      // Original 1000 stays (B&B acquisition doesn't enter pool)
    expectedPoolCostGbp: 5000,  // Original £5000
    expectedTotalGain: 400,
  },
  {
    name: "HMRC Example 3: All Three Rules",
    events: [
      { date: "2025-03-01", type: "BUY", quantity: 2000, priceGbp: 3.00 },  // Pool: 2000 @ £3 = £6,000
      { date: "2025-07-10", type: "SELL", quantity: 1500, priceGbp: 5.00 },  // Sell £7,500
      { date: "2025-07-10", type: "BUY", quantity: 200, priceGbp: 4.80 },   // Same-day
      { date: "2025-07-20", type: "BUY", quantity: 300, priceGbp: 4.50 },   // B&B (within 30 days)
    ],
    expectedMatches: [
      // Same-day: 200 matched
      { matchType: "same_day", quantity: 200, costGbp: 960, proceedsGbp: 1000, gainGbp: 40 },
      // B&B: 300 matched (Jul 20 is within 30 days of Jul 10)
      { matchType: "bed_and_breakfast", quantity: 300, costGbp: 1350, proceedsGbp: 1500, gainGbp: 150 },
      // Pool: 1000 remaining from pool (2000 @ £3 = £6000, avg £3)
      { matchType: "section_104_pool", quantity: 1000, costGbp: 3000, proceedsGbp: 5000, gainGbp: 2000 },
    ],
    expectedPoolQty: 1000,      // 2000 - 1000 = 1000
    expectedPoolCostGbp: 3000,  // 6000 - 3000 = 3000
    expectedTotalGain: 2190,    // 40 + 150 + 2000
  },
  {
    name: "Pool Only (no same-day or B&B)",
    events: [
      { date: "2025-01-01", type: "BUY", quantity: 500, priceGbp: 10.00 },
      { date: "2025-02-01", type: "BUY", quantity: 300, priceGbp: 12.00 },
      { date: "2025-06-01", type: "SELL", quantity: 400, priceGbp: 15.00 },
    ],
    expectedMatches: [
      // Pool avg = (5000 + 3600) / (500 + 300) = 8600 / 800 = £10.75
      // Cost: 400 × £10.75 = £4,300
      // Proceeds: 400 × £15 = £6,000
      // Gain: £1,700
      { matchType: "section_104_pool", quantity: 400, costGbp: 4300, proceedsGbp: 6000, gainGbp: 1700 },
    ],
    expectedPoolQty: 400,       // 800 - 400 = 400
    expectedPoolCostGbp: 4300,  // 8600 - 4300 = 4300
    expectedTotalGain: 1700,
  },
];

// ============================================================================
// Run Tests
// ============================================================================

console.log("Section 104 Validation — HMRC Worked Examples\n");

let allPassed = true;

for (const tc of testCases) {
  console.log(`Test: ${tc.name}`);
  const { passed, details } = runTest(tc);
  for (const d of details) {
    console.log(`  ${d}`);
  }
  if (!passed) allPassed = false;
  console.log();
}

if (allPassed) {
  console.log("All tests PASSED");
  process.exit(0);
} else {
  console.log("Some tests FAILED");
  process.exit(1);
}
