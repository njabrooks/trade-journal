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
import type { MainClaim } from '@/db/schema';

interface ConvertClaimToEntityDialogProps {
  claim: MainClaim;
  isOpen: boolean;
  onClose: () => void;
}

type Mode = 'link_existing' | 'create_new';
type EntityType = 'macro_thesis' | 'asset_view';
type Direction = 'bullish' | 'bearish' | 'neutral';
type TimeHorizon = 'long_term' | 'medium_term' | 'short_term';
type ThesisType = 'secular' | 'cyclical' | 'structural';

interface AvailableThesis {
  id: string;
  title: string;
  status: string;
  thesisType: string;
}

interface AvailableView {
  id: string;
  title: string;
  ticker: string;
  status: string;
}

export function ConvertClaimToEntityDialog({
  claim,
  isOpen,
  onClose,
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
        }));
      const views = entities
        .filter((e: any) => e.type === 'assetThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          ticker: e.ticker,
          status: e.status,
        }));

      const linkedThesesData = currentlyLinked
        .filter((e: any) => e.type === 'macroThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          status: e.status,
          thesisType: e.thesisType,
        }));
      const linkedViewsData = currentlyLinked
        .filter((e: any) => e.type === 'assetThesis')
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          ticker: e.ticker,
          status: e.status,
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

      // Success - refresh and close
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

      // Refresh to update the page
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
      } else if (entityType === 'asset_view') {
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
    setError(null);
  };

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
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6">
          <h2 className="text-2xl font-semibold">Confirm Claim</h2>
          <p className="text-sm text-slate-600 mt-1">
            Link this claim to theses/views to confirm it
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Show claim being confirmed - compact */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900 truncate">{claim.title}</p>
              </div>
              {claim.qualifier && (
                <Badge className="bg-blue-100 text-blue-800 text-xs ml-3 flex-shrink-0">
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
                  className="p-6 border-2 border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2">Link to Existing</div>
                  <div className="text-sm text-slate-600">
                    Select existing theses or views to link this claim to
                  </div>
                </button>
                <button
                  onClick={() => setMode('create_new')}
                  className="p-6 border-2 border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2">Create New</div>
                  <div className="text-sm text-slate-600">
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
                <h3 className="font-medium">Select Theses/Views to Link</h3>
                <div className="text-sm text-slate-600">
                  {selectedThesisIds.length + selectedViewIds.length} selected
                </div>
              </div>

              {/* Relationship Type - Always visible at top */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Relationship Type *
                </label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as typeof relationshipType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="supports">✓ Supports - This claim provides evidence</option>
                  <option value="refutes">✗ Refutes - This claim contradicts or challenges</option>
                  <option value="foundation">★ Foundation - This claim is the foundational reasoning</option>
                </select>
                <p className="text-xs text-slate-600 mt-1">
                  Select your relationship first, then choose theses/views below
                </p>
              </div>

              {loadingEntities ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
              ) : (
                <div className="space-y-6">
                  {/* Currently Linked Entities */}
                  {(linkedTheses.length > 0 || linkedViews.length > 0) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">
                        Currently Linked ({linkedTheses.length + linkedViews.length})
                      </h4>
                      <div className="space-y-2">
                        {linkedTheses.map((thesis) => (
                          <div
                            key={thesis.id}
                            className="flex items-center justify-between bg-white p-3 rounded border border-slate-200"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{thesis.title}</div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-purple-100 text-purple-700 text-xs">
                                  {thesis.thesisType}
                                </Badge>
                                <Badge className="bg-slate-100 text-slate-700 text-xs">
                                  {thesis.status}
                                </Badge>
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnlinkEntity(thesis.id, 'macroThesis')}
                              className="ml-3 p-1 text-red-600 hover:bg-red-50 rounded"
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
                            className="flex items-center justify-between bg-white p-3 rounded border border-slate-200"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm">{view.title}</div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-blue-100 text-blue-700 text-xs">
                                  {view.ticker}
                                </Badge>
                                <Badge className="bg-slate-100 text-slate-700 text-xs">
                                  {view.status}
                                </Badge>
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnlinkEntity(view.id, 'assetThesis')}
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

                  {/* Macro Theses */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">
                      Macro Theses ({availableTheses.length})
                    </h4>
                    {availableTheses.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">No available theses</p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                        {availableTheses.map(thesis => (
                          <label
                            key={thesis.id}
                            className={`flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 ${
                              selectedThesisIds.includes(thesis.id) ? 'bg-blue-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedThesisIds.includes(thesis.id)}
                              onChange={() => toggleThesisSelection(thesis.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900">
                                {thesis.title}
                              </div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-purple-100 text-purple-700 text-xs">
                                  {thesis.thesisType}
                                </Badge>
                                <Badge className="bg-slate-100 text-slate-700 text-xs">
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
                    <h4 className="text-sm font-semibold text-slate-700 mb-3">
                      Asset Theses ({availableViews.length})
                    </h4>
                    {availableViews.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">No available views</p>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                        {availableViews.map(view => (
                          <label
                            key={view.id}
                            className={`flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 ${
                              selectedViewIds.includes(view.id) ? 'bg-blue-50' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedViewIds.includes(view.id)}
                              onChange={() => toggleViewSelection(view.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-slate-900">
                                {view.title}
                              </div>
                              <div className="flex gap-2 mt-1">
                                <Badge className="bg-blue-100 text-blue-700 text-xs">
                                  {view.ticker}
                                </Badge>
                                <Badge className="bg-slate-100 text-slate-700 text-xs">
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
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-900">
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
              <h3 className="font-medium">What would you like to create?</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setEntityType('macro_thesis')}
                  className="p-6 border-2 border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2">Macro Thesis</div>
                  <div className="text-sm text-slate-600">
                    Cross-asset belief (secular, cyclical, or structural)
                  </div>
                </button>
                <button
                  onClick={() => setEntityType('asset_view')}
                  className="p-6 border-2 border-slate-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="font-semibold text-lg mb-2">Asset Thesis</div>
                  <div className="text-sm text-slate-600">
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
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Direction
                </label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction | '')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">Select direction...</option>
                  <option value="bullish">Bullish</option>
                  <option value="bearish">Bearish</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Time Horizon
                </label>
                <select
                  value={timeHorizon}
                  onChange={(e) => setTimeHorizon(e.target.value as TimeHorizon | '')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="">Select time horizon...</option>
                  <option value="long_term">Long Term</option>
                  <option value="medium_term">Medium Term</option>
                  <option value="short_term">Short Term</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Confidence Level
                </label>
                <select
                  value={confidenceLevel}
                  onChange={(e) => setConfidenceLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
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
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Thesis Type
                    </label>
                    <select
                      value={thesisType}
                      onChange={(e) => setThesisType(e.target.value as ThesisType)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="secular">Secular</option>
                      <option value="cyclical">Cyclical</option>
                      <option value="structural">Structural</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Sectors / Topics <span className="text-red-500">*</span>
                    </label>
                    <SectorSelector value={sectors} onChange={setSectors} />
                  </div>
                </>
              )}

              {/* Asset Thesis Specific */}
              {entityType === 'asset_view' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Ticker <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="e.g., TSLA"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-6 flex justify-between">
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
