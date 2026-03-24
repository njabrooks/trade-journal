import { db } from '@/db';
import {
  macroTheses,
  assetTheses,
  assetThesisRelatedMacroTheses,
  claimThesisMappings,
  mainClaims,
  signalEntityLinks,
  signals,
  strategies,
  claimSignalEvidences,
  underlyings,
} from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export interface EntityRelationship {
  entityType: 'macro_thesis' | 'asset_thesis' | 'claim' | 'signal' | 'strategy';
  id: string;
  title: string;
  status?: string;
  relationshipType?: string; // 'supports' | 'refutes' | 'foundation' | 'confirmation' | 'invalidation' | 'completion' | 'linked'
  direction?: string; // for theses: bullish/bearish
}

export async function getRelationshipsForEntity(
  entityType: 'macro_thesis' | 'asset_thesis' | 'claim' | 'signal' | 'strategy',
  entityId: string,
): Promise<EntityRelationship[]> {
  switch (entityType) {
    case 'macro_thesis':
      return getRelationshipsForMacroThesis(entityId);
    case 'asset_thesis':
      return getRelationshipsForAssetThesis(entityId);
    case 'claim':
      return getRelationshipsForClaim(entityId);
    case 'signal':
      return getRelationshipsForSignal(entityId);
    case 'strategy':
      return getRelationshipsForStrategy(entityId);
    default:
      return [];
  }
}

async function getRelationshipsForMacroThesis(entityId: string): Promise<EntityRelationship[]> {
  const results: EntityRelationship[] = [];

  // Linked asset theses (via junction table)
  const linkedAssetTheses = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      status: assetTheses.status,
      direction: assetTheses.direction,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(assetTheses, eq(assetThesisRelatedMacroTheses.assetThesisId, assetTheses.id))
    .where(eq(assetThesisRelatedMacroTheses.macroThesisId, entityId));

  for (const at of linkedAssetTheses) {
    results.push({
      entityType: 'asset_thesis',
      id: at.id,
      title: at.title,
      status: at.status,
      relationshipType: 'linked',
      direction: at.direction ?? undefined,
    });
  }

  // Linked claims (via claim_thesis_mappings)
  const linkedClaims = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      status: mainClaims.status,
      mappingType: claimThesisMappings.mappingType,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
    .where(eq(claimThesisMappings.macroThesisId, entityId));

  for (const claim of linkedClaims) {
    results.push({
      entityType: 'claim',
      id: claim.id,
      title: claim.title,
      status: claim.status,
      relationshipType: claim.mappingType ?? 'linked',
    });
  }

  // Linked signals (via signal_entity_links where thesis_id = entityId and thesis_type = 'macro')
  const linkedSignals = await db
    .select({
      id: signals.id,
      statement: signals.statement,
      status: signals.status,
      type: signals.type,
    })
    .from(signalEntityLinks)
    .innerJoin(signals, eq(signalEntityLinks.signalId, signals.id))
    .where(
      and(
        eq(signalEntityLinks.thesisId, entityId),
        eq(signalEntityLinks.thesisType, 'macro'),
      )
    );

  for (const signal of linkedSignals) {
    results.push({
      entityType: 'signal',
      id: signal.id,
      title: signal.statement,
      status: signal.status,
      relationshipType: signal.type ?? 'linked',
    });
  }

  // Linked strategies (via asset theses → strategies.asset_thesis_id)
  const assetThesisIds = linkedAssetTheses.map((at) => at.id);
  if (assetThesisIds.length > 0) {
    const linkedStrategies = await db
      .select({
        id: strategies.id,
        label: strategies.autoDerivedLabel,
        strategyKey: strategies.strategyKey,
        status: strategies.status,
        direction: strategies.direction,
      })
      .from(strategies)
      .where(inArray(strategies.assetThesisId, assetThesisIds));

    const seen = new Set<string>();
    for (const strat of linkedStrategies) {
      if (seen.has(strat.id)) continue;
      seen.add(strat.id);
      results.push({
        entityType: 'strategy',
        id: strat.id,
        title: strat.label ?? strat.strategyKey,
        status: strat.status,
        relationshipType: 'linked',
        direction: strat.direction ?? undefined,
      });
    }
  }

  return results;
}

async function getRelationshipsForAssetThesis(entityId: string): Promise<EntityRelationship[]> {
  const results: EntityRelationship[] = [];

  // Linked macro theses (via junction table)
  const linkedMacroTheses = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      status: macroTheses.status,
      direction: macroTheses.direction,
    })
    .from(assetThesisRelatedMacroTheses)
    .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
    .where(eq(assetThesisRelatedMacroTheses.assetThesisId, entityId));

  for (const mt of linkedMacroTheses) {
    results.push({
      entityType: 'macro_thesis',
      id: mt.id,
      title: mt.title,
      status: mt.status,
      relationshipType: 'linked',
      direction: mt.direction ?? undefined,
    });
  }

  // Linked claims (via claim_thesis_mappings)
  const linkedClaims = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      status: mainClaims.status,
      mappingType: claimThesisMappings.mappingType,
    })
    .from(claimThesisMappings)
    .innerJoin(mainClaims, eq(claimThesisMappings.mainClaimId, mainClaims.id))
    .where(eq(claimThesisMappings.assetThesisId, entityId));

  for (const claim of linkedClaims) {
    results.push({
      entityType: 'claim',
      id: claim.id,
      title: claim.title,
      status: claim.status,
      relationshipType: claim.mappingType ?? 'linked',
    });
  }

  // Linked signals (via signal_entity_links where thesis_id = entityId and thesis_type = 'asset')
  const linkedSignals = await db
    .select({
      id: signals.id,
      statement: signals.statement,
      status: signals.status,
      type: signals.type,
    })
    .from(signalEntityLinks)
    .innerJoin(signals, eq(signalEntityLinks.signalId, signals.id))
    .where(
      and(
        eq(signalEntityLinks.thesisId, entityId),
        eq(signalEntityLinks.thesisType, 'asset'),
      )
    );

  for (const signal of linkedSignals) {
    results.push({
      entityType: 'signal',
      id: signal.id,
      title: signal.statement,
      status: signal.status,
      relationshipType: signal.type ?? 'linked',
    });
  }

  // Linked strategies (via strategies.asset_thesis_id)
  const linkedStrategies = await db
    .select({
      id: strategies.id,
      label: strategies.autoDerivedLabel,
      strategyKey: strategies.strategyKey,
      status: strategies.status,
      direction: strategies.direction,
    })
    .from(strategies)
    .where(eq(strategies.assetThesisId, entityId));

  for (const strat of linkedStrategies) {
    results.push({
      entityType: 'strategy',
      id: strat.id,
      title: strat.label ?? strat.strategyKey,
      status: strat.status,
      relationshipType: 'linked',
      direction: strat.direction ?? undefined,
    });
  }

  return results;
}

async function getRelationshipsForClaim(entityId: string): Promise<EntityRelationship[]> {
  const results: EntityRelationship[] = [];

  // Linked macro theses (via claim_thesis_mappings.macro_thesis_id)
  const linkedMacroTheses = await db
    .select({
      id: macroTheses.id,
      title: macroTheses.title,
      status: macroTheses.status,
      direction: macroTheses.direction,
      mappingType: claimThesisMappings.mappingType,
    })
    .from(claimThesisMappings)
    .innerJoin(macroTheses, eq(claimThesisMappings.macroThesisId, macroTheses.id))
    .where(eq(claimThesisMappings.mainClaimId, entityId));

  for (const mt of linkedMacroTheses) {
    results.push({
      entityType: 'macro_thesis',
      id: mt.id,
      title: mt.title,
      status: mt.status,
      relationshipType: mt.mappingType ?? 'linked',
      direction: mt.direction ?? undefined,
    });
  }

  // Linked asset theses (via claim_thesis_mappings.asset_thesis_id)
  const linkedAssetTheses = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      status: assetTheses.status,
      direction: assetTheses.direction,
      mappingType: claimThesisMappings.mappingType,
    })
    .from(claimThesisMappings)
    .innerJoin(assetTheses, eq(claimThesisMappings.assetThesisId, assetTheses.id))
    .where(eq(claimThesisMappings.mainClaimId, entityId));

  for (const at of linkedAssetTheses) {
    results.push({
      entityType: 'asset_thesis',
      id: at.id,
      title: at.title,
      status: at.status,
      relationshipType: at.mappingType ?? 'linked',
      direction: at.direction ?? undefined,
    });
  }

  // Linked signals (via claim_signal_evidences.signal_id where claim_id = entityId)
  const linkedSignals = await db
    .select({
      id: signals.id,
      statement: signals.statement,
      status: signals.status,
      type: signals.type,
    })
    .from(claimSignalEvidences)
    .innerJoin(signals, eq(claimSignalEvidences.signalId, signals.id))
    .where(eq(claimSignalEvidences.claimId, entityId));

  for (const signal of linkedSignals) {
    results.push({
      entityType: 'signal',
      id: signal.id,
      title: signal.statement,
      status: signal.status,
      relationshipType: signal.type ?? 'linked',
    });
  }

  return results;
}

async function getRelationshipsForSignal(entityId: string): Promise<EntityRelationship[]> {
  const results: EntityRelationship[] = [];

  // Linked theses and strategies (via signal_entity_links)
  const entityLinks = await db
    .select({
      entityType: signalEntityLinks.entityType,
      thesisId: signalEntityLinks.thesisId,
      thesisType: signalEntityLinks.thesisType,
      strategyId: signalEntityLinks.strategyId,
    })
    .from(signalEntityLinks)
    .where(eq(signalEntityLinks.signalId, entityId));

  const macroThesisIds: string[] = [];
  const assetThesisIds: string[] = [];
  const strategyIds: string[] = [];

  for (const link of entityLinks) {
    if (link.entityType === 'thesis' && link.thesisId) {
      if (link.thesisType === 'macro') {
        macroThesisIds.push(link.thesisId);
      } else if (link.thesisType === 'asset') {
        assetThesisIds.push(link.thesisId);
      }
    } else if (link.entityType === 'strategy' && link.strategyId) {
      strategyIds.push(link.strategyId);
    }
  }

  if (macroThesisIds.length > 0) {
    const macros = await db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        direction: macroTheses.direction,
      })
      .from(macroTheses)
      .where(inArray(macroTheses.id, macroThesisIds));

    for (const mt of macros) {
      results.push({
        entityType: 'macro_thesis',
        id: mt.id,
        title: mt.title,
        status: mt.status,
        relationshipType: 'linked',
        direction: mt.direction ?? undefined,
      });
    }
  }

  if (assetThesisIds.length > 0) {
    const assets = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        status: assetTheses.status,
        direction: assetTheses.direction,
      })
      .from(assetTheses)
      .where(inArray(assetTheses.id, assetThesisIds));

    for (const at of assets) {
      results.push({
        entityType: 'asset_thesis',
        id: at.id,
        title: at.title,
        status: at.status,
        relationshipType: 'linked',
        direction: at.direction ?? undefined,
      });
    }
  }

  if (strategyIds.length > 0) {
    const strats = await db
      .select({
        id: strategies.id,
        label: strategies.autoDerivedLabel,
        strategyKey: strategies.strategyKey,
        status: strategies.status,
        direction: strategies.direction,
      })
      .from(strategies)
      .where(inArray(strategies.id, strategyIds));

    for (const strat of strats) {
      results.push({
        entityType: 'strategy',
        id: strat.id,
        title: strat.label ?? strat.strategyKey,
        status: strat.status,
        relationshipType: 'linked',
        direction: strat.direction ?? undefined,
      });
    }
  }

  // Linked claims (via claim_signal_evidences.claim_id where signal_id = entityId)
  const linkedClaims = await db
    .select({
      id: mainClaims.id,
      title: mainClaims.title,
      status: mainClaims.status,
    })
    .from(claimSignalEvidences)
    .innerJoin(mainClaims, eq(claimSignalEvidences.claimId, mainClaims.id))
    .where(eq(claimSignalEvidences.signalId, entityId));

  for (const claim of linkedClaims) {
    results.push({
      entityType: 'claim',
      id: claim.id,
      title: claim.title,
      status: claim.status,
      relationshipType: 'linked',
    });
  }

  return results;
}

async function getRelationshipsForStrategy(entityId: string): Promise<EntityRelationship[]> {
  const results: EntityRelationship[] = [];

  // Get the strategy to find its asset_thesis_id
  const strategyRows = await db
    .select({
      assetThesisId: strategies.assetThesisId,
    })
    .from(strategies)
    .where(eq(strategies.id, entityId))
    .limit(1);

  const strategy = strategyRows[0];
  if (!strategy) return results;

  // Linked asset thesis (via strategies.asset_thesis_id)
  if (strategy.assetThesisId) {
    const atRows = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        status: assetTheses.status,
        direction: assetTheses.direction,
      })
      .from(assetTheses)
      .where(eq(assetTheses.id, strategy.assetThesisId))
      .limit(1);

    const at = atRows[0];
    if (at) {
      results.push({
        entityType: 'asset_thesis',
        id: at.id,
        title: at.title,
        status: at.status,
        relationshipType: 'linked',
        direction: at.direction ?? undefined,
      });

      // Linked macro theses (via asset thesis → junction table)
      const linkedMacroTheses = await db
        .select({
          id: macroTheses.id,
          title: macroTheses.title,
          status: macroTheses.status,
          direction: macroTheses.direction,
        })
        .from(assetThesisRelatedMacroTheses)
        .innerJoin(macroTheses, eq(assetThesisRelatedMacroTheses.macroThesisId, macroTheses.id))
        .where(eq(assetThesisRelatedMacroTheses.assetThesisId, strategy.assetThesisId));

      for (const mt of linkedMacroTheses) {
        results.push({
          entityType: 'macro_thesis',
          id: mt.id,
          title: mt.title,
          status: mt.status,
          relationshipType: 'linked',
          direction: mt.direction ?? undefined,
        });
      }
    }
  }

  // Linked signals (via signal_entity_links.strategy_id = entityId)
  const linkedSignals = await db
    .select({
      id: signals.id,
      statement: signals.statement,
      status: signals.status,
      type: signals.type,
    })
    .from(signalEntityLinks)
    .innerJoin(signals, eq(signalEntityLinks.signalId, signals.id))
    .where(eq(signalEntityLinks.strategyId, entityId));

  for (const signal of linkedSignals) {
    results.push({
      entityType: 'signal',
      id: signal.id,
      title: signal.statement,
      status: signal.status,
      relationshipType: signal.type ?? 'linked',
    });
  }

  return results;
}
