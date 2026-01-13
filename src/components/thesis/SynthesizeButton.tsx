'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SynthesizeButtonProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle?: string;
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
 * Clicking calls the synthesize-thesis API to generate the articulation.
 */
export function SynthesizeButton({
  thesisId,
  thesisType,
  thesisTitle,
  claimCount,
  hasArticulation,
  articulationClaimCount,
}: SynthesizeButtonProps) {
  const router = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);

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
    setIsExecuting(true);

    const title = thesisTitle || 'thesis';

    toast.promise(
      (async () => {
        const res = await fetch('/api/skills/synthesize-thesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thesisId,
            thesisType,
          }),
        });
        const data = await res.json();
        setIsExecuting(false);

        if (!data.success) {
          throw new Error(data.error || 'Skill execution failed');
        }

        // Refresh the page to show the new articulation
        setTimeout(() => {
          router.refresh();
        }, 1500);

        return data;
      })(),
      {
        loading: `${needsInitialSynthesis ? 'Generating' : 'Updating'} articulation for "${title}"... This may take several minutes.`,
        success: `Articulation ${needsInitialSynthesis ? 'created' : 'updated'} for "${title}"`,
        error: (err) => `Failed: ${err.message}`,
        duration: 10000,
      }
    );
  };

  const buttonText = needsInitialSynthesis
    ? 'Generate Articulation'
    : `Update Articulation (+${newClaimsSinceArticulation} claims)`;

  const tooltipText = needsInitialSynthesis
    ? `This thesis has ${claimCount} claims. Generate a Core Argument with confirmation/warning signals.`
    : `${newClaimsSinceArticulation} new claims since last articulation. Update to incorporate new evidence.`;

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant={needsInitialSynthesis ? 'default' : 'outline'}
      className={needsInitialSynthesis
        ? 'bg-purple-600 hover:bg-purple-700'
        : 'border-purple-200 text-purple-700 hover:bg-purple-50'
      }
      title={tooltipText}
      disabled={isExecuting}
    >
      {isExecuting ? (
        <>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Running...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-1" />
          {buttonText}
        </>
      )}
    </Button>
  );
}
