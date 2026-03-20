import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';

/**
 * Shared Claude CLI runner for headless skill execution.
 *
 * Used by Web UI API routes to spawn Claude CLI as a child process.
 * Paperclip and OpenClaw have their own sub-agent spawning and don't use this.
 *
 * All paths use Claude Max subscription — no API key needed.
 */

export interface SkillRunConfig {
  skillName: string;
  prompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
  maxBufferBytes?: number;
  cwd?: string;
}

export interface SkillRunResult {
  success: boolean;
  output: string;
  parsedResult?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  timedOut: boolean;
}

const DEFAULT_ALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'];
const DEFAULT_MAX_TURNS = 50;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_BUFFER = 50 * 1024 * 1024; // 50MB

/**
 * Discover the claude binary path. Tries `which claude` first, then common locations.
 */
async function findClaudeBinary(): Promise<string> {
  // Try `which claude` first
  const whichResult = await new Promise<string | null>((resolve) => {
    exec('which claude', { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });

  if (whichResult) return whichResult;

  // Fallback: check common locations
  const home = process.env.HOME || '/home/openclaw';
  const candidates = [
    `${home}/.npm-global/bin/claude`,
    `${home}/.local/bin/claude`,
    '/usr/local/bin/claude',
  ];

  const { existsSync } = await import('fs');
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    'Claude CLI not found. Checked: which claude, ' + candidates.join(', ')
  );
}

/**
 * Build a sanitized environment for the child process.
 */
function buildEnv(): Record<string, string | undefined> {
  const env = { ...process.env };

  // Ensure common bin dirs are on PATH
  const home = process.env.HOME || '/home/openclaw';
  const extraPaths = [
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
  const currentPath = env.PATH || '/usr/bin:/bin';
  env.PATH = [...extraPaths, currentPath].join(':');

  return env;
}

export async function runClaudeSkill(config: SkillRunConfig): Promise<SkillRunResult> {
  const {
    skillName,
    prompt,
    allowedTools = DEFAULT_ALLOWED_TOOLS,
    maxTurns = DEFAULT_MAX_TURNS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBufferBytes = DEFAULT_MAX_BUFFER,
    cwd = process.cwd(),
  } = config;

  const tag = `[skill:${skillName}]`;
  const startTime = Date.now();
  const promptFile = `/tmp/claude-skill-${randomUUID()}.txt`;

  try {
    const claudeBin = await findClaudeBinary();
    console.log(`${tag} Using claude binary: ${claudeBin}`);

    // Write prompt to temp file to avoid shell escaping issues
    writeFileSync(promptFile, prompt);

    const toolsArg = allowedTools.join(',');
    const command = [
      `echo "" |`,
      `"${claudeBin}"`,
      `-p "$(cat ${promptFile})"`,
      `--allowedTools ${toolsArg}`,
      `--dangerously-skip-permissions`,
      `--max-turns ${maxTurns}`,
      `--output-format json`,
    ].join(' ');

    console.log(`${tag} Executing (timeout: ${timeoutMs}ms, maxTurns: ${maxTurns})`);

    const { stdout, stderr, timedOut } = await new Promise<{
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }>((resolve) => {
      const child = exec(command, {
        cwd,
        env: buildEnv(),
        maxBuffer: maxBufferBytes,
        timeout: timeoutMs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, (error: any, stdout: any, stderr: any) => {
        const timedOut = error?.killed === true;
        if (error && !timedOut) {
          console.error(`${tag} CLI error:`, error.message);
        }
        resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), timedOut: !!timedOut });
      });

      // Stream output for visibility in server logs
      child.stdout?.on('data', (data) => process.stdout.write(data));
      child.stderr?.on('data', (data) => process.stderr.write(data));
    });

    const durationMs = Date.now() - startTime;
    console.log(`${tag} Completed in ${(durationMs / 1000).toFixed(1)}s (timedOut: ${timedOut})`);

    if (timedOut) {
      return {
        success: false,
        output: stdout,
        error: `Skill timed out after ${timeoutMs / 1000}s`,
        durationMs,
        timedOut: true,
      };
    }

    // Parse the --output-format json envelope
    return parseCliOutput(stdout, durationMs, tag);

  } finally {
    try { unlinkSync(promptFile); } catch { /* ignore */ }
  }
}

/**
 * Parse Claude CLI JSON output envelope and extract the skill result.
 */
function parseCliOutput(
  stdout: string,
  durationMs: number,
  tag: string
): SkillRunResult {
  const base = { durationMs, timedOut: false };

  if (!stdout.trim()) {
    return { ...base, success: false, output: '', error: 'Empty CLI output' };
  }

  let cliOutput: { result?: string; is_error?: boolean; type?: string };
  try {
    cliOutput = JSON.parse(stdout);
  } catch {
    console.error(`${tag} Failed to parse CLI JSON output`);
    return { ...base, success: false, output: stdout, error: 'Failed to parse CLI output as JSON' };
  }

  if (cliOutput.is_error) {
    return {
      ...base,
      success: false,
      output: cliOutput.result || '',
      error: cliOutput.result || 'CLI reported an error',
    };
  }

  const resultText = cliOutput.result || '';

  // Try to extract a JSON summary from the result text.
  // Skills are expected to output a { "success": true/false, ... } JSON block.
  const jsonMatch = resultText.match(/\{[\s\S]*?"success"\s*:\s*(true|false)[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...base,
        success: parsed.success,
        output: resultText,
        parsedResult: parsed,
        error: parsed.error,
      };
    } catch {
      // JSON-like block couldn't be parsed — fall through
    }
  }

  // Default: CLI succeeded but no structured result found
  return { ...base, success: true, output: resultText };
}
