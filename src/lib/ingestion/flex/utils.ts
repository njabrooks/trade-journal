// Utility functions for Flex ingestion

/**
 * Extracts date from filename like "flex_trades_20240115.csv"
 */
export function extractDateFromFilename(filename: string): string | null {
  // Try to match YYYYMMDD pattern
  const match = filename.match(/(\d{8})/);
  if (match) {
    const dateStr = match[1];
    // Format as YYYY-MM-DD
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return null;
}

/**
 * Determines file type from filename
 */
export function getFileType(filename: string): 'trades' | 'positions' | 'mtm' | 'nav' | 'unknown' {
  const lower = filename.toLowerCase();
  if (lower.includes('trade')) return 'trades';
  if (lower.includes('position')) return 'positions';
  if (lower.includes('mtm') || lower.includes('mark')) return 'mtm';
  if (lower.includes('nav') || lower.includes('account') || lower.includes('equity')) return 'nav';
  return 'unknown';
}

