import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync } from 'fs';
import { runClaudeSkill } from '@/lib/skills/claude-runner';
import { loadHeadlessPrompt } from '@/lib/skills/prompt-loader';

/**
 * POST /api/skills/assess-validation-evidence
 *
 * Analyzes content against thesis signals to identify evidence of confirmation/warning.
 * Spawns Claude CLI (Max subscription) instead of using ClaudeProvider (raw API tokens).
 *
 * Body: {
 *   thesisId: string,
 *   thesisType: 'macro' | 'asset',
 *   content: string,
 *   contentUrl?: string,
 * }
 */
export async function POST(request: NextRequest) {
  const contentFile = `/tmp/assess-content-${randomUUID()}.txt`;

  try {
    const { thesisId, thesisType, content, contentUrl } = await request.json();

    // Validation
    if (!thesisId || !thesisType || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: thesisId, thesisType, content' },
        { status: 400 }
      );
    }

    if (content.length < 100) {
      return NextResponse.json(
        { success: false, error: 'Content too short. Provide at least 100 characters.' },
        { status: 400 }
      );
    }

    if (content.length > 100000) {
      return NextResponse.json(
        { success: false, error: 'Content too long. Maximum 100,000 characters.' },
        { status: 400 }
      );
    }

    // Write content to temp file for the CLI agent to read
    const contentWithHeader = contentUrl
      ? `Source: ${contentUrl}\n\n${content}`
      : content;
    writeFileSync(contentFile, contentWithHeader);

    const thesisTable = thesisType === 'macro' ? 'macro_theses' : 'asset_theses';

    const prompt = loadHeadlessPrompt({
      skillName: 'assess-validation-evidence',
      params: {
        thesisId,
        thesisType,
        contentFile,
        thesisTable,
      },
    });

    const result = await runClaudeSkill({
      skillName: 'assess-validation-evidence',
      prompt,
      allowedTools: ['Bash', 'Read', 'Grep'],
      maxTurns: 20,
      timeoutMs: 5 * 60 * 1000, // 5 minutes (analysis only, no DB writes)
    });

    // Extract structured result if available
    if (result.parsedResult) {
      const parsed = result.parsedResult as Record<string, unknown>;
      const assessments = (parsed.assessments || []) as Array<{
        assessment: string;
      }>;

      const withEvidence = assessments.filter(a => a.assessment !== 'neutral').length;
      const confirmationEvidence = assessments.filter(a =>
        a.assessment === 'strong_confirmation' || a.assessment === 'weak_confirmation'
      ).length;
      const warningEvidence = assessments.filter(a =>
        a.assessment === 'strong_warning' || a.assessment === 'weak_warning'
      ).length;

      return NextResponse.json({
        success: true,
        assessments: parsed.assessments,
        overallSummary: parsed.overallSummary,
        summary: {
          totalSignals: assessments.length,
          withEvidence,
          confirmationEvidence,
          warningEvidence,
        },
        durationMs: result.durationMs,
      });
    }

    // Fallback: return raw result
    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    });

  } catch (error) {
    console.error('[assess-validation-evidence] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    try { unlinkSync(contentFile); } catch { /* ignore */ }
  }
}
