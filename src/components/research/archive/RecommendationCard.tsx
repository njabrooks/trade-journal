'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreateThesisFromRecommendation } from './CreateThesisFromRecommendation';
import { CreateAssetViewFromRecommendation } from './CreateAssetViewFromRecommendation';
import type { ResearchHierarchyRecommendation } from '@/db/schema';

interface RecommendationCardProps {
  recommendation: ResearchHierarchyRecommendation;
  onAction: (action: 'accept' | 'reject' | 'modify', modifications?: any) => Promise<void>;
}

export function RecommendationCard({ recommendation, onAction }: RecommendationCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const proposedData = recommendation.proposedData as any;
  const confidenceScore = recommendation.confidenceScore
    ? Number(recommendation.confidenceScore)
    : 0.5;

  const getTypeLabel = () => {
    switch (recommendation.recommendationType) {
      case 'new_macro_thesis':
        return 'New Macro Thesis';
      case 'new_asset_view':
        return 'New Asset View';
      case 'link_existing':
        return 'Link to Existing';
      case 'refute_existing':
        return 'Refute Existing';
      default:
        return recommendation.recommendationType;
    }
  };

  const getTypeColor = () => {
    switch (recommendation.recommendationType) {
      case 'new_macro_thesis':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'new_asset_view':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'link_existing':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'refute_existing':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusColor = () => {
    switch (recommendation.status) {
      case 'accepted':
        return 'bg-emerald-100 text-emerald-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      case 'modified':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleAction = async (action: 'accept' | 'reject' | 'modify', modifications?: any) => {
    setActionLoading(action);
    try {
      await onAction(action, modifications);
      setShowCreateForm(false);
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickAccept = async () => {
    // For link_existing or refute_existing, accept directly
    if (
      recommendation.recommendationType === 'link_existing' ||
      recommendation.recommendationType === 'refute_existing'
    ) {
      await handleAction('accept');
    } else {
      // For new items, show the create form
      setShowCreateForm(true);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs font-medium rounded border ${getTypeColor()}`}
          >
            {getTypeLabel()}
          </span>
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor()}`}
          >
            {recommendation.status}
          </span>
          {confidenceScore > 0 && (
            <span className="text-xs text-slate-500">
              Confidence: {(confidenceScore * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide' : 'Show'} Details
        </Button>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-slate-700">
        {recommendation.reasoning || 'No reasoning provided'}
      </p>
      
      {/* Warning if recommendation is incomplete */}
      {!recommendation.existingThesisId && 
       !recommendation.existingViewId && 
       !proposedData?.title && 
       recommendation.recommendationType === 'link_existing' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
          <p className="text-xs text-yellow-800">
            ⚠️ This recommendation is incomplete. The AI suggested linking to an existing item but didn't specify which one.
          </p>
        </div>
      )}

      {/* Details */}
      {showDetails && (
        <div className="space-y-2 text-sm border-t pt-3">
          {recommendation.recommendationType === 'new_macro_thesis' && (
            <div>
              <strong>Proposed Title:</strong> {proposedData?.title || 'N/A'}
              <br />
              <strong>Type:</strong> {proposedData?.thesisType || 'N/A'}
              <br />
              <strong>Time Horizon:</strong> {proposedData?.timeHorizon || 'N/A'}
            </div>
          )}

          {recommendation.recommendationType === 'new_asset_view' && (
            <div>
              <strong>Proposed Title:</strong> {proposedData?.title || 'N/A'}
              <br />
              <strong>Ticker:</strong> {proposedData?.underlyingTicker || 'N/A'}
              <br />
              <strong>Time Horizon:</strong> {proposedData?.timeHorizon || 'N/A'}
            </div>
          )}

          {(recommendation.recommendationType === 'link_existing' ||
            recommendation.recommendationType === 'refute_existing') && (
            <div>
              {recommendation.existingThesisId && (
                <>
                  <strong>Existing Thesis ID:</strong> {recommendation.existingThesisId}
                  <br />
                </>
              )}
              {recommendation.existingViewId && (
                <>
                  <strong>Existing View ID:</strong> {recommendation.existingViewId}
                  <br />
                </>
              )}
              <strong>Mapping Type:</strong> {recommendation.mappingType || 'N/A'}
            </div>
          )}

          <div className="text-xs text-slate-500 pt-2 border-t">
            Generated by {recommendation.aiModel} on{' '}
            {new Date(recommendation.generatedAt).toLocaleString()}
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && recommendation.status === 'pending' && (
        <div className="pt-4 border-t">
          {recommendation.recommendationType === 'new_macro_thesis' && (
            <CreateThesisFromRecommendation
              recommendation={recommendation}
              onSave={async (data) => {
                await handleAction('accept', data);
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
          {recommendation.recommendationType === 'new_asset_view' && (
            <CreateAssetViewFromRecommendation
              recommendation={recommendation}
              onSave={async (data) => {
                await handleAction('accept', data);
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          )}
        </div>
      )}

      {/* Actions */}
      {recommendation.status === 'pending' && !showCreateForm && (
        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            onClick={handleQuickAccept}
            disabled={!!actionLoading}
            className="flex-1"
          >
            {actionLoading === 'accept' ? 'Accepting...' : 'Accept'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('modify')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'modify' ? 'Modifying...' : 'Modify'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('reject')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
          </Button>
        </div>
      )}

      {recommendation.status === 'accepted' && (
        <div className="text-sm text-emerald-700 pt-2 border-t">
          ✓ Accepted on {recommendation.acceptedAt ? new Date(recommendation.acceptedAt).toLocaleString() : 'N/A'}
        </div>
      )}

      {recommendation.status === 'rejected' && (
        <div className="text-sm text-red-700 pt-2 border-t">
          ✗ Rejected on {recommendation.rejectedAt ? new Date(recommendation.rejectedAt).toLocaleString() : 'N/A'}
        </div>
      )}
    </div>
  );
}

