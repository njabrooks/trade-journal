/**
 * Context-aware linking configuration
 *
 * Defines valid target types and linking rules for each source entity type
 */

import type { SourceEntityType, LinkingConfig } from './types';

export const LINKING_CONFIGS: Record<SourceEntityType, LinkingConfig> = {
  claim: {
    sourceType: 'claim',
    validTargetTypes: ['macroThesis', 'assetThesis'],
    allowMultipleTargets: true,
    requireRelationshipType: true, // Claims require supports/refutes/foundation
  },
  macroThesis: {
    sourceType: 'macroThesis',
    validTargetTypes: ['assetThesis'],
    allowMultipleTargets: true,
    requireRelationshipType: false,
  },
  assetThesis: {
    sourceType: 'assetThesis',
    validTargetTypes: ['macroThesis', 'strategy'],
    allowMultipleTargets: true,
    requireRelationshipType: false,
  },
  strategy: {
    sourceType: 'strategy',
    validTargetTypes: ['assetThesis'],
    allowMultipleTargets: false, // One-to-one relationship
    requireRelationshipType: false,
  },
};

/**
 * Get linking configuration for a source entity type
 */
export function getLinkingConfig(sourceType: SourceEntityType): LinkingConfig {
  return LINKING_CONFIGS[sourceType];
}

/**
 * Check if a target type is valid for a source type
 */
export function isValidTarget(
  sourceType: SourceEntityType,
  targetType: string
): boolean {
  const config = getLinkingConfig(sourceType);
  return config.validTargetTypes.includes(targetType as any);
}

/**
 * Check if source type allows multiple target entities
 */
export function allowsMultipleTargets(sourceType: SourceEntityType): boolean {
  return getLinkingConfig(sourceType).allowMultipleTargets;
}

/**
 * Check if source type requires relationship type (supports/refutes/foundation)
 */
export function requiresRelationshipType(sourceType: SourceEntityType): boolean {
  return getLinkingConfig(sourceType).requireRelationshipType;
}
