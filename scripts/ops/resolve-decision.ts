#!/usr/bin/env tsx
/**
 * Resolve a Decision Item (docs/v2/09 §8.3–§8.4) — the agent path that closes a
 * decision and captures the judgment back into the graph.
 *
 * INTERACTIVE-ONLY AUTHORITY: every close requires an explicit `--by user`. Missing
 * or agent-authored judgment is refused before the Decision Item is read or mutated.
 *
 * GENERIC CLOSE (any decision_type): set status (resolved|dismissed), record a
 * resolution into the packet (action_taken/chosen_by/at/notes/writes), and journal a
 * 'decision_resolved' audit entry.
 *
 * BUILT-IN MECHANICAL WRITES — safe, self-contained FK/junction writes that have no
 * other canonical setter — for five decision_types:
 *   - classify_macro_link / frame_asset_under_macro → asset_thesis_related_macro_theses
 *   - link_strategy_to_thesis                       → strategies.asset_thesis_id
 *   - resolve_proxy_underlying                       → underlyings.parent_underlying_id
 *   - confirm_claim_link (sever)                     → claim_thesis_mappings
 *   - cluster_claims_to_thesis (create_macro)        → asset_thesis_related_macro_theses
 *       (member-asset links for a just-created emergent macro; the macro itself is made by
 *        the agent via create-macro-thesis, then its id passed in --macro-id)
 *
 * Everything else (develop_thin_thesis, run_deep_dive, review_refuting_claim,
 * weakening_signal_action, classify_exposure)
 * is DELEGATED: the agent does the real write in the relevant skill — and STATUS changes
 * go through scripts/ops/update-entity-status.ts (the validated transition path) — then
 * calls this with --action + --writes to close + record. This script never reimplements a
 * skill nor bypasses status-transition validation.
 *
 * Usage:
 *   npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action set_gated_by --macro-id <uuid>
 *   npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action dismiss
 *   npx tsx scripts/ops/resolve-decision.ts --id <decisionId> --action acknowledge \
 *     --notes "downgraded confidence via update-entity-status" \
 *     --writes '[{"table":"asset_theses","op":"update","ids":["<id>"]}]'
 *   ... --dry-run
 */
import { db, closeDb, schema, logToJournal } from '../lib/db.js';
import { and, eq } from 'drizzle-orm';
import { getDecisionPacket, type DecisionResolution, type DecisionPacket } from '@/lib/types/decisions';
import { linkAssetMacro, unlinkAssetMacro } from '../lib/linkAssetMacro.js';
import { assertExplicitUserJudgment } from '../lib/decisionResolutionAuthority.js';

const { journalEntries, strategies, underlyings, mainClaims, claimThesisMappings } = schema;

type GraphWrite = { table: string; op: 'insert' | 'update' | 'delete'; ids: string[] };

interface Input {
  id: string;
  action: string;
  notes?: string;
  by?: 'user' | 'agent';
  status?: 'resolved' | 'dismissed';
  writes?: GraphWrite[];
  // built-in handler payloads
  macroId?: string;
  assetId?: string;
  strategyId?: string;
  thesisId?: string;
  underlyingId?: string;
  parentId?: string;
  dryRun?: boolean;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2).replace(/-/g, '');
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { a[k] = n; i++; } else { a[k] = true; }
    }
  }
  return a;
}

async function readInput(): Promise<Input> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  if (argv.includes('--stdin')) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Input;
    return { ...parsed, dryRun: parsed.dryRun ?? dryRun };
  }
  const a = parseArgs(argv);
  return {
    id: a.id as string,
    action: a.action as string,
    notes: a.notes as string | undefined,
    by: a.by as Input['by'],
    status: a.status as Input['status'],
    writes: a.writes ? (JSON.parse(a.writes as string) as GraphWrite[]) : undefined,
    macroId: a.macroid as string | undefined,
    assetId: a.assetid as string | undefined,
    strategyId: a.strategyid as string | undefined,
    thesisId: a.thesisid as string | undefined,
    underlyingId: a.underlyingid as string | undefined,
    parentId: a.parentid as string | undefined,
    dryRun,
  };
}

function relatedId(packet: DecisionPacket | null, type: string): string | undefined {
  return packet?.related_objects?.find((o) => o.type === type)?.id;
}

interface DecisionRow {
  objectType: string;
  objectId: string;
  metadata: unknown;
  status: string | null;
}

/**
 * Run the built-in mechanical write for the decision_type, if any. Returns the writes
 * performed (empty array for delegated types / no-op actions). DRY-RUN-aware: never
 * mutates when dryRun is set — only describes the writes it would make.
 */
async function runHandler(
  row: DecisionRow,
  packet: DecisionPacket | null,
  input: Input
): Promise<GraphWrite[]> {
  const type = packet?.decision_type;
  const action = input.action;

  if (type === 'classify_macro_link' || type === 'frame_asset_under_macro') {
    const assetThesisId = input.assetId
      ?? (row.objectType === 'asset_thesis' ? row.objectId : undefined)
      ?? relatedId(packet, 'asset_thesis');
    const macroThesisId = input.macroId ?? relatedId(packet, 'macro_thesis');
    if (action === 'stand_alone' || action === 'none' || action === 'keep_in_tana') return [];
    if (!assetThesisId || !macroThesisId) {
      throw new Error('framing needs assetThesisId (primary object or --asset-id) and macroThesisId (--macro-id or a related macro_thesis)');
    }
    if (action === 'unlink') {
      if (!input.dryRun) await unlinkAssetMacro(assetThesisId, macroThesisId);
      return [{ table: 'asset_thesis_related_macro_theses', op: 'delete', ids: [assetThesisId, macroThesisId] }];
    }
    const relationshipType = action === 'set_gated_by' ? 'gated_by' : 'related';
    if (!input.dryRun) {
      await linkAssetMacro({ assetThesisId, macroThesisId, relationshipType, addedBy: input.by === 'user' ? 'user' : 'automation' });
    }
    return [{ table: 'asset_thesis_related_macro_theses', op: 'insert', ids: [assetThesisId, macroThesisId] }];
  }

  if (type === 'link_strategy_to_thesis' && action === 'link') {
    const strategyId = input.strategyId ?? (row.objectType === 'strategy' ? row.objectId : undefined);
    const thesisId = input.thesisId ?? relatedId(packet, 'asset_thesis');
    if (!strategyId || !thesisId) throw new Error('link_strategy_to_thesis needs strategyId (primary or --strategy-id) and --thesis-id (asset)');
    if (!input.dryRun) {
      await db.update(strategies).set({ assetThesisId: thesisId }).where(eq(strategies.id, strategyId));
    }
    return [{ table: 'strategies', op: 'update', ids: [strategyId] }];
  }

  if (type === 'resolve_proxy_underlying' && action === 'map') {
    const underlyingId = input.underlyingId ?? relatedId(packet, 'underlying');
    if (!underlyingId || !input.parentId) throw new Error('resolve_proxy_underlying needs --underlying-id (or a related underlying) and --parent-id');
    if (!input.dryRun) {
      await db.update(underlyings).set({ parentUnderlyingId: input.parentId }).where(eq(underlyings.id, underlyingId));
    }
    return [{ table: 'underlyings', op: 'update', ids: [underlyingId] }];
  }

  if (type === 'confirm_claim_link' && action === 'sever') {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const evidence = packet?.evidence_context ?? {};
    const insightId =
      (typeof meta.insightId === 'string' ? meta.insightId : undefined) ??
      (typeof evidence.insightId === 'string' ? evidence.insightId : undefined);
    const sourceClaimId =
      (typeof meta.sourceClaimId === 'string' ? meta.sourceClaimId : undefined) ??
      (typeof evidence.sourceClaimId === 'string' ? evidence.sourceClaimId : undefined);
    if (!insightId || !sourceClaimId) {
      throw new Error('confirm_claim_link/sever needs metadata.insightId and metadata.sourceClaimId');
    }
    if (row.objectType !== 'macro_thesis' && row.objectType !== 'asset_thesis') {
      throw new Error('confirm_claim_link/sever primary object must be a macro_thesis or asset_thesis');
    }

    const [claim] = await db
      .select({ id: mainClaims.id })
      .from(mainClaims)
      .where(and(eq(mainClaims.sourceInsightId, insightId), eq(mainClaims.sourceClaimId, sourceClaimId)))
      .limit(1);
    if (!claim) {
      throw new Error(`No main_claims row found for insight/source claim ${insightId}/${sourceClaimId}`);
    }

    const thesisFilter = row.objectType === 'macro_thesis'
      ? eq(claimThesisMappings.macroThesisId, row.objectId)
      : eq(claimThesisMappings.assetThesisId, row.objectId);
    const [mapping] = await db
      .select({ id: claimThesisMappings.id })
      .from(claimThesisMappings)
      .where(and(eq(claimThesisMappings.mainClaimId, claim.id), thesisFilter))
      .limit(1);
    if (!mapping) {
      throw new Error(`No claim_thesis_mappings row found for claim ${claim.id} and ${row.objectType} ${row.objectId}`);
    }

    if (!input.dryRun) {
      await db.delete(claimThesisMappings).where(eq(claimThesisMappings.id, mapping.id));
    }
    return [{ table: 'claim_thesis_mappings', op: 'delete', ids: [mapping.id] }];
  }

  if (type === 'cluster_claims_to_thesis' && action === 'create_macro') {
    // Emergent macro accepted (docs/v2/13 §1c step 3): the agent created the macro via
    // create-macro-thesis and passes its id; link every member asset thesis from the packet
    // to it (the cascade promotes status from there). Members live in
    // evidence_context.memberAssetThesisIds (fallback: related asset_thesis objects).
    const macroId = input.macroId;
    if (!macroId) throw new Error('cluster_claims_to_thesis/create_macro needs --macro-id (the created macro)');
    const members =
      (packet?.evidence_context?.memberAssetThesisIds as string[] | undefined) ??
      (packet?.related_objects?.filter((o) => o.type === 'asset_thesis').map((o) => o.id) ?? []);
    if (!input.dryRun) {
      for (const assetId of members) {
        await linkAssetMacro({ assetThesisId: assetId, macroThesisId: macroId, relationshipType: 'related', addedBy: input.by === 'user' ? 'user' : 'automation' });
      }
    }
    return [{ table: 'asset_thesis_related_macro_theses', op: 'insert', ids: [macroId, ...members] }];
  }

  // Delegated / no-op action — the agent did (or will do) the write in a skill.
  return [];
}

async function main() {
  const input = await readInput();
  if (!input.id || !input.action) {
    console.error('Required: --id <decisionId> --action <actionKey> (use --action dismiss to dismiss)');
    process.exit(1);
  }
  assertExplicitUserJudgment(input);

  const rows = await db
    .select({
      objectType: journalEntries.objectType,
      objectId: journalEntries.objectId,
      metadata: journalEntries.metadata,
      status: journalEntries.status,
    })
    .from(journalEntries)
    .where(and(eq(journalEntries.id, input.id), eq(journalEntries.actionType, 'decision_required')))
    .limit(1);

  if (rows.length === 0) {
    console.error(`No decision_required journal entry with id ${input.id}`);
    process.exit(1);
  }
  const row = rows[0] as DecisionRow;
  const packet = getDecisionPacket(row.metadata);

  const status: 'resolved' | 'dismissed' =
    input.status ?? (input.action === 'dismiss' ? 'dismissed' : 'resolved');

  // Mechanical write (if this type/action has a built-in handler), or [] when delegated.
  const handlerWrites = await runHandler(row, packet, input);
  const writes = [...handlerWrites, ...(input.writes ?? [])];

  const resolution: DecisionResolution = {
    action_taken: input.action,
    chosen_by: input.by,
    at: new Date().toISOString(),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(writes.length ? { writes } : {}),
  };

  if (input.dryRun) {
    console.log(JSON.stringify({ dryRun: true, id: input.id, decisionType: packet?.decision_type ?? null, status, resolution }, null, 2));
    await closeDb();
    process.exit(0);
  }

  // RMW the metadata so packet rows and legacy bare rows both record the resolution.
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const hasPacket = !!meta.decision && typeof meta.decision === 'object';
  const target = (hasPacket ? meta.decision : meta) as Record<string, unknown>;
  target.resolution = resolution;

  await db.update(journalEntries)
    .set({ status, metadata: meta })
    .where(eq(journalEntries.id, input.id));

  // Audit entry for the resolution itself.
  await logToJournal({
    objectType: row.objectType,
    objectId: row.objectId,
    actionType: 'decision_resolved',
    actionDescription: `Decision ${status}: ${input.action}${writes.length ? ` (${writes.length} write${writes.length > 1 ? 's' : ''})` : ''}`,
    rationale: input.notes,
    source: input.by === 'user' ? 'user' : 'automation',
    metadata: { decisionType: packet?.decision_type ?? null, writes },
  });

  console.log(JSON.stringify({ resolved: true, id: input.id, status, decisionType: packet?.decision_type ?? null, writes }, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
