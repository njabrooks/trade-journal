#!/usr/bin/env tsx
/**
 * generate-agents-mirror — regenerate the in-repo headless Codex skill mirror (.agents/skills/)
 * from the canonical Claude skills (.claude/skills/).
 *
 * `.agents/skills/` is the **headless** packaging (skill.json + SKILL.md + HEADLESS_PREAMBLE.md)
 * for autonomous/cron Codex runs — distinct from the interactive bridge in
 * ~/.codex/skills/trade-journal-workflows/. It went stale because nothing regenerated it; this
 * script is that missing generator. See the codex-interop-parity memory.
 *
 * Per skill it:
 *   - (re)writes skill.json   — {name, description, instructions:"SKILL.md"} from current source
 *   - (re)writes SKILL.md     — the source body, Claude YAML frontmatter stripped (verbatim otherwise)
 *   - copies sibling files/dirs (references/, etc.) verbatim, for headless fidelity
 *   - writes HEADLESS_PREAMBLE.md ONLY if absent — existing ones are bespoke (hand-authored
 *     per-skill execution contracts) and are PRESERVED, never clobbered.
 *
 * Mechanical parts (skill.json, SKILL.md) always refresh so the mirror tracks the source; the
 * generic baseline preamble just bootstraps newly-added skills. Bespoke preambles for skills whose
 * SKILL.md later changed materially should be reviewed when their cron fallback is actually built.
 *
 * Usage:
 *   npx tsx scripts/ops/generate-agents-mirror.ts            # write
 *   npx tsx scripts/ops/generate-agents-mirror.ts --dry-run  # preview, write nothing
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../lib/skillBody.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLAUDE_SKILLS = join(REPO_ROOT, '.claude', 'skills');
const AGENTS_SKILLS = join(REPO_ROOT, '.agents', 'skills');

// Skills that exist to resolve genuine human-judgment decisions — meaningless to cron unattended.
// They are still mirrored (for 1:1 parity) but get a preamble that forbids fabricating user choices.
const INTERACTIVE_ONLY = new Set(['decisions', 'thesis']);

function parseArgs(argv: string[]): Record<string, boolean> {
  const a: Record<string, boolean> = {};
  for (const x of argv) if (x.startsWith('--')) a[x.slice(2)] = true;
  return a;
}

function listSkills(): string[] {
  return readdirSync(CLAUDE_SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(CLAUDE_SKILLS, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

/** Title-case a skill slug for the preamble heading: build-core-argument → Build Core Argument. */
function titleOf(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Best-effort one-line description from frontmatter `description:`, else a `**Description:**` line, else slug. */
function descriptionOf(name: string, fm: string, body: string): string {
  const fmMatch = fm.match(/^description:\s*(.+)$/m);
  if (fmMatch) return fmMatch[1].trim().replace(/^["']|["']$/g, '');
  const bodyMatch = body.match(/^\*\*Description:\*\*\s*(.+)$/m);
  if (bodyMatch) return bodyMatch[1].trim();
  return `Trade Journal skill: ${name}.`;
}

function genericPreamble(name: string): string {
  const interactive = INTERACTIVE_ONLY.has(name);
  const interactiveNote = interactive
    ? `\n> **This skill is normally INTERACTIVE** — it resolves genuine human-judgment decisions. In headless\n` +
      `> mode, produce the analysis and **surface** the decision packets (journal \`decision_required\` rows);\n` +
      `> do NOT fabricate the user's choice or auto-resolve a judgment call.\n`
    : '';
  return `# HEADLESS MODE — ${titleOf(name)}

You are running in **HEADLESS / AUTONOMOUS** mode (e.g. a Codex cron fallback). Do NOT ask for user
input or confirmation. Make sensible default choices; if information is ambiguous, state your
assumption and continue.
${interactiveNote}
## Environment setup

Run before any database access:

\`\`\`bash
cd ${REPO_ROOT}
set -a && source .env.local && set +a
\`\`\`

## Instructions

Follow the full skill procedure in \`SKILL.md\` exactly, with these overrides:

- Skip any interactive refinement / confirmation / specificity dialogue steps — proceed with your best judgment.
- Never block on user input; surface decisions to \`journal_entries\` or stdout instead of asking.
- Use repo scripts for all DB access: \`scripts/psql-query.ts\` (reads), \`scripts/ops/*\` (writes).

## Output contract

End with a single-line JSON summary:

\`\`\`json
{ "success": true, "skill": "${name}", "summary": "<what changed>", "writes": [] }
\`\`\`

On failure: \`{ "success": false, "error": "<message>" }\`

---

_This is a generic baseline preamble (auto-generated). Replace it with a bespoke execution contract
when wiring ${name} into an actual headless cron. The full skill instructions follow in \`SKILL.md\`._
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dry = !!args['dry-run'];
  if (!existsSync(CLAUDE_SKILLS)) { console.error(`No ${CLAUDE_SKILLS}`); process.exit(1); }
  if (!dry) mkdirSync(AGENTS_SKILLS, { recursive: true });

  const skills = listSkills();
  const summary = { added: [] as string[], refreshed: [] as string[], preamblesWritten: [] as string[], preamblesPreserved: [] as string[] };

  for (const name of skills) {
    const src = join(CLAUDE_SKILLS, name);
    const dst = join(AGENTS_SKILLS, name);
    const isNew = !existsSync(dst);
    (isNew ? summary.added : summary.refreshed).push(name);

    const raw = readFileSync(join(src, 'SKILL.md'), 'utf8');
    const { fm, body } = splitFrontmatter(raw);
    const description = descriptionOf(name, fm, body);
    const skillJson = JSON.stringify({ name, description, instructions: 'SKILL.md' }, null, 2) + '\n';

    const preamblePath = join(dst, 'HEADLESS_PREAMBLE.md');
    const preambleExists = existsSync(preamblePath);
    (preambleExists ? summary.preamblesPreserved : summary.preamblesWritten).push(name);

    if (!dry) {
      mkdirSync(dst, { recursive: true });
      // Copy sibling files/dirs (references/, etc.) verbatim for fidelity — but never the source
      // SKILL.md (we write a frontmatter-stripped one) and never an existing dst preamble.
      for (const ent of readdirSync(src, { withFileTypes: true })) {
        if (ent.name === 'SKILL.md') continue;
        const s = join(src, ent.name);
        const d = join(dst, ent.name);
        if (ent.isDirectory()) { rmSync(d, { recursive: true, force: true }); cpSync(s, d, { recursive: true }); }
        else cpSync(s, d);
      }
      writeFileSync(join(dst, 'SKILL.md'), body);
      writeFileSync(join(dst, 'skill.json'), skillJson);
      if (!preambleExists) writeFileSync(preamblePath, genericPreamble(name));
    }
  }

  const tag = dry ? '[dry-run] ' : '';
  console.log(`\n${tag}Mirrored ${skills.length} skills → .agents/skills/`);
  console.log(`  added:               ${summary.added.length ? summary.added.join(', ') : '(none)'}`);
  console.log(`  refreshed:           ${summary.refreshed.length}`);
  console.log(`  preambles written:   ${summary.preamblesWritten.length ? summary.preamblesWritten.join(', ') : '(none)'}`);
  console.log(`  preambles preserved: ${summary.preamblesPreserved.length} (bespoke — left untouched)`);
  if (dry) console.log(`\n(dry run — nothing written)`);
  process.exit(0);
}

main();
