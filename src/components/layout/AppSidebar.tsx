"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  Settings,
  Database,
  Users,
  FileText,
  Activity,
  TrendingUp,
  Target,
  Library,
  Sparkles,
  RefreshCw,
  Lightbulb,
  ScrollText,
  Calculator,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const ACTIVITY_NAV = [
  { href: "/triage", label: "Triage", icon: AlertTriangle, id: "triage" },
  { href: "/journal", label: "Journal", icon: ScrollText, id: "journal" },
] as const;

const ENTITIES_NAV = [
  { href: "/strategies", label: "Strategies", icon: FolderKanban, id: "strategies" },
  { href: "/asset-theses", label: "Asset Theses", icon: Target, id: "asset-theses" },
  { href: "/macro-theses", label: "Macro Theses", icon: TrendingUp, id: "macro-theses" },
  { href: "/claims", label: "Claims", icon: Lightbulb, id: "claims" },
  { href: "/research", label: "Research", icon: Library, id: "research" },
] as const;

const PORTFOLIO_NAV = [
  { href: "/dashboard/portfolio", label: "Portfolio", icon: LayoutDashboard, id: "portfolio" },
  { href: "/dashboard/accounting", label: "Accounting", icon: Calculator, id: "accounting" },
  { href: "/dashboard/accounting/reconciliation", label: "Reconciliation", icon: RefreshCw, id: "accounting-reconciliation" },
  { href: "/dashboard/accounting/transactions", label: "Transactions", icon: FileText, id: "accounting-transactions" },
] as const;

const ADMIN_NAV = [
  { href: "/admin/strategies", label: "Strategy Types", icon: FolderKanban, id: "admin-strategies" },
  // REMOVED: Playbook - deprecated, replaced by Signals system
  { href: "/admin/triage", label: "Triage Rules", icon: AlertTriangle, id: "admin-triage" },
  { href: "/admin/accounts", label: "Accounts", icon: Users, id: "admin-accounts" },
  { href: "/admin/ingestion/flex", label: "Ingestion", icon: Database, id: "admin-ingestion" },
  { href: "/admin/prompts", label: "AI Prompts", icon: Sparkles, id: "admin-prompts" },
  { href: "/admin/recompute", label: "Recompute", icon: Settings, id: "admin-recompute" },
  { href: "/admin/processes", label: "Processes", icon: Activity, id: "admin-processes" },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  
  const ALL_NAV = [...ACTIVITY_NAV, ...ENTITIES_NAV, ...PORTFOLIO_NAV];
  const activeNav = ALL_NAV.find(nav => pathname.startsWith(nav.href))?.id;
  const activeAdminNav = ADMIN_NAV.find(nav => pathname.startsWith(nav.href))?.id;

  return (
    <Sidebar>
      <SidebarContent>
        {[
          { label: "Activity", items: ACTIVITY_NAV },
          { label: "Entities", items: ENTITIES_NAV },
          { label: "Portfolio", items: PORTFOLIO_NAV },
        ].map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = activeNav === item.id;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN_NAV.map((item) => {
                const isActive = activeAdminNav === item.id;
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

