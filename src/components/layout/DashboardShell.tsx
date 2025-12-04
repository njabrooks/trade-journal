import { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PersistentHeader } from "./PersistentHeader";

export type NavKey =
  | "portfolio"
  | "strategies"
  | "triage"
  | "blotter"
  | "admin-strategies"
  | "admin-playbook"
  | "admin-triage"
  | "admin-accounts"
  | "admin-ingestion"
  | "admin-recompute";

interface DashboardShellProps {
  title: string;
  subtitle?: string;
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
      <SidebarInset className="pt-7">
        <div className="flex shrink-0 items-center gap-4 border-b bg-white px-6 py-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {tabs && <div className="flex items-center">{tabs}</div>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        <main className="flex flex-1 flex-col gap-4 p-4">
          {children}
        </main>
        {footer && <footer className="border-t p-4">{footer}</footer>}
      </SidebarInset>
    </SidebarProvider>
  );
}
