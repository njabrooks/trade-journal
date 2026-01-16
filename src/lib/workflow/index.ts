/**
 * Workflow Module
 *
 * Contains journal logging utilities for tracking thesis and entity lifecycle events.
 * Workflow state tracking is handled by the triage system (thesisTriage.ts).
 */

export {
  logToJournal,
  logTriageToJournalWithDedup,
  resolveJournalEntry,
  dismissJournalEntry,
  type ThesisType,
} from './lifecycleDetection';
