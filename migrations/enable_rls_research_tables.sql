-- Enable RLS for research tables and create permissive policies
-- This allows uploads from notes vault using anon key

-- Enable RLS on research_artifacts
ALTER TABLE research_artifacts ENABLE ROW LEVEL SECURITY;

-- Enable RLS on research_insights
ALTER TABLE research_insights ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert research_artifacts
CREATE POLICY "Allow public inserts on research_artifacts"
ON research_artifacts
FOR INSERT
TO public
WITH CHECK (true);

-- Policy: Allow anyone to read research_artifacts
CREATE POLICY "Allow public reads on research_artifacts"
ON research_artifacts
FOR SELECT
TO public
USING (true);

-- Policy: Allow anyone to update research_artifacts
CREATE POLICY "Allow public updates on research_artifacts"
ON research_artifacts
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Policy: Allow anyone to insert research_insights
CREATE POLICY "Allow public inserts on research_insights"
ON research_insights
FOR INSERT
TO public
WITH CHECK (true);

-- Policy: Allow anyone to read research_insights
CREATE POLICY "Allow public reads on research_insights"
ON research_insights
FOR SELECT
TO public
USING (true);

-- Policy: Allow anyone to update research_insights
CREATE POLICY "Allow public updates on research_insights"
ON research_insights
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Note: These are permissive policies for local development and personal use.
-- If this becomes multi-user or public-facing, implement proper authentication
-- and user-scoped policies (e.g., auth.uid() = ingested_by).
