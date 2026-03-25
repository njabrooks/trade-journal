-- Add Hormuz Strait ship transit data source to the signal data source registry
-- and configure the Iran-Israel ceasefire invalidation signal

-- 1. Add registry entry
INSERT INTO signal_data_source_registry (
  key, name, description, category, measure_type, available_metrics,
  asset_scope, ingestion_method, ingestion_script, ingestion_schedule,
  config_template, config_example
) VALUES (
  'hormuz_strait',
  'Strait of Hormuz Ship Transits',
  'Ship transit counts and throughput data from hormuzstraitmonitor.com. Tracks daily vessel passages through the Strait of Hormuz as a proxy for geopolitical risk and energy supply disruption. Normal throughput ~60 ships/day.',
  'fundamental',
  'quantitative',
  '[{"metric": "ships_last_24h", "unit": "ships/day", "description": "Ships transiting in last 24 hours (rolling)"}, {"metric": "ships_current", "unit": "ships", "description": "Ships currently in transit"}, {"metric": "throughput_pct", "unit": "percent", "description": "DWT throughput as percent of normal"}, {"metric": "ships_pct_normal", "unit": "percent", "description": "Ship count as percent of normal daily"}]'::jsonb,
  'global',
  'automated_cron',
  'scripts/collect-signal-data.ts',
  'every 4 hours',
  '{"dataSource": "hormuz_strait", "metric": "{{METRIC}}", "threshold": "{{THRESHOLD}}", "thresholdUnit": "{{UNIT}}", "operator": "{{OPERATOR}}", "checkFrequency": "4h", "normalBaseline": 60}'::jsonb,
  '{"dataSource": "hormuz_strait", "metric": "ships_last_24h", "threshold": 30, "thresholdUnit": "ships/day", "operator": "gte", "checkFrequency": "4h", "normalBaseline": 60, "metricName": "Strait of Hormuz - Ships Transiting (24h)", "notes": "Normal throughput ~60 ships/day. Threshold of 30 = 50% normalization, indicating meaningful commercial resumption."}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- 2. Configure explicit_details on the Iran-Israel ceasefire invalidation signal
-- Signal ID: 818fe839-5def-4c5c-a36d-bf0978b5e10b
-- This wires the signal to the Hormuz data source for automated collection
UPDATE signals
SET
  explicit_details = '{
    "dataSource": "hormuz_strait",
    "metric": "ships_last_24h",
    "metricName": "Strait of Hormuz - Ships Transiting (24h)",
    "endpoint": "https://hormuzstraitmonitor.com/api/dashboard",
    "operator": "gte",
    "threshold": 30,
    "thresholdUnit": "ships/day",
    "checkFrequency": "4h",
    "normalBaseline": 60,
    "notes": "Normal throughput ~60 ships/day. Strait closed since 2026-02-28 (naval blockade). Monitoring ship transit recovery as leading indicator of ceasefire effectiveness and energy supply normalization. Threshold of 30 ships/day = 50% of normal, indicating meaningful commercial resumption that would precede crude oil price normalization."
  }'::jsonb,
  category = 'data_driven',
  updated_at = NOW()
WHERE id = '818fe839-5def-4c5c-a36d-bf0978b5e10b';

-- 3. Log a journal entry for the configuration change
INSERT INTO journal_entries (
  object_type, object_id, action_type, action_description, source
) VALUES (
  'signal',
  '818fe839-5def-4c5c-a36d-bf0978b5e10b',
  'annotation',
  'Configured signal with Hormuz Strait ship transit data source (hormuzstraitmonitor.com API). Metric: ships_last_24h, threshold: 30 ships/day (50% of ~60/day normal), collection frequency: every 4 hours. Using ship transit recovery as leading indicator of ceasefire effectiveness and energy supply normalization.',
  'skill'
);
