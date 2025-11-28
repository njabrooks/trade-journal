'use client';

import { useState } from 'react';
import { getFileType } from '@/lib/ingestion/flex/utils';
import { DashboardShell } from '@/components/layout/DashboardShell';

interface IngestionResult {
  success: boolean;
  summary?: {
    totalRows: number;
    validRows: number;
    inserted: number;
    skipped?: number;
    updated?: number;
    validationErrors: number;
    insertErrors: number;
  };
  errors?: Array<{ row: number; errors: string[] }>;
  insertErrors?: Array<{ row: number; error: string }>;
  error?: string;
  message?: string;
}

export default function FlexIngestionPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<IngestionResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setResult(null);

    try {
      const fileType = getFileType(selectedFile.name);
      let endpoint = '/api/ingest/flex/trades';

      switch (fileType) {
        case 'trades':
          endpoint = '/api/ingest/flex/trades';
          break;
        case 'positions':
          endpoint = '/api/ingest/flex/positions';
          break;
        case 'mtm':
          endpoint = '/api/ingest/flex/mtm';
          break;
        case 'nav':
          endpoint = '/api/ingest/flex/nav';
          break;
        default:
          setResult({
            success: false,
            error: 'Unknown file type. Please name your file with "trades", "positions", "mtm", or "nav" in the filename.',
          });
          setUploading(false);
          return;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <DashboardShell
      activeNav="admin-ingestion"
      title="Flex File Ingestion"
      subtitle="Upload and process IBKR Flex Query CSV files"
    >
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Upload Flex Report</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="file" className="block text-sm font-medium mb-2">
              Select CSV file
            </label>
            <input
              type="file"
              id="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={uploading}
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
            <p className="font-semibold mb-2">File naming:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Trades: filename should contain &quot;trade&quot;</li>
              <li>Positions: filename should contain &quot;position&quot;</li>
              <li>MTM: filename should contain &quot;mtm&quot; or &quot;mark&quot;</li>
              <li>NAV: filename should contain &quot;nav&quot;, &quot;account&quot;, or &quot;equity&quot;</li>
            </ul>
            <p className="mt-2">
              Date extraction: Files named like &quot;flex_trades_20240115.csv&quot; will automatically extract the date.
            </p>
          </div>

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload and Ingest'}
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`rounded-lg shadow p-6 ${
            result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}
        >
          <h2
            className={`text-xl font-semibold mb-4 ${
              result.success ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {result.success ? 'Ingestion Successful' : 'Ingestion Failed'}
          </h2>

          {result.error && (
            <div className="mb-4 text-red-700">
              <p className="font-semibold">Error:</p>
              <p>{result.error}</p>
              {result.message && <p className="mt-1 text-sm">{result.message}</p>}
            </div>
          )}

          {result.summary && (
            <div className="space-y-2 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold">Total Rows:</span>{' '}
                  {result.summary.totalRows}
                </div>
                <div>
                  <span className="font-semibold">Valid Rows:</span>{' '}
                  {result.summary.validRows}
                </div>
                <div>
                  <span className="font-semibold">Inserted:</span>{' '}
                  {result.summary.inserted}
                </div>
                {result.summary.skipped !== undefined && (
                  <div>
                    <span className="font-semibold">Skipped (duplicates):</span>{' '}
                    {result.summary.skipped}
                  </div>
                )}
                {result.summary.updated !== undefined && (
                  <div>
                    <span className="font-semibold">Updated:</span>{' '}
                    {result.summary.updated}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Validation Errors:</span>{' '}
                  {result.summary.validationErrors}
                </div>
                <div>
                  <span className="font-semibold">Insert Errors:</span>{' '}
                  {result.summary.insertErrors}
                </div>
              </div>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold text-sm mb-2">Validation Errors:</p>
              <div className="max-h-48 overflow-y-auto text-xs">
                {result.errors.map((err, idx) => (
                  <div key={idx} className="mb-1 text-red-700">
                    Row {err.row}: {err.errors.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.insertErrors && result.insertErrors.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold text-sm mb-2">Insert Errors:</p>
              <div className="max-h-48 overflow-y-auto text-xs">
                {result.insertErrors.map((err, idx) => (
                  <div key={idx} className="mb-1 text-red-700">
                    Row {err.row}: {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

