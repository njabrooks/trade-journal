'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddMainClaimDialog } from '@/components/research/AddMainClaimDialog';

interface AddMainClaimButtonProps {
  thesisId: string;
  thesisTitle: string;
}

export function AddMainClaimButton({ thesisId, thesisTitle }: AddMainClaimButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button onClick={() => setShowDialog(true)} variant="outline" size="sm">
        <Link2 className="h-4 w-4 mr-2" />
        Add Main Claim
      </Button>

      {showDialog && (
        <AddMainClaimDialog
          entityType="thesis"
          entityId={thesisId}
          entityTitle={thesisTitle}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
