'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface CreateMacroThesisFormData {
  title?: string;
  description?: string;
  thesisType: 'secular' | 'cyclical' | 'structural';
  direction: 'bullish' | 'bearish' | 'neutral';
  timeHorizon: 'long_term' | 'medium_term' | 'short_term';
  confidenceLevel: 'high' | 'medium' | 'low' | 'exploratory';
  status: 'active' | 'under_review' | 'retired';
  sectors: string[];
}

interface CreateMacroThesisFormProps {
  onSubmit: (data: CreateMacroThesisFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<CreateMacroThesisFormData>;
  autoGenTitle?: boolean;
}

export function CreateMacroThesisForm({
  onSubmit,
  onCancel,
  initialData = {},
  autoGenTitle = true,
}: CreateMacroThesisFormProps) {
  const [formData, setFormData] = useState<CreateMacroThesisFormData>({
    thesisType: initialData.thesisType || 'cyclical',
    direction: initialData.direction || 'bullish',
    timeHorizon: initialData.timeHorizon || 'medium_term',
    confidenceLevel: initialData.confidenceLevel || 'medium',
    status: initialData.status || 'active',
    sectors: initialData.sectors || [],
    title: initialData.title,
    description: initialData.description,
  });

  const [sectorInput, setSectorInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddSector = () => {
    if (sectorInput.trim() && !formData.sectors.includes(sectorInput.trim())) {
      setFormData({
        ...formData,
        sectors: [...formData.sectors, sectorInput.trim()],
      });
      setSectorInput('');
    }
  };

  const handleRemoveSector = (sector: string) => {
    setFormData({
      ...formData,
      sectors: formData.sectors.filter((s) => s !== sector),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!autoGenTitle && !formData.title?.trim()) {
      setError('Title is required');
      return;
    }

    if (formData.sectors.length === 0) {
      setError('At least one sector is required');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create macro thesis');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Title (optional if auto-generated) */}
      {!autoGenTitle && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Bullish Tech Sector Long Term"
            required={!autoGenTitle}
            disabled={loading}
          />
        </div>
      )}

      {autoGenTitle && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <strong>Note:</strong> Title will be auto-generated as: {formData.direction} {formData.sectors[0] || '[Sector]'} {formData.timeHorizon.replace('_', ' ')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Thesis Type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Thesis Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.thesisType}
            onChange={(e) => setFormData({ ...formData, thesisType: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="secular">Secular</option>
            <option value="cyclical">Cyclical</option>
            <option value="structural">Structural</option>
          </select>
        </div>

        {/* Direction */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Direction <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.direction}
            onChange={(e) => setFormData({ ...formData, direction: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>

        {/* Time Horizon */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Time Horizon <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.timeHorizon}
            onChange={(e) => setFormData({ ...formData, timeHorizon: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="long_term">Long Term</option>
            <option value="medium_term">Medium Term</option>
            <option value="short_term">Short Term</option>
          </select>
        </div>

        {/* Confidence Level */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Confidence <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.confidenceLevel}
            onChange={(e) => setFormData({ ...formData, confidenceLevel: e.target.value as any })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={loading}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="exploratory">Exploratory</option>
          </select>
        </div>
      </div>

      {/* Sectors */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Sectors <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={sectorInput}
            onChange={(e) => setSectorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSector();
              }
            }}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type sector and press Enter"
            disabled={loading}
          />
          <Button
            type="button"
            onClick={handleAddSector}
            disabled={!sectorInput.trim() || loading}
            size="sm"
          >
            Add
          </Button>
        </div>
        {formData.sectors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {formData.sectors.map((sector) => (
              <span
                key={sector}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
              >
                {sector}
                <button
                  type="button"
                  onClick={() => handleRemoveSector(sector)}
                  className="hover:text-blue-900"
                  disabled={loading}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Description (optional)
        </label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Brief description of the thesis..."
          disabled={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            'Create & Link'
          )}
        </Button>
      </div>
    </form>
  );
}

