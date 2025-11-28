/**
 * Seed playbook_items table from WeeklyOptionsReview data
 * 
 * This script parses the strategy state codes and creates playbook items
 * that link strategies to their management rules.
 */

import { db } from '../src/db';
import { playbookItems, NewPlaybookItem } from '../src/db/schema';
import { eq } from 'drizzle-orm';

interface PlaybookRow {
  strategyType: string;
  stateCode: string;
  criteria: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
  riskNotes: string;
}

// Data from WeeklyOptionsReview
const playbookData: PlaybookRow[] = [
  {
    strategyType: 'LEAPS long call (potential PMCC base)',
    stateCode: 'LC1',
    criteria: 'MaxDTE > 90 AND PnlPctOfCost ≤ 0.3 AND not LC2/LC3/LC4',
    description: 'Early / flat / small move',
    primaryAction: 'Hold core; no overwrites. Consider adding on dips if thesis intact.',
    secondaryAction: 'Early / neutral; focus on thesis, not tactics.',
    riskNotes: '',
  },
  {
    strategyType: 'LEAPS long call (potential PMCC base)',
    stateCode: 'LC2',
    criteria: 'MaxDTE > 90 AND 0.3 < PnlPctOfCost ≤ 1.0',
    description: 'Working well with long runway',
    primaryAction: 'Consider small covered-call overwrites (0.20–0.30Δ, 30–60 DTE) to harvest theta.',
    secondaryAction: 'Consider adding on pullbacks if conviction high.',
    riskNotes: 'Position is working; avoid over-hedging convexity.',
  },
  {
    strategyType: 'LEAPS long call (potential PMCC base)',
    stateCode: 'LC3',
    criteria: 'PnlPctOfCost > 1.0 (100%+ gain)',
    description: 'Big winner',
    primaryAction: 'Scale partial profits or roll up/out to maintain convexity; opportunistic overwrites.',
    secondaryAction: 'Consider shifting some exposure into stock or tighter spreads.',
    riskNotes: 'Big winner; main risk is giving back too much / overtrading.',
  },
  {
    strategyType: 'LEAPS long call (potential PMCC base)',
    stateCode: 'LC4',
    criteria: 'MaxDTE ≤ 90',
    description: 'Late-stage and not working',
    primaryAction: 'Decide: cut / roll down to restore delta, or monetise and refresh LEAPS.',
    secondaryAction: 'Avoid adding risk this late; focus on simplifying or rolling.',
    riskNotes: 'Late-stage / decay zone; theta and gamma more acute.',
  },
  {
    strategyType: 'LEAPS risk reversal with extra short call',
    stateCode: 'RR1',
    criteria: 'MaxDTE > 120 AND (WorstShortSigma is blank OR > 1.0σ)',
    description: 'Comfy zone, far from short strikes',
    primaryAction: 'Hold structure; monitor σ-distance weekly; no urgent action.',
    secondaryAction: 'Consider defining risk with distant long put if position size is large.',
    riskNotes: 'Risk is latent; main task is monitoring not tinkering.',
  },
  {
    strategyType: 'LEAPS risk reversal with extra short call',
    stateCode: 'RR2',
    criteria: '0.5σ < WorstShortSigma ≤ 1.0σ',
    description: 'Approach zone (shorts within 0.5–1.0σ)',
    primaryAction: 'Consider rolling short put out/down for net credit or adding a cheap downside wing.',
    secondaryAction: 'Trim or roll short call if upside risk grows and thesis weakens.',
    riskNotes: 'Short risk is approaching; proactive adjustment preferred.',
  },
  {
    strategyType: 'LEAPS risk reversal with extra short call',
    stateCode: 'RR3',
    criteria: 'WorstShortSigma ≤ 0.5σ',
    description: 'Pressure zone (shorts within 0.5σ)',
    primaryAction: 'Prioritise downside risk: roll put down/out, define risk with long put, or reduce size.',
    secondaryAction: 'Consider taking some call profits if available to fund defenses.',
    riskNotes: 'Short put is "in the danger zone"; reactive delay is costly.',
  },
  {
    strategyType: 'LEAPS bull call spread',
    stateCode: 'BC1',
    criteria: 'PnlPctOfCost ≤ 0',
    description: 'Underwater or flat',
    primaryAction: 'Hold or consider adding separate defined-risk upside if thesis stronger than price.',
    secondaryAction: 'Consider converting to calendar/diagonal if IV regime shifts.',
    riskNotes: 'Spread not working yet; keep risk fixed and revisit thesis.',
  },
  {
    strategyType: 'LEAPS bull call spread',
    stateCode: 'BC2',
    criteria: '0 < PnlPctOfCost ≤ 1.0',
    description: 'Working, not maxed',
    primaryAction: 'Hold; consider diagonals (short nearer-dated OTMs) to harvest theta if IV high.',
    secondaryAction: 'Optionally scale some notional if conviction increases and risk budget allows.',
    riskNotes: 'Working but not maxed; don\'t be greedy, don\'t smother with overwrites.',
  },
  {
    strategyType: 'LEAPS bull call spread',
    stateCode: 'BC3',
    criteria: 'PnlPctOfCost > 1.0 (near max)',
    description: 'Big winner',
    primaryAction: 'Take profits or roll short strike up (widen spread) to extend upside; avoid greed.',
    secondaryAction: 'Stagger exits (partial close) rather than all-or-nothing.',
    riskNotes: 'Near max value; asymmetry now favours the house, not you.',
  },
  {
    strategyType: 'Short-dated combo (wings + short put)',
    stateCode: 'SD1',
    criteria: 'MaxDTE > 7 AND HasAssignmentRisk ≠ "Yes"',
    description: 'Normal monitoring',
    primaryAction: 'Manage as normal; watch DTE and sigma flags.',
    secondaryAction: 'Leave cheap far OTM wings alone.',
    riskNotes: 'Routine; main job is not overmanaging noise.',
  },
  {
    strategyType: 'Short-dated combo (wings + short put)',
    stateCode: 'SD2',
    criteria: 'MaxDTE ≤ 7 AND HasAssignmentRisk ≠ "Yes"',
    description: 'Near expiry',
    primaryAction: 'Decide: accept expiry vs closing for small residual value.',
    secondaryAction: 'Close legs with poor liquidity if they don\'t add much payoff.',
    riskNotes: 'Short time; risk moves faster, but extrinsic small.',
  },
  {
    strategyType: 'Short-dated combo (wings + short put)',
    stateCode: 'SD3',
    criteria: 'HasAssignmentRisk = "Yes"',
    description: 'Explicit assignment decision',
    primaryAction: 'Explicit call: accept assignment vs close/roll; do not ignore.',
    secondaryAction: 'Consider converting to defined-risk spread if keeping exposure.',
    riskNotes: 'Assignment is a *decision*, not an accident.',
  },
  {
    strategyType: 'Core stock exposure',
    stateCode: 'STK0',
    criteria: 'PnlPctOfCost < -0.2 (moderate loser)',
    description: 'Losing position worth review',
    primaryAction: 'Re-underwrite thesis: is this drawdown acceptable? Consider trimming, hedging, or setting a hard floor.',
    secondaryAction: 'Consider small collars or put spreads if you want to retain upside with defined risk.',
    riskNotes: 'Loser but not catastrophic; avoid anchoring and denial.',
  },
  {
    strategyType: 'Core stock exposure',
    stateCode: 'STK1',
    criteria: '-0.2 ≤ PnlPctOfCost ≤ 0.3 (flat-ish)',
    description: 'Small move / noise band',
    primaryAction: 'Hold; no option overlay unless IV high and conviction modest.',
    secondaryAction: 'Use time to refine thesis rather than trade.',
    riskNotes: '"Noise" zone; transaction costs can dominate.',
  },
  {
    strategyType: 'Core stock exposure',
    stateCode: 'STK2',
    criteria: '0.3 < PnlPctOfCost ≤ 1.0 (good winner)',
    description: 'Decent winner, candidate for trimming or overlays',
    primaryAction: 'Consider covered calls or partial de-risk; define where you\'d be happy to trim.',
    secondaryAction: 'Use trailing framework or staged profit-taking.',
    riskNotes: 'Respect gains but don\'t smother upside prematurely.',
  },
  {
    strategyType: 'Core stock exposure',
    stateCode: 'STK3',
    criteria: 'PnlPctOfCost > 1.0 OR PnlPctOfCost < -0.5 (big move)',
    description: 'Big Mover',
    primaryAction: 'Re-underwrite thesis: if favorable, bank some gains; if adverse, size check and risk limits.',
    secondaryAction: 'Consider rebasing the position size to new volatility regime.',
    riskNotes: 'Extreme outcomes; must be an active decision, not passive drift.',
  },
];

/**
 * Infer category from strategy type and state code
 */
function inferCategory(strategyType: string, stateCode: string): string {
  // Defense-related
  if (stateCode.includes('RR3') || stateCode.includes('SD3')) {
    return 'defense';
  }
  // Profit-related
  if (stateCode.includes('LC3') || stateCode.includes('BC3') || stateCode.includes('STK2') || stateCode.includes('STK3')) {
    return 'profit';
  }
  // Time-related
  if (stateCode.includes('LC4') || stateCode.includes('SD2')) {
    return 'time';
  }
  // Risk-related
  if (stateCode.includes('STK0') || stateCode.includes('STK3')) {
    return 'risk';
  }
  // Entry-related
  if (stateCode.includes('LC1') || stateCode.includes('BC1') || stateCode.includes('STK1')) {
    return 'entry';
  }
  // Default to meta
  return 'meta';
}

/**
 * Convert actions to checklist items JSON
 */
function createChecklistItems(
  primaryAction: string,
  secondaryAction: string,
  riskNotes: string
): Array<{ order: number; type: string; text: string }> {
  const items: Array<{ order: number; type: string; text: string }> = [];
  let order = 1;

  if (primaryAction && primaryAction.trim()) {
    items.push({ order: order++, type: 'primary', text: primaryAction.trim() });
  }
  if (secondaryAction && secondaryAction.trim()) {
    items.push({ order: order++, type: 'secondary', text: secondaryAction.trim() });
  }
  if (riskNotes && riskNotes.trim()) {
    items.push({ order: order++, type: 'risk', text: riskNotes.trim() });
  }

  return items;
}

async function seedPlaybookItems() {
  console.log('Seeding playbook items...');

  let inserted = 0;
  let updated = 0;

  for (const row of playbookData) {
    const category = inferCategory(row.strategyType, row.stateCode);
    const checklistItems = createChecklistItems(
      row.primaryAction,
      row.secondaryAction,
      row.riskNotes
    );

    const playbookItem: NewPlaybookItem = {
      code: row.stateCode,
      label: row.description,
      description: row.description, // Can be expanded later
      category,
      strategyType: row.strategyType,
      criteria: row.criteria,
      appliesToContext: 'strategy',
      checklistItems: checklistItems.length > 0 ? checklistItems : null,
      isActive: true,
    };

    // Check if exists
    const existing = await db
      .select()
      .from(playbookItems)
      .where(eq(playbookItems.code, row.stateCode))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(playbookItems)
        .set({
          ...playbookItem,
          updatedAt: new Date(),
        })
        .where(eq(playbookItems.code, row.stateCode));
      updated++;
      console.log(`Updated: ${row.stateCode} - ${row.description}`);
    } else {
      // Insert new
      await db.insert(playbookItems).values(playbookItem);
      inserted++;
      console.log(`Inserted: ${row.stateCode} - ${row.description}`);
    }
  }

  console.log(`\nSeeding complete: ${inserted} inserted, ${updated} updated`);
}

// Run if called directly
if (require.main === module) {
  seedPlaybookItems()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error seeding playbook items:', error);
      process.exit(1);
    });
}

export { seedPlaybookItems };

