'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface EvidenceSummary {
  supports: number;
  refutes: number;
  neutral: number;
  exploratory: number;
  total: number;
}

interface ResearchItem {
  mapping: {
    id: string;
    mappingType: string;
    confidence: string | null;
    notes: string | null;
    mappedAt: string;
  };
  insight: {
    id: string;
    summary: string | null;
    timeHorizon: string | null;
    confidenceLevel: string | null;
  };
  artifact: {
    id: string;
    title: string;
    author: string | null;
    sourceType: string;
    publishedDate: string | null;
  };
}

interface EvidenceDisplayProps {
  hierarchyType: 'thesis' | 'assetView';
  hierarchyId: string;
}

export function EvidenceDisplay({ hierarchyType, hierarchyId }: EvidenceDisplayProps) {
  const [research, setResearch] = useState<ResearchItem[]>([]);
  const [summary, setSummary] = useState<EvidenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvidence();
  }, [hierarchyId, hierarchyType]);

  const fetchEvidence = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch research mappings
      const param = hierarchyType === 'thesis' ? 'thesisId' : 'viewId';
      const researchResponse = await fetch(`/api/research/mappings?${param}=${hierarchyId}`);
      const researchData = await researchResponse.json();

      if (!researchData.success) {
        setError(researchData.error || 'Failed to load research');
        return;
      }

      setResearch(researchData.research || []);

      // Calculate summary from research data
      const counts = {
        supports: 0,
        refutes: 0,
        neutral: 0,
        exploratory: 0,
        total: researchData.research?.length || 0,
      };

      researchData.research?.forEach((item: ResearchItem) => {
        const type = item.mapping.mappingType;
        if (type === 'supports') counts.supports++;
        else if (type === 'refutes') counts.refutes++;
        else if (type === 'neutral') counts.neutral++;
        else if (type === 'exploratory') counts.exploratory++;
      });

      setSummary(counts);
    } catch (err) {
      console.error('Error fetching evidence:', err);
      setError('Failed to load evidence');
    } finally {
      setLoading(false);
    }
  };

  const getMappingTypeColor = (type: string) => {
    switch (type) {
      case 'supports':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'refutes':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'neutral':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      case 'exploratory':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getMappingTypeIcon = (type: string) => {
    switch (type) {
      case 'supports':
        return '✓';
      case 'refutes':
        return '✗';
      case 'neutral':
        return '−';
      case 'exploratory':
        return '?';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Evidence & Research</h3>
        <div className="text-sm text-gray-500">Loading evidence...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Evidence & Research</h3>
        <div className="text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!research || research.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Evidence & Research</h3>
        <div className="text-sm text-gray-500 italic">
          No research linked yet. Visit the{' '}
          <Link href="/research" className="text-blue-600 hover:underline">
            Research Library
          </Link>{' '}
          to add evidence.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Evidence & Research</h3>

      {/* Evidence Summary */}
      {summary && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-700">{summary.total}</div>
            <div className="text-xs text-slate-500 mt-1">Total</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-700">{summary.supports}</div>
            <div className="text-xs text-green-600 mt-1">Supports</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-700">{summary.refutes}</div>
            <div className="text-xs text-red-600 mt-1">Refutes</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-700">{summary.neutral}</div>
            <div className="text-xs text-gray-600 mt-1">Neutral</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-700">{summary.exploratory}</div>
            <div className="text-xs text-blue-600 mt-1">Exploratory</div>
          </div>
        </div>
      )}

      {/* Research List */}
      <div className="space-y-4">
        {research.map((item) => (
          <div
            key={item.mapping.id}
            className={`border rounded-lg p-4 ${getMappingTypeColor(item.mapping.mappingType)}`}
          >
            <div className="flex items-start gap-3">
              {/* Mapping Type Icon */}
              <div className="text-2xl mt-1">{getMappingTypeIcon(item.mapping.mappingType)}</div>

              <div className="flex-1">
                {/* Title + Mapping Type */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    href={`/research/${item.artifact.id}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {item.artifact.title}
                  </Link>
                  <span className="text-xs font-medium px-2 py-1 rounded capitalize whitespace-nowrap">
                    {item.mapping.mappingType}
                  </span>
                </div>

                {/* Summary */}
                {item.insight.summary && (
                  <p className="text-sm mb-2">{item.insight.summary}</p>
                )}

                {/* Metadata */}
                <div className="flex flex-wrap gap-4 text-xs">
                  {item.artifact.author && (
                    <span>
                      <span className="font-medium">Author:</span> {item.artifact.author}
                    </span>
                  )}
                  {item.artifact.publishedDate && (
                    <span>
                      <span className="font-medium">Published:</span>{' '}
                      {new Date(item.artifact.publishedDate).toLocaleDateString()}
                    </span>
                  )}
                  <span className="capitalize">
                    <span className="font-medium">Type:</span> {item.artifact.sourceType}
                  </span>
                  {item.insight.timeHorizon && (
                    <span className="capitalize">
                      <span className="font-medium">Horizon:</span> {item.insight.timeHorizon}
                    </span>
                  )}
                  {item.mapping.confidence && (
                    <span className="capitalize">
                      <span className="font-medium">Confidence:</span> {item.mapping.confidence}
                    </span>
                  )}
                </div>

                {/* Notes */}
                {item.mapping.notes && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium">Notes:</span> {item.mapping.notes}
                  </div>
                )}

                {/* Linked date */}
                <div className="mt-2 text-xs opacity-75">
                  Linked on {new Date(item.mapping.mappedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
