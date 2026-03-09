'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link2 } from 'lucide-react';
import { ConvertClaimToEntityDialog } from './ConvertClaimToEntityDialog';
import type { MainClaim } from '@/db/schema';

interface ClaimLinkButtonProps {
  claim: MainClaim;
}

export function ClaimLinkButton({ claim }: ClaimLinkButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5"
      >
        <Link2 className="h-4 w-4" />
        Link to Thesis
      </Button>
      <ConvertClaimToEntityDialog
        claim={claim}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
