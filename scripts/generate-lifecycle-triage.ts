/**
 * Generate Lifecycle Triage Records
 *
 * Scans all macro and asset theses and creates triage records
 * for any thesis that needs action based on its lifecycle stage.
 *
 * This provides visibility into the lifecycle state of every thesis
 * and ensures nothing falls through the cracks.
 *
 * Usage:
 *   npx tsx scripts/generate-lifecycle-triage.ts
 *   npx tsx scripts/generate-lifecycle-triage.ts --dry-run
 */

import 'dotenv/config';
import { db, closeDb, schema } from './lib/db.js';
import { eq, ne, and, inArray } from 'drizzle-orm';

const { macroTheses, assetTheses, thesisTriageRecords } = schema;

// Lifecycle stage configuration
const LIFECYCLE_CONFIG: Record<string, {
  actionRequired: string;
  suggestedSkill: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  triggerType: string;
}> = {
  created: {
    actionRequired: 'Thesis needs claims linked from research artifacts',
    suggestedSkill: null, // Manual action - link claims via UI
    severity: 'medium',
    triggerType: 'lifecycle_transition',
  },
  claims_linked: {
    actionRequired: 'Thesis has sufficient claims and is ready for synthesis',
    suggestedSkill: '/build-core-argument',
    severity: 'medium',
    triggerType: 'lifecycle_transition',
  },
  synthesized: {
    actionRequired: 'Thesis needs validation and invalidation points extracted',
    suggestedSkill: '/build-core-argument',
    severity: 'medium',
    triggerType: 'lifecycle_transition',
  },
  validated: {
    actionRequired: 'Thesis is ready for monitoring configuration',
    suggestedSkill: null, // Manual action - configure monitoring
    severity: 'low',
    triggerType: 'lifecycle_transition',
  },
  // 'monitoring' - handled by daily-thesis-monitoring.ts
  // 'closed' - no action needed
};

interface ThesisInfo {
  id: string;
  title: string;
  type: 'macro' | 'asset';
  lifecycleStatus: string | null;
}

async function getExistingActiveTriageIds(): Promise<Set<string>> {
  const existing = await db
    .select({ thesisId: thesisTriageRecords.thesisId })
    .from(thesisTriageRecords)
    .where(
      and(
        ne(thesisTriageRecords.status, 'complete'),
        ne(thesisTriageRecords.status, 'dismissed'),
        ne(thesisTriageRecords.status, 'actioned')
      )
    );

  return new Set(existing.map(r => r.thesisId));
}

async function getAllTheses(): Promise<ThesisInfo[]> {
  const [macros, assets] = await Promise.all([
    db.select({
      id: macroTheses.id,
      title: macroTheses.title,
      lifecycleStatus: macroTheses.lifecycleStatus,
    }).from(macroTheses),
    db.select({
      id: assetTheses.id,
      title: assetTheses.title,
      lifecycleStatus: assetTheses.lifecycleStatus,
    }).from(assetTheses),
  ]);

  return [
    ...macros.map(t => ({ ...t, type: 'macro' as const })),
    ...assets.map(t => ({ ...t, type: 'asset' as const })),
  ];
}

// Map severity to status (they're merged in thesis triage)
function severityToStatus(severity: string): 'urgent' | 'attention' | 'info' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'urgent';
    case 'medium':
      return 'attention';
    case 'low':
    case 'info':
    default:
      return 'info';
  }
}

async function createTriageRecord(thesis: ThesisInfo, config: typeof LIFECYCLE_CONFIG[string]): Promise<string | null> {
  try {
    const status = severityToStatus(config.severity);
    const [record] = await db.insert(thesisTriageRecords).values({
      thesisId: thesis.id,
      thesisType: thesis.type,
      thesisTitle: thesis.title,
      triggerType: config.triggerType,
      triggerSource: 'lifecycle_check',
      severity: config.severity,
      status,  // Aligned with lifecycle triggers: status = severity level
      lifecycleStage: thesis.lifecycleStatus,
      suggestedSkill: config.suggestedSkill,
      actionRequired: config.actionRequired,
      contentSummary: {},
      aiAnalysis: {},
      matchedResults: [],
    }).returning({ id: thesisTriageRecords.id });

    return record.id;
  } catch (error) {
    console.error(`Error creating triage record for ${thesis.title}:`, error);
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n📊 Lifecycle Triage Generator');
  console.log('============================================================\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No records will be created\n');
  }

  // Get all theses
  const theses = await getAllTheses();
  console.log(`Found ${theses.length} theses (${theses.filter(t => t.type === 'macro').length} macro, ${theses.filter(t => t.type === 'asset').length} asset)\n`);

  // Get existing active triage records (not complete/dismissed/actioned)
  const existingActiveIds = await getExistingActiveTriageIds();
  console.log(`Existing active triage records: ${existingActiveIds.size}\n`);

  // Group theses by lifecycle stage
  const byStage: Record<string, ThesisInfo[]> = {};
  for (const thesis of theses) {
    const stage = thesis.lifecycleStatus || 'created';
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push(thesis);
  }

  console.log('📈 Theses by Lifecycle Stage:');
  console.log('----------------------------------------');
  for (const [stage, items] of Object.entries(byStage).sort()) {
    const needsAction = LIFECYCLE_CONFIG[stage] ? '⚡' : (stage === 'monitoring' ? '👁️' : '✅');
    console.log(`  ${needsAction} ${stage}: ${items.length} theses`);
    for (const thesis of items) {
      const hasPending = existingActiveIds.has(thesis.id);
      const marker = hasPending ? '📋' : '  ';
      console.log(`     ${marker} ${thesis.title} (${thesis.type})${hasPending ? ' [has pending triage]' : ''}`);
    }
  }
  console.log();

  // Create triage records for theses that need action
  const stats = { created: 0, skipped: 0, errors: 0 };
  const toCreate: { thesis: ThesisInfo; config: typeof LIFECYCLE_CONFIG[string] }[] = [];

  for (const thesis of theses) {
    const stage = thesis.lifecycleStatus || 'created';
    const config = LIFECYCLE_CONFIG[stage];

    // Skip if no action needed for this stage
    if (!config) continue;

    // Skip if already has pending triage
    if (existingActiveIds.has(thesis.id)) {
      stats.skipped++;
      continue;
    }

    toCreate.push({ thesis, config });
  }

  if (toCreate.length === 0) {
    console.log('✅ All theses have appropriate triage records or are in terminal stages\n');
  } else {
    console.log(`📝 Creating ${toCreate.length} triage records:\n`);

    for (const { thesis, config } of toCreate) {
      const stage = thesis.lifecycleStatus || 'created';
      console.log(`  • ${thesis.title} (${thesis.type})`);
      console.log(`    Stage: ${stage}`);
      console.log(`    Action: ${config.actionRequired}`);
      if (config.suggestedSkill) {
        console.log(`    Skill: ${config.suggestedSkill}`);
      }

      if (!dryRun) {
        const id = await createTriageRecord(thesis, config);
        if (id) {
          console.log(`    ✅ Created: ${id.substring(0, 8)}...`);
          stats.created++;
        } else {
          console.log(`    ❌ Failed to create`);
          stats.errors++;
        }
      } else {
        console.log(`    [would create]`);
        stats.created++;
      }
      console.log();
    }
  }

  console.log('============================================================');
  console.log('📊 SUMMARY');
  console.log('============================================================');
  console.log(`  Total theses: ${theses.length}`);
  console.log(`  Triage records created: ${stats.created}`);
  console.log(`  Skipped (already has pending): ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log();

  await closeDb();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
