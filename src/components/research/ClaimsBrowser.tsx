'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { ClaimsStructure, MainClaim, EvidenceClaim, ClaimConfidence } from '@/types/claims';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConvertClaimDialog } from './ConvertClaimDialog';
import { Search, Filter, Info } from 'lucide-react';

interface ClaimsBrowserProps {
  claimsStructure: ClaimsStructure;
  insightId: string;
}

type ConversionFilter = 'all' | 'unconverted' | 'converted';
type ClaimTypeFilter = 'all' | 'thesis_candidate' | 'view_candidate';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'exploratory';
type CategoryFilter = 'all' | 'macro' | 'asset_specific';
type SortBy = 'original' | 'confidence' | 'time_horizon';

export function ClaimsBrowser({ claimsStructure, insightId }: ClaimsBrowserProps) {
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());
  const [convertingClaim, setConvertingClaim] = useState<MainClaim | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [conversionFilter, setConversionFilter] = useState<ConversionFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ClaimTypeFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('original');
  const [showFilters, setShowFilters] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // "/" to focus search (like GitHub, Linear, etc.)
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        if (!showFilters) {
          setShowFilters(true);
        }
        // Focus search input after a brief delay to ensure filter panel is rendered
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }

      // Escape to clear search/close filters
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

  const toggleClaim = (claimId: string) => {
    const newExpanded = new Set(expandedClaims);
    if (newExpanded.has(claimId)) {
      newExpanded.delete(claimId);
    } else {
      newExpanded.add(claimId);
    }
    setExpandedClaims(newExpanded);
  };

  const getEvidenceById = (evidenceId: string): EvidenceClaim | undefined => {
    return claimsStructure.evidence_claims.find((e) => e.id === evidenceId);
  };

  // Filter and sort claims
  const filteredAndSortedClaims = useMemo(() => {
    let claims = [...claimsStructure.main_claims];

    // Apply filters
    if (conversionFilter !== 'all') {
      claims = claims.filter((c) =>
        conversionFilter === 'converted' ? !!c.converted_to : !c.converted_to
      );
    }

    if (typeFilter !== 'all') {
      claims = claims.filter((c) => c.type === typeFilter);
    }

    if (confidenceFilter !== 'all') {
      claims = claims.filter((c) => c.qualifier === confidenceFilter);
    }

    if (categoryFilter !== 'all') {
      claims = claims.filter((c) => c.category === categoryFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      claims = claims.filter(
        (c) =>
          c.claim.toLowerCase().includes(query) ||
          c.grounds.toLowerCase().includes(query) ||
          c.warrant.toLowerCase().includes(query) ||
          c.relevant_tickers?.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    if (sortBy === 'confidence') {
      const confidenceOrder: Record<ClaimConfidence, number> = {
        high: 4,
        medium: 3,
        low: 2,
        exploratory: 1,
      };
      claims.sort((a, b) => confidenceOrder[b.qualifier] - confidenceOrder[a.qualifier]);
    } else if (sortBy === 'time_horizon') {
      const horizonOrder: Record<string, number> = {
        long_term: 3,
        medium_term: 2,
        short_term: 1,
      };
      claims.sort(
        (a, b) =>
          (horizonOrder[b.time_horizon || ''] || 0) - (horizonOrder[a.time_horizon || ''] || 0)
      );
    }

    return claims;
  }, [
    claimsStructure.main_claims,
    conversionFilter,
    typeFilter,
    confidenceFilter,
    categoryFilter,
    searchQuery,
    sortBy,
  ]);

  const thesisCandidates = filteredAndSortedClaims.filter((c) => c.type === 'thesis_candidate');
  const viewCandidates = filteredAndSortedClaims.filter((c) => c.type === 'view_candidate');

  const unconvertedCount = claimsStructure.main_claims.filter((c) => !c.converted_to).length;
  const convertedCount = claimsStructure.main_claims.filter((c) => !!c.converted_to).length;

  const getQualifierColor = (qualifier: string) => {
    switch (qualifier) {
      case 'high':
        return 'bg-emerald-100 text-emerald-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'low':
        return 'bg-amber-100 text-amber-700';
      case 'exploratory':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const renderMainClaim = (claim: MainClaim) => {
    const isExpanded = expandedClaims.has(claim.id);
    const supportingEvidence = claim.supporting_evidence_claims
      .map(getEvidenceById)
      .filter(Boolean) as EvidenceClaim[];
    const rebuttingEvidence = claim.rebutting_evidence_claims
      .map(getEvidenceById)
      .filter(Boolean) as EvidenceClaim[];

    return (
      <div key={claim.id} className="bg-white rounded-lg border border-slate-200 p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={getQualifierColor(claim.qualifier)}>
                {claim.qualifier} confidence
              </Badge>
              <Badge variant="outline" className="text-xs">
                {claim.category}
              </Badge>
              {claim.time_horizon && (
                <Badge variant="outline" className="text-xs">
                  {claim.time_horizon.replace('_', ' ')}
                </Badge>
              )}
              {claim.converted_to && (
                <Badge className="bg-purple-100 text-purple-700">
                  ✓ Converted to {claim.converted_to.type.replace('_', ' ')}
                </Badge>
              )}
            </div>
            <h4 className="font-semibold text-slate-900 leading-snug">{claim.claim}</h4>
            {claim.relevant_tickers && claim.relevant_tickers.length > 0 && (
              <div className="flex gap-1 mt-2">
                {claim.relevant_tickers.map((ticker) => (
                  <span
                    key={ticker}
                    className="inline-flex px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-900 rounded"
                  >
                    {ticker}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 ml-4">
            <Button variant="outline" size="sm" onClick={() => toggleClaim(claim.id)}>
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            {!claim.converted_to && (
              <Button size="sm" onClick={() => setConvertingClaim(claim)}>
                Convert
              </Button>
            )}
          </div>
        </div>

        {/* Expanded Toulmin Structure */}
        {isExpanded && (
          <div className="space-y-4 mt-4 pt-4 border-t border-slate-200">
            {/* Grounds (Evidence) */}
            {claim.grounds && (
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                  Evidence (Grounds)
                  <span
                    className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                    title="The factual data or observations supporting the claim"
                  >
                    <Info className="h-2 w-2" />
                  </span>
                </h5>
                <p className="text-sm text-slate-700">{claim.grounds}</p>
              </div>
            )}

            {/* Warrant (Reasoning) */}
            {claim.warrant && (
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                  Reasoning (Warrant)
                  <span
                    className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                    title="The logical connection between evidence and claim"
                  >
                    <Info className="h-2 w-2" />
                  </span>
                </h5>
                <p className="text-sm text-slate-700">{claim.warrant}</p>
              </div>
            )}

            {/* Backing */}
            {claim.backing && (
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                  Backing
                  <span
                    className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                    title="Additional support for why the reasoning is valid"
                  >
                    <Info className="h-2 w-2" />
                  </span>
                </h5>
                <p className="text-sm text-slate-700">{claim.backing}</p>
              </div>
            )}

            {/* Rebuttal */}
            {claim.rebuttal && (
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                  Rebuttal / Counter-Arguments
                  <span
                    className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-200 text-slate-600 cursor-help"
                    title="Conditions under which the claim might not hold or counter-evidence"
                  >
                    <Info className="h-2 w-2" />
                  </span>
                </h5>
                <p className="text-sm text-slate-700">{claim.rebuttal}</p>
              </div>
            )}

            {/* Supporting Evidence Claims */}
            {supportingEvidence.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Supporting Evidence ({supportingEvidence.length})
                </h5>
                <div className="space-y-2">
                  {supportingEvidence.map((evidence) => (
                    <div
                      key={evidence.id}
                      className="border-l-3 border-emerald-500 pl-3 py-1 bg-emerald-50"
                    >
                      <p className="text-sm text-slate-900">{evidence.claim}</p>
                      {evidence.grounds && (
                        <p className="text-xs text-slate-600 mt-1">{evidence.grounds}</p>
                      )}
                      <span className="inline-flex mt-1 px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded">
                        {evidence.confidence} confidence
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rebutting Evidence Claims */}
            {rebuttingEvidence.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Rebutting Evidence ({rebuttingEvidence.length})
                </h5>
                <div className="space-y-2">
                  {rebuttingEvidence.map((evidence) => (
                    <div
                      key={evidence.id}
                      className="border-l-3 border-red-500 pl-3 py-1 bg-red-50"
                    >
                      <p className="text-sm text-slate-900">{evidence.claim}</p>
                      {evidence.grounds && (
                        <p className="text-xs text-slate-600 mt-1">{evidence.grounds}</p>
                      )}
                      <span className="inline-flex mt-1 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                        {evidence.confidence} confidence
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-semibold">Forensic Claims Analysis</h3>
          <p className="text-sm text-slate-500 mt-1">
            Extracted {claimsStructure.main_claims.length} main claims and{' '}
            {claimsStructure.evidence_claims.length} evidence claims using Toulmin framework
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Source: {claimsStructure.metadata.source_skill} •{' '}
            {claimsStructure.metadata.extraction_date}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (expandedClaims.size === filteredAndSortedClaims.length) {
                setExpandedClaims(new Set());
              } else {
                setExpandedClaims(new Set(filteredAndSortedClaims.map((c) => c.id)));
              }
            }}
          >
            {expandedClaims.size === filteredAndSortedClaims.length
              ? 'Collapse All'
              : 'Expand All'}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Search */}
            <div className="lg:col-span-3">
              <label htmlFor="claims-search" className="block text-xs font-medium text-slate-700 mb-1">
                Search
                <span className="ml-2 text-xs text-slate-400 font-normal">
                  (Press "/" to focus)
                </span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  id="claims-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search claims, evidence, or tickers..."
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Search claims"
                />
              </div>
            </div>

            {/* Conversion Status */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Conversion Status
              </label>
              <select
                value={conversionFilter}
                onChange={(e) => setConversionFilter(e.target.value as ConversionFilter)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All ({claimsStructure.main_claims.length})</option>
                <option value="unconverted">Unconverted ({unconvertedCount})</option>
                <option value="converted">Converted ({convertedCount})</option>
              </select>
            </div>

            {/* Claim Type */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Claim Type</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as ClaimTypeFilter)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="thesis_candidate">Thesis Candidates</option>
                <option value="view_candidate">View Candidates</option>
              </select>
            </div>

            {/* Confidence Level */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Confidence</label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                <option value="macro">Macro</option>
                <option value="asset_specific">Asset Specific</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="original">Original Order</option>
                <option value="confidence">Confidence (High to Low)</option>
                <option value="time_horizon">Time Horizon (Long to Short)</option>
              </select>
            </div>
          </div>

          {/* Active filters summary */}
          {(searchQuery ||
            conversionFilter !== 'all' ||
            typeFilter !== 'all' ||
            confidenceFilter !== 'all' ||
            categoryFilter !== 'all' ||
            sortBy !== 'original') && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-600">
                Showing {filteredAndSortedClaims.length} of {claimsStructure.main_claims.length}{' '}
                claims
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setConversionFilter('all');
                  setTypeFilter('all');
                  setConfidenceFilter('all');
                  setCategoryFilter('all');
                  setSortBy('original');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          <div className="pt-3 border-t border-slate-200 mt-3">
            <p className="text-xs text-slate-500">
              <span className="font-medium">Keyboard shortcuts:</span>{' '}
              <kbd className="px-1.5 py-0.5 text-xs bg-slate-100 border border-slate-300 rounded">
                /
              </kbd>{' '}
              to search,{' '}
              <kbd className="px-1.5 py-0.5 text-xs bg-slate-100 border border-slate-300 rounded">
                Esc
              </kbd>{' '}
              to clear/close
            </p>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-slate-900">
              {claimsStructure.main_claims.length}
            </div>
            <div className="text-xs text-slate-400">
              ({filteredAndSortedClaims.length} shown)
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">Main Claims</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-blue-600">
              {claimsStructure.main_claims.filter((c) => c.type === 'thesis_candidate').length}
            </div>
            <div className="text-xs text-blue-400">
              {Math.round(
                (claimsStructure.main_claims.filter((c) => c.type === 'thesis_candidate').length /
                  claimsStructure.main_claims.length) *
                  100
              )}
              %
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">Thesis Candidates</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-purple-600">
              {claimsStructure.main_claims.filter((c) => c.type === 'view_candidate').length}
            </div>
            <div className="text-xs text-purple-400">
              {Math.round(
                (claimsStructure.main_claims.filter((c) => c.type === 'view_candidate').length /
                  claimsStructure.main_claims.length) *
                  100
              )}
              %
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">View Candidates</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-emerald-600">
              {claimsStructure.evidence_claims.length}
            </div>
            <div className="text-xs text-emerald-400">
              {(claimsStructure.evidence_claims.length / claimsStructure.main_claims.length).toFixed(
                1
              )}
              :1
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">Evidence Claims</div>
        </div>
      </div>

      {/* Claims List */}
      {filteredAndSortedClaims.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-4">
              <Search className="h-6 w-6" />
            </div>
            <h4 className="text-lg font-medium text-slate-900 mb-2">No claims found</h4>
            <p className="text-sm text-slate-600 mb-6">
              No claims match your current filters. Try adjusting your search criteria or clearing
              filters to see all claims.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setConversionFilter('all');
                setTypeFilter('all');
                setConfidenceFilter('all');
                setCategoryFilter('all');
                setSortBy('original');
              }}
            >
              Clear All Filters
            </Button>
          </div>
        </div>
      ) : typeFilter === 'all' ? (
        <>
          {/* Thesis Candidates */}
          {thesisCandidates.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                  {thesisCandidates.length}
                </span>
                Macro Thesis Candidates
              </h4>
              <div className="space-y-3">{thesisCandidates.map(renderMainClaim)}</div>
            </div>
          )}

          {/* View Candidates */}
          {viewCandidates.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                  {viewCandidates.length}
                </span>
                Asset View Candidates
              </h4>
              <div className="space-y-3">{viewCandidates.map(renderMainClaim)}</div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">{filteredAndSortedClaims.map(renderMainClaim)}</div>
      )}

      {/* Convert Dialog */}
      {convertingClaim && (
        <ConvertClaimDialog
          claim={convertingClaim}
          insightId={insightId}
          onClose={() => setConvertingClaim(null)}
        />
      )}
    </div>
  );
}
