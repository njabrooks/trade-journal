/**
 * Solana token balance normalization.
 * Converts Helius DAS API token holdings to CryptoPositionInput.
 */

import type { HeliusFungibleToken } from './api';
import type { CryptoPositionInput } from '../crypto/types';
import type { CashBalanceInput } from '../crypto/cashBalances';
import { normalizeSolanaTokenSymbol } from '../crypto/pairNormalization';

// Skip stablecoins and wrapped settlement currencies
const SKIP_TOKENS = new Set(['USDC', 'USDT', 'DAI', 'PYUSD', 'USDH', 'USH', 'USDS']);

// Minimum USD value to include (skip dust/spam tokens)
const MIN_USD_VALUE = 0.01;

/**
 * Normalize Solana token holdings into position inputs.
 */
export function normalizeSolanaPositions(
  tokens: HeliusFungibleToken[],
  nativeSol: { lamports: number; pricePerSol: number | null; totalPrice: number | null } | null,
  accountId: string,
  snapshotDate: string
): CryptoPositionInput[] {
  const results: CryptoPositionInput[] = [];

  // Native SOL position
  if (nativeSol && nativeSol.lamports > 0) {
    const solAmount = nativeSol.lamports / 1e9; // lamports to SOL
    const spot = nativeSol.pricePerSol;
    const absNotional = nativeSol.totalPrice ?? (spot ? solAmount * spot : null);

    if (absNotional === null || absNotional >= MIN_USD_VALUE) {
      results.push({
        accountId,
        underlyingId: null,
        assetClass: 'CRYPTO',
        symbol: 'SOL',
        multiplier: '1',
        side: 'LONG',
        quantity: solAmount.toString(),
        avgPrice: null,
        costBasisMoney: null,
        positionType: 'crypto_long',
        isOpen: true,
        spot: spot?.toString() ?? null,
        absNotional: absNotional?.toFixed(6) ?? null,
        unrealizedPnl: null,
        snapshotDate,
      });
    }
  }

  // SPL token positions
  for (const token of tokens) {
    const symbol = normalizeSolanaTokenSymbol(token.content.metadata.symbol);
    if (SKIP_TOKENS.has(symbol)) continue;

    const amount = token.token_info.balance / Math.pow(10, token.token_info.decimals);
    if (amount === 0) continue;

    const priceInfo = token.token_info.price_info;
    const spot = priceInfo?.price_per_token ?? null;
    const absNotional = priceInfo?.total_price ?? null;

    // Skip dust tokens
    if (absNotional !== null && absNotional < MIN_USD_VALUE) continue;

    results.push({
      accountId,
      underlyingId: null,
      assetClass: 'CRYPTO',
      symbol,
      multiplier: '1',
      side: amount > 0 ? 'LONG' : 'SHORT',
      quantity: amount.toString(),
      avgPrice: null,
      costBasisMoney: null,
      positionType: amount > 0 ? 'crypto_long' : 'crypto_short',
      isOpen: true,
      spot: spot?.toString() ?? null,
      absNotional: absNotional?.toFixed(6) ?? null,
      unrealizedPnl: null,
      snapshotDate,
    });
  }

  return results;
}

/**
 * Extract stablecoin balances from Solana tokens as cash.
 */
export function extractSolanaCashBalances(
  tokens: HeliusFungibleToken[],
  accountId: string,
  snapshotDate: string
): CashBalanceInput[] {
  const results: CashBalanceInput[] = [];

  for (const token of tokens) {
    const symbol = normalizeSolanaTokenSymbol(token.content.metadata.symbol);
    if (!SKIP_TOKENS.has(symbol)) continue;

    const amount = token.token_info.balance / Math.pow(10, token.token_info.decimals);
    if (amount === 0) continue;

    const totalPrice = token.token_info.price_info?.total_price ?? null;

    results.push({
      accountId,
      snapshotDate,
      currency: symbol,
      balance: amount.toString(),
      balanceUsd: totalPrice?.toString() ?? amount.toString(),
      source: 'solana',
    });
  }

  return results;
}
