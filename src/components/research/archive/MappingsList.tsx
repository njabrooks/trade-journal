'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Mapping {
  id: string;
  hierarchyLevel: string;
  mappingType: string;
  confidence: string | null;
  notes: string | null;
  mappedAt: string;
  mappedBy: string;
  macroThesisId: string | null;
  assetThesisId: string | null;
  strategyId: string | null;
  positionId: string | null;
}

interface MappingsListProps {
  insightId: string;
  refreshTrigger?: number;
}

export function MappingsList({ insightId, refreshTrigger }: MappingsListProps) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hierarchyNames, setHierarchyNames] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchMappings();
  }, [insightId, refreshTrigger]);

  const fetchMappings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/research/mappings?insightId=${insightId}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to load mappings');
        return;
      }

      setMappings(data.mappings || []);

      // Fetch names for hierarchy items
      const names: Record<string, string> = {};
      for (const mapping of data.mappings || []) {
        if (mapping.macroThesisId) {
          try {
            const res = await fetch(`/api/theses?id=${mapping.macroThesisId}`);
            const thesisData = await res.json();
            if (thesisData.success) {
              names[mapping.macroThesisId] = thesisData.thesis.title;
            }
          } catch (err) {
            console.error('Error fetching thesis:', err);
          }
        } else if (mapping.assetThesisId) {
          try {
            const res = await fetch(`/api/asset-views?id=${mapping.assetThesisId}`);
            const viewData = await res.json();
            if (viewData.success) {
              const ticker = viewData.view.underlying?.ticker;
              names[mapping.assetThesisId] = ticker
                ? `${ticker} - ${viewData.view.title}`
                : viewData.view.title;
            }
          } catch (err) {
            console.error('Error fetching asset thesis:', err);
          }
        } else if (mapping.strategyId) {
          try {
            const res = await fetch(`/api/strategies?id=${mapping.strategyId}`);
            const stratData = await res.json();
            if (stratData.strategies?.[0]) {
              const strategy = stratData.strategies[0];
              names[mapping.strategyId] = strategy.ticker
                ? `${strategy.ticker} - ${strategy.strategyName}`
                : strategy.strategyName;
            }
          } catch (err) {
            console.error('Error fetching strategy:', err);
          }
        }
      }
      setHierarchyNames(names);
    } catch (err) {
      console.error('Error fetching mappings:', err);
      setError('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (mappingId: string) => {
    if (!confirm('Are you sure you want to remove this link?')) {
      return;
    }

    try {
      const response = await fetch(`/api/research/mappings/${mappingId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!result.success) {
        alert(result.error || 'Failed to delete mapping');
        return;
      }

      // Refresh mappings
      fetchMappings();
    } catch (err) {
      console.error('Error deleting mapping:', err);
      alert('Failed to delete mapping');
    }
  };

  const getMappingTypeColor = (type: string) => {
    switch (type) {
      case 'supports':
        return 'text-green-700 bg-green-50';
      case 'refutes':
        return 'text-red-700 bg-red-50';
      case 'neutral':
        return 'text-gray-700 bg-gray-50';
      case 'exploratory':
        return 'text-blue-700 bg-blue-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  const getConfidenceBadge = (confidence: string | null) => {
    if (!confidence) return null;

    const colors: Record<string, string> = {
      high: 'text-green-600 bg-green-100',
      medium: 'text-yellow-600 bg-yellow-100',
      low: 'text-orange-600 bg-orange-100',
      exploratory: 'text-blue-600 bg-blue-100',
    };

    return (
      <span
        className={`text-xs px-2 py-0.5 rounded ${colors[confidence] || colors.medium}`}
      >
        {confidence}
      </span>
    );
  };

  const getHierarchyLink = (mapping: Mapping) => {
    if (mapping.macroThesisId) {
      return `/theses/${mapping.macroThesisId}`;
    } else if (mapping.assetThesisId) {
      return `/asset-theses/${mapping.assetThesisId}`;
    } else if (mapping.strategyId) {
      return `/strategies/${mapping.strategyId}`;
    }
    return null;
  };

  const getHierarchyName = (mapping: Mapping) => {
    const targetId =
      mapping.macroThesisId || mapping.assetThesisId || mapping.strategyId || mapping.positionId;
    return targetId ? hierarchyNames[targetId] || 'Loading...' : 'Unknown';
  };

  const getHierarchyLevelLabel = (level: string) => {
    switch (level) {
      case 'macro_thesis':
        return 'Macro Thesis';
      case 'asset_view':
        return 'Asset Thesis';
      case 'strategy':
        return 'Strategy';
      case 'position':
        return 'Position';
      default:
        return level;
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading mappings...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (mappings.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No links to hierarchy yet. Click "Link to Hierarchy" to connect this research.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mappings.map((mapping) => {
        const hierarchyLink = getHierarchyLink(mapping);

        return (
          <div
            key={mapping.id}
            className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {/* Hierarchy Level + Name */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500 uppercase font-medium">
                    {getHierarchyLevelLabel(mapping.hierarchyLevel)}
                  </span>
                  {hierarchyLink ? (
                    <Link
                      href={hierarchyLink}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {getHierarchyName(mapping)}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{getHierarchyName(mapping)}</span>
                  )}
                </div>

                {/* Mapping Type + Confidence */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs px-2 py-1 rounded font-medium ${getMappingTypeColor(mapping.mappingType)}`}
                  >
                    {mapping.mappingType}
                  </span>
                  {getConfidenceBadge(mapping.confidence)}
                </div>

                {/* Notes */}
                {mapping.notes && (
                  <div className="text-sm text-gray-700 mt-2">
                    <span className="font-medium">Notes:</span> {mapping.notes}
                  </div>
                )}

                {/* Metadata */}
                <div className="text-xs text-gray-500 mt-2">
                  Linked by {mapping.mappedBy} on{' '}
                  {new Date(mapping.mappedAt).toLocaleDateString()}
                </div>
              </div>

              {/* Delete Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(mapping.id)}
                className="ml-2"
              >
                Remove
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
