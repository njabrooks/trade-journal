'use client';

/**
 * LinkToViewButton - Button that opens LinkToViewDialog
 *
 * Used in HierarchyBreadcrumb and Strategy pages to
 * trigger the linking workflow.
 *
 * Part of Phase 2.6.6 Phase B: Inline Linking Workflows
 */

import { useState } from 'react';
import { LinkToViewDialog } from './LinkToViewDialog';

interface LinkToViewButtonProps {
  strategyId: string;
  strategyLabel: string;
  currentViewId?: string | null;
  currentThesisId?: string | null;
  onLinkComplete?: () => void;
}

export function LinkToViewButton({
  strategyId,
  strategyLabel,
  currentViewId,
  currentThesisId,
  onLinkComplete,
}: LinkToViewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = () => {
    setIsOpen(false);
    if (onLinkComplete) {
      onLinkComplete();
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
      >
        Link to Asset View
      </button>

      <LinkToViewDialog
        strategyId={strategyId}
        strategyLabel={strategyLabel}
        currentViewId={currentViewId}
        currentThesisId={currentThesisId}
        isOpen={isOpen}
        onClose={handleClose}
      />
    </>
  );
}
