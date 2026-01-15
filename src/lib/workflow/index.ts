/**
 * Workflow Module
 *
 * Contains lifecycle detection and workflow orchestration logic
 * for the triage system.
 */

export {
  detectLifecycleTransition,
  applyLifecycleTransition,
  processAllLifecycleTransitions,
  logToJournal,
  logTriageToJournalWithDedup,
  resolveJournalEntry,
  dismissJournalEntry,
  type LifecycleStatus,
  type ThesisType,
} from './lifecycleDetection';
