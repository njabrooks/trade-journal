'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCw, Trash2, RefreshCw } from 'lucide-react';

interface SyncStats {
  isRunning: boolean;
  filesWatched: number;
  lastSync?: string;
  errors: Array<{
    timestamp: string;
    filePath: string;
    error: string;
  }>;
  syncs: Array<{
    timestamp: string;
    filePath: string;
    action: 'created' | 'updated' | 'deleted';
    success: boolean;
  }>;
}

export function SyncDashboard() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/sync/watcher');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sync/watcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Action failed');
      }

      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading sync status...</p>
        </CardContent>
      </Card>
    );
  }

  const recentSyncs = stats.syncs.slice(-10).reverse();
  const recentErrors = stats.errors.slice(-10).reverse();

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Obsidian Sync Status</CardTitle>
              <CardDescription>
                Real-time bidirectional sync between Supabase and Obsidian
              </CardDescription>
            </div>
            <Badge variant={stats.isRunning ? 'default' : 'secondary'}>
              {stats.isRunning ? 'Running' : 'Stopped'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Files Watched</p>
              <p className="text-2xl font-bold">{stats.filesWatched}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Syncs</p>
              <p className="text-2xl font-bold">{stats.syncs.length}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Errors</p>
              <p className="text-2xl font-bold text-destructive">{stats.errors.length}</p>
            </div>
          </div>

          {stats.lastSync && (
            <div className="text-sm text-muted-foreground">
              Last sync: {new Date(stats.lastSync).toLocaleString()}
            </div>
          )}

          <div className="flex gap-2">
            {!stats.isRunning ? (
              <Button
                onClick={() => handleAction('start')}
                disabled={loading}
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Watcher
              </Button>
            ) : (
              <Button
                onClick={() => handleAction('stop')}
                disabled={loading}
                variant="secondary"
                size="sm"
              >
                <Pause className="h-4 w-4 mr-2" />
                Stop Watcher
              </Button>
            )}

            <Button
              onClick={() => handleAction('restart')}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RotateCw className="h-4 w-4 mr-2" />
              Restart
            </Button>

            <Button
              onClick={() => handleAction('clear-stats')}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Stats
            </Button>

            <Button
              onClick={fetchStats}
              disabled={loading}
              variant="ghost"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Syncs */}
      {recentSyncs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Syncs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentSyncs.map((sync, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {sync.filePath.split('/').pop()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sync.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sync.success ? 'default' : 'destructive'}>
                      {sync.action}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Errors */}
      {recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Recent Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentErrors.map((error, index) => (
                <div
                  key={index}
                  className="p-3 rounded-md bg-destructive/10 border border-destructive/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {error.filePath.split('/').pop()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {error.error}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(error.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
