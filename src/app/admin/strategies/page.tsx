'use client';

import { useState, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Spinner } from '@/components/ui/spinner';

interface StrategyTypeRow {
  id: string;
  name: string;
  description: string | null;
  defaultDirection: string | null;
  category: string | null;
  legCount: number | null;
  minDte: number | null;
  maxDte: number | null;
  riskProfile: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  strategyCount: number;
}

interface StrategyTypeFormData {
  name: string;
  description: string;
  defaultDirection: string;
  category: string;
  legCount: string;
  minDte: string;
  maxDte: string;
  riskProfile: string;
  sortOrder: string;
}

const EMPTY_FORM: StrategyTypeFormData = {
  name: '',
  description: '',
  defaultDirection: '',
  category: '',
  legCount: '',
  minDte: '',
  maxDte: '',
  riskProfile: '',
  sortOrder: '0',
};

const DIRECTIONS = ['bullish', 'bearish', 'neutral'] as const;
const CATEGORIES = ['directional', 'income', 'hedging', 'volatility', 'spread'] as const;

function directionBadge(direction: string | null) {
  if (!direction) return null;
  const colors: Record<string, string> = {
    bullish: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    bearish: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    neutral: 'bg-slate-100 text-slate-800 dark:bg-slate-800/50 dark:text-slate-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[direction] || 'bg-muted text-muted-foreground'}`}>
      {direction}
    </span>
  );
}

function categoryBadge(category: string | null) {
  if (!category) return null;
  const colors: Record<string, string> = {
    directional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    income: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    hedging: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    volatility: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    spread: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[category] || 'bg-muted text-muted-foreground'}`}>
      {category}
    </span>
  );
}

export default function StrategyTypesPage() {
  const [types, setTypes] = useState<StrategyTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<StrategyTypeRow | null>(null);
  const [deletingType, setDeletingType] = useState<StrategyTypeRow | null>(null);
  const [formData, setFormData] = useState<StrategyTypeFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadTypes();
  }, [showArchived]);

  const loadTypes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ withUsage: 'true' });
      if (showArchived) params.set('includeArchived', 'true');
      const response = await fetch(`/api/strategy-types?${params}`);
      if (!response.ok) throw new Error('Failed to load strategy types');
      const data = await response.json();
      setTypes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategy types');
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
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        defaultDirection: formData.defaultDirection || null,
        category: formData.category || null,
        legCount: formData.legCount ? parseInt(formData.legCount) : null,
        minDte: formData.minDte ? parseInt(formData.minDte) : null,
        maxDte: formData.maxDte ? parseInt(formData.maxDte) : null,
        riskProfile: formData.riskProfile.trim() || null,
        sortOrder: parseInt(formData.sortOrder) || 0,
      };

      if (editingType) {
        const response = await fetch(`/api/strategy-types/${editingType.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update strategy type');
        }
        setSuccess(`Strategy type "${formData.name}" updated successfully`);
      } else {
        const response = await fetch('/api/strategy-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create strategy type');
        }
        setSuccess(`Strategy type "${formData.name}" created successfully`);
      }

      resetForm();
      await loadTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save strategy type');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (type: StrategyTypeRow) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || '',
      defaultDirection: type.defaultDirection || '',
      category: type.category || '',
      legCount: type.legCount?.toString() || '',
      minDte: type.minDte?.toString() || '',
      maxDte: type.maxDte?.toString() || '',
      riskProfile: type.riskProfile || '',
      sortOrder: type.sortOrder.toString(),
    });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleToggleActive = async (type: StrategyTypeRow) => {
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/strategy-types/${type.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !type.isActive }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update strategy type');
      }
      setSuccess(`Strategy type "${type.name}" ${type.isActive ? 'archived' : 'restored'}`);
      await loadTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update strategy type');
    }
  };

  const handleDelete = async () => {
    if (!deletingType) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/strategy-types/${deletingType.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete strategy type');
      }
      setSuccess(`Strategy type "${deletingType.name}" deleted`);
      setDeletingType(null);
      await loadTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete strategy type');
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingType(null);
    setShowForm(false);
  };

  if (loading && types.length === 0) {
    return (
      <DashboardShell activeNav="admin-strategies" title="Strategy Types" subtitle="Loading...">
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-6" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="admin-strategies"
      title="Strategy Types"
      subtitle="Manage strategy type definitions and metadata"
      actions={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
          <button
            onClick={() => {
              if (showForm && !editingType) {
                resetForm();
              } else {
                setEditingType(null);
                setFormData(EMPTY_FORM);
                setShowForm(true);
                setError(null);
                setSuccess(null);
              }
            }}
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            {showForm && !editingType ? 'Cancel' : '+ New Strategy Type'}
          </button>
        </div>
      }
    >
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-4 mb-4 text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-4 mb-4 text-green-800 dark:text-green-200">
          {success}
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <div className="bg-card rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingType ? `Edit: ${editingType.name}` : 'Create New Strategy Type'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Name + Category + Direction */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                  placeholder="e.g., Long Call"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                >
                  <option value="">None</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Default Direction</label>
                <select
                  value={formData.defaultDirection}
                  onChange={(e) => setFormData({ ...formData, defaultDirection: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                >
                  <option value="">None</option>
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full border rounded px-3 py-2 bg-background text-foreground"
                rows={2}
                placeholder="Brief description of this strategy type..."
              />
            </div>

            {/* Row 3: Legs + DTE Range + Sort Order */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Leg Count</label>
                <input
                  type="number"
                  min="1"
                  value={formData.legCount}
                  onChange={(e) => setFormData({ ...formData, legCount: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                  placeholder="e.g., 2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Min DTE</label>
                <input
                  type="number"
                  min="0"
                  value={formData.minDte}
                  onChange={(e) => setFormData({ ...formData, minDte: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                  placeholder="e.g., 7"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max DTE</label>
                <input
                  type="number"
                  min="0"
                  value={formData.maxDte}
                  onChange={(e) => setFormData({ ...formData, maxDte: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                  placeholder="e.g., 90"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sort Order</label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                  className="w-full border rounded px-3 py-2 bg-background text-foreground"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Row 4: Risk Profile */}
            <div>
              <label className="block text-sm font-medium mb-1">Risk Profile</label>
              <textarea
                value={formData.riskProfile}
                onChange={(e) => setFormData({ ...formData, riskProfile: e.target.value })}
                className="w-full border rounded px-3 py-2 bg-background text-foreground"
                rows={2}
                placeholder="Notes on risk characteristics..."
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-muted disabled:text-muted-foreground inline-flex items-center gap-2"
              >
                {submitting && <Spinner className="size-4" />}
                {submitting
                  ? editingType ? 'Updating...' : 'Creating...'
                  : editingType ? 'Update Strategy Type' : 'Create Strategy Type'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-muted text-foreground py-2 px-4 rounded-md hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Strategy Type</h3>
            <p className="text-foreground mb-4">
              Are you sure you want to delete{' '}
              <span className="font-medium">{deletingType.name}</span>?
            </p>
            {deletingType.strategyCount > 0 && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                This type is used by {deletingType.strategyCount} strategy(ies). You must archive it instead, or reassign those strategies first.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeletingType(null)}
                disabled={deleting}
                className="bg-muted text-foreground py-2 px-4 rounded-md hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || deletingType.strategyCount > 0}
                className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-muted disabled:text-muted-foreground inline-flex items-center gap-2"
              >
                {deleting && <Spinner className="size-4" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Types Table */}
      <div className="bg-card rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Direction
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Legs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  DTE Range
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Risk Profile
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Strategies
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {types.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    No strategy types found. Create your first one above.
                  </td>
                </tr>
              ) : (
                types.map((type) => (
                  <tr key={type.id} className={!type.isActive ? 'opacity-50' : undefined}>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{type.name}</div>
                        {type.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {type.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {categoryBadge(type.category) || <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {directionBadge(type.defaultDirection) || <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {type.legCount ?? '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {type.minDte != null || type.maxDte != null
                        ? `${type.minDte ?? '?'}–${type.maxDte ?? '?'}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px]">
                      <div className="line-clamp-1">{type.riskProfile || '-'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`text-sm font-medium ${type.strategyCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {type.strategyCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        type.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400'
                      }`}>
                        {type.isActive ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEdit(type)}
                          className="text-blue-600 hover:text-blue-400 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(type)}
                          className="text-amber-600 hover:text-amber-400 font-medium"
                        >
                          {type.isActive ? 'Archive' : 'Restore'}
                        </button>
                        <button
                          onClick={() => setDeletingType(type)}
                          className="text-red-600 hover:text-red-400 font-medium"
                          disabled={type.strategyCount > 0}
                          title={type.strategyCount > 0 ? `Cannot delete: used by ${type.strategyCount} strategies` : 'Delete'}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
