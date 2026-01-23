'use client';

/**
 * StandardLinkDialog - Unified dialog for linking entities across the decision hierarchy
 *
 * Supports linking between:
 * - Claims → Macro Theses / Asset Theses
 * - Macro Theses → Asset Theses
 * - Asset Theses → Macro Theses / Strategies
 * - Strategies → Asset Theses
 *
 * Features:
 * - Context-aware: Skips unnecessary steps based on source type
 * - Two modes: "Link to Existing" vs "Create New & Link"
 * - Relationship types for Claims (supports/refutes/foundation)
 * - One-to-one constraint for Strategy→Asset links
 *
 * Based on ConvertClaimToEntityDialog pattern but generalized
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreateMacroThesisForm } from '@/components/linking/CreateMacroThesisForm';
import { CreateAssetThesisForm } from '@/components/linking/CreateAssetThesisForm';
import { CreateStrategyForm } from '@/components/linking/CreateStrategyForm';
import type {
  SourceEntityType,
  TargetEntityType,
  LinkMode,
  RelationshipType,
  AvailableEntity,
} from '@/lib/linking/types';
import { getLinkingConfig } from '@/lib/linking/config';

interface StandardLinkDialogProps {
  sourceType: SourceEntityType;
  sourceId: string;
  sourceTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Pre-select target type to skip the type selection step */
  defaultTargetType?: TargetEntityType;
}

export function StandardLinkDialog({
  sourceType,
  sourceId,
  sourceTitle,
  isOpen,
  onClose,
  onSuccess,
  defaultTargetType,
}: StandardLinkDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get configuration for source type
  const config = getLinkingConfig(sourceType);
  const { validTargetTypes, allowMultipleTargets, requireRelationshipType } = config;

  // Step 0: Choose mode
  const [mode, setMode] = useState<LinkMode | null>(null);

  // Step 1: Choose target type (skip if only one valid type OR if defaultTargetType provided)
  const [targetType, setTargetType] = useState<TargetEntityType | null>(
    defaultTargetType ?? (validTargetTypes.length === 1 ? validTargetTypes[0] : null)
  );

  // Link to Existing mode state
  const [availableEntities, setAvailableEntities] = useState<AvailableEntity[]>([]);
  const [currentlyLinkedEntities, setCurrentlyLinkedEntities] = useState<AvailableEntity[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [relationshipType, setRelationshipType] = useState<RelationshipType>('supports');

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setMode(null);
      setTargetType(defaultTargetType ?? (validTargetTypes.length === 1 ? validTargetTypes[0] : null));
      setSelectedEntityIds([]);
      setCurrentlyLinkedEntities([]);
      setAvailableEntities([]);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen, validTargetTypes, defaultTargetType]);

  // Fetch available entities when switching to link mode
  useEffect(() => {
    if (mode === 'link_existing' && targetType && isOpen) {
      fetchAvailableEntities();
    }
  }, [mode, targetType, isOpen]);

  const fetchAvailableEntities = async () => {
    if (!targetType) return;

    setLoadingEntities(true);
    setError(null);

    try {
      // Build API endpoint based on source and target types
      const endpoint = getAvailableEntitiesEndpoint(sourceType, targetType, sourceId);
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error('Failed to fetch available entities');
      }

      const data = await response.json();
      setAvailableEntities(data.entities || []);
      setCurrentlyLinkedEntities(data.currentlyLinked || []);
    } catch (err) {
      console.error('Error fetching entities:', err);
      setError('Failed to load available entities');
      setAvailableEntities([]);
      setCurrentlyLinkedEntities([]);
    } finally {
      setLoadingEntities(false);
    }
  };

  // Get appropriate API endpoint for fetching available entities
  const getAvailableEntitiesEndpoint = (
    source: SourceEntityType,
    target: TargetEntityType,
    id: string
  ): string => {
    // Map source/target combinations to API endpoints
    if (source === 'claim') {
      return `/api/research/claims/available-entities?claimId=${id}`;
    } else if (source === 'macroThesis' && target === 'assetThesis') {
      return `/api/macro-theses/${id}/link-asset-theses`;
    } else if (source === 'assetThesis' && target === 'macroThesis') {
      return `/api/asset-theses/${id}/link-entities?type=macroThesis`;
    } else if (source === 'assetThesis' && target === 'strategy') {
      return `/api/asset-theses/${id}/link-entities?type=strategy`;
    } else if (source === 'strategy' && target === 'assetThesis') {
      return `/api/strategies/${id}/link-asset-thesis`;
    }
    return '';
  };

  // Handle link to existing entities
  const handleLinkToExisting = async () => {
    if (selectedEntityIds.length === 0) {
      setError('Please select at least one entity to link');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const endpoint = getLinkEndpoint(sourceType, sourceId);

      // Claims have a different API format
      let requestBody;
      if (sourceType === 'claim') {
        // Claims endpoint expects: { claimId, thesisIds, viewIds, relationshipType }
        const thesisIds = selectedEntityIds.filter(id =>
          availableEntities.find(e => e.id === id && e.type === 'macroThesis')
        );
        const viewIds = selectedEntityIds.filter(id =>
          availableEntities.find(e => e.id === id && e.type === 'assetThesis')
        );
        requestBody = {
          claimId: sourceId,
          thesisIds,
          viewIds,
          relationshipType: requireRelationshipType ? relationshipType : undefined,
        };
      } else {
        // Other endpoints use standard format
        requestBody = {
          targetType,
          targetIds: selectedEntityIds,
          relationshipType: requireRelationshipType ? relationshipType : undefined,
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create links');
      }

      // Success
      router.refresh();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error linking entities:', err);
      setError(err instanceof Error ? err.message : 'Failed to create links');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle unlinking an entity
  const handleUnlinkEntity = async (entityId: string) => {
    setError(null);

    try {
      const endpoint = getLinkEndpoint(sourceType, sourceId);

      // Determine the target type for the entity being unlinked
      const entity = currentlyLinkedEntities.find(e => e.id === entityId);
      const entityTargetType = entity?.type || targetType;

      // Claims have a different API format
      let requestBody;
      if (sourceType === 'claim') {
        // Claims endpoint expects: { claimId, targetType, targetId }
        requestBody = {
          claimId: sourceId,
          targetType: entityTargetType,
          targetId: entityId,
        };
      } else {
        // Other endpoints use standard format
        requestBody = {
          targetType: entityTargetType,
          targetId: entityId,
        };
      }

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove link');
      }

      // Remove from currently linked and refresh
      setCurrentlyLinkedEntities((prev) => prev.filter((e) => e.id !== entityId));

      // Refresh to update the page
      router.refresh();
    } catch (err) {
      console.error('Error unlinking entity:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove link');
    }
  };

  // Get link endpoint based on source type
  const getLinkEndpoint = (source: SourceEntityType, id: string): string => {
    switch (source) {
      case 'claim':
        return '/api/research/claims/link-to-entities';
      case 'macroThesis':
        return `/api/macro-theses/${id}/link-asset-theses`;
      case 'assetThesis':
        return `/api/asset-theses/${id}/link-entities`;
      case 'strategy':
        return `/api/strategies/${id}/link-asset-thesis`;
      default:
        return '';
    }
  };

  // Handle create new entity (delegates to form components)
  const handleCreateNew = async (formData: any) => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Forms handle API calls internally and return entity ID
      // Success handled by form's onSuccess callback
      router.refresh();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error creating entity:', err);
      setError(err instanceof Error ? err.message : 'Failed to create entity');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle entity selection
  const toggleEntitySelection = (entityId: string) => {
    if (allowMultipleTargets) {
      setSelectedEntityIds((prev) =>
        prev.includes(entityId) ? prev.filter((id) => id !== entityId) : [...prev, entityId]
      );
    } else {
      // Single selection (Strategy → Asset Thesis)
      setSelectedEntityIds([entityId]);
    }
  };

  // Filter entities based on search query and target type
  const filteredEntities = availableEntities.filter((entity) => {
    // Filter by target type (important for claims which can link to both macro/asset theses)
    if (targetType && entity.type && entity.type !== targetType) {
      return false;
    }

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    return (
      entity.title.toLowerCase().includes(searchLower) ||
      entity.ticker?.toLowerCase().includes(searchLower) ||
      entity.status?.toLowerCase().includes(searchLower)
    );
  });

  // Get target type label
  const getTargetTypeLabel = (type: TargetEntityType): string => {
    switch (type) {
      case 'macroThesis':
        return 'Macro Thesis';
      case 'assetThesis':
        return 'Asset Thesis';
      case 'strategy':
        return 'Strategy';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Link {sourceTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Link this {sourceType} to existing or create new entities
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Step 0: Mode Selection */}
          {!mode && (
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Choose an action</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMode('link_existing')}
                  className="p-6 border-2 border-border rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                >
                  <div className="font-medium text-lg mb-2">Link to Existing</div>
                  <div className="text-sm text-muted-foreground">
                    Connect to entities that already exist
                  </div>
                </button>
                <button
                  onClick={() => setMode('create_new')}
                  className="p-6 border-2 border-border rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                >
                  <div className="font-medium text-lg mb-2">Create New & Link</div>
                  <div className="text-sm text-muted-foreground">
                    Create a new entity and link to it
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Target Type Selection (if multiple valid types) */}
          {mode && !targetType && validTargetTypes.length > 1 && (
            <div className="space-y-4">
              <button
                onClick={() => setMode(null)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm flex items-center gap-1"
              >
                ← Back
              </button>
              <h3 className="font-medium text-lg">Select entity type to link to</h3>
              <div className="space-y-2">
                {validTargetTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setTargetType(type)}
                    className="w-full p-4 border-2 border-border rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                  >
                    <div className="font-medium">{getTargetTypeLabel(type)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2a: Link to Existing */}
          {mode === 'link_existing' && targetType && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  if (validTargetTypes.length > 1) {
                    setTargetType(null);
                  } else {
                    setMode(null);
                  }
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm flex items-center gap-1"
              >
                ← Back
              </button>

              <h3 className="font-medium text-lg">
                Select {getTargetTypeLabel(targetType)} to link
              </h3>

              {/* Relationship Type Selector (Claims only) */}
              {requireRelationshipType && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Relationship Type
                  </label>
                  <div className="flex gap-3">
                    {['supports', 'refutes', 'foundation'].map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="relationshipType"
                          value={type}
                          checked={relationshipType === type}
                          onChange={(e) => setRelationshipType(e.target.value as RelationshipType)}
                          className="cursor-pointer"
                        />
                        <span className="capitalize">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Currently Linked Entities */}
              {currentlyLinkedEntities.length > 0 && (
                <div className="bg-muted border rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-foreground mb-3">
                    Currently Linked ({currentlyLinkedEntities.length})
                  </h4>
                  <div className="space-y-2">
                    {currentlyLinkedEntities.map((entity) => (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between bg-card p-3 rounded border"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{entity.title}</div>
                          {entity.ticker && (
                            <div className="text-xs text-muted-foreground">{entity.ticker}</div>
                          )}
                        </div>
                        <button
                          onClick={() => handleUnlinkEntity(entity.id)}
                          className="ml-3 p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Remove link"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <input
                type="text"
                placeholder="Search available entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
              />

              {/* Available Entities List */}
              <div className="border rounded-lg max-h-96 overflow-y-auto">
                {loadingEntities ? (
                  <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : filteredEntities.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No available {getTargetTypeLabel(targetType).toLowerCase()}s found
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredEntities.map((entity) => (
                      <label
                        key={entity.id}
                        className="flex items-start gap-3 p-4 hover:bg-muted cursor-pointer"
                      >
                        <input
                          type={allowMultipleTargets ? 'checkbox' : 'radio'}
                          checked={selectedEntityIds.includes(entity.id)}
                          onChange={() => toggleEntitySelection(entity.id)}
                          className="mt-1 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{entity.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            {entity.ticker && <Badge className="text-xs">{entity.ticker}</Badge>}
                            {entity.status && (
                              <Badge className="text-xs bg-muted text-foreground">
                                {entity.status}
                              </Badge>
                            )}
                            {entity.thesisType && (
                              <Badge className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                {entity.thesisType}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Selection Summary */}
              {selectedEntityIds.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg text-sm">
                  <span className="font-medium">{selectedEntityIds.length}</span> {getTargetTypeLabel(targetType).toLowerCase()}
                  {selectedEntityIds.length > 1 ? 's' : ''} selected
                  {requireRelationshipType && (
                    <span className="ml-2">
                      · Relationship: <span className="font-medium capitalize">{relationshipType}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2b: Create New */}
          {mode === 'create_new' && targetType && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  if (validTargetTypes.length > 1) {
                    setTargetType(null);
                  } else {
                    setMode(null);
                  }
                }}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm flex items-center gap-1"
              >
                ← Back
              </button>

              <h3 className="font-medium text-lg">
                Create New {getTargetTypeLabel(targetType)}
              </h3>

              {/* Render appropriate form */}
              {targetType === 'macroThesis' && (
                <CreateMacroThesisForm
                  onSubmit={handleCreateNew}
                  onCancel={() => setMode(null)}
                />
              )}
              {targetType === 'assetThesis' && (
                <CreateAssetThesisForm
                  onSubmit={handleCreateNew}
                  onCancel={() => setMode(null)}
                />
              )}
              {targetType === 'strategy' && (
                <CreateStrategyForm
                  onSubmit={handleCreateNew}
                  onCancel={() => setMode(null)}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer (for Link to Existing mode) */}
        {mode === 'link_existing' && targetType && (
          <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleLinkToExisting}
              disabled={isSubmitting || selectedEntityIds.length === 0}
            >
              {isSubmitting ? 'Linking...' : `Link Selected (${selectedEntityIds.length})`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
