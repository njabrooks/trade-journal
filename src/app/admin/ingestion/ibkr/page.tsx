'use client';

import { DashboardShell } from '@/components/layout/DashboardShell';
import { IngestionTabs } from '@/components/layout/IngestionTabs';
import { DataSyncBanner } from '@/components/ibkr/DataSyncBanner';

export default function IbkrIngestionPage() {
  return (
    <DashboardShell
      activeNav="admin-ingestion"
      title="IBKR Gateway Data Sync"
      subtitle="Sync spot prices and IV data from IBKR Client Portal Gateway"
      tabs={<IngestionTabs />}
    >
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">IBKR Gateway Connection</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Connect to your local IBKR Gateway to sync spot prices and IV data. The gateway must be running
          and authenticated at <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">https://localhost:5001</code>.
        </p>
        <DataSyncBanner />
      </div>
    </DashboardShell>
  );
}

