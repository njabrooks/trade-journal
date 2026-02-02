/**
 * Solana blockchain API client via Helius DAS API.
 * Fetches wallet token holdings and native SOL balance.
 *
 * Auth: API key appended to Helius RPC URL.
 * No signing required — read-only wallet data.
 */

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey(): string {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing HELIUS_API_KEY environment variable');
  }
  return apiKey;
}

function getRpcUrl(): string {
  return `${HELIUS_RPC_URL}/?api-key=${getApiKey()}`;
}

/**
 * Parse SOLANA_WALLETS env var (JSON array of {address, label} objects).
 * Returns array of wallet configs for multi-wallet ingestion.
 */
export function parseSolanaWallets(): Array<{ address: string; label: string }> {
  const raw = process.env.SOLANA_WALLETS?.trim();
  if (!raw) {
    throw new Error(
      'Missing SOLANA_WALLETS env var. Expected JSON array: [{"address":"...","label":"..."}]'
    );
  }

  try {
    const wallets = JSON.parse(raw) as Array<{ address: string; label: string }>;
    if (!Array.isArray(wallets) || wallets.length === 0) {
      throw new Error('SOLANA_WALLETS must be a non-empty JSON array');
    }
    for (const w of wallets) {
      if (!w.address || !w.label) {
        throw new Error('Each wallet must have "address" and "label" fields');
      }
    }
    return wallets;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`SOLANA_WALLETS is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

// ── Response Types ──────────────────────────────────────────────

export interface HeliusFungibleToken {
  id: string; // Mint address
  content: {
    metadata: {
      name: string;
      symbol: string; // Token symbol (e.g., "SOL", "JTO", "PYTH")
    };
  };
  token_info: {
    balance: number; // Raw balance (integer, before decimal adjustment)
    decimals: number; // Token decimals
    price_info?: {
      price_per_token: number; // USD price per token
      total_price: number; // Total USD value
      currency: string;
    };
  };
}

interface GetAssetsByOwnerResponse {
  jsonrpc: string;
  result: {
    items: HeliusFungibleToken[];
    total: number;
    limit: number;
    page: number;
    nativeBalance?: {
      lamports: number;
      price_per_sol?: number;
      total_price?: number;
    };
  };
}

interface GetBalanceResponse {
  jsonrpc: string;
  result: {
    value: number; // Lamports
  };
}

// ── API Functions ───────────────────────────────────────────────

/**
 * JSON-RPC POST helper with retry + backoff.
 */
async function heliusRpc<T>(method: string, params: unknown): Promise<T> {
  let lastError: Error | null = null;
  const url = getRpcUrl();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: method,
          method,
          params,
        }),
      });

      if (response.status === 429) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Solana] Rate limited (429), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Helius API error ${response.status}: ${text}`);
      }

      const json = await response.json() as any;
      if (json.error) {
        throw new Error(`Helius RPC error ${json.error.code}: ${json.error.message}`);
      }
      return json as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[Solana] Request failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Helius API request failed after retries');
}

/**
 * Fetch all fungible token holdings for a wallet using Helius DAS API.
 * Returns SPL tokens with metadata and price info.
 * Also returns native SOL balance via nativeBalance field.
 */
export async function fetchTokenHoldings(
  walletAddress: string
): Promise<{
  tokens: HeliusFungibleToken[];
  nativeBalance: { lamports: number; pricePerSol: number | null; totalPrice: number | null } | null;
}> {
  const response = await heliusRpc<GetAssetsByOwnerResponse>('getAssetsByOwner', {
    ownerAddress: walletAddress,
    displayOptions: {
      showFungible: true,
      showNativeBalance: true,
    },
    page: 1,
    limit: 1000,
  });

  // Filter for fungible tokens only (skip NFTs, compressed NFTs, etc.)
  const tokens = response.result.items.filter(
    (item) =>
      item.token_info &&
      item.content?.metadata?.symbol &&
      item.token_info.decimals !== undefined
  );

  const nativeBalance = response.result.nativeBalance
    ? {
        lamports: response.result.nativeBalance.lamports,
        pricePerSol: response.result.nativeBalance.price_per_sol ?? null,
        totalPrice: response.result.nativeBalance.total_price ?? null,
      }
    : null;

  return { tokens, nativeBalance };
}

/**
 * Fetch native SOL balance (in lamports) via standard RPC.
 * Fallback if nativeBalance isn't returned by getAssetsByOwner.
 */
export async function fetchSolBalance(walletAddress: string): Promise<number> {
  const response = await heliusRpc<GetBalanceResponse>('getBalance', [walletAddress]);
  return response.result.value;
}
