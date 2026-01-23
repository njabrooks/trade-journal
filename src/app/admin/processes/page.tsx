'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { DashboardShell } from '@/components/layout/DashboardShell';

interface Process {
  id: string;
  jobType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  trigger: string | null;
  accountId: string | null;
  startedAt: string;
  finishedAt: string | null;
  payload: any;
  result: any;
  error: string | null;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  trade_ingestion: 'Trade Ingestion',
  position_ingestion: 'Position Ingestion',
  recompute_all: 'Recompute All',
  recompute_portfolio: 'Recompute Portfolio',
  recompute_strategy_metrics: 'Recompute Strategy Metrics',
  recompute_triage: 'Recompute Triage',
  recompute_blotter: 'Recompute Blotter',
  recompute_blotter_trades: 'Recompute Blotter Trades',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  running: 'bg-blue-100 text-blue-800 border-blue-300',
  completed: 'bg-green-100 text-green-800 border-green-300',
  failed: 'bg-red-100 text-red-800 border-red-300',
};

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [hasActive, setHasActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchProcesses = async () => {
    try {
      const response = await fetch('/api/processes?limit=50');
      const data = await response.json();
      setProcesses(data.processes || []);
      setHasActive(data.hasActive || false);
    } catch (error) {
      console.error('Failed to fetch processes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchProcesses();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatDuration = (startedAt: string, finishedAt: string | null) => {
    const start = new Date(startedAt);
    const end = finishedAt ? new Date(finishedAt) : new Date();
    const ms = end.getTime() - start.getTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const activeProcesses = processes.filter(
    (p) => p.status === 'running' || p.status === 'pending'
  );
  const completedProcesses = processes.filter((p) => p.status === 'completed');
  const failedProcesses = processes.filter((p) => p.status === 'failed');

  return (
    <DashboardShell
      activeNav="admin-processes"
      title="Process Monitor"
      subtitle="Track ingestion and computation processes"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Pause Auto-Refresh' : 'Resume Auto-Refresh'}
            </Button>
            <Button variant="outline" onClick={fetchProcesses}>
              Refresh
            </Button>
          </div>
        </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Active Processes Alert */}
          {hasActive && activeProcesses.length > 0 && (
            <Card className="border-yellow-300 bg-yellow-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                  Active Processes ({activeProcesses.length})
                </CardTitle>
                <CardDescription>
                  Background processes are currently running. Avoid starting new operations until they complete.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeProcesses.map((process) => (
                    <div
                      key={process.id}
                      className="flex items-center justify-between p-2 bg-card rounded border"
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={STATUS_COLORS[process.status]}>
                          {process.status}
                        </Badge>
                        <span className="font-medium">
                          {JOB_TYPE_LABELS[process.jobType] || process.jobType}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Running for {formatDuration(process.startedAt, null)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{processes.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {activeProcesses.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {completedProcesses.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {failedProcesses.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Process List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Processes</CardTitle>
              <CardDescription>
                Latest 50 processes across all operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {processes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No processes found
                </div>
              ) : (
                <div className="space-y-2">
                  {processes.map((process) => (
                    <div
                      key={process.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <Badge className={STATUS_COLORS[process.status]}>
                              {process.status}
                            </Badge>
                            <span className="font-medium">
                              {JOB_TYPE_LABELS[process.jobType] || process.jobType}
                            </span>
                            {process.trigger && (
                              <Badge variant="outline" className="text-xs">
                                {process.trigger}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div>
                              Started: {formatDate(process.startedAt)}
                            </div>
                            {process.finishedAt && (
                              <div>
                                Finished: {formatDate(process.finishedAt)} (
                                {formatDuration(process.startedAt, process.finishedAt)})
                              </div>
                            )}
                            {!process.finishedAt && (
                              <div>
                                Duration: {formatDuration(process.startedAt, null)}
                              </div>
                            )}
                            {process.accountId && (
                              <div>Account: {process.accountId.slice(0, 8)}...</div>
                            )}
                          </div>
                          {process.error && (
                            <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                              <strong>Error:</strong> {process.error}
                            </div>
                          )}
                          {process.result && (
                            <details className="text-sm">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                View Results
                              </summary>
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                {JSON.stringify(process.result, null, 2)}
                              </pre>
                            </details>
                          )}
                          {process.payload && (
                            <details className="text-sm">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                View Payload
                              </summary>
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                {JSON.stringify(process.payload, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </DashboardShell>
  );
}
