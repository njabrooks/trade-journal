'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Link2, AlertCircle, CheckCircle, Search } from 'lucide-react';

interface LinkClaimDialogProps {
  mainClaimId: string;
  mainClaimTitle: string;
  onClose: () => void;
}

interface EntityOption {
  id: string;
  title: string;
  type: 'thesis' | 'view';
  ticker?: string; // For views
}

export function LinkClaimDialog({ mainClaimId, mainClaimTitle, onClose }: LinkClaimDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadingEntities, setLoadingEntities] = useState(true);

  // Entity options
  const [theses, setTheses] = useState<EntityOption[]>([]);
  const [views, setViews] = useState<EntityOption[]>([]);

  // Form state
  const [entityType, setEntityType] = useState<'thesis' | 'view'>('thesis');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [relationshipType, setRelationshipType] = useState<'supports' | 'rebuts' | 'contextualizes'>('supports');
  const [searchQuery, setSearchQuery] = useState('');

  // Load available theses and views
  useEffect(() => {
    const loadEntities = async () => {
      setLoadingEntities(true);
      try {
        // Load theses
        const thesesRes = await fetch('/api/theses');
        if (thesesRes.ok) {
          const thesesData = await thesesRes.json();
          setTheses(
            thesesData.map((t: any) => ({
              id: t.id,
              title: t.title,
              type: 'thesis' as const,
            }))
          );
        }

        // Load views
        const viewsRes = await fetch('/api/asset-views');
        if (viewsRes.ok) {
          const viewsData = await viewsRes.json();
          setViews(
            viewsData.map((v: any) => ({
              id: v.id,
              title: v.title,
              type: 'view' as const,
              ticker: v.underlying?.ticker,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load entities:', err);
      } finally {
        setLoadingEntities(false);
      }
    };

    loadEntities();
  }, []);

  const handleLink = async () => {
    if (!selectedEntityId) {
      setError('Please select a thesis or view to link');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/main-claims/link-to-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainClaimId,
          entityType,
          entityId: selectedEntityId,
          relationshipType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to link claim');
      }

      const result = await response.json();
      setSuccess(true);

      // Refresh and close
      setTimeout(() => {
        router.refresh();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  // Filter entities by search query
  const filteredEntities = (entityType === 'thesis' ? theses : views).filter((entity) =>
    entity.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (entity.ticker && entity.ticker.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Link Main Claim</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Success State */}
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-900">
                  Main claim linked successfully!
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-900">{error}</p>
              </div>
            </div>
          )}

          {/* Form Fields */}
          {!success && (
            <>
              {/* Main Claim Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-sm font-medium text-slate-700 mb-1">Main Claim:</p>
                <p className="text-sm text-slate-600">{mainClaimTitle}</p>
              </div>

              {/* Entity Type Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Link to:
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEntityType('thesis');
                      setSelectedEntityId('');
                      setSearchQuery('');
                    }}
                    className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                      entityType === 'thesis'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                    disabled={loading || loadingEntities}
                  >
                    Macro Thesis
                  </button>
                  <button
                    onClick={() => {
                      setEntityType('view');
                      setSelectedEntityId('');
                      setSearchQuery('');
                    }}
                    className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                      entityType === 'view'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                    }`}
                    disabled={loading || loadingEntities}
                  >
                    Asset Thesis
                  </button>
                </div>
              </div>

              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Search {entityType === 'thesis' ? 'Theses' : 'Views'}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search by ${entityType === 'view' ? 'ticker or ' : ''}title...`}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={loading || loadingEntities}
                  />
                </div>
              </div>

              {/* Entity Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select {entityType === 'thesis' ? 'Thesis' : 'View'} <span className="text-red-500">*</span>
                </label>
                {loadingEntities ? (
                  <div className="text-sm text-slate-500 py-4 text-center">Loading...</div>
                ) : filteredEntities.length === 0 ? (
                  <div className="text-sm text-slate-500 py-4 text-center">
                    No {entityType === 'thesis' ? 'theses' : 'views'} found
                    {searchQuery && ' matching your search'}
                  </div>
                ) : (
                  <div className="border border-slate-300 rounded-md max-h-48 overflow-y-auto">
                    {filteredEntities.map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => setSelectedEntityId(entity.id)}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-200 last:border-b-0 ${
                          selectedEntityId === entity.id ? 'bg-indigo-50' : ''
                        }`}
                        disabled={loading}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {entity.ticker && (
                                <span className="text-emerald-600 font-bold mr-2">{entity.ticker}</span>
                              )}
                              {entity.title}
                            </p>
                          </div>
                          {selectedEntityId === entity.id && (
                            <CheckCircle className="h-4 w-4 text-indigo-600" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Relationship Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Relationship Type
                </label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                >
                  <option value="supports">Supports (provides evidence for)</option>
                  <option value="rebuts">Rebuts (contradicts or challenges)</option>
                  <option value="contextualizes">Contextualizes (provides context)</option>
                </select>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleLink} disabled={loading || !selectedEntityId}>
              {loading ? 'Linking...' : 'Link to ' + (entityType === 'thesis' ? 'Thesis' : 'View')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
