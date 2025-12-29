'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import type { MainClaim as DbMainClaim, ResearchInsight, ResearchArtifact } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClaimsStructure, EvidenceClaim } from '@/types/claims';
import { getSupportingEvidence, getRebuttingEvidence, isValidClaimsStructure } from '@/types/claims';
import { ConvertClaimToEntityDialog } from './ConvertClaimToEntityDialog';

interface ClaimWithSource {
  claim: DbMainClaim;
  insight: ResearchInsight | null;
  artifact: ResearchArtifact | null;
}

interface UnifiedClaimsBrowserProps {
  claimsWithSources: ClaimWithSource[];
  filterArtifactId?: string; // Optional: filter claims to a specific research source
}

type StatusFilter = 'all' | 'unconfirmed' | 'confirmed' | 'invalidated' | 'merged';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'exploratory';
type CategoryFilter = 'all' | 'macro' | 'asset_specific';
type SortColumn = 'claim' | 'source' | 'confidence' | 'category' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export function UnifiedClaimsBrowser({ claimsWithSources, filterArtifactId }: UnifiedClaimsBrowserProps) {
  const router = useRouter();
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Loading state for status updates
  const [updatingClaimId, setUpdatingClaimId] = useState<string | null>(null);

  // Convert dialog state
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [claimToConvert, setClaimToConvert] = useState<DbMainClaim | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        if (!showFilters) {
          setShowFilters(true);
        }
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }

      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
        } else if (showFilters) {
          setShowFilters(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, showFilters]);

  // Filter and sort claims
  const filteredAndSortedClaims = useMemo(() => {
    let claims = [...claimsWithSources];

    // Filter by artifact ID if specified (for single-source view)
    if (filterArtifactId) {
      claims = claims.filter((c) => c.artifact?.id === filterArtifactId);
    }

    // Filter
    if (statusFilter !== 'all') {
      claims = claims.filter((c) => c.claim.status === statusFilter);
    }

    if (confidenceFilter !== 'all') {
      claims = claims.filter((c) => c.claim.qualifier === confidenceFilter);
    }

    if (categoryFilter !== 'all') {
      claims = claims.filter((c) => c.claim.category === categoryFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      claims = claims.filter((c) => {
        const searchableText = [
          c.claim.claim,
          c.claim.evidence,
          c.claim.reasoning,
          c.claim.backing,
          c.claim.title,
          c.artifact?.title,
          ...(c.claim.relevantTickers || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    // Sort
    claims.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'claim':
          aVal = a.claim.claim.toLowerCase();
          bVal = b.claim.claim.toLowerCase();
          break;
        case 'source':
          aVal = a.artifact?.title?.toLowerCase() || '';
          bVal = b.artifact?.title?.toLowerCase() || '';
          break;
        case 'confidence':
          const confidenceOrder = { high: 3, medium: 2, low: 1, exploratory: 0, null: -1 };
          aVal = confidenceOrder[a.claim.qualifier as keyof typeof confidenceOrder] ?? -1;
          bVal = confidenceOrder[b.claim.qualifier as keyof typeof confidenceOrder] ?? -1;
          break;
        case 'category':
          aVal = a.claim.category;
          bVal = b.claim.category;
          break;
        case 'status':
          const statusOrder = { unconfirmed: 0, confirmed: 1, invalidated: 2, merged: 3 };
          aVal = statusOrder[a.claim.status as keyof typeof statusOrder] ?? 0;
          bVal = statusOrder[b.claim.status as keyof typeof statusOrder] ?? 0;
          break;
        case 'createdAt':
          aVal = new Date(a.claim.createdAt).getTime();
          bVal = new Date(b.claim.createdAt).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return claims;
  }, [
    claimsWithSources,
    filterArtifactId,
    statusFilter,
    confidenceFilter,
    categoryFilter,
    searchQuery,
    sortColumn,
    sortDirection,
  ]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const confidenceBadgeColor = (confidence: string | null) => {
    switch (confidence) {
      case 'high':
        return 'bg-emerald-100 text-emerald-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-amber-100 text-amber-700';
      case 'exploratory':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-100 text-emerald-700';
      case 'unconfirmed':
        return 'bg-amber-100 text-amber-700';
      case 'invalidated':
        return 'bg-red-100 text-red-700';
      case 'merged':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleStatusChange = async (claimId: string, newStatus: string, event: React.ChangeEvent<HTMLSelectElement>) => {
    const previousStatus = claimsWithSources.find(c => c.claim.id === claimId)?.claim.status || '';

    try {
      console.log('Updating status:', { claimId, newStatus, previousStatus });

      // Set loading state
      setUpdatingClaimId(claimId);

      const response = await fetch('/api/research/claims/update-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, status: newStatus }),
      });

      const data = await response.json();
      console.log('API Response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update status');
      }

      console.log('Status updated successfully, refreshing data...');

      // Use Next.js router refresh instead of hard reload
      router.refresh();

      // Clear loading state after a brief delay to show feedback
      setTimeout(() => {
        setUpdatingClaimId(null);
      }, 300);

    } catch (error) {
      console.error('Error updating status:', error);

      // Revert the dropdown to previous value
      event.target.value = previousStatus;

      // Clear loading state
      setUpdatingClaimId(null);

      alert(`Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Get evidence claims from the audit
  const getEvidenceClaims = (claimWithSource: ClaimWithSource): {
    supporting: EvidenceClaim[];
    rebutting: EvidenceClaim[];
  } => {
    if (!claimWithSource.insight?.claimsStructure || !claimWithSource.claim.sourceClaimId) {
      return { supporting: [], rebutting: [] };
    }

    const claimsStructure = claimWithSource.insight.claimsStructure as ClaimsStructure;
    if (!isValidClaimsStructure(claimsStructure)) {
      return { supporting: [], rebutting: [] };
    }

    const supporting = getSupportingEvidence(claimWithSource.claim.sourceClaimId, claimsStructure);
    const rebutting = getRebuttingEvidence(claimWithSource.claim.sourceClaimId, claimsStructure);

    return { supporting, rebutting };
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {showFilters && <span className="text-xs text-slate-500">(ESC to close)</span>}
        </Button>
        <div className="text-sm text-slate-600">
          Showing {filteredAndSortedClaims.length} of {claimsWithSources.length} claims
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search claims, evidence, tickers... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="unconfirmed">Unconfirmed</option>
                <option value="confirmed">Confirmed</option>
                <option value="invalidated">Invalidated</option>
                <option value="merged">Merged</option>
              </select>
            </div>

            {/* Confidence */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confidence</label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Levels</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="exploratory">Exploratory</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                <option value="macro">Macro</option>
                <option value="asset_specific">Asset Specific</option>
              </select>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setConfidenceFilter('all');
                setCategoryFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Claims Table */}
      <section className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedClaims.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              No claims match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <th
                    className="px-4 py-3 text-left w-2/5 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('claim')}
                  >
                    <div className="flex items-center gap-2">
                      Claim
                      {getSortIcon('claim')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('source')}
                  >
                    <div className="flex items-center gap-2">
                      Source
                      {getSortIcon('source')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('confidence')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Confidence
                      {getSortIcon('confidence')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Category
                      {getSortIcon('category')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Status
                      {getSortIcon('status')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedClaims.map(({ claim, insight, artifact }) => {
                  const isExpanded = expandedClaim === claim.id;
                  const evidenceClaims = getEvidenceClaims({ claim, insight, artifact });

                  return (
                    <Fragment key={claim.id}>
                      {/* Main Row */}
                      <tr className="border-b hover:bg-slate-50 transition-colors">
                        {/* Claim */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="text-slate-900 font-medium line-clamp-2">{claim.claim}</p>
                            {claim.relevantTickers && claim.relevantTickers.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {claim.relevantTickers.slice(0, 3).map((ticker) => (
                                  <span
                                    key={ticker}
                                    className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-slate-100 text-slate-700 rounded"
                                  >
                                    ${ticker}
                                  </span>
                                ))}
                                {claim.relevantTickers.length > 3 && (
                                  <span className="text-xs text-slate-500">
                                    +{claim.relevantTickers.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Source */}
                        <td className="px-4 py-3">
                          {artifact && insight ? (
                            <>
                              <Link
                                href={`/research/${artifact.id}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 text-sm"
                              >
                                <span className="line-clamp-2">{artifact.title}</span>
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              </Link>
                              <div className="text-xs text-slate-500 capitalize mt-0.5">
                                {artifact.sourceType}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">No source</span>
                          )}
                        </td>

                        {/* Confidence */}
                        <td className="px-4 py-3 text-center">
                          {claim.qualifier ? (
                            <Badge className={`${confidenceBadgeColor(claim.qualifier)} text-xs`}>
                              {claim.qualifier}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 text-center">
                          <span className="text-slate-600 capitalize text-xs">
                            {claim.category.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Status - Editable Dropdown */}
                        <td className="px-4 py-3 text-center">
                          <select
                            value={claim.status}
                            onChange={(e) => handleStatusChange(claim.id, e.target.value, e)}
                            disabled={updatingClaimId === claim.id}
                            className={`${statusBadgeColor(claim.status)} text-xs px-2 py-1 rounded border-0 font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                              updatingClaimId === claim.id ? 'opacity-50 cursor-wait' : ''
                            }`}
                          >
                            <option value="unconfirmed">Unconfirmed</option>
                            <option value="confirmed">✓ Confirmed</option>
                            <option value="invalidated">Invalidated</option>
                            <option value="merged">Merged</option>
                          </select>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setClaimToConvert(claim);
                                setConvertDialogOpen(true);
                              }}
                              className="h-7 px-2 text-xs"
                              title="Convert to Thesis/View"
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              Convert
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedClaim(isExpanded ? null : claim.id)}
                              className="h-7 w-7 p-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="space-y-4 max-w-4xl">
                              {/* Evidence */}
                              {claim.evidence && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                                    Evidence
                                  </h4>
                                  <p className="text-sm text-slate-600">{claim.evidence}</p>
                                </div>
                              )}

                              {/* Reasoning */}
                              {claim.reasoning && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                                    Reasoning
                                  </h4>
                                  <p className="text-sm text-slate-600">{claim.reasoning}</p>
                                </div>
                              )}

                              {/* Backing */}
                              {claim.backing && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                                    Backing
                                  </h4>
                                  <p className="text-sm text-slate-600">{claim.backing}</p>
                                </div>
                              )}

                              {/* Rebuttal */}
                              {claim.rebuttal && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                                    Rebuttal
                                  </h4>
                                  <p className="text-sm text-slate-600">{claim.rebuttal}</p>
                                </div>
                              )}

                              {/* Evidence Claims from Audit */}
                              {(evidenceClaims.supporting.length > 0 || evidenceClaims.rebutting.length > 0) && (
                                <div className="pt-2 border-t border-slate-200">
                                  <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                                    Linked Evidence Claims
                                  </h4>

                                  {evidenceClaims.supporting.length > 0 && (
                                    <div className="mb-3">
                                      <h5 className="text-xs font-medium text-emerald-700 mb-1">
                                        Supporting ({evidenceClaims.supporting.length})
                                      </h5>
                                      <ul className="space-y-2">
                                        {evidenceClaims.supporting.map((evidence) => (
                                          <li key={evidence.id} className="text-sm text-slate-600 pl-3 border-l-2 border-emerald-300">
                                            <div className="flex items-start gap-2">
                                              <Badge className="bg-emerald-100 text-emerald-700 text-xs shrink-0">
                                                {evidence.confidence}
                                              </Badge>
                                              <span>{evidence.claim}</span>
                                            </div>
                                            {evidence.evidence && (
                                              <p className="text-xs text-slate-500 mt-1 italic">{evidence.evidence}</p>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {evidenceClaims.rebutting.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-medium text-red-700 mb-1">
                                        Rebutting ({evidenceClaims.rebutting.length})
                                      </h5>
                                      <ul className="space-y-2">
                                        {evidenceClaims.rebutting.map((evidence) => (
                                          <li key={evidence.id} className="text-sm text-slate-600 pl-3 border-l-2 border-red-300">
                                            <div className="flex items-start gap-2">
                                              <Badge className="bg-red-100 text-red-700 text-xs shrink-0">
                                                {evidence.confidence}
                                              </Badge>
                                              <span>{evidence.claim}</span>
                                            </div>
                                            {evidence.evidence && (
                                              <p className="text-xs text-slate-500 mt-1 italic">{evidence.evidence}</p>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Metadata */}
                              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                                {claim.timeHorizon && (
                                  <div>
                                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Time Horizon:</span>
                                    <span className="ml-2 text-sm text-slate-600 capitalize">{claim.timeHorizon.replace('_', ' ')}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Created:</span>
                                  <span className="ml-2 text-sm text-slate-600">{new Date(claim.createdAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Convert Claim Dialog */}
      {claimToConvert && (
        <ConvertClaimToEntityDialog
          claim={claimToConvert}
          isOpen={convertDialogOpen}
          onClose={() => {
            setConvertDialogOpen(false);
            setClaimToConvert(null);
          }}
        />
      )}
    </div>
  );
}
