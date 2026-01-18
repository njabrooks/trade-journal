'use client';

import * as React from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { DashboardShell, type NavKey } from './DashboardShell';
import { cn } from '@/lib/utils';

interface EntityDetailLayoutProps {
  /** Page title displayed in header */
  title: string | React.ReactNode;
  /** Subtitle/breadcrumb area */
  subtitle?: string | React.ReactNode;
  /** Status badge to display next to title */
  statusBadge?: React.ReactNode;
  /** Tab navigation component */
  tabs?: React.ReactNode;
  /** Header actions (dropdown, buttons) */
  actions?: React.ReactNode;
  /** Main content area (tab content) */
  children: React.ReactNode;
  /** Sidebar content (EntitySidebar or custom) */
  sidebar?: React.ReactNode;
  /** Navigation key for sidebar highlighting */
  activeNav: NavKey;
  /** Optional footer content */
  footer?: React.ReactNode;
  /** Additional class for the content grid */
  className?: string;
}

/**
 * Unified two-column layout for entity detail pages.
 * Provides consistent structure with main content on left, sidebar on right.
 *
 * @example
 * ```tsx
 * <EntityDetailLayout
 *   title={thesis.title}
 *   subtitle="Macro Thesis Detail"
 *   statusBadge={<StatusBadge status={thesis.status} />}
 *   tabs={<EntityTabs tabs={tabs} />}
 *   sidebar={<EntitySidebar metadata={metadata} relatedEntities={related} />}
 *   actions={<EntityActions actions={actions} />}
 *   activeNav="macro-theses"
 * >
 *   <OverviewContent thesis={thesis} />
 * </EntityDetailLayout>
 * ```
 */
export function EntityDetailLayout({
  title,
  subtitle,
  statusBadge,
  tabs,
  actions,
  children,
  sidebar,
  activeNav,
  footer,
  className,
}: EntityDetailLayoutProps) {
  // Compose title with status badge if provided
  const composedTitle = statusBadge ? (
    <span className="inline-flex items-center gap-3">
      {title}
      {statusBadge}
    </span>
  ) : (
    title
  );

  return (
    <DashboardShell
      title={composedTitle}
      subtitle={subtitle}
      tabs={tabs}
      actions={actions}
      activeNav={activeNav}
      footer={footer}
    >
      <div
        className={cn(
          'grid gap-6',
          sidebar ? 'grid-cols-1 lg:grid-cols-[1fr_22rem]' : 'grid-cols-1',
          className
        )}
      >
        {/* Main content area */}
        <div className="space-y-6 min-w-0">{children}</div>

        {/* Sidebar (sticky on desktop) */}
        {sidebar}
      </div>
    </DashboardShell>
  );
}

/**
 * Section card component for consistent styling within entity detail pages.
 */
interface EntitySectionProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Use compact padding for dense content */
  compact?: boolean;
}

export function EntitySection({
  title,
  actions,
  children,
  className,
  compact = false,
}: EntitySectionProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-200 shadow-sm',
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 className="text-base font-semibold">{title}</h3>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Empty state component for sections with no content.
 */
interface EmptySectionStateProps {
  icon?: React.ReactNode;
  message: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptySectionState({
  icon,
  message,
  description,
  action,
}: EmptySectionStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-900">{message}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Collapsible section card component for content that can be expanded/collapsed.
 * Useful for long lists like signals or claims on evidence pages.
 */
interface CollapsibleEntitySectionProps {
  title: string;
  /** Count to display next to title */
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Use compact padding for dense content */
  compact?: boolean;
  /** Default open state */
  defaultOpen?: boolean;
}

export function CollapsibleEntitySection({
  title,
  count,
  actions,
  children,
  className,
  compact = false,
  defaultOpen = true,
}: CollapsibleEntitySectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'bg-white rounded-lg border border-slate-200 shadow-sm',
          className
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between',
            compact ? 'p-3' : 'p-4',
            open && 'border-b border-slate-100'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-left hover:text-slate-600 transition-colors"
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-400 transition-transform duration-200',
                  !open && '-rotate-90'
                )}
              />
              <h3 className="text-base font-semibold">
                {title}
                {count !== undefined && (
                  <span className="ml-1.5 text-sm font-normal text-slate-500">
                    ({count})
                  </span>
                )}
              </h3>
            </button>
          </Collapsible.Trigger>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        <Collapsible.Content>
          <div className={cn(compact ? 'p-3 pt-0' : 'p-4 pt-0', 'mt-3')}>
            {children}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}
