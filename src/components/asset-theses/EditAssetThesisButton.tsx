'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { EditAssetThesisDialog } from './EditAssetThesisDialog';
import type { AssetThesis } from '@/db/schema';

interface EditAssetThesisButtonProps {
  thesis: AssetThesis;
}

export function EditAssetThesisButton({ thesis }: EditAssetThesisButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <Pencil className="h-4 w-4" />
        Edit
      </span>

      {isOpen && (
        <EditAssetThesisDialog thesis={thesis} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
