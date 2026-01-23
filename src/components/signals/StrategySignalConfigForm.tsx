'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, AlertTriangle, TrendingUp, TrendingDown, Copy, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Get webhook URL from environment or use default
const WEBHOOK_URL = process.env.NEXT_PUBLIC_TV_WEBHOOK_URL || 'https://your-project.supabase.co/functions/v1/tv-webhook';

// Standard TradingView payload template
const TV_PAYLOAD_TEMPLATE = `{
  "ticker": "{{ticker}}",
  "exchange": "{{exchange}}",
  "alertName": "{{alertname}}",
  "price": {{close}},
  "time": "{{timenow}}",
  "interval": "{{interval}}"
}`;

// Condition type definitions
const CONDITION_TYPES = {
  // Price conditions (via TradingView webhook)
  price_above: { label: 'Price above', icon: TrendingUp, category: 'price', unit: '$' },
  price_below: { label: 'Price below', icon: TrendingDown, category: 'price', unit: '$' },
  // Position metrics (computed during triage)
  dte_lte: { label: 'DTE less than or equal', icon: null, category: 'position', unit: 'days' },
  dte_gte: { label: 'DTE greater than or equal', icon: null, category: 'position', unit: 'days' },
  sigma_to_strike_lte: { label: 'Sigma to strike ≤', icon: null, category: 'position', unit: 'σ' },
  sigma_to_strike_gte: { label: 'Sigma to strike ≥', icon: null, category: 'position', unit: 'σ' },
  pnl_pct_gte: { label: 'PnL % ≥', icon: TrendingUp, category: 'position', unit: '%' },
  pnl_pct_lte: { label: 'PnL % ≤', icon: TrendingDown, category: 'position', unit: '%' },
  // Underlying metrics
  iv_rank_gte: { label: 'IV Rank ≥', icon: null, category: 'underlying', unit: '%' },
  iv_rank_lte: { label: 'IV Rank ≤', icon: null, category: 'underlying', unit: '%' },
} as const;

type ConditionType = keyof typeof CONDITION_TYPES;

// Signal type (maps to 'type' column in signals table)
const SIGNAL_TYPES = [
  { id: 'confirmation', label: 'Take Profit', description: 'Signal for profit-taking conditions', color: 'emerald' },
  { id: 'warning', label: 'Stop Loss / Risk', description: 'Signal for risk management conditions', color: 'amber' },
] as const;

// Signal importance
const IMPORTANCE_LEVELS = [
  { id: 'critical', label: 'Critical', description: 'Immediate action required' },
  { id: 'significant', label: 'Significant', description: 'Important but not urgent' },
  { id: 'supporting', label: 'Supporting', description: 'Nice to monitor' },
] as const;

export interface StrategyCondition {
  id: string;
  type: ConditionType;
  value: number;
  ticker?: string;
}

export interface StrategySignalConfig {
  logic: 'all' | 'any';
  conditions: StrategyCondition[];
  recommendedAction: string;
  actionNotes?: string;
  tvAlertName?: string; // Top-level TV alert name for webhook matching
}

// Signal data for editing
export interface EditingSignal {
  id: string;
  statement: string;
  type: 'confirmation' | 'warning';
  importance: 'critical' | 'significant' | 'supporting';
  status: string;
  notes?: string | null;
  explicitDetails: StrategySignalConfig | null;
}

interface StrategySignalConfigFormProps {
  strategyId: string;
  strategyKey: string;
  underlyingTicker?: string;
  isOpen: boolean;
  onClose: () => void;
  editingSignal?: EditingSignal | null;
  onSubmit: (data: {
    statement: string;
    type: 'confirmation' | 'warning';
    importance: 'critical' | 'significant' | 'supporting';
    notes?: string;
    explicitDetails: StrategySignalConfig;
  }) => Promise<void>;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function StrategySignalConfigForm({
  strategyId,
  strategyKey,
  underlyingTicker,
  isOpen,
  onClose,
  editingSignal,
  onSubmit,
}: StrategySignalConfigFormProps) {
  const isEditMode = !!editingSignal;

  // Signal metadata - initialize from editingSignal if present
  const [signalType, setSignalType] = useState<'confirmation' | 'warning'>(
    editingSignal?.type || 'confirmation'
  );
  const [importance, setImportance] = useState<'critical' | 'significant' | 'supporting'>(
    editingSignal?.importance || 'significant'
  );
  const [statement, setStatement] = useState(editingSignal?.statement || '');
  const [notes, setNotes] = useState(editingSignal?.notes || '');

  // Condition configuration - initialize from editingSignal if present
  const [logic, setLogic] = useState<'all' | 'any'>(
    editingSignal?.explicitDetails?.logic || 'any'
  );
  const [conditions, setConditions] = useState<StrategyCondition[]>(
    editingSignal?.explicitDetails?.conditions?.length
      ? editingSignal.explicitDetails.conditions.map(c => ({
          id: c.id || generateId(),
          type: c.type as ConditionType,
          value: c.value,
          ticker: c.ticker,
        }))
      : [{ id: generateId(), type: 'price_above', value: 0, ticker: underlyingTicker }]
  );

  // Action configuration - initialize from editingSignal if present
  const [recommendedAction, setRecommendedAction] = useState(
    editingSignal?.explicitDetails?.recommendedAction || ''
  );
  const [actionNotes, setActionNotes] = useState(
    editingSignal?.explicitDetails?.actionNotes || ''
  );

  // TradingView configuration - initialize from editingSignal if present
  const [tvAlertName, setTvAlertName] = useState(
    editingSignal?.explicitDetails?.tvAlertName || ''
  );
  const [showTvSetup, setShowTvSetup] = useState(!!editingSignal?.explicitDetails?.tvAlertName);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form state when editingSignal changes or form opens
  useEffect(() => {
    if (isOpen) {
      setSignalType(editingSignal?.type || 'confirmation');
      setImportance(editingSignal?.importance || 'significant');
      setStatement(editingSignal?.statement || '');
      setNotes(editingSignal?.notes || '');
      setLogic(editingSignal?.explicitDetails?.logic || 'any');
      setConditions(
        editingSignal?.explicitDetails?.conditions?.length
          ? editingSignal.explicitDetails.conditions.map(c => ({
              id: c.id || generateId(),
              type: c.type as ConditionType,
              value: c.value,
              ticker: c.ticker,
            }))
          : [{ id: generateId(), type: 'price_above', value: 0, ticker: underlyingTicker }]
      );
      setRecommendedAction(editingSignal?.explicitDetails?.recommendedAction || '');
      setActionNotes(editingSignal?.explicitDetails?.actionNotes || '');
      setTvAlertName(editingSignal?.explicitDetails?.tvAlertName || '');
      setShowTvSetup(!!editingSignal?.explicitDetails?.tvAlertName);
    }
  }, [isOpen, editingSignal, underlyingTicker]);

  // Check if any price conditions exist
  const hasPriceConditions = conditions.some(
    (c) => CONDITION_TYPES[c.type].category === 'price'
  );

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, type: 'url' | 'payload') => {
    await navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    }
  };

  const addCondition = () => {
    setConditions([
      ...conditions,
      { id: generateId(), type: 'dte_lte', value: 30, ticker: underlyingTicker },
    ]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((c) => c.id !== id));
    }
  };

  const updateCondition = (id: string, updates: Partial<StrategyCondition>) => {
    setConditions(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  // Build preview string
  const previewCondition = useMemo(() => {
    if (conditions.length === 0) return null;

    const conditionStrings = conditions
      .filter((c) => c.value !== undefined)
      .map((c) => {
        const config = CONDITION_TYPES[c.type];
        const tickerPrefix = config.category === 'price' && c.ticker ? `${c.ticker} ` : '';
        return `${tickerPrefix}${config.label} ${c.value}${config.unit}`;
      });

    if (conditionStrings.length === 0) return null;

    const connector = logic === 'all' ? ' AND ' : ' OR ';
    return conditionStrings.join(connector);
  }, [conditions, logic]);

  // Auto-generate statement from conditions
  const autoStatement = useMemo(() => {
    if (!previewCondition) return '';
    const prefix = signalType === 'confirmation' ? 'Take profit when' : 'Risk alert when';
    return `${prefix}: ${previewCondition}`;
  }, [previewCondition, signalType]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (conditions.length === 0) {
      alert('Please add at least one condition');
      return;
    }

    if (!recommendedAction.trim()) {
      alert('Please enter a recommended action');
      return;
    }

    // Require TV alert name if price conditions exist
    if (hasPriceConditions && !tvAlertName.trim()) {
      alert('Please enter a TradingView Alert Name for price-based conditions');
      setShowTvSetup(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const finalStatement = statement.trim() || autoStatement;

      await onSubmit({
        statement: finalStatement,
        type: signalType,
        importance,
        notes: notes.trim() || undefined,
        explicitDetails: {
          logic,
          conditions: conditions.map((c) => ({
            id: c.id,
            type: c.type,
            value: c.value,
            ticker: c.ticker,
          })),
          recommendedAction: recommendedAction.trim(),
          actionNotes: actionNotes.trim() || undefined,
          tvAlertName: tvAlertName.trim() || undefined,
        },
      });
      onClose();
    } catch (error) {
      console.error('Error saving signal:', error);
      alert('Failed to save signal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isEditMode ? 'Edit Signal' : 'Configure Strategy Signal'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {strategyKey} {underlyingTicker ? `(${underlyingTicker})` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Signal Type Selection */}
          <div className="space-y-2">
            <Label>Signal Type *</Label>
            <div className="grid grid-cols-2 gap-3">
              {SIGNAL_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSignalType(type.id)}
                  className={`px-4 py-3 rounded-lg border-2 transition-colors text-left ${
                    signalType === type.id
                      ? type.color === 'emerald'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100'
                      : 'border bg-card text-foreground hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium">{type.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{type.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Importance */}
          <div className="space-y-2">
            <Label>Importance *</Label>
            <div className="flex gap-2">
              {IMPORTANCE_LEVELS.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => setImportance(level.id)}
                  className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                    importance === level.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                      : 'border bg-card text-foreground hover:border-muted-foreground'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Trigger Conditions *</Label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Match</span>
                <select
                  value={logic}
                  onChange={(e) => setLogic(e.target.value as 'all' | 'any')}
                  className="border border-border bg-background text-foreground rounded px-2 py-1 text-sm"
                >
                  <option value="any">ANY (OR)</option>
                  <option value="all">ALL (AND)</option>
                </select>
                <span className="text-muted-foreground">conditions</span>
              </div>
            </div>

            <div className="space-y-2">
              {conditions.map((condition, index) => {
                const conditionConfig = CONDITION_TYPES[condition.type];
                const isPriceCondition = conditionConfig.category === 'price';

                return (
                  <div
                    key={condition.id}
                    className="flex items-center gap-2 p-3 bg-muted rounded-lg border border-border"
                  >
                    {index > 0 && (
                      <span className="text-xs font-medium text-muted-foreground w-10 text-center">
                        {logic === 'all' ? 'AND' : 'OR'}
                      </span>
                    )}
                    {index === 0 && <span className="w-10" />}

                    <select
                      value={condition.type}
                      onChange={(e) =>
                        updateCondition(condition.id, { type: e.target.value as ConditionType })
                      }
                      className="border border-border bg-background text-foreground rounded px-2 py-1.5 text-sm flex-1"
                    >
                      <optgroup label="Price Conditions (TradingView)">
                        {Object.entries(CONDITION_TYPES)
                          .filter(([, config]) => config.category === 'price')
                          .map(([key, config]) => (
                            <option key={key} value={key}>
                              {config.label}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Position Metrics">
                        {Object.entries(CONDITION_TYPES)
                          .filter(([, config]) => config.category === 'position')
                          .map(([key, config]) => (
                            <option key={key} value={key}>
                              {config.label}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Underlying Metrics">
                        {Object.entries(CONDITION_TYPES)
                          .filter(([, config]) => config.category === 'underlying')
                          .map(([key, config]) => (
                            <option key={key} value={key}>
                              {config.label}
                            </option>
                          ))}
                      </optgroup>
                    </select>

                    {isPriceCondition && (
                      <Input
                        value={condition.ticker || ''}
                        onChange={(e) =>
                          updateCondition(condition.id, { ticker: e.target.value.toUpperCase() })
                        }
                        placeholder="Ticker"
                        className="w-20 uppercase"
                      />
                    )}

                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="any"
                        value={condition.value || ''}
                        onChange={(e) =>
                          updateCondition(condition.id, { value: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="Value"
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground w-8">{conditionConfig.unit}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeCondition(condition.id)}
                      disabled={conditions.length === 1}
                      className="text-muted-foreground hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addCondition}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-4 h-4" />
              Add condition
            </button>
          </div>

          {/* Recommended Action */}
          <div className="space-y-2">
            <Label htmlFor="recommendedAction">Recommended Action *</Label>
            <Input
              id="recommendedAction"
              value={recommendedAction}
              onChange={(e) => setRecommendedAction(e.target.value)}
              placeholder="e.g., Close position for profit, Roll to next expiry, Cut losses"
            />
          </div>

          {/* Action Notes */}
          <div className="space-y-2">
            <Label htmlFor="actionNotes">Action Notes (Optional)</Label>
            <Textarea
              id="actionNotes"
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Additional context or instructions when this signal triggers..."
              rows={2}
            />
          </div>

          {/* Statement Override */}
          <div className="space-y-2">
            <Label htmlFor="statement">
              Signal Statement <span className="text-muted-foreground font-normal">(auto-generated if blank)</span>
            </Label>
            <Input
              id="statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder={autoStatement || 'Enter a custom statement...'}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for your reference..."
              rows={2}
            />
          </div>

          {/* Preview */}
          {previewCondition && (
            <div className="bg-muted rounded-lg p-4 border border-border">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Trigger Preview
              </Label>
              <p className="mt-2 text-sm font-medium text-foreground">
                When {logic === 'all' ? 'ALL' : 'ANY'} of these conditions are met:
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{previewCondition}</p>
              {recommendedAction && (
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Action:</span>{' '}
                  <span className="font-medium text-foreground">{recommendedAction}</span>
                </p>
              )}
            </div>
          )}

          {/* TradingView Integration Section */}
          {hasPriceConditions && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTvSetup(!showTvSetup)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  <span className="font-medium text-blue-900 dark:text-blue-100">TradingView Integration</span>
                  <span className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">Required for price alerts</span>
                </div>
                {showTvSetup ? (
                  <ChevronUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                )}
              </button>

              {showTvSetup && (
                <div className="px-4 pb-4 space-y-4">
                  {/* TV Alert Name Input */}
                  <div className="space-y-2">
                    <Label htmlFor="tvAlertName" className="text-blue-900 dark:text-blue-100">
                      TradingView Alert Name *
                    </Label>
                    <Input
                      id="tvAlertName"
                      value={tvAlertName}
                      onChange={(e) => setTvAlertName(e.target.value)}
                      placeholder="e.g., AAPL-TP-200"
                      className="bg-background"
                    />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Enter the exact alert name you&apos;ll use in TradingView. This is used to match incoming webhooks.
                    </p>
                  </div>

                  {/* Setup Instructions */}
                  <div className="bg-card rounded-lg p-4 space-y-4">
                    <h4 className="font-medium text-foreground text-sm">Setup Instructions</h4>

                    {/* Step 1: Webhook URL */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium">1</span>
                        <span className="text-sm font-medium text-foreground">Copy Webhook URL</span>
                      </div>
                      <div className="flex items-center gap-2 ml-7">
                        <code className="flex-1 text-xs bg-muted px-3 py-2 rounded border border-border font-mono overflow-x-auto text-foreground">
                          {WEBHOOK_URL}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(WEBHOOK_URL, 'url')}
                          className="flex-shrink-0"
                        >
                          {copiedUrl ? (
                            <><Check className="w-4 h-4 mr-1 text-green-600" /> Copied</>
                          ) : (
                            <><Copy className="w-4 h-4 mr-1" /> Copy</>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Step 2: Create Alert */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium">2</span>
                        <span className="text-sm font-medium text-foreground">Create TradingView Alert</span>
                      </div>
                      <ul className="ml-7 text-xs text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Open TradingView and create your price alert</li>
                        <li>Set the alert name to: <code className="bg-muted px-1 rounded">{tvAlertName || 'your-alert-name'}</code></li>
                        <li>Enable &quot;Webhook URL&quot; and paste the URL above</li>
                      </ul>
                    </div>

                    {/* Step 3: Set Message */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-medium">3</span>
                        <span className="text-sm font-medium text-foreground">Set Alert Message (JSON Payload)</span>
                      </div>
                      <div className="ml-7 space-y-2">
                        <pre className="text-xs bg-muted px-3 py-2 rounded border border-border font-mono overflow-x-auto whitespace-pre text-foreground">
                          {TV_PAYLOAD_TEMPLATE}
                        </pre>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(TV_PAYLOAD_TEMPLATE, 'payload')}
                        >
                          {copiedPayload ? (
                            <><Check className="w-4 h-4 mr-1 text-green-600" /> Copied</>
                          ) : (
                            <><Copy className="w-4 h-4 mr-1" /> Copy Template</>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Help Link */}
                    <div className="pt-2 border-t border-border">
                      <a
                        href="https://www.tradingview.com/support/solutions/43000529348-about-webhooks/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        TradingView Webhooks Documentation
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditMode ? 'Update Signal' : 'Create Signal'}
          </Button>
        </div>
      </div>
    </div>
  );
}
