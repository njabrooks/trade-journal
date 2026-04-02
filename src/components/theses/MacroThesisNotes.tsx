'use client';

import { MarkdownDisplay, isMarkdownContent } from '@/components/ui/markdown-display';

interface MacroThesisNotesProps {
  notes: unknown;
}

export function MacroThesisNotes({ notes }: MacroThesisNotesProps) {
  if (typeof notes === 'string' && isMarkdownContent(notes)) {
    return <MarkdownDisplay content={notes} />;
  }

  return (
    <pre className="text-sm text-foreground whitespace-pre-wrap">
      {JSON.stringify(notes, null, 2)}
    </pre>
  );
}
