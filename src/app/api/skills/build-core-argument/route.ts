import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';

/**
 * POST /api/skills/build-core-argument
 *
 * Spawns Claude CLI to execute the build-core-argument skill in headless mode.
 * The skill generates an articulation with confirmation/warning signals,
 * stores them to the database, and resolves any pending triage records.
 *
 * Body: { thesisId: string, thesisType: 'macro' | 'asset' }
 * Returns: { success: boolean, output?: string, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { thesisId, thesisType } = await request.json();

    if (!thesisId || !thesisType) {
      return NextResponse.json(
        { success: false, error: 'Missing thesisId or thesisType' },
        { status: 400 }
      );
    }

    if (thesisType !== 'macro' && thesisType !== 'asset') {
      return NextResponse.json(
        { success: false, error: 'thesisType must be "macro" or "asset"' },
        { status: 400 }
      );
    }

    const thesisTable = thesisType === 'macro' ? 'macro_theses' : 'asset_theses';
    const thesisIdColumn = thesisType === 'macro' ? 'macro_thesis_id' : 'asset_thesis_id';

    const prompt = `
You are synthesizing a thesis articulation. This is an AUTOMATED headless run - do NOT ask for user input.

## Task
Create a thesis articulation with confirmation/warning signals for thesis ID: ${thesisId} (${thesisType})

## Step 1: Load thesis and claims

First, load environment variables:
\`\`\`bash
set -a && source .env.local && set +a
\`\`\`

Then query the thesis:
\`\`\`bash
/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL_POOLER" -c "
SELECT id, title, description, confidence_level, status, time_horizon, thesis_type, direction
FROM ${thesisTable} WHERE id = '${thesisId}';"
\`\`\`

Then query linked claims (via claim_thesis_mappings):
\`\`\`bash
/opt/homebrew/opt/postgresql@16/bin/psql "$DATABASE_URL_POOLER" -c "
SELECT mc.id, mc.title, mc.claim, mc.evidence, mc.reasoning, mc.backing, mc.category
FROM main_claims mc
JOIN claim_thesis_mappings ctm ON ctm.main_claim_id = mc.id
WHERE ctm.${thesisIdColumn} = '${thesisId}';"
\`\`\`

## Step 2: Generate articulation

Based on the thesis and claims, create a JSON file at /tmp/articulation-data.json with this EXACT structure:

\`\`\`json
{
  "thesisId": "${thesisId}",
  "thesisType": "${thesisType}",
  "articulation": {
    "coreArgument": "2-3 sentence summary of the investment thesis",
    "keyDrivers": [
      { "driver": "Driver name", "detail": "Why this matters" }
    ],
    "keyAssumptions": [
      { "assumption": "Key assumption", "rationale": "Why we believe this" }
    ],
    "timeframe": {
      "horizon": "medium_term",
      "expectedResolution": "6-18 months"
    },
    "confidenceLevel": "medium",
    "confidenceRationale": "Why this confidence level",
    "evidenceGaps": ["Gap 1", "Gap 2"],
    "claimIdsUsed": ["claim-id-1", "claim-id-2"]
  },
  "signals": [
    {
      "type": "confirmation",
      "statement": "What would confirm this thesis (be specific and measurable where possible)",
      "importance": "critical",
      "notes": "Why this confirms the thesis and what to do if triggered",
      "linkedClaimIds": []
    },
    {
      "type": "warning",
      "statement": "What would warn against this thesis (be specific and measurable where possible)",
      "importance": "critical",
      "notes": "Why this warns against the thesis and what to do if triggered",
      "linkedClaimIds": []
    }
  ]
}
\`\`\`

IMPORTANT for signals:
- Use "type": "confirmation" for things that would CONFIRM the thesis
- Use "type": "warning" for things that would WARN AGAINST the thesis
- All signals are created as "judgment" by default - users can configure data-driven triggers later via the UI
- Write statements that are specific and measurable where possible (e.g., "VIX sustains above 30 for 5+ days" not "Market volatility increases")
- "importance": "critical" | "significant" | "supporting"
- Include 5-8 confirmation signals and 5-8 warning signals
- Use "notes" to combine rationale and response guidance in a single freeform field
- Use actual claim IDs from Step 1 in claimIdsUsed and linkedClaimIds

## Step 3: Store to database

Write the JSON to /tmp/articulation-data.json, then run:
\`\`\`bash
npx tsx scripts/insert-thesis-articulation.ts --input /tmp/articulation-data.json
\`\`\`

This script inserts the articulation, signals, updates the thesis, and resolves triage records.

## Step 4: Clean up and report

Delete the temp file and output a JSON summary:
{
  "success": true,
  "articulationId": "<uuid from script output>",
  "signalsCount": <number>,
  "message": "Articulation created successfully"
}

If any step fails, output:
{
  "success": false,
  "error": "<specific error message>"
}

IMPORTANT:
- Do NOT ask for confirmation or user input
- Make sensible default choices for all fields
- Use "medium_term" as default timeframe for signals
- Proceed through all steps automatically
`;

    const result = await executeClaudeCLI(prompt);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in build-core-argument API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

interface CLIResult {
  success: boolean;
  output?: string;
  error?: string;
}

async function executeClaudeCLI(prompt: string): Promise<CLIResult> {
  return new Promise((resolve) => {
    console.log('[build-core-argument] Starting CLI execution...');
    console.log('[build-core-argument] Working directory:', process.cwd());

    // Write prompt to a temp file to avoid shell escaping issues
    const fs = require('fs');
    const promptFile = '/tmp/claude-prompt.txt';
    fs.writeFileSync(promptFile, prompt);

    // Build command using file input, pipe empty stdin to prevent hanging
    const command = `echo "" | /Users/njb/.local/bin/claude -p "$(cat ${promptFile})" --allowedTools Bash,Read,Write,Edit,Grep,Glob --dangerously-skip-permissions --max-turns 50 --output-format json`;

    console.log('[build-core-argument] Executing command...');

    // Exclude ANTHROPIC_API_KEY so CLI uses Max subscription instead of API tokens
    const { ANTHROPIC_API_KEY: _removed, ...envWithoutApiKey } = process.env;

    const child = exec(command, {
      cwd: process.cwd(),
      env: {
        ...envWithoutApiKey,
        PATH: `${process.env.PATH}:/Users/njb/.local/bin:/opt/homebrew/bin`,
        HOME: process.env.HOME || '/Users/njb',
      },
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      timeout: 10 * 60 * 1000, // 10 minute timeout
    }, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }

      console.log(`[build-core-argument] CLI completed`);
      console.log(`[build-core-argument] stdout length: ${stdout?.length || 0}, stderr length: ${stderr?.length || 0}`);

      if (error) {
        console.error(`[build-core-argument] Error:`, error.message);
        resolve({
          success: false,
          error: error.message || 'CLI execution failed',
          output: stdout,
        });
        return;
      }

      try {
        // With --output-format json, stdout is a JSON object with "result" field
        const cliOutput = JSON.parse(stdout);
        console.log(`[build-core-argument] CLI result type: ${cliOutput.type}, subtype: ${cliOutput.subtype}`);

        if (cliOutput.is_error) {
          resolve({
            success: false,
            error: cliOutput.result || 'CLI reported an error',
            output: stdout,
          });
          return;
        }

        // The result field contains Claude's text output
        const resultText = cliOutput.result || '';

        // Look for our custom JSON summary in the result
        const jsonMatch = resultText.match(/\{[\s\S]*"success"[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            resolve({
              success: parsed.success,
              output: resultText,
              error: parsed.error,
            });
            return;
          } catch {
            // JSON in result couldn't be parsed, continue with default
          }
        }

        // Default: CLI succeeded, assume skill completed
        resolve({
          success: true,
          output: resultText,
        });
      } catch (parseError) {
        console.error(`[build-core-argument] Failed to parse CLI output:`, parseError);
        resolve({
          success: false,
          error: 'Failed to parse CLI output',
          output: stdout,
        });
      }
    });

    // Stream output for visibility
    child.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });
    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}
