'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface EntityAction {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface EntityActionsProps {
  /** Array of actions to display in dropdown */
  actions: EntityAction[];
  /** Optional: Render as individual buttons instead of dropdown (for 1-2 actions) */
  inline?: boolean;
  /** Custom trigger button label */
  triggerLabel?: string;
  className?: string;
}

/**
 * Standardized actions dropdown for entity detail pages.
 * Consolidates Edit, Synthesize, Link, and other actions into a single menu.
 *
 * @example
 * ```tsx
 * <EntityActions
 *   actions={[
 *     { label: 'Edit', icon: <PencilIcon />, onClick: () => setEditing(true) },
 *     { label: 'Synthesize', icon: <SparklesIcon />, onClick: handleSynthesize },
 *     { label: 'Link Asset Thesis', icon: <LinkIcon />, onClick: openLinkDialog },
 *   ]}
 * />
 * ```
 */
export function EntityActions({
  actions,
  inline = false,
  triggerLabel = 'Actions',
  className,
}: EntityActionsProps) {
  // If inline mode or only 1-2 actions, render as buttons
  if (inline || actions.length <= 2) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        {actions.map((action, index) => (
          <ActionButton key={index} action={action} />
        ))}
      </div>
    );
  }

  // Otherwise render as dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          {triggerLabel}
          <ChevronDownIcon className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {actions.map((action, index) => (
          <React.Fragment key={index}>
            {action.variant === 'destructive' && index > 0 && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem
              onClick={action.onClick}
              disabled={action.disabled}
              className={
                action.variant === 'destructive'
                  ? 'text-destructive focus:text-destructive'
                  : undefined
              }
            >
              {action.icon && (
                <span className="mr-2 h-4 w-4">{action.icon}</span>
              )}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionButton({ action }: { action: EntityAction }) {
  return (
    <Button
      variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
      size="sm"
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.icon && <span className="mr-1.5 h-4 w-4">{action.icon}</span>}
      {action.label}
    </Button>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
