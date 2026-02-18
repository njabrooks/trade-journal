/**
 * IBKR Combined File Parser
 *
 * Parses IBKR's combined report format which contains multiple report types
 * (STFU, POST, FXPO, TRNT, RATE) in a single CSV file.
 *
 * File Structure:
 * - BOF: Beginning of File (metadata)
 * - BOA/EOA: Beginning/End of Account day blocks
 * - BOS/EOS: Beginning/End of Section blocks within each day
 * - HEADER: Column headers for each section
 * - DATA: Data rows for each section
 *
 * Section Types:
 * - STFU: Statement of Funds (cash movements, dividends, trades)
 * - POST: Positions (end-of-day holdings)
 * - FXPO: FX Balances (currency positions)
 * - TRNT: Trades (buy/sell transactions)
 * - RATE: Conversion Rates (FX rates)
 *
 * Ported from twotreescap-app/services/event-sourcing/adapters/ibkr/ibkr-combined-parser.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Section codes used in IBKR combined files
 */
export type IbkrSectionCode = "STFU" | "POST" | "FXPO" | "TRNT" | "RATE";

/**
 * Metadata from the BOF (Beginning of File) line
 */
export interface IbkrFileMetadata {
  accountId: string;
  accountName: string;
  version: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
  generatedTimestamp: string;
  rawLine: string;
}

/**
 * Metadata from a BOA (Beginning of Account day) line
 */
export interface IbkrDayMetadata {
  accountId: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
}

/**
 * A single section (BOS/EOS block) within a day
 */
export interface IbkrSection {
  code: IbkrSectionCode;
  title: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  summaryValue: string;
}

/**
 * Data for a single day (BOA/EOA block)
 */
export interface IbkrDayData {
  metadata: IbkrDayMetadata;
  sections: Map<IbkrSectionCode, IbkrSection>;
}

/**
 * Complete parsed IBKR combined file
 */
export interface IbkrCombinedFile {
  metadata: IbkrFileMetadata;
  days: IbkrDayData[];
  allSections: {
    STFU: IbkrSection[];
    POST: IbkrSection[];
    FXPO: IbkrSection[];
    TRNT: IbkrSection[];
    RATE: IbkrSection[];
  };
}

/**
 * Options for CSV conversion
 */
export interface CsvConversionOptions {
  includeHeaders?: boolean;
  dateFilter?: {
    startDate?: string; // YYYYMMDD
    endDate?: string; // YYYYMMDD
  };
}

// ============================================================================
// CSV Parsing Utilities
// ============================================================================

/**
 * Parse a CSV line handling both quoted and unquoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Don't forget the last value
  values.push(current.trim());

  return values;
}

/**
 * Convert a section to standalone CSV format
 */
function sectionToCsv(section: IbkrSection): string {
  const lines: string[] = [];

  // Add header line
  if (section.headers.length > 0) {
    lines.push(section.headers.join(","));
  }

  // Add data rows
  for (const row of section.rows) {
    // Quote values that contain commas
    const quotedRow = row.map((val) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(quotedRow.join(","));
  }

  return lines.join("\n");
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an IBKR combined file
 */
export function parseIbkrCombinedFile(content: string): IbkrCombinedFile {
  let lines = content.split("\n").map((line) => line.trim());

  // Skip any lines before BOF marker (some files have Excel headers like "Column1,Column2,...")
  const bofIndex = lines.findIndex((line) => {
    const values = parseCSVLine(line);
    return values[0] === "BOF";
  });

  if (bofIndex > 0) {
    lines = lines.slice(bofIndex);
  }

  // Initialize result structure
  const result: IbkrCombinedFile = {
    metadata: {
      accountId: "",
      accountName: "",
      version: "",
      startDate: "",
      endDate: "",
      generatedTimestamp: "",
      rawLine: "",
    },
    days: [],
    allSections: {
      STFU: [],
      POST: [],
      FXPO: [],
      TRNT: [],
      RATE: [],
    },
  };

  let currentDay: IbkrDayData | null = null;
  let currentSection: IbkrSection | null = null;
  let currentHeaders: string[] = [];

  for (const line of lines) {
    if (!line) continue;

    const values = parseCSVLine(line);
    const marker = values[0];

    switch (marker) {
      case "BOF":
        // Beginning of File - extract metadata
        result.metadata = {
          accountId: values[1] || "",
          accountName: values[2] || "",
          version: values[3] || "",
          startDate: values[4] || "",
          endDate: values[5] || "",
          generatedTimestamp: values[6] || "",
          rawLine: line,
        };
        break;

      case "BOA":
        // Beginning of Account day
        currentDay = {
          metadata: {
            accountId: values[1] || "",
            startDate: values[2] || "",
            endDate: values[3] || "",
          },
          sections: new Map(),
        };
        break;

      case "EOA":
        // End of Account day
        if (currentDay) {
          result.days.push(currentDay);
          currentDay = null;
        }
        break;

      case "BOS":
        // Beginning of Section
        currentSection = {
          code: values[1] as IbkrSectionCode,
          title: values[2] || "",
          headers: [],
          rows: [],
          rowCount: 0,
          summaryValue: "",
        };
        currentHeaders = [];
        break;

      case "EOS":
        // End of Section
        if (currentSection && currentDay) {
          currentSection.rowCount = parseInt(values[2] || "0");
          currentSection.summaryValue = values[3] || "";

          // Store in current day
          currentDay.sections.set(currentSection.code, { ...currentSection });

          // Also store in allSections for easy access
          const sectionCode = currentSection.code;
          if (result.allSections[sectionCode]) {
            result.allSections[sectionCode].push({ ...currentSection });
          }
        }
        currentSection = null;
        currentHeaders = [];
        break;

      case "HEADER":
        // Header row for current section
        if (currentSection) {
          // Skip the first two columns (HEADER, section code)
          currentHeaders = values.slice(2);
          currentSection.headers = currentHeaders;
        }
        break;

      case "DATA":
        // Data row for current section
        if (currentSection && currentHeaders.length > 0) {
          // Skip the first two columns (DATA, section code)
          const rowData = values.slice(2);
          currentSection.rows.push(rowData);
        }
        break;

      case "EOF":
        // End of File - nothing to do
        break;

      default:
        // Unknown marker - could be malformed data, skip
        break;
    }
  }

  return result;
}

// ============================================================================
// Section Extraction and Conversion
// ============================================================================

/**
 * Get all TRNT (Trades) sections as standalone CSV
 */
export function extractTradesCsv(
  file: IbkrCombinedFile,
  options?: CsvConversionOptions
): string {
  return extractSectionCsv(file, "TRNT", options);
}

/**
 * Get all STFU (Statement of Funds) sections as standalone CSV
 */
export function extractStatementOfFundsCsv(
  file: IbkrCombinedFile,
  options?: CsvConversionOptions
): string {
  return extractSectionCsv(file, "STFU", options);
}

/**
 * Get all POST (Positions) sections as standalone CSV
 */
export function extractPositionsCsv(
  file: IbkrCombinedFile,
  options?: CsvConversionOptions
): string {
  return extractSectionCsv(file, "POST", options);
}

/**
 * Get all FXPO (FX Balances) sections as standalone CSV
 */
export function extractFxBalancesCsv(
  file: IbkrCombinedFile,
  options?: CsvConversionOptions
): string {
  return extractSectionCsv(file, "FXPO", options);
}

/**
 * Get all RATE (Conversion Rates) sections as standalone CSV
 */
export function extractConversionRatesCsv(
  file: IbkrCombinedFile,
  options?: CsvConversionOptions
): string {
  return extractSectionCsv(file, "RATE", options);
}

/**
 * Extract a specific section type as standalone CSV
 */
export function extractSectionCsv(
  file: IbkrCombinedFile,
  sectionCode: IbkrSectionCode,
  options?: CsvConversionOptions
): string {
  const sections = file.allSections[sectionCode];
  if (!sections || sections.length === 0) {
    return "";
  }

  const includeHeaders = options?.includeHeaders ?? true;
  const startDate = options?.dateFilter?.startDate;
  const endDate = options?.dateFilter?.endDate;

  const lines: string[] = [];
  let headersAdded = false;

  for (const section of sections) {
    // Apply date filter if specified
    // Note: We need to check each row's date, but for simplicity we'll filter by section
    // A more precise filter would check individual row dates

    // Add headers once (from first section with headers)
    if (includeHeaders && !headersAdded && section.headers.length > 0) {
      lines.push(section.headers.join(","));
      headersAdded = true;
    }

    // Add data rows
    for (const row of section.rows) {
      // Quote values that need it
      const quotedRow = row.map((val) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      lines.push(quotedRow.join(","));
    }
  }

  return lines.join("\n");
}

/**
 * Extract sections for a specific date range
 */
export function extractSectionsForDateRange(
  file: IbkrCombinedFile,
  startDate: string,
  endDate: string
): IbkrDayData[] {
  return file.days.filter((day) => {
    const dayDate = day.metadata.startDate;
    return dayDate >= startDate && dayDate <= endDate;
  });
}

// ============================================================================
// Statistics and Summary
// ============================================================================

/**
 * Summary statistics for a parsed file
 */
export interface IbkrFileSummary {
  accountId: string;
  accountName: string;
  dateRange: { start: string; end: string };
  totalDays: number;
  sectionCounts: {
    STFU: { sections: number; rows: number };
    POST: { sections: number; rows: number };
    FXPO: { sections: number; rows: number };
    TRNT: { sections: number; rows: number };
    RATE: { sections: number; rows: number };
  };
}

/**
 * Get summary statistics for a parsed file
 */
export function getFileSummary(file: IbkrCombinedFile): IbkrFileSummary {
  const countSection = (sections: IbkrSection[]) => ({
    sections: sections.length,
    rows: sections.reduce((sum, s) => sum + s.rows.length, 0),
  });

  return {
    accountId: file.metadata.accountId,
    accountName: file.metadata.accountName,
    dateRange: {
      start: file.metadata.startDate,
      end: file.metadata.endDate,
    },
    totalDays: file.days.length,
    sectionCounts: {
      STFU: countSection(file.allSections.STFU),
      POST: countSection(file.allSections.POST),
      FXPO: countSection(file.allSections.FXPO),
      TRNT: countSection(file.allSections.TRNT),
      RATE: countSection(file.allSections.RATE),
    },
  };
}

/**
 * Print a human-readable summary of a parsed file
 */
export function printFileSummary(file: IbkrCombinedFile): string {
  const summary = getFileSummary(file);
  const lines = [
    "=".repeat(60),
    "IBKR COMBINED FILE SUMMARY",
    "=".repeat(60),
    `Account: ${summary.accountId} (${summary.accountName})`,
    `Date Range: ${summary.dateRange.start} to ${summary.dateRange.end}`,
    `Total Days: ${summary.totalDays}`,
    "",
    "Section Counts:",
    "-".repeat(40),
    `  STFU (Statement of Funds): ${summary.sectionCounts.STFU.sections} sections, ${summary.sectionCounts.STFU.rows} rows`,
    `  POST (Positions):          ${summary.sectionCounts.POST.sections} sections, ${summary.sectionCounts.POST.rows} rows`,
    `  FXPO (FX Balances):        ${summary.sectionCounts.FXPO.sections} sections, ${summary.sectionCounts.FXPO.rows} rows`,
    `  TRNT (Trades):             ${summary.sectionCounts.TRNT.sections} sections, ${summary.sectionCounts.TRNT.rows} rows`,
    `  RATE (Conversion Rates):   ${summary.sectionCounts.RATE.sections} sections, ${summary.sectionCounts.RATE.rows} rows`,
    "=".repeat(60),
  ];
  return lines.join("\n");
}

// ============================================================================
// Adapter Integration Helpers
// ============================================================================

/**
 * Convert trades section to format expected by IbkrTradeAdapter
 *
 * The IbkrTradeAdapter expects a CSV with specific column headers.
 * This function extracts TRNT data and formats it appropriately.
 */
export function prepareTradesForAdapter(file: IbkrCombinedFile): string {
  const csv = extractTradesCsv(file, { includeHeaders: true });

  // The TRNT section headers already match what IbkrTradeAdapter expects
  // No transformation needed
  return csv;
}

/**
 * Convert SOF section to format expected by IbkrSofAdapter
 *
 * The IbkrSofAdapter expects a CSV with specific column headers.
 * This function extracts STFU data and formats it appropriately.
 */
export function prepareStatementOfFundsForAdapter(
  file: IbkrCombinedFile
): string {
  const csv = extractStatementOfFundsCsv(file, { includeHeaders: true });

  // The STFU section headers already match what IbkrSofAdapter expects
  // No transformation needed
  return csv;
}

/**
 * Get all unique dates in the file
 */
export function getUniqueDates(file: IbkrCombinedFile): string[] {
  const dates = new Set<string>();
  for (const day of file.days) {
    dates.add(day.metadata.startDate);
  }
  return Array.from(dates).sort();
}

/**
 * Get all unique symbols from trades
 */
export function getUniqueSymbolsFromTrades(file: IbkrCombinedFile): string[] {
  const symbols = new Set<string>();

  for (const section of file.allSections.TRNT) {
    const symbolIndex = section.headers.indexOf("Symbol");
    if (symbolIndex >= 0) {
      for (const row of section.rows) {
        const symbol = row[symbolIndex];
        if (symbol) {
          symbols.add(symbol);
        }
      }
    }
  }

  return Array.from(symbols).sort();
}

/**
 * Get all unique symbols from positions
 */
export function getUniqueSymbolsFromPositions(
  file: IbkrCombinedFile
): string[] {
  const symbols = new Set<string>();

  for (const section of file.allSections.POST) {
    const symbolIndex = section.headers.indexOf("Symbol");
    if (symbolIndex >= 0) {
      for (const row of section.rows) {
        const symbol = row[symbolIndex];
        if (symbol) {
          symbols.add(symbol);
        }
      }
    }
  }

  return Array.from(symbols).sort();
}

// ============================================================================
// Export
// ============================================================================

export default {
  parseIbkrCombinedFile,
  extractTradesCsv,
  extractStatementOfFundsCsv,
  extractPositionsCsv,
  extractFxBalancesCsv,
  extractConversionRatesCsv,
  extractSectionCsv,
  extractSectionsForDateRange,
  getFileSummary,
  printFileSummary,
  prepareTradesForAdapter,
  prepareStatementOfFundsForAdapter,
  getUniqueDates,
  getUniqueSymbolsFromTrades,
  getUniqueSymbolsFromPositions,
};
