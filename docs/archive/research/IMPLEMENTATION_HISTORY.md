# Research Workflow Setup Status

**Last Updated**: 2025-12-23 18:45 PST
**Status**: ✅ Enhanced - Toulmin framework workflow with forensic claim extraction

## ✅ Completed

1. **Folder structure created** (`/research-workspace/`)
   - `/1-transcripts/` - Sample AI infrastructure transcript included
   - `/2-audits/` - For forensic claim extraction
   - `/3-syntheses/` - For cross-reference analysis
   - `/4-deep-dives/` - For focused analysis
   - `/5-finalized/` - For upload-ready content
   - `/prompts/` - Templates for each stage
   - `/utils/` - TypeScript utilities

2. **Templates created** (`/prompts/`)
   - `transcript-template.md`
   - `summary-template.md`
   - `deep-dive-template.md`
   - `finalized-template.md`

3. **Utility functions built** (`/utils/`)
   - `validators.ts` - Schema validation for all entity types
   - `formatters.ts` - Markdown ↔ JSON parsing
   - `mcp-helpers.ts` - Supabase MCP integration (placeholders)

4. **Documentation**
   - `README.md` - Complete workflow guide with examples

5. **MCP Configuration**
   - Supabase MCP server configured in `.mcp.json`
   - Authentication verified and working ✅

6. **MCP Testing Skills Built** (`.claude/skills/`)
   - `/mcp-read-theses` - Query macro theses ✅
   - `/mcp-read-views` - Query asset views ✅
   - `/mcp-upload-artifact` - Upload research artifacts ✅
   - `/mcp-upload-insight` - Upload structured insights ✅
   - `/mcp-create-thesis` - Create macro theses ✅
   - `/mcp-create-view` - Create asset views ✅

7. **End-to-End Testing Complete**
   - Read existing theses (1 found: "AI Infrastructure Build-Out")
   - Read existing views (2 found: TSLA, GOOG)
   - Uploaded test artifact (ID: `f5941431-5450-48fc-bd38-fac0d10b7012`)
   - Uploaded test insight (ID: `ff254ba0-9509-4f35-b2f9-cea6b989b10d`)
   - Created test thesis (ID: `a07ffb45-32a9-4b16-afac-421a47be09e0`)
   - Created test view for NVDA (ID: `47e8ffde-4ef8-48b1-9d39-461dd589d910`)

8. **High-Level Workflow Skills Built** (`.claude/skills/`)
   - `/process-transcript` - **Enhanced**: Forensic Toulmin extraction ✅
   - `/synthesize-claims` - **New**: Cross-reference claims to hierarchy ✅
   - `/finalize-for-upload` - Format + upload to Supabase ✅
   - `/deep-dive` - Guided collaborative exploration ✅

9. **Enhanced Toulmin Workflow**
   - Forensic claim extraction (no information loss)
   - Two-level claim structure (main + evidence)
   - Full Toulmin framework (claim, grounds, warrant, backing, qualifier, rebuttal)
   - Migration-ready for future claims table (see FUTURE_ENHANCEMENTS.md)

## 🎯 Ready to Use!

The research workflow system is fully operational. You can now:

### Use the Enhanced Toulmin Workflow

**Stage 1: Forensic Extraction**
```
/process-transcript 1-transcripts/your-file.md
```
- Auto-formats YouTube transcripts → markdown
- Extracts ALL claims (no summarization)
- Full Toulmin structure for each claim
- Categorizes as thesis/view candidates
- Output: `2-audits/[file]-audit.md`

**Stage 2: Synthesis & Mapping**
```
/synthesize-claims 2-audits/[file]-audit.md
```
- Cross-references claims against existing theses/views
- Identifies NEW candidates vs EVIDENCE for existing
- Generates recommendations with priorities
- Output: `3-syntheses/[file]-synthesis.md`

**Stage 3: Development** (choose path)
```
/deep-dive "Application to Agent Shift"
```
- Develop selected claims into full theses/views
- Strengthen Toulmin structure with research
- Iterative refinement
- Output: `4-deep-dives/[file]-analysis.md`

**Stage 4: Upload**
```
/finalize-for-upload 4-deep-dives/[file]-analysis.md
```
- Auto-detects content type (thesis, view, artifact, insight)
- Uploads to Supabase with proper structure
- Returns IDs for app UI linking

### Or Use Individual MCP Skills

- `/mcp-read-theses` - Query macro theses
- `/mcp-read-views ticker=NVDA` - Query asset views
- `/mcp-upload-artifact` - Upload research artifacts
- `/mcp-upload-insight` - Upload structured insights
- `/mcp-create-thesis` - Create macro theses
- `/mcp-create-view` - Create asset views

### Next Steps (Optional)

1. **Test the full workflow** with the sample transcript
2. **Add more templates** to `/prompts/` for different content types
3. **Extend utilities** in `/utils/` if needed (currently optional)
4. **Process real research** and iterate on the workflow

## 📝 How to Resume

**Option A: Build workflow skills**

> "Build the /process-transcript skill for the research workflow. See research-workspace/README.md for context."

**Option B: Test real workflow**

> "Let's test the research workflow end-to-end. Process the sample transcript in research-workspace/1-transcripts/, cross-reference it against existing theses, and upload insights to Supabase."

**Option C: Use MCP skills directly**

Just invoke the skills in your conversation:
- "Show me all active macro theses" → Uses `/mcp-read-theses`
- "What views do I have for NVDA?" → Uses `/mcp-read-views`
- "Upload this artifact" → Uses `/mcp-upload-artifact`

## 🔧 Troubleshooting

**If skills don't appear:**
- Skills are in `.claude/skills/` (project-scoped, shared via git)
- Restart Claude Code session to pick up new skills
- Skills should auto-complete when you type `/mcp-`

**If MCP queries fail:**
- Verify MCP connection: Run `/mcp` command
- Check `.mcp.json` has correct Supabase URL
- Ensure you have network access to Supabase

**If utilities are needed:**
- TypeScript utilities are in `research-workspace/utils/`
- Test validators: `npx tsx research-workspace/utils/validators.ts`
- Currently skills use direct SQL queries (utilities optional)

## 📂 Key Files

- **Workflow Guide**: `research-workspace/README.md`
- **Sample Transcript**: `research-workspace/1-transcripts/2025-01-15-ai-infrastructure-buildout.md`
- **Templates**: `research-workspace/prompts/`
- **Utilities**: `research-workspace/utils/`
- **MCP Config**: `.mcp.json`

## 🎯 The Vision

**Workflow**:
1. Drop transcript → `/1-transcripts/`
2. Run `/process-transcript` → Creates summary with cross-references
3. Collaborative deep dive with Claude → Develop theses/views
4. Run `/finalize-for-upload` → Upload to Supabase
5. Link in app UI → Connect research to hierarchy

**Benefits**:
- Zero API costs (local processing)
- Iterative refinement with Claude
- Git-trackable research
- Automatic cross-referencing against existing beliefs
- MCP-powered sync when ready
