'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import type { StrategyListItem } from '@/db/queries/strategies';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Filter, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Layers } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { StrategyQuickAction } from '@/components/strategies/StrategyQuickAction';

interface UnifiedStrategiesBrowserProps {
  strategies: StrategyListItem[];
}

type StatusFilter = 'all' | 'draft' | 'active' | 'complete' | 'rejected';
type QuickStatusFilter = 'all' | 'draft' | 'active' | 'closed';
type SortColumn = 'label' | 'account' | 'status' | 'marketValue' | 'unrealized' | 'pctNav' | 'openedAt';
type SortDirection = 'asc' | 'desc';

export function UnifiedStrategiesBrowser({ strategies }: UnifiedStrategiesBrowserProps) {
  const router = useRouter();
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<string | null>(null); // Strategy ID with expanded accounts
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Quick filter states
  const [quickStatusFilter, setQuickStatusFilter] = useState<QuickStatusFilter>('active');
  const [groupByAccount, setGroupByAccount] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [assetThesisFilter, setAssetThesisFilter] = useState<string>('all');
  const [macroThesisFilter, setMacroThesisFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortColumn, setSortColumn] = useState<SortColumn>('openedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Get badge styling for account (generate consistent color based on account name)
  const getAccountBadge = (account: string | null) => {
    if (!account) return null;

    // Generate a hash from the account name for consistent coloring
    let hash = 0;
    for (let i = 0; i < account.length; i++) {
      hash = account.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Use hash to pick from a set of pleasant color combinations
    const colors = [
      'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
      'bg-pink-50 text-pink-700 border border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800',
      'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-800',
      'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
      'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
      'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
      'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
      'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
      'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
      'bg-lime-50 text-lime-700 border border-lime-200 dark:bg-lime-900/30 dark:text-lime-300 dark:border-lime-800',
      'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
      'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    ];

    const colorIndex = Math.abs(hash) % colors.length;
    return { className: colors[colorIndex], label: account };
  };

  // Get unique values for filters (include position-derived account labels)
  const uniqueAccounts = useMemo(() => {
    const accounts = new Set<string>();
    strategies.forEach((strategy) => {
      // Include position-derived account labels (from actual positions)
      strategy.positionAccountIds?.forEach((accountLabel) => {
        if (accountLabel) accounts.add(accountLabel);
      });
      // Fallback to strategy-level account if no positions (prefer label)
      if (!strategy.positionAccountIds?.length) {
        const accountDisplay = strategy.accountLabel || strategy.accountBrokerId;
        if (accountDisplay) accounts.add(accountDisplay);
      }
    });
    return Array.from(accounts).sort();
  }, [strategies]);

  const uniqueAssetTheses = useMemo(() => {
    const theses = new Map<string, string>();
    strategies.forEach((strategy) => {
      if (strategy.assetThesisId && strategy.assetViewTitle) {
        theses.set(strategy.assetThesisId, strategy.assetViewTitle);
      }
    });
    return Array.from(theses.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [strategies]);

  const uniqueMacroTheses = useMemo(() => {
    const theses = new Map<string, string>();
    strategies.forEach((strategy) => {
      strategy.linkedMacroTheses.forEach((lmt) => {
        theses.set(lmt.id, lmt.title);
      });
    });
    return Array.from(theses.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [strategies]);

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

  // Filter and sort strategies
  const filteredAndSortedStrategies = useMemo(() => {
    let filtered = [...strategies];

    // Always exclude merged strategies (they've been merged into other strategies)
    filtered = filtered.filter((s) => s.status?.toLowerCase() !== 'merged');

    // Apply quick status filter (quick buttons take precedence)
    if (quickStatusFilter !== 'all') {
      if (quickStatusFilter === 'closed') {
        filtered = filtered.filter((s) => s.status === 'complete' || s.status === 'rejected');
      } else {
        filtered = filtered.filter((s) => s.status === quickStatusFilter);
      }
    }

    // Apply panel status filter on top of quick filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }

    if (accountFilter !== 'all') {
      filtered = filtered.filter((s) => {
        // Check position-derived accounts first
        if (s.positionAccountIds?.length > 0) {
          return s.positionAccountIds.includes(accountFilter);
        }
        // Fallback to strategy-level account
        const accountLabel = s.accountLabel || s.accountBrokerId;
        return accountLabel === accountFilter;
      });
    }

    if (assetThesisFilter !== 'all') {
      filtered = filtered.filter((s) => s.assetThesisId === assetThesisFilter);
    }

    if (macroThesisFilter !== 'all') {
      filtered = filtered.filter((s) =>
        s.linkedMacroTheses.some((lmt) => lmt.id === macroThesisFilter)
      );
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => {
        const searchableText = [
          s.label,
          s.strategyKey,
          s.accountLabel,
          s.accountBrokerId,
          s.assetViewTitle,
          ...s.linkedMacroTheses.map((lmt) => lmt.title),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'label':
          aVal = a.label?.toLowerCase() || '';
          bVal = b.label?.toLowerCase() || '';
          break;
        case 'account':
          aVal = (a.accountLabel || a.accountBrokerId || '').toLowerCase();
          bVal = (b.accountLabel || b.accountBrokerId || '').toLowerCase();
          break;
        case 'status':
          const statusOrder = { active: 0, draft: 1, complete: 2, rejected: 3 };
          aVal = statusOrder[a.status as keyof typeof statusOrder] ?? 99;
          bVal = statusOrder[b.status as keyof typeof statusOrder] ?? 99;
          break;
        case 'marketValue':
          aVal = a.latestMarketValue ?? 0;
          bVal = b.latestMarketValue ?? 0;
          break;
        case 'unrealized':
          aVal = a.latestUnrealized ?? 0;
          bVal = b.latestUnrealized ?? 0;
          break;
        case 'pctNav':
          aVal = a.latestPctNav ?? 0;
          bVal = b.latestPctNav ?? 0;
          break;
        case 'openedAt':
          aVal = a.openedAt ? new Date(a.openedAt).getTime() : 0;
          bVal = b.openedAt ? new Date(b.openedAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [
    strategies,
    quickStatusFilter,
    statusFilter,
    accountFilter,
    assetThesisFilter,
    macroThesisFilter,
    searchQuery,
    sortColumn,
    sortDirection,
  ]);

  // Group strategies by account when groupByAccount is enabled
  const groupedByAccount = useMemo(() => {
    if (!groupByAccount) return null;

    const groups = new Map<string, { label: string; strategies: typeof filteredAndSortedStrategies; totalMarketValue: number }>();

    for (const strategy of filteredAndSortedStrategies) {
      // Use primary account (first position account, or strategy-level fallback)
      const accountLabel =
        (strategy.positionAccountIds?.length > 0 ? strategy.positionAccountIds[0] : null)
        ?? strategy.accountLabel
        ?? strategy.accountBrokerId
        ?? 'No Account';

      if (!groups.has(accountLabel)) {
        groups.set(accountLabel, { label: accountLabel, strategies: [], totalMarketValue: 0 });
      }
      const group = groups.get(accountLabel)!;
      group.strategies.push(strategy);
      group.totalMarketValue += Math.abs(strategy.latestMarketValue ?? 0);
    }

    // Sort groups by total abs notional descending, "No Account" last
    return Array.from(groups.values()).sort((a, b) => {
      if (a.label === 'No Account') return 1;
      if (b.label === 'No Account') return -1;
      return b.totalMarketValue - a.totalMarketValue;
    });
  }, [filteredAndSortedStrategies, groupByAccount]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
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

  const statusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft':
        return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
      case 'active':
        return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
      case 'complete':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
      case 'rejected':
        return 'bg-slate-50 text-muted-foreground border border-slate-200 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700';
      default:
        return 'bg-slate-50 text-foreground border border-slate-200 dark:bg-slate-800/30 dark:text-slate-300 dark:border-slate-700';
    }
  };

  // Render a single strategy row (extracted for reuse in grouped and flat rendering)
  const renderStrategyRow = (strategy: StrategyListItem) => {
    const isExpanded = expandedStrategy === strategy.id;

    return (
      <Fragment key={strategy.id}>
        {/* Main Row */}
        <tr className="border-b hover:bg-muted transition-colors">
          {/* Strategy */}
          <td className="px-4 py-3">
            <Link
              href={`/strategies/${strategy.id}`}
              className="text-foreground font-medium hover:text-blue-600 truncate block"
              title={`${strategy.label} (${strategy.strategyKey})`}
            >
              <span>{strategy.label}</span>
              <span className="text-xs text-muted-foreground font-mono ml-2">({strategy.strategyKey})</span>
            </Link>
          </td>

          {/* Account */}
          <td className="px-4 py-3">
            {(() => {
              const accounts = strategy.positionAccountIds?.length > 0
                ? strategy.positionAccountIds
                : strategy.accountLabel || strategy.accountBrokerId
                  ? [strategy.accountLabel || strategy.accountBrokerId!]
                  : [];

              if (accounts.length === 0) {
                return <span className="text-xs text-muted-foreground">—</span>;
              }

              const isAccountsExpanded = expandedAccounts === strategy.id;
              const visibleAccounts = isAccountsExpanded ? accounts : accounts.slice(0, 1);
              const remainingCount = accounts.length - 1;
              const showMoreBadge = !isAccountsExpanded && remainingCount > 0;

              return (
                <div className={isAccountsExpanded ? "space-y-1" : "flex items-center gap-1"}>
                  {visibleAccounts.map((account) => {
                    const accountBadge = getAccountBadge(account);
                    return accountBadge ? (
                      <Badge key={account} className={`${accountBadge.className} text-xs`}>
                        {accountBadge.label}
                      </Badge>
                    ) : null;
                  })}
                  {showMoreBadge && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedAccounts(strategy.id);
                      }}
                      title={`Show all ${accounts.length} accounts:\n${accounts.slice(1).map(a => `• ${a}`).join('\n')}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer shrink-0 group"
                    >
                      <Badge className="bg-blue-50 text-blue-700 group-hover:bg-blue-100 group-hover:underline text-xs transition-colors dark:bg-blue-900/30 dark:text-blue-300 dark:group-hover:bg-blue-900/50">
                        +{remainingCount}
                      </Badge>
                    </button>
                  )}
                  {isAccountsExpanded && accounts.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedAccounts(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      (collapse)
                    </button>
                  )}
                </div>
              );
            })()}
          </td>

          {/* Status */}
          <td className="px-4 py-3 text-center">
            <Badge className={`${statusBadgeColor(strategy.status)} text-xs`}>
              {strategy.status}
            </Badge>
          </td>

          {/* Asset Theses */}
          <td className="px-4 py-3">
            {strategy.assetViewTitle && strategy.assetThesisId ? (
              <Link
                href={`/asset-theses/${strategy.assetThesisId}`}
                className="text-blue-600 hover:text-blue-800 hover:underline text-sm line-clamp-1"
              >
                {strategy.assetViewTitle}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Not linked</span>
            )}
          </td>

          {/* Mkt Value */}
          <td className="px-4 py-3 text-right font-medium text-foreground">
            {formatCurrency(strategy.latestMarketValue)}
          </td>

          {/* Unrealized */}
          <td className="px-4 py-3 text-right">
            <span className={
              strategy.latestUnrealized && strategy.latestUnrealized >= 0
                ? 'text-emerald-600'
                : 'text-rose-600'
            }>
              {formatCurrency(strategy.latestUnrealized)}
            </span>
          </td>

          {/* % NAV */}
          <td className="px-4 py-3 text-right">
            {formatPercent(strategy.latestPctNav)}
          </td>

          {/* Actions */}
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-2">
              <StrategyQuickAction
                strategy={strategy}
                onActionComplete={() => router.refresh()}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpandedStrategy(isExpanded ? null : strategy.id)}
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
            <td colSpan={9} className="px-4 py-4">
              <div className="space-y-4">
                {/* Linked Theses */}
                {(strategy.linkedMacroTheses.length > 0 || strategy.assetViewTitle) && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
                      Linked Theses
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {strategy.linkedMacroTheses.map((lmt) => (
                        <Link
                          key={lmt.id}
                          href={`/macro-theses/${lmt.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                        >
                          <Badge className="bg-purple-200 text-purple-800 text-xs">Macro</Badge>
                          {lmt.title}
                        </Link>
                      ))}
                      {strategy.assetViewTitle && strategy.assetThesisId && (
                        <Link
                          href={`/asset-theses/${strategy.assetThesisId}`}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                        >
                          <Badge className="bg-blue-200 text-blue-800 text-xs">Asset</Badge>
                          {strategy.assetViewTitle}
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="grid grid-cols-4 gap-4 pt-2 border-t border">
                  {strategy.strategyType && (
                    <div>
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Type:</span>
                      <span className="ml-2 text-sm text-muted-foreground">{strategy.strategyType}</span>
                    </div>
                  )}
                  {strategy.openedAt && (
                    <div>
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Opened:</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {new Date(strategy.openedAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  )}
                  <div className="col-span-2">
                    <Link
                      href={`/strategies/${strategy.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Full Details →
                    </Link>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="space-y-4">
      {/* Quick Filters and Controls Bar */}
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
            variant={quickStatusFilter === 'draft' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuickStatusFilter(quickStatusFilter === 'draft' ? 'all' : 'draft')}
            className="rounded-r-none border-r-0"
          >
            Draft
          </Button>
          <Button
            variant={quickStatusFilter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuickStatusFilter(quickStatusFilter === 'active' ? 'all' : 'active')}
            className="rounded-none border-r-0"
          >
            Active
          </Button>
          <Button
            variant={quickStatusFilter === 'closed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuickStatusFilter(quickStatusFilter === 'closed' ? 'all' : 'closed')}
            className="rounded-l-none"
          >
            Closed
          </Button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Group by Account Toggle */}
        <Button
          variant={groupByAccount ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGroupByAccount(!groupByAccount)}
          className="gap-2"
        >
          <Layers className="h-4 w-4" />
          Group by Account
        </Button>

        <div className="text-sm text-muted-foreground">
          Showing {filteredAndSortedStrategies.length} of {strategies.length} strategies
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
              placeholder="Search strategy, account, state code... (Press / to focus)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full border border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {/* Account */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Account
              </label>
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="w-full border border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Accounts</option>
                {uniqueAccounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            </div>

            {/* Asset Thesis */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Asset Thesis
              </label>
              <select
                value={assetThesisFilter}
                onChange={(e) => setAssetThesisFilter(e.target.value)}
                className="w-full border border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Theses</option>
                {uniqueAssetTheses.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </div>

            {/* Macro Thesis */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Macro Thesis
              </label>
              <select
                value={macroThesisFilter}
                onChange={(e) => setMacroThesisFilter(e.target.value)}
                className="w-full border border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Theses</option>
                {uniqueMacroTheses.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
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
                setAccountFilter('all');
                setAssetThesisFilter('all');
                setMacroThesisFilter('all');
                setQuickStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Strategies Table */}
      <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {filteredAndSortedStrategies.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No strategies match the selected filters.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('label')}
                  >
                    <div className="flex items-center gap-2">
                      Strategy
                      {getSortIcon('label')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('account')}
                  >
                    <div className="flex items-center gap-2">
                      Account
                      {getSortIcon('account')}
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
                  <th className="px-4 py-3 text-left">
                    Asset Theses
                  </th>
                  <th
                    className="px-4 py-3 text-right cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('marketValue')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Mkt Value
                      {getSortIcon('marketValue')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('unrealized')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Unrealized
                      {getSortIcon('unrealized')}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-right cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSort('pctNav')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      % NAV
                      {getSortIcon('pctNav')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupByAccount && groupedByAccount ? (
                  // Grouped rendering
                  groupedByAccount.map((group) => (
                    <Fragment key={group.label}>
                      {/* Account Group Header */}
                      <tr className="bg-muted/70 border-b">
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const accountBadge = getAccountBadge(group.label);
                              return accountBadge ? (
                                <Badge className={`${accountBadge.className} text-xs`}>
                                  {accountBadge.label}
                                </Badge>
                              ) : (
                                <span className="font-semibold text-sm">{group.label}</span>
                              );
                            })()}
                            <Badge variant="outline" className="text-xs">
                              {group.strategies.length}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatCurrency(group.totalMarketValue)} market value
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Group Strategies */}
                      {group.strategies.map((strategy) => renderStrategyRow(strategy))}
                    </Fragment>
                  ))
                ) : (
                  // Flat rendering
                  filteredAndSortedStrategies.map((strategy) => renderStrategyRow(strategy))
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

    </div>
  );
}

