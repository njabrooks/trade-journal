'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import type { MainClaim as DbMainClaim, ResearchInsight, ResearchArtifact } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Link2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClaimsStructure, EvidenceClaim } from '@/types/claims';
import { getSupportingEvidence, getRebuttingEvidence, isValidClaimsStructure } from '@/types/claims';
import { ConvertClaimToEntityDialog } from './ConvertClaimToEntityDialog';
import { ExpandableEvidenceClaim } from './ExpandableEvidenceClaim';
import { InlineClaimSuggestions } from './InlineClaimSuggestions';
import type { SuggestionActionResult } from './InlineClaimSuggestions';
import type { ClaimSuggestion } from '@/db/queries/research';
import { SIGNAL_TYPE_COLORS } from '@/components/signals/signal-constants';

interface LinkedThesis {
  id: string;
  title: string;
  mappingType: string; // 'supports' | 'refutes' | 'foundation'
}

interface LinkedView {
  id: string;
  title: string;
  ticker: string;
  mappingType: string; // 'supports' | 'refutes' | 'foundation'
}

interface LinkedSignal {
  id: string;
  statement: string;
  type: string; // 'confirmation' | 'warning'
  assessment: string; // 'neutral' | 'strengthening' | 'confirmed' | 'weakening' | 'invalidated'
}

interface ClaimWithSource {
  claim: DbMainClaim;
  insight: ResearchInsight | null;
  artifact: ResearchArtifact | null;
  linkedTheses?: LinkedThesis[];
  linkedViews?: LinkedView[];
  linkedSignals?: LinkedSignal[];
  suggestions?: ClaimSuggestion[];
}

interface UnifiedClaimsBrowserProps {
  claimsWithSources: ClaimWithSource[];
  filterArtifactId?: string; // Optional: filter claims to a specific research source
  initialLinkedToFilter?: string; // Optional: pre-filter to a specific thesis/view ID
  showSourceColumn?: boolean; // Optional: show the Research source column in table (default: false)
  compact?: boolean; // Optional: hide filter panel and show minimal UI (default: false)
  onSuggestionActioned?: (result: SuggestionActionResult) => void; // Callback when a suggestion is accepted/rejected
  /** B5: suppress claim-to-thesis suggestions (monitoring-phase theses route to signals) */
  suppressSuggestions?: boolean;
}

type StatusFilter = 'all' | 'draft' | 'active' | 'complete' | 'rejected';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low' | 'exploratory';
type CategoryFilter = 'all' | 'macro' | 'asset_specific';
type SortColumn = 'claim' | 'source' | 'confidence' | 'category' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export function UnifiedClaimsBrowser({
  claimsWithSources,
  filterArtifactId,
  initialLinkedToFilter,
  showSourceColumn = false,
  onSuggestionActioned,
  suppressSuggestions = false,
}: UnifiedClaimsBrowserProps) {
  const router = useRouter();
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [linkedToFilter, setLinkedToFilter] = useState<string>(initialLinkedToFilter || 'all'); // 'all', 'unlinked', or thesis/view ID
  const [showFilters, setShowFilters] = useState(false);

  // Get unique theses and views for filter dropdown
  const uniqueLinkedEntities = useMemo(() => {
    const entities = new Map<string, { id: string; title: string; type: 'macro' | 'asset' }>();
    
    claimsWithSources.forEach((claimWithSource) => {
      claimWithSource.linkedTheses?.forEach((thesis) => {
        entities.set(`macro-${thesis.id}`, { id: thesis.id, title: thesis.title, type: 'macro' });
      });
      claimWithSource.linkedViews?.forEach((view) => {
        entities.set(`asset-${view.id}`, { id: view.id, title: view.title, type: 'asset' });
      });
    });
    
    return Array.from(entities.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [claimsWithSources]);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Loading state for status updates
  const [updatingClaimId, setUpdatingClaimId] = useState<string | null>(null);

  // Convert/Link dialog state (used by both status badge and Link button)
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

    // Linked To filter
    if (linkedToFilter !== 'all') {
      if (linkedToFilter === 'unlinked') {
        claims = claims.filter((c) => {
          const hasLinks = (c.linkedTheses && c.linkedTheses.length > 0) ||
                          (c.linkedViews && c.linkedViews.length > 0);
          return !hasLinks;
        });
      } else {
        // Filter by specific thesis or view ID
        claims = claims.filter((c) => {
          const linkedThesisIds = c.linkedTheses?.map(t => t.id) || [];
          const linkedViewIds = c.linkedViews?.map(v => v.id) || [];
          return linkedThesisIds.includes(linkedToFilter) || linkedViewIds.includes(linkedToFilter);
        });
      }
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
          aVal = a.claim.title.toLowerCase();
          bVal = b.claim.title.toLowerCase();
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
          const statusOrder = { unconfirmed: 0, confirmed: 1, rejected: 2, invalidated: 3, merged: 4 };
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
    linkedToFilter,
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
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'medium':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'low':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'exploratory':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'draft':
        return 'bg-muted text-muted-foreground';
      case 'complete':
        return 'bg-muted text-muted-foreground';
      case 'rejected':
        return 'bg-destructive/15 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleStatusChange = async (claimId: string, newStatus: string, event: React.ChangeEvent<HTMLSelectElement>) => {
    const claimData = claimsWithSources.find(c => c.claim.id === claimId);
    const previousStatus = claimData?.claim.status || '';

    // If setting to 'active', show convert dialog to link/create thesis or view
    if (newStatus === 'active' && claimData) {
      const hasLinks = (claimData.linkedTheses && claimData.linkedTheses.length > 0) ||
                       (claimData.linkedViews && claimData.linkedViews.length > 0);

      if (!hasLinks) {
        // Show convert dialog instead of just alerting
        event.target.value = previousStatus; // Revert dropdown
        setClaimToConvert(claimData.claim);
        setConvertDialogOpen(true);
        return;
      }
      // If already has links, allow direct confirmation (fall through to API call)
    }

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

      console.log('Status updated successfully');

      // Clear loading state
      setUpdatingClaimId(null);

      // Notify parent to refresh data
      router.refresh();

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

  // Get badge styling for relationship type
  const getRelationshipBadge = (mappingType: string) => {
    switch (mappingType) {
      case 'supports':
        return { className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', label: 'Supports' };
      case 'refutes':
        return { className: 'bg-destructive/15 text-destructive', label: 'Refutes' };
      case 'foundation':
        return { className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', label: 'Foundation' };
      default:
        return { className: 'bg-muted text-muted-foreground', label: mappingType };
    }
  };

  // Get badge styling for category
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'macro':
        return { className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400', label: 'Macro' };
      case 'asset_specific':
        return { className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', label: 'Asset' };
      default:
        return { className: 'bg-muted text-muted-foreground', label: category };
    }
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
          {showFilters && <span className="text-xs text-muted-foreground">(ESC to close)</span>}
        </Button>
        <div className="w-px h-6 bg-border" />

        {/* Status Quick Filter Button Group */}
        <div className="inline-flex rounded-md shadow-sm">
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
            className="rounded-r-none border-r-0"
          >
            All
          </Button>
          <Button
            variant={statusFilter === 'draft' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('draft')}
            className="rounded-none border-r-0"
          >
            Draft
          </Button>
          <Button
            variant={statusFilter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('active')}
            className="rounded-l-none"
          >
            Active
          </Button>
        </div>

        <div className="ml-auto text-sm text-muted-foreground">
          Showing {filteredAndSortedClaims.length} of {claimsWithSources.length} claims
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-card rounded-lg border border p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search claims, evidence, tickers... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Confidence */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Confidence</label>
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
              <label className="block text-sm font-medium text-foreground mb-1">Category</label>
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

            {/* Linked To */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Linked To</label>
              <select
                value={linkedToFilter}
                onChange={(e) => setLinkedToFilter(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Claims</option>
                <option value="unlinked">Unlinked Only</option>
                {uniqueLinkedEntities.length > 0 && (
                  <>
                    <optgroup label="Macro Theses">
                      {uniqueLinkedEntities
                        .filter((e) => e.type === 'macro')
                        .map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.title}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Asset Theses">
                      {uniqueLinkedEntities
                        .filter((e) => e.type === 'asset')
                        .map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.title}
                          </option>
                        ))}
                    </optgroup>
                  </>
                )}
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
                setLinkedToFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Claims Table */}
      <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedClaims.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No claims match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th
                    className="px-4 py-3 text-left w-2/5 cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('claim')}
                  >
                    <div className="flex items-center gap-2">
                      Claim
                      {getSortIcon('claim')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left">
                    Linked To
                  </th>
                  {showSourceColumn && (
                    <th
                      className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleSort('source')}
                    >
                      <div className="flex items-center gap-2">
                        Source
                        {getSortIcon('source')}
                      </div>
                    </th>
                  )}
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('confidence')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Confidence
                      {getSortIcon('confidence')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('category')}
                  >
                    <div className="flex items-center justify-center gap-2">
                      Category
                      {getSortIcon('category')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-center cursor-pointer hover:bg-accent transition-colors"
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
                {filteredAndSortedClaims.map(({ claim, insight, artifact, linkedTheses = [], linkedViews = [], linkedSignals = [], suggestions = [] }) => {
                  const isExpanded = expandedClaim === claim.id;
                  const evidenceClaims = getEvidenceClaims({ claim, insight, artifact });

                  return (
                    <Fragment key={claim.id}>
                      {/* Main Row */}
                      <tr className="border-b hover:bg-muted transition-colors">
                        {/* Claim Title (brief summary) */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <Link
                              href={`/claims/${claim.id}`}
                              className="text-foreground font-medium hover:text-blue-600 hover:underline transition-colors block line-clamp-2"
                            >
                              {claim.title}
                            </Link>
                          </div>
                        </td>

                        {/* Linked To */}
                        <td className="px-4 py-3">
                          <div className={isExpanded ? "space-y-1" : "flex items-center gap-1 overflow-hidden"}>
                            {linkedTheses.length === 0 && linkedViews.length === 0 ? (
                              suggestions.length > 0 && !suppressSuggestions ? (
                                <InlineClaimSuggestions suggestions={suggestions} compact={true} onSuggestionActioned={onSuggestionActioned} suppressSuggestions={suppressSuggestions} />
                              ) : (
                                <span className="text-xs text-muted-foreground">Not linked</span>
                              )
                            ) : (
                              <>
                                {/* Combined list of all linked entities */}
                                {(() => {
                                  const allLinked = [
                                    ...linkedTheses.map((thesis) => ({
                                      id: thesis.id,
                                      title: thesis.title,
                                      type: 'macro' as const,
                                      url: `/macro-theses/${thesis.id}`,
                                      mappingType: thesis.mappingType,
                                    })),
                                    ...linkedViews.map((view) => ({
                                      id: view.id,
                                      title: view.title,
                                      type: 'asset' as const,
                                      url: `/asset-theses/${view.id}`,
                                      mappingType: view.mappingType,
                                    })),
                                  ];

                                  const visibleEntities = isExpanded ? allLinked : allLinked.slice(0, 1);
                                  const remainingCount = allLinked.length - 1;
                                  const showMoreBadge = !isExpanded && remainingCount > 0;

                                  return (
                                    <>
                                      {visibleEntities.map((entity, index) => {
                                        const relationshipBadge = getRelationshipBadge(entity.mappingType);
                                        return (
                                          <span key={entity.id} className={isExpanded ? "flex items-center gap-1" : "inline-flex items-center gap-1 shrink-0"}>
                                            <Badge className={`${relationshipBadge.className} text-xs`}>
                                              {relationshipBadge.label}
                                            </Badge>
                                            <Link
                                              href={entity.url}
                                              className={`text-sm text-foreground hover:text-blue-600 hover:underline transition-colors ${isExpanded ? 'line-clamp-1' : 'truncate max-w-[150px]'}`}
                                              title={entity.title}
                                            >
                                              {entity.title}
                                            </Link>
                                            {!isExpanded && index < visibleEntities.length - 1 && !showMoreBadge && <span className="text-muted-foreground">,</span>}
                                          </span>
                                        );
                                      })}
                                      {showMoreBadge && (
                                        <button
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setExpandedClaim(claim.id);
                                          }}
                                          title={`Show all ${allLinked.length} linked entities:\n${allLinked.slice(1).map(e => `• ${e.title}`).join('\n')}`}
                                          className="text-xs text-muted-foreground hover:text-blue-600 font-medium cursor-pointer shrink-0 ml-1 group"
                                        >
                                          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/25 group-hover:underline text-xs transition-colors">
                                            +{remainingCount}
                                          </Badge>
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                              </>
                            )}
                            {/* Signal evidence indicator */}
                            {linkedSignals.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setExpandedClaim(isExpanded ? null : claim.id);
                                }}
                                title={linkedSignals.map(s => {
                                  const assessmentEmoji: Record<string, string> = {
                                    neutral: '\u2B1B', strengthening: '\uD83D\uDCC8', confirmed: '\u2705',
                                    weakening: '\uD83D\uDCC9', invalidated: '\u274C',
                                  };
                                  const typeConfig = SIGNAL_TYPE_COLORS[s.type] ?? SIGNAL_TYPE_COLORS.confirmation;
                                  return `${assessmentEmoji[s.assessment] ?? '\u2B1C'} [${typeConfig.label}] ${s.statement}`;
                                }).join('\n')}
                                className="inline-flex items-center gap-1 shrink-0 group"
                              >
                                {!isExpanded && (linkedTheses.length > 0 || linkedViews.length > 0) && (
                                  <span className="text-border mx-0.5">|</span>
                                )}
                                <Badge className="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 group-hover:bg-cyan-500/25 text-xs transition-colors inline-flex items-center gap-0.5">
                                  <Zap className="h-3 w-3" />
                                  {linkedSignals.length}
                                </Badge>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Source - Research artifact title */}
                        {showSourceColumn && (
                          <td className="px-4 py-3">
                            {artifact ? (
                              <Link
                                href={`/research/${artifact.id}`}
                                className="text-sm text-foreground hover:text-blue-600 hover:underline transition-colors line-clamp-1"
                                title={artifact.title}
                              >
                                {artifact.title}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}

                        {/* Confidence */}
                        <td className="px-4 py-3 text-center">
                          {claim.qualifier ? (
                            <Badge className={`${confidenceBadgeColor(claim.qualifier)} text-xs`}>
                              {claim.qualifier}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const categoryBadge = getCategoryBadge(claim.category);
                            return (
                              <Badge className={`${categoryBadge.className} text-xs`}>
                                {categoryBadge.label}
                              </Badge>
                            );
                          })()}
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
                            <option value="draft">Draft</option>
                            <option value="active">✓ Active</option>
                            <option value="complete">Complete</option>
                            <option value="rejected">✗ Rejected</option>
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
                              className="h-7 w-7 p-0"
                              title="Link to theses/views"
                            >
                              <Link2 className="h-4 w-4" />
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
                        <tr className="bg-muted border-b">
                          <td colSpan={showSourceColumn ? 7 : 6} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* Full Claim Text */}
                              <div>
                                <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                  Claim
                                </h4>
                                <p className="text-sm text-foreground font-medium">{claim.claim}</p>
                              </div>

                              {/* Evidence */}
                              {claim.evidence && claim.evidence.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                    Evidence
                                  </h4>
                                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                    {claim.evidence.map((point, idx) => {
                                      // Type guard: ensure point is a string
                                      if (typeof point !== 'string') {
                                        console.warn('Non-string evidence point:', point);
                                        return null;
                                      }
                                      return <li key={idx}>{point}</li>;
                                    })}
                                  </ul>
                                </div>
                              )}

                              {/* Reasoning */}
                              {claim.reasoning && (
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                    Reasoning
                                  </h4>
                                  <p className="text-sm text-muted-foreground">{claim.reasoning}</p>
                                </div>
                              )}

                              {/* Backing */}
                              {claim.backing && (
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                    Backing
                                  </h4>
                                  <p className="text-sm text-muted-foreground">{claim.backing}</p>
                                </div>
                              )}

                              {/* Rebuttal */}
                              {claim.rebuttal && claim.rebuttal.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                                    Rebuttal
                                  </h4>
                                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                    {claim.rebuttal.map((point, idx) => {
                                      // Type guard: ensure point is a string
                                      if (typeof point !== 'string') {
                                        console.warn('Non-string rebuttal point:', point);
                                        return null;
                                      }
                                      return <li key={idx}>{point}</li>;
                                    })}
                                  </ul>
                                </div>
                              )}

                              {/* Evidence Claims from Audit - Full Toulmin Framework */}
                              {(evidenceClaims.supporting.length > 0 || evidenceClaims.rebutting.length > 0) && (
                                <div className="pt-2 border-t border">
                                  <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                                    Linked Evidence Claims
                                  </h4>

                                  {evidenceClaims.supporting.length > 0 && (
                                    <div className="mb-3">
                                      <h5 className="text-xs font-medium text-emerald-700 mb-2">
                                        Supporting ({evidenceClaims.supporting.length})
                                      </h5>
                                      <div className="space-y-2">
                                        {evidenceClaims.supporting.map((evidence) => (
                                          <ExpandableEvidenceClaim
                                            key={evidence.id}
                                            evidenceClaim={evidence}
                                            relationshipType="supports"
                                            showRelationship={false}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {evidenceClaims.rebutting.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-medium text-red-700 mb-2">
                                        Rebutting ({evidenceClaims.rebutting.length})
                                      </h5>
                                      <div className="space-y-2">
                                        {evidenceClaims.rebutting.map((evidence) => (
                                          <ExpandableEvidenceClaim
                                            key={evidence.id}
                                            evidenceClaim={evidence}
                                            relationshipType="refutes"
                                            showRelationship={false}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Linked Theses and Views */}
                              {(linkedTheses.length > 0 || linkedViews.length > 0) && (
                                <div className="pt-2 border-t border">
                                  <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                                    Linked To
                                  </h4>
                                  <div className="space-y-2">
                                    {linkedTheses.map((thesis) => {
                                      const relationshipBadge = getRelationshipBadge(thesis.mappingType);
                                      return (
                                        <Link
                                          key={thesis.id}
                                          href={`/macro-theses/${thesis.id}`}
                                          className="block text-sm text-foreground hover:text-blue-600 hover:underline transition-colors"
                                        >
                                          <span className="inline-flex items-center gap-1">
                                            <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 text-xs">Macro</Badge>
                                            <Badge className={`${relationshipBadge.className} text-xs`}>
                                              {relationshipBadge.label}
                                            </Badge>
                                            {thesis.title}
                                            <ExternalLink className="h-3 w-3" />
                                          </span>
                                        </Link>
                                      );
                                    })}
                                    {linkedViews.map((view) => {
                                      const relationshipBadge = getRelationshipBadge(view.mappingType);
                                      return (
                                        <Link
                                          key={view.id}
                                          href={`/asset-theses/${view.id}`}
                                          className="block text-sm text-foreground hover:text-blue-600 hover:underline transition-colors"
                                        >
                                          <span className="inline-flex items-center gap-1">
                                            <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs">Asset</Badge>
                                            <Badge className={`${relationshipBadge.className} text-xs`}>
                                              {relationshipBadge.label}
                                            </Badge>
                                            {view.title} ({view.ticker})
                                            <ExternalLink className="h-3 w-3" />
                                          </span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Signal Evidence */}
                              {linkedSignals.length > 0 && (
                                <div className="pt-2 border-t border">
                                  <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                                    Signal Evidence
                                  </h4>
                                  <div className="space-y-2">
                                    {linkedSignals.map((signal) => {
                                      const assessmentEmoji: Record<string, string> = {
                                        neutral: '⬛',
                                        strengthening: '📈',
                                        confirmed: '✅',
                                        weakening: '📉',
                                        invalidated: '❌',
                                      };
                                      const typeConfig = SIGNAL_TYPE_COLORS[signal.type] ?? SIGNAL_TYPE_COLORS.confirmation;
                                      const typeColor = typeConfig.cls;
                                      const typeLabel = typeConfig.label;
                                      return (
                                        <Link
                                          key={signal.id}
                                          href={`/signals/${signal.id}`}
                                          className="block text-sm text-foreground hover:text-blue-600 hover:underline transition-colors"
                                        >
                                          <span className="inline-flex items-center gap-1">
                                            <Badge className={`${typeColor} text-xs`}>{typeLabel}</Badge>
                                            <span className="text-xs">{assessmentEmoji[signal.assessment] ?? '⬜'}</span>
                                            <span className="line-clamp-1">{signal.statement}</span>
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                          </span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* AI Suggested Linkages (B5: suppressed for monitoring-phase theses) */}
                              {suggestions.length > 0 && !suppressSuggestions && (
                                <div className="pt-2 border-t border">
                                  <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                                    <span>Suggested Linkages</span>
                                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs">AI</Badge>
                                  </h4>
                                  <InlineClaimSuggestions suggestions={suggestions} compact={false} onSuggestionActioned={onSuggestionActioned} suppressSuggestions={suppressSuggestions} />
                                </div>
                              )}

                              {/* Source */}
                              {artifact && insight && (
                                <div className="pt-2 border-t border">
                                  <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                                    Source
                                  </h4>
                                  <Link
                                    href={`/research/${artifact.id}`}
                                    className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 text-sm"
                                  >
                                    <span>{artifact.title}</span>
                                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                  </Link>
                                  <div className="text-xs text-muted-foreground capitalize mt-1">
                                    {artifact.sourceType}
                                  </div>
                                </div>
                              )}

                              {/* Metadata */}
                              <div className="grid grid-cols-2 gap-4 pt-2 border-t border">
                                {claim.timeHorizon && (
                                  <div>
                                    <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Time Horizon:</span>
                                    <span className="ml-2 text-sm text-muted-foreground capitalize">{claim.timeHorizon.replace('_', ' ')}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Created:</span>
                                  <span className="ml-2 text-sm text-muted-foreground">{new Date(claim.createdAt).toLocaleDateString('en-GB')}</span>
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

      {/* Convert/Link Claim Dialog (used by both status badge and Link button) */}
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
