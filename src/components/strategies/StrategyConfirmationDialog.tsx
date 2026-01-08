'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Plus, LinkIcon } from 'lucide-react';

interface Strategy {
  id: string;
  strategyKey: string;
  underlyingTicker: string;
  label?: string | null;
  status: string;
  isAuto?: boolean;
  strategyType?: string | null;
  assetThesisId?: string | null;
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
  status: 'active' | 'under_review' | 'retired';
  description?: string;
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
  // Form state
  const [strategyType, setStrategyType] = useState<string>('');
  const [strategyTypes, setStrategyTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Asset thesis selection state
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

  // Reset state when dialog opens with new strategy
  useEffect(() => {
    if (isOpen && strategy) {
      setStrategyType(strategy.strategyType || '');
      setSelectedThesisId(strategy.assetThesisId || null);
      setMode('select');
      setSearchQuery('');
      setError(null);
      setCreateFormData({
        ticker: strategy.underlyingTicker,
        direction: 'bullish',
        timeHorizon: 'medium_term',
        confidenceLevel: 'medium',
        status: 'active',
        description: '',
      });
    }
  }, [isOpen, strategy]);

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
    const matchingTicker = filtered.filter(
      (t) => t.underlyingTicker?.toLowerCase() === strategy.underlyingTicker.toLowerCase()
    );
    const otherTheses = filtered.filter(
      (t) => t.underlyingTicker?.toLowerCase() !== strategy.underlyingTicker.toLowerCase()
    );

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
      const response = await fetch('/api/strategies?strategyTypes=true');
      if (response.ok) {
        const types = await response.json();
        setStrategyTypes(types);
      }
    } catch (err) {
      console.error('Failed to load strategy types:', err);
    } finally {
      setLoadingTypes(false);
    }
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

  const handleConfirm = async () => {
    if (!strategy) return;

    // Validation
    if (!strategyType) {
      setError('Strategy type is required');
      return;
    }

    let assetThesisId = selectedThesisId;

    // If creating new thesis, create it first
    if (mode === 'create') {
      setSubmitting(true);
      setError(null);
      try {
        const createResponse = await fetch('/api/asset-theses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createFormData),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(errorData.error || 'Failed to create asset thesis');
        }

        const newThesis = await createResponse.json();
        assetThesisId = newThesis.id;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create asset thesis');
        setSubmitting(false);
        return;
      }
    }

    if (!assetThesisId) {
      setError('Please select or create an asset thesis');
      setSubmitting(false);
      return;
    }

    // Now confirm the strategy
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: strategy.id,
          strategyType,
          assetThesisId,
          confirm: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm strategy');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm strategy');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !strategy) {
    return null;
  }

  // Count how many theses match the strategy's ticker
  const matchingTickerCount = assetTheses.filter(
    (t) => t.underlyingTicker?.toLowerCase() === strategy.underlyingTicker.toLowerCase()
  ).length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">Confirm Strategy</h2>
          <p className="text-sm text-slate-600 mt-1">
            Select a strategy type and link to an asset thesis
          </p>
        </div>

        <div className="px-6 py-4 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Strategy Info */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-2">Strategy Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">Key:</span>{' '}
                <span className="font-mono text-slate-900">{strategy.strategyKey}</span>
              </div>
              <div>
                <span className="text-slate-500">Underlying:</span>{' '}
                <span className="font-mono font-medium text-slate-900">{strategy.underlyingTicker}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{' '}
                <span className="text-slate-900">{strategy.status}</span>
              </div>
              {strategy.label && (
                <div>
                  <span className="text-slate-500">Label:</span>{' '}
                  <span className="text-slate-900">{strategy.label}</span>
                </div>
              )}
            </div>
          </div>

          {/* Strategy Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Strategy Type <span className="text-red-500">*</span>
            </label>
            <select
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={submitting || loadingTypes}
            >
              <option value="">Select a strategy type...</option>
              {strategyTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Links the strategy to playbook items for state code computation
            </p>
          </div>

          {/* Asset Thesis Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                Asset Thesis <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    mode === 'select'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by title or ticker..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting}
                  />
                </div>

                {matchingTickerCount > 0 && (
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
                  <div className="text-center py-6 text-slate-500">
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
                      const isMatchingTicker = thesis.underlyingTicker?.toLowerCase() === strategy.underlyingTicker.toLowerCase();
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
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{thesis.title}</span>
                            {thesis.underlyingTicker && (
                              <span className={`inline-flex px-1.5 py-0.5 text-xs font-mono rounded ${
                                isMatchingTicker
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
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
                                    : 'bg-slate-100 text-slate-700'
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
                              <span className="text-xs text-slate-500">
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
              <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                  Creating new thesis for <strong>{createFormData.ticker}</strong>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Direction <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createFormData.direction}
                      onChange={(e) => setCreateFormData({ ...createFormData, direction: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={submitting}
                    >
                      <option value="bullish">Bullish</option>
                      <option value="bearish">Bearish</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Time Horizon <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createFormData.timeHorizon}
                      onChange={(e) => setCreateFormData({ ...createFormData, timeHorizon: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={submitting}
                    >
                      <option value="long_term">Long Term</option>
                      <option value="medium_term">Medium Term</option>
                      <option value="short_term">Short Term</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Confidence <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createFormData.confidenceLevel}
                      onChange={(e) => setCreateFormData({ ...createFormData, confidenceLevel: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={submitting}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="exploratory">Exploratory</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createFormData.status}
                      onChange={(e) => setCreateFormData({ ...createFormData, status: e.target.value as any })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={submitting}
                    >
                      <option value="active">Active</option>
                      <option value="under_review">Under Review</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={createFormData.description || ''}
                    onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Brief description of the thesis..."
                    disabled={submitting}
                  />
                </div>

                <p className="text-xs text-slate-500">
                  Title will be auto-generated: {createFormData.direction} {createFormData.ticker} {createFormData.timeHorizon.replace('_', ' ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
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
            disabled={submitting || !strategyType || (mode === 'select' && !selectedThesisId)}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {mode === 'create' ? 'Creating & Confirming...' : 'Confirming...'}
              </>
            ) : (
              mode === 'create' ? 'Create Thesis & Confirm' : 'Confirm Strategy'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
