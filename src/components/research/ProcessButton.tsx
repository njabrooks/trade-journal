'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import type { AIModel } from '@/lib/services/ai-providers';

interface ProcessButtonProps {
  artifactId: string;
}

interface ModelOption {
  value: AIModel;
  label: string;
  provider: string;
  pricing: { input: number; output: number };
}

export function ProcessButton({ artifactId }: ProcessButtonProps) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devAlternative, setDevAlternative] = useState<string | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel>('claude-sonnet-4');
  const [showModelSelector, setShowModelSelector] = useState(false);

  useEffect(() => {
    // Load available models
    async function loadModels() {
      try {
        const { getAvailableModels } = await import('@/lib/services/ai-providers');
        const available = getAvailableModels();
        setModels(available);
        if (available.length > 0) {
          setSelectedModel(available[0].value);
        }
      } catch (error) {
        console.error('Error loading models:', error);
      }
    }
    loadModels();
  }, []);

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    setDevAlternative(null);

    try {
      const response = await fetch('/api/research/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId, model: selectedModel }),
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

  const selectedModelInfo = models.find((m) => m.value === selectedModel);

  return (
    <div className="space-y-3">
      {models.length > 1 && (
        <div>
          <Label htmlFor="model-select" className="text-sm font-medium mb-1.5 block">
            AI Model
          </Label>
          <div className="flex items-center gap-2">
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as AIModel)}
              disabled={processing}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              {models.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
            {selectedModelInfo && (
              <span className="text-xs text-muted-foreground">
                ${(selectedModelInfo.pricing.input * 1_000_000).toFixed(2)}/${
                  (selectedModelInfo.pricing.output * 1_000_000).toFixed(2)
                } per M tokens
              </span>
            )}
          </div>
        </div>
      )}
      <Button onClick={handleProcess} disabled={processing}>
        {processing ? (
          <>
            <Spinner className="size-4 mr-2" />
            Processing with {selectedModelInfo?.label || 'AI'}...
          </>
        ) : (
          `Process with ${selectedModelInfo?.label || 'AI'}`
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
