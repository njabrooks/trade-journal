"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  AlertTriangle,
  BookOpen,
  Settings,
  Database,
  Users,
  FileText,
  TrendingUp,
  Activity,
  BarChart3,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const MAIN_NAV = [
  { href: "/dashboard/portfolio", label: "Portfolio", icon: LayoutDashboard, id: "portfolio" },
  { href: "/strategies", label: "Strategies", icon: FolderKanban, id: "strategies" },
  { href: "/triage", label: "Triage", icon: AlertTriangle, id: "triage" },
  { href: "/blotter", label: "Blotter", icon: BookOpen, id: "blotter" },
] as const;

const ADMIN_NAV = [
  { href: "/admin/strategies", label: "Strategies", icon: FolderKanban, id: "admin-strategies" },
  { href: "/admin/playbook", label: "Playbook", icon: FileText, id: "admin-playbook" },
  { href: "/admin/triage", label: "Triage Rules", icon: AlertTriangle, id: "admin-triage" },
  { href: "/admin/accounts", label: "Accounts", icon: Users, id: "admin-accounts" },
  { href: "/admin/ingestion/flex", label: "Ingestion", icon: Database, id: "admin-ingestion" },
  { href: "/admin/recompute", label: "Recompute", icon: Settings, id: "admin-recompute" },
] as const;

const STRATEGY_SUB_NAV = [
  { href: (id: string) => `/strategies/${id}/performance`, label: "Performance", icon: TrendingUp },
  { href: (id: string) => `/strategies/${id}/triage`, label: "Triage", icon: Activity },
  { href: (id: string) => `/strategies/${id}/blotter`, label: "Blotter", icon: BarChart3 },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  
  // Extract strategy ID if we're on a strategy page
  const strategyMatch = pathname.match(/^\/strategies\/([^/]+)/);
  const strategyId = strategyMatch?.[1];
  const isStrategyPage = !!strategyId;
  
  // Determine active nav
  const activeMainNav = MAIN_NAV.find(nav => pathname.startsWith(nav.href))?.id;
  const activeAdminNav = ADMIN_NAV.find(nav => pathname.startsWith(nav.href))?.id;
  const activeStrategySubNav = isStrategyPage
    ? STRATEGY_SUB_NAV.find(nav => pathname === nav.href(strategyId))?.label
    : null;
  
  // Check if we're on any strategy page (list or detail)
  const isStrategiesSection = pathname.startsWith("/strategies");
  const isStrategiesExpanded = isStrategyPage;

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
                
                // If this is Strategies, make it collapsible
                if (item.id === "strategies") {
                  return (
                    <SidebarMenuItem key={item.id}>
                      <Collapsible defaultOpen={isStrategiesExpanded}>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton isActive={isActive || isStrategiesExpanded} tooltip={item.label}>
                            <Icon />
                            <span>{item.label}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {isStrategyPage ? (
                              // Show strategy sub-nav when on a strategy detail page
                              STRATEGY_SUB_NAV.map((subItem) => {
                                const SubIcon = subItem.icon;
                                const subHref = subItem.href(strategyId);
                                const isSubActive = activeStrategySubNav === subItem.label;
                                return (
                                  <SidebarMenuSubItem key={subItem.label}>
                                    <SidebarMenuSubButton asChild isActive={isSubActive}>
                                      <Link href={subHref}>
                                        <SubIcon />
                                        <span>{subItem.label}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })
                            ) : (
                              // Show link to strategies list when not on a detail page
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild isActive={pathname === "/strategies"}>
                                  <Link href="/strategies">
                                    <span>All Strategies</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    </SidebarMenuItem>
                  );
                }
                
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

