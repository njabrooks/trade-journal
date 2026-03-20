# Trade Journal — UI Patterns Reference

> **Purpose:** Prescriptive guide for building new pages consistently. When starting a new page or feature, check this first. The goal is to match the visual quality of Triage, Asset Thesis detail, and Signals — the benchmark pages as of March 2026.

---

## 1. Tech Stack Constraints

| Layer | Choice | Notes |
|-------|--------|-------|
| Component library | shadcn/ui **new-york** style | Never install a second component library |
| Base color | **neutral** (gray without blue tint) | Set in `components.json` |
| Icon library | **lucide-react** | No heroicons, no custom SVGs unless essential |
| Font | **Geist Sans** (body) + **Geist Mono** (code/numbers) | Already wired in layout |
| CSS | **Tailwind 4** with CSS variables | No inline styles, no hardcoded hex values |
| Color system | **CSS variables only** — `bg-background`, `text-foreground`, `border-border` etc. | Never use `gray-*` or `neutral-*` directly for semantic UI |

### Dark mode contrast requirements

The three-layer hierarchy must remain perceptible in dark mode:

| Layer | Light | Dark |
|-------|-------|------|
| Body background (`sidebar-inset`) | `rgb(248 250 252)` slate-50 | `rgb(23 23 23)` ~oklch(0.17) |
| Card (`--card`) | `oklch(1 0 0)` white | `oklch(0.245 0 0)` ~rgb(50,50,50) |
| Muted surface (`--muted`) | `oklch(0.97 0 0)` | `oklch(0.31 0 0)` |

Card must be at least **oklch(0.24)** in dark mode to be visually distinct from the body background. Border opacity must be at least **16%** (`oklch(1 0 0 / 16%)`) to show card edges.

### Recharts CSS variables

Recharts renders SVG attributes, not CSS properties. CSS variables work in SVG presentation attributes in modern browsers **when the variable resolves to a complete color value**. Tailwind 4 variables are stored as full `oklch(...)` values, so:

- ✅ `fill: 'var(--muted-foreground)'` — correct
- ❌ `fill: 'hsl(var(--muted-foreground))'` — invalid (nesting color functions)
- ❌ `fill: 'hsl(var(--muted)/0.5)'` — invalid

For opacity on a variable-based color, use a separate `opacity` prop: `cursor={{ fill: 'var(--muted)', opacity: 0.5 }}`

---

## 2. Page Layouts

### 2a. List/Browser page

Use for: Strategies, Macro Theses, Asset Theses, Triage, Claims, Signals.

```
┌─ DashboardShell ──────────────────────────────────────────────────┐
│  Page title + subtitle                          [Action button(s)] │
│  ┌─ FilterBar ────────────────────────────────────────────────┐   │
│  │  [Filters]  [Group by X]  [Tab] [Tab] [Tab]    N of M items│   │
│  └────────────────────────────────────────────────────────────┘   │
│  ┌─ Table / Card list ─────────────────────────────────────────┐  │
│  │  Sortable headers                                            │  │
│  │  Rows with badges, values, action buttons                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Wrap everything in `<DashboardShell>` — sets the sidebar + header chrome
- Filter bar sits between the page header and the table, full-width, no card border
- Filter tabs use the `Active` tab as the default selected state (bold/filled)
- Item count lives at the right end of the filter bar: `"Showing N of M items"`
- Table headers are sortable with `↑↓` icon from `SortableHeader` component
- Each row action area: primary action (button) + overflow (`...`) + optional expand chevron

### 2b. Entity detail page

Use for: Macro Thesis detail, Asset Thesis detail, Strategy detail, Research artifact.

```
┌─ EntityDetailLayout ──────────────────────────────────────────────────────┐
│  [Breadcrumb]                              [Tab] [Tab] [Tab]               │
│  Page title                [status badge]                   [action menu]  │
│  Subtitle (entity type + ticker/key)                                        │
│  ┌─ Main content (1fr) ──────────────┐  ┌─ Sidebar (22rem) ─────────────┐ │
│  │  CollapsibleEntitySection          │  │  QUICK STATS                  │ │
│  │    content                         │  │    field / value pairs        │ │
│  │  CollapsibleEntitySection          │  │  HIERARCHY                    │ │
│  │    content                         │  │    linked entities            │ │
│  │  EntitySection                     │  │  [Edit button]                │ │
│  │    table or list                   │  └───────────────────────────────┘ │
│  └────────────────────────────────────┘                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Always use `EntityDetailLayout` — it handles the two-column grid and DashboardShell
- Sidebar width is **fixed at 22rem** — don't widen it, don't make it fluid
- Sidebar sections: ALL-CAPS label (`QUICK STATS`, `HIERARCHY`) in `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
- Sidebar field rows: label left in `text-sm text-muted-foreground`, value right in `text-sm font-medium`
- Main content sections use `CollapsibleEntitySection` when they can contain 0 items (claims, signals, linked theses)
- Use `EntitySection` (non-collapsible) for sections that always have content (core argument, strategy table)
- `EmptySectionState` for empty sections — never just blank white space

### 2c. Dashboard/analytics page

Use for: Portfolio, Accounting, NAV Tracker.

```
┌─ DashboardShell ──────────────────────────────────────────────────┐
│  ┌─ Metrics row ─────────────────────────────────────────────┐   │
│  │  [Metric card]  [Metric card]  [Metric card]  [Metric card]│   │
│  └────────────────────────────────────────────────────────────┘   │
│  ┌─ Charts row ─────────────────────────────────────────────────┐ │
│  │  [Chart card]                    [Chart card]                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌─ Table/breakdown ────────────────────────────────────────────┐ │
│  │  FilterBar + sortable table                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Metrics row first, always — key numbers before detail
- Charts in a 2-column grid: `grid-cols-1 lg:grid-cols-2 gap-6`
- Each chart in a `bg-card rounded-lg border p-4`
- Tables below charts, never above

---

## 3. Typography Scale

| Use | Class | Example |
|-----|-------|---------|
| Page title | `text-2xl font-bold` | "Strategies" |
| Page subtitle | `text-sm text-muted-foreground` | "Confirmed strategies with open positions" |
| Section heading | `text-base font-semibold` | "Core Argument", "Linked Strategies" |
| Sidebar section label | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` | "QUICK STATS" |
| Table header | `text-xs font-medium text-muted-foreground uppercase` | "STRATEGY", "MKT VALUE" |
| Table body | `text-sm` | Row content |
| Metric value (large) | `text-2xl font-bold` or `text-3xl font-bold` | "$7,100,839" |
| Metric label | `text-xs text-muted-foreground` | "Market Value" |
| Badge/tag text | `text-xs font-medium` | "active", "Inbox" |
| Muted helper text | `text-sm text-muted-foreground` | "No linked theses yet" |
| Mono numbers | `font-mono text-sm` | P&L values, percentages |

**Rules:**
- Never go below `text-xs` for readable content (only for labels/badges)
- Numbers that update live or need alignment → use `font-mono`
- Negative values → `text-destructive` (red). Positive → `text-emerald-500` (or the chart-2 green). Neutral → `text-foreground`

---

## 4. Color Semantics

### Status badges

Always use these exact combinations — don't invent new ones:

| Status | Badge classes |
|--------|--------------|
| `active` | `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400` |
| `draft` | `bg-muted text-muted-foreground` |
| `complete` | `bg-muted text-muted-foreground` |
| `rejected` | `bg-destructive/15 text-destructive` |
| `inbox` | `bg-amber-500/15 text-amber-600 dark:text-amber-400` |
| `done` | `bg-muted text-muted-foreground` |

### Direction badges

| Direction | Badge classes |
|-----------|--------------|
| `bullish` | `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400` |
| `bearish` | `bg-destructive/15 text-destructive` |
| `neutral` | `bg-muted text-muted-foreground` |

### Severity badges (triage)

| Severity | Badge classes |
|----------|--------------|
| `urgent` | `bg-destructive/15 text-destructive` |
| `attention` | `bg-orange-500/15 text-orange-600 dark:text-orange-400` |
| `monitor` | `bg-amber-500/15 text-amber-600 dark:text-amber-400` |
| `info` | `bg-muted text-muted-foreground` |

### Entity type badges

| Entity | Badge classes |
|--------|--------------|
| Macro Thesis | `bg-violet-500/15 text-violet-600 dark:text-violet-400` |
| Asset Thesis | `bg-blue-500/15 text-blue-600 dark:text-blue-400` |
| Strategy | `bg-blue-500/15 text-blue-600 dark:text-blue-400` |
| Position | `bg-teal-500/15 text-teal-600 dark:text-teal-400` |
| Claim | `bg-purple-500/15 text-purple-600 dark:text-purple-400` |
| Signal (confirmation) | `bg-emerald-500/15 text-emerald-600 dark:text-emerald-400` |
| Signal (invalidation) | `bg-orange-500/15 text-orange-600 dark:text-orange-400` |

**Pattern for all badges:** `rounded-full px-2 py-0.5 text-xs font-medium` on a `<span>`. Never use a bordered badge for status — always filled with transparency (`/15` opacity background).

---

## 5. Spacing System

| Token | Value | Use |
|-------|-------|-----|
| Section gap | `space-y-6` | Between sections on a page |
| Card padding (standard) | `p-4` | EntitySection, chart cards |
| Card padding (compact) | `p-3` | Dense tables, tight lists |
| Sidebar section gap | `space-y-4` | Between sidebar blocks |
| Filter bar gap | `gap-2` | Between filter button groups |
| Table cell padding | `px-3 py-2` (rows), `px-3 py-2` (headers) | |
| Metric card inner gap | `space-y-1` | Label above value |
| Form field gap | `space-y-4` | Between form fields |
| Inline badge gap | `gap-1.5` | Multiple badges in a cell |

**Rules:**
- Outer page padding is handled by `DashboardShell` — don't add extra `p-*` to the top-level element you pass as `children`
- Grid gutters for multi-column layouts: always `gap-6`
- Don't use `mb-*` for vertical spacing between sections — use `space-y-6` on the parent

---

## 6. Filter Bar Pattern

The filter bar is one of the most reused UI elements. Use this exact structure:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  {/* Left: controls */}
  <Button variant="outline" size="sm">
    <Filter className="h-4 w-4 mr-2" />
    Filters
  </Button>

  <Button variant="outline" size="sm">
    <LayoutList className="h-4 w-4 mr-2" />
    Group by X
  </Button>

  {/* Tab group (status filters) */}
  <div className="flex rounded-md border overflow-hidden">
    {["All", "Active", "Closed"].map(tab => (
      <button
        key={tab}
        className={cn(
          "px-3 py-1.5 text-sm",
          active === tab
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        {tab}
      </button>
    ))}
  </div>

  {/* Right: item count */}
  <span className="ml-auto text-sm text-muted-foreground">
    Showing {n} of {total} items
  </span>
</div>
```

**Rules:**
- Active tab: `bg-foreground text-background` (inverted) — this works in both light and dark mode
- Item count always at the far right (`ml-auto`)
- Filter bar has no card border — it sits directly on the page background

---

## 7. Table Pattern

```tsx
<div className="rounded-lg border overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-muted/50">
      <tr>
        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
          COLUMN
        </th>
        {/* sortable: */}
        <th className="px-3 py-2 text-left">
          <SortableHeader column="value" label="VALUE" />
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-3 py-2">...</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Rules:**
- Table always in `rounded-lg border overflow-hidden` wrapper — never a raw `<table>`
- `thead` uses `bg-muted/50` — slightly tinted but not a solid color
- Row hover: `hover:bg-muted/30` — subtle, never a strong color
- `divide-y divide-border` on `tbody` for row separators
- Numeric columns: right-align (`text-right`) and use `font-mono`
- Action column: always last, `text-right`, contains button(s) + `...` overflow menu
- Never add a vertical border between columns

---

## 8. Sidebar Pattern (Entity Detail)

```tsx
<aside className="space-y-4 lg:sticky lg:top-[calc(1.75rem+1rem)]">
  <div className="bg-card rounded-lg border p-4 space-y-4">

    {/* Section label */}
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      QUICK STATS
    </p>

    {/* Field rows */}
    <div className="space-y-2">
      {[
        ["Direction", <DirectionBadge />],
        ["Time Horizon", thesis.timeHorizon],
        ["Confidence", thesis.confidence],
      ].map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-sm font-medium">{value}</span>
        </div>
      ))}
    </div>

    <Separator />

    {/* Another section */}
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      HIERARCHY
    </p>
    ...
  </div>
</aside>
```

**Rules:**
- Sidebar sticks with `lg:sticky lg:top-[calc(1.75rem+1rem)]` (accounts for the 28px header)
- All sidebar content in a single `bg-card rounded-lg border p-4` card
- Section labels: ALL-CAPS, `text-xs`, `tracking-wider`, `text-muted-foreground`
- Field rows: `flex justify-between` with label muted, value normal weight
- Use `<Separator />` between logical groups within the sidebar card
- Edit/action button at the bottom of the sidebar card, full-width `variant="outline"`

---

## 9. Empty States

Always use `EmptySectionState` from `@/components/layout/EntityDetailLayout`. Never leave a section blank.

```tsx
<EmptySectionState
  icon={<FileText className="h-8 w-8" />}
  message="No claims linked yet"
  description="Link existing claims or create new ones to build the evidence base."
  action={<Button size="sm">Link Claims</Button>}
/>
```

**Rules:**
- Icon: 8×8, `text-muted-foreground`
- Message: short, factual ("No claims linked yet")
- Description: one sentence explaining what to do about it
- Action: optional, only when there's a direct action to take from this state

---

## 10. Action Buttons

### Page-level actions (top right of page header)
```tsx
<Button size="sm">
  <Plus className="h-4 w-4 mr-1.5" />
  Create New Thesis
</Button>
```

### Row-level actions (in table)
```tsx
<div className="flex items-center gap-1 justify-end">
  <Button variant="outline" size="sm">
    <Pencil className="h-3.5 w-3.5 mr-1" />
    Edit
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    ...
  </DropdownMenu>
  {/* Expand chevron if row is expandable */}
  <Button variant="ghost" size="icon-sm">
    <ChevronDown className="h-4 w-4" />
  </Button>
</div>
```

**Rules:**
- Primary page action: `size="sm"` default variant (filled)
- Secondary page actions: `size="sm" variant="outline"`
- Table row primary action: `variant="outline" size="sm"` (e.g. "Edit", "Trade", "Monitor")
- Overflow menu trigger: `variant="ghost" size="icon-sm"` with `MoreHorizontal`
- Destructive actions only inside dropdown menus, never as exposed buttons
- Icon + label buttons: icon is `h-3.5 w-3.5 mr-1` or `h-4 w-4 mr-1.5`

---

## 11. Common Mistakes to Avoid

| Anti-pattern | Correct pattern |
|-------------|----------------|
| Wrapping content in `<div className="p-6">` inside DashboardShell | DashboardShell handles outer padding — don't double-pad |
| Using `gray-*` Tailwind colors directly | Use `muted`, `muted-foreground`, `border` CSS variables |
| Creating a new badge color for a new entity type | Pick the closest existing color from section 4 |
| Plain `<div>` for a section card | Use `EntitySection` or `CollapsibleEntitySection` |
| Blank space when a list is empty | Use `EmptySectionState` |
| Hardcoding `w-[300px]` for sidebar | Sidebar is always `22rem` via `EntityDetailLayout` |
| Using `text-green-500` for positive numbers | Use `text-emerald-500` (consistent with chart palette) |
| Mixing `space-y-4` and `space-y-6` arbitrarily | Between sections = `space-y-6`. Within a section = `space-y-4` |
| Table without `rounded-lg border overflow-hidden` wrapper | Always wrap tables |
| Status filter tabs as separate `<Button>` components | Use the joined tab group (section 6) — no gap between tabs |
| Loading state as blank white area | Add a `Skeleton` from shadcn/ui |

---

## 12. Checklist for New Pages

Before shipping a new page, verify:

- [ ] Wrapped in `DashboardShell` (list page) or `EntityDetailLayout` (detail page)
- [ ] All section containers use `EntitySection` or `CollapsibleEntitySection`
- [ ] Empty states covered with `EmptySectionState`
- [ ] Loading states covered with `Skeleton` components
- [ ] Table wrapped in `rounded-lg border overflow-hidden`
- [ ] Status/direction/severity badges use colors from section 4
- [ ] Typography matches scale from section 3
- [ ] No hardcoded color values or hex codes
- [ ] Filter bar uses the pattern from section 6 if filtering is needed
- [ ] Action buttons follow the hierarchy from section 10
- [ ] Page action (if any) is in the `actions` prop of `DashboardShell`, not inside the content area

---

## 13. Reference Pages (Benchmark)

These are the pages to match when in doubt:

| Page | What it demonstrates |
|------|---------------------|
| `/triage` | Filter bar, sortable table, multi-badge rows, row actions |
| `/asset-theses/[id]` | EntityDetailLayout, sidebar, CollapsibleEntitySection, empty states |
| `/signals` | Dense list with grouped entity headers, long text handling |
| `/dashboard/portfolio` | Metrics row, chart cards, filter tabs on table |
| `/strategies` | Full-width table with many columns, grouped rows, status badges |
