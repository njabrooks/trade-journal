'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface ProcessButtonProps {
  artifactId: string;
}

export function ProcessButton({ artifactId }: ProcessButtonProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/research/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process research');
      }

      // Refresh the page to show the new insight
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process research');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <Button onClick={handleProcess} disabled={processing}>
        {processing ? (
          <>
            <Spinner className="size-4 mr-2" />
            Processing with AI...
          </>
        ) : (
          'Process with AI'
        )}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
