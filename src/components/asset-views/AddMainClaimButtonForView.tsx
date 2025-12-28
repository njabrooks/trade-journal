'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddMainClaimDialog } from '@/components/research/AddMainClaimDialog';

interface AddMainClaimButtonForViewProps {
  viewId: string;
  viewTitle: string;
}

export function AddMainClaimButtonForView({ viewId, viewTitle }: AddMainClaimButtonForViewProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button onClick={() => setShowDialog(true)} variant="outline" size="sm">
        <Link2 className="h-4 w-4 mr-2" />
        Add Main Claim
      </Button>

      {showDialog && (
        <AddMainClaimDialog
          entityType="view"
          entityId={viewId}
          entityTitle={viewTitle}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
