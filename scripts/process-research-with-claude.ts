#!/usr/bin/env tsx
/**
 * Interactive Research Processing Script
 *
 * Processes research artifacts using Claude Code instead of the Anthropic API.
 * Perfect for dev mode - leverages your Pro subscription with zero API costs.
 *
 * Usage:
 *   npx tsx scripts/process-research-with-claude.ts
 *
 * Features:
 * - Processes all 'raw' research artifacts
 * - Interactive: Claude Code extracts insights in real-time
 * - Saves structured insights to database
 * - Tracks processing metadata
 * - Zero API costs
 */

import { db } from '@/db';
import { researchArtifacts, researchInsights, researchProcessingRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  createResearchInsight,
  createResearchProcessingRun,
  updateResearchProcessingRun,
  updateResearchArtifactStatus,
} from '@/db/queries/research';

interface StructuredInsight {
  summary: string;
  keyThemes: string[];
  keyClaims: Array<{
    claim: string;
    evidence: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  supportingEvidence: Array<{
    point: string;
    source: string;
  }>;
  counterEvidence: Array<{
    point: string;
    source: string;
  }>;
  timeHorizon: 'long_term' | 'medium_term' | 'short_term' | 'unknown';
  confidenceLevel: 'high' | 'medium' | 'low' | 'exploratory';
  relevantTickers: string[];
}

async function main() {
  console.log('🤖 Claude Code Research Processor\n');
  console.log('Fetching unprocessed research artifacts...\n');

  // Fetch all raw artifacts
  const rawArtifacts = await db
    .select()
    .from(researchArtifacts)
    .where(eq(researchArtifacts.status, 'raw'))
    .orderBy(researchArtifacts.ingestedAt);

  if (rawArtifacts.length === 0) {
    console.log('✅ No unprocessed research artifacts found.');
    console.log('\nTo process research:');
    console.log('1. Go to http://localhost:3000/research/upload');
    console.log('2. Upload research content');
    console.log('3. Run this script again\n');
    return;
  }

  console.log(`Found ${rawArtifacts.length} unprocessed artifact(s)\n`);
  console.log('================================================\n');

  for (let i = 0; i < rawArtifacts.length; i++) {
    const artifact = rawArtifacts[i];

    console.log(`\n📄 ARTIFACT ${i + 1}/${rawArtifacts.length}`);
    console.log('━'.repeat(80));
    console.log(`Title: ${artifact.title}`);
    console.log(`Author: ${artifact.author || 'N/A'}`);
    console.log(`Source Type: ${artifact.sourceType}`);
    console.log(`Word Count: ${artifact.rawContent.split(/\s+/).length}`);
    if (artifact.tags && artifact.tags.length > 0) {
      console.log(`Tags: ${artifact.tags.join(', ')}`);
    }
    console.log('━'.repeat(80));
    console.log('\n📖 CONTENT:\n');
    console.log(artifact.rawContent);
    console.log('\n' + '━'.repeat(80));

    console.log('\n🤖 CLAUDE: Please analyze this research and extract structured insights.');
    console.log('\nProvide a JSON object with the following structure:');
    console.log(`
{
  "summary": "2-3 sentence overview of the key takeaways",
  "keyThemes": ["theme1", "theme2", "theme3"],
  "keyClaims": [
    {
      "claim": "Main assertion or finding",
      "evidence": "Supporting evidence",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "supportingEvidence": [
    {
      "point": "Supporting fact or data point",
      "source": "Where this came from in the content"
    }
  ],
  "counterEvidence": [
    {
      "point": "Risk, caveat, or contradicting information",
      "source": "Where this came from"
    }
  ],
  "timeHorizon": "long_term" | "medium_term" | "short_term" | "unknown",
  "confidenceLevel": "high" | "medium" | "low" | "exploratory",
  "relevantTickers": ["AAPL", "MSFT"]
}
`);

    console.log('\n⏸️  WAITING FOR CLAUDE CODE TO PROVIDE INSIGHTS...\n');
    console.log('👉 Paste the JSON response below (or type "skip" to skip this artifact):');
    console.log('━'.repeat(80) + '\n');

    // In a real interactive session, Claude Code (me) would provide the JSON here
    // The user would paste my response into the terminal
    // For now, we'll prompt for input and trust the user to paste valid JSON

    // Read from stdin
    const input = await readStdin();

    if (input.trim().toLowerCase() === 'skip') {
      console.log('\n⏭️  Skipped artifact\n');
      continue;
    }

    try {
      // Parse the JSON
      let insights: StructuredInsight;
      try {
        // Try to parse directly
        insights = JSON.parse(input);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = input.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          insights = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Could not parse JSON');
        }
      }

      console.log('\n✅ Parsed insights successfully');

      // Update artifact status to processing
      await updateResearchArtifactStatus(artifact.id, 'processing');

      // Create processing run
      const runId = await createResearchProcessingRun({
        researchArtifactId: artifact.id,
        jobType: 'structure_insights',
        status: 'running',
        processingMethod: 'claude_code_interactive',
        startedAt: new Date(),
      });

      // Save insights to database
      await createResearchInsight({
        researchArtifactId: artifact.id,
        summary: insights.summary,
        keyThemes: insights.keyThemes,
        keyClaims: insights.keyClaims,
        supportingEvidence: insights.supportingEvidence,
        counterEvidence: insights.counterEvidence,
        timeHorizon: insights.timeHorizon,
        confidenceLevel: insights.confidenceLevel,
        relevantTickers: insights.relevantTickers,
        structuredAt: new Date(),
        structuredBy: 'claude_code',
        aiProcessingCostUsd: '0.00', // Free via Claude Code!
      });

      // Update artifact status to structured
      await updateResearchArtifactStatus(artifact.id, 'structured');

      // Complete processing run
      await updateResearchProcessingRun(runId, {
        status: 'completed',
        completedAt: new Date(),
        tokensUsed: 0, // Claude Code doesn't track tokens
        estimatedCost: '0.00',
      });

      console.log('✅ Insights saved to database');
      console.log(`💾 Research artifact ${artifact.id} is now 'structured'`);
      console.log('💰 Cost: $0.00 (processed via Claude Code)\n');

    } catch (error) {
      console.error('\n❌ Error processing artifact:', error);
      console.log('⏭️  Moving to next artifact...\n');

      // Update status to error
      await updateResearchArtifactStatus(
        artifact.id,
        'error',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎉 Processing complete!');
  console.log('\n📊 View your structured research at:');
  console.log('   http://localhost:3000/research\n');
}

// Helper to read from stdin
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let data = '';

    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => {
      data += chunk;

      // Check if we have a complete JSON object or "skip" command
      const trimmed = data.trim();
      if (trimmed.toLowerCase() === 'skip') {
        stdin.pause();
        resolve(trimmed);
      } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        // Simple check for complete JSON object
        try {
          JSON.parse(trimmed);
          stdin.pause();
          resolve(trimmed);
        } catch {
          // Not valid JSON yet, keep reading
        }
      } else if (trimmed.includes('```')) {
        // Check for markdown code blocks
        const matches = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (matches) {
          stdin.pause();
          resolve(trimmed);
        }
      }
    });

    stdin.on('end', () => {
      resolve(data);
    });

    stdin.resume();
  });
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
