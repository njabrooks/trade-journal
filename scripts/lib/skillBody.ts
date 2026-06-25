/**
 * Shared SKILL.md frontmatter handling for the Codex skill mirror.
 *
 * Used by BOTH scripts/ops/generate-agents-mirror.ts (writes .agents/skills/<n>/SKILL.md as the
 * stripped body) and scripts/ops/check-codex-parity.ts (compares the mirror against the source to
 * detect staleness). They MUST share this exact logic — any divergence makes every skill read as
 * "stale" and the parity gate fires spuriously.
 */

/** Split a SKILL.md into {fm, body}: fm = the leading `---\n…\n---` YAML block (or ''); body = the rest. */
export function splitFrontmatter(raw: string): { fm: string; body: string } {
  if (!raw.startsWith('---\n')) return { fm: '', body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return { fm: '', body: raw };
  const after = raw.indexOf('\n', end + 1);
  return { fm: raw.slice(4, end), body: raw.slice(after + 1).replace(/^\n+/, '') };
}
