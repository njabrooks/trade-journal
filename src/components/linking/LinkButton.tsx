'use client';

/**
 * LinkButton - Generic + button for linking entities via StandardLinkDialog
 *
 * Used on detail pages to add links to related entities:
 * - macro-theses/[id]: Link asset theses
 * - asset-theses/[id]: Link macro theses and strategies
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StandardLinkDialog } from '@/components/linking/StandardLinkDialog';
import type { SourceEntityType, TargetEntityType } from '@/lib/linking/types';

interface LinkButtonProps {
  sourceType: SourceEntityType;
  sourceId: string;
  sourceTitle: string;
  /** Pre-select target type to skip the type selection step */
  defaultTargetType?: TargetEntityType;
  size?: 'sm' | 'default';
  className?: string;
}

export function LinkButton({
  sourceType,
  sourceId,
  sourceTitle,
  defaultTargetType,
  size = 'sm',
  className,
}: LinkButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setIsDialogOpen(true)}
        className={`h-7 w-7 p-0 ${className ?? ''}`}
        title="Link entities"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <StandardLinkDialog
        sourceType={sourceType}
        sourceId={sourceId}
        sourceTitle={sourceTitle}
        defaultTargetType={defaultTargetType}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  );
}
