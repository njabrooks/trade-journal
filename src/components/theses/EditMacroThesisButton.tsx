'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { EditMacroThesisDialog } from './EditMacroThesisDialog';
import { cn } from '@/lib/utils';
import type { MacroThesis } from '@/db/schema';

interface EditMacroThesisButtonProps {
  thesis: MacroThesis;
  className?: string;
}

export function EditMacroThesisButton({ thesis, className }: EditMacroThesisButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors",
          className
        )}
      >
        <Pencil className="h-4 w-4" />
        Edit
      </button>

      {isOpen && (
        <EditMacroThesisDialog thesis={thesis} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
