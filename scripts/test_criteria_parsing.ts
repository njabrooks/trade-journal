/**
 * Test script to validate criteria parsing for existing playbook items
 * 
 * This script reads existing playbook items from the database and tests
 * whether the CriteriaBuilder parser can correctly parse their criteria.
 */

import { db } from '../src/db';
import { playbookItems } from '../src/db/schema';
import { eq } from 'drizzle-orm';

// Import the parseCriteriaText function - we need to extract it
// For now, let's create a test version inline

interface Criterion {
  pattern: string;
  operator: string;
  value: string | number | boolean;
}

function parseCriteriaTextTest(text: string): Array<Criterion & { id: string; connector?: "AND" | "OR" }> {
  const criteria: Array<Criterion & { id: string; connector?: "AND" | "OR" }> = [];
  
  // Remove comments in parentheses
  let cleanText = text.replace(/\s*\([^)]*\)/g, '');
  
  // Split by AND/OR
  const parts = cleanText.split(/\s+(AND|OR)\s+/i);
  
  let connector: "AND" | "OR" | undefined = undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part === "AND" || part === "OR") {
      connector = part.toUpperCase() as "AND" | "OR";
      continue;
    }

    // Parse exclusion: "not LC2/LC3/LC4"
    const exclusionMatch = part.match(/^not\s+([A-Z0-9\/]+)$/i);
    if (exclusionMatch) {
      criteria.push({
        id: `criterion-${i}`,
        pattern: "Exclusion",
        operator: "not",
        value: exclusionMatch[1],
        connector,
      });
      connector = undefined;
      continue;
    }

    // Parse boolean patterns: "HasAssignmentRisk = Yes" or "AssignmentRisk ≠ Yes"
    const boolMatch = part.match(/^(HasAssignmentRisk|AssignmentRisk|ITM)\s*([=≠])\s*["']?(Yes|No|True|False)["']?$/i);
    if (boolMatch) {
      criteria.push({
        id: `criterion-${i}`,
        pattern: boolMatch[1] === "HasAssignmentRisk" ? "AssignmentRisk" : boolMatch[1],
        operator: boolMatch[2] === "≠" ? "≠" : "=",
        value: boolMatch[3] === "Yes" || boolMatch[3] === "True",
        connector,
      });
      connector = undefined;
      continue;
    }

    // Parse range patterns: "0.3 < PnlPctOfCost ≤ 1.0"
    const rangeMatch = part.match(/^([-\d.]+)\s*([<>≤≥=]+)\s*(MaxDTE|PnlPctOfCost|WorstShortSigma)\s*([<>≤≥=]+)\s*([-\d.]+)/i);
    if (rangeMatch) {
      // For ranges, we'll create two criteria
      const lowerBound = parseFloat(rangeMatch[1]);
      const upperBound = parseFloat(rangeMatch[5]);
      const pattern = rangeMatch[3];
      const lowerOp = rangeMatch[2].replace("≤", "<=").replace("≥", ">=");
      const upperOp = rangeMatch[4].replace("≤", "<=").replace("≥", ">=");
      
      criteria.push({
        id: `criterion-${i}-lower`,
        pattern,
        operator: lowerOp === "<" ? ">" : ">=",
        value: lowerBound,
        connector,
      });
      
      criteria.push({
        id: `criterion-${i}-upper`,
        pattern,
        operator: upperOp === "≤" ? "<=" : "<",
        value: upperBound,
        connector: "AND",
      });
      connector = undefined;
      continue;
    }

    // Parse numeric patterns: "MaxDTE > 90" or "PnlPctOfCost <= 0.3"
    const numericMatch = part.match(/^(MaxDTE|PnlPctOfCost|WorstShortSigma)\s*([><=≤≥]+)\s*([-\d.]+)/i);
    if (numericMatch) {
      const operator = numericMatch[2].replace("≤", "<=").replace("≥", ">=");
      criteria.push({
        id: `criterion-${i}`,
        pattern: numericMatch[1],
        operator,
        value: parseFloat(numericMatch[3]),
        connector,
      });
      connector = undefined;
      continue;
    }
  }

  return criteria;
}

async function testCriteriaParsing() {
  console.log('Testing criteria parsing for existing playbook items...\n');

  const items = await db.select().from(playbookItems).where(eq(playbookItems.isActive, true));

  let successCount = 0;
  let failCount = 0;
  const failures: Array<{ code: string; criteria: string; error: string }> = [];

  for (const item of items) {
    if (!item.criteria) {
      console.log(`✓ ${item.code}: No criteria (skipped)`);
      continue;
    }

    try {
      const parsed = parseCriteriaTextTest(item.criteria);
      if (parsed.length > 0) {
        console.log(`✓ ${item.code}: Parsed ${parsed.length} criterion/criteria`);
        successCount++;
      } else {
        console.log(`⚠ ${item.code}: Parsed but empty result`);
        failures.push({
          code: item.code,
          criteria: item.criteria,
          error: 'Parsed but empty result',
        });
        failCount++;
      }
    } catch (error) {
      console.log(`✗ ${item.code}: Failed to parse`);
      console.log(`  Criteria: ${item.criteria}`);
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
      failures.push({
        code: item.code,
        criteria: item.criteria,
        error: error instanceof Error ? error.message : String(error),
      });
      failCount++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total items: ${items.length}`);
  console.log(`Successfully parsed: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (failures.length > 0) {
    console.log(`\n=== Failures ===`);
    failures.forEach((f) => {
      console.log(`\n${f.code}:`);
      console.log(`  Criteria: ${f.criteria}`);
      console.log(`  Error: ${f.error}`);
    });
  }
}

// Run if called directly
if (require.main === module) {
  testCriteriaParsing()
    .then(() => {
      console.log('\nDone');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error testing criteria parsing:', error);
      process.exit(1);
    });
}

export { testCriteriaParsing };

