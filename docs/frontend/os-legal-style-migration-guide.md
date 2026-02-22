# OS-Legal-Style Migration Guide

This guide documents the patterns, design language, and practical steps for migrating OpenContracts frontend components from Semantic UI to `@os-legal/ui` (OS-Legal-Style).

## Design Philosophy

OS-Legal-Style is built on three principles:

1. **Transparent Infrastructure** — Clarity through structure, not decoration. Subtle shadows (0.03–0.06 opacity) define boundaries instead of heavy borders.
2. **Visible Connections** — Emphasize relationships between documents, annotations, and data.
3. **Warm Precision** — Professional polish with approachability. Serif headlines (Georgia) for gravitas, Inter for UI text.

The overall aesthetic is clean, spacious, and content-forward. Pages use a light gray background (`#fafafa`), white content cards, and teal (`#0f766e`) as the primary accent.

## Global Setup

Styles from `@os-legal/ui` are injected once in `frontend/src/index.tsx`:

```typescript
import { allStyles } from "@os-legal/ui";

const styleElement = document.createElement("style");
styleElement.id = "opencontracts-ui-styles";
styleElement.textContent = allStyles;
document.head.appendChild(styleElement);
```

The library exposes CSS custom properties prefixed with `--oc-` (spacing, radius, colors, shadows, easing). Use these in styled-components wherever possible — they keep the codebase consistent and let the design system evolve in one place.

## Canonical Page Layout

Every refactored view follows the same outer structure. Study `DiscoveryLanding.tsx` and `Documents.tsx` as the gold-standard references.

```typescript
const PageContainer = styled.div`
  height: 100%;
  background: #fafafa;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  overflow-y: auto;
  overflow-x: hidden;
`;

const ContentContainer = styled.main`
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 24px 80px;

  @media (max-width: 768px) {
    padding: 32px 16px 60px;
  }
`;
```

Within `ContentContainer`, pages are composed of `<Section>` blocks separated by consistent vertical spacing (`margin-bottom: 56px`). Each section with a heading uses the `SectionHeader` pattern:

```typescript
<SectionHeader>
  <SectionTitle>Featured Collections</SectionTitle>
  <SectionLink href="/corpuses">View all <ChevronIcon /></SectionLink>
</SectionHeader>
```

Section titles use Georgia serif at 24px in teal. This pattern repeats identically across the discover page, documents view, and corpus list.

## Typography

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| Page title (hero) | Georgia, serif | 42–48px | 400 | `#1e293b`, accent word in `#0f766e` |
| Section title | Georgia, serif | 24px | 400 | `#0f766e` |
| Body / subtitle | Inter, sans-serif | 17–18px | 400 | `#64748b` |
| UI text | Inter, sans-serif | 13–14px | 500–600 | `#1e293b` / `#475569` |
| Metadata / caption | Inter, sans-serif | 11–12px | 500–600 | `#94a3b8` |
| Uppercase labels | Inter, sans-serif | 11px | 600 | `var(--oc-fg-tertiary)`, `letter-spacing: 0.05em` |

## Color Palette

**Primary accent**: `#0f766e` (teal) — used for highlighted title words, section headers, active states, selected borders.

**Neutral scale** (most-used in refactored components):
- `#1e293b` — headings, primary text
- `#475569` — secondary text, metadata
- `#64748b` — subtitles, tertiary text
- `#94a3b8` — captions, disabled text, icons
- `#e2e8f0` — borders, dividers
- `#f1f5f9` — hover backgrounds, subtle fills
- `#f8fafc` — off-white backgrounds
- `#fafafa` — page background

**Semantic colors**: green `#16a34a` (success), red `#dc2626` (danger), orange `#f59e0b` (warning), blue `#2563eb` (info).

### Design Token Constants

`frontend/src/assets/configurations/osLegalStyles.ts` exports three typed constant objects that centralize the design system:

- **`OS_LEGAL_COLORS`** — accent, text scale, surface/border, selection states, drag-and-drop feedback, folder theming, danger/success. Includes WCAG contrast notes (accent on white = 4.57:1 AA-compliant; `textMuted` on white = 2.78:1, large text only).
- **`OS_LEGAL_TYPOGRAPHY`** — `fontFamilySerif` (Georgia) and `fontFamilySans` (Inter) stacks.
- **`OS_LEGAL_SPACING`** — `borderRadiusCard` (12px), `borderRadiusButton` (8px), `shadowCard`, `shadowCardHover`.

Use these tokens in new styled-components for consistency. Example:

```typescript
import { OS_LEGAL_COLORS, OS_LEGAL_SPACING } from "../../assets/configurations/osLegalStyles";

const Card = styled.div<{ $isSelected?: boolean }>`
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${(props) => props.$isSelected ? OS_LEGAL_COLORS.selectedBorder : OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
  box-shadow: ${OS_LEGAL_SPACING.shadowCard};

  &:hover {
    box-shadow: ${OS_LEGAL_SPACING.shadowCardHover};
  }
`;
```

**Project theme tokens** (`frontend/src/theme/colors.ts`): The `color.N*` neutral scale and `color.O*`, `color.B*` etc. are used for themed contexts (leaderboard badges, charts). For new refactored views, prefer `OS_LEGAL_COLORS` or the `--oc-*` CSS variables.

## Component Replacement Map

| Semantic UI | OS-Legal-Style Replacement | Notes |
|---|---|---|
| `<Button>` | `<Button>` from `@os-legal/ui` | Props: `variant="primary"\|"secondary"`, `size="sm"`, `leftIcon`, `loading` |
| `<Modal>` + `<Modal.Content>` + `<Modal.Actions>` | `<Modal>` + `<ModalHeader>` + `<ModalBody>` + `<ModalFooter>` | Flat composition, no compound components |
| `<Input>` / `<Form.Input>` | `<Input>` from `@os-legal/ui` | Props: `label`, `size="lg"`, `fullWidth`, `helperText` |
| `<Form.TextArea>` | `<Textarea>` from `@os-legal/ui` | Props: `autoResize`, `maxRows` |
| `<Card>` / `<Card.Content>` | Custom styled-components | Build cards from plain `<div>` with styled-components |
| `<Dropdown>` | `<FilterTabs>` (for tab-style filters) or custom select | No 1:1 replacement; depends on use case |
| `<Icon name="...">` | Lucide React icons | `import { FileText, User, Plus } from "lucide-react"` |
| `<Label>` | `<Chip>` from `@os-legal/ui` | Props: `size="sm"`, `variant="soft"\|"filled"`, `color` |
| `<Loader>` / `<Dimmer>` | `<Spinner>` from `@os-legal/ui` or shimmer skeleton | Use skeletons for content areas, Spinner for overlay |
| `<Segment>` | Plain styled `<div>` | Segments are just boxes — use FormSection pattern |
| `<Popup>` | `<Tooltip>` or custom popover | |
| `<Menu>` | `<NavBar>` (for nav) or custom styled menu | |
| `<Checkbox>` | `<Checkbox>` (Semantic UI still used in Documents.tsx) | This is a remaining migration item |

## The Four Integration Patterns

### 1. Direct Composition (cleanest)

Use OS-Legal components as-is with no wrapper styling. This is the target for simple, self-contained components.

```typescript
// CategoryFilter.tsx — zero custom CSS
import { FilterTabs } from "@os-legal/ui";
import type { FilterTabItem } from "@os-legal/ui";

const items: FilterTabItem[] = data.map(({ node }) => ({
  id: node.id,
  label: node.name,
  count: node.corpusCount > 0 ? node.corpusCount : undefined,
}));

<FilterTabs items={items} value={selectedCategory || "all"} onChange={handleChange} variant="pill" size="md" />
```

**When to use**: FilterTabs, SearchBox, CollectionCard/CollectionList, StatBlock/StatGrid, ActivityFeed, NavBar.

### 2. Wrapper Override (for sizing/layout adjustments)

Wrap an OS-Legal component in a styled `<div>` that targets its CSS classes (`.oc-*`) to adjust sizing or spacing. Use sparingly.

```typescript
// StatsSection.tsx — override font size only
const StatsWrapper = styled.div`
  [class*="StatBlock"] > *:first-child,
  [data-testid="stat-value"] {
    font-size: 42px !important;
  }
`;

<StatsWrapper>
  <StatGrid columns={2}>
    <StatBlock value="142" label="Contributors" sublabel="from the community" />
  </StatGrid>
</StatsWrapper>
```

**When to use**: When the component's built-in sizing/spacing doesn't match the design, but behavior is correct.

### 3. Hybrid Composition (OS-Legal atoms + custom layout)

Use OS-Legal for atomic elements (Avatar, Chip, Button) inside a custom styled-component layout.

```typescript
// CompactLeaderboard.tsx
import { Avatar, Chip } from "@os-legal/ui";

const LeaderboardRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.5rem;
  /* ... */
`;

<LeaderboardRow>
  <RankChip $rank={rank}>{rank}</RankChip>
  <Avatar size="sm" fallback={getInitials(user.name)}
    style={{ backgroundColor: getAvatarColor(user.id), color: "white" }} />
  <Username>{user.name}</Username>
</LeaderboardRow>
```

**When to use**: Cards, list items, custom data displays — anywhere OS-Legal doesn't have a matching composite component.

### 4. Adapter Pattern (modal/complex components bridging old and new)

For complex OS-Legal components (Modal) that need to coexist with not-yet-migrated sub-components (Semantic UI dropdowns), use a wrapper that overrides both OS-Legal and Semantic UI CSS.

```typescript
// CorpusModal.tsx — bridges OS-Legal Modal with Semantic UI dropdowns
const StyledModalWrapper = styled.div`
  .oc-modal-overlay { padding: var(--oc-spacing-md); }
  .oc-modal { width: 100%; max-width: 640px; }
  .oc-modal-body { background: var(--oc-bg-subtle, #f1f5f9); }

  /* Ensure Semantic UI dropdowns appear above modal content */
  .ui.dropdown .menu { z-index: 1000 !important; }
`;
```

**When to use**: When the component being refactored still depends on un-migrated child components that use Semantic UI.

## Step-by-Step Migration Checklist

For each file being refactored:

1. **Read the existing component** — understand its props, state, and Semantic UI dependencies.
2. **Replace imports**:
   - `semantic-ui-react` → `@os-legal/ui` for available components (Button, Modal, Input, etc.)
   - `Icon name="..."` → named import from `lucide-react` (e.g., `<Icon name="plus" />` → `<Plus size={16} />`)
3. **Flatten compound components** — `Card.Content`, `Modal.Actions` etc. become plain styled divs.
4. **Remove `!important` overrides** — if you need `!important` to fight Semantic UI defaults, you're still using Semantic UI. Pure styled-components don't need it (exception: wrapper overrides on `.oc-*` classes, which is acceptable).
5. **Use transient props** — styled-components that receive boolean/enum props should use the `$` prefix (`$isSelected`, `$variant`, `$active`) to prevent DOM warnings.
6. **Apply the canonical layout** — `PageContainer` → `ContentContainer` → `Section` blocks. Copy from `DiscoveryLanding.tsx`.
7. **Add loading skeletons** — replace `<Loader>` / `<Dimmer>` with shimmer skeletons that match the shape of real content. Reuse the shimmer keyframe pattern from `FeaturedCollections.tsx`.
8. **Handle responsive breakpoints** — standard breakpoints are `768px` (mobile) and `1024px` (tablet). The CorpusModal also uses `MOBILE_VIEW_BREAKPOINT` (640px) for bottom-sheet behavior.
9. **Use CSS variables** — for anything inside modals or form sections, prefer `var(--oc-spacing-*)`, `var(--oc-radius-*)`, `var(--oc-bg-*)` over hardcoded values.
10. **Verify** — run `yarn lint`, `yarn build`, and `yarn test:ct --reporter=list` before committing.

## Common Pitfalls

- **Semantic UI CSS bleed**: Global Semantic UI styles can interfere with OS-Legal components. If something looks wrong, check for `.ui.*` selectors applying unwanted styles. The fix is usually a scoped override in a styled wrapper.
- **Dropdown z-index in modals**: Semantic UI dropdowns inside OS-Legal modals need `z-index: 1000 !important` on `.ui.dropdown .menu`.
- **iOS zoom on input focus**: Inputs in mobile modals must be `font-size: 16px` minimum to prevent Safari auto-zoom.
- **`count` type mismatch on FilterTabs**: The `FilterTabItem.count` field expects `string | undefined`, not `number`. Cast with `String(count)`.
- **Don't mix icon systems**: A component should use either lucide-react or Semantic UI icons, never both. Lucide is the target.

## Remaining Migration Surface

As of this writing, ~180 files still import from `semantic-ui-react`. Priority targets:

| Area | Key Components | Difficulty |
|---|---|---|
| Dropdown selectors (LabelSet, Embedder, Corpus filters) | `FilterToLabelSelector`, `FilterToCorpusSelector`, `LabelSetSelector` | Medium — need custom Select or Combobox |
| Analysis cards & trays | `AnalysisItem`, `AnalysesCards`, `AnalysisTraySelector` | Medium — Card → styled-components |
| Modals (edit, confirm, relation) | `EditLabelModal`, `RelationModal`, `ConfirmModal` | Low — swap to OS-Legal Modal |
| PDF annotation toolbar | `ActionBar`, annotation controls | High — complex interaction patterns |
| Admin panels | `GlobalAgentManagement`, `BadgeConfigurator` | Low-Medium — forms + cards |
| Context menus | `Menu` + `Menu.Item` in Documents.tsx | Low — replace with custom styled menu |
| Checkbox | `Checkbox` from Semantic UI in Documents.tsx | Low — swap or keep temporarily |

## Reference Files

These files represent the best examples of completed migration:

| File | Pattern Demonstrated |
|---|---|
| `src/views/DiscoveryLanding.tsx` | Full page layout, section composition, data orchestration |
| `src/components/landing/CategoryFilter.tsx` | Direct composition (zero custom CSS) |
| `src/components/landing/StatsSection.tsx` | Wrapper override pattern |
| `src/components/landing/FeaturedCollections.tsx` | Hybrid composition (CollectionCard + custom layout) |
| `src/components/landing/CompactLeaderboard.tsx` | Hybrid composition (Avatar + Chip in custom list) |
| `src/components/landing/NewHeroSection.tsx` | SearchBox + FilterTabs integration |
| `src/components/corpuses/CorpusModal.tsx` | Adapter pattern (Modal with CSS variable theming) |
| `src/components/layout/NavMenu.tsx` | NavBar integration with custom login actions |
| `src/views/Documents.tsx` | Full view migration with mixed old/new (context menu still Semantic) |
