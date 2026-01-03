/**
 * Shared types for standardized linking system
 *
 * Supports linking between entities in the decision hierarchy:
 * Claims → Macro Theses → Asset Theses → Strategies
 */

export type SourceEntityType = 'claim' | 'macroThesis' | 'assetThesis' | 'strategy';
export type TargetEntityType = 'macroThesis' | 'assetThesis' | 'strategy';
export type LinkMode = 'link_existing' | 'create_new';
export type RelationshipType = 'supports' | 'refutes' | 'foundation';

/**
 * Represents a linked entity for display in badges
 */
export interface LinkedEntity {
  id: string;
  title: string;
  type: 'macro' | 'asset' | 'strategy';
  relationshipType?: RelationshipType; // Claims only
  ticker?: string; // For asset theses
}

/**
 * Configuration for linking behavior based on source entity type
 */
export interface LinkingConfig {
  sourceType: SourceEntityType;
  validTargetTypes: TargetEntityType[];
  allowMultipleTargets: boolean;
  requireRelationshipType: boolean; // Claims only
}

/**
 * Available entity for selection in "Link to Existing" mode
 */
export interface AvailableEntity {
  id: string;
  title: string;
  type?: TargetEntityType; // Used to filter entities by type (e.g., for claims)
  ticker?: string;
  status?: string;
  thesisType?: string;
}
