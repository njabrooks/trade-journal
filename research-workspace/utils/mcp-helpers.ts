/**
 * Supabase MCP Integration Helpers
 *
 * Functions to interact with Supabase database via MCP tools.
 * These are called by skills to read/write research data.
 *
 * NOTE: Requires Supabase MCP server to be configured in Claude Code.
 * See: https://github.com/modelcontextprotocol/servers/tree/main/src/supabase
 */

import type {
  ResearchArtifactData,
  ResearchInsightData,
  MacroThesisData,
  AssetViewData,
} from './validators';

/**
 * Read all macro theses from database
 * Uses MCP to query the macro_theses table
 */
export async function readMacroTheses(filter?: {
  status?: string;
  thesisType?: string;
}): Promise<any[]> {
  // This will use the Supabase MCP tool when available
  // For now, this is a placeholder that shows the expected interface
  throw new Error('MCP integration not yet configured. Use the /mcp-read-theses skill instead.');

  // Expected MCP call structure:
  // const result = await mcp.supabase.query({
  //   table: 'macro_theses',
  //   select: '*',
  //   filters: filter
  // });
  // return result.data;
}

/**
 * Read all asset views from database
 */
export async function readAssetViews(filter?: {
  underlying?: string;
  status?: string;
}): Promise<any[]> {
  throw new Error('MCP integration not yet configured. Use the /mcp-read-views skill instead.');

  // Expected MCP call structure:
  // const result = await mcp.supabase.query({
  //   table: 'asset_views',
  //   select: '*, macro_theses(title)',
  //   filters: filter
  // });
  // return result.data;
}

/**
 * Upload research artifact to database
 * Returns the inserted artifact ID
 */
export async function uploadArtifact(data: ResearchArtifactData): Promise<string> {
  throw new Error('MCP integration not yet configured. Use the /mcp-upload-artifact skill instead.');

  // Expected MCP call structure:
  // const result = await mcp.supabase.insert({
  //   table: 'research_artifacts',
  //   data: {
  //     title: data.title,
  //     author: data.author,
  //     source_type: data.sourceType,
  //     source_url: data.sourceUrl,
  //     published_date: data.publishedDate,
  //     raw_content: data.rawContent,
  //     tags: data.tags,
  //     word_count: data.wordCount,
  //     reading_time_minutes: data.readingTimeMinutes,
  //     status: data.status,
  //   }
  // });
  // return result.data.id;
}

/**
 * Upload research insight to database
 * Returns the inserted insight ID
 */
export async function uploadInsight(data: ResearchInsightData): Promise<string> {
  throw new Error('MCP integration not yet configured. Use the /mcp-upload-insight skill instead.');

  // Expected MCP call structure:
  // const result = await mcp.supabase.insert({
  //   table: 'research_insights',
  //   data: {
  //     artifact_id: data.artifactId,
  //     summary: data.summary,
  //     key_themes: data.keyThemes,
  //     key_claims: data.keyClaims,
  //     supporting_evidence: data.supportingEvidence,
  //     counter_evidence: data.counterEvidence,
  //     time_horizon: data.timeHorizon,
  //     confidence_level: data.confidenceLevel,
  //     relevant_tickers: data.relevantTickers,
  //     human_reviewed: data.humanReviewed,
  //     human_review_notes: data.humanReviewNotes,
  //   }
  // });
  // return result.data.id;
}

/**
 * Create new macro thesis
 */
export async function createMacroThesis(data: MacroThesisData): Promise<string> {
  throw new Error('MCP integration not yet configured. Use the /mcp-create-thesis skill instead.');

  // Expected MCP call structure:
  // const result = await mcp.supabase.insert({
  //   table: 'macro_theses',
  //   data: {
  //     title: data.title,
  //     description: data.description,
  //     thesis_type: data.thesisType,
  //     conviction: data.conviction,
  //     time_horizon: data.timeHorizon,
  //     status: data.status,
  //     tags: data.tags,
  //     next_review_date: data.nextReviewDate,
  //   }
  // });
  // return result.data.id;
}

/**
 * Create new asset view
 */
export async function createAssetView(data: AssetViewData): Promise<string> {
  throw new Error('MCP integration not yet configured. Use the /mcp-create-view skill instead.');

  // Expected MCP call structure:
  // const result = await mcp.supabase.insert({
  //   table: 'asset_views',
  //   data: {
  //     underlying: data.underlying,
  //     title: data.title,
  //     description: data.description,
  //     view_type: data.viewType,
  //     conviction: data.conviction,
  //     time_horizon: data.timeHorizon,
  //     status: data.status,
  //     macro_thesis_id: data.macroThesisId,
  //     tags: data.tags,
  //     next_review_date: data.nextReviewDate,
  //   }
  // });
  // return result.data.id;
}

/**
 * Read research artifacts with optional filters
 */
export async function readArtifacts(filter?: {
  status?: string;
  sourceType?: string;
  tags?: string[];
}): Promise<any[]> {
  throw new Error('MCP integration not yet configured.');
}

/**
 * Read research insights with optional filters
 */
export async function readInsights(filter?: {
  artifactId?: string;
  confidenceLevel?: string;
}): Promise<any[]> {
  throw new Error('MCP integration not yet configured.');
}

/**
 * Helper: Format macro theses for display in summaries
 */
export function formatThesesForDisplay(theses: any[]): string {
  return theses
    .map(
      (t) =>
        `- **${t.title}** (${t.thesis_type}, ${t.conviction} conviction, ${t.status})\n  ${t.description}`
    )
    .join('\n\n');
}

/**
 * Helper: Format asset views for display in summaries
 */
export function formatViewsForDisplay(views: any[]): string {
  return views
    .map(
      (v) =>
        `- **${v.underlying}: ${v.title}** (${v.view_type}, ${v.conviction} conviction, ${v.status})\n  ${v.description}`
    )
    .join('\n\n');
}

/**
 * Helper: Find theses related to themes
 */
export function findRelatedTheses(theses: any[], themes: string[]): any[] {
  // Simple keyword matching for now
  const themeLower = themes.map((t) => t.toLowerCase());

  return theses.filter((thesis) => {
    const searchText = `${thesis.title} ${thesis.description} ${thesis.tags?.join(' ')}`.toLowerCase();
    return themeLower.some((theme) => searchText.includes(theme));
  });
}

/**
 * Helper: Find views related to tickers
 */
export function findRelatedViews(views: any[], tickers: string[]): any[] {
  return views.filter((view) => tickers.includes(view.underlying));
}
