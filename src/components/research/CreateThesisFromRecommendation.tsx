'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ResearchHierarchyRecommendation } from '@/db/schema';

interface CreateThesisFromRecommendationProps {
  recommendation: ResearchHierarchyRecommendation;
  onSave: (data: {
    title: string;
    description: string | null;
    thesisType: string;
    timeHorizon: string | null;
    confidenceLevel: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}

export function CreateThesisFromRecommendation({
  recommendation,
  onSave,
  onCancel,
}: CreateThesisFromRecommendationProps) {
  const proposedData = recommendation.proposedData as any;

  const [formData, setFormData] = useState({
    title: proposedData?.title || '',
    description: proposedData?.description || '',
    thesisType: proposedData?.thesisType || 'secular',
    timeHorizon: proposedData?.timeHorizon || '',
    confidenceLevel: proposedData?.confidenceLevel || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        thesisType: formData.thesisType,
        timeHorizon: formData.timeHorizon || null,
        confidenceLevel: formData.confidenceLevel || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create thesis');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
      <h3 className="text-lg font-semibold">Create Macro Thesis from Recommendation</h3>
      <p className="text-sm text-slate-600">{recommendation.reasoning}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="title">Title *</Label>
          <input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Describe the macro thesis..."
          />
        </div>

        <div>
          <Label htmlFor="thesisType">Thesis Type *</Label>
          <select
            id="thesisType"
            value={formData.thesisType}
            onChange={(e) => setFormData({ ...formData, thesisType: e.target.value })}
            required
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="secular">Secular</option>
            <option value="cyclical">Cyclical</option>
            <option value="structural">Structural</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="timeHorizon">Time Horizon</Label>
            <select
              id="timeHorizon"
              value={formData.timeHorizon}
              onChange={(e) => setFormData({ ...formData, timeHorizon: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Not specified</option>
              <option value="long_term">Long Term (&gt;3 years)</option>
              <option value="medium_term">Medium Term (1-3 years)</option>
              <option value="short_term">Short Term (&lt;1 year)</option>
            </select>
          </div>

          <div>
            <Label htmlFor="confidenceLevel">Confidence Level</Label>
            <select
              id="confidenceLevel"
              value={formData.confidenceLevel}
              onChange={(e) => setFormData({ ...formData, confidenceLevel: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Not specified</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="exploratory">Exploratory</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !formData.title.trim()}>
            {saving ? 'Creating...' : 'Create Thesis'}
          </Button>
        </div>
      </form>
    </div>
  );
}

