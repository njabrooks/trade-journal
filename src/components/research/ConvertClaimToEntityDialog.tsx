'use client';

/**
 * Convert Claim To Entity Dialog
 *
 * Allows confirming a claim by either:
 * 1. Creating a new Macro Thesis or Asset Thesis
 * 2. Linking to existing Theses/Views
 *
 * The claim is NOT converted itself - it remains as evidence linked to the entity/entities.
 *
 * Part of Phase 2.6.5: Streamlined Claim Conversion
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectorSelector } from '@/components/ui/SectorSelector';
import { UnderlyingSelector } from '@/components/ui/UnderlyingSelector';
import type { MainClaim } from '@/db/schema';

export interface LinkActionResult {
  claimId: string;
  action: 'linked' | 'unlinked';
  newTheses?: { id: string; title: string; mappingType: string }[];
  newViews?: { id: string; title: string; ticker: string; mappingType: string }[];
  unlinkedEntityId?: string;
  unlinkedEntityType?: 'macroThesis' | 'assetThesis';
}

interface ConvertClaimToEntityDialogProps {
  claim: MainClaim;
  isOpen: boolean;
  onClose: () => void;
  onLinked?: (result: LinkActionResult) => void;
}

type Mode = 'link_existing' | 'create_new';
type EntityType = 'macro_thesis' | 'asset_thesis';
type Direction = 'bullish' | 'bearish' | 'neutral';
type TimeHorizon = 'long_term' | 'medium_term' | 'short_term';
type ThesisType = 'secular' | 'cyclical' | 'structural';

interface AvailableThesis {
  id: string;
  title: string;
  status: string;
  thesisType: string;
  description?: string | null;
  sectors?: string[] | null;
}

interface AvailableView {
  id: string;
  title: string;
  ticker: string;
  status: string;
  description?: string | null;
}

export function ConvertClaimToEntityDialog({
  claim,
  isOpen,
  onClose,
  onLinked,
}: ConvertClaimToEntityDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0: Choose mode
  const [mode, setMode] = useState<Mode | null>(null);

  // Link to Existing mode state
  const [availableTheses, setAvailableTheses] = useState<AvailableThesis[]>([]);
  const [availableViews, setAvailableViews] = useState<AvailableView[]>([]);
  const [linkedTheses, setLinkedTheses] = useState<AvailableThesis[]>([]);
  const [linkedViews, setLinkedViews] = useState<AvailableView[]>([]);
  const [selectedThesisIds, setSelectedThesisIds] = useState<string[]>([]);
  const [selectedViewIds, setSelectedViewIds] = useState<string[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [relationshipType, setRelationshipType] = useState<'supports' | 'refutes' | 'foundation'>('supports');
  const [searchQuery, setSearchQuery] = useState('');

  // Create New mode state
  const [entityType, setEntityType] = useState<EntityType | null>(null);
  const [direction, setDirection] = useState<Direction | ''>('');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon | ''>('');
  const [confidenceLevel, setConfidenceLevel] = useState<string>('medium');
  const [thesisType, setThesisType] = useState<ThesisType>('cyclical');
  const [sectors, setSectors] = useState<string[]>([]);
  const [ticker, setTicker] = useState('');

  // Fetch available entities when switching to link mode
  useEffect(() => {
    if (mode === 'link_existing' && isOpen) {
      fetchAvailableEntities();
    }
  }, [mode, isOpen]);

  const fetchAvailableEntities = async () => {
    setLoadingEntities(true);
    try {
      const response = await fetch(`/api/research/claims/available-entities?claimId=${claim.id}`);
      if (!response.ok) throw new Error('Failed to fetch entities');

      const data = await response.json();

      // API now returns { entities: [...], currentlyLinked: [...] } with type field
      // Separate entities by type for backward compatibility
      const entities = data.entities || [];
      const currentlyLinked = data.currentlyLinked || [];

      const theses = entities
        .filter((e: any) => e.type === 'macroThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          status: e.status,
          thesisType: e.thesisType,
          description: e.description,
          sectors: e.sectors,
        }));
      const views = entities
        .filter((e: any) => e.type === 'assetThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          ticker: e.ticker,
          status: e.status,
          description: e.description,
        }));

      const linkedThesesData = currentlyLinked
        .filter((e: any) => e.type === 'macroThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          status: e.status,
          thesisType: e.thesisType,
          description: e.description,
          sectors: e.sectors,
        }));
      const linkedViewsData = currentlyLinked
        .filter((e: any) => e.type === 'assetThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          ticker: e.ticker,
          status: e.status,
          description: e.description,
        }));

      setAvailableTheses(theses);
      setAvailableViews(views);
      setLinkedTheses(linkedThesesData);
      setLinkedViews(linkedViewsData);
    } catch (err) {
      console.error('Error fetching entities:', err);
      setError('Failed to load available theses and views');
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleLinkToExisting = async () => {
    setError(null);
    setIsSubmitting(true);

    if (selectedThesisIds.length === 0 && selectedViewIds.length === 0) {
      setError('Please select at least one thesis or view to link to');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/research/claims/link-to-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claim.id,
          thesisIds: selectedThesisIds,
          viewIds: selectedViewIds,
          relationshipType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to link to entities');
      }

      // Notify parent for optimistic update
      onLinked?.({
        claimId: claim.id,
        action: 'linked',
        newTheses: selectedThesisIds.map(id => {
          const thesis = availableTheses.find(t => t.id === id);
          return { id, title: thesis?.title || '', mappingType: relationshipType };
        }),
        newViews: selectedViewIds.map(id => {
          const view = availableViews.find(v => v.id === id);
          return { id, title: view?.title || '', ticker: view?.ticker || '', mappingType: relationshipType };
        }),
      });

      router.refresh();
      handleClose();
    } catch (err) {
      console.error('Error linking claim:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsSubmitting(false);
    }
  };

  const handleUnlinkEntity = async (entityId: string, entityType: 'macroThesis' | 'assetThesis') => {
    setError(null);

    try {
      const response = await fetch('/api/research/claims/link-to-entities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claim.id,
          targetType: entityType,
          targetId: entityId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove link');
      }

      // Remove from linked lists
      if (entityType === 'macroThesis') {
        setLinkedTheses((prev) => prev.filter((t) => t.id !== entityId));
      } else {
        setLinkedViews((prev) => prev.filter((v) => v.id !== entityId));
      }

      // Notify parent for optimistic update
      onLinked?.({
        claimId: claim.id,
        action: 'unlinked',
        unlinkedEntityId: entityId,
        unlinkedEntityType: entityType,
      });

      router.refresh();
    } catch (err) {
      console.error('Error unlinking entity:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove link');
    }
  };

  const handleCreateNew = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (entityType === 'macro_thesis') {
        const response = await fetch('/api/theses/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thesisType,
            direction: direction || null,
            sectors,
            timeHorizon: timeHorizon || null,
            confidenceLevel,
            status: 'active',
            description: `Created from claim: ${claim.claim}`,
            linkedMainClaimIds: [claim.id],
            notes: {
              source_claim_id: claim.id,
              source_claim_title: claim.title,
              created_via_conversion: true,
            },
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create macro thesis');
        }

        const data = await response.json();
        router.push(`/macro-theses/${data.thesisId}`);
        router.refresh();
        handleClose();
      } else if (entityType === 'asset_thesis') {
        if (!ticker) {
          setError('Ticker is required for Asset Theses');
          setIsSubmitting(false);
          return;
        }

        const response = await fetch('/api/asset-theses/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker,
            direction: direction || null,
            timeHorizon: timeHorizon || null,
            confidenceLevel,
            status: 'active',
            description: `Created from claim: ${claim.claim}`,
            linkedMainClaimIds: [claim.id],
            notes: {
              source_claim_id: claim.id,
              source_claim_title: claim.title,
              created_via_conversion: true,
            },
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create asset thesis');
        }

        const data = await response.json();
        router.push(`/asset-theses/${data.viewId}`);
        router.refresh();
        handleClose();
      }
    } catch (err) {
      console.error('Error creating entity:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setMode(null);
    setEntityType(null);
    setDirection('');
    setTimeHorizon('');
    setConfidenceLevel('medium');
    setThesisType('cyclical');
    setSectors([]);
    setTicker('');
    setSelectedThesisIds([]);
    setSelectedViewIds([]);
    setRelationshipType('supports');
    setSearchQuery('');
    setError(null);
  };

  // Filter function for keyword search across all relevant fields
  const matchesSearch = (
    entity: AvailableThesis | AvailableView,
    type: 'thesis' | 'view'
  ): boolean => {
    if (!searchQuery.trim()) return true;

    const searchLower = searchQuery.toLowerCase();
    const searchTerms = searchLower.split(/\s+/).filter(Boolean);

    // Build searchable text from all relevant fields
    const searchableFields: string[] = [entity.title, entity.status];

    if (type === 'thesis') {
      const thesis = entity as AvailableThesis;
      searchableFields.push(thesis.thesisType);
      if (thesis.description) searchableFields.push(thesis.description);
      if (thesis.sectors) searchableFields.push(...thesis.sectors);
    } else {
      const view = entity as AvailableView;
      searchableFields.push(view.ticker);
      if (view.description) searchableFields.push(view.description);
    }

    const searchableText = searchableFields
      .filter(Boolean)
      .map((f) => f.toLowerCase())
      .join(' ');

    // Match if all search terms are found somewhere in the searchable text
    return searchTerms.every((term) => searchableText.includes(term));
  };

  // Filtered lists for display
  const filteredTheses = availableTheses.filter((t) => matchesSearch(t, 'thesis'));
  const filteredViews = availableViews.filter((v) => matchesSearch(v, 'view'));

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleThesisSelection = (thesisId: string) => {
    setSelectedThesisIds(prev =>
      prev.includes(thesisId)
        ? prev.filter(id => id !== thesisId)
        : [...prev, thesisId]
    );
  };

  const toggleViewSelection = (viewId: string) => {
    setSelectedViewIds(prev =>
      prev.includes(viewId)
        ? prev.filter(id => id !== viewId)
        : [...prev, viewId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-6">
          <h2 className="text-2xl font-semibold text-foreground">Confirm Claim</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Link this claim to theses/views to confirm it
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Show claim being confirmed - compact */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{claim.title}</p>
              </div>
              {claim.qualifier && (
                <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs ml-3 flex-shrink-0">
                  {claim.qualifier}
                </Badge>
              )}
            </div>
          </div>

          {/* Step 0: Choose Mode */}
          {!mode && (
            <div className="space-y-3">
              <h3 className="font-medium">How would you like to confirm this claim?</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setMode('link_existing')}
                  className="p-6 border-2 border rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2 text-foreground">Link to Existing</div>
                  <div className="text-sm text-muted-foreground">
                    Select existing theses or views to link this claim to
                  </div>
                </button>
                <button
                  onClick={() => setMode('create_new')}
                  className="p-6 border-2 border rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2 text-foreground">Create New</div>
                  <div className="text-sm text-muted-foreground">
                    Create a new macro thesis or asset thesis
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Link to Existing Mode */}
          {mode === 'link_existing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-foreground">Select Theses/Views to Link</h3>
                <div className="text-sm text-muted-foreground">
                  {selectedThesisIds.length + selectedViewIds.length} selected
                </div>
              </div>

              {/* Keyword Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by keyword (title, ticker, description, sectors...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Relationship Type - Always visible at top */}
              <div className="bg-muted border border-border rounded-lg p-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Relationship Type *
                </label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as typeof relationshipType)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="supports">✓ Supports - This claim provides evidence</option>
                  <option value="refutes">✗ Refutes - This claim contradicts or challenges</option>
                  <option value="foundation">★ Foundation - This claim is the foundational reasoning</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Select your relationship first, then choose theses/views below
                </p>
              </div>

              {loadingEntities ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <div className="space-y-6">
                  {/* Currently Linked Entities */}
                  {(linkedTheses.length > 0 || linkedViews.length > 0) && (
                    <div className="bg-muted border border-border rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-3">
                        Currently Linked ({linkedTheses.length + linkedViews.length})
                      </h4>
                      <div className="space-y-2">
                        {linkedTheses.map((thesis) => (
                          <div
                            key={thesis.id}
                            className="flex items-center justify-between bg-card p-3 rounded border border-border"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-foreground">{thesis.title}</div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 text-xs">
                                  {thesis.thesisType}
                                </Badge>
                                <Badge className="bg-muted text-muted-foreground text-xs">
                                  {thesis.status}
                                </Badge>
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnlinkEntity(thesis.id, 'macroThesis')}
                              className="ml-3 p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              title="Remove link"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        {linkedViews.map((view) => (
                          <div
                            key={view.id}
                            className="flex items-center justify-between bg-card p-3 rounded border border-border"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-foreground">{view.title}</div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs">
                                  {view.ticker}
                                </Badge>
                                <Badge className="bg-muted text-muted-foreground text-xs">
                                  {view.status}
                                </Badge>
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnlinkEntity(view.id, 'assetThesis')}
                              className="ml-3 p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
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

                  {/* Macro Theses */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">
                      Macro Theses ({filteredTheses.length}{searchQuery && ` of ${availableTheses.length}`})
                    </h4>
                    {filteredTheses.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        {searchQuery ? 'No matching theses' : 'No available theses'}
                      </p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
                        {filteredTheses.map(thesis => (
                          <label
                            key={thesis.id}
                            className={`flex items-start gap-3 p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0 ${
                              selectedThesisIds.includes(thesis.id) ? 'bg-blue-500/10' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedThesisIds.includes(thesis.id)}
                              onChange={() => toggleThesisSelection(thesis.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {thesis.title}
                              </div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 text-xs">
                                  {thesis.thesisType}
                                </Badge>
                                <Badge className="bg-muted text-muted-foreground text-xs">
                                  {thesis.status}
                                </Badge>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Asset Theses */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">
                      Asset Theses ({filteredViews.length}{searchQuery && ` of ${availableViews.length}`})
                    </h4>
                    {filteredViews.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        {searchQuery ? 'No matching asset theses' : 'No available views'}
                      </p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
                        {filteredViews.map(view => (
                          <label
                            key={view.id}
                            className={`flex items-start gap-3 p-3 hover:bg-muted cursor-pointer border-b border-border last:border-b-0 ${
                              selectedViewIds.includes(view.id) ? 'bg-blue-500/10' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedViewIds.includes(view.id)}
                              onChange={() => toggleViewSelection(view.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {view.title}
                              </div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs">
                                  {view.ticker}
                                </Badge>
                                <Badge className="bg-muted text-muted-foreground text-xs">
                                  {view.status}
                                </Badge>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selection Summary */}
                  {(selectedThesisIds.length > 0 || selectedViewIds.length > 0) && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <p className="text-sm font-medium text-foreground">
                        {selectedThesisIds.length + selectedViewIds.length} selected · 
                        <span className="ml-1 font-normal">
                          Will be linked as <span className="font-semibold">{relationshipType}</span>
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Create New Mode */}
          {mode === 'create_new' && !entityType && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground">What would you like to create?</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setEntityType('macro_thesis')}
                  className="p-6 border-2 border rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2 text-foreground">Macro Thesis</div>
                  <div className="text-sm text-muted-foreground">
                    Cross-asset belief (secular, cyclical, or structural)
                  </div>
                </button>
                <button
                  onClick={() => setEntityType('asset_thesis')}
                  className="p-6 border-2 border rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2 text-foreground">Asset Thesis</div>
                  <div className="text-sm text-muted-foreground">
                    Asset-specific thesis about a particular underlying
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Create New - Fill in fields */}
          {mode === 'create_new' && entityType && (
            <div className="space-y-6">
              {/* Common Fields */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Direction
                </label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction | '')}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                >
                  <option value="">Select direction...</option>
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Time Horizon
                </label>
                <select
                  value={timeHorizon}
                  onChange={(e) => setTimeHorizon(e.target.value as TimeHorizon | '')}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                >
                  <option value="">Select time horizon...</option>
                  <option value="long_term">Long Term</option>
                  <option value="medium_term">Medium Term</option>
                  <option value="short_term">Short Term</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Confidence Level
                </label>
                <select
                  value={confidenceLevel}
                  onChange={(e) => setConfidenceLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="exploratory">Exploratory</option>
                </select>
              </div>

              {/* Macro Thesis Specific */}
              {entityType === 'macro_thesis' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Thesis Type
                    </label>
                    <select
                      value={thesisType}
                      onChange={(e) => setThesisType(e.target.value as ThesisType)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    >
                      <option value="secular">Secular</option>
                      <option value="cyclical">Cyclical</option>
                      <option value="structural">Structural</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Sectors / Topics <span className="text-red-500">*</span>
                    </label>
                    <SectorSelector value={sectors} onChange={setSectors} />
                  </div>
                </>
              )}

              {/* Asset Thesis Specific */}
              {entityType === 'asset_thesis' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Underlying <span className="text-red-500">*</span>
                  </label>
                  <UnderlyingSelector
                    value={ticker}
                    onChange={setTicker}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border p-6 flex justify-between">
          <div>
            {(mode || entityType) && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (mode === 'create_new' && entityType) {
                    setEntityType(null);
                  } else {
                    setMode(null);
                  }
                }}
              >
                ← Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            {mode === 'link_existing' && (
              <Button onClick={handleLinkToExisting} disabled={isSubmitting || (selectedThesisIds.length === 0 && selectedViewIds.length === 0)}>
                {isSubmitting ? 'Linking...' : `Link & Confirm (${selectedThesisIds.length + selectedViewIds.length})`}
              </Button>
            )}
            {mode === 'create_new' && entityType && (
              <Button onClick={handleCreateNew} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : `Create ${entityType === 'macro_thesis' ? 'Macro Thesis' : 'Asset Thesis'}`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
