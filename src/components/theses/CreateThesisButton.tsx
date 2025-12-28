'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateThesisDialog } from './CreateThesisDialog';

export function CreateThesisButton() {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <Button onClick={() => setShowDialog(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create New Thesis
      </Button>

      {showDialog && <CreateThesisDialog onClose={() => setShowDialog(false)} />}
    </>
  );
}
