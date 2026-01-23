'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditAssetThesisDialog } from './EditAssetThesisDialog';
import type { AssetThesis } from '@/db/schema';

interface EditAssetThesisButtonProps {
  thesis: AssetThesis;
  className?: string;
}

export function EditAssetThesisButton({ thesis, className }: EditAssetThesisButtonProps) {
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
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-card border rounded-md hover:bg-muted transition-colors cursor-pointer',
          className
        )}
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
