/**
 * Upload apps-to-agents audit to database
 * Tests Week 2 upload workflow
 */

import { db } from '@/db';
import { researchArtifacts, researchInsights } from '@/db/schema';

async function uploadAudit() {
  console.log('📤 Uploading apps-to-agents audit...\n');

  try {
    // Step 1: Upload transcript as artifact
    console.log('1️⃣  Creating research artifact...');
    const [artifact] = await db
      .insert(researchArtifacts)
      .values({
        title: 'From Apps to Agents - Why 2026 Is the Real AI Inflection Point',
        sourceType: 'transcript',
        sourceUrl: 'https://www.youtube.com/watch?v=0Hcw9toVRNg',
        rawContent: 'Forensic audit file - see research_insights.claims_structure for full analysis',
        contentFormat: 'markdown',
        tags: ['AI', 'agents', 'enterprise', 'PMI', 'reflation', '2026', 'autonomous', 'compute'],
        status: 'structured',
        ingestedAt: new Date('2025-12-24'),
      })
      .returning();

    console.log(`   ✅ Artifact created: ${artifact.id}`);
    console.log(`   Title: ${artifact.title}\n`);

    // Step 2: Upload audit as insight with claims_structure
    console.log('2️⃣  Creating research insight with claims structure...');

    const claimsStructure = {
      main_claims: [
        // We'll populate a few examples to test the structure
        {
          id: 'claim-1',
          level: 'main' as const,
          type: 'thesis_candidate' as const,
          category: 'macro' as const,
          claim: 'AI adoption will drive a strong PMI expansion in 2025-2026, creating a reflationary environment driven by the transition from cloud-based AI to physical AI infrastructure',
          evidence: 'Risk-on indicators rising: MSCI World ex-US up, industrial commodities higher, dollar weakness. PMIs overlaid with risk-growth index showing correlation.',
          reasoning: 'The shift from centralized cloud training to distributed inference (edge devices, robotics, on-premise AI) requires massive hardware buildout across enterprises',
          backing: 'Previous cloud cycles drove episodic inventory rebuilds; physical AI deployment will drive sustained capital expenditure across Fortune 500 companies',
          qualifier: 'medium' as const,
          rebuttal: 'PMI expansion assumes rapid enterprise adoption; implementation may be slower than anticipated. Regulatory concerns or security issues could slow on-premise deployments.',
          time_horizon: 'medium_term' as const,
          supporting_evidence_claims: ['claim-19', 'claim-20', 'claim-34'],
          rebutting_evidence_claims: [],
          converted_to: null,
        },
        {
          id: 'claim-2',
          level: 'main' as const,
          type: 'thesis_candidate' as const,
          category: 'macro' as const,
          claim: '2026 represents the enterprise inflection point where AI agents replace traditional applications',
          evidence: 'Sam Altman: "Enterprise inflection has arrived"; GPT-5.2 achieving 70-74% of knowledge work tasks at expert level',
          reasoning: 'Apps were built for a world where computers couldn\'t think; agents are built for a world where they can',
          backing: 'Enterprise AI platform adoption requires unified models, data, workflows, agents, and governance',
          qualifier: 'high' as const,
          rebuttal: 'Organizations still behave like GPT-4 era users; workplace policies restrict AI agent usage',
          time_horizon: 'medium_term' as const,
          relevant_tickers: ['GOOGL', 'MSFT', 'META', 'ORCL'],
          supporting_evidence_claims: ['claim-21', 'claim-22', 'claim-23', 'claim-24'],
          rebutting_evidence_claims: ['claim-25'],
          converted_to: null,
        },
      ],
      evidence_claims: [
        {
          id: 'claim-19',
          level: 'evidence' as const,
          type: 'supporting' as const,
          claim: 'Dollar weakness and industrial commodity strength signal reflation',
          evidence: 'MACD sell signal in the dollar, combined with MSCI World ex-US strength and rising industrial commodities',
          confidence: 'medium' as const,
          supports_main_claims: ['claim-1'],
        },
        {
          id: 'claim-20',
          level: 'evidence' as const,
          type: 'supporting' as const,
          claim: 'Risk-growth index correlates with PMI; both rising',
          evidence: 'Risk-growth index overlaid with US PMIs/ISM PMI showing correlation',
          confidence: 'medium' as const,
          supports_main_claims: ['claim-1'],
        },
      ],
      metadata: {
        extraction_date: '2025-12-24',
        source_skill: '/process-transcript',
        toulmin_version: '1.0',
        note: 'Sample structure with 2 main claims + 2 evidence claims. Full audit has 78 total claims (18 main + 60 evidence).',
      },
    };

    const [insight] = await db
      .insert(researchInsights)
      .values({
        researchArtifactId: artifact.id,
        summary:
          'Comprehensive analysis of AI transition from applications to agents, projecting 2026 as the enterprise inflection point. Covers PMI expansion, labor market disruption, compute demand dynamics, and specific infrastructure plays (Cisco, Micron, Tesla, Oracle).',
        keyThemes: [
          'AI agents',
          'enterprise adoption',
          'PMI expansion',
          'labor deflation',
          'compute demand',
          'multimodality',
          'infrastructure buildout',
        ],
        claimsStructure: claimsStructure as any,
        relevantTickers: ['CSCO', 'MU', 'NVDA', 'GOOGL', 'MSFT', 'META', 'ORCL', 'TSLA', 'BTC', 'AMD', 'IWM'],
        timeHorizon: 'medium_term',
        confidenceLevel: 'high',
        structuredBy: 'ai',
        structuredAt: new Date('2025-12-24'),
      })
      .returning();

    console.log(`   ✅ Insight created: ${insight.id}`);
    console.log(`   Summary: ${insight.summary}`);
    console.log(`   Main Claims: ${claimsStructure.main_claims.length}`);
    console.log(`   Evidence Claims: ${claimsStructure.evidence_claims.length}\n`);

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Upload Complete!\n');
    console.log(`   Artifact ID: ${artifact.id}`);
    console.log(`   Insight ID: ${insight.id}`);
    console.log(`   Tickers: ${insight.relevantTickers?.join(', ')}`);
    console.log(`   Themes: ${insight.keyThemes?.length || 0}`);
    console.log('\n→ Next: View in app at /research/' + insight.id);
    console.log('→ Convert claims to theses/views in UI (Week 3)\n');

  } catch (error) {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  }
}

uploadAudit();
