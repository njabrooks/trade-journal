/**
 * Laevitas x402 API Client
 *
 * Provides access to Laevitas derivatives data via the x402 pay-per-request protocol.
 * Uses Solana USDC micropayments (~$0.001/request, $0.10 per 100-call bundle).
 *
 * Required env vars:
 *   LAEVITAS_SOLANA_PRIVATE_KEY - Base58-encoded Solana private key for signing payments
 *
 * Usage:
 *   import { laevitas } from './lib/laevitas.js';
 *   const data = await laevitas.getPerpVolume('hyperliquid');
 *   const snapshot = await laevitas.getPerpSnapshot('hyperliquid');
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const LAEVITAS_BASE = 'https://apiv2.laevitas.ch/api/v1';
const CREDIT_TOKEN_PATH = join(process.env.HOME || '/tmp', '.laevitas-credit-token.json');

// ============================================================================
// Credit Token Cache
// ============================================================================

interface CreditTokenCache {
  token: string;
  expiresAt: number; // unix ms
  creditsRemaining: number;
}

function loadCreditToken(): string | null {
  try {
    if (!existsSync(CREDIT_TOKEN_PATH)) return null;
    const cache: CreditTokenCache = JSON.parse(readFileSync(CREDIT_TOKEN_PATH, 'utf-8'));
    // Token valid if not expired and has credits
    if (cache.expiresAt > Date.now() && cache.creditsRemaining > 0) {
      return cache.token;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCreditToken(token: string, creditsRemaining: number): void {
  const cache: CreditTokenCache = {
    token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000, // 23 hours (tokens last 24h, leave buffer)
    creditsRemaining,
  };
  writeFileSync(CREDIT_TOKEN_PATH, JSON.stringify(cache, null, 2));
}

// ============================================================================
// x402 Payment Flow
// ============================================================================

async function fetchWithX402(endpoint: string): Promise<unknown> {
  const url = `${LAEVITAS_BASE}${endpoint}`;

  // Try cached credit token first
  const cachedToken = loadCreditToken();
  if (cachedToken) {
    const response = await fetch(url, {
      headers: { 'X-Credit-Token': cachedToken },
    });

    if (response.ok) {
      // Update remaining credits from response
      const remaining = response.headers.get('x-credits-remaining');
      if (remaining) {
        saveCreditToken(cachedToken, parseInt(remaining, 10));
      }
      return response.json();
    }

    // Token expired or invalid — fall through to payment flow
    if (response.status !== 402) {
      throw new Error(`Laevitas API error: ${response.status} ${response.statusText}`);
    }
  }

  // Payment required — use @x402/fetch with Solana signing
  const privateKey = process.env.LAEVITAS_SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      'LAEVITAS_SOLANA_PRIVATE_KEY not set. Required for x402 pay-per-request API access. ' +
      'Set a base58-encoded Solana private key with USDC balance in .env.local'
    );
  }

  // Dynamic imports to avoid loading crypto libs when using cached token
  const { x402Client, wrapFetchWithPayment } = await import('@x402/fetch');
  const { registerExactSvmScheme } = await import('@x402/svm/exact/client');
  const { toClientSvmSigner } = await import('@x402/svm');
  const { createKeyPairSignerFromBytes } = await import('@solana/kit');
  const { base58 } = await import('@scure/base');

  const client = new x402Client();
  const keypairBytes = base58.decode(privateKey);
  const keypair = await createKeyPairSignerFromBytes(keypairBytes);
  registerExactSvmScheme(client, { signer: toClientSvmSigner(keypair) });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const response = await fetchWithPayment(url);

  if (!response.ok) {
    throw new Error(`Laevitas x402 payment failed: ${response.status} ${response.statusText}`);
  }

  // Cache the credit token for subsequent calls
  const creditToken = response.headers.get('x-credit-token');
  const remaining = response.headers.get('x-credits-remaining');
  if (creditToken) {
    saveCreditToken(creditToken, remaining ? parseInt(remaining, 10) : 99);
  }

  return response.json();
}

// ============================================================================
// Public API
// ============================================================================

export const laevitas = {
  /**
   * Get perpetual swap catalog for an exchange
   * Returns all perp instruments with current data
   */
  async getPerpCatalog(exchange: string): Promise<unknown> {
    return fetchWithX402(`/perpetuals/catalog?exchange=${exchange.toLowerCase()}`);
  },

  /**
   * Get perpetual swap snapshot for an exchange
   * Returns current state of all perp contracts
   */
  async getPerpSnapshot(exchange: string): Promise<unknown> {
    return fetchWithX402(`/perpetuals/snapshot?exchange=${exchange.toLowerCase()}`);
  },

  /**
   * Get perpetual volume data, optionally filtered by exchange
   * When exchange=all or omitted, returns global aggregate
   */
  async getPerpVolume(exchange?: string): Promise<unknown> {
    const param = exchange ? `?exchange=${exchange.toLowerCase()}` : '';
    return fetchWithX402(`/perpetuals/volume${param}`);
  },

  /**
   * Get perpetual open interest data
   */
  async getPerpOpenInterest(): Promise<unknown> {
    return fetchWithX402('/perpetuals/open-interest');
  },

  /**
   * Get futures volume breakdown by currency and type
   * type: 'c' for CEX, 'd' for DEX
   */
  async getFuturesVolumeBreakdown(currency: string, type: 'c' | 'd' = 'c'): Promise<unknown> {
    return fetchWithX402(`/futures/volume_breakdown/${currency.toUpperCase()}/${type}`);
  },

  /**
   * Get futures OI breakdown by currency and type
   */
  async getFuturesOiBreakdown(currency: string, type: 'c' | 'd' = 'c'): Promise<unknown> {
    return fetchWithX402(`/futures/oi_breakdown/${currency.toUpperCase()}/${type}`);
  },

  /**
   * Calculate Hyperliquid's global perp market share
   * Returns volume and share data combining HL + all other exchanges
   */
  async getHyperliquidMarketShare(): Promise<{
    hyperliquidVolume: unknown;
    globalVolume: unknown;
    allExchangeVolumes: unknown;
  }> {
    const [hlVolume, globalVolume] = await Promise.all([
      this.getPerpVolume('hyperliquid'),
      this.getPerpVolume(),
    ]);

    return {
      hyperliquidVolume: hlVolume,
      globalVolume: globalVolume,
      allExchangeVolumes: globalVolume,
    };
  },

  /**
   * Fetch a raw endpoint (for exploration/debugging)
   */
  async raw(endpoint: string): Promise<unknown> {
    return fetchWithX402(endpoint);
  },
};
