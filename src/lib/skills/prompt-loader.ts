import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Loads and assembles a headless prompt from HEADLESS_PREAMBLE.md + SKILL.md.
 *
 * SKILL.md is the single source of truth for skill logic.
 * HEADLESS_PREAMBLE.md adds overrides for autonomous execution (parameter injection,
 * skip interactive steps, output contract).
 */

export interface SkillPromptConfig {
  skillName: string;
  params: Record<string, string>;
  skillsDir?: string; // Override for non-standard layouts
}

export function loadHeadlessPrompt(config: SkillPromptConfig): string {
  const { skillName, params, skillsDir } = config;

  // Locate the skills directory
  const baseDir = skillsDir || join(process.cwd(), '.claude', 'skills', skillName);

  const preamblePath = join(baseDir, 'HEADLESS_PREAMBLE.md');
  const skillPath = join(baseDir, 'SKILL.md');

  // SKILL.md is required
  if (!existsSync(skillPath)) {
    throw new Error(`SKILL.md not found at ${skillPath}`);
  }

  let prompt = '';

  // HEADLESS_PREAMBLE.md is optional but expected for headless execution
  if (existsSync(preamblePath)) {
    let preamble = readFileSync(preamblePath, 'utf-8');
    preamble = interpolateParams(preamble, params);
    prompt += preamble + '\n\n---\n\n';
  }

  let skill = readFileSync(skillPath, 'utf-8');
  skill = interpolateParams(skill, params);
  prompt += skill;

  return prompt;
}

/**
 * Replace {{paramName}} placeholders with actual values.
 */
function interpolateParams(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
}
