'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Check,
  Pencil,
  Link2,
  CheckCircle2,
  RotateCcw,
  MoreHorizontal,
  Loader2,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StrategyListItem } from '@/db/queries/strategies';
import { StrategyConfirmationDialog } from '@/components/strategies/StrategyConfirmationDialog';

// =============================================================================
// Types
// =============================================================================

type StrategyActionType = 'CONFIRM' | 'EDIT' | 'LINK_THESIS' | 'CLOSE' | 'REOPEN' | 'REJECT';

interface StrategyActionConfig {
  type: StrategyActionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface StatusConfig {
  primaryAction: StrategyActionConfig;
  secondaryActions: StrategyActionConfig[];
}

// =============================================================================
// Action Definitions
// =============================================================================

const ACTIONS: Record<string, StrategyActionConfig> = {
  confirm: {
    type: 'CONFIRM',
    label: 'Confirm',
    icon: Check,
    description: 'Set label, type, direction and optionally link thesis',
  },
  edit: {
    type: 'EDIT',
    label: 'Edit',
    icon: Pencil,
    description: 'Edit strategy metadata and thesis link',
  },
  linkThesis: {
    type: 'LINK_THESIS',
    label: 'Link Thesis',
    icon: Link2,
    description: 'Link this strategy to an asset thesis',
  },
  close: {
    type: 'CLOSE',
    label: 'Close',
    icon: CheckCircle2,
    description: 'Mark strategy as complete',
  },
  reopen: {
    type: 'REOPEN',
    label: 'Reopen',
    icon: RotateCcw,
    description: 'Reopen a closed strategy',
  },
  reject: {
    type: 'REJECT',
    label: 'Reject',
    icon: Ban,
    description: 'Mark as spam, airdrop, or no economic value',
  },
};

// =============================================================================
// Status → Action Mapping
// =============================================================================

type StatusKey = 'draft' | 'active_no_thesis' | 'active_has_thesis' | 'complete_force_closed' | 'complete_natural' | 'rejected';

const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
  draft: {
    primaryAction: ACTIONS.confirm,
    secondaryActions: [ACTIONS.close, ACTIONS.reject],
  },
  active_no_thesis: {
    primaryAction: ACTIONS.linkThesis,
    secondaryActions: [ACTIONS.edit, ACTIONS.close, ACTIONS.reject],
  },
  active_has_thesis: {
    primaryAction: ACTIONS.edit,
    secondaryActions: [ACTIONS.close, ACTIONS.reject],
  },
  complete_force_closed: {
    primaryAction: ACTIONS.reopen,
    secondaryActions: [ACTIONS.edit],
  },
  complete_natural: {
    primaryAction: ACTIONS.edit,
    secondaryActions: [],
  },
  rejected: {
    primaryAction: ACTIONS.edit,
    secondaryActions: [],
  },
};

function getStatusKey(strategy: StrategyListItem): StatusKey {
  if (strategy.status === 'draft') return 'draft';
  if (strategy.status === 'active') {
    return strategy.assetThesisId ? 'active_has_thesis' : 'active_no_thesis';
  }
  if (strategy.status === 'complete') {
    return strategy.closedAt ? 'complete_force_closed' : 'complete_natural';
  }
  return 'rejected';
}

// =============================================================================
// Button Styling (status-based, matching existing badge colors)
// =============================================================================

function getStatusButtonStyles(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-muted text-muted-foreground hover:bg-accent border-border';
    case 'active':
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/20';
    case 'complete':
      return 'bg-muted text-muted-foreground hover:bg-accent border-border';
    case 'rejected':
    default:
      return 'bg-muted text-muted-foreground hover:bg-accent border-border';
  }
}

// =============================================================================
// Strategy data for confirmation dialog (fetched on-demand)
// =============================================================================

interface StrategyData {
  id: string;
  strategyKey: string;
  underlyingTicker?: string | null;
  underlyingId?: string | null;
  parentUnderlyingId?: string | null;
  parentUnderlyingTicker?: string | null;
  label?: string | null;
  status: string;
  isAuto?: boolean;
  strategyType?: string | null;
  direction?: string | null;
  assetThesisId?: string | null;
  closedAt?: Date | string | null;
}

// =============================================================================
// Component
// =============================================================================

interface StrategyQuickActionProps {
  strategy: StrategyListItem;
  onActionComplete?: () => void;
}

export function StrategyQuickAction({
  strategy,
  onActionComplete,
}: StrategyQuickActionProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [strategyData, setStrategyData] = useState<StrategyData | null>(null);

  // Resolve config from strategy state
  const statusKey = getStatusKey(strategy);
  const config = STATUS_CONFIG[statusKey];
  const { primaryAction, secondaryActions } = config;
  const PrimaryIcon = primaryAction.icon;
  const hasSecondaryActions = secondaryActions.length > 0;

  // Ghost variant for naturally completed and rejected strategies
  const isSubtle = statusKey === 'complete_natural' || statusKey === 'rejected';
  const buttonStyles = isSubtle
    ? 'bg-transparent text-muted-foreground hover:bg-muted border-border'
    : getStatusButtonStyles(strategy.status);

  // Fetch full strategy data and open dialog
  const fetchAndOpenDialog = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/strategies/${strategy.id}`);
      if (response.ok) {
        const data = await response.json();
        setStrategyData({
          id: data.id,
          strategyKey: data.strategyKey,
          underlyingTicker: data.underlyingTicker,
          underlyingId: data.underlyingId,
          parentUnderlyingId: data.parentUnderlyingId,
          parentUnderlyingTicker: data.parentUnderlyingTicker,
          label: data.autoDerivedLabel || data.label,
          status: data.status,
          isAuto: data.isAuto,
          strategyType: data.strategyType,
          direction: data.direction,
          assetThesisId: data.assetThesisId,
          closedAt: data.closedAt,
        });
        setShowConfirmDialog(true);
      }
    } catch (error) {
      console.error('Failed to load strategy data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // All actions open the dialog (which now handles everything)
  const handlePrimaryAction = async () => {
    await fetchAndOpenDialog();
  };

  const handleSecondaryAction = async (_action: StrategyActionConfig) => {
    setIsDropdownOpen(false);
    await fetchAndOpenDialog();
  };

  const handleDialogClose = () => {
    setShowConfirmDialog(false);
    setStrategyData(null);
  };

  const handleDialogSuccess = () => {
    setShowConfirmDialog(false);
    setStrategyData(null);
    onActionComplete?.();
    router.refresh();
  };

  // Fixed width for button consistency (matches TriageQuickAction pattern)
  const BUTTON_WIDTH = 'w-[100px]';

  return (
    <>
      <div className="flex items-center gap-0.5">
        {/* Primary Action Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handlePrimaryAction}
          disabled={isLoading}
          className={cn(
            'h-7 px-2 border gap-1.5 justify-center',
            BUTTON_WIDTH,
            hasSecondaryActions ? 'border-r-0 rounded-r-none' : 'rounded',
            buttonStyles
          )}
          title={primaryAction.description}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PrimaryIcon className="h-3.5 w-3.5" />
          )}
          <span className="text-xs font-medium">{primaryAction.label}</span>
        </Button>

        {/* Dropdown for secondary actions */}
        {hasSecondaryActions ? (
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={isLoading}
                className={cn(
                  'h-7 w-6 p-0 border rounded-l-none',
                  buttonStyles
                )}
                title="More actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {secondaryActions.map((action) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={() => handleSecondaryAction(action)}
                    className="gap-2 cursor-pointer"
                  >
                    <Icon className="h-4 w-4" />
                    <div className="flex-1">
                      <div className="font-medium">{action.label}</div>
                      {action.description && (
                        <div className="text-xs text-muted-foreground">
                          {action.description}
                        </div>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          // Placeholder for visual alignment
          <div className="w-6 h-7" />
        )}
      </div>

      {/* Strategy Confirmation Dialog */}
      {showConfirmDialog && strategyData && (
        <StrategyConfirmationDialog
          strategy={strategyData}
          isOpen={showConfirmDialog}
          onClose={handleDialogClose}
          onSuccess={handleDialogSuccess}
        />
      )}
    </>
  );
}
