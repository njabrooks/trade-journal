/**
 * Sector/Topic Taxonomy for Macro Theses
 *
 * Comprehensive taxonomy of investment themes organized by category.
 * Used for structured categorization of macro theses.
 *
 * Part of Phase 2.6.4: Schema & Taxonomy Improvements
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface TaxonomyCategory {
  id: string;
  name: string;
  description: string;
  items: TaxonomyItem[];
}

export interface TaxonomyItem {
  value: string;
  label: string;
  description?: string;
}

// ============================================================================
// Sectors - Industry Verticals
// ============================================================================

export const SECTORS: TaxonomyItem[] = [
  { value: 'Sector - Technology', label: 'Technology sector', description: 'Tech companies and services' },
  { value: 'Sector - Financials', label: 'Financials sector', description: 'Banks, insurance, asset management' },
  { value: 'Sector - Healthcare', label: 'Healthcare sector', description: 'Pharma, biotech, medical devices' },
  { value: 'Sector - Energy', label: 'Energy sector', description: 'Oil, gas, renewables' },
  { value: 'Sector - Industrials', label: 'Industrials sector', description: 'Manufacturing, aerospace, defense' },
  { value: 'Sector - Consumer Discretionary', label: 'Consumer Discretionary sector', description: 'Retail, autos, entertainment' },
  { value: 'Sector - Consumer Staples', label: 'Consumer Staples sector', description: 'Food, beverage, household products' },
  { value: 'Sector - Materials', label: 'Materials sector', description: 'Chemicals, metals, mining' },
  { value: 'Sector - Real Estate', label: 'Real Estate sector', description: 'REITs, property' },
  { value: 'Sector - Utilities', label: 'Utilities sector', description: 'Electric, gas, water' },
  { value: 'Sector - Communication Services', label: 'Communication Services sector', description: 'Telecom, media' },
  { value: 'Sector - Transport', label: 'Transport sector', description: 'Airlines, shipping, logistics' },
];

// ============================================================================
// Industries - Specific Subsectors
// ============================================================================

export const INDUSTRIES: TaxonomyItem[] = [
  // Technology Industries
  { value: 'Industry - AI', label: 'Artificial Intelligence', description: 'AI - Technology' },
  { value: 'Industry - Semiconductors', label: 'Semiconductors', description: 'Semiconductors - Technology' },
  { value: 'Industry - Software', label: 'Software', description: 'Software - Technology' },
  { value: 'Industry - Cloud Computing', label: 'Cloud Computing', description: 'Cloud Computing - Technology' },
  { value: 'Industry - Cybersecurity', label: 'Cybersecurity', description: 'Cybersecurity - Technology' },
  { value: 'Industry - Gaming', label: 'Gaming', description: 'Gaming - Technology' },
  { value: 'Industry - Social Media', label: 'Social Media', description: 'Social Media - Technology' },
  { value: 'Industry - Quantum Computing', label: 'Quantum Computing', description: 'Quantum Computing - Technology' },
  { value: 'Industry - Genomics', label: 'Genomics', description: 'Genomics - Technology' },
  { value: 'Industry - Robotics', label: 'Robotics', description: 'Robotics - Technology' },
  
  // Financial Industries
  { value: 'Industry - Banking', label: 'Banking' },
  { value: 'Industry - Insurance', label: 'Insurance' },
  { value: 'Industry - Asset Management', label: 'Asset Management' },
  { value: 'Industry - Payment Processing', label: 'Payment Processing' },

  // Energy Industries
  { value: 'Industry - Oil & Gas', label: 'Oil & Gas' },
  { value: 'Industry - Renewables', label: 'Renewables' },
  { value: 'Industry - Nuclear', label: 'Nuclear' },

  // Healthcare Industries
  { value: 'Industry - Biotech', label: 'Biotechnology' },
  { value: 'Industry - Pharmaceuticals', label: 'Pharmaceuticals' },
  { value: 'Industry - Medical Devices', label: 'Medical Devices' },

  // Other
  { value: 'Industry - Aviation', label: 'Aviation' },
  { value: 'Industry - Defense', label: 'Defense' },
  { value: 'Industry - Automotive', label: 'Automotive' },
];

// ============================================================================
// Regions - Geographic Markets
// ============================================================================

export const REGIONS: TaxonomyItem[] = [
  { value: 'Global', label: 'Global' },

  // North America
  { value: 'US', label: 'United States' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Mexico', label: 'Mexico' },

  // Europe
  { value: 'Europe', label: 'Europe' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'Germany', label: 'Germany' },
  { value: 'France', label: 'France' },
  { value: 'Italy', label: 'Italy' },
  { value: 'Spain', label: 'Spain' },

  // Asia
  { value: 'Asia', label: 'Asia' },
  { value: 'China', label: 'China' },
  { value: 'Hong Kong', label: 'Hong Kong' },
  { value: 'Japan', label: 'Japan' },
  { value: 'India', label: 'India' },
  { value: 'South Korea', label: 'South Korea' },
  { value: 'Singapore', label: 'Singapore' },

  // Other
  { value: 'South America', label: 'South America' },
  { value: 'Brazil', label: 'Brazil' },
  { value: 'Middle East', label: 'Middle East' },
  { value: 'Africa', label: 'Africa' },
  { value: 'Australia', label: 'Australia' },
];

// ============================================================================
// Asset Classes
// ============================================================================

export const ASSET_CLASSES: TaxonomyItem[] = [
  { value: 'Asset Class - Equities', label: 'Equities', description: 'Stocks and equity indices' },
  { value: 'Asset Class - Bonds', label: 'Bonds', description: 'Government and corporate debt' },
  { value: 'Asset Class - Commodities', label: 'Commodities', description: 'Physical goods' },
  { value: 'Asset Class - FX', label: 'FX', description: 'FX markets' },
  { value: 'Asset Class - Crypto', label: 'Crypto', description: 'Digital assets' },
  { value: 'Asset Class - Real Estate', label: 'Real Estate', description: 'Property markets' },
  { value: 'Asset Class - Options', label: 'Options', description: 'Derivatives' },
  { value: 'Asset Class - Futures', label: 'Futures', description: 'Futures contracts' },
];

// ============================================================================
// Economic Factors - Macro Themes
// ============================================================================

export const ECONOMIC_FACTORS: TaxonomyItem[] = [
  // Inflation & Rates
  { value: 'Inflation', label: 'Inflation' },
  { value: 'Interest Rates', label: 'Interest Rates' },
  { value: 'Central Bank Policy', label: 'Central Bank Policy' },
  { value: 'Fed Policy', label: 'Fed Policy' },
  { value: 'ECB Policy', label: 'ECB Policy' },
  { value: 'Yield Curve', label: 'Yield Curve' },

  // Growth & Employment
  { value: 'Economic Growth', label: 'Economic Growth' },
  { value: 'GDP', label: 'GDP' },
  { value: 'Employment', label: 'Employment' },
  { value: 'Wages', label: 'Wages' },
  { value: 'Consumer Spending', label: 'Consumer Spending' },
  { value: 'Business Investment', label: 'Business Investment' },

  // Markets & Liquidity
  { value: 'Market Structure', label: 'Market Structure' },
  { value: 'Liquidity', label: 'Liquidity' },
  { value: 'Volatility', label: 'Volatility' },
  { value: 'Risk Appetite', label: 'Risk Appetite' },

  // Fiscal & Policy
  { value: 'Fiscal Policy', label: 'Fiscal Policy' },
  { value: 'Government Spending', label: 'Government Spending' },
  { value: 'Regulation', label: 'Regulation' },
  { value: 'Tax Policy', label: 'Tax Policy' },
  { value: 'Monetary Debasement', label: 'Monetary Debasement' },

  // Trade & Global
  { value: 'Trade', label: 'Trade' },
  { value: 'Globalization', label: 'Globalization' },
  { value: 'Supply Chains', label: 'Supply Chains' },
  { value: 'Geopolitics', label: 'Geopolitics' },

  // Structural
  { value: 'Demographics', label: 'Demographics' },
  { value: 'Technology Adoption', label: 'Technology Adoption' },
  { value: 'Climate Change', label: 'Climate Change' },
  { value: 'Energy Transition', label: 'Energy Transition' },
];

// ============================================================================
// Common Combinations - Pre-Built Composite Themes
// ============================================================================

export const COMMON_COMBINATIONS: TaxonomyItem[] = [
  // Regional Economic
  { value: 'US Inflation', label: 'US Inflation' },
  { value: 'European Inflation', label: 'European Inflation' },
  { value: 'Chinese Growth', label: 'Chinese Growth' },
  { value: 'US Employment', label: 'US Employment' },
  { value: 'European Energy Crisis', label: 'European Energy Crisis' },

  // Sector + Region
  { value: 'Chinese Tech Sector', label: 'Chinese Tech Sector' },
  { value: 'US Tech Sector', label: 'US Tech Sector' },
  { value: 'European Banks', label: 'European Banks' },
  { value: 'Japanese Equities', label: 'Japanese Equities' },
  { value: 'Indian Tech', label: 'Indian Tech' },

  // Asset Class + Region
  { value: 'US Treasury Bonds', label: 'US Treasury Bonds' },
  { value: 'European Government Bonds', label: 'European Government Bonds' },
  { value: 'UK Gilts', label: 'UK Gilts' },
  { value: 'Chinese Equities', label: 'Chinese Equities' },

  // Theme-Based
  { value: 'AI Infrastructure Build-Out', label: 'AI Infrastructure Build-Out' },
  { value: 'Deglobalization', label: 'Deglobalization' },
  { value: 'Reshoring', label: 'Reshoring' },
  { value: 'Crypto Adoption', label: 'Crypto Adoption' },
];

// ============================================================================
// All Categories Combined
// ============================================================================

export const TAXONOMY_CATEGORIES: TaxonomyCategory[] = [
  {
    id: 'sectors',
    name: 'Sectors',
    description: 'Industry verticals and broad sector classifications',
    items: SECTORS,
  },
  {
    id: 'industries',
    name: 'Industries',
    description: 'Specific subsectors and industry groups',
    items: INDUSTRIES,
  },
  {
    id: 'regions',
    name: 'Regions',
    description: 'Geographic markets and countries',
    items: REGIONS,
  },
  {
    id: 'asset_classes',
    name: 'Asset Classes',
    description: 'Types of financial instruments',
    items: ASSET_CLASSES,
  },
  {
    id: 'economic_factors',
    name: 'Economic Factors',
    description: 'Macroeconomic themes and policy factors',
    items: ECONOMIC_FACTORS,
  },
  {
    id: 'combinations',
    name: 'Common Combinations',
    description: 'Pre-built composite themes',
    items: COMMON_COMBINATIONS,
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all taxonomy items across all categories
 */
export function getAllTaxonomyItems(): TaxonomyItem[] {
  return TAXONOMY_CATEGORIES.flatMap(category => category.items);
}

/**
 * Get all taxonomy values (for validation)
 */
export function getAllTaxonomyValues(): string[] {
  return getAllTaxonomyItems().map(item => item.value);
}

/**
 * Find a taxonomy item by value
 */
export function findTaxonomyItem(value: string): TaxonomyItem | undefined {
  return getAllTaxonomyItems().find(item => item.value === value);
}

/**
 * Get taxonomy items by category
 */
export function getTaxonomyItemsByCategory(categoryId: string): TaxonomyItem[] {
  const category = TAXONOMY_CATEGORIES.find(cat => cat.id === categoryId);
  return category?.items ?? [];
}

/**
 * Validate if a value exists in the taxonomy
 */
export function isValidTaxonomyValue(value: string): boolean {
  return getAllTaxonomyValues().includes(value);
}

/**
 * Get suggested taxonomy items based on search query
 */
export function searchTaxonomy(query: string): TaxonomyItem[] {
  const lowerQuery = query.toLowerCase();
  return getAllTaxonomyItems().filter(item =>
    item.label.toLowerCase().includes(lowerQuery) ||
    item.value.toLowerCase().includes(lowerQuery) ||
    item.description?.toLowerCase().includes(lowerQuery)
  );
}
