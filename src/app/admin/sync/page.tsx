import { SyncDashboard } from '@/components/sync/SyncDashboard';

export default function SyncPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Obsidian Sync</h1>
        <p className="text-muted-foreground mt-2">
          Monitor and control bidirectional sync between Supabase and your Obsidian vault
        </p>
      </div>

      <SyncDashboard />
    </div>
  );
}
