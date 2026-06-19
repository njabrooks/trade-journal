#!/usr/bin/env tsx
/**
 * Link an asset thesis to a macro thesis (framing) — C5a / docs/v2/09 §7.
 *
 * The thesis-review framing mode calls this for a high-confidence `related` match
 * (auto-link, no decision per §12 #4). For `gated_by` or an uncertain match it raises
 * a classify_macro_link decision instead (resolved later via resolve-decision).
 *
 * Usage:
 *   npx tsx scripts/ops/link-asset-macro.ts --asset-id <uuid> --macro-id <uuid> [--type related|gated_by] [--note "..."] [--by user]
 */
import { closeDb } from '../lib/db.js';
import { linkAssetMacro, type Relationship } from '../lib/linkAssetMacro.js';

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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const assetThesisId = a.assetid as string;
  const macroThesisId = a.macroid as string;
  if (!assetThesisId || !macroThesisId) {
    console.error('Required: --asset-id <uuid> --macro-id <uuid>');
    process.exit(1);
  }
  const relationshipType = (a.type as Relationship) || 'related';
  if (relationshipType !== 'related' && relationshipType !== 'gated_by') {
    console.error("--type must be 'related' or 'gated_by'");
    process.exit(1);
  }
  const result = await linkAssetMacro({
    assetThesisId,
    macroThesisId,
    relationshipType,
    note: a.note as string | undefined,
    addedBy: (a.by as string) || 'automation',
  });
  console.log(JSON.stringify({ linked: true, ...result }, null, 2));
  await closeDb();
  process.exit(0);
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
