# Article Documents Drawer

## Problem

In Explore mode, the article view has no way to access the corpus document index. The previous approach navigated to `CorpusDetailsView` (`?view=details`), which caused a jarring layout change from the full-bleed article to a two-column layout.

## Design

A right-side slide-out drawer triggered by a "Documents" button in the article toolbar (Explore mode only). The drawer overlays the article, keeping the reading context visible behind a backdrop.

### Toolbar Changes

- **Explore mode**: Single "Documents" button replaces the previous Documents + About buttons
- **Manage mode**: No change (Edit button, sidebar handles navigation)

### Drawer Component: `ArticleDocumentsDrawer`

**Location**: `frontend/src/components/corpuses/CorpusHome/ArticleDocumentsDrawer.tsx`

**Props**:
- `corpusId: string` — corpus to show documents for
- `open: boolean` — controls visibility
- `onClose: () => void` — callback to close

**Layout (desktop, >600px)**:
- `position: fixed`, right side, `width: 400px`, full viewport height
- `z-index: 2001` (matching existing FloatingExtractsPanel convention)
- White background, `border-radius: 16px 0 0 16px`, shadow
- `backdrop-filter: blur(12px)` on the panel

**Layout (mobile, <=600px)**:
- Full width, slides up from bottom
- `height: 85vh`, `border-radius: 16px 16px 0 0`
- Swipe-to-dismiss not required for v1

**Backdrop**:
- Semi-transparent overlay (`rgba(0, 0, 0, 0.3)`)
- Click-to-close
- Covers entire viewport behind the drawer

**Animation**:
- `framer-motion` `AnimatePresence` with slide-in from right (desktop) or bottom (mobile)
- Duration ~0.3s with `ease` curve

**Internal structure**:
```
Backdrop (click to close)
DrawerPanel (motion.div)
  ├── DrawerHeader
  │   ├── "Documents" title
  │   └── Close button (X)
  └── DrawerContent (scrollable)
      └── DocumentTableOfContents
            corpusId={corpusId}
            embedded={true}
            maxDepth={4}
```

### Content

Reuses `DocumentTableOfContents` with `embedded={true}`. This component is self-contained:
- Own GraphQL queries for document list
- Tree hierarchy with expand/collapse
- Keyboard navigation (arrow keys, enter)
- Optional `filterQuery` prop for search (not included in v1, can add later)

Clicking a document navigates to the document viewer via standard routing.

### State Management

Drawer open/close state lives in `CorpusArticleView` as local `useState`. No atoms or URL params needed — this is ephemeral UI state.

### Files Changed

1. **`CorpusArticleView.tsx`** — Add `ArticleDocumentsDrawer`, local open state, "Documents" toolbar button
2. **`CorpusHome.tsx`** — Remove `onViewDetails`/`onViewDocuments` props, pass `corpusId` to CorpusArticleView instead (it already has `corpus` prop)
3. **New file: `ArticleDocumentsDrawer.tsx`** — The drawer component

### Responsive Behavior

| Breakpoint | Drawer width | Position | Animation |
|-----------|-------------|----------|-----------|
| Desktop (>600px) | 400px | Right side, full height | Slide from right |
| Mobile (<=600px) | 100% | Bottom, 85vh | Slide from bottom |

### What's NOT Included

- Search/filter within the drawer (can add later via `filterQuery` prop)
- "About" content in the drawer (article serves this purpose)
- Swipe-to-dismiss on mobile
