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
 * Shows a button to run the /build-core-argument skill when conditions are met:
 * - Has ≥3 claims AND no core argument (new build)
 * - OR has ≥3 new claims since last core argument (update)
 *
 * Clicking calls the build-core-argument API to generate the core argument.
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
        const res = await fetch('/api/skills/build-core-argument', {
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
        loading: `${needsInitialSynthesis ? 'Building' : 'Updating'} core argument for "${title}"... This may take several minutes.`,
        success: `Core argument ${needsInitialSynthesis ? 'created' : 'updated'} for "${title}"`,
        error: (err) => `Failed: ${err.message}`,
        duration: 10000,
      }
    );
  };

  const buttonText = needsInitialSynthesis
    ? 'Build Core Argument'
    : `Update Core Argument (+${newClaimsSinceArticulation} claims)`;

  const tooltipText = needsInitialSynthesis
    ? `This thesis has ${claimCount} claims. Build a core argument with confirmation/warning signals.`
    : `${newClaimsSinceArticulation} new claims since last core argument. Update to incorporate new evidence.`;

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
