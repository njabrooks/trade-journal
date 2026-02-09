#!/usr/bin/env tsx
/**
 * Assess content against existing validation points to identify evidence of validation/invalidation
 *
 * Usage:
 *   npx tsx scripts/assess-validation-evidence.ts <thesis-type> <thesis-id> <content-source> [--output path]
 *
 * Examples:
 *   npx tsx scripts/assess-validation-evidence.ts asset clxyz123 https://sec.gov/...
 *   npx tsx scripts/assess-validation-evidence.ts macro clxyz456 ~/Downloads/presentation.pdf
 */

import { db, closeDb, schema } from './lib/db.js';
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { homedir } from 'os';

const { macroTheses, assetTheses, underlyings, validationPoints } = schema;

interface ValidationPoint {
  id: string;
  statement: string;
  type: 'validation' | 'invalidation';
  category: 'explicit' | 'judgment_required';
  importance: 'critical' | 'significant' | 'supporting';
  status: 'not_triggered' | 'monitoring' | 'triggered' | 'superseded';
  rationale: string | null;
  timeframe: string;
  explicitDetails: any;
  judgmentDetails: any;
  responseProtocol: any;
  createdAt: Date;
  updatedAt: Date;
}

interface AssessmentResult {
  validationPointId: string;
  validationPointStatement: string;
  validationPointType: 'validation' | 'invalidation';
  importance: string;
  currentStatus: string;
  assessment: 'strong_validation' | 'weak_validation' | 'neutral' | 'weak_invalidation' | 'strong_invalidation';
  confidence: 'high' | 'medium' | 'low' | 'none';
  keyFindings: string[];
  relevantQuotes: string[];
  recommendation: string;
  notes: string;
}

interface ThesisDetails {
  id: string;
  title: string;
  type: 'macro' | 'asset';
  status: string;
  conviction: string;
  ticker?: string;
}

async function fetchThesisDetails(
  thesisType: 'macro' | 'asset',
  thesisId: string
): Promise<ThesisDetails | null> {
  console.log(`Fetching ${thesisType} thesis details for ID: ${thesisId}`);

  if (thesisType === 'macro') {
    const results = await db
      .select({
        id: macroTheses.id,
        title: macroTheses.title,
        status: macroTheses.status,
        conviction: macroTheses.conviction,
      })
      .from(macroTheses)
      .where(eq(macroTheses.id, thesisId))
      .limit(1);

    if (results.length === 0) return null;

    return {
      ...results[0],
      type: 'macro',
    };
  } else {
    const results = await db
      .select({
        id: assetTheses.id,
        title: assetTheses.title,
        status: assetTheses.status,
        confidenceLevel: assetTheses.confidenceLevel,
        underlyingId: assetTheses.underlyingId,
      })
      .from(assetTheses)
      .where(eq(assetTheses.id, thesisId))
      .limit(1);

    if (results.length === 0) return null;

    // Fetch ticker if underlyingId exists
    let ticker: string | undefined;
    if (results[0].underlyingId) {
      const underlyingResults = await db
        .select({ ticker: underlyings.ticker })
        .from(underlyings)
        .where(eq(underlyings.id, results[0].underlyingId))
        .limit(1);

      if (underlyingResults.length > 0) {
        ticker = underlyingResults[0].ticker;
      }
    }

    return {
      id: results[0].id,
      title: results[0].title,
      status: results[0].status,
      conviction: results[0].confidenceLevel || 'unknown',
      ticker,
      type: 'asset',
    };
  }
}

async function findThesisByTicker(ticker: string): Promise<ThesisDetails | null> {
  console.log(`Searching for asset thesis with ticker: ${ticker}`);

  // First find the underlying
  const underlyingResults = await db
    .select({ id: underlyings.id, ticker: underlyings.ticker })
    .from(underlyings)
    .where(eq(underlyings.ticker, ticker.toUpperCase()))
    .limit(1);

  if (underlyingResults.length === 0) {
    console.log(`No underlying found for ticker: ${ticker}`);
    return null;
  }

  const underlying = underlyingResults[0];
  console.log(`Found underlying ID: ${underlying.id}`);

  // Find active asset thesis for this underlying
  const thesisResults = await db
    .select({
      id: assetTheses.id,
      title: assetTheses.title,
      status: assetTheses.status,
      confidenceLevel: assetTheses.confidenceLevel,
    })
    .from(assetTheses)
    .where(eq(assetTheses.underlyingId, underlying.id))
    .orderBy(assetTheses.createdAt)
    .limit(1);

  if (thesisResults.length === 0) {
    console.log(`No asset thesis found for underlying ${underlying.ticker}`);
    return null;
  }

  const thesis = thesisResults[0];
  console.log(`Found thesis: ${thesis.title} (ID: ${thesis.id})`);

  return {
    id: thesis.id,
    title: thesis.title,
    status: thesis.status,
    conviction: thesis.confidenceLevel || 'unknown',
    ticker: underlying.ticker,
    type: 'asset',
  };
}

async function fetchValidationPoints(
  thesisType: 'macro' | 'asset',
  thesisId: string
): Promise<ValidationPoint[]> {
  console.log(`Fetching validation points for ${thesisType} thesis: ${thesisId}`);

  const results = await db
    .select()
    .from(validationPoints)
    .where(
      and(
        eq(validationPoints.thesisType, thesisType),
        eq(validationPoints.thesisId, thesisId)
      )
    )
    .orderBy(validationPoints.importance, validationPoints.type);

  console.log(`Found ${results.length} validation points`);

  return results.map((point) => ({
    id: point.id,
    statement: point.statement,
    type: point.type as 'validation' | 'invalidation',
    category: point.category as 'explicit' | 'judgment_required',
    importance: point.importance as 'critical' | 'significant' | 'supporting',
    status: point.status as 'not_triggered' | 'monitoring' | 'triggered' | 'superseded',
    rationale: point.rationale,
    timeframe: point.timeframe,
    explicitDetails: point.explicitDetails,
    judgmentDetails: point.judgmentDetails,
    responseProtocol: point.responseProtocol,
    createdAt: point.createdAt,
    updatedAt: point.updatedAt,
  }));
}

async function loadContent(contentSource: string): Promise<string> {
  console.log(`Loading content from: ${contentSource}`);

  // Check if it's a URL
  if (contentSource.startsWith('http://') || contentSource.startsWith('https://')) {
    console.log('Content source is a URL - use WebFetch tool to retrieve content');
    throw new Error(
      'URL content sources require WebFetch tool. Please use Claude Code to fetch URL content and pass as text or file.'
    );
  }

  // Check if it's a file path
  try {
    const resolvedPath = contentSource.startsWith('~')
      ? path.join(homedir(), contentSource.slice(1))
      : path.resolve(contentSource);

    const stat = await fs.stat(resolvedPath);
    if (stat.isFile()) {
      console.log(`Reading file: ${resolvedPath}`);
      const content = await fs.readFile(resolvedPath, 'utf-8');
      console.log(`Loaded ${content.length} characters from file`);
      return content;
    }
  } catch (err) {
    // Not a file, assume it's direct text content
  }

  // Treat as direct text
  console.log(`Using provided text content (${contentSource.length} characters)`);
  return contentSource;
}

function generateMarkdownReport(
  thesis: ThesisDetails,
  validationPoints: ValidationPoint[],
  assessments: AssessmentResult[],
  contentSource: string,
  timestamp: string
): string {
  const assessmentCounts = {
    strong_validation: assessments.filter((a) => a.assessment === 'strong_validation').length,
    weak_validation: assessments.filter((a) => a.assessment === 'weak_validation').length,
    neutral: assessments.filter((a) => a.assessment === 'neutral').length,
    weak_invalidation: assessments.filter((a) => a.assessment === 'weak_invalidation').length,
    strong_invalidation: assessments.filter((a) => a.assessment === 'strong_invalidation').length,
  };

  const significantEvidence = assessments.filter(
    (a) =>
      a.assessment === 'strong_validation' ||
      a.assessment === 'strong_invalidation' ||
      (a.assessment === 'weak_validation' && a.confidence === 'high') ||
      (a.assessment === 'weak_invalidation' && a.confidence === 'high')
  );

  let md = `# Validation Evidence Assessment

**Thesis:** ${thesis.title}${thesis.ticker ? ` (${thesis.ticker})` : ''}
**Thesis Type:** ${thesis.type}
**Thesis Status:** ${thesis.status}
**Conviction:** ${thesis.conviction}
**Content Source:** ${contentSource}
**Assessed:** ${timestamp}

---

## Summary

- **Total Validation Points:** ${validationPoints.length}
- **Points with Significant Evidence:** ${significantEvidence.length}
- **Strong Validation Evidence:** ${assessmentCounts.strong_validation}
- **Weak Validation Evidence:** ${assessmentCounts.weak_validation}
- **Neutral/No Evidence:** ${assessmentCounts.neutral}
- **Weak Invalidation Evidence:** ${assessmentCounts.weak_invalidation}
- **Strong Invalidation Evidence:** ${assessmentCounts.strong_invalidation}

`;

  if (significantEvidence.length > 0) {
    md += `\n### Points Requiring Review\n\n`;
    significantEvidence.forEach((result) => {
      const icon =
        result.assessment === 'strong_validation'
          ? '🟢'
          : result.assessment === 'strong_invalidation'
            ? '🔴'
            : '⚠️';
      md += `${icon} **${result.validationPointStatement}** (${result.assessment.replace('_', ' ')})\n`;
    });
  }

  md += `\n---\n\n`;

  // Group by assessment type for better organization
  const sections = [
    { title: 'Strong Validation Evidence', filter: 'strong_validation' as const, icon: '🟢' },
    { title: 'Weak Validation Evidence', filter: 'weak_validation' as const, icon: '🔵' },
    {
      title: 'Strong Invalidation Evidence',
      filter: 'strong_invalidation' as const,
      icon: '🔴',
    },
    {
      title: 'Weak Invalidation Evidence',
      filter: 'weak_invalidation' as const,
      icon: '🟠',
    },
    { title: 'Neutral / No Evidence', filter: 'neutral' as const, icon: '⚪' },
  ];

  sections.forEach(({ title, filter, icon }) => {
    const sectionResults = assessments.filter((a) => a.assessment === filter);
    if (sectionResults.length === 0) return;

    md += `## ${icon} ${title}\n\n`;

    sectionResults.forEach((result) => {
      md += `### Validation Point: ${result.validationPointStatement}\n\n`;
      md += `**Type:** ${result.validationPointType}\n`;
      md += `**Importance:** ${result.importance}\n`;
      md += `**Current Status:** ${result.currentStatus}\n`;
      md += `**Confidence:** ${result.confidence}\n\n`;

      if (result.keyFindings.length > 0) {
        md += `**Key Findings:**\n\n`;
        result.keyFindings.forEach((finding) => {
          md += `- ${finding}\n`;
        });
        md += `\n`;
      }

      if (result.relevantQuotes.length > 0) {
        md += `**Relevant Quotes:**\n\n`;
        result.relevantQuotes.forEach((quote) => {
          md += `> ${quote}\n\n`;
        });
      }

      if (result.recommendation) {
        md += `**Recommendation:** ${result.recommendation}\n\n`;
      }

      if (result.notes) {
        md += `**Notes:** ${result.notes}\n\n`;
      }

      md += `---\n\n`;
    });
  });

  // Next steps
  md += `## Next Steps\n\n`;

  if (significantEvidence.length > 0) {
    md += `1. **Review Significant Evidence** - ${significantEvidence.length} validation points have evidence requiring attention\n`;
    md += `2. **Update Statuses** - Consider updating validation point statuses based on evidence strength\n`;
    md += `3. **Record Monitoring Events** - Document these findings in monitoring events for audit trail\n`;
    md += `4. **Strategic Actions** - Evaluate if any findings warrant immediate strategy adjustments\n`;
  } else {
    md += `1. No significant evidence found in this content for existing validation points\n`;
    md += `2. Consider whether validation points need refinement or if different content sources are needed\n`;
    md += `3. Continue monitoring with next scheduled check or on-demand when new content is available\n`;
  }

  return md;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/assess-validation-evidence.ts <thesis-identifier> <content-source> [--output path]');
    console.error('');
    console.error('Thesis identifier can be:');
    console.error('  - Thesis ID: macro:<uuid> or asset:<uuid>');
    console.error('  - Ticker: ticker:<SYMBOL> (for asset theses only)');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/assess-validation-evidence.ts ticker:GLXY ~/Desktop/galaxy-presentation.html');
    console.error('  npx tsx scripts/assess-validation-evidence.ts asset:7ce262f7-... ~/Downloads/presentation.pdf');
    console.error('  npx tsx scripts/assess-validation-evidence.ts macro:abc123... "Direct text content..."');
    process.exit(1);
  }

  const thesisIdentifier = args[0];
  const contentSource = args[1];

  // Parse thesis identifier
  let thesisType: 'macro' | 'asset';
  let thesisId: string | null = null;
  let ticker: string | null = null;

  if (thesisIdentifier.startsWith('macro:')) {
    thesisType = 'macro';
    thesisId = thesisIdentifier.substring(6);
  } else if (thesisIdentifier.startsWith('asset:')) {
    thesisType = 'asset';
    thesisId = thesisIdentifier.substring(6);
  } else if (thesisIdentifier.startsWith('ticker:')) {
    thesisType = 'asset';
    ticker = thesisIdentifier.substring(7);
  } else {
    console.error('Error: thesis identifier must start with "macro:", "asset:", or "ticker:"');
    console.error('Examples: macro:abc123, asset:def456, ticker:GLXY');
    process.exit(1);
  }

  // Check for --output flag
  let outputPath: string | null = null;
  const outputFlagIndex = args.indexOf('--output');
  if (outputFlagIndex !== -1 && args[outputFlagIndex + 1]) {
    outputPath = args[outputFlagIndex + 1];
  }

  try {
    // Fetch thesis details - either by ID or ticker
    let thesis: ThesisDetails | null = null;

    if (ticker) {
      thesis = await findThesisByTicker(ticker);
      if (!thesis) {
        console.error(`Error: No asset thesis found for ticker: ${ticker}`);
        await closeDb();
        process.exit(1);
      }
      // Update thesisId for validation point lookup
      thesisId = thesis.id;
    } else if (thesisId) {
      thesis = await fetchThesisDetails(thesisType, thesisId);
      if (!thesis) {
        console.error(`Error: ${thesisType} thesis not found with ID: ${thesisId}`);
        await closeDb();
        process.exit(1);
      }
    } else {
      console.error('Error: No thesis ID or ticker provided');
      await closeDb();
      process.exit(1);
    }

    console.log(`Found thesis: ${thesis.title}`);

    // Fetch validation points
    const points = await fetchValidationPoints(thesisType, thesisId);
    if (points.length === 0) {
      console.error(`Error: No validation points found for thesis ${thesisId}`);
      console.error('Run /build-core-argument first to create validation points');
      await closeDb();
      process.exit(1);
    }

    // Load content
    const content = await loadContent(contentSource);

    console.log('\n===========================================');
    console.log('ASSESSMENT PHASE');
    console.log('===========================================\n');
    console.log(
      'This script has loaded the thesis, validation points, and content.'
    );
    console.log(
      'However, the actual AI-powered cross-reference analysis must be performed by Claude Code.'
    );
    console.log('\nPlease use Claude Code to:');
    console.log('1. Analyze the content against each validation point');
    console.log('2. Identify evidence of validation or invalidation');
    console.log('3. Generate AssessmentResult objects for each point');
    console.log('4. Call this script again with assessment results\n');
    console.log('Validation Points to Assess:');
    console.log('----------------------------');
    points.forEach((point, idx) => {
      console.log(
        `${idx + 1}. [${point.type}] [${point.importance}] ${point.statement}`
      );
      if (point.rationale) {
        console.log(`   Rationale: ${point.rationale}`);
      }
    });
    console.log('\nContent Preview (first 500 chars):');
    console.log('-----------------------------------');
    console.log(content.substring(0, 500) + '...\n');

    console.log('Assessment data prepared. Waiting for Claude Code analysis...');

    // For now, generate empty report as placeholder
    // Claude Code will need to fill in actual assessments
    const timestamp = new Date().toISOString();
    const defaultOutputPath = path.join(
      homedir(),
      'Desktop',
      `validation-assessment-${timestamp.replace(/[:.]/g, '-').substring(0, 19)}.md`
    );
    const finalOutputPath = outputPath || defaultOutputPath;

    const placeholderAssessments: AssessmentResult[] = points.map((point) => ({
      validationPointId: point.id,
      validationPointStatement: point.statement,
      validationPointType: point.type,
      importance: point.importance,
      currentStatus: point.status,
      assessment: 'neutral',
      confidence: 'none',
      keyFindings: [],
      relevantQuotes: [],
      recommendation: 'Analysis pending - waiting for Claude Code assessment',
      notes: 'This assessment needs to be completed by Claude Code',
    }));

    const report = generateMarkdownReport(
      thesis,
      points,
      placeholderAssessments,
      contentSource,
      timestamp
    );

    await fs.writeFile(finalOutputPath, report, 'utf-8');
    console.log(`\n✓ Placeholder report generated: ${finalOutputPath}`);
    console.log('\nNext: Use Claude Code to complete the assessment analysis.');

    await closeDb();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await closeDb();
    process.exit(1);
  }
}

main();
