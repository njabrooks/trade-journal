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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Clock,
  Check,
  CheckCircle2,
  Link2,
  ArrowRightLeft,
  Sparkles,
  Activity,
  Eye,
  Calendar,
  Search,
  RefreshCw,
  ListChecks,
  X,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { UnifiedTriageRecord } from '@/types/triage';
import { StrategyConfirmationDialog } from '@/components/strategies/StrategyConfirmationDialog';

// =============================================================================
// Types
// =============================================================================

type ActionType = 'TRADE' | 'MONITOR' | 'DISMISS' | 'UPDATE' | 'SKILL';

interface ActionConfig {
  type: ActionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  skillCommand?: string; // For thesis actions that run skills
}

interface TriggerConfig {
  primaryAction: ActionConfig;
  secondaryActions: ActionConfig[];
}

// =============================================================================
// Action Definitions
// =============================================================================

const ACTIONS: Record<string, ActionConfig> = {
  monitor: {
    type: 'MONITOR',
    label: 'Monitor',
    icon: Eye,
    description: 'Set a monitoring period to review later',
  },
  dismiss: {
    type: 'DISMISS',
    label: 'Dismiss',
    icon: X,
  },
  close: {
    type: 'DISMISS',
    label: 'Close',
    icon: CheckCircle2,
    description: 'Mark strategy as complete (no open positions)',
  },
  confirm: {
    type: 'UPDATE',
    label: 'Confirm',
    icon: Check,
    description: 'Confirm strategy with label, type, and direction',
  },
  link: {
    type: 'UPDATE',
    label: 'Link Thesis',
    icon: Link2,
    description: 'Link this strategy to an asset thesis',
  },
  trade: {
    type: 'TRADE',
    label: 'Trade',
    icon: ArrowRightLeft,
    description: 'Record trade metadata for this position change',
  },
  synthesize: {
    type: 'SKILL',
    label: 'Synthesize',
    icon: Sparkles,
    description: 'Generate thesis articulation from claims',
    skillCommand: '/synthesize-thesis',
  },
  assess: {
    type: 'SKILL',
    label: 'Assess',
    icon: Activity,
    description: 'Assess signal impact on thesis',
  },
  research: {
    type: 'SKILL',
    label: 'Research',
    icon: Search,
    description: 'Process research transcript',
    skillCommand: '/process-transcript',
  },
  update: {
    type: 'SKILL',
    label: 'Update',
    icon: RefreshCw,
    description: 'Update articulation with new claims',
    skillCommand: '/synthesize-thesis',
  },
  review: {
    type: 'SKILL',
    label: 'Review',
    icon: ListChecks,
    description: 'Review recommended signals',
  },
  monitorDte: {
    type: 'MONITOR',
    label: 'Monitor',
    icon: Calendar,
    description: 'Monitor DTE risk',
  },
  monitorRisk: {
    type: 'MONITOR',
    label: 'Monitor',
    icon: Clock,
    description: 'Monitor assignment risk',
  },
};

// =============================================================================
// Trigger → Action Mapping
// =============================================================================

const TRIGGER_CONFIG: Record<string, TriggerConfig> = {
  // Position-level triggers
  'ASSIGNMENT_RISK≤14_DTE': {
    primaryAction: ACTIONS.monitorRisk,
    secondaryActions: [ACTIONS.dismiss],
  },
  'ASSIGNMENT_RISK≤30_DTE': {
    primaryAction: ACTIONS.monitorRisk,
    secondaryActions: [ACTIONS.dismiss],
  },
  'ITM_SHORT': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
  'ITM_LONG': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
  'SIGMA_0.5_SHORT': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
  'SIGMA_0.5_LONG': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
  'SIGMA_1.0': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
  'REVIEW_DTE': {
    primaryAction: ACTIONS.monitorDte,
    secondaryActions: [ACTIONS.dismiss],
  },
  'REVIEW_SIZE': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
  'REVIEW_COMPLEXITY': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [],
  },

  // Strategy-level triggers
  'CONFIRM_STRATEGY': {
    primaryAction: ACTIONS.confirm,
    secondaryActions: [ACTIONS.close],
  },
  'LINK_STRATEGY_TO_THESIS': {
    primaryAction: ACTIONS.link,
    secondaryActions: [ACTIONS.dismiss],
  },
  'QUANTITY_CHANGE': {
    primaryAction: ACTIONS.trade,
    secondaryActions: [],
  },
  'TRADE_INGESTION': {
    primaryAction: ACTIONS.trade,
    secondaryActions: [],
  },

  // Thesis-level triggers
  'NEEDS_RESEARCH': {
    primaryAction: ACTIONS.research,
    secondaryActions: [ACTIONS.dismiss],
  },
  'PRODUCE_CORE_ARGUMENT': {
    primaryAction: ACTIONS.synthesize,
    secondaryActions: [ACTIONS.dismiss],
  },
  'UPDATE_CORE_ARGUMENT': {
    primaryAction: ACTIONS.update,
    secondaryActions: [ACTIONS.dismiss],
  },
  'SIGNAL_TRIGGERED': {
    primaryAction: ACTIONS.assess,
    secondaryActions: [ACTIONS.dismiss],
  },
  'REVIEW_RECOMMENDED_SIGNALS': {
    primaryAction: ACTIONS.review,
    secondaryActions: [ACTIONS.dismiss],
  },
  'REVIEW_CONTENT': {
    primaryAction: ACTIONS.monitor,
    secondaryActions: [ACTIONS.dismiss],
  },
};

// Default config for unknown triggers
const DEFAULT_CONFIG: TriggerConfig = {
  primaryAction: ACTIONS.monitor,
  secondaryActions: [ACTIONS.dismiss],
};

// =============================================================================
// Severity Colors
// =============================================================================

function getSeverityButtonStyles(severity: string | null): string {
  switch (severity) {
    case 'urgent':
      return 'bg-rose-100 text-rose-700 hover:bg-rose-200 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60 dark:border-rose-700';
    case 'attention':
      return 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 dark:border-amber-700';
    case 'monitor':
      return 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 dark:border-blue-700';
    case 'info':
    default:
      return 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:border-slate-600';
  }
}

// =============================================================================
// Component Props
// =============================================================================

interface TriageQuickActionProps {
  record: UnifiedTriageRecord;
  onActionComplete?: () => void;
  onExpand?: (initialAction?: string) => void; // Optional initial action to auto-start when expanded
  compact?: boolean; // If true, show only icon button without dropdown indicator
}

// Strategy data for confirmation dialog
interface StrategyData {
  id: string;
  strategyKey: string;
  underlyingTicker?: string | null;
  label?: string | null;
  status: string;
  isAuto?: boolean;
  strategyType?: string | null;
  direction?: string | null;
  assetThesisId?: string | null;
}

// =============================================================================
// Component
// =============================================================================

export function TriageQuickAction({
  record,
  onActionComplete,
  onExpand,
  compact = false,
}: TriageQuickActionProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showSynthesizeConfirm, setShowSynthesizeConfirm] = useState(false);
  const [strategyData, setStrategyData] = useState<StrategyData | null>(null);

  // Get action config for this trigger
  const config = TRIGGER_CONFIG[record.trigger] || DEFAULT_CONFIG;
  const { primaryAction, secondaryActions } = config;
  const PrimaryIcon = primaryAction.icon;

  // Filter out dismiss for info severity (unless explicitly allowed)
  const filteredSecondaryActions = secondaryActions.filter((action) => {
    if (action.type === 'DISMISS' && record.severity === 'info') {
      // Allow dismiss for LINK_STRATEGY_TO_THESIS even at info level
      return record.trigger === 'LINK_STRATEGY_TO_THESIS';
    }
    return true;
  });

  const hasSecondaryActions = filteredSecondaryActions.length > 0;

  // Handle primary action click
  const handlePrimaryAction = async () => {
    setIsLoading(true);

    try {
      switch (primaryAction.type) {
        case 'UPDATE':
          if (record.trigger === 'CONFIRM_STRATEGY' || record.trigger === 'LINK_STRATEGY_TO_THESIS') {
            // Load strategy data and open confirmation dialog
            if (record.strategyId) {
              const response = await fetch(`/api/strategies/${record.strategyId}`);
              if (response.ok) {
                const data = await response.json();
                // API returns strategy directly, not wrapped in { strategy: ... }
                setStrategyData(data);
                setShowConfirmDialog(true);
              } else {
                console.error('Failed to load strategy data');
                onExpand?.(); // Fall back to expand
              }
            } else {
              onExpand?.();
            }
          } else {
            // Expand row for other update actions
            onExpand?.();
          }
          break;

        case 'TRADE':
          // For trade actions, expand with TRADE as initial action to auto-start trade flow
          onExpand?.('TRADE');
          break;

        case 'MONITOR':
          // Show monitor duration dropdown instead of executing immediately
          setIsMonitorOpen(true);
          break;

        case 'SKILL':
          // Handle skill actions based on trigger
          if (record.trigger === 'PRODUCE_CORE_ARGUMENT' || record.trigger === 'UPDATE_CORE_ARGUMENT') {
            // Expand to show claims browser first, then confirm in expanded area
            onExpand?.();
          } else if (record.trigger === 'REVIEW_RECOMMENDED_SIGNALS' || record.trigger === 'REVIEW_DRAFT_SIGNALS') {
            // Expand to show signals for review
            onExpand?.();
          } else if (record.trigger === 'NEEDS_RESEARCH') {
            // Expand to show claims browser context
            onExpand?.();
          } else {
            // Default: expand for other skill actions
            onExpand?.();
          }
          break;

        default:
          onExpand?.();
      }
    } catch (error) {
      console.error('Error executing action:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute synthesize-thesis skill via API
  const executeSynthesizeSkill = async () => {
    const thesisId = record.objectId;
    const thesisType = record.thesisType;

    if (!thesisId || !thesisType) {
      toast.error('Missing thesis information');
      return;
    }

    // Show loading toast
    const toastId = toast.loading(
      `Running ${record.trigger === 'UPDATE_CORE_ARGUMENT' ? 'update' : 'synthesize'} skill...`,
      { description: 'This may take a few minutes' }
    );

    try {
      const response = await fetch('/api/skills/synthesize-thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thesisId, thesisType }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Skill completed successfully', {
          id: toastId,
          description: 'Articulation and signals have been created',
        });
        onActionComplete?.();
        router.refresh();
      } else {
        toast.error('Skill failed', {
          id: toastId,
          description: result.error || 'Unknown error occurred',
        });
      }
    } catch (error) {
      toast.error('Failed to run skill', {
        id: toastId,
        description: error instanceof Error ? error.message : 'Network error',
      });
    }
  };

  // Handle secondary action click
  const handleSecondaryAction = async (action: ActionConfig) => {
    setIsOpen(false);
    setIsLoading(true);

    try {
      if (action === ACTIONS.close) {
        await executeCloseStrategyAction();
      } else {
        switch (action.type) {
          case 'DISMISS':
            await executeDismissAction();
            break;

          case 'MONITOR':
            await executeMonitorAction();
            break;

          default:
            // For other actions, expand and let the expanded view handle it
            onExpand?.();
        }
      }
    } catch (error) {
      console.error('Error executing action:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Execute monitor action with specified duration
  const executeMonitorAction = async (days: number = 7) => {
    setIsLoading(true);
    setIsMonitorOpen(false);

    try {
      if (record.thesisTriageRecord) {
        // Thesis triage - set status to in_progress
        await fetch(`/api/thesis-triage/${record.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'in_progress' }),
        });
      } else {
        // Position/strategy triage - use bulk action endpoint
        await fetch('/api/triage/action/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            triageIds: [record.id],
            actionType: 'MONITOR',
            monitorDays: days,
          }),
        });
      }
      onActionComplete?.();
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  };

  // Execute dismiss action
  const executeDismissAction = async () => {
    if (record.thesisTriageRecord) {
      // Thesis triage - set status to 'done' with severity 'info'
      await fetch(`/api/thesis-triage/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', severity: 'info' }),
      });
    } else {
      // Position/strategy triage
      await fetch('/api/triage/action/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triageIds: [record.id],
          actionType: 'DISMISS',
        }),
      });
    }
    onActionComplete?.();
    router.refresh();
  };

  // Close strategy: set to 'complete' and dismiss triage record
  const executeCloseStrategyAction = async () => {
    if (!record.strategyId) {
      toast.error('No strategy ID found');
      return;
    }

    // Set strategy status to 'complete'
    const strategyResponse = await fetch(`/api/strategies/${record.strategyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'complete' }),
    });

    if (!strategyResponse.ok) {
      toast.error('Failed to close strategy');
      return;
    }

    // Dismiss the triage record
    await fetch('/api/triage/action/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        triageIds: [record.id],
        actionType: 'DISMISS',
      }),
    });

    toast.success('Strategy closed');
    onActionComplete?.();
    router.refresh();
  };

  // Handle confirmation dialog close
  const handleConfirmationClose = () => {
    setShowConfirmDialog(false);
    setStrategyData(null);
  };

  // Handle confirmation dialog success
  const handleConfirmationSuccess = () => {
    setShowConfirmDialog(false);
    setStrategyData(null);
    onActionComplete?.();
    router.refresh();
  };

  const buttonStyles = getSeverityButtonStyles(record.severity);

  // Compact mode: single icon button
  if (compact) {
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          onClick={handlePrimaryAction}
          disabled={isLoading}
          className={cn('h-7 w-7 p-0 border', buttonStyles)}
          title={`${primaryAction.label}: ${primaryAction.description}`}
        >
          <PrimaryIcon className="h-4 w-4" />
        </Button>

        {/* Strategy Confirmation Dialog */}
        {showConfirmDialog && strategyData && (
          <StrategyConfirmationDialog
            strategy={strategyData}
            isOpen={showConfirmDialog}
            onClose={handleConfirmationClose}
            onSuccess={handleConfirmationSuccess}
          />
        )}
      </>
    );
  }

  // Full mode: button with dropdown for secondary actions
  // Use fixed width for all primary buttons to ensure consistent alignment (based on widest label "Synthesize")
  const BUTTON_WIDTH = 'w-[100px]';

  return (
    <>
      <div className="flex items-center gap-0.5">
        {/* Primary Action Button - with duration dropdown for MONITOR actions */}
        {primaryAction.type === 'MONITOR' ? (
          <DropdownMenu open={isMonitorOpen} onOpenChange={setIsMonitorOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
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
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem onClick={() => executeMonitorAction(7)} className="cursor-pointer">
                <Clock className="h-4 w-4 mr-2" />
                7 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => executeMonitorAction(14)} className="cursor-pointer">
                <Clock className="h-4 w-4 mr-2" />
                14 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => executeMonitorAction(28)} className="cursor-pointer">
                <Clock className="h-4 w-4 mr-2" />
                28 days
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
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
        )}

        {/* Dropdown for secondary actions - uses MoreHorizontal to differentiate from row expand */}
        {hasSecondaryActions ? (
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
              {filteredSecondaryActions.map((action) => {
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
          // Placeholder space where secondary button would be (for visual alignment)
          <div className="w-6 h-7" />
        )}
      </div>

      {/* Strategy Confirmation Dialog */}
      {showConfirmDialog && strategyData && (
        <StrategyConfirmationDialog
          strategy={strategyData}
          isOpen={showConfirmDialog}
          onClose={handleConfirmationClose}
          onSuccess={handleConfirmationSuccess}
        />
      )}

      {/* Synthesize/Update Skill Confirmation Dialog */}
      <AlertDialog open={showSynthesizeConfirm} onOpenChange={setShowSynthesizeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {record.trigger === 'UPDATE_CORE_ARGUMENT' ? 'Update Articulation?' : 'Synthesize Thesis?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {record.trigger === 'UPDATE_CORE_ARGUMENT'
                ? 'This will update the thesis articulation and signals based on new claims. The AI skill will analyze the existing articulation alongside new evidence.'
                : 'This will generate a thesis articulation and signals from the accumulated claims. The AI skill may take a few minutes to complete.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowSynthesizeConfirm(false);
                await executeSynthesizeSkill();
              }}
            >
              {record.trigger === 'UPDATE_CORE_ARGUMENT' ? 'Update' : 'Synthesize'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =============================================================================
// Helper to get action config for external use
// =============================================================================

export function getTriageActionConfig(trigger: string): TriggerConfig {
  return TRIGGER_CONFIG[trigger] || DEFAULT_CONFIG;
}

export function getTriggerPrimaryAction(trigger: string): ActionConfig {
  const config = TRIGGER_CONFIG[trigger] || DEFAULT_CONFIG;
  return config.primaryAction;
}
