import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { signals, macroTheses, assetTheses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { ClaudeProvider } from '@/lib/services/ai-providers/claude';

/**
 * POST /api/skills/assess-validation-evidence
 *
 * Analyzes content against thesis signals to identify evidence of confirmation/warning.
 * Uses Anthropic Claude API for analysis.
 *
 * Body: {
 *   thesisId: string,
 *   thesisType: 'macro' | 'asset',
 *   content: string,        // Text content to analyze
 *   contentUrl?: string,    // Optional: URL source for display
 * }
 *
 * Returns: {
 *   success: boolean,
 *   assessments: Array<{
 *     signalId: string,
 *     statement: string,
 *     type: 'confirmation' | 'warning',
 *     currentStatus: string,
 *     assessment: 'strong_confirmation' | 'weak_confirmation' | 'neutral' | 'weak_warning' | 'strong_warning',
 *     confidence: 'high' | 'medium' | 'low',
 *     evidence: string[],
 *     quotes: string[],
 *     recommendedAction: string,
 *   }>,
 *   summary: {
 *     totalSignals: number,
 *     withEvidence: number,
 *     confirmationEvidence: number,
 *     warningEvidence: number,
 *   },
 *   error?: string,
 * }
 */

interface AssessEvidenceBody {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  content: string;
  contentUrl?: string;
}

interface SignalAssessment {
  signalId: string;
  statement: string;
  type: 'confirmation' | 'warning';
  importance: string;
  currentStatus: string;
  assessment: 'strong_confirmation' | 'weak_confirmation' | 'neutral' | 'weak_warning' | 'strong_warning';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  quotes: string[];
  recommendedAction: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AssessEvidenceBody = await request.json();
    const { thesisId, thesisType, content, contentUrl } = body;

    // Validation
    if (!thesisId || !thesisType || !content) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: thesisId, thesisType, content' },
        { status: 400 }
      );
    }

    if (content.length < 100) {
      return NextResponse.json(
        { success: false, error: 'Content too short. Provide at least 100 characters of text to analyze.' },
        { status: 400 }
      );
    }

    if (content.length > 100000) {
      return NextResponse.json(
        { success: false, error: 'Content too long. Maximum 100,000 characters.' },
        { status: 400 }
      );
    }

    // Fetch thesis
    let thesis: { id: string; title: string; confidenceLevel: string | null } | undefined;

    if (thesisType === 'macro') {
      const [result] = await db
        .select({ id: macroTheses.id, title: macroTheses.title, confidenceLevel: macroTheses.confidenceLevel })
        .from(macroTheses)
        .where(eq(macroTheses.id, thesisId))
        .limit(1);
      thesis = result;
    } else {
      const [result] = await db
        .select({ id: assetTheses.id, title: assetTheses.title, confidenceLevel: assetTheses.confidenceLevel })
        .from(assetTheses)
        .where(eq(assetTheses.id, thesisId))
        .limit(1);
      thesis = result;
    }

    if (!thesis) {
      return NextResponse.json(
        { success: false, error: 'Thesis not found' },
        { status: 404 }
      );
    }

    // Fetch signals for this thesis
    const thesisSignals = await db
      .select()
      .from(signals)
      .where(
        and(
          eq(signals.thesisId, thesisId),
          eq(signals.thesisType, thesisType)
        )
      )
      .orderBy(signals.importance);

    if (thesisSignals.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No signals found for this thesis. Create signals first.' },
        { status: 400 }
      );
    }

    // Build the analysis prompt
    const signalDescriptions = thesisSignals.map((s, i) => `
Signal ${i + 1}:
- ID: ${s.id}
- Statement: ${s.statement}
- Type: ${s.type} (${s.type === 'confirmation' ? 'confirms thesis if triggered' : 'warns against thesis if triggered'})
- Importance: ${s.importance}
- Current Status: ${s.status}
- Rationale: ${s.rationale || 'N/A'}
`).join('\n');

    const analysisPrompt = `You are analyzing content against thesis signals to identify evidence of confirmation or warning.

## Thesis
Title: ${thesis.title}
Type: ${thesisType}
Current Confidence: ${thesis.confidenceLevel || 'medium'}

## Signals to Assess
${signalDescriptions}

## Content to Analyze
${contentUrl ? `Source: ${contentUrl}\n\n` : ''}${content}

## Task
Analyze the content against EACH signal above. For each signal, determine:
1. Whether the content contains evidence relevant to this signal
2. If so, whether it supports (confirms) or contradicts (warns) the signal's statement
3. Your confidence in this assessment
4. Specific evidence and quotes from the content

## Output Format
Respond with ONLY valid JSON (no markdown code blocks) in this exact structure:
{
  "assessments": [
    {
      "signalId": "<uuid>",
      "statement": "<signal statement>",
      "type": "confirmation|warning",
      "importance": "critical|significant|supporting",
      "currentStatus": "<current status>",
      "assessment": "strong_confirmation|weak_confirmation|neutral|weak_warning|strong_warning",
      "confidence": "high|medium|low",
      "evidence": ["Finding 1", "Finding 2"],
      "quotes": ["Relevant quote from content"],
      "recommendedAction": "Brief recommendation"
    }
  ],
  "overallSummary": "1-2 sentence summary of key findings"
}

Assessment mapping:
- strong_confirmation: Clear evidence that this signal's condition is being met or will be met
- weak_confirmation: Some evidence suggesting the signal may be confirmed
- neutral: No significant evidence either way
- weak_warning: Some evidence suggesting the signal may be triggered (for warning signals, this means the warning condition is appearing)
- strong_warning: Clear evidence that the warning signal's condition is occurring

IMPORTANT:
- Include ALL ${thesisSignals.length} signals in your response, even if they have "neutral" assessment
- Be specific about quotes - use exact text from the content
- Be conservative with "strong" assessments - require clear, unambiguous evidence
- If a signal is already "triggered", note if the evidence reinforces or contradicts that status`;

    // Call Claude API
    const claude = new ClaudeProvider('claude-sonnet-4');
    const response = await claude.process(analysisPrompt, { maxTokens: 8000 });

    // Parse response
    let parsed: { assessments: SignalAssessment[]; overallSummary?: string };
    try {
      // Remove any markdown code blocks if present
      let cleanedContent = response.content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7);
      }
      if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      parsed = JSON.parse(cleanedContent.trim());
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError);
      console.error('Raw response:', response.content);
      return NextResponse.json(
        { success: false, error: 'Failed to parse AI response. Please try again.' },
        { status: 500 }
      );
    }

    // Calculate summary
    const assessments = parsed.assessments || [];
    const withEvidence = assessments.filter(a => a.assessment !== 'neutral').length;
    const confirmationEvidence = assessments.filter(a =>
      a.assessment === 'strong_confirmation' || a.assessment === 'weak_confirmation'
    ).length;
    const warningEvidence = assessments.filter(a =>
      a.assessment === 'strong_warning' || a.assessment === 'weak_warning'
    ).length;

    return NextResponse.json({
      success: true,
      assessments,
      summary: {
        totalSignals: thesisSignals.length,
        withEvidence,
        confirmationEvidence,
        warningEvidence,
      },
      overallSummary: parsed.overallSummary,
      usage: {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        model: response.model,
      },
    });

  } catch (error) {
    console.error('Error in assess-validation-evidence API:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
