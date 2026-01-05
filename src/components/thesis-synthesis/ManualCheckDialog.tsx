'use client';

import { useState } from 'react';
import { X, Play, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { MonitoringSpec, ValidationPoint, MonitoringEvent } from '@/db/schema';

interface ManualCheckDialogProps {
  spec: MonitoringSpec;
  validationPoint: ValidationPoint;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: (validationPointId: string) => void;
}

type CheckStage = 'initial' | 'loading' | 'results' | 'assessment';

interface DataSourceResults {
  [source: string]: {
    count: number;
    items: Array<{
      title: string;
      date: string;
      source: string;
      snippet: string;
      link?: string;
      rawData?: any;
    }>;
    error?: string;
  };
}

interface CheckResults {
  checkedAt: string;
  results: DataSourceResults;
  totalResults: number;
  errors: string[];
  events: MonitoringEvent[];
}

export function ManualCheckDialog({
  spec,
  validationPoint,
  isOpen,
  onClose,
  onStatusUpdate,
}: ManualCheckDialogProps) {
  const [stage, setStage] = useState<CheckStage>('initial');
  const [checkResults, setCheckResults] = useState<CheckResults | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const [relevanceScores, setRelevanceScores] = useState<Map<string, number>>(new Map());
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [shouldUpdateStatus, setShouldUpdateStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<string>(validationPoint.status);
  const [statusEvidence, setStatusEvidence] = useState('');
  const [statusConfidence, setStatusConfidence] = useState<'low' | 'medium' | 'high'>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const runCheck = async () => {
    setStage('loading');

    try {
      const response = await fetch(`/api/monitoring/check/${spec.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error('Check failed');
      }

      const data = await response.json();
      setCheckResults(data);

      // Set first tab with results
      const sources = Object.keys(data.results);
      const firstSourceWithResults = sources.find((s) => data.results[s].count > 0);
      setActiveTab(firstSourceWithResults || sources[0] || '');

      setStage('results');
    } catch (error) {
      console.error('Error running check:', error);
      alert('Failed to run monitoring check');
      setStage('initial');
    }
  };

  const setRelevance = (resultKey: string, score: number) => {
    const next = new Map(relevanceScores);
    next.set(resultKey, score);
    setRelevanceScores(next);
  };

  const getAverageRelevance = () => {
    if (relevanceScores.size === 0) return 0;
    const sum = Array.from(relevanceScores.values()).reduce((a, b) => a + b, 0);
    return Math.round(sum / relevanceScores.size);
  };

  const handleSaveAssessment = async (triggerStatus: boolean) => {
    if (!checkResults || checkResults.events.length === 0) return;

    setIsSubmitting(true);

    try {
      // Save assessment for each event
      for (const event of checkResults.events) {
        const body: any = {
          userRelevanceScore: getAverageRelevance() || null,
          userAssessmentNotes: assessmentNotes.trim() || null,
          triggerStatusChange: triggerStatus,
        };

        if (triggerStatus) {
          body.statusUpdate = {
            newStatus,
            evidence: {
              source: 'Monitoring Check',
              summary: statusEvidence.trim(),
            },
            confidence: statusConfidence,
          };
        }

        await fetch(`/api/monitoring/events/${event.id}/assess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (triggerStatus && onStatusUpdate) {
        onStatusUpdate(validationPoint.id);
      }

      onClose();
      // Reset state
      setStage('initial');
      setCheckResults(null);
      setRelevanceScores(new Map());
      setAssessmentNotes('');
      setShouldUpdateStatus(false);
    } catch (error) {
      console.error('Error saving assessment:', error);
      alert('Failed to save assessment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDataSourceLabel = (source: string) => {
    switch (source) {
      case 'fred':
        return 'FRED';
      case 'news':
        return 'News';
      case 'price_iv':
        return 'Price/IV';
      case 'sec_filings':
        return 'SEC Filings';
      default:
        return source;
    }
  };

  const renderStage = () => {
    switch (stage) {
      case 'initial':
        return (
          <div className="p-6 text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="text-slate-700">
                <h3 className="font-semibold mb-2">Monitoring Spec Configuration</h3>
                <div className="text-sm text-left space-y-2 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <span className="font-medium">Keywords:</span>{' '}
                    {(spec.keywords as string[]).join(', ')}
                  </div>
                  <div>
                    <span className="font-medium">Sources:</span>{' '}
                    {(spec.sources as string[]).map((s) => getDataSourceLabel(s)).join(', ')}
                  </div>
                  <div>
                    <span className="font-medium">Frequency:</span> {spec.frequency}
                  </div>
                </div>
              </div>
              <Button onClick={runCheck} size="lg" className="w-full">
                <Play className="w-4 h-4 mr-2" />
                Run Check
              </Button>
            </div>
          </div>
        );

      case 'loading':
        return (
          <div className="p-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-slate-700 font-medium">Running monitoring check...</p>
            <p className="text-sm text-slate-500 mt-2">
              Querying {(spec.sources as string[]).length} data source(s)
            </p>
          </div>
        );

      case 'results':
        if (!checkResults) return null;

        const sources = Object.keys(checkResults.results);
        const currentResults = checkResults.results[activeTab];

        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-slate-200 px-6">
              <div className="flex gap-2">
                {sources.map((source) => {
                  const result = checkResults.results[source];
                  return (
                    <button
                      key={source}
                      onClick={() => setActiveTab(source)}
                      className={`px-4 py-2 border-b-2 transition-colors ${
                        activeTab === source
                          ? 'border-blue-500 text-blue-600 font-medium'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {getDataSourceLabel(source)}{' '}
                      <span className="text-xs">({result.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-6">
              {currentResults.error ? (
                <div className="text-center py-8">
                  <p className="text-red-600">Error: {currentResults.error}</p>
                </div>
              ) : currentResults.count === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500">No results found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentResults.items.map((item, idx) => {
                    const resultKey = `${activeTab}-${idx}`;
                    const relevance = relevanceScores.get(resultKey);

                    return (
                      <div key={idx} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-slate-900">{item.title}</h4>
                            <p className="text-xs text-slate-500 mt-1">
                              {item.source} • {new Date(item.date).toLocaleDateString()}
                            </p>
                          </div>
                          {item.link && (
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 ml-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 mb-3">{item.snippet}</p>

                        {/* Relevance Slider */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Relevance</span>
                            <span className="font-medium">
                              {relevance !== undefined ? `${relevance}/10` : 'Not rated'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={relevance || 0}
                            onChange={(e) => setRelevance(resultKey, parseInt(e.target.value, 10))}
                            className="w-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Assessment Section */}
            <div className="border-t border-slate-200 p-6 bg-slate-50">
              <div className="max-w-3xl mx-auto space-y-4">
                <div>
                  <Label htmlFor="assessment">Overall Assessment</Label>
                  <Textarea
                    id="assessment"
                    value={assessmentNotes}
                    onChange={(e) => setAssessmentNotes(e.target.value)}
                    placeholder="What do these results mean for the validation point?"
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="update-status"
                    checked={shouldUpdateStatus}
                    onChange={(e) => setShouldUpdateStatus(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="update-status" className="text-sm text-slate-700">
                    Update validation point status
                  </label>
                </div>

                {shouldUpdateStatus && (
                  <div className="space-y-3 ml-6 p-4 bg-white rounded-lg border border-slate-200">
                    <div>
                      <Label htmlFor="new-status">New Status</Label>
                      <select
                        id="new-status"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md"
                      >
                        <option value="not_triggered">Not Triggered</option>
                        <option value="monitoring">Monitoring</option>
                        <option value="triggered">Triggered</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="evidence">Evidence Summary *</Label>
                      <Textarea
                        id="evidence"
                        value={statusEvidence}
                        onChange={(e) => setStatusEvidence(e.target.value)}
                        placeholder="Summarize the evidence for this status change"
                        rows={2}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label>Confidence</Label>
                      <div className="flex gap-3 mt-1">
                        {(['low', 'medium', 'high'] as const).map((level) => (
                          <label key={level} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="confidence"
                              value={level}
                              checked={statusConfidence === level}
                              onChange={() => setStatusConfidence(level)}
                            />
                            <span className="text-sm capitalize">{level}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <div className="text-sm text-slate-600">
                    Avg Relevance: <span className="font-medium">{getAverageRelevance()}/10</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleSaveAssessment(false)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : 'Save Assessment'}
                    </Button>
                    {shouldUpdateStatus && (
                      <Button
                        onClick={() => handleSaveAssessment(true)}
                        disabled={isSubmitting || !statusEvidence.trim()}
                      >
                        {isSubmitting ? 'Saving...' : 'Save & Update Status'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Manual Monitoring Check</h2>
            <p className="text-sm text-slate-500 mt-1 truncate">{validationPoint.statement}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors ml-4"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {renderStage()}
      </div>
    </div>
  );
}
