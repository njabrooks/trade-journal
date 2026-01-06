# Component Patterns

This document defines reusable UI component patterns in the codebase. When building similar functionality, follow these patterns for consistency.

---

## 1. Context Summary Components

**Purpose**: Display related entity information inline within a parent context (e.g., claims context within triage, thesis context within strategy).

**Pattern Name**: `<EntityContext>`

**Examples**:
- `ClaimsContext` - Shows claims linked to a strategy's asset thesis within triage rows

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│ [Icon] Label | [Link to Parent Entity]     [Summary Pills] ▼│
├─────────────────────────────────────────────────────────────┤
│ (Expanded content - scrollable, max-height constrained)    │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [Badge] Category | Metadata                             ││
│ │ Main content text (line-clamped)                        ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [Badge] Category | Metadata                             ││
│ │ Main content text (line-clamped)                        ││
│ └─────────────────────────────────────────────────────────┘│
│ ...                                                         │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ View full detail →                                (sticky)│
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Collapsible by default** | Summary visible immediately; details on demand |
| **Summary pills in header** | Quick signal (counts, status) without expansion |
| **All items shown when expanded** | No arbitrary limits; use scroll + max-height instead |
| **Max-height with overflow scroll** | Prevents taking over the page when many items |
| **Sticky footer link** | Always accessible regardless of scroll position |
| **Line-clamped content** | Prevents individual items from dominating |
| **Link separate from expand button** | Avoids nested interactive elements (a11y) |

### Implementation Checklist

- [ ] Fetches data on mount (via API or props)
- [ ] Shows loading state
- [ ] Handles empty state gracefully
- [ ] Handles missing parent entity (e.g., no asset thesis linked)
- [ ] Summary header always visible
- [ ] Expand/collapse toggle
- [ ] Max-height constraint with scroll on expanded content
- [ ] Sticky link to full detail page
- [ ] Proper link paths (test navigation!)

### Code Reference

```tsx
// src/components/triage/ClaimsContext.tsx
<div className="rounded-lg border border-slate-200 bg-white">
  {/* Header - always visible */}
  <div className="flex items-center justify-between p-3">
    <div className="flex items-center gap-3">
      <Icon />
      <Label />
      <Link to parent entity />
    </div>
    <button onClick={toggle}>
      <SummaryPills />
      <ChevronIcon />
    </button>
  </div>

  {/* Expanded content */}
  {isExpanded && (
    <div className="max-h-80 overflow-y-auto">
      {items.map(item => <ItemRow />)}
      <StickyFooterLink />
    </div>
  )}
</div>
```

### When to Use

- Showing related entities inline (claims, strategies, positions)
- Providing context at a decision point without navigation
- Space-constrained areas where full browser would be too heavy

### When NOT to Use

- Full-page browsing with filtering/sorting needs → Use `Unified*Browser` components
- Editing/management workflows → Use dedicated forms/modals
- Primary content display → Use detail pages

---

## 2. Unified Browser Components

**Purpose**: Full-featured browsing of entity lists with search, filtering, sorting, and actions.

**Pattern Name**: `Unified<Entity>Browser`

**Examples**:
- `UnifiedClaimsBrowser` - Full claims browsing with Toulmin framework display
- `UnifiedAssetThesisBrowser` - Asset thesis list with linked entity counts
- `UnifiedMacroThesisBrowser` - Macro thesis list
- `UnifiedStrategiesBrowser` - Strategy list

### Structure

```
┌─────────────────────────────────────────────────────────────┐
│ [Search] [Filter Toggles] [Sort Options]                    │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Entity Row (expandable for full detail)                 ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Entity Row                                              ││
│ └─────────────────────────────────────────────────────────┘│
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Client-side filtering** | Fast UX, data already loaded |
| **Keyboard shortcuts** | Power user efficiency (/ for search, Esc to clear) |
| **Expandable rows** | Full detail without navigation |
| **Column sorting** | Quick reorganization |
| **Multi-select filters** | Flexible querying |

### When to Use

- Primary browsing experience for an entity type
- Need full search/filter/sort capabilities
- Space available for full-width display

---

## 3. Naming Conventions

| Pattern | Naming | Example |
|---------|--------|---------|
| Context Summary | `<Entity>Context` | `ClaimsContext`, `ThesisContext` |
| Unified Browser | `Unified<Entity>Browser` | `UnifiedClaimsBrowser` |
| Detail Sections | `<Entity>DetailSections` | `AssetThesisDetailSections` |
| List Item | `<Entity>Row` or `<Entity>Card` | `TriageTableRow`, `ClaimCard` |

---

## Related Documents

- [CLAUDE.md](../CLAUDE.md) - Codebase conventions
- [PRD v1.1](PRD_v1.1.md) - Product requirements
- [Terminology](terminology.md) - Entity naming

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-04 | Claude + User | Initial patterns: Context Summary, Unified Browser |
