/**
 * React cache() wrappers for database queries.
 *
 * Next.js calls generateMetadata() and the page component separately,
 * but React's cache() deduplicates calls with the same arguments within
 * a single server request. Wrapping heavy queries here eliminates the
 * double-fetch that otherwise hits the database twice per page load.
 */
import { cache } from 'react';
import { getStrategyDetail } from './strategies';
import { getMacroThesisById } from './macroTheses';
import { getAssetThesisById } from './assetTheses';

export const getCachedStrategyDetail = cache(getStrategyDetail);
export const getCachedMacroThesisById = cache(getMacroThesisById);
export const getCachedAssetThesisById = cache(getAssetThesisById);
