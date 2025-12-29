/**
 * Title Generation Utilities
 *
 * Auto-generates consistent titles for Asset Thesiss and Macro Theses
 * based on structured fields (direction, underlying/sector, time horizon)
 *
 * Part of Phase 2.6.3: Auto-Generated Titles
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type Direction = 'bullish' | 'bearish' | 'neutral' | null | undefined;
export type TimeHorizon = 'long_term' | 'medium_term' | 'short_term' | null | undefined;

// ============================================================================
// Title Capitalization
// ============================================================================

/**
 * Capitalize direction for title display
 */
function capitalizeDirection(direction: Direction): string {
  if (!direction) return '';
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

/**
 * Format time horizon for title display
 */
function formatTimeHorizon(timeHorizon: TimeHorizon): string {
  if (!timeHorizon) return '';

  const mapping: Record<string, string> = {
    'long_term': 'Long Term',
    'medium_term': 'Medium Term',
    'short_term': 'Short Term',
  };

  return mapping[timeHorizon] || '';
}

// ============================================================================
// Asset Thesis Title Generation
// ============================================================================

export interface AssetThesisTitleInput {
  direction: Direction;
  ticker: string | null | undefined; // Underlying ticker
  timeHorizon: TimeHorizon;
}

/**
 * Generate title for Asset Thesis
 * Format: {Direction} {Underlying} {Time Horizon}
 * Example: "Bullish TSLA Medium Term"
 */
export function generateAssetThesisTitle(input: AssetThesisTitleInput): string {
  const parts: string[] = [];

  // Add direction if present
  if (input.direction) {
    parts.push(capitalizeDirection(input.direction));
  }

  // Add ticker if present (required for meaningful title)
  if (input.ticker) {
    parts.push(input.ticker.toUpperCase());
  }

  // Add time horizon if present
  if (input.timeHorizon) {
    parts.push(formatTimeHorizon(input.timeHorizon));
  }

  // If we have at least ticker, generate title
  if (parts.length > 0 && input.ticker) {
    return parts.join(' ');
  }

  // Fallback if insufficient data
  return 'Untitled Asset Thesis';
}

// ============================================================================
// Macro Thesis Title Generation
// ============================================================================

export interface MacroThesisTitleInput {
  direction: Direction;
  sectors: string[] | null | undefined; // Sector/topic
  timeHorizon: TimeHorizon;
}

/**
 * Generate title for Macro Thesis
 * Format: {Direction} {Sector/Topic} {Time Horizon}
 * Example: "Bullish US Inflation Medium Term"
 */
export function generateMacroThesisTitle(input: MacroThesisTitleInput): string {
  const parts: string[] = [];

  // Add direction if present
  if (input.direction) {
    parts.push(capitalizeDirection(input.direction));
  }

  // Add sector/topic if present
  if (input.sectors && input.sectors.length > 0) {
    // Use first sector if multiple provided
    const sector = input.sectors[0];
    parts.push(sector);
  }

  // Add time horizon if present
  if (input.timeHorizon) {
    parts.push(formatTimeHorizon(input.timeHorizon));
  }

  // If we have at least sector, generate title
  if (parts.length > 0 && input.sectors && input.sectors.length > 0) {
    return parts.join(' ');
  }

  // Fallback if insufficient data
  return 'Untitled Macro Thesis';
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if Asset Thesis has sufficient data for title generation
 */
export function canGenerateAssetThesisTitle(input: AssetThesisTitleInput): boolean {
  return !!input.ticker;
}

/**
 * Check if Macro Thesis has sufficient data for title generation
 */
export function canGenerateMacroThesisTitle(input: MacroThesisTitleInput): boolean {
  return !!(input.sectors && input.sectors.length > 0);
}

// ============================================================================
// Title Update Detection
// ============================================================================

/**
 * Check if Asset Thesis title needs regeneration based on field changes
 */
export function shouldRegenerateAssetThesisTitle(
  current: AssetThesisTitleInput,
  previous: AssetThesisTitleInput
): boolean {
  return (
    current.direction !== previous.direction ||
    current.ticker !== previous.ticker ||
    current.timeHorizon !== previous.timeHorizon
  );
}

/**
 * Check if Macro Thesis title needs regeneration based on field changes
 */
export function shouldRegenerateMacroThesisTitle(
  current: MacroThesisTitleInput,
  previous: MacroThesisTitleInput
): boolean {
  // Check direction
  if (current.direction !== previous.direction) return true;

  // Check time horizon
  if (current.timeHorizon !== previous.timeHorizon) return true;

  // Check sectors (compare first sector only)
  const currentSector = current.sectors?.[0];
  const previousSector = previous.sectors?.[0];

  return currentSector !== previousSector;
}
