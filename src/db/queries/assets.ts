"use server";

/**
 * Asset Queries
 *
 * CRUD operations for the assets and asset_aliases tables.
 * Ported from twotreescap-app/db/queries/assets-queries.ts.
 */

import { db } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { assets, assetAliases } from "@/db/schema";
import type { Asset, NewAsset, AssetAlias, NewAssetAlias } from "@/db/schema";

// ============================================================================
// Asset Queries
// ============================================================================

export async function getAssetById(id: string): Promise<Asset | null> {
  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  return asset || null;
}

export async function getAssetByTicker(ticker: string): Promise<Asset | null> {
  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.ticker, ticker.toUpperCase()))
    .limit(1);
  return asset || null;
}

export async function getAssetByConid(conid: string): Promise<Asset | null> {
  const [asset] = await db
    .select()
    .from(assets)
    .where(eq(assets.ibkrConid, conid))
    .limit(1);
  return asset || null;
}

export async function createAsset(asset: NewAsset): Promise<Asset> {
  const [newAsset] = await db
    .insert(assets)
    .values({
      ...asset,
      ticker: asset.ticker.toUpperCase(),
    })
    .returning();
  return newAsset;
}

export async function updateAsset(
  id: string,
  updates: Partial<Omit<NewAsset, 'id'>>
): Promise<Asset | null> {
  const [updated] = await db
    .update(assets)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(assets.id, id))
    .returning();
  return updated || null;
}

export async function getActiveAssets(): Promise<Asset[]> {
  return db
    .select()
    .from(assets)
    .where(eq(assets.isActive, true));
}

export async function getAssetsByClass(assetClass: string): Promise<Asset[]> {
  return db
    .select()
    .from(assets)
    .where(and(
      eq(assets.assetClass, assetClass),
      eq(assets.isActive, true)
    ));
}

// ============================================================================
// Asset Alias Queries
// ============================================================================

export async function getAssetByAlias(
  alias: string,
  source: string | null
): Promise<Asset | null> {
  // Try exact alias + source match first
  const [result] = await db
    .select({
      asset: assets,
    })
    .from(assetAliases)
    .innerJoin(assets, eq(assetAliases.assetId, assets.id))
    .where(
      and(
        eq(assetAliases.alias, alias.toUpperCase()),
        source ? eq(assetAliases.source, source) : isNull(assetAliases.source)
      )
    )
    .limit(1);

  if (result) return result.asset;

  // If no exact match, try universal alias (source = null)
  if (source) {
    const [universal] = await db
      .select({
        asset: assets,
      })
      .from(assetAliases)
      .innerJoin(assets, eq(assetAliases.assetId, assets.id))
      .where(
        and(
          eq(assetAliases.alias, alias.toUpperCase()),
          isNull(assetAliases.source)
        )
      )
      .limit(1);
    return universal?.asset || null;
  }

  return null;
}

export async function createAssetAlias(
  assetId: string,
  alias: string,
  source: string | null
): Promise<AssetAlias> {
  const [newAlias] = await db
    .insert(assetAliases)
    .values({
      assetId,
      alias: alias.toUpperCase(),
      source,
    })
    .returning();
  return newAlias;
}

export async function getAliasesForAsset(assetId: string): Promise<AssetAlias[]> {
  return db
    .select()
    .from(assetAliases)
    .where(eq(assetAliases.assetId, assetId));
}

export async function aliasExists(alias: string, source: string | null): Promise<boolean> {
  const [result] = await db
    .select({ id: assetAliases.id })
    .from(assetAliases)
    .where(
      and(
        eq(assetAliases.alias, alias.toUpperCase()),
        source ? eq(assetAliases.source, source) : isNull(assetAliases.source)
      )
    )
    .limit(1);
  return !!result;
}

export async function upsertAssetAlias(
  assetId: string,
  alias: string,
  source: string | null
): Promise<AssetAlias> {
  const existing = await aliasExists(alias, source);
  if (existing) {
    const [result] = await db
      .select()
      .from(assetAliases)
      .where(
        and(
          eq(assetAliases.alias, alias.toUpperCase()),
          source ? eq(assetAliases.source, source) : isNull(assetAliases.source)
        )
      )
      .limit(1);
    return result;
  }
  return createAssetAlias(assetId, alias, source);
}
