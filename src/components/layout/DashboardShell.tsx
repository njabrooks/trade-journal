import { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PersistentHeader } from "./PersistentHeader";

export type NavKey =
  | "portfolio"
  | "accounting"
  | "accounting-reconciliation"
  | "accounting-transactions"
  | "macro-theses"
  | "asset-theses"
  | "strategies"
  | "triage"
  | "signals"
  | "signals-data-sources"
  | "blotter"
  | "journal"
  | "news"
  | "research"
  | "claims"
  | "admin-strategies"
  // REMOVED: admin-playbook - deprecated, replaced by Signals system
  | "admin-triage"
  | "admin-accounts"
  | "admin-ingestion"
  | "admin-recompute"
  | "admin-processes"
  | "vol-curve";

interface DashboardShellProps {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  activeNav: NavKey;
}

export function DashboardShell({
  title,
  subtitle,
  actions,
  tabs,
  children,
  footer,
  activeNav,
}: DashboardShellProps) {
  return (
    <SidebarProvider>
      <PersistentHeader />
      <AppSidebar />
      <SidebarInset className="pt-7 min-w-0">
        <div className="flex shrink-0 items-center gap-4 border-b bg-card px-6 py-3 h-[4rem]">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight truncate">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {tabs && <div className="flex items-center h-9">{tabs}</div>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        <main className="flex flex-1 flex-col gap-4 p-4 min-w-0">
          {children}
        </main>
        {footer && <footer className="border-t p-4">{footer}</footer>}
      </SidebarInset>
    </SidebarProvider>
  );
}
