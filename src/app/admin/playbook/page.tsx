'use client';

import { useState, useEffect } from 'react';
import { PlaybookItem } from '@/db/queries/playbook';
import { CriteriaBuilder } from '@/components/playbook/CriteriaBuilder';
import { DashboardShell } from '@/components/layout/DashboardShell';

interface StateCodeFormData {
  code: string;
  label: string;
  description: string;
  category: string;
  criteria: string;
  appliesToContext: string;
  checklistItems: Array<{ order: number; type: string; text: string }>;
  linkedTriageRuleSet: string;
  defaultSeverity: string;
}

interface PlaybookItemFormData {
  strategyType: string;
  stateCodes: StateCodeFormData[];
}

const CATEGORIES = ['entry', 'profit', 'defense', 'time', 'risk', 'meta'] as const;
const SEVERITIES = ['info', 'watch', 'attention', 'urgent'] as const;
const CONTEXTS = ['strategy', 'position', 'portfolio', 'underlying'] as const;
const CHECKLIST_TYPES = ['primary', 'secondary', 'risk'] as const;

export default function PlaybookPage() {
  const [items, setItems] = useState<PlaybookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStrategyType, setFilterStrategyType] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState<PlaybookItemFormData>({
    strategyType: '',
    stateCodes: [],
  });
  const [numStateCodes, setNumStateCodes] = useState<number>(1);

  useEffect(() => {
    loadData();
  }, [filterStrategyType, filterCategory]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStrategyType) params.set('strategyType', filterStrategyType);
      if (filterCategory) params.set('category', filterCategory);

      const response = await fetch(`/api/playbook?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load playbook items');

      const data = await response.json();
      setItems(data.filter((item: PlaybookItem) => item.isActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const getDistinctStrategyTypes = () => {
    const types = new Set(items.map((item) => item.strategyType));
    return Array.from(types).sort();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        // Single item edit mode (for editing existing items)
        const stateCode = formData.stateCodes[0];
        if (!stateCode) throw new Error('No state code data found');

        const payload = {
          code: stateCode.code,
          label: stateCode.label,
          description: stateCode.description || null,
          category: stateCode.category,
          strategyType: formData.strategyType,
          criteria: stateCode.criteria || null,
          appliesToContext: stateCode.appliesToContext,
          checklistItems: stateCode.checklistItems.length > 0 ? stateCode.checklistItems : null,
          linkedTriageRuleSet: stateCode.linkedTriageRuleSet || null,
          defaultSeverity: stateCode.defaultSeverity || null,
        };

        const response = await fetch('/api/playbook', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update playbook item');
        }

        setSuccess('Playbook item updated successfully');
      } else {
        // Bulk create mode - create all state codes for the strategy type
        if (!formData.strategyType) {
          throw new Error('Strategy type is required');
        }
        if (formData.stateCodes.length === 0) {
          throw new Error('At least one state code is required');
        }

        const errors: string[] = [];
        const created: string[] = [];

        for (const stateCode of formData.stateCodes) {
          if (!stateCode.code || !stateCode.label || !stateCode.category) {
            errors.push(`State code ${stateCode.code || 'unnamed'} is missing required fields`);
            continue;
          }

          const payload = {
            code: stateCode.code,
            label: stateCode.label,
            description: stateCode.description || null,
            category: stateCode.category,
            strategyType: formData.strategyType,
            criteria: stateCode.criteria || null,
            appliesToContext: stateCode.appliesToContext || 'strategy',
            checklistItems: stateCode.checklistItems.length > 0 ? stateCode.checklistItems : null,
            linkedTriageRuleSet: stateCode.linkedTriageRuleSet || null,
            defaultSeverity: stateCode.defaultSeverity || null,
          };

          const response = await fetch('/api/playbook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const data = await response.json();
            errors.push(`Failed to create ${stateCode.code}: ${data.error || 'Unknown error'}`);
          } else {
            created.push(stateCode.code);
          }
        }

        if (errors.length > 0) {
          throw new Error(`Some items failed to create:\n${errors.join('\n')}`);
        }

        setSuccess(`Successfully created ${created.length} playbook item(s) for strategy type "${formData.strategyType}"`);
      }

      setShowForm(false);
      setEditingId(null);
      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save playbook item(s)');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (item: PlaybookItem) => {
    setEditingId(item.id);
    setFormData({
      strategyType: item.strategyType,
      stateCodes: [
        {
          code: item.code,
          label: item.label,
          description: item.description || '',
          category: item.category,
          criteria: item.criteria || '',
          appliesToContext: item.appliesToContext || 'strategy',
          checklistItems: item.checklistItems || [],
          linkedTriageRuleSet: item.linkedTriageRuleSet || '',
          defaultSeverity: item.defaultSeverity || '',
        },
      ],
    });
    setNumStateCodes(1);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this playbook item?')) return;

    try {
      const response = await fetch(`/api/playbook?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete playbook item');
      setSuccess('Playbook item deactivated successfully');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete playbook item');
    }
  };

  const resetForm = () => {
    setFormData({
      strategyType: '',
      stateCodes: [],
    });
    setNumStateCodes(1);
  };

  const initializeStateCodes = (count: number) => {
    const newStateCodes: StateCodeFormData[] = [];
    for (let i = 0; i < count; i++) {
      newStateCodes.push({
        code: '',
        label: '',
        description: '',
        category: 'entry',
        criteria: '',
        appliesToContext: 'strategy',
        checklistItems: [],
        linkedTriageRuleSet: '',
        defaultSeverity: '',
      });
    }
    setFormData({ ...formData, stateCodes: newStateCodes });
  };

  const updateStateCode = (index: number, field: keyof StateCodeFormData, value: any) => {
    const updated = [...formData.stateCodes];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, stateCodes: updated });
  };

  const addChecklistItem = (stateCodeIndex: number) => {
    const updated = [...formData.stateCodes];
    const stateCode = updated[stateCodeIndex];
    stateCode.checklistItems = [
      ...stateCode.checklistItems,
      {
        order: stateCode.checklistItems.length + 1,
        type: 'primary',
        text: '',
      },
    ];
    setFormData({ ...formData, stateCodes: updated });
  };

  const updateChecklistItem = (
    stateCodeIndex: number,
    checklistIndex: number,
    field: 'type' | 'text',
    value: string
  ) => {
    const updated = [...formData.stateCodes];
    const checklistItems = [...updated[stateCodeIndex].checklistItems];
    checklistItems[checklistIndex] = { ...checklistItems[checklistIndex], [field]: value };
    updated[stateCodeIndex].checklistItems = checklistItems;
    setFormData({ ...formData, stateCodes: updated });
  };

  const removeChecklistItem = (stateCodeIndex: number, checklistIndex: number) => {
    const updated = [...formData.stateCodes];
    const checklistItems = updated[stateCodeIndex].checklistItems.filter((_, i) => i !== checklistIndex);
    // Reorder
    checklistItems.forEach((item, i) => {
      item.order = i + 1;
    });
    updated[stateCodeIndex].checklistItems = checklistItems;
    setFormData({ ...formData, stateCodes: updated });
  };

  if (loading) {
    return (
      <DashboardShell activeNav="admin-playbook" title="Playbook Management" subtitle="Loading...">
        <p>Loading playbook items...</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeNav="admin-playbook"
      title="Playbook Management"
      subtitle="Manage strategy types, state codes, and playbook items"
      actions={
        <button
          onClick={() => {
            resetForm();
            setEditingId(null);
            setShowForm(true);
          }}
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          + Create Playbook Item
        </button>
      }
    >

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 text-red-800">{error}</div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded p-4 mb-4 text-green-800">{success}</div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="filterStrategyType" className="block text-sm font-medium mb-1">
              Filter by Strategy Type
            </label>
            <select
              id="filterStrategyType"
              value={filterStrategyType}
              onChange={(e) => setFilterStrategyType(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">All strategy types</option>
              {getDistinctStrategyTypes().map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filterCategory" className="block text-sm font-medium mb-1">
              Filter by Category
            </label>
            <select
              id="filterCategory"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Edit Playbook Item' : 'Create New Strategy Type with State Codes'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Strategy Type - shown once at top */}
            <div>
              <label htmlFor="strategyType" className="block text-sm font-medium mb-1">
                Strategy Type *
              </label>
              <input
                type="text"
                id="strategyType"
                required
                value={formData.strategyType}
                onChange={(e) => setFormData({ ...formData, strategyType: e.target.value })}
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., LEAPS long call (potential PMCC base)"
                disabled={editingId !== null}
              />
              {!editingId && (
                <p className="text-xs text-gray-500 mt-1">
                  This strategy type will be created with multiple state codes below
                </p>
              )}
            </div>

            {/* Number of State Codes - only for new items */}
            {!editingId && (
              <div>
                <label htmlFor="numStateCodes" className="block text-sm font-medium mb-1">
                  Number of State Codes *
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    id="numStateCodes"
                    min="1"
                    max="20"
                    required
                    value={numStateCodes}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      setNumStateCodes(count);
                      initializeStateCodes(count);
                    }}
                    className="w-32 border rounded px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      initializeStateCodes(numStateCodes);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Initialize {numStateCodes} state code(s)
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Specify how many state codes this strategy type should have (e.g., 4 for LC1-LC4)
                </p>
              </div>
            )}

            {/* State Codes Sections */}
            {formData.stateCodes.length > 0 && (
              <div className="space-y-8">
                <h3 className="text-lg font-medium text-gray-700">
                  State Codes ({formData.stateCodes.length})
                </h3>
                {formData.stateCodes.map((stateCode, stateCodeIndex) => (
                  <div
                    key={stateCodeIndex}
                    className="border-2 border-gray-200 rounded-lg p-6 bg-gray-50"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-md font-semibold text-gray-800">
                        State Code #{stateCodeIndex + 1}
                      </h4>
                      {!editingId && formData.stateCodes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = formData.stateCodes.filter((_, i) => i !== stateCodeIndex);
                            setFormData({ ...formData, stateCodes: updated });
                            setNumStateCodes(updated.length);
                          }}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor={`code-${stateCodeIndex}`}
                            className="block text-sm font-medium mb-1"
                          >
                            State Code *
                          </label>
                          <input
                            type="text"
                            id={`code-${stateCodeIndex}`}
                            required
                            value={stateCode.code}
                            onChange={(e) =>
                              updateStateCode(stateCodeIndex, 'code', e.target.value.toUpperCase())
                            }
                            className="w-full border rounded px-3 py-2"
                            placeholder="e.g., LC1, RR2, STK0"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`label-${stateCodeIndex}`}
                            className="block text-sm font-medium mb-1"
                          >
                            Label *
                          </label>
                          <input
                            type="text"
                            id={`label-${stateCodeIndex}`}
                            required
                            value={stateCode.label}
                            onChange={(e) => updateStateCode(stateCodeIndex, 'label', e.target.value)}
                            className="w-full border rounded px-3 py-2"
                            placeholder="Short description"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor={`category-${stateCodeIndex}`}
                            className="block text-sm font-medium mb-1"
                          >
                            Category *
                          </label>
                          <select
                            id={`category-${stateCodeIndex}`}
                            required
                            value={stateCode.category}
                            onChange={(e) => updateStateCode(stateCodeIndex, 'category', e.target.value)}
                            className="w-full border rounded px-3 py-2"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor={`appliesToContext-${stateCodeIndex}`}
                            className="block text-sm font-medium mb-1"
                          >
                            Applies To Context
                          </label>
                          <select
                            id={`appliesToContext-${stateCodeIndex}`}
                            value={stateCode.appliesToContext}
                            onChange={(e) =>
                              updateStateCode(stateCodeIndex, 'appliesToContext', e.target.value)
                            }
                            className="w-full border rounded px-3 py-2"
                          >
                            {CONTEXTS.map((ctx) => (
                              <option key={ctx} value={ctx}>
                                {ctx}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor={`description-${stateCodeIndex}`}
                          className="block text-sm font-medium mb-1"
                        >
                          Description
                        </label>
                        <textarea
                          id={`description-${stateCodeIndex}`}
                          value={stateCode.description}
                          onChange={(e) =>
                            updateStateCode(stateCodeIndex, 'description', e.target.value)
                          }
                          className="w-full border rounded px-3 py-2"
                          rows={2}
                          placeholder="Detailed explanation of the rule"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`criteria-${stateCodeIndex}`}
                          className="block text-sm font-medium mb-1"
                        >
                          Criteria
                        </label>
                        <CriteriaBuilder
                          value={stateCode.criteria || ''}
                          onChange={(criteriaText) => updateStateCode(stateCodeIndex, 'criteria', criteriaText)}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Build criteria using patterns, operators, and values. Multiple criteria can be combined with AND/OR.
                        </p>
                      </div>

                      {/* Checklist Items for this state code */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium">Checklist Items</label>
                          <button
                            type="button"
                            onClick={() => addChecklistItem(stateCodeIndex)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            + Add Item
                          </button>
                        </div>
                        <div className="space-y-2">
                          {stateCode.checklistItems.map((item, checklistIndex) => (
                            <div key={checklistIndex} className="flex gap-2 items-start">
                              <select
                                value={item.type}
                                onChange={(e) =>
                                  updateChecklistItem(stateCodeIndex, checklistIndex, 'type', e.target.value)
                                }
                                className="border rounded px-2 py-1 text-sm"
                              >
                                {CHECKLIST_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={item.text}
                                onChange={(e) =>
                                  updateChecklistItem(stateCodeIndex, checklistIndex, 'text', e.target.value)
                                }
                                placeholder="Action text"
                                className="flex-1 border rounded px-3 py-1 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeChecklistItem(stateCodeIndex, checklistIndex)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          {stateCode.checklistItems.length === 0 && (
                            <p className="text-sm text-gray-500">
                              No checklist items. Click "+ Add Item" to add one.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor={`linkedTriageRuleSet-${stateCodeIndex}`}
                            className="block text-sm font-medium mb-1"
                          >
                            Linked Triage Rule Set
                          </label>
                          <input
                            type="text"
                            id={`linkedTriageRuleSet-${stateCodeIndex}`}
                            value={stateCode.linkedTriageRuleSet}
                            onChange={(e) =>
                              updateStateCode(stateCodeIndex, 'linkedTriageRuleSet', e.target.value)
                            }
                            className="w-full border rounded px-3 py-2"
                            placeholder="e.g., options_v1"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`defaultSeverity-${stateCodeIndex}`}
                            className="block text-sm font-medium mb-1"
                          >
                            Default Severity
                          </label>
                          <select
                            id={`defaultSeverity-${stateCodeIndex}`}
                            value={stateCode.defaultSeverity}
                            onChange={(e) =>
                              updateStateCode(stateCodeIndex, 'defaultSeverity', e.target.value)
                            }
                            className="w-full border rounded px-3 py-2"
                          >
                            <option value="">None</option>
                            {SEVERITIES.map((sev) => (
                              <option key={sev} value={sev}>
                                {sev}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <button
                type="submit"
                disabled={submitting || formData.stateCodes.length === 0}
                className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {submitting
                  ? 'Saving...'
                  : editingId
                    ? 'Update'
                    : `Create ${formData.stateCodes.length} Playbook Item(s)`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  resetForm();
                }}
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Items List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Label
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Strategy Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No playbook items found. Create one to get started.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.code}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.label}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.strategyType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-blue-600 hover:text-blue-800 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Deactivate
                    </button>
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

