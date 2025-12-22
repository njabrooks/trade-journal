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
  const [devAlternative, setDevAlternative] = useState<string | null>(null);

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    setDevAlternative(null);

    try {
      const response = await fetch('/api/research/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || 'Failed to process research');
        if (data.devAlternative) {
          setDevAlternative(data.devAlternative);
        }
        return;
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
      {error && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          {devAlternative && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-800 font-medium mb-1">
                💡 Dev Mode Alternative (Free):
              </p>
              <code className="text-xs bg-blue-100 text-blue-900 px-2 py-1 rounded block">
                {devAlternative}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
