-- Thesis Triage Records
-- Part of Layer 3: Monitoring & Accountability
-- Spec: docs/features/thesis-synthesis-monitoring.md Section 3.4

CREATE TABLE thesis_triage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Thesis context
  thesis_id UUID NOT NULL,
  thesis_type TEXT NOT NULL CHECK (thesis_type IN ('macro', 'asset')),
  thesis_title TEXT NOT NULL,

  -- Trigger source
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled_monitoring', 'filing_alert', 'data_release', 'manual')),
  trigger_source TEXT NOT NULL,  -- e.g., "daily_news_scan", "sec_8k_alert"

  -- Aggregated content summary
  content_summary JSONB NOT NULL DEFAULT '{}',
  -- Structure: { totalItemsScanned, relevantItemsFound, sources[], dateRange: {from, to} }

  -- AI analysis results
  ai_analysis JSONB NOT NULL DEFAULT '{}',
  -- Structure: { assessmentId?, summary, validationPointsAffected[], keyFindings[], suggestedNextSteps[] }

  -- Raw matched results (for audit)
  matched_results JSONB NOT NULL DEFAULT '[]',
  -- Array of { url, title, snippet, date, queryType, matchScore, matchedKeywords }

  -- Triage classification
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  urgency TEXT NOT NULL CHECK (urgency IN ('immediate', 'today', 'this_week', 'when_convenient')),

  -- User action tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'actioned', 'dismissed')),
  user_notes TEXT,
  actions_taken JSONB DEFAULT '[]',
  -- Array of { timestamp, action, validationPointUpdates?: [] }

  -- Link to full assessment report
  assessment_report_path TEXT
);

-- Indexes
CREATE INDEX idx_thesis_triage_thesis ON thesis_triage_records(thesis_id, thesis_type);
CREATE INDEX idx_thesis_triage_status ON thesis_triage_records(status);
CREATE INDEX idx_thesis_triage_severity ON thesis_triage_records(severity, urgency);
CREATE INDEX idx_thesis_triage_created ON thesis_triage_records(created_at DESC);
