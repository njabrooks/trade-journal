# Documentation Best Practices

**Purpose**: Maintain clear traceability from daily work to strategic vision using a simplified, consolidated documentation system.

**Last Updated**: 2025-12-28 (Consolidated)

---

## Document Structure (Simplified)

### **Single Source of Truth**

```
PRD v1.1 (Vision)
    ↓
FUTURE_ENHANCEMENTS.md (All Enhancements)
    ↓
System Architecture (Phase Design)
    ↓
Implementation Progress (What's Done)
```

### Core Documents

1. **`PRD_v1.1.md`** - Product vision (locked, reference only)
2. **`FUTURE_ENHANCEMENTS.md`** - **Single source of truth** for all enhancements
3. **`system_architecture_transition_plan.md`** - Detailed phase design specs
4. **`implementation_progress.md`** - Historical record of completed work

---

## Standard Workflow

### 1. When Documenting New Enhancements

**Step 1: Brainstorm (Optional)**
```bash
# Create dated file for brainstorming (optional)
touch docs/YYYYMMDD_enhancements.md
```

Write raw ideas:
```markdown
1. Enhancement idea 1
2. Enhancement idea 2
...
Order: 1, 2, 3
Deferred: 4, 5
```

**Step 2: Register in FUTURE_ENHANCEMENTS.md**
```bash
# Open the single source of truth
open docs/FUTURE_ENHANCEMENTS.md
```

Add each enhancement to appropriate section:
- **Active/In Progress** - Current work
- **Planned (by Priority)** - High/Medium/Low
- **Deferred** - Blocked by future phases

**Enhancement Entry Template**:
```markdown
#### #ENH-XXX: Enhancement Name
**Status**: 🚧 Planned | ✅ Complete | ⏳ Deferred
**Priority**: High | Medium | Low
**Effort**: X days/weeks
**PRD**: Section X.Y (Title)
**Phase**: Phase X.Y
**Source**: docs/archive/YYYYMMDD_enhancements.md (item N)
**Dependencies**: #ENH-ABC ✅, #ENH-DEF 🚧

**Description**: What this enhancement does...

**Big Picture Impact**: Why this matters...
```

**Step 3: Archive Brainstorming Doc (Optional)**
```bash
# After registration, move to archive
mv docs/YYYYMMDD_enhancements.md docs/archive/
```

### 2. When Starting New Phase Work

**Update Architecture Plan**:
```bash
open docs/system_architecture_transition_plan.md
```

Add new phase section if needed:
```markdown
### Phase X.Y: Phase Name
**Goal**: ...
**Deliverables**: ...
**Enhancement IDs**: #ENH-XXX, #ENH-YYY
```

**Update Implementation Progress** (when work starts):
```bash
open docs/implementation_progress.md
```

Add phase tracking section.

### 3. During Implementation

**Commit Messages**:
```bash
git commit -m "feat(research): add claims browser (#ENH-002)

**Enhancement**: #ENH-002
**PRD**: Section 5.4 (Contextual Mapping)
**Phase**: Phase 2.6.2
"
```

**Update Status in FUTURE_ENHANCEMENTS.md**:
- Change status: ⏳ Planned → 🚧 In Progress
- Add implementation notes if needed

### 4. After Completion

**Mark Complete in FUTURE_ENHANCEMENTS.md**:
```markdown
**Status**: ✅ Complete (2025-12-28)
```

Move to "Completed Enhancements" section or keep in current section with ✅ status.

**Update Implementation Progress**:
- Mark phase/deliverable complete
- Add to "Completed Work" section

### 5. Weekly Sync (5-10 Minutes)

Every Friday or Sunday:

1. Open `FUTURE_ENHANCEMENTS.md`
2. Update enhancement statuses (⏳ → 🚧 → ✅)
3. Move completed enhancements to "Completed" section
4. Reprioritize if needed
5. Check PRD alignment

---

## Enhancement ID System

**Format**: `#ENH-XXX` or `#ENH-XXX-name`

**Examples**:
- `#ENH-002` - Simple numeric ID
- `#ENH-010a` - Variant of existing enhancement
- `#ENH-005-triage` - Descriptive suffix for clarity

**Assignment**:
- See "Enhancement Registry" section in `FUTURE_ENHANCEMENTS.md`
- Use next available ID
- Don't reuse IDs

**Legacy IDs**: Some use old numbering (#1, #4, #9) - preserved for continuity

---

## Linking Conventions

**In All Documents**:
```markdown
**Enhancement**: #ENH-XXX
**PRD**: Section X.Y (Title)
**Phase**: Phase X.Y
**Source**: docs/archive/YYYYMMDD_enhancements.md (item N)
```

**In Commit Messages**:
```
feat(scope): description (#ENH-XXX)

**Enhancement**: #ENH-XXX
**PRD**: Section X.Y
**Phase**: Phase X.Y
```

---

## Priority Guidelines

**High Priority**:
- Critical for core functionality
- Fixes critical bugs
- High user impact
- Quick wins (low effort, high value)

**Medium Priority**:
- Important workflow improvements
- Moderate effort, good value
- Not blocking core functionality

**Low Priority**:
- Nice-to-have features
- Low user impact
- Can wait for future phases

---

## Document Update Checklist

When documenting new work:

- [ ] Brainstorm in dated file (optional: `YYYYMMDD_enhancements.md`)
- [ ] Register in `FUTURE_ENHANCEMENTS.md`
- [ ] Assign enhancement IDs
- [ ] Map to PRD sections
- [ ] Set priority and effort
- [ ] Identify dependencies
- [ ] Update `system_architecture_transition_plan.md` if new phase
- [ ] Archive brainstorming doc (move to `docs/archive/`)
- [ ] Use enhancement IDs in commit messages
- [ ] Weekly sync to update statuses

---

## Anti-Patterns (What NOT to Do)

❌ **Don't** scatter enhancements across multiple docs (use `FUTURE_ENHANCEMENTS.md` as single source)
❌ **Don't** start implementation without registering in `FUTURE_ENHANCEMENTS.md`
❌ **Don't** create duplicate enhancement IDs
❌ **Don't** forget to map to PRD sections
❌ **Don't** skip weekly sync (enhancements get stale)
❌ **Don't** use commit messages without enhancement IDs
❌ **Don't** leave brainstorming docs in `docs/` (archive them)

---

## Example Workflow

**Day 1: Brainstorm 12 enhancement ideas**
1. Create `docs/20251228_enhancements.md` with raw list
2. Prioritize and order

**Day 1-2: Register**
1. Open `docs/FUTURE_ENHANCEMENTS.md`
2. Add enhancements to "Active/In Progress" section (Phase 2.6)
3. Assign IDs #ENH-001 through #ENH-012
4. Map to PRD, set priority, estimate effort
5. Archive `docs/20251228_enhancements.md` → `docs/archive/`

**Day 2: Update Architecture (if new phase)**
1. Open `docs/system_architecture_transition_plan.md`
2. Add Phase 2.6 section
3. Reference enhancement IDs

**Day 2: Update Progress Tracking**
1. Open `docs/implementation_progress.md`
2. Add Phase 2.6 overview and sub-phases

**Day 3-20: Implement**
1. Work on #ENH-001, mark as 🚧 In Progress in `FUTURE_ENHANCEMENTS.md`
2. Commit: `feat(ui): reorder sidebar (#ENH-001)`
3. Mark #ENH-001 as ✅ Complete in `FUTURE_ENHANCEMENTS.md`
4. Move to next enhancement

**Weekly (Sundays)**:
1. Open `FUTURE_ENHANCEMENTS.md`
2. Update statuses
3. Move completed to "Completed" section
4. Reprioritize if needed

---

## Benefits of Simplified System

✅ **Single Source** - All enhancements in one place
✅ **Clear Hierarchy** - PRD → Enhancements → Phases → Progress
✅ **Easy Navigation** - Jump directly to active/planned/completed
✅ **Full Traceability** - Enhancement IDs link commits → PRD → source
✅ **Low Overhead** - Just one doc to maintain (plus weekly sync)
✅ **No Redundancy** - Eliminated scattered enhancement lists

---

## Quick Start

**New to the system?**

1. Read `PRD_v1.1.md` to understand the vision
2. Browse `FUTURE_ENHANCEMENTS.md` to see all work (past/present/future)
3. Check `implementation_progress.md` to see what's done
4. When you have new ideas, register them in `FUTURE_ENHANCEMENTS.md`
5. Use enhancement IDs in commits
6. Weekly sync to keep current

**Questions?**

- **Where do I document new ideas?** → `FUTURE_ENHANCEMENTS.md`
- **How do I assign IDs?** → See "Enhancement Registry" section in that doc
- **Do I need multiple docs?** → No, just register in `FUTURE_ENHANCEMENTS.md`
- **What about brainstorming?** → Optional dated file, then archive after registration
- **How often to sync?** → Weekly (5-10 minutes)

---

**Document Status**: Living document - update as practices evolve.
