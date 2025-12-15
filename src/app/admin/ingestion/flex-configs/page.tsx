'use client';

import { useState, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { IngestionTabs } from '@/components/layout/IngestionTabs';

interface FlexQueryConfig {
  id: string;
  accountId: string | null;
  queryName: string;
  queryType: 'positions' | 'trades';
  isActive: boolean;
  scheduleCron: string | null;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | null;
  lastRunError: string | null;
}

interface Account {
  id: string;
  label: string | null;
  brokerAccountId: string;
}

export default function FlexConfigsPage() {
  const [configs, setConfigs] = useState<FlexQueryConfig[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<FlexQueryConfig | null>(null);
  const [running, setRunning] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    accountId: '',
    queryName: '',
    queryType: 'positions' as 'positions' | 'trades',
    flexToken: '',
    queryId: '',
    isActive: true,
    scheduleCron: '',
  });

  useEffect(() => {
    loadConfigs();
    loadAccounts();
  }, []);

  const loadConfigs = async () => {
    try {
      const response = await fetch('/api/ingest/flex/automated');
      const data = await response.json();
      setConfigs(data.configs || []);
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const response = await fetch('/api/accounts');
      const data = await response.json();
      // API returns array directly or wrapped in accounts property
      setAccounts(Array.isArray(data) ? data : (data.accounts || []));
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingConfig
        ? `/api/admin/flex-configs/${editingConfig.id}`
        : '/api/admin/flex-configs';
      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          scheduleCron: formData.scheduleCron || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to save config'}`);
        return;
      }

      await loadConfigs();
      resetForm();
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save config');
    }
  };

  const handleEdit = (config: FlexQueryConfig) => {
    setEditingConfig(config);
    setFormData({
      accountId: config.accountId || '',
      queryName: config.queryName,
      queryType: config.queryType,
      flexToken: '', // Don't show existing token for security
      queryId: '', // Don't show existing query ID
      isActive: config.isActive,
      scheduleCron: config.scheduleCron || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;

    try {
      const response = await fetch(`/api/admin/flex-configs/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to delete config'}`);
        return;
      }

      await loadConfigs();
    } catch (error) {
      console.error('Failed to delete config:', error);
      alert('Failed to delete config');
    }
  };

  const handleRun = async (configId: string) => {
    setRunning((prev) => new Set(prev).add(configId));

    try {
      const response = await fetch(`/api/ingest/flex/automated?configId=${configId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        alert('Ingestion completed successfully!');
        await loadConfigs();
      } else {
        alert(`Ingestion failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to run ingestion:', error);
      alert('Failed to run ingestion');
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(configId);
        return next;
      });
    }
  };

  const handleRunAll = async () => {
    if (!confirm('Run ingestion for all active configurations?')) return;

    setRunning(new Set(['all']));

    try {
      const response = await fetch('/api/ingest/flex/automated?all=true', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        alert(`Ingestion completed: ${data.summary.success} succeeded, ${data.summary.failures} failed`);
        await loadConfigs();
      } else {
        alert(`Ingestion failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to run ingestion:', error);
      alert('Failed to run ingestion');
    } finally {
      setRunning(new Set());
    }
  };

  const resetForm = () => {
    setFormData({
      accountId: '',
      queryName: '',
      queryType: 'positions',
      flexToken: '',
      queryId: '',
      isActive: true,
      scheduleCron: '',
    });
    setEditingConfig(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <DashboardShell activeNav="admin-ingestion">
        <IngestionTabs activeTab="flex-configs" />
        <div className="p-6">Loading...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell activeNav="admin-ingestion">
      <IngestionTabs activeTab="flex-configs" />
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Flex Query Configurations</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage automated Flex ingestion from IBKR Flex Web Service API
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRunAll}
              disabled={running.has('all')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {running.has('all') ? 'Running...' : 'Run All Active'}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Configuration
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <h2 className="text-lg font-semibold mb-4">
              {editingConfig ? 'Edit Configuration' : 'New Configuration'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Account</label>
                <select
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  required
                >
                  <option value="">Select account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label || acc.brokerAccountId}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Query Name</label>
                <input
                  type="text"
                  value={formData.queryName}
                  onChange={(e) => setFormData({ ...formData, queryName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., Daily Positions"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Query Type</label>
                <select
                  value={formData.queryType}
                  onChange={(e) =>
                    setFormData({ ...formData, queryType: e.target.value as 'positions' | 'trades' })
                  }
                  className="w-full px-3 py-2 border rounded"
                  required
                >
                  <option value="positions">Positions (POST/EQUT/MTMP)</option>
                  <option value="trades">Trades (TRNT)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  FLEX Token {editingConfig && '(leave blank to keep existing)'}
                </label>
                <input
                  type="password"
                  value={formData.flexToken}
                  onChange={(e) => setFormData({ ...formData, flexToken: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Your IBKR Flex Web Service token (or use IBKR_FLEX_TOKEN env var)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional if IBKR_FLEX_TOKEN environment variable is set
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Query ID {editingConfig && '(leave blank to keep existing)'}
                </label>
                <input
                  type="text"
                  value={formData.queryId}
                  onChange={(e) => setFormData({ ...formData, queryId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder={`Your Flex query ID (or use IBKR_FLEX_${formData.queryType.toUpperCase()}_QUERY_ID env var)`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional if IBKR_FLEX_POSITIONS_QUERY_ID or IBKR_FLEX_TRADES_QUERY_ID environment variable is set
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Schedule Cron (optional)</label>
                <input
                  type="text"
                  value={formData.scheduleCron}
                  onChange={(e) => setFormData({ ...formData, scheduleCron: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., 0 2 * * * (daily at 2 AM)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cron expression for scheduled runs. Leave empty for manual-only.
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingConfig ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {configs.length === 0 ? (
            <div className="p-4 border rounded-lg text-center text-gray-500">
              No configurations found. Click "Add Configuration" to create one.
            </div>
          ) : (
            configs.map((config) => (
              <div key={config.id} className="p-4 border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{config.queryName}</h3>
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          config.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {config.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">
                        {config.queryType}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>
                        Account: {accounts.find((a) => a.id === config.accountId)?.label || config.accountId}
                      </div>
                      {config.scheduleCron && (
                        <div>Schedule: {config.scheduleCron}</div>
                      )}
                      {config.lastRunAt && (
                        <div>
                          Last run: {new Date(config.lastRunAt).toLocaleString()}{' '}
                          {config.lastRunStatus && (
                            <span
                              className={
                                config.lastRunStatus === 'success'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }
                            >
                              ({config.lastRunStatus})
                            </span>
                          )}
                        </div>
                      )}
                      {config.lastRunError && (
                        <div className="text-red-600 text-xs mt-1">
                          Error: {config.lastRunError}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRun(config.id)}
                      disabled={running.has(config.id)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {running.has(config.id) ? 'Running...' : 'Run Now'}
                    </button>
                    <button
                      onClick={() => handleEdit(config)}
                      className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

