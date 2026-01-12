'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AssessEvidenceModal } from './AssessEvidenceModal';

interface AssessEvidenceButtonProps {
  thesisId: string;
  thesisType: 'macro' | 'asset';
  thesisTitle: string;
  signalCount: number;
  onComplete?: () => void;
}

export function AssessEvidenceButton({
  thesisId,
  thesisType,
  thesisTitle,
  signalCount,
  onComplete,
}: AssessEvidenceButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Don't show button if no signals to assess
  if (signalCount === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Assess Evidence
      </button>

      <AssessEvidenceModal
        thesisId={thesisId}
        thesisType={thesisType}
        thesisTitle={thesisTitle}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onComplete={() => {
          setIsOpen(false);
          onComplete?.();
        }}
      />
    </>
  );
}
