import {
  getAssetByTicker,
  getAssetByConid,
  getAssetByAlias,
  createAsset,
  upsertAssetAlias,
} from "@/db/queries/assets";
import type {
  SelectAsset,
  AssetResolverInterface,
  AssetResolverParams,
} from "@/types/event-sourcing";

// ============================================================================
// Asset Resolver Service
// ============================================================================

/**
 * AssetResolver - Resolves source-specific identifiers to canonical assets
 *
 * Resolution strategy:
 * 1. Try IBKR conid (most reliable for IBKR data)
 * 2. Try source-specific alias
 * 3. Try universal alias (source = null)
 * 4. Try ticker match
 * 5. Create new asset if not found
 *
 * The resolver maintains a cache during batch operations to minimize
 * database queries.
 */
export class AssetResolver implements AssetResolverInterface {
  private cache: Map<string, SelectAsset> = new Map();

  /**
   * Generate a cache key for a given resolution request
   */
  private getCacheKey(params: AssetResolverParams): string {
    return `${params.source}:${params.conid || ''}:${params.identifier}`;
  }

  /**
   * Resolve a single asset from source-specific identifiers
   */
  async resolve(params: AssetResolverParams): Promise<SelectAsset> {
    const cacheKey = this.getCacheKey(params);

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let asset: SelectAsset | null = null;

    // Strategy 1: Try IBKR conid (most reliable)
    if (params.conid) {
      asset = await getAssetByConid(params.conid);
    }

    // Strategy 2: Try source-specific alias
    if (!asset) {
      asset = await getAssetByAlias(params.identifier, params.source);
    }

    // Strategy 3: Try universal alias (source = null)
    if (!asset) {
      asset = await getAssetByAlias(params.identifier, null);
    }

    // Strategy 4: Try ticker match
    if (!asset) {
      asset = await getAssetByTicker(params.identifier);
    }

    // Strategy 5: Create new asset
    if (!asset) {
      asset = await this.createNewAsset(params);
    }

    // Ensure alias exists for this source
    await this.ensureAlias(asset.id, params.identifier, params.source);

    // Cache the result
    this.cache.set(cacheKey, asset);

    return asset;
  }

  /**
   * Resolve multiple assets in batch (optimized for bulk operations)
   */
  async resolveMany(paramsList: AssetResolverParams[]): Promise<Map<string, SelectAsset>> {
    const results = new Map<string, SelectAsset>();

    // Process in parallel with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < paramsList.length; i += BATCH_SIZE) {
      const batch = paramsList.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (params) => {
          const asset = await this.resolve(params);
          return { key: this.getCacheKey(params), asset };
        })
      );

      for (const { key, asset } of batchResults) {
        results.set(key, asset);
      }
    }

    return results;
  }

  /**
   * Add an alias for an existing asset
   */
  async addAlias(assetId: string, alias: string, source: string): Promise<void> {
    await upsertAssetAlias(assetId, alias, source);
  }

  /**
   * Create a new asset based on resolution params
   */
  private async createNewAsset(params: AssetResolverParams): Promise<SelectAsset> {
    // Determine asset class based on source and identifier patterns
    const assetClass = this.inferAssetClass(params);

    const asset = await createAsset({
      ticker: params.identifier.toUpperCase(),
      name: params.name || params.identifier,
      assetClass,
      ibkrConid: params.conid || null,
      isActive: true,
    });

    console.log(`Created new asset: ${asset.ticker} (${asset.id}) - ${assetClass}`);

    return asset;
  }

  /**
   * Ensure an alias exists for the given asset/source combination
   */
  private async ensureAlias(assetId: string, alias: string, source: string): Promise<void> {
    await upsertAssetAlias(assetId, alias, source);
  }

  /**
   * Infer asset class from resolution params
   */
  private inferAssetClass(params: AssetResolverParams): string {
    // If explicitly provided, use it
    if (params.assetClass) {
      return params.assetClass;
    }

    // Source-based inference
    if (params.source === 'koinly') {
      return 'crypto';
    }

    // Pattern-based inference
    const identifier = params.identifier.toUpperCase();

    // Common crypto patterns
    if (this.isCryptoTicker(identifier)) {
      return 'crypto';
    }

    // USD is always cash
    if (identifier === 'USD' || identifier === 'USD.USD') {
      return 'cash';
    }

    // Default to equity
    return 'equity';
  }

  /**
   * Check if identifier looks like a crypto ticker
   */
  private isCryptoTicker(ticker: string): boolean {
    const cryptoPatterns = [
      'BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK',
      'MATIC', 'UNI', 'AAVE', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL',
      'HBAR', 'ICP', 'EGLD', 'THETA', 'XTZ', 'XMR', 'EOS', 'CAKE', 'GRT', 'KLAY',
    ];

    // Remove common suffixes like .USD, -USD, etc.
    const cleaned = ticker.replace(/[.\-_](USD|EUR|GBP|USDT|USDC)$/i, '');

    return cryptoPatterns.includes(cleaned) || /^[A-Z0-9]{2,10}$/.test(cleaned);
  }

  /**
   * Clear the resolver cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance for shared use
let resolverInstance: AssetResolver | null = null;

export function getAssetResolver(): AssetResolver {
  if (!resolverInstance) {
    resolverInstance = new AssetResolver();
  }
  return resolverInstance;
}

export function resetAssetResolver(): void {
  if (resolverInstance) {
    resolverInstance.clearCache();
  }
  resolverInstance = null;
}
