'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, Copy } from 'lucide-react';

interface SynthesizeButtonProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  claimCount: number;
  hasArticulation: boolean;
  /** If provided, shows "update" mode when new claims exist since articulation */
  articulationClaimCount?: number;
}

/**
 * SynthesizeButton
 *
 * Shows a button to run the /synthesize-thesis skill when conditions are met:
 * - Has ≥3 claims AND no articulation (new synthesis)
 * - OR has ≥3 new claims since last articulation (update synthesis)
 *
 * Clicking copies the skill command to clipboard for use in Claude Code.
 */
export function SynthesizeButton({
  thesisId,
  thesisType,
  claimCount,
  hasArticulation,
  articulationClaimCount,
}: SynthesizeButtonProps) {
  const [copied, setCopied] = useState(false);

  // Determine if synthesis is recommended
  const MIN_CLAIMS = 3;
  const MIN_NEW_CLAIMS_FOR_UPDATE = 3;

  const needsInitialSynthesis = !hasArticulation && claimCount >= MIN_CLAIMS;
  const newClaimsSinceArticulation = articulationClaimCount !== undefined
    ? claimCount - articulationClaimCount
    : 0;
  const needsUpdateSynthesis = hasArticulation && newClaimsSinceArticulation >= MIN_NEW_CLAIMS_FOR_UPDATE;

  const showButton = needsInitialSynthesis || needsUpdateSynthesis;

  if (!showButton) {
    return null;
  }

  const handleClick = async () => {
    const command = `/synthesize-thesis ${thesisId}`;

    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  const buttonText = needsInitialSynthesis
    ? 'Generate Articulation'
    : `Update Articulation (+${newClaimsSinceArticulation} claims)`;

  const tooltipText = needsInitialSynthesis
    ? `This thesis has ${claimCount} claims. Generate a Core Argument with validation points.`
    : `${newClaimsSinceArticulation} new claims since last articulation. Update to incorporate new evidence.`;

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleClick}
        size="sm"
        variant={needsInitialSynthesis ? 'default' : 'outline'}
        className={needsInitialSynthesis
          ? 'bg-purple-600 hover:bg-purple-700'
          : 'border-purple-200 text-purple-700 hover:bg-purple-50'
        }
        title={tooltipText}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 mr-1" />
            Copied!
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-1" />
            {buttonText}
          </>
        )}
      </Button>
      {copied && (
        <span className="text-xs text-slate-500">
          Run in Claude Code terminal
        </span>
      )}
    </div>
  );
}
