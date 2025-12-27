'use client';

import { useState, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, TestTube, Check, X, History, Sparkles } from 'lucide-react';
import type { AIPrompt } from '@/db/schema';

type PromptType = 'insight_extraction' | 'hierarchy_analysis' | 'recommendation_generation';
type PromptStatus = 'active' | 'draft' | 'archived';

const PROMPT_TYPES: { value: PromptType; label: string; description: string }[] = [
  {
    value: 'insight_extraction',
    label: 'Insight Extraction',
    description: 'Extracts structured insights from research content',
  },
  {
    value: 'hierarchy_analysis',
    label: 'Hierarchy Analysis',
    description: 'Analyzes insights against existing theses/views',
  },
  {
    value: 'recommendation_generation',
    label: 'Recommendation Generation',
    description: 'Generates hierarchy recommendations from analysis',
  },
];

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<PromptType | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AIPrompt | null>(null);
  const [testingPrompt, setTestingPrompt] = useState<AIPrompt | null>(null);

  const [formData, setFormData] = useState({
    promptType: 'insight_extraction' as PromptType,
    name: '',
    description: '',
    content: '',
    status: 'draft' as PromptStatus,
  });

  useEffect(() => {
    loadPrompts();
  }, [selectedType]);

  async function loadPrompts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedType !== 'all') {
        params.set('promptType', selectedType);
      }
      const response = await fetch(`/api/prompts?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setPrompts(data.prompts);
      }
    } catch (error) {
      console.error('Error loading prompts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        await loadPrompts();
        setShowForm(false);
        resetForm();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating prompt:', error);
      alert('Failed to create prompt');
    }
  }

  async function handleUpdate() {
    if (!editingPrompt) return;

    try {
      const response = await fetch(`/api/prompts/${editingPrompt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.success) {
        await loadPrompts();
        setEditingPrompt(null);
        resetForm();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating prompt:', error);
      alert('Failed to update prompt');
    }
  }

  async function handleActivate(promptId: string) {
    try {
      const response = await fetch(`/api/prompts/${promptId}/activate`, {
        method: 'POST',
      });

      const data = await response.json();
      if (data.success) {
        await loadPrompts();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error activating prompt:', error);
      alert('Failed to activate prompt');
    }
  }

  async function handleTest(prompt: AIPrompt) {
    setTestingPrompt(prompt);
  }

  function resetForm() {
    setFormData({
      promptType: 'insight_extraction',
      name: '',
      description: '',
      content: '',
      status: 'draft',
    });
    setEditingPrompt(null);
  }

  function startEdit(prompt: AIPrompt) {
    setEditingPrompt(prompt);
    setFormData({
      promptType: prompt.promptType as PromptType,
      name: prompt.name,
      description: prompt.description || '',
      content: prompt.content,
      status: prompt.status as PromptStatus,
    });
    setShowForm(true);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  const filteredPrompts = selectedType === 'all' 
    ? prompts 
    : prompts.filter(p => p.promptType === selectedType);

  const activePrompts = filteredPrompts.filter(p => p.status === 'active');
  const draftPrompts = filteredPrompts.filter(p => p.status === 'draft');
  const archivedPrompts = filteredPrompts.filter(p => p.status === 'archived');

  return (
    <DashboardShell
      title="AI Prompts"
      subtitle="Manage prompts for AI research processing"
      activeNav="research"
    >
      <div className="space-y-6">
        {/* Filters and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as PromptType | 'all')}
              className="h-9 w-[200px] rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="all">All Types</option>
              {PROMPT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Prompt
          </Button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>{editingPrompt ? 'Edit Prompt' : 'Create New Prompt'}</CardTitle>
              <CardDescription>
                {editingPrompt
                  ? 'Editing will create a new version if content changes'
                  : 'Create a new prompt for AI processing'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="promptType">Prompt Type</Label>
                  <select
                    id="promptType"
                    value={formData.promptType}
                    onChange={(e) => setFormData({ ...formData, promptType: e.target.value as PromptType })}
                    disabled={!!editingPrompt}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {PROMPT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as PromptStatus })}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Default Insight Extraction"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What this prompt does"
                />
              </div>

              <div>
                <Label htmlFor="content">Prompt Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Enter prompt template with {{variable}} placeholders..."
                  rows={15}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use template variables like {'{{artifact.title}}'}, {'{{artifact.rawContent}}'}, etc.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={editingPrompt ? handleUpdate : handleCreate}>
                  {editingPrompt ? 'Update' : 'Create'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prompts List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading prompts...</div>
        ) : (
          <div className="space-y-6">
            {/* Active Prompts */}
            {activePrompts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  Active Prompts
                </h3>
                <div className="grid gap-4">
                  {activePrompts.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      onEdit={startEdit}
                      onActivate={handleActivate}
                      onTest={handleTest}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Draft Prompts */}
            {draftPrompts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Draft Prompts</h3>
                <div className="grid gap-4">
                  {draftPrompts.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      onEdit={startEdit}
                      onActivate={handleActivate}
                      onTest={handleTest}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Archived Prompts */}
            {archivedPrompts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Archived Prompts</h3>
                <div className="grid gap-4">
                  {archivedPrompts.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      onEdit={startEdit}
                      onActivate={handleActivate}
                      onTest={handleTest}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredPrompts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No prompts found. Create your first prompt to get started.</p>
              </div>
            )}
          </div>
        )}

        {/* Test Dialog */}
        {testingPrompt && (
          <TestPromptDialog
            prompt={testingPrompt}
            onClose={() => setTestingPrompt(null)}
          />
        )}
      </div>
    </DashboardShell>
  );
}

function PromptCard({
  prompt,
  onEdit,
  onActivate,
  onTest,
}: {
  prompt: AIPrompt;
  onEdit: (prompt: AIPrompt) => void;
  onActivate: (id: string) => void;
  onTest: (prompt: AIPrompt) => void;
}) {
  const typeLabel = PROMPT_TYPES.find((t) => t.value === prompt.promptType)?.label || prompt.promptType;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {prompt.name}
              {prompt.isDefault && <Badge variant="secondary">Default</Badge>}
              {prompt.status === 'active' && <Badge variant="default" className="bg-green-600">Active</Badge>}
            </CardTitle>
            <CardDescription className="mt-1">
              {typeLabel} • Version {prompt.version}
              {prompt.description && ` • ${prompt.description}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onTest(prompt)}>
              <TestTube className="h-4 w-4 mr-1" />
              Test
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(prompt)}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {prompt.status !== 'active' && (
              <Button variant="outline" size="sm" onClick={() => onActivate(prompt.id)}>
                <Check className="h-4 w-4 mr-1" />
                Activate
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm">
            <span className="font-medium">Variables:</span>{' '}
            {prompt.variables && prompt.variables.length > 0 ? (
              <span className="text-muted-foreground">
                {prompt.variables.join(', ')}
              </span>
            ) : (
              <span className="text-muted-foreground">None detected</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Usage:</span> {prompt.usageCount || 0} times
            {prompt.lastUsedAt && (
              <> • Last used: {new Date(prompt.lastUsedAt).toLocaleDateString()}</>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono bg-slate-50 p-2 rounded mt-2 line-clamp-3">
            {prompt.content}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TestPromptDialog({
  prompt,
  onClose,
}: {
  prompt: AIPrompt;
  onClose: () => void;
}) {
  const [sampleContext, setSampleContext] = useState('');
  const [rendered, setRendered] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    try {
      let context = {};
      try {
        context = JSON.parse(sampleContext || '{}');
      } catch {
        // Use default sample context
        context = {
          artifact: {
            title: 'Sample Research Article',
            sourceType: 'article',
            author: 'John Doe',
            publishedDate: '2024-12-22',
            rawContent: 'This is a sample research article about AI infrastructure...',
          },
        };
      }

      const response = await fetch(`/api/prompts/${prompt.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });

      const data = await response.json();
      if (data.success) {
        setRendered(data.rendered);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error testing prompt:', error);
      alert('Failed to test prompt');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Test Prompt: {prompt.name}</CardTitle>
          <CardDescription>Preview how the prompt will be rendered</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Sample Context (JSON)</Label>
            <Textarea
              value={sampleContext}
              onChange={(e) => setSampleContext(e.target.value)}
              placeholder='{"artifact": {"title": "Sample", "rawContent": "..."}}'
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Leave empty to use default sample context
            </p>
          </div>

          <Button onClick={handleTest} disabled={loading}>
            {loading ? 'Testing...' : 'Test Prompt'}
          </Button>

          {rendered && (
            <div>
              <Label>Rendered Prompt</Label>
              <div className="bg-slate-50 p-4 rounded border font-mono text-sm whitespace-pre-wrap">
                {rendered}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

