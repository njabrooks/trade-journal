'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Search, Link2 } from 'lucide-react';

interface MainClaim {
  id: string;
  title: string | null;
  category: string;
  claim: string;
  qualifier: string;
  timeHorizon: string | null;
  relevantTickers: string[] | null;
  status: string;
  createdAt: Date;
}

interface AddMainClaimDialogProps {
  entityType: 'thesis' | 'view';
  entityId: string;
  entityTitle: string;
  onClose: () => void;
}

export function AddMainClaimDialog({
  entityType,
  entityId,
  entityTitle,
  onClose,
}: AddMainClaimDialogProps) {
  const [mainClaims, setMainClaims] = useState<MainClaim[]>([]);
  const [filteredClaims, setFilteredClaims] = useState<MainClaim[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [relationshipType, setRelationshipType] = useState<'supports' | 'rebuts' | 'contextualizes'>('supports');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load main claims
  useEffect(() => {
    const loadMainClaims = async () => {
      try {
        const res = await fetch('/api/main-claims');
        if (!res.ok) throw new Error('Failed to load main claims');
        const data = await res.json();
        setMainClaims(data.claims);
        setFilteredClaims(data.claims);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load main claims');
      } finally {
        setLoading(false);
      }
    };

    loadMainClaims();
  }, []);

  // Filter claims based on search
  useEffect(() => {
    if (!searchQuery) {
      setFilteredClaims(mainClaims);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = mainClaims.filter(
      (claim) =>
        claim.claim.toLowerCase().includes(query) ||
        claim.title?.toLowerCase().includes(query) ||
        claim.relevantTickers?.some((t) => t.toLowerCase().includes(query))
    );
    setFilteredClaims(filtered);
  }, [searchQuery, mainClaims]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimId) {
      setError('Please select a main claim');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/main-claims/link-to-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainClaimId: selectedClaimId,
          entityType,
          entityId,
          relationshipType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to link main claim');
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.reload(); // Refresh to show new link
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link main claim');
      setSubmitting(false);
    }
  };

  const getQualifierColor = (qualifier: string) => {
    switch (qualifier) {
      case 'high':
        return 'bg-emerald-100 text-emerald-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Add Main Claim</h2>
            <p className="text-sm text-slate-600 mt-1">
              Link a main claim to {entityType}: {entityTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Search */}
          <div className="p-6 border-b border-slate-200">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Search Main Claims
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by claim text, title, or ticker..."
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Showing {filteredClaims.length} of {mainClaims.length} main claims
            </p>
          </div>

          {/* Claims List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-slate-600 mt-2">Loading main claims...</p>
              </div>
            ) : filteredClaims.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">No main claims found</p>
                <p className="text-sm text-slate-500 mt-1">
                  Try adjusting your search or promote claims from research insights
                </p>
              </div>
            ) : (
              filteredClaims.map((claim) => (
                <label
                  key={claim.id}
                  className={`block p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedClaimId === claim.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="mainClaim"
                      value={claim.id}
                      checked={selectedClaimId === claim.id}
                      onChange={(e) => setSelectedClaimId(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      {claim.title && (
                        <div className="font-medium text-slate-900 mb-1">{claim.title}</div>
                      )}
                      <div className="text-sm text-slate-700">{claim.claim}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getQualifierColor(
                            claim.qualifier
                          )}`}
                        >
                          {claim.qualifier} confidence
                        </span>
                        <span className="text-xs text-slate-500">{claim.category}</span>
                        {claim.timeHorizon && (
                          <span className="text-xs text-slate-500">
                            {claim.timeHorizon.replace('_', ' ')}
                          </span>
                        )}
                        {claim.relevantTickers && claim.relevantTickers.length > 0 && (
                          <div className="flex gap-1">
                            {claim.relevantTickers.map((ticker) => (
                              <span
                                key={ticker}
                                className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-slate-100 text-slate-900 rounded"
                              >
                                {ticker}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>

          {/* Relationship Type */}
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Relationship Type
            </label>
            <select
              value={relationshipType}
              onChange={(e) =>
                setRelationshipType(e.target.value as 'supports' | 'rebuts' | 'contextualizes')
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="supports">Supports - This claim provides evidence for the {entityType}</option>
              <option value="rebuts">Rebuts - This claim contradicts or challenges the {entityType}</option>
              <option value="contextualizes">Contextualizes - This claim provides context for the {entityType}</option>
            </select>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="mx-6 mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
              <p className="text-sm text-emerald-700">Main claim linked successfully! Refreshing...</p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 p-6 border-t border-slate-200 bg-white">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !selectedClaimId}>
              {submitting ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link to {entityType === 'thesis' ? 'Thesis' : 'View'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
