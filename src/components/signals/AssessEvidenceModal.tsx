'use client';

import { useState } from 'react';
import { X, Link2, FileText, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface SignalAssessment {
  signalId: string;
  statement: string;
  type: 'confirmation' | 'warning';
  importance: string;
  currentStatus: string;
  assessment: 'strong_confirmation' | 'weak_confirmation' | 'neutral' | 'weak_warning' | 'strong_warning';
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  quotes: string[];
  recommendedAction: string;
}

interface AssessEvidenceModalProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type ModalPhase = 'input' | 'analyzing' | 'results';

export function AssessEvidenceModal({
  thesisId,
  thesisType,
  thesisTitle,
  isOpen,
  onClose,
  onComplete,
}: AssessEvidenceModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('input');
  const [inputMode, setInputMode] = useState<'url' | 'text'>('text');
  const [contentUrl, setContentUrl] = useState('');
  const [contentText, setContentText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [assessments, setAssessments] = useState<SignalAssessment[]>([]);
  const [overallSummary, setOverallSummary] = useState('');
  const [summary, setSummary] = useState<{
    totalSignals: number;
    withEvidence: number;
    confirmationEvidence: number;
    warningEvidence: number;
  } | null>(null);
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number; model: string } | null>(null);

  // Expanded state for assessment cards
  const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

  // Selection state for applying changes
  const [selectedAssessments, setSelectedAssessments] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    setError(null);

    const content = inputMode === 'url' ? '' : contentText.trim();
    const url = inputMode === 'url' ? contentUrl.trim() : undefined;

    if (inputMode === 'text' && content.length < 100) {
      setError('Please provide at least 100 characters of text to analyze.');
      return;
    }

    if (inputMode === 'url' && !url) {
      setError('Please enter a URL.');
      return;
    }

    setPhase('analyzing');

    try {
      // If URL mode, fetch content first
      let analysisContent = content;
      if (inputMode === 'url') {
        const fetchRes = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!fetchRes.ok) {
          const fetchError = await fetchRes.json();
          throw new Error(fetchError.error || 'Failed to fetch URL content');
        }

        const fetchData = await fetchRes.json();
        analysisContent = fetchData.content;
      }

      // Call the assess-validation-evidence API
      const res = await fetch('/api/skills/assess-validation-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thesisId,
          thesisType,
          content: analysisContent,
          contentUrl: url,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze content');
      }

      setAssessments(data.assessments || []);
      setOverallSummary(data.overallSummary || '');
      setSummary(data.summary || null);
      setUsage(data.usage || null);

      // Auto-select assessments with evidence (non-neutral)
      const withEvidence = (data.assessments || [])
        .filter((a: SignalAssessment) => a.assessment !== 'neutral')
        .map((a: SignalAssessment) => a.signalId);
      setSelectedAssessments(new Set(withEvidence));

      // Auto-expand assessments with evidence
      setExpandedAssessments(new Set(withEvidence));

      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPhase('input');
    }
  };

  const handleApplySelected = async () => {
    if (selectedAssessments.size === 0) {
      setError('Please select at least one assessment to apply.');
      return;
    }

    setIsApplying(true);
    setError(null);

    try {
      // Apply each selected assessment by updating the signal status
      const selectedList = assessments.filter(a => selectedAssessments.has(a.signalId));

      for (const assessment of selectedList) {
        // Only update if there's actual evidence (non-neutral)
        if (assessment.assessment === 'neutral') continue;

        // Determine new status based on assessment
        let newStatus = assessment.currentStatus;
        if (assessment.assessment === 'strong_confirmation' || assessment.assessment === 'strong_warning') {
          newStatus = 'triggered';
        } else if (assessment.assessment === 'weak_confirmation' || assessment.assessment === 'weak_warning') {
          newStatus = 'monitoring';
        }

        // Update the signal via API
        await fetch(`/api/validation-points/${assessment.signalId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newStatus,
            evidence: {
              source: 'AI Assessment',
              summary: assessment.evidence.join('. '),
              link: contentUrl || undefined,
            },
            confidence: assessment.confidence,
          }),
        });
      }

      onComplete?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply assessments');
    } finally {
      setIsApplying(false);
    }
  };

  const toggleAssessmentExpanded = (signalId: string) => {
    const newSet = new Set(expandedAssessments);
    if (newSet.has(signalId)) {
      newSet.delete(signalId);
    } else {
      newSet.add(signalId);
    }
    setExpandedAssessments(newSet);
  };

  const toggleAssessmentSelected = (signalId: string) => {
    const newSet = new Set(selectedAssessments);
    if (newSet.has(signalId)) {
      newSet.delete(signalId);
    } else {
      newSet.add(signalId);
    }
    setSelectedAssessments(newSet);
  };

  const getAssessmentBadge = (assessment: SignalAssessment['assessment']) => {
    switch (assessment) {
      case 'strong_confirmation':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full"><CheckCircle2 className="w-3 h-3" />Strong Confirmation</span>;
      case 'weak_confirmation':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded-full"><CheckCircle2 className="w-3 h-3" />Weak Confirmation</span>;
      case 'strong_warning':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full"><XCircle className="w-3 h-3" />Strong Warning</span>;
      case 'weak_warning':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600 rounded-full"><XCircle className="w-3 h-3" />Weak Warning</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">Neutral</span>;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return <span className="px-1.5 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded">High</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 text-xs bg-amber-50 text-amber-700 rounded">Medium</span>;
      default:
        return <span className="px-1.5 py-0.5 text-xs bg-slate-50 text-slate-600 rounded">Low</span>;
    }
  };

  const handleReset = () => {
    setPhase('input');
    setAssessments([]);
    setOverallSummary('');
    setSummary(null);
    setUsage(null);
    setSelectedAssessments(new Set());
    setExpandedAssessments(new Set());
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Assess Evidence
            </h2>
            <p className="text-sm text-slate-500">{thesisTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Input Phase */}
          {phase === 'input' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Provide content to analyze against this thesis&apos;s signals. The AI will identify evidence of confirmation or warning for each signal.
              </p>

              {/* Input mode tabs */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    inputMode === 'text'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Paste Text
                </button>
                <button
                  onClick={() => setInputMode('url')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    inputMode === 'url'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Link2 className="w-4 h-4" />
                  Fetch URL
                </button>
              </div>

              {inputMode === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Content to Analyze
                  </label>
                  <textarea
                    value={contentText}
                    onChange={(e) => setContentText(e.target.value)}
                    placeholder="Paste transcript, article, earnings call notes, research report, etc..."
                    rows={12}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {contentText.length.toLocaleString()} characters (minimum 100)
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    URL
                  </label>
                  <input
                    type="url"
                    value={contentUrl}
                    onChange={(e) => setContentUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Content will be fetched and analyzed
                  </p>
                </div>
              )}

              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Analyzing Phase */}
          {phase === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
              <p className="text-sm font-medium text-slate-900">Analyzing content...</p>
              <p className="text-xs text-slate-500 mt-1">
                This may take 15-30 seconds
              </p>
            </div>
          )}

          {/* Results Phase */}
          {phase === 'results' && (
            <div className="space-y-4">
              {/* Summary */}
              {summary && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Analysis Summary</h3>
                  {overallSummary && (
                    <p className="text-sm text-slate-700 mb-3">{overallSummary}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Signals:</span>{' '}
                      <span className="font-medium">{summary.totalSignals}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">With Evidence:</span>{' '}
                      <span className="font-medium">{summary.withEvidence}</span>
                    </div>
                    <div className="text-emerald-600">
                      <span className="text-emerald-500">Confirmations:</span>{' '}
                      <span className="font-medium">{summary.confirmationEvidence}</span>
                    </div>
                    <div className="text-red-600">
                      <span className="text-red-500">Warnings:</span>{' '}
                      <span className="font-medium">{summary.warningEvidence}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Assessments List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Signal Assessments</h3>
                  <div className="text-xs text-slate-500">
                    {selectedAssessments.size} selected
                  </div>
                </div>

                {assessments.map((assessment) => {
                  const isExpanded = expandedAssessments.has(assessment.signalId);
                  const isSelected = selectedAssessments.has(assessment.signalId);
                  const hasEvidence = assessment.assessment !== 'neutral';

                  return (
                    <div
                      key={assessment.signalId}
                      className={`border rounded-lg overflow-hidden transition-colors ${
                        isSelected ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-start gap-3 p-3">
                        {hasEvidence && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAssessmentSelected(assessment.signalId)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                              assessment.type === 'confirmation'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {assessment.type}
                            </span>
                            {getAssessmentBadge(assessment.assessment)}
                            {getConfidenceBadge(assessment.confidence)}
                          </div>
                          <p className="text-sm text-slate-900">{assessment.statement}</p>
                        </div>
                        <button
                          onClick={() => toggleAssessmentExpanded(assessment.signalId)}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3 ml-7">
                          {assessment.evidence.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Evidence</h4>
                              <ul className="text-sm text-slate-600 space-y-1">
                                {assessment.evidence.map((e, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-slate-400">•</span>
                                    <span>{e}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {assessment.quotes.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Quotes</h4>
                              <div className="space-y-2">
                                {assessment.quotes.map((q, i) => (
                                  <blockquote key={i} className="text-sm text-slate-600 italic border-l-2 border-slate-300 pl-3">
                                    &ldquo;{q}&rdquo;
                                  </blockquote>
                                ))}
                              </div>
                            </div>
                          )}

                          {assessment.recommendedAction && (
                            <div>
                              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Recommended Action</h4>
                              <p className="text-sm text-slate-600">{assessment.recommendedAction}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Usage info */}
              {usage && (
                <div className="text-xs text-slate-400 text-right">
                  {usage.model} • {usage.inputTokens.toLocaleString()} input / {usage.outputTokens.toLocaleString()} output tokens
                </div>
              )}

              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          {phase === 'input' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                Analyze Content
              </button>
            </>
          )}

          {phase === 'analyzing' && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
            >
              Cancel
            </button>
          )}

          {phase === 'results' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Analyze Different Content
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                  disabled={isApplying}
                >
                  Close
                </button>
                <button
                  onClick={handleApplySelected}
                  disabled={selectedAssessments.size === 0 || isApplying}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                >
                  {isApplying ? 'Applying...' : `Apply ${selectedAssessments.size} Selected`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
