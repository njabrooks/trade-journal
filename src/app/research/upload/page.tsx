'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

export default function ResearchUploadPage() {
  const router = useRouter();
  const [uploadMethod, setUploadMethod] = useState<'text' | 'url'>('text');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<string>('article');
  const [author, setAuthor] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: Record<string, unknown> = {
        title,
        sourceType,
        author: author || undefined,
        publishedDate: publishedDate || undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      };

      if (uploadMethod === 'text') {
        payload.rawContent = content;
      } else {
        payload.sourceUrl = url;
        // For URL ingestion, we'll fetch the content on the server
        const fetchResponse = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });

        if (!fetchResponse.ok) {
          throw new Error(`Failed to fetch URL: ${fetchResponse.statusText}`);
        }

        const html = await fetchResponse.text();

        // Basic HTML to text conversion
        let cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        const textContent = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        payload.rawContent = textContent;
        payload.sourceUrl = url;

        // Extract title from HTML if not provided
        if (!title) {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) {
            payload.title = titleMatch[1].trim();
          }
        }
      }

      const response = await fetch('/api/research/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload research');
      }

      setSuccess('Research artifact uploaded successfully!');

      // Reset form
      setTitle('');
      setAuthor('');
      setPublishedDate('');
      setContent('');
      setUrl('');
      setTags('');

      // Redirect after a short delay
      setTimeout(() => {
        router.push('/research');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload research');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell
      title="Upload Research"
      subtitle="Add new research content to your library"
      activeNav="research"
    >
      <div className="max-w-3xl">
        {/* Workflow Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                For Raw Research Only
              </h3>
              <p className="text-sm text-blue-800 mb-3">
                This page is for uploading <strong>raw, unprocessed research</strong> (transcripts,
                articles, reports). For the full workflow with forensic claims extraction:
              </p>
              <ol className="text-sm text-blue-800 space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="font-semibold">1.</span>
                  <span>
                    Upload raw content here OR save locally
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold">2.</span>
                  <span>
                    Process with{' '}
                    <code className="px-1.5 py-0.5 bg-blue-100 rounded text-xs font-mono">
                      /process-transcript
                    </code>{' '}
                    in local Claude Code
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold">3.</span>
                  <span>
                    Re-upload audit file with{' '}
                    <code className="px-1.5 py-0.5 bg-blue-100 rounded text-xs font-mono">
                      /finalize-for-upload
                    </code>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold">4.</span>
                  <span>
                    Browse claims and convert to theses/views in the app
                  </span>
                </li>
              </ol>
              <p className="text-xs text-blue-700 mt-3">
                Claims extraction provides structured Toulmin arguments for better analysis.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Upload Method */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <Label className="text-base font-semibold mb-4 block">Upload Method</Label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setUploadMethod('text')}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  uploadMethod === 'text'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-medium">Manual Text</div>
                <div className="text-sm text-slate-600 mt-1">Paste or type content</div>
              </button>
              <button
                type="button"
                onClick={() => setUploadMethod('url')}
                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-colors ${
                  uploadMethod === 'url'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-medium">From URL</div>
                <div className="text-sm text-slate-600 mt-1">Fetch from web</div>
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-semibold">Metadata</h3>

            <div>
              <Label htmlFor="title">
                Title {uploadMethod === 'text' && <span className="text-red-500">*</span>}
              </Label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder={uploadMethod === 'url' ? 'Auto-extracted if blank' : 'Enter title'}
                required={uploadMethod === 'text'}
              />
            </div>

            <div>
              <Label htmlFor="sourceType">
                Source Type <span className="text-red-500">*</span>
              </Label>
              <select
                id="sourceType"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="article">Article</option>
                <option value="transcript">Transcript</option>
                <option value="note">Note</option>
                <option value="report">Report</option>
                <option value="video">Video</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="author">Author</Label>
                <input
                  id="author"
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <Label htmlFor="publishedDate">Published Date</Label>
                <input
                  id="publishedDate"
                  type="date"
                  value={publishedDate}
                  onChange={(e) => setPublishedDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tags">Tags</Label>
              <input
                id="tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Comma-separated tags (e.g., tech, macro, earnings)"
              />
              <p className="mt-1 text-xs text-slate-500">
                Separate multiple tags with commas
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-base font-semibold mb-4">Content</h3>

            {uploadMethod === 'text' ? (
              <div>
                <Label htmlFor="content">
                  Research Content <span className="text-red-500">*</span>
                </Label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder="Paste or type your research content here..."
                  required
                />
                <p className="mt-2 text-xs text-slate-500">
                  {content.split(/\s+/).filter(Boolean).length} words
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="url">
                  URL <span className="text-red-500">*</span>
                </Label>
                <input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://example.com/article"
                  required
                />
                <p className="mt-2 text-xs text-slate-500">
                  Content will be automatically fetched and extracted
                </p>
              </div>
            )}
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-800">{success}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-4">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Spinner className="size-4 mr-2" />
                  Uploading...
                </>
              ) : (
                'Upload Research'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/research')}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
