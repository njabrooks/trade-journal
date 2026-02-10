'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UnderlyingSelector } from '@/components/ui/UnderlyingSelector';
import { Loader2, Search, Plus, LinkIcon, ChevronDown, ChevronUp, GitMerge, Check, CheckCircle2, RotateCcw, Ban } from 'lucide-react';

interface Strategy {
  id: string;
  strategyKey: string;
  underlyingTicker?: string | null;
  underlyingId?: string | null;
  parentUnderlyingId?: string | null;
  parentUnderlyingTicker?: string | null;
  label?: string | null;
  status: string;
  isAuto?: boolean;
  strategyType?: string | null;
  direction?: string | null;
  assetThesisId?: string | null;
  closedAt?: Date | string | null;
}

interface AssetThesis {
  id: string;
  title: string;
  underlyingTicker: string | null;
  direction: string | null;
  timeHorizon: string | null;
  confidenceLevel: string | null;
  status: string;
  primaryMacroThesisId: string | null;
  primaryMacroThesisTitle?: string | null;
}

interface CreateAssetThesisFormData {
  ticker: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  timeHorizon: 'long_term' | 'medium_term' | 'short_term';
  confidenceLevel: 'high' | 'medium' | 'low' | 'exploratory';
  status: 'draft' | 'active' | 'complete' | 'rejected';
  description?: string;
}

// Related strategy for merge selection
interface RelatedStrategy {
  id: string;
  strategyKey: string;
  label: string | null;
  status: string;
  openPositionsCount: number;
  accountIds: string[]; // Broker account IDs from positions (strategy can span multiple accounts)
  assetThesisId: string | null; // Whether strategy has an asset thesis link
  createdAt: string; // For showing age/order
  underlyingTicker: string | null; // Ticker of this strategy's underlying
}

interface StrategyConfirmationDialogProps {
  strategy: Strategy | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type DialogMode = 'select' | 'create';

export function StrategyConfirmationDialog({
  strategy,
  isOpen,
  onClose,
  onSuccess,
}: StrategyConfirmationDialogProps) {
  // Form state - core fields
  const [strategyLabel, setStrategyLabel] = useState<string>('');
  const [strategyTypeId, setStrategyTypeId] = useState<string>('');
  const [customStrategyType, setCustomStrategyType] = useState<string>('');
  const [isCustomType, setIsCustomType] = useState(false);
  const [strategyDirection, setStrategyDirection] = useState<string>('');
  const [strategyTypes, setStrategyTypes] = useState<Array<{ id: string; name: string; defaultDirection: string | null }>>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Asset thesis selection state - now optional
  const [showThesisSection, setShowThesisSection] = useState(false);
  const [mode, setMode] = useState<DialogMode>('select');
  const [assetTheses, setAssetTheses] = useState<AssetThesis[]>([]);
  const [filteredTheses, setFilteredTheses] = useState<AssetThesis[]>([]);
  const [loadingTheses, setLoadingTheses] = useState(true);
  const [selectedThesisId, setSelectedThesisId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create form state
  const [createFormData, setCreateFormData] = useState<CreateAssetThesisFormData>({
    ticker: '',
    direction: 'bullish',
    timeHorizon: 'medium_term',
    confidenceLevel: 'medium',
    status: 'active',
    description: '',
  });

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Force close / reopen / reject state
  const [confirmingForceClose, setConfirmingForceClose] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);

  // Parent underlying state
  const [editingParent, setEditingParent] = useState(false);
  const [parentTicker, setParentTicker] = useState<string | null>(null);
  const [savingParent, setSavingParent] = useState(false);
  const [underlyingsList, setUnderlyingsList] = useState<{ id: string; ticker: string; name: string | null; parentUnderlyingId: string | null }[]>([]);

  // Merge strategies state
  const [showMergeSection, setShowMergeSection] = useState(false);
  const [relatedStrategies, setRelatedStrategies] = useState<RelatedStrategy[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<string>>(new Set());

  // Reset state when dialog opens with new strategy
  useEffect(() => {
    if (isOpen && strategy) {
      setStrategyLabel(strategy.label || '');
      // Will be resolved after types load
      setStrategyTypeId('');
      setCustomStrategyType('');
      setIsCustomType(false);
      setStrategyDirection(strategy.direction || '');
      setSelectedThesisId(strategy.assetThesisId || null);
      // Show thesis section if already linked, otherwise collapsed by default
      setShowThesisSection(!!strategy.assetThesisId);
      setMode('select');
      setSearchQuery('');
      setError(null);

      // Try to get ticker from underlyingTicker, or extract from strategyKey (e.g., "LLY-STK" -> "LLY")
      let ticker = strategy.underlyingTicker || '';
      if (!ticker && strategy.strategyKey) {
        const keyParts = strategy.strategyKey.split('-');
        if (keyParts.length >= 1) {
          ticker = keyParts[0].toUpperCase();
        }
      }

      setCreateFormData({
        ticker,
        direction: 'bullish',
        timeHorizon: 'medium_term',
        confidenceLevel: 'medium',
        status: 'active',
        description: '',
      });

      // Reset merge state
      setShowMergeSection(false);
      setRelatedStrategies([]);
      setSelectedMergeIds(new Set());

      // Reset force close / reject state
      setConfirmingForceClose(false);
      setConfirmingReject(false);

      // Reset parent underlying state
      setEditingParent(false);
      setParentTicker(strategy.parentUnderlyingTicker ?? null);
    }
  }, [isOpen, strategy]);

  // Load related strategies (same underlying, different from current)
  useEffect(() => {
    if (isOpen && strategy?.underlyingTicker) {
      loadRelatedStrategies(strategy.underlyingTicker, strategy.id);
    }
  }, [isOpen, strategy]);

  // Load underlyings list for parent selection
  useEffect(() => {
    if (isOpen) {
      loadUnderlyingsList();
    }
  }, [isOpen]);

  // Load strategy types
  useEffect(() => {
    if (isOpen) {
      loadStrategyTypes();
    }
  }, [isOpen]);

  // Load asset theses
  useEffect(() => {
    if (isOpen) {
      loadAssetTheses();
    }
  }, [isOpen]);

  // Filter theses by strategy's underlying ticker and search query
  useEffect(() => {
    if (!strategy) {
      setFilteredTheses([]);
      return;
    }

    let filtered = assetTheses;

    // First filter by underlying ticker (prioritize matches)
    const matchingTicker = strategy.underlyingTicker
      ? filtered.filter(
          (t) => t.underlyingTicker?.toLowerCase() === strategy.underlyingTicker?.toLowerCase()
        )
      : [];
    const otherTheses = strategy.underlyingTicker
      ? filtered.filter(
          (t) => t.underlyingTicker?.toLowerCase() !== strategy.underlyingTicker?.toLowerCase()
        )
      : filtered;

    // Put matching ticker theses first
    filtered = [...matchingTicker, ...otherTheses];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.underlyingTicker?.toLowerCase().includes(query)
      );
    }

    setFilteredTheses(filtered);
  }, [assetTheses, strategy, searchQuery]);

  const loadStrategyTypes = async () => {
    setLoadingTypes(true);
    try {
      const response = await fetch('/api/strategy-types');
      if (response.ok) {
        const types = await response.json();
        setStrategyTypes(types.map((t: { id: string; name: string; defaultDirection: string | null }) => ({
          id: t.id,
          name: t.name,
          defaultDirection: t.defaultDirection,
        })));
        // Resolve current strategy's type name to an ID
        if (strategy?.strategyType) {
          const match = types.find((t: { name: string }) => t.name === strategy.strategyType);
          if (match) {
            setStrategyTypeId(match.id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load strategy types:', err);
    } finally {
      setLoadingTypes(false);
    }
  };

  const loadRelatedStrategies = async (ticker: string, excludeId: string) => {
    setLoadingRelated(true);
    try {
      const response = await fetch(
        `/api/strategies/related?underlyingTicker=${encodeURIComponent(ticker)}&excludeId=${encodeURIComponent(excludeId)}`
      );
      if (response.ok) {
        const data = await response.json();
        setRelatedStrategies(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load related strategies:', err);
    } finally {
      setLoadingRelated(false);
    }
  };

  const toggleMergeSelection = (id: string) => {
    setSelectedMergeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const loadAssetTheses = async () => {
    setLoadingTheses(true);
    try {
      const response = await fetch('/api/asset-theses');
      if (response.ok) {
        const data = await response.json();
        setAssetTheses(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load asset theses:', err);
    } finally {
      setLoadingTheses(false);
    }
  };

  const loadUnderlyingsList = async () => {
    try {
      const response = await fetch('/api/underlyings');
      if (response.ok) {
        const data = await response.json();
        setUnderlyingsList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load underlyings:', err);
    }
  };

  const handleSetParentUnderlying = async (selectedParentId: string) => {
    if (!strategy?.underlyingId) return;

    setSavingParent(true);
    setError(null);
    try {
      const response = await fetch(`/api/underlyings/${strategy.underlyingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentUnderlyingId: selectedParentId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set parent underlying');
      }

      // Update local state to reflect the change
      const parent = underlyingsList.find((u) => u.id === selectedParentId);
      setParentTicker(parent?.ticker ?? null);
      setEditingParent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set parent underlying');
    } finally {
      setSavingParent(false);
    }
  };

  const handleClearParentUnderlying = async () => {
    if (!strategy?.underlyingId) return;

    setSavingParent(true);
    setError(null);
    try {
      const response = await fetch(`/api/underlyings/${strategy.underlyingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentUnderlyingId: null }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clear parent underlying');
      }

      setParentTicker(null);
      setEditingParent(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear parent underlying');
    } finally {
      setSavingParent(false);
    }
  };

  const handleConfirm = async () => {
    if (!strategy) return;

    // Determine effective strategy type
    let effectiveStrategyTypeId = strategyTypeId;
    let effectiveStrategyTypeName = strategyTypes.find((t) => t.id === strategyTypeId)?.name || '';

    if (isCustomType) {
      const customName = customStrategyType.trim();
      if (!customName) {
        setError('Strategy type name is required');
        return;
      }
      // Create the new type via API
      try {
        const createResp = await fetch('/api/strategy-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: customName }),
        });
        if (!createResp.ok) {
          const errData = await createResp.json();
          throw new Error(errData.error || 'Failed to create strategy type');
        }
        const { id: newTypeId } = await createResp.json();
        effectiveStrategyTypeId = newTypeId;
        effectiveStrategyTypeName = customName;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create strategy type');
        return;
      }
    }

    // Validation - core fields are required
    if (!effectiveStrategyTypeId) {
      setError('Strategy type is required');
      return;
    }
    if (!strategyDirection) {
      setError('Strategy direction is required');
      return;
    }

    // Thesis linkage is optional - only process if section is expanded
    let assetThesisId: string | null = null;

    if (showThesisSection) {
      assetThesisId = selectedThesisId;

      // If creating new thesis, create it first
      if (mode === 'create') {
        if (!createFormData.ticker) {
          setError('Ticker is required to create an asset thesis');
          return;
        }

        setSubmitting(true);
        setError(null);
        try {
          // Use /api/asset-theses/create which auto-generates title from ticker/direction/timeHorizon
          const createResponse = await fetch('/api/asset-theses/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticker: createFormData.ticker,
              direction: createFormData.direction,
              timeHorizon: createFormData.timeHorizon,
              confidenceLevel: createFormData.confidenceLevel,
              status: createFormData.status,
              description: createFormData.description || null,
            }),
          });

          if (!createResponse.ok) {
            const errorData = await createResponse.json();
            const errorMessage = errorData.details
              ? `${errorData.error}: ${errorData.details}`
              : errorData.error || 'Failed to create asset thesis';
            throw new Error(errorMessage);
          }

          const newThesis = await createResponse.json();
          assetThesisId = newThesis.viewId; // Note: /create endpoint returns viewId, not id
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to create asset thesis');
          setSubmitting(false);
          return;
        }
      }
    }

    // Now confirm the strategy
    setSubmitting(true);
    setError(null);
    try {
      const updatePayload: Record<string, unknown> = {
        id: strategy.id,
        strategyType: effectiveStrategyTypeName,
        strategyTypeId: effectiveStrategyTypeId,
        direction: strategyDirection,
        confirm: true,
      };

      // Only include label if it changed
      if (strategyLabel && strategyLabel !== strategy.label) {
        updatePayload.label = strategyLabel;
      }

      // Only include assetThesisId if one was selected/created
      if (assetThesisId) {
        updatePayload.assetThesisId = assetThesisId;
      }

      const response = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm strategy');
      }

      // If strategies were selected for merge, determine direction based on underlying
      if (selectedMergeIds.size > 0) {
        // Cross-underlying merge: if selected strategy has a different underlying,
        // merge current INTO the selected (parent family merge direction)
        const selectedIds = Array.from(selectedMergeIds);
        const crossUnderlying = relatedStrategies.find(
          (rs) => selectedMergeIds.has(rs.id) && rs.underlyingTicker !== strategy.underlyingTicker
        );

        const mergePayload = crossUnderlying
          ? { targetId: crossUnderlying.id, sourceIds: [strategy.id, ...selectedIds.filter((id) => id !== crossUnderlying.id)] }
          : { targetId: strategy.id, sourceIds: selectedIds };

        const mergeResponse = await fetch('/api/strategies/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mergePayload),
        });

        if (!mergeResponse.ok) {
          const mergeError = await mergeResponse.json();
          throw new Error(mergeError.error || 'Failed to merge strategies');
        }
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm strategy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseStrategy = async () => {
    if (!strategy) return;

    // For active strategies, require two-click confirmation
    if (strategy.status === 'active' && !confirmingForceClose) {
      setConfirmingForceClose(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = strategy.status === 'active'
        ? { forceClose: true }
        : { status: 'complete' };

      const response = await fetch(`/api/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to close strategy');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close strategy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenStrategy = async () => {
    if (!strategy) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceClose: false }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reopen strategy');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen strategy');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectStrategy = async () => {
    if (!strategy) return;

    // For active strategies, require two-click confirmation
    if (strategy.status === 'active' && !confirmingReject) {
      setConfirmingReject(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject strategy');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject strategy');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !strategy) {
    return null;
  }

  // Determine if this is a first-time confirm or an edit
  const isFirstTimeConfirm = strategy.status === 'draft' && !strategy.strategyType;
  const dialogTitle = isFirstTimeConfirm ? 'Confirm Strategy' : 'Edit Strategy';
  const dialogSubtitle = isFirstTimeConfirm
    ? 'Set strategy details and optionally link to an asset thesis'
    : 'Update strategy details, thesis link, or change status';

  // Count how many theses match the strategy's ticker
  const matchingTickerCount = strategy.underlyingTicker
    ? assetTheses.filter(
        (t) => t.underlyingTicker?.toLowerCase() === strategy.underlyingTicker?.toLowerCase()
      ).length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-foreground">{dialogTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {dialogSubtitle}
          </p>
        </div>

        <div className="px-6 py-4 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Strategy Info */}
          <div className="bg-muted rounded-lg p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Strategy Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Key:</span>{' '}
                <span className="font-mono text-foreground">{strategy.strategyKey}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Underlying:</span>{' '}
                <span className="font-mono font-medium text-foreground">{strategy.underlyingTicker || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className="text-foreground">{strategy.status}</span>
              </div>
              {strategy.underlyingId && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Parent:</span>{' '}
                  {editingParent ? (
                    <span className="inline-flex items-center gap-2">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleSetParentUnderlying(e.target.value);
                        }}
                        disabled={savingParent}
                        className="px-2 py-1 border rounded text-sm bg-background text-foreground"
                      >
                        <option value="">Select parent...</option>
                        {underlyingsList
                          .filter((u) => u.id !== strategy.underlyingId && u.parentUnderlyingId !== strategy.underlyingId)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.ticker}{u.name ? ` - ${u.name}` : ''}
                            </option>
                          ))}
                      </select>
                      {savingParent && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <button
                        onClick={() => setEditingParent(false)}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : parentTicker ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">{parentTicker}</span>
                      <button
                        onClick={() => setEditingParent(true)}
                        disabled={savingParent}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Change
                      </button>
                      <button
                        onClick={handleClearParentUnderlying}
                        disabled={savingParent}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {savingParent ? 'Clearing...' : 'Clear'}
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-muted-foreground">—</span>
                      <button
                        onClick={() => setEditingParent(true)}
                        disabled={savingParent}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Set parent
                      </button>
                    </span>
                  )}
                  {(editingParent || parentTicker) && strategy.underlyingTicker && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Applies to all {strategy.underlyingTicker} strategies
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Strategy Label */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Label
            </label>
            <input
              type="text"
              value={strategyLabel}
              onChange={(e) => setStrategyLabel(e.target.value)}
              placeholder={strategy.strategyKey}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Human-readable name for this strategy (defaults to strategy key)
            </p>
          </div>

          {/* Strategy Type and Direction Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Strategy Type <span className="text-red-500">*</span>
              </label>
              {isCustomType ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customStrategyType}
                    onChange={(e) => setCustomStrategyType(e.target.value)}
                    placeholder="Enter new strategy type..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCustomType(false);
                      setCustomStrategyType('');
                    }}
                    disabled={submitting}
                    className="px-3"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <select
                  value={strategyTypeId}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setIsCustomType(true);
                      setStrategyTypeId('');
                    } else {
                      setStrategyTypeId(e.target.value);
                      // Auto-populate direction from type default if direction is not yet set
                      if (e.target.value && !strategyDirection) {
                        const selected = strategyTypes.find((t) => t.id === e.target.value);
                        if (selected?.defaultDirection) {
                          setStrategyDirection(selected.defaultDirection);
                        }
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                  disabled={submitting || loadingTypes}
                >
                  <option value="">Select a strategy type...</option>
                  {strategyTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                  <option value="__new__" className="text-blue-600">
                    + Add new type...
                  </option>
                </select>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Categorizes the strategy for filtering and analysis
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Direction <span className="text-red-500">*</span>
              </label>
              <select
                value={strategyDirection}
                onChange={(e) => setStrategyDirection(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                disabled={submitting}
              >
                <option value="">Select direction...</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
                <option value="neutral">Neutral</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Net directional bias
              </p>
            </div>
          </div>

          {/* Merge Strategies Section - Collapsible (only if there are related strategies) */}
          {relatedStrategies.length > 0 && (
            <div className="border rounded-lg border-purple-200">
              <button
                type="button"
                onClick={() => setShowMergeSection(!showMergeSection)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-purple-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GitMerge className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-foreground">
                    Merge Other Strategies
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({relatedStrategies.length} related)
                  </span>
                  {selectedMergeIds.size > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                      {selectedMergeIds.size} selected
                    </span>
                  )}
                </div>
                {showMergeSection ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {showMergeSection && (
                <div className="px-4 pb-4 pt-2 border-t border-purple-100">
                  <p className="text-xs text-muted-foreground mb-3">
                    Select a related strategy to merge with. Same-underlying strategies merge into this one.
                    Parent-family strategies absorb this one.
                  </p>

                  {loadingRelated ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {relatedStrategies.map((rs) => (
                        <button
                          key={rs.id}
                          type="button"
                          onClick={() => toggleMergeSelection(rs.id)}
                          disabled={submitting}
                          className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                            selectedMergeIds.has(rs.id)
                              ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                              : 'border hover:border-muted-foreground hover:bg-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {selectedMergeIds.has(rs.id) && (
                                <Check className="h-4 w-4 text-purple-600" />
                              )}
                              <span className="font-mono text-sm text-foreground">
                                {rs.strategyKey}
                              </span>
                              {rs.label && rs.label !== rs.strategyKey && (
                                <span className="text-sm text-muted-foreground">
                                  ({rs.label})
                                </span>
                              )}
                              {/* Show underlying ticker badge if different from current strategy */}
                              {rs.underlyingTicker && rs.underlyingTicker !== strategy?.underlyingTicker && (
                                <span className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 rounded">
                                  {rs.underlyingTicker}
                                </span>
                              )}
                              {/* Thesis link indicator */}
                              {rs.assetThesisId && (
                                <span
                                  className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded"
                                  title="Has asset thesis link"
                                >
                                  📋 Thesis
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                rs.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                                  : rs.status === 'draft'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                                  : 'bg-muted text-foreground'
                              }`}>
                                {rs.status}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {rs.openPositionsCount} pos
                              </span>
                            </div>
                          </div>
                          {/* Show accounts if strategy spans multiple accounts */}
                          {rs.accountIds && rs.accountIds.length > 0 && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {rs.accountIds.length === 1 ? (
                                <span>Account: {rs.accountIds[0]}</span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {rs.accountIds.length} accounts: {rs.accountIds.join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedMergeIds.size > 0 && (
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const crossUnderlying = relatedStrategies.find(
                          (rs) => selectedMergeIds.has(rs.id) && rs.underlyingTicker !== strategy?.underlyingTicker
                        );
                        return crossUnderlying ? (
                          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-2 text-xs text-orange-700 dark:text-orange-300">
                            This strategy will be merged INTO <span className="font-medium">{crossUnderlying.strategyKey}</span> ({crossUnderlying.underlyingTicker}).
                            Positions and trades will move to the parent strategy.
                          </div>
                        ) : (
                          <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-2 text-xs text-purple-700 dark:text-purple-300">
                            {selectedMergeIds.size} strategy(ies) will be merged into this one on confirm.
                            Their positions and trades will be moved here.
                          </div>
                        );
                      })()}
                      {/* Show thesis inheritance notice if applicable */}
                      {!selectedThesisId &&
                        relatedStrategies.some(
                          (rs) => selectedMergeIds.has(rs.id) && rs.assetThesisId
                        ) && (
                          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-2 text-xs text-blue-700 dark:text-blue-300">
                            Asset thesis link will be inherited from merged strategy.
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Asset Thesis Section - Collapsible */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => setShowThesisSection(!showThesisSection)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-foreground">
                  Link to Asset Thesis
                </span>
                <span className="text-xs text-muted-foreground">(optional)</span>
              </div>
              {showThesisSection ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showThesisSection && (
              <div className="px-4 pb-4 pt-2 border-t">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-foreground">
                    Asset Thesis
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('select')}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        mode === 'select'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <LinkIcon className="h-3 w-3 inline mr-1" />
                      Select Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('create')}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        mode === 'create'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      <Plus className="h-3 w-3 inline mr-1" />
                      Create New
                    </button>
                  </div>
                </div>

                {mode === 'select' ? (
                  <div className="space-y-3">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search by title or ticker..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={submitting}
                      />
                    </div>

                    {matchingTickerCount > 0 && strategy.underlyingTicker && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                        {matchingTickerCount} thesis{matchingTickerCount !== 1 ? 'es' : ''} found for {strategy.underlyingTicker}
                      </div>
                    )}

                    {/* Thesis List */}
                    {loadingTheses ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                      </div>
                    ) : filteredTheses.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p>No asset theses found.</p>
                        <button
                          type="button"
                          onClick={() => setMode('create')}
                          className="text-blue-600 hover:text-blue-800 text-sm mt-2"
                        >
                          Create a new one
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                        {filteredTheses.map((thesis) => {
                          const isMatchingTicker = strategy.underlyingTicker
                            ? thesis.underlyingTicker?.toLowerCase() === strategy.underlyingTicker.toLowerCase()
                            : false;
                          return (
                            <button
                              key={thesis.id}
                              type="button"
                              onClick={() => setSelectedThesisId(thesis.id)}
                              disabled={submitting}
                              className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                                selectedThesisId === thesis.id
                                  ? 'border-blue-500 bg-blue-50'
                                  : isMatchingTicker
                                  ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300'
                                  : 'border hover:border-muted-foreground hover:bg-muted'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{thesis.title}</span>
                                {thesis.underlyingTicker && (
                                  <span className={`inline-flex px-1.5 py-0.5 text-xs font-mono rounded ${
                                    isMatchingTicker
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-muted text-foreground'
                                  }`}>
                                    {thesis.underlyingTicker}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {thesis.direction && (
                                  <span
                                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                      thesis.direction === 'bullish'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : thesis.direction === 'bearish'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-muted text-foreground'
                                    }`}
                                  >
                                    {thesis.direction}
                                  </span>
                                )}
                                {thesis.confidenceLevel && (
                                  <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                    {thesis.confidenceLevel}
                                  </span>
                                )}
                                {thesis.timeHorizon && (
                                  <span className="text-xs text-muted-foreground">
                                    {thesis.timeHorizon.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Create New Form */
                  <div className="space-y-4 border rounded-lg p-4 bg-muted">
                    {/* Underlying Selector */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Underlying <span className="text-red-500">*</span>
                      </label>
                      <UnderlyingSelector
                        value={createFormData.ticker}
                        onChange={(ticker) => setCreateFormData({ ...createFormData, ticker })}
                        initialTicker={strategy?.underlyingTicker || ''}
                        disabled={submitting}
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Select an existing underlying or add a new ticker
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Direction <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={createFormData.direction}
                          onChange={(e) => setCreateFormData({ ...createFormData, direction: e.target.value as CreateAssetThesisFormData['direction'] })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                          disabled={submitting}
                        >
                          <option value="bullish">Bullish</option>
                          <option value="bearish">Bearish</option>
                          <option value="neutral">Neutral</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Time Horizon <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={createFormData.timeHorizon}
                          onChange={(e) => setCreateFormData({ ...createFormData, timeHorizon: e.target.value as CreateAssetThesisFormData['timeHorizon'] })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                          disabled={submitting}
                        >
                          <option value="long_term">Long Term</option>
                          <option value="medium_term">Medium Term</option>
                          <option value="short_term">Short Term</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Confidence <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={createFormData.confidenceLevel}
                          onChange={(e) => setCreateFormData({ ...createFormData, confidenceLevel: e.target.value as CreateAssetThesisFormData['confidenceLevel'] })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                          disabled={submitting}
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                          <option value="exploratory">Exploratory</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Status <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={createFormData.status}
                          onChange={(e) => setCreateFormData({ ...createFormData, status: e.target.value as CreateAssetThesisFormData['status'] })}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                          disabled={submitting}
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="complete">Complete</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        value={createFormData.description || ''}
                        onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground"
                        rows={2}
                        placeholder="Brief description of the thesis..."
                        disabled={submitting}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Title will be auto-generated: {createFormData.direction} {createFormData.ticker} {createFormData.timeHorizon.replace('_', ' ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-start">
          {/* Left: status transition actions */}
          <div className="flex flex-col gap-1">
            {(strategy.status === 'draft' || strategy.status === 'active') && (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseStrategy}
                    disabled={submitting || confirmingReject}
                    className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950"
                  >
                    {submitting && confirmingForceClose ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Closing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {confirmingForceClose ? 'Confirm Close' : 'Close'}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRejectStrategy}
                    disabled={submitting || confirmingForceClose}
                    className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950"
                  >
                    {submitting && confirmingReject ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4 mr-2" />
                        {confirmingReject ? 'Confirm Reject' : 'Reject'}
                      </>
                    )}
                  </Button>
                </div>
                {confirmingForceClose && strategy.status === 'active' && (
                  <div className="flex items-start gap-2 max-w-[240px]">
                    <p className="text-xs text-muted-foreground">
                      Remaining positions will be treated as dust. This can be undone.
                    </p>
                    <button
                      onClick={() => setConfirmingForceClose(false)}
                      className="text-xs text-muted-foreground hover:text-foreground underline flex-shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {confirmingReject && (
                  <div className="flex items-start gap-2 max-w-[240px]">
                    <p className="text-xs text-muted-foreground">
                      {strategy.status === 'active'
                        ? 'Strategy has open positions. Mark as spam/airdrop with no economic value?'
                        : 'Mark as spam, airdrop, or no economic value.'}
                    </p>
                    <button
                      onClick={() => setConfirmingReject(false)}
                      className="text-xs text-muted-foreground hover:text-foreground underline flex-shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
            {strategy.status === 'complete' && strategy.closedAt && (
              <Button
                type="button"
                variant="outline"
                onClick={handleReopenStrategy}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reopening...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reopen Strategy
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Right: cancel + primary */}
          <div className="flex items-center gap-3 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || !(isCustomType ? customStrategyType.trim() : strategyTypeId) || !strategyDirection}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {selectedMergeIds.size > 0
                    ? 'Confirming & Merging...'
                    : showThesisSection && mode === 'create'
                    ? 'Creating & Confirming...'
                    : isFirstTimeConfirm ? 'Confirming...' : 'Saving...'}
                </>
              ) : (
                selectedMergeIds.size > 0
                  ? `Confirm & Merge ${selectedMergeIds.size} ${selectedMergeIds.size === 1 ? 'Strategy' : 'Strategies'}`
                  : showThesisSection && mode === 'create'
                  ? 'Create Thesis & Confirm'
                  : isFirstTimeConfirm ? 'Confirm Strategy' : 'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
