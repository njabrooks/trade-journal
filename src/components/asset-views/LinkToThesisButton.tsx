'use client';

/**
 * LinkToThesisButton - Button that opens LinkToThesisDialog
 *
 * Used in HierarchyBreadcrumb and Asset View detail pages to
 * trigger the linking workflow.
 *
 * Part of Phase 2.6.6 Phase B: Inline Linking Workflows
 */

import { useState } from 'react';
import { LinkToThesisDialog } from './LinkToThesisDialog';

interface LinkToThesisButtonProps {
  viewId: string;
  viewTitle: string;
  currentThesisId?: string | null;
  onLinkComplete?: () => void;
}

export function LinkToThesisButton({
  viewId,
  viewTitle,
  currentThesisId,
  onLinkComplete,
}: LinkToThesisButtonProps) {
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
        Link to Macro Thesis
      </button>

      <LinkToThesisDialog
        viewId={viewId}
        viewTitle={viewTitle}
        currentThesisId={currentThesisId}
        isOpen={isOpen}
        onClose={handleClose}
      />
    </>
  );
}
