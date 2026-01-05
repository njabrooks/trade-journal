'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ValidationPoint, MonitoringSpec } from '@/db/schema';

interface MonitoringSpecFormProps {
  validationPoint: ValidationPoint;
  existingSpec?: MonitoringSpec | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (spec: NewMonitoringSpec) => Promise<void>;
}

interface NewMonitoringSpec {
  validationPointId: string;
  keywords: string[];
  semanticDescription?: string;
  sources: string[];
  exclusions?: string[];
  frequency: 'daily' | 'weekly' | 'on_demand';
  alertThreshold: {
    type: 'any_new_data' | 'score_threshold' | 'manual_only';
    scoreThreshold?: number;
  };
  enabled?: boolean;
}

export function MonitoringSpecForm({
  validationPoint,
  existingSpec,
  isOpen,
  onClose,
  onSubmit,
}: MonitoringSpecFormProps) {
  const [keywords, setKeywords] = useState<string[]>(
    existingSpec ? (existingSpec.keywords as string[]) : []
  );
  const [keywordInput, setKeywordInput] = useState('');
  const [semanticDescription, setSemanticDescription] = useState(
    existingSpec?.semanticDescription || ''
  );
  const [exclusions, setExclusions] = useState<string[]>(
    existingSpec ? (existingSpec.exclusions as string[]) : []
  );
  const [exclusionInput, setExclusionInput] = useState('');
  const [sources, setSources] = useState<string[]>(
    existingSpec ? (existingSpec.sources as string[]) : ['fred', 'news', 'price_iv', 'sec_filings']
  );
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'on_demand'>(
    (existingSpec?.frequency as 'daily' | 'weekly' | 'on_demand') || 'weekly'
  );
  const [alertType, setAlertType] = useState<'any_new_data' | 'score_threshold' | 'manual_only'>(
    existingSpec ? (existingSpec.alertThreshold as any).type : 'manual_only'
  );
  const [scoreThreshold, setScoreThreshold] = useState(
    existingSpec ? (existingSpec.alertThreshold as any).scoreThreshold || 7 : 7
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const addKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      setKeywords([...keywords, keywordInput.trim()]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const addExclusion = () => {
    if (exclusionInput.trim() && !exclusions.includes(exclusionInput.trim())) {
      setExclusions([...exclusions, exclusionInput.trim()]);
      setExclusionInput('');
    }
  };

  const removeExclusion = (exclusion: string) => {
    setExclusions(exclusions.filter((e) => e !== exclusion));
  };

  const toggleSource = (source: string) => {
    if (sources.includes(source)) {
      setSources(sources.filter((s) => s !== source));
    } else {
      setSources([...sources, source]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (keywords.length === 0) {
      alert('At least one keyword is required');
      return;
    }

    if (sources.length === 0) {
      alert('At least one data source is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        validationPointId: validationPoint.id,
        keywords,
        semanticDescription: semanticDescription.trim() || undefined,
        sources,
        exclusions: exclusions.length > 0 ? exclusions : undefined,
        frequency,
        alertThreshold: {
          type: alertType,
          scoreThreshold: alertType === 'score_threshold' ? scoreThreshold : undefined,
        },
        enabled: true,
      });
      onClose();
    } catch (error) {
      console.error('Error submitting monitoring spec:', error);
      alert('Failed to save monitoring spec');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {existingSpec ? 'Edit Monitoring Spec' : 'Create Monitoring Spec'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {validationPoint.statement}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4">
          {/* Keywords */}
          <div className="space-y-2 mb-6">
            <Label htmlFor="keywords">Keywords *</Label>
            <p className="text-xs text-slate-500">
              For FRED, use series IDs (e.g., UNRATE, ICSA). For news/filings, use search terms.
            </p>
            <div className="flex gap-2">
              <Input
                id="keywords"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder="Type keyword and press Enter"
              />
              <Button type="button" onClick={addKeyword} variant="outline" size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="pr-1">
                    {keyword}
                    <button
                      type="button"
                      onClick={() => removeKeyword(keyword)}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Semantic Description */}
          <div className="space-y-2 mb-6">
            <Label htmlFor="description">Semantic Description</Label>
            <p className="text-xs text-slate-500">
              Describe what you're monitoring for (used for future automated relevance scoring).
            </p>
            <Textarea
              id="description"
              value={semanticDescription}
              onChange={(e) => setSemanticDescription(e.target.value)}
              placeholder="e.g., Monitor for deteriorating labor market conditions"
              rows={3}
            />
          </div>

          {/* Data Sources */}
          <div className="space-y-2 mb-6">
            <Label>Data Sources *</Label>
            <p className="text-xs text-slate-500">Select which sources to query</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'fred', label: 'FRED Macro Indicators', icon: '📊' },
                { id: 'news', label: 'News (Finnhub)', icon: '📰' },
                { id: 'price_iv', label: 'Price/IV Data', icon: '📈' },
                { id: 'sec_filings', label: 'SEC Filings (EDGAR)', icon: '📄' },
              ].map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleSource(id)}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors text-left ${
                    sources.includes(id)
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{icon}</span>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Exclusions (Optional) */}
          <div className="space-y-2 mb-6">
            <Label htmlFor="exclusions">Exclusions (Optional)</Label>
            <p className="text-xs text-slate-500">
              Terms to filter out from results (e.g., "price prediction", "trading signals")
            </p>
            <div className="flex gap-2">
              <Input
                id="exclusions"
                value={exclusionInput}
                onChange={(e) => setExclusionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addExclusion();
                  }
                }}
                placeholder="Type exclusion term and press Enter"
              />
              <Button type="button" onClick={addExclusion} variant="outline" size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {exclusions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {exclusions.map((exclusion) => (
                  <Badge key={exclusion} variant="outline" className="pr-1">
                    {exclusion}
                    <button
                      type="button"
                      onClick={() => removeExclusion(exclusion)}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Frequency */}
          <div className="space-y-2 mb-6">
            <Label>Check Frequency *</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'daily', label: 'Daily', desc: 'Check every day' },
                { value: 'weekly', label: 'Weekly', desc: 'Check every week' },
                { value: 'on_demand', label: 'On Demand', desc: 'Manual only' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFrequency(value as any)}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                    frequency === value
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-slate-500 mt-1">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Alert Threshold */}
          <div className="space-y-2 mb-6">
            <Label>Alert Configuration *</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="alert-manual"
                  name="alert-type"
                  checked={alertType === 'manual_only'}
                  onChange={() => setAlertType('manual_only')}
                  className="w-4 h-4"
                />
                <label htmlFor="alert-manual" className="text-sm text-slate-700">
                  Manual review only (no automatic alerts)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="alert-any"
                  name="alert-type"
                  checked={alertType === 'any_new_data'}
                  onChange={() => setAlertType('any_new_data')}
                  className="w-4 h-4"
                />
                <label htmlFor="alert-any" className="text-sm text-slate-700">
                  Alert on any new data
                </label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="alert-score"
                    name="alert-type"
                    checked={alertType === 'score_threshold'}
                    onChange={() => setAlertType('score_threshold')}
                    className="w-4 h-4"
                  />
                  <label htmlFor="alert-score" className="text-sm text-slate-700">
                    Alert when relevance score exceeds threshold
                  </label>
                </div>
                {alertType === 'score_threshold' && (
                  <div className="ml-6 space-y-2">
                    <Label htmlFor="threshold">Threshold: {scoreThreshold}/10</Label>
                    <input
                      type="range"
                      id="threshold"
                      min="1"
                      max="10"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : existingSpec ? 'Update Spec' : 'Create Spec'}
          </Button>
        </div>
      </div>
    </div>
  );
}
