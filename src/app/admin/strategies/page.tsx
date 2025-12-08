'use client';

import { useState, useEffect } from 'react';
import { Strategy, Account } from '@/db/schema';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Spinner } from '@/components/ui/spinner';

interface StrategyFormData {
  strategyKey: string;
  brokerAccountId: string;
  underlyingTicker: string;
  openedAt: string;
  status: string;
  label?: string;
  thesis?: string;
  profitRules?: string;
  defenseRules?: string;
  timeRules?: string;
  exitCriteria?: string;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<StrategyFormData>({
    strategyKey: '',
    brokerAccountId: '',
    underlyingTicker: '',
    openedAt: new Date().toISOString().split('T')[0]!,
    status: 'open',
    label: '',
    thesis: '',
    profitRules: '',
    defenseRules: '',
    timeRules: '',
    exitCriteria: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSuggested, setSelectedSuggested] = useState<Set<string>>(new Set());
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ strategyKey: string; label: string } | null>(null);
  const [editingMetadataId, setEditingMetadataId] = useState<string | null>(null);
  const [metadataValues, setMetadataValues] = useState<{
    strategyType: string;
    thesis: string;
    profitRules: string;
    defenseRules: string;
    timeRules: string;
  } | null>(null);
  const [editingStrategyTypeId, setEditingStrategyTypeId] = useState<string | null>(null);
  const [editingStrategyType, setEditingStrategyType] = useState<string>('');
  const [strategyTypes, setStrategyTypes] = useState<string[]>([]);
  const [selectedStrategyType, setSelectedStrategyType] = useState<string>('');
  const [showStrategyTypeModal, setShowStrategyTypeModal] = useState(false);
  const [pendingConfirmIds, setPendingConfirmIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [recomputingStatuses, setRecomputingStatuses] = useState(false);

  useEffect(() => {
    loadData();
    loadStrategyTypes();
  }, []);

  const loadStrategyTypes = async () => {
    try {
      const response = await fetch('/api/strategies?strategyTypes=true');
      if (response.ok) {
        const types = await response.json();
        setStrategyTypes(types);
      }
    } catch (err) {
      console.error('Failed to load strategy types:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [strategiesRes, accountsRes] = await Promise.all([
        fetch('/api/strategies'),
        fetch('/api/accounts'),
      ]);

      if (!strategiesRes.ok || !accountsRes.ok) {
        throw new Error('Failed to load data');
      }

      const [strategiesData, accountsData] = await Promise.all([
        strategiesRes.json(),
        accountsRes.json(),
      ]);

      setStrategies(strategiesData);
      setAccounts(accountsData);
      setEditingId(null);
      setEditValues(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create strategy');
      }

      setSuccess('Strategy created successfully');
      setFormData({
        strategyKey: '',
        brokerAccountId: '',
        underlyingTicker: '',
        openedAt: new Date().toISOString().split('T')[0]!,
        status: 'open',
        label: '',
        thesis: '',
        profitRules: '',
        defenseRules: '',
        timeRules: '',
        exitCriteria: '',
      });
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create strategy');
    } finally {
      setSubmitting(false);
    }
  };

  // Note: Status is now derived from positions (open if has positions on latest snapshot, closed otherwise)
  // Status is read-only and displayed as a badge - no manual editing allowed

  const handleStrategyTypeChange = async (strategyId: string, newStrategyType: string) => {
    try {
      const strategyBefore = strategies.find((s) => s.id === strategyId);
      const strategyTypeChanged = strategyBefore?.strategyType !== newStrategyType;

      const response = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: strategyId,
          strategyType: newStrategyType || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update strategy type');

      // If strategyType changed, trigger state code recomputation
      if (strategyTypeChanged && newStrategyType) {
        setSuccess('Strategy type updated. State code will be recomputed automatically.');
      } else {
        setSuccess('Strategy type updated successfully');
      }

      await loadData();
      setEditingStrategyTypeId(null);
      setEditingStrategyType('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update strategy type');
      setEditingStrategyTypeId(null);
      setEditingStrategyType('');
    }
  };

  const startEditingStrategyType = (strategy: Strategy) => {
    setEditingStrategyTypeId(strategy.id);
    setEditingStrategyType(strategy.strategyType || '');
  };

  const cancelEditingStrategyType = () => {
    setEditingStrategyTypeId(null);
    setEditingStrategyType('');
  };

  const handleConfirm = async (strategyId: string) => {
    // Show strategy type selection modal
    setPendingConfirmIds([strategyId]);
    setShowStrategyTypeModal(true);
  };

  const handleConfirmWithStrategyType = async () => {
    if (!selectedStrategyType) {
      setError('Please select a strategy type');
      return;
    }

    setConfirming(true);
    setError(null);
    setSuccess(null);

    try {
      for (const strategyId of pendingConfirmIds) {
      const response = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: strategyId, confirm: true, strategyType: selectedStrategyType }),
      });

      if (!response.ok) throw new Error('Failed to confirm strategy');
      }

      await loadData();
      setSelectedSuggested((prev) => {
        const next = new Set(prev);
        pendingConfirmIds.forEach((id) => next.delete(id));
        return next;
      });
      setShowStrategyTypeModal(false);
      setSelectedStrategyType('');
      setPendingConfirmIds([]);
      setSuccess(`Confirmed ${pendingConfirmIds.length} strategy(ies)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm strategy');
    } finally {
      setConfirming(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedSuggested.size === 0) return;
    // Show strategy type selection modal
    setPendingConfirmIds(Array.from(selectedSuggested));
    setShowStrategyTypeModal(true);
  };

  const toggleSuggestedSelection = (id: string) => {
    setSelectedSuggested((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleMergeSelection = (id: string) => {
    setMergeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (mergeTargetId === id) {
          setMergeTargetId('');
        }
      } else {
        next.add(id);
        if (!mergeTargetId) {
          setMergeTargetId(id);
        }
      }
      return next;
    });
  };

  const handleMerge = async () => {
    if (mergeSelection.size < 2 || !mergeTargetId) return;
    setMerging(true);
    setError(null);
    setSuccess(null);
    
    try {
      const sourceIds = Array.from(mergeSelection).filter((id) => id !== mergeTargetId);
      const response = await fetch('/api/strategies/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: mergeTargetId, sourceIds }),
      });

      if (!response.ok) throw new Error('Failed to merge strategies');
      await loadData();
      setMergeSelection(new Set());
      setMergeTargetId('');
      setSuccess(`Successfully merged ${sourceIds.length} strategy(ies)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge strategies');
    } finally {
      setMerging(false);
    }
  };

  const handleRecomputeStatuses = async () => {
    setRecomputingStatuses(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/strategies/recompute-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to recompute statuses');
      
      const data = await response.json();
      await loadData();
      setSuccess(`Fixed ${data.updated} strategy status(es)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recompute statuses');
    } finally {
      setRecomputingStatuses(false);
    }
  };

  const startEditing = (strategy: Strategy) => {
    setEditingId(strategy.id);
    setEditValues({
      strategyKey: strategy.strategyKey,
      label: strategy.autoDerivedLabel || strategy.strategyKey,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const saveEditing = async () => {
    if (!editingId || !editValues) return;
    try {
      const response = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          strategyKey: editValues.strategyKey,
          label: editValues.label,
        }),
      });

      if (!response.ok) throw new Error('Failed to update strategy');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update strategy');
    } finally {
      setEditingId(null);
      setEditValues(null);
    }
  };

  const startEditingMetadata = (strategy: Strategy) => {
    setEditingMetadataId(strategy.id);
    setMetadataValues({
      strategyType: strategy.strategyType || '',
      thesis: strategy.thesis || '',
      profitRules: strategy.profitRules || '',
      defenseRules: strategy.defenseRules || '',
      timeRules: strategy.timeRules || '',
    });
  };

  const cancelEditingMetadata = () => {
    setEditingMetadataId(null);
    setMetadataValues(null);
  };

  const saveMetadata = async () => {
    if (!editingMetadataId || !metadataValues) return;
    try {
      const strategyBefore = strategies.find((s) => s.id === editingMetadataId);
      const strategyTypeChanged = strategyBefore?.strategyType !== metadataValues.strategyType;

      const response = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMetadataId,
          strategyType: metadataValues.strategyType || null,
          thesis: metadataValues.thesis || null,
          profitRules: metadataValues.profitRules || null,
          defenseRules: metadataValues.defenseRules || null,
          timeRules: metadataValues.timeRules || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update strategy metadata');

      // If strategyType changed, trigger state code recomputation
      if (strategyTypeChanged && metadataValues.strategyType) {
        // The backend will handle state code recomputation automatically
        setSuccess('Strategy metadata updated. State code will be recomputed automatically.');
      } else {
        setSuccess('Strategy metadata updated successfully');
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update strategy metadata');
    } finally {
      setEditingMetadataId(null);
      setMetadataValues(null);
    }
  };

  const suggestedStrategies = strategies.filter((s) => s.isAuto);
  const confirmedStrategies = strategies
    .filter((s) => !s.isAuto && s.status !== 'merged')
    .sort((a, b) => {
      // Primary sort: status in descending order (open > closed > draft)
      const statusOrder: Record<string, number> = { open: 3, closed: 2, draft: 1 };
      const statusDiff = (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
      if (statusDiff !== 0) return statusDiff;

      // Secondary sort: openedAt in descending order (most recent first)
      const dateA = a.openedAt ? new Date(a.openedAt).getTime() : 0;
      const dateB = b.openedAt ? new Date(b.openedAt).getTime() : 0;
      return dateB - dateA;
    });

  if (loading) {
    return (
      <DashboardShell activeNav="admin-strategies" title="Strategy Management" subtitle="Loading...">
        <p>Loading strategies...</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="admin-strategies"
      title="Strategy Management"
      subtitle="Manage strategies, confirm auto-derived suggestions, and edit metadata"
      actions={
        <div className="flex gap-2">
          <button
            onClick={handleRecomputeStatuses}
            disabled={recomputingStatuses}
            className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            {recomputingStatuses && <Spinner className="size-4" />}
            {recomputingStatuses ? 'Recomputing...' : 'Fix Statuses'}
          </button>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Create Strategy'}
        </button>
        </div>
      }
    >

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-4 text-green-800">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Create New Strategy</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="strategyKey" className="block text-sm font-medium mb-1">
                  Strategy Key *
                </label>
                <input
                  type="text"
                  id="strategyKey"
                  required
                  value={formData.strategyKey}
                  onChange={(e) =>
                    setFormData({ ...formData, strategyKey: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., GLXY_CC_2025Q1"
                />
              </div>

              <div>
                <label htmlFor="brokerAccountId" className="block text-sm font-medium mb-1">
                  Broker Account ID *
                </label>
                <select
                  id="brokerAccountId"
                  required
                  value={formData.brokerAccountId}
                  onChange={(e) =>
                    setFormData({ ...formData, brokerAccountId: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.brokerAccountId}>
                      {acc.brokerAccountId} {acc.label ? `(${acc.label})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="underlyingTicker" className="block text-sm font-medium mb-1">
                  Underlying Ticker *
                </label>
                <input
                  type="text"
                  id="underlyingTicker"
                  required
                  value={formData.underlyingTicker}
                  onChange={(e) =>
                    setFormData({ ...formData, underlyingTicker: e.target.value.toUpperCase() })
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., GLXY"
                />
              </div>

              <div>
                <label htmlFor="openedAt" className="block text-sm font-medium mb-1">
                  Opened At *
                </label>
                <input
                  type="date"
                  id="openedAt"
                  required
                  value={formData.openedAt}
                  onChange={(e) =>
                    setFormData({ ...formData, openedAt: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium mb-1">
                  Status *
                </label>
                <select
                  id="status"
                  required
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="draft">Draft</option>
                  <option value="planned">Planned</option>
                </select>
              </div>

              <div>
                <label htmlFor="label" className="block text-sm font-medium mb-1">
                  Label (Optional)
                </label>
                <input
                  type="text"
                  id="label"
                  value={formData.label}
                  onChange={(e) =>
                    setFormData({ ...formData, label: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., GLXY Covered Call Q1 2025"
                />
              </div>
            </div>

            <div>
              <label htmlFor="thesis" className="block text-sm font-medium mb-1">
                Thesis
              </label>
              <textarea
                id="thesis"
                value={formData.thesis}
                onChange={(e) =>
                  setFormData({ ...formData, thesis: e.target.value })
                }
                className="w-full border rounded px-3 py-2"
                rows={3}
                placeholder="Entry thesis and reasoning..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="profitRules" className="block text-sm font-medium mb-1">
                  Profit Rules
                </label>
                <textarea
                  id="profitRules"
                  value={formData.profitRules}
                  onChange={(e) =>
                    setFormData({ ...formData, profitRules: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                />
              </div>

              <div>
                <label htmlFor="defenseRules" className="block text-sm font-medium mb-1">
                  Defense Rules
                </label>
                <textarea
                  id="defenseRules"
                  value={formData.defenseRules}
                  onChange={(e) =>
                    setFormData({ ...formData, defenseRules: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {submitting ? 'Creating...' : 'Create Strategy'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-10">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Suggested Strategies</h2>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-gray-600">
              Automatically derived from positions/trades. Review, edit, and confirm to lock them in.
            </p>
            <button
              onClick={handleBulkConfirm}
              disabled={selectedSuggested.size === 0}
              className="bg-green-600 text-white py-1 px-3 rounded-md text-sm hover:bg-green-700 disabled:bg-gray-300"
            >
              Confirm Selected ({selectedSuggested.size})
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Automatically derived from positions. Review and confirm to lock them in.
          </p>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        suggestedStrategies.length > 0 &&
                        selectedSuggested.size === suggestedStrategies.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSuggested(new Set(suggestedStrategies.map((s) => s.id)));
                        } else {
                          setSelectedSuggested(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Strategy Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Derived Label
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opened
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {suggestedStrategies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No suggestions yet. Run a recompute to auto-generate strategies.
                    </td>
                  </tr>
                ) : (
                  suggestedStrategies.map((strategy) => (
                    <tr key={strategy.id}>
                      {(() => {
                        const isEditing = editingId === strategy.id;
                        return (
                          <>
                            <td className="px-4 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={selectedSuggested.has(strategy.id)}
                                onChange={() => toggleSuggestedSelection(strategy.id)}
                                disabled={isEditing}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValues?.strategyKey ?? ''}
                                  onChange={(e) =>
                                    setEditValues((prev) =>
                                      prev ? { ...prev, strategyKey: e.target.value } : prev
                                    )
                                  }
                                  className="border rounded px-2 py-1 text-sm w-full"
                                />
                              ) : (
                                strategy.strategyKey
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValues?.label ?? ''}
                                  onChange={(e) =>
                                    setEditValues((prev) =>
                                      prev ? { ...prev, label: e.target.value } : prev
                                    )
                                  }
                                  className="border rounded px-2 py-1 text-sm w-full"
                                />
                              ) : (
                                strategy.autoDerivedLabel || strategy.strategyKey
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {strategy.openedAt
                                ? new Date(strategy.openedAt).toLocaleDateString()
                                : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm flex items-center gap-3">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={saveEditing}
                                    className="text-green-600 hover:text-green-800 text-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditing}
                                    className="text-gray-500 hover:text-gray-700 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditing(strategy)}
                                    className="text-gray-600 hover:text-gray-900 text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleConfirm(strategy.id)}
                                    className="text-green-600 hover:text-green-800 text-xs"
                                  >
                                    Confirm
                                  </button>
                                  <a
                                    href={`/admin/strategies/${strategy.id}/link`}
                                    className="text-blue-600 hover:text-blue-800 text-xs"
                                  >
                                    Review Links
                                  </a>
                                </>
                              )}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Confirmed Strategies</h2>
          {mergeSelection.size >= 2 && (
            <div className="flex items-center gap-3 mb-3 text-sm">
              <div>
                <label className="mr-2 font-medium text-gray-700">Merge target:</label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="border rounded px-2 py-1"
                >
                  <option value="">Select target</option>
                  {Array.from(mergeSelection).map((id) => {
                    const strategy = confirmedStrategies.find((s) => s.id === id);
                    if (!strategy) return null;
                    return (
                      <option key={strategy.id} value={strategy.id}>
                        {strategy.strategyKey}
                      </option>
                    );
                  })}
                </select>
              </div>
              <button
                onClick={handleMerge}
                disabled={!mergeTargetId || merging}
                className="bg-purple-600 text-white px-4 py-1 rounded-md hover:bg-purple-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                {merging && <Spinner className="size-4" />}
                {merging ? 'Merging...' : `Merge ${mergeSelection.size} strategies`}
              </button>
            </div>
          )}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        confirmedStrategies.length > 0 &&
                        mergeSelection.size === confirmedStrategies.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMergeSelection(new Set(confirmedStrategies.map((s) => s.id)));
                          if (!mergeTargetId && confirmedStrategies.length > 0) {
                            setMergeTargetId(confirmedStrategies[0].id);
                          }
                        } else {
                          setMergeSelection(new Set());
                          setMergeTargetId('');
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Strategy Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Label
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opened
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {confirmedStrategies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      No confirmed strategies yet. Confirm auto suggestions or create one manually.
                    </td>
                  </tr>
                ) : (
                  confirmedStrategies.map((strategy) => (
                    <tr key={strategy.id}>
                      {(() => {
                        const isEditing = editingId === strategy.id;
                        const isEditingMetadata = editingMetadataId === strategy.id;
                        return (
                          <>
                            <td className="px-4 py-4 text-center">
                              <input
                                type="checkbox"
                                checked={mergeSelection.has(strategy.id)}
                                onChange={() => toggleMergeSelection(strategy.id)}
                                disabled={isEditing || isEditingMetadata}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValues?.strategyKey ?? ''}
                                  onChange={(e) =>
                                    setEditValues((prev) =>
                                      prev ? { ...prev, strategyKey: e.target.value } : prev
                                    )
                                  }
                                  className="border rounded px-2 py-1 text-sm w-full"
                                />
                              ) : (
                                strategy.strategyKey
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValues?.label ?? ''}
                                  onChange={(e) =>
                                    setEditValues((prev) =>
                                      prev ? { ...prev, label: e.target.value } : prev
                                    )
                                  }
                                  className="border rounded px-2 py-1 text-sm w-full"
                                />
                              ) : (
                                strategy.autoDerivedLabel || strategy.strategyKey
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {isEditingMetadata ? (
                                <select
                                  value={metadataValues?.strategyType ?? ''}
                                  onChange={(e) =>
                                    setMetadataValues((prev) =>
                                      prev ? { ...prev, strategyType: e.target.value } : prev
                                    )
                                  }
                                  className="border rounded px-2 py-1 text-xs w-full"
                                >
                                  <option value="">Select type...</option>
                                  {strategyTypes.map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                              ) : editingStrategyTypeId === strategy.id ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={editingStrategyType}
                                    onChange={(e) => setEditingStrategyType(e.target.value)}
                                    onBlur={() => {
                                      if (editingStrategyType !== (strategy.strategyType || '')) {
                                        handleStrategyTypeChange(strategy.id, editingStrategyType);
                                      } else {
                                        cancelEditingStrategyType();
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (editingStrategyType !== (strategy.strategyType || '')) {
                                          handleStrategyTypeChange(strategy.id, editingStrategyType);
                                        } else {
                                          cancelEditingStrategyType();
                                        }
                                      } else if (e.key === 'Escape') {
                                        cancelEditingStrategyType();
                                      }
                                    }}
                                    autoFocus
                                    className="border rounded px-2 py-1 text-xs w-full"
                                  >
                                    <option value="">Select type...</option>
                                    {strategyTypes.map((type) => (
                                      <option key={type} value={type}>
                                        {type}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => {
                                      if (editingStrategyType !== (strategy.strategyType || '')) {
                                        handleStrategyTypeChange(strategy.id, editingStrategyType);
                                      } else {
                                        cancelEditingStrategyType();
                                      }
                                    }}
                                    className="text-green-600 hover:text-green-800 text-xs"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={cancelEditingStrategyType}
                                    className="text-gray-500 hover:text-gray-700 text-xs"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span
                                  className={`${strategy.strategyType ? 'text-gray-900 cursor-pointer hover:text-blue-600' : 'text-gray-400 cursor-pointer hover:text-blue-600'}`}
                                  onClick={() => startEditingStrategyType(strategy)}
                                  title="Click to edit strategy type"
                                >
                                  {strategy.strategyType || '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                strategy.status === 'open'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : strategy.status === 'closed'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {strategy.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {strategy.openedAt
                                ? new Date(strategy.openedAt).toLocaleDateString()
                                : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm flex items-center gap-3">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={saveEditing}
                                    className="text-green-600 hover:text-green-800 text-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditing}
                                    className="text-gray-500 hover:text-gray-700 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : isEditingMetadata ? (
                                <>
                                  <button
                                    onClick={saveMetadata}
                                    className="text-green-600 hover:text-green-800 text-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditingMetadata}
                                    className="text-gray-500 hover:text-gray-700 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEditing(strategy)}
                                    className="text-gray-600 hover:text-gray-900 text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => startEditingMetadata(strategy)}
                                    className="text-blue-600 hover:text-blue-800 text-xs"
                                  >
                                    Metadata
                                  </button>
                                  <a
                                    href={`/admin/strategies/${strategy.id}/link`}
                                    className="text-blue-600 hover:text-blue-800 text-xs"
                                  >
                                    Links
                                  </a>
                                </>
                              )}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Strategy Type Selection Modal */}
      {showStrategyTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4">Select Strategy Type</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please select the strategy type for the {pendingConfirmIds.length} strategy(ies) you're confirming.
              This links the strategy to its playbook items and state codes.
            </p>
            <div className="mb-4">
              <label htmlFor="strategyType" className="block text-sm font-medium mb-2">
                Strategy Type *
              </label>
              <select
                id="strategyType"
                required
                value={selectedStrategyType}
                onChange={(e) => setSelectedStrategyType(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select a strategy type...</option>
                {strategyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowStrategyTypeModal(false);
                  setSelectedStrategyType('');
                  setPendingConfirmIds([]);
                }}
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWithStrategyType}
                disabled={!selectedStrategyType || confirming}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
              >
                {confirming && <Spinner className="size-4" />}
                {confirming ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Metadata Edit Modal */}
      {editingMetadataId && metadataValues && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 my-8">
            <h2 className="text-xl font-semibold mb-4">Edit Strategy Metadata</h2>
            <p className="text-sm text-gray-600 mb-6">
              Update strategy metadata. Changing the strategy type will trigger state code recomputation.
            </p>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <label htmlFor="metadataStrategyType" className="block text-sm font-medium mb-2">
                  Strategy Type *
                </label>
                <select
                  id="metadataStrategyType"
                  required
                  value={metadataValues.strategyType}
                  onChange={(e) =>
                    setMetadataValues((prev) =>
                      prev ? { ...prev, strategyType: e.target.value } : prev
                    )
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select a strategy type...</option>
                  {strategyTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Links the strategy to playbook items and enables state code computation
                </p>
              </div>

              <div>
                <label htmlFor="metadataThesis" className="block text-sm font-medium mb-2">
                  Thesis
                </label>
                <textarea
                  id="metadataThesis"
                  value={metadataValues.thesis}
                  onChange={(e) =>
                    setMetadataValues((prev) =>
                      prev ? { ...prev, thesis: e.target.value } : prev
                    )
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  placeholder="Entry thesis and reasoning..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="metadataProfitRules" className="block text-sm font-medium mb-2">
                    Profit Rules
                  </label>
                  <textarea
                    id="metadataProfitRules"
                    value={metadataValues.profitRules}
                    onChange={(e) =>
                      setMetadataValues((prev) =>
                        prev ? { ...prev, profitRules: e.target.value } : prev
                      )
                    }
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    placeholder="When to take profits..."
                  />
                </div>

                <div>
                  <label htmlFor="metadataDefenseRules" className="block text-sm font-medium mb-2">
                    Defense Rules
                  </label>
                  <textarea
                    id="metadataDefenseRules"
                    value={metadataValues.defenseRules}
                    onChange={(e) =>
                      setMetadataValues((prev) =>
                        prev ? { ...prev, defenseRules: e.target.value } : prev
                      )
                    }
                    className="w-full border rounded px-3 py-2"
                    rows={3}
                    placeholder="How to defend the position..."
                  />
                </div>
              </div>

              <div>
                <label htmlFor="metadataTimeRules" className="block text-sm font-medium mb-2">
                  Time Rules
                </label>
                <textarea
                  id="metadataTimeRules"
                  value={metadataValues.timeRules}
                  onChange={(e) =>
                    setMetadataValues((prev) =>
                      prev ? { ...prev, timeRules: e.target.value } : prev
                    )
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={2}
                  placeholder="Time-based exit criteria..."
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6 pt-4 border-t">
              <button
                onClick={cancelEditingMetadata}
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={saveMetadata}
                disabled={!metadataValues.strategyType}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                Save Metadata
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

