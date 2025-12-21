'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface FilterBarProps {
  theses: Array<{ id: string; title: string }>;
  views: Array<{ id: string; title: string }>;
}

export function FilterBar({ theses, views }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const macroThesisId = searchParams.get('macroThesisId') || '';
  const assetViewId = searchParams.get('assetViewId') || '';

  const handleThesisChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('macroThesisId', value);
    } else {
      params.delete('macroThesisId');
    }
    router.push(`/strategies?${params.toString()}`);
  };

  const handleViewChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set('assetViewId', value);
    } else {
      params.delete('assetViewId');
    }
    router.push(`/strategies?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-4 bg-white rounded-lg border border-slate-200 px-4 py-3">
      <span className="text-sm font-medium text-slate-700">Filters:</span>
      <div className="flex items-center gap-2">
        <label htmlFor="macroThesisFilter" className="text-sm text-slate-600">
          Macro Thesis:
        </label>
        <select
          id="macroThesisFilter"
          value={macroThesisId}
          onChange={(e) => handleThesisChange(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="">All</option>
          {theses.map((thesis) => (
            <option key={thesis.id} value={thesis.id}>
              {thesis.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="assetViewFilter" className="text-sm text-slate-600">
          Asset View:
        </label>
        <select
          id="assetViewFilter"
          value={assetViewId}
          onChange={(e) => handleViewChange(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="">All</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.title}
            </option>
          ))}
        </select>
      </div>
      {(macroThesisId || assetViewId) && (
        <Link href="/strategies" className="text-sm text-blue-600 hover:text-blue-800">
          Clear filters
        </Link>
      )}
    </div>
  );
}
