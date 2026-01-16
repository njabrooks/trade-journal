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

const MAIN_NAV = [
  { href: "/triage", label: "Triage", icon: AlertTriangle, id: "triage" },
  // REMOVED: Blotter - deprecated, replaced by Journal
  { href: "/journal", label: "Journal", icon: ScrollText, id: "journal" },
  { href: "/strategies", label: "Strategies", icon: FolderKanban, id: "strategies" },
  { href: "/asset-theses", label: "Asset Theses", icon: Target, id: "asset-theses" },
  { href: "/macro-theses", label: "Macro Theses", icon: TrendingUp, id: "macro-theses" },
  { href: "/claims", label: "Claims", icon: Lightbulb, id: "claims" },
  { href: "/research", label: "Research", icon: Library, id: "research" },
  { href: "/dashboard/portfolio", label: "Portfolio", icon: LayoutDashboard, id: "portfolio" },
] as const;

const ADMIN_NAV = [
  { href: "/admin/strategies", label: "Strategies", icon: FolderKanban, id: "admin-strategies" },
  { href: "/admin/playbook", label: "Playbook", icon: FileText, id: "admin-playbook" },
  { href: "/admin/triage", label: "Triage Rules", icon: AlertTriangle, id: "admin-triage" },
  { href: "/admin/accounts", label: "Accounts", icon: Users, id: "admin-accounts" },
  { href: "/admin/ingestion/flex", label: "Ingestion", icon: Database, id: "admin-ingestion" },
  { href: "/admin/prompts", label: "AI Prompts", icon: Sparkles, id: "admin-prompts" },
  { href: "/admin/recompute", label: "Recompute", icon: Settings, id: "admin-recompute" },
  { href: "/admin/processes", label: "Processes", icon: Activity, id: "admin-processes" },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  
  // Determine active nav
  const activeMainNav = MAIN_NAV.find(nav => pathname.startsWith(nav.href))?.id;
  const activeAdminNav = ADMIN_NAV.find(nav => pathname.startsWith(nav.href))?.id;

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MAIN_NAV.map((item) => {
                const isActive = activeMainNav === item.id;
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

