import { NextRequest, NextResponse } from 'next/server';
import { runClaudeSkill } from '@/lib/skills/claude-runner';
import { loadHeadlessPrompt } from '@/lib/skills/prompt-loader';

/**
 * POST /api/skills/build-core-argument
 *
 * Spawns Claude CLI to execute the build-core-argument skill in headless mode.
 * The skill generates an articulation with confirmation/warning signals,
 * stores them to the database, and resolves any pending triage records.
 *
 * Body: { thesisId: string, thesisType: 'macro' | 'asset' }
 * Returns: { success: boolean, output?: string, error?: string, durationMs?: number }
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

    const prompt = loadHeadlessPrompt({
      skillName: 'build-core-argument',
      params: { thesisId, thesisType },
    });

    const result = await runClaudeSkill({
      skillName: 'build-core-argument',
      prompt,
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'],
      maxTurns: 50,
      timeoutMs: 10 * 60 * 1000,
    });

    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      ...(result.parsedResult || {}),
    });

  } catch (error) {
    console.error('[build-core-argument] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
