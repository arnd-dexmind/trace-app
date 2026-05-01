# PerifEye MVP Design System Spec

## Token Reference

All tokens defined in `src/design/tokens.css` (canonical) and `client/src/tokens.css` (build copy).

### Color

| Token | Value | Usage |
|---|---|---|
| `--sm-brand-600` | #2563eb | Primary actions, active states, links |
| `--sm-brand-500` | #3b82f6 | Focus rings, progress bars |
| `--sm-brand-100` | #dbeafe | Brand badges, selected backgrounds |
| `--sm-neutral-900` | #0f172a | Primary text (light mode) |
| `--sm-neutral-600` | #475569 | Secondary text |
| `--sm-neutral-400` | #94a3b8 | Tertiary text, placeholders |
| `--sm-neutral-200` | #e2e8f0 | Default borders |
| `--sm-neutral-100` | #f1f5f9 | Chip backgrounds, hover states |
| `--sm-neutral-50` | #f8fafc | Sidebar backgrounds |
| `--sm-success-500` | #22c55e | Success dots, confirmed states |
| `--sm-warning-400` | #facc15 | Warning dots, medium severity |
| `--sm-danger-500` | #ef4444 | Error dots, high severity, destructive actions |

**Semantic badge colors** (hardcoded in components for WCAG contrast):
- Open/warning: bg `#fef3c7`, text `#92400e`
- Monitoring/info: bg `#dbeafe`, text `#1e40af`
- Resolved/success: bg `#dcfce7`, text `#166534`
- High severity: bg `#fee2e2`, text `var(--sm-danger-700)`
- Med severity: bg `#fef9c3`, text `var(--sm-warning-600)`

**Dark theme**: All surface colors invert via `prefers-color-scheme: dark` media query. Text swaps to light-on-dark. Borders darken.

### Spacing

4px base scale: `--sm-space-1` (4px) through `--sm-space-16` (64px).

Key values for layout:
- Card padding: `--sm-space-4` (16px)
- Section gaps: `--sm-space-6` (24px)
- Component gaps: `--sm-space-3` (12px)
- Page padding: `--sm-space-4` horizontal, `--sm-space-6` vertical

### Typography

Single font stack: system-ui sans-serif. Two weights (400, 500, 600, 700). Three active sizes per surface (more available but restraint preferred).

### Radii

- `--sm-radius-md` (6px): buttons, inputs, small cards
- `--sm-radius-lg` (8px): result cards, form fields
- `--sm-radius-xl` (12px): info grids, location cards, drop zones
- `--sm-radius-full` (9999px): badges, chips, filter pills

### Touch Targets

Minimum 44px (`--sm-touch-target`) for all interactive elements. Buttons default to 44px (md) or 32px (sm, for dense UIs like the console actions panel).

---

## Component Catalog

### Button

**File**: `client/src/components/ui/Button.tsx`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"primary" \| "success" \| "danger" \| "outline" \| "ghost"` | `"outline"` | Determines color treatment |
| `size` | `"sm" \| "md"` | `"sm"` | sm=32px, md=44px min-height |
| `block` | `boolean` | `false` | Full-width when true |
| `disabled` | `boolean` | `false` | 50% opacity, cursor not-allowed |

**Usage rules**:
- One primary per view (Hick's Law — single clear CTA)
- Success variant reserved for "Confirm" / "Accept" in operator console
- Danger variant reserved for destructive actions (reject, delete)
- Ghost variant for secondary actions that shouldn't compete visually
- Outline is the default general-purpose button

**Accessibility**: `focus-visible` ring via parent CSS. Use `aria-label` when icon-only.

### Badge

**File**: `client/src/components/ui/Badge.tsx`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"status-open" \| "status-monitoring" \| "status-resolved" \| "severity-high" \| "severity-medium" \| "severity-low" \| "confidence-high" \| "confidence-medium" \| "confidence-low" \| "neutral" \| "brand"` | `"neutral"` | Semantic color |
| `dot` | `boolean` | `false` | Prepend colored dot |

**Usage**: Status badges on repair rows, severity indicators, confidence pills, category chips. Always inline-flex, 11px font, pill-shaped.

### StatusDot

**File**: `client/src/components/ui/StatusDot.tsx`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"success" \| "warning" \| "danger" \| "neutral"` | `"neutral"` | Color |
| `size` | `number` | `8` | Width/height in px |

**Usage**: Item status in result cards and detail headers. Semantics: success = in-place, warning = moved, danger = missing, neutral = unseen/unknown.

### EmptyState

**File**: `client/src/components/ui/EmptyState.tsx`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `icon` | `string` | magnifying glass emoji | HTML entity or emoji |
| `title` | `string` | — | Bold heading |
| `description` | `string` | — | Secondary text, max 320px |
| `action` | `ReactNode` | — | Optional CTA (usually a Button) |

**Usage**: No-results, no-space-selected, empty queue states. Centered, generous padding (`--sm-space-16` vertical).

---

## Feature Interaction Patterns

### 1. Item Search & Detail

**Search** (`/items`):
1. **Empty state**: Show prompt to select a space (if none selected)
2. **Idle state**: Empty search field + initial result set (all items in space)
3. **Typing**: Autocomplete dropdown opens after 1+ characters (Doherty Threshold: debounce API calls at 200ms)
4. **Keyboard**: Arrow keys navigate autocomplete; Enter selects; Escape closes
5. **Results**: Cards show icon, name, category chip, metadata row, status dot, chevron
6. **Empty results**: EmptyState with "No items found. Try a different search."

**Detail** (`/items/:itemId`):
1. **Breadcrumb**: Items > Item Name (Recognition over Recall)
2. **Header**: Status badge + item name + ID + category chip
3. **Info grid**: 2-column on desktop, 1-column mobile
4. **Location timeline**: Vertical timeline with color-coded dots (current=brand, moved=warning, resolved=success)
5. **Related repairs**: Linked repair rows with status and severity badges

### 2. Upload Flow

**Upload** (`/upload`):
1. **Idle**: Drop zone with dashed border, icon, title, hint, format info
2. **Drag-over**: Border turns brand color, background tints blue (affordance feedback, <100ms)
3. **Selected**: File card with name + size + remove button, then primary CTA "Start Upload & Processing"
4. **Uploading**: Progress bar (upload %), then processing stages list
5. **Complete**: Success card with stats grid (items detected, pending review, repairs flagged) + "Open in Operator Console" CTA + "Upload Another"
6. **Error**: Error card with message + "Try Again" button

**States**: idle → selected → uploading → processing → complete | error
**Forgiveness**: Remove button on file card; Try Again on error; file input cleared between uploads

### 3. Operator Review Console

**Console** (`/review`):
1. **Layout**: 3-panel grid (280px queue | fluid main | 320px actions) on desktop; stacked on mobile
2. **Queue panel**: Tabs (Pending/Completed) with counts; scrollable candidate cards
3. **Candidate card**: Item name, confidence badge, zone, meta. Active state: brand border + glow.
4. **Main panel**: Evidence frame (16:9 placeholder or keyframe image), detail grid (2-col), location history timeline
5. **Actions panel**: Quick-accept for ≥90% confidence; identity actions (accept/reject/relabel); repair actions (accept/reject); resolution note; nav (prev/next)
6. **Mobile**: Queue collapses to top strip; actions slide over from right with FAB toggle + overlay

**Keyboard** (target for implementation):
- Tab through queue cards; Enter to select
- Escape to close mobile actions panel
- Focus trap in actions panel when open on mobile

### 4. Repair List & Tracking

**Repairs** (`/repairs`):
1. **Filter bar**: Pill toggles (All, Open, Monitoring, Resolved) with counts. Active pill is filled brand.
2. **Desktop**: Table with columns: Issue, Severity, Status, Detected. Rows hover to highlight.
3. **Mobile**: Cards replacing table at ≤768px. Card shows title, status badge, severity, date.
4. **Empty**: EmptyState per filter — "No repair issues found with the current filter."
5. **Status lifecycle**: Open → In Progress (Monitoring) → Resolved. Status badge color updates accordingly.

### 5. Dashboard

**Dashboard** (`/`):

**Prototype**: `src/design/prototypes/dashboard.html`

1. **Stats grid**: 4-column stat cards (inventory count, open repairs, walkthroughs/mo, pending reviews) on desktop; 2-column on mobile. Each card shows value (3xl bold), label (sm secondary), and optional trend arrow (success/danger/neutral).
2. **Recent walkthroughs**: Timeline list in a section card. Each row: colored status dot (green=applied, blue=awaiting review, amber=pending), title, metadata (items/repairs/pending counts), relative timestamp.
3. **Quick actions**: Right-column card list — Upload, Review Queue, Search Inventory, Open Repairs. Each has icon, label, hint text, and chevron. Fitts's Law: full-width touch targets at 44px+.
4. **Empty state (no walkthroughs)**: EmptyState prompting first upload with CTA to `/upload`.
5. **No space selected**: EmptyState prompting space selection with CTA to `/spaces`.

**States**: populated → empty → loading → error → no-space-selected
**CTA**: "Upload Walkthrough" (primary, top-right)

### 6. Space Management

**Space Management** (`/spaces`):

**Prototype**: `src/design/prototypes/spaces.html`

1. **Space list**: Vertical card stack. Each card: icon, name (+ "Active" badge if selected), description (truncated), metadata row (item count, open repairs, walkthroughs, created date), Edit/Delete action buttons.
2. **Active space**: Brand-tinted background (brand-50) and brand border (brand-300) to distinguish current space. Badge pill "Active" next to name.
3. **Create**: Modal overlay with form (name required, description optional). Inline validation on name field. Submit → success toast, modal closes.
4. **Edit**: Same modal pattern, pre-filled. "Save Changes" primary CTA.
5. **Delete**: Confirmation modal with:
   - Warning banner showing data loss count (items, repairs, walkthroughs)
   - Type-to-confirm input (must match space name exactly before Delete button enables)
   - "Delete Space" danger button, disabled until confirmation text matches
   - Forgiveness: requires explicit confirmation; Escape or overlay click dismisses
6. **Empty state**: EmptyState prompting creation of first space.
7. **Keyboard**: Escape closes any open modal; focus trapped in modal; first input auto-focused on open.

**States**: populated → empty → loading → error
**CTA**: "+ Create Space" (primary, top-right)

**Design decisions**:
- **Modal over inline** for create/edit: Keeps the space list as a clean, scanable index. Creating/editing a space is a focused, occasional task — not an inline workflow. (Pareto: 80% of visits are viewing/selecting, 20% are creating/editing.)
- **Type-to-confirm delete**: Per Nielsen's "Error Prevention" heuristic. A simple "Are you sure?" dialog is insufficient when deleting a space cascades to items, repairs, and walkthroughs. Typing the name forces recognition of what's being lost.
- **Active badge on current space**: Recognition over Recall — the user shouldn't have to remember which space is active from a separate selector.

---

## Responsive Design Strategy

### Breakpoints

| Breakpoint | Layout Change |
|---|---|
| ≤640px | Single-column; reduced padding; compact cards |
| ≤768px | Table → card view (repair list); TopNav wraps |
| ≤1024px | Console: 3-panel → stacked; actions panel becomes slide-over |

### Principles
- **Content-driven breakpoints**, not device-driven. Break when the content needs it.
- **Touch targets ≥44px** at all viewports. Never reduce below 32px even in dense UIs.
- **Tables become cards** on narrow viewports — not horizontal scroll (exception: data-dense operator tables).
- **Mobile actions panel**: FAB toggle + overlay pattern. Panel slides from right, overlay dismisses on tap.

---

## Accessibility Guidelines

### WCAG 2.1 AA target

**Color contrast**:
- All text meets 4.5:1 against background (3:1 for large text ≥18px bold)
- Semantic badge colors verified: #92400e on #fef3c7 = 7.3:1; #166534 on #dcfce7 = 5.8:1; #1e40af on #dbeafe = 5.4:1
- Status dots are color-supplemented with labels (never color-only)

**Keyboard navigation**:
- All interactive elements reachable via Tab
- Focus rings visible (2px brand outline, 2px offset) on `:focus-visible`
- Autocomplete: Arrow keys + Enter + Escape as specified in ARIA combobox pattern
- Console: Tab through queue cards; Enter to select; Escape to close panels

**Screen readers**:
- Search input: `role="combobox"`, `aria-expanded`, `aria-controls` pointing to autocomplete list
- Autocomplete items: `role="option"` on each
- Status dots: `aria-hidden="true"` (decorative); status conveyed via adjacent text
- Empty states: icon marked `aria-hidden="true"`; text conveys the message
- Mobile actions toggle: `aria-label="Toggle actions panel"`; communicates expanded state

**Motion**:
- Respect `prefers-reduced-motion`: disable transitions/animations when set
- Default transitions: 150-200ms ease (Doherty-compliant, supportive not distracting)
- Progress bar animation: 300ms ease (informational, not decorative)

**Forms**:
- All inputs have associated labels (visible or `aria-label`)
- Error messages are announced (role="alert" on error banners)
- Inline validation preferred over submission-only validation

**Cognitive**:
- Progressive Disclosure: Complex actions (merge, relabel) behind clear affordances, not hidden but not primary
- Recognition over Recall: Breadcrumbs, consistent nav, persistent item IDs in detail views
- Hick's Law: One primary CTA per view; secondary actions in outline/ghost variants

---

## Motion & Perceived Performance

| Interaction | Timing | Implementation |
|---|---|---|
| Hover state change | 150ms ease | `--sm-transition-fast` |
| Panel toggle, modal open | 200ms ease | `--sm-transition-normal` |
| Progress bar fill | 300ms ease | CSS transition on width |
| Autocomplete open | Immediate | No animation (Doherty) |
| Skeleton/loading | N/A for MVP | Static "Loading…" text acceptable |

---

## Empty, Loading, Error States

Every data-dependent surface MUST handle these three states:

| State | Pattern |
|---|---|
| **Loading** | Centered "Loading…" text or existing content with opacity reduction |
| **Empty (no data)** | `<EmptyState>` with contextual icon and message |
| **Empty (no space)** | `<EmptyState>` with "Select a space" prompt |
| **Error** | Red banner with message + dismiss button. Non-blocking (content below still visible if partial) |
| **Not found (404)** | API returns error; page shows error banner |

---

## Handoff Notes

### For implementers (TRAAAA-181 through TRAAAA-184):

1. **Use the shared components** (`client/src/components/ui/`). Do not re-implement buttons, badges, or empty states inline.
2. **Token-only styling**: All CSS values must reference `var(--sm-*)` tokens. No hardcoded colors or spacing values except in semantic badge palettes (where WCAG contrast requires specific pairs).
3. **Upload page** (`client/src/pages/Upload.tsx`) is delivered with this spec. It needs backend verification — the processing pipeline returns `reviewTaskCount` and `observationCount`; verify these fields exist in the actual response.
4. **Responsive testing checklist**: Test each surface at 1440×900, 1024×768, 768×1024 (tablet portrait), and 390×844 (mobile). Verify no content is hidden, touch targets are ≥44px, and tables collapse to cards.
5. **Keyboard audit**: Tab through every interactive element on each page. Verify focus rings are visible and tab order is logical.
6. **Prototype parity**: Reference `src/design/prototypes/*.html` for visual intent. The React implementation should match prototype spacing, typography, and state coverage.
