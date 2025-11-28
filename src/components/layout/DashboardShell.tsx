import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/dashboard/portfolio", label: "Portfolio", id: "portfolio" },
  { href: "/strategies", label: "Strategies", id: "strategies" },
  { href: "/triage", label: "Triage", id: "triage" },
  { href: "/blotter", label: "Blotter", id: "blotter" },
];

const ADMIN_LINKS = [
  { href: "/admin/strategies", label: "Strategies", id: "admin-strategies" },
  { href: "/admin/playbook", label: "Playbook", id: "admin-playbook" },
  { href: "/admin/triage", label: "Triage Rules", id: "admin-triage" },
  { href: "/admin/accounts", label: "Accounts", id: "admin-accounts" },
  { href: "/admin/ingestion/flex", label: "Ingestion", id: "admin-ingestion" },
  { href: "/admin/recompute", label: "Recompute", id: "admin-recompute" },
];

export type NavKey = (typeof NAV_LINKS)[number]["id"] | (typeof ADMIN_LINKS)[number]["id"];

interface DashboardShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  activeNav: NavKey;
}

export function DashboardShell({
  title,
  subtitle,
  actions,
  children,
  footer,
  activeNav,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-5">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Trade Journal
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        <nav className="border-t">
          <div className="mx-auto flex max-w-6xl overflow-x-auto px-4">
            <div className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative px-4 py-3 text-sm font-medium text-slate-500 transition-colors",
                    activeNav === link.id ? "text-slate-900" : "hover:text-slate-800"
                  )}
                >
                  {link.label}
                  {activeNav === link.id ? (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-slate-900" />
                  ) : null}
                </Link>
              ))}
              <div className="mx-2 h-6 w-px bg-slate-300" />
              <span className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Admin
              </span>
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "relative px-4 py-3 text-sm font-medium text-slate-500 transition-colors",
                    activeNav === link.id ? "text-slate-900" : "hover:text-slate-800"
                  )}
                >
                  {link.label}
                  {activeNav === link.id ? (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-slate-900" />
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">{children}</main>
      {footer ? <footer className="mx-auto max-w-6xl px-6 pb-12">{footer}</footer> : null}
    </div>
  );
}

