'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EvidenceClaim } from '@/types/claims';

interface ExpandableEvidenceClaimProps {
  evidenceClaim: EvidenceClaim;
  relationshipType?: 'supports' | 'refutes' | 'qualifies';
  showRelationship?: boolean;
}

/**
 * Expandable card for displaying evidence claims with full Toulmin framework
 * 
 * Collapsed state: Shows claim title, type, and qualifier badge
 * Expanded state: Shows full Toulmin structure (claim, evidence, reasoning, backing, rebuttal)
 */
export function ExpandableEvidenceClaim({
  evidenceClaim,
  relationshipType,
  showRelationship = false,
}: ExpandableEvidenceClaimProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getRelationshipColor = (type: string) => {
    switch (type) {
      case 'supports':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'refutes':
        return 'bg-destructive/15 text-destructive';
      case 'qualifies':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getQualifierColor = (qualifier: string) => {
    switch (qualifier) {
      case 'high':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'medium':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400';
      case 'low':
        return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
      case 'exploratory':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left hover:bg-muted transition-colors rounded-lg"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className={getRelationshipColor(evidenceClaim.type)}>
              {evidenceClaim.type}
            </Badge>
            <Badge className={getQualifierColor(evidenceClaim.qualifier)}>
              {evidenceClaim.qualifier}
            </Badge>
            {showRelationship && relationshipType && (
              <Badge className={getRelationshipColor(relationshipType)}>
                {relationshipType}
              </Badge>
            )}
          </div>
          <h4 className="font-medium text-sm text-foreground line-clamp-2">
            {evidenceClaim.title}
          </h4>
          {!isExpanded && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {evidenceClaim.claim}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 pt-1">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content - Full Toulmin Framework */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border">
          {/* Claim */}
          <div>
            <h5 className="text-xs font-semibold text-foreground mb-1">
              Claim
            </h5>
            <p className="text-sm text-foreground">
              {evidenceClaim.claim}
            </p>
          </div>

          {/* Evidence */}
          {evidenceClaim.evidence && evidenceClaim.evidence.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-1">
                Evidence
              </h5>
              <ul className="space-y-1 list-disc list-inside">
                {evidenceClaim.evidence.map((item, idx) => (
                  <li key={idx} className="text-sm text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reasoning */}
          {evidenceClaim.reasoning && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-1">
                Reasoning
              </h5>
              <p className="text-sm text-foreground">
                {evidenceClaim.reasoning}
              </p>
            </div>
          )}

          {/* Backing */}
          {evidenceClaim.backing && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-1">
                Backing
              </h5>
              <p className="text-sm text-foreground">
                {evidenceClaim.backing}
              </p>
            </div>
          )}

          {/* Rebuttal */}
          {evidenceClaim.rebuttal && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-1">
                Rebuttal
              </h5>
              <p className="text-sm text-foreground italic">
                {evidenceClaim.rebuttal}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

