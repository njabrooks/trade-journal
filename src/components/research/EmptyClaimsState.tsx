'use client';

import { Button } from '@/components/ui/button';
import { FileText, Download, BookOpen } from 'lucide-react';
import Link from 'next/link';

interface EmptyClaimsStateProps {
  rawContent: string;
  artifactId: string;
}

export function EmptyClaimsState({ rawContent, artifactId }: EmptyClaimsStateProps) {
  const handleDownload = () => {
    const blob = new Blob([rawContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-${artifactId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-12">
      <div className="max-w-2xl mx-auto text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-6">
          <FileText className="h-8 w-8" />
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-slate-900 mb-3">
          No Claims Extracted
        </h3>

        {/* Description */}
        <p className="text-slate-600 mb-8">
          This research hasn't been processed through the forensic claims extraction workflow.
          Claims must be extracted locally using Claude Code before they can be browsed and
          converted in the app.
        </p>

        {/* Workflow Steps */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-6 mb-8 text-left">
          <h4 className="font-semibold text-slate-900 mb-4">To extract claims:</h4>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                1
              </span>
              <span>
                <strong>Download</strong> the raw content using the button below
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                2
              </span>
              <span>
                <strong>Run</strong> <code className="px-2 py-0.5 bg-slate-200 rounded text-xs font-mono">/process-transcript</code> in local Claude Code session
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs">
                3
              </span>
              <span>
                <strong>Upload</strong> the generated audit file with <code className="px-2 py-0.5 bg-slate-200 rounded text-xs font-mono">/finalize-for-upload</code>
              </span>
            </li>
          </ol>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={handleDownload} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Download Raw Content
          </Button>
          <Link href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <BookOpen className="h-4 w-4" />
              View Workflow Guide
            </Button>
          </Link>
        </div>

        {/* Help Text */}
        <p className="text-xs text-slate-500 mt-6">
          The claims extraction workflow ensures forensic-quality analysis with no information loss
          using the Toulmin argumentation framework.
        </p>
      </div>
    </div>
  );
}
