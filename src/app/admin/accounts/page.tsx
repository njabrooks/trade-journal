'use client';

import { useState, useEffect } from 'react';
import { Account } from '@/db/schema';
import { DashboardShell } from '@/components/layout/DashboardShell';

interface AccountFormData {
  brokerAccountId: string;
  brokerName: string;
  baseCurrency: string;
  label: string;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState<AccountFormData>({
    brokerAccountId: '',
    brokerName: 'IBKR',
    baseCurrency: 'USD',
    label: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to load accounts');
      const data = await response.json();
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
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
      if (editingAccount) {
        // Update existing account
        const response = await fetch(`/api/accounts/${editingAccount.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brokerName: formData.brokerName,
            baseCurrency: formData.baseCurrency,
            label: formData.label,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update account');
        }

        setSuccess('Account updated successfully');
      } else {
        // Create new account
        const response = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create account');
        }

        setSuccess('Account created successfully');
      }

      resetForm();
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      brokerAccountId: account.brokerAccountId,
      brokerName: account.brokerName,
      baseCurrency: account.baseCurrency || 'USD',
      label: account.label || '',
    });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleDelete = async () => {
    if (!deletingAccount) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/accounts/${deletingAccount.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      const result = await response.json();
      if (result.deletedLinkedData) {
        setSuccess(
          `Account deleted successfully. Also deleted ${result.counts.strategies} strategies, ${result.counts.trades} trades, and ${result.counts.positions} positions.`
        );
      } else {
        setSuccess('Account deleted successfully');
      }

      setDeletingAccount(null);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      brokerAccountId: '',
      brokerName: 'IBKR',
      baseCurrency: 'USD',
      label: '',
    });
    setEditingAccount(null);
    setShowForm(false);
  };

  const handleCancel = () => {
    resetForm();
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return (
      <DashboardShell activeNav="admin-accounts" title="Account Management" subtitle="Loading...">
        <p>Loading accounts...</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="admin-accounts"
      title="Account Management"
      subtitle="Manage broker accounts"
      actions={
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Add Account'}
        </button>
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
          <h2 className="text-xl font-semibold mb-4">
            {editingAccount ? 'Edit Account' : 'Create New Account'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="brokerAccountId" className="block text-sm font-medium mb-1">
                Broker Account ID *
              </label>
              <input
                type="text"
                id="brokerAccountId"
                required
                disabled={!!editingAccount}
                value={formData.brokerAccountId}
                onChange={(e) =>
                  setFormData({ ...formData, brokerAccountId: e.target.value })
                }
                className="w-full border rounded px-3 py-2 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="e.g., U1234567"
              />
              {editingAccount && (
                <p className="text-xs text-gray-500 mt-1">
                  Broker Account ID cannot be changed
                </p>
              )}
            </div>

            <div>
              <label htmlFor="brokerName" className="block text-sm font-medium mb-1">
                Broker Name *
              </label>
              <input
                type="text"
                id="brokerName"
                required
                value={formData.brokerName}
                onChange={(e) =>
                  setFormData({ ...formData, brokerName: e.target.value })
                }
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., IBKR"
              />
            </div>

            <div>
              <label htmlFor="baseCurrency" className="block text-sm font-medium mb-1">
                Base Currency *
              </label>
              <input
                type="text"
                id="baseCurrency"
                required
                value={formData.baseCurrency}
                onChange={(e) =>
                  setFormData({ ...formData, baseCurrency: e.target.value.toUpperCase() })
                }
                className="w-full border rounded px-3 py-2"
                placeholder="USD"
                maxLength={3}
              />
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
                placeholder="e.g., Main Account"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {submitting
                  ? editingAccount
                    ? 'Updating...'
                    : 'Creating...'
                  : editingAccount
                    ? 'Update Account'
                    : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Account</h3>
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete account{' '}
              <span className="font-medium">{deletingAccount.brokerAccountId}</span>?
            </p>
            <p className="text-sm text-red-600 mb-4">
              This will permanently delete the account and all associated data (trades,
              positions, strategies, etc.). This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeletingAccount(null)}
                disabled={deleting}
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 disabled:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:bg-gray-400"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Broker Account ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Broker Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Base Currency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Label
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No accounts found. Create your first account above.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {account.brokerAccountId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.brokerName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.baseCurrency || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.label || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.createdAt
                      ? new Date(account.createdAt).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(account)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingAccount(account)}
                        className="text-red-600 hover:text-red-800 font-medium"
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
    </DashboardShell>
  );
}

