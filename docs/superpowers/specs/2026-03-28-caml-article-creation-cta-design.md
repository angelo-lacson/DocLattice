# CAML Article Creation CTA Design

## Goal

Provide two entry points for creating a `Readme.CAML` corpus article when one doesn't exist yet, visible only to users with edit permissions.

## Problem

Currently there's a chicken-and-egg issue: the CAML article editor is only accessible via the "Edit" button on an existing article view. Users with no article can't reach the editor at all without uploading a file manually.

## Design

### 1. Landing View CTA

**Location**: `CorpusLandingView.tsx`, between the description and chat bar sections.

**Visibility condition**: `!hasArticle && canEdit` (where `canEdit` is already derived from `myPermissions` including `CAN_UPDATE`, and `hasArticle` is already queried via `GET_CORPUS_ARTICLE`).

**Appearance**: A lightweight dashed-border card, horizontally centered like the other landing content. Contains:
- `BookOpen` icon (already imported in the file)
- "Create an introductory article" as primary text
- "Write a rich article for this corpus using CAML" as muted subtitle
- The whole card is clickable

**Behavior**: On click, calls `onViewArticle` — but we need a new callback since the article view doesn't exist yet. Instead, add a new prop `onCreateArticle` to `CorpusLandingViewProps` that opens the editor directly. The parent (`CorpusHome`) wires this to `onEditArticle` (which triggers `setShowArticleEditor(true)` in `Corpuses.tsx`).

**Styled component**: A new `CreateArticleCTA` styled component in `CorpusLandingView.tsx` — dashed border, rounded corners, centered content, hover state with slight background change. Follows existing landing view styling patterns.

### 2. Document Grid Placeholder Tile

**Location**: `CorpusDocumentCards.tsx`, added to the `prefixItems` array (same pattern as `FolderCard` and `ParentFolderCard`).

**Visibility condition**: No `Readme.CAML` document exists in the current corpus AND the user has `CAN_UPDATE` permission on the corpus. The component queries `GET_CORPUS_ARTICLE` to check (Apollo cache will deduplicate with other queries for the same data).

**Appearance**: A card matching `ModernDocumentItem` dimensions with:
- Dashed border, muted background
- `BookOpen` or `FilePlus` icon
- "Readme.CAML" as title
- "Create a corpus article" as description
- Supports both `card` and `list` view modes

**Implementation**: A new `CreateArticlePlaceholder` component in `frontend/src/components/documents/CreateArticlePlaceholder.tsx`. This follows the `FolderCard` pattern — a self-contained card component that is inserted into `prefixItems`.

**Behavior**: On click, calls an `onCreateArticle` callback prop, which the parent (`CorpusDocumentCards`) receives and passes through. The callback chain: `CreateArticlePlaceholder.onClick` -> `CorpusDocumentCards.onCreateArticle` -> `Corpuses.tsx` `setShowArticleEditor(true)`.

### 3. Props Threading

**New props needed**:
- `CorpusLandingViewProps`: Add `onCreateArticle?: () => void`
- `CorpusDocumentCards` / `DocumentCards`: Add `onCreateArticle?: () => void`
- `CorpusHomeProps`: Already has `onEditArticle` — reuse this for the landing CTA

**In `CorpusHome.tsx`**: When rendering `CorpusLandingView`, pass `onCreateArticle={onEditArticle}` (only when `onEditArticle` is defined, which implies user has edit rights).

**In `Corpuses.tsx`**: Pass `onCreateArticle={() => setShowArticleEditor(true)}` to `CorpusDocumentCards`.

### 4. Disappearance After Creation

Both CTAs query `GET_CORPUS_ARTICLE`. After the editor saves via `UPLOAD_DOCUMENT`, the `onUpdate` callback triggers a `refetch()` of the article query. Apollo cache invalidation propagates to all components watching that query — both the landing CTA and the document placeholder will re-evaluate their visibility condition and disappear.

### 5. Permission Model

- **Landing CTA**: Uses `canEdit` already computed in `CorpusLandingView` from `fullCorpus.myPermissions`
- **Document placeholder**: `CorpusDocumentCards` needs corpus permission access. It already receives `opened_corpus` or can derive permissions from the corpus object available in its parent scope. Pass `canUpdate` as a prop.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/corpuses/CorpusHome/CorpusLandingView.tsx` | Add `CreateArticleCTA` styled component and conditional render |
| `frontend/src/components/corpuses/CorpusHome.tsx` | Pass `onCreateArticle={onEditArticle}` to landing view |
| `frontend/src/components/documents/CreateArticlePlaceholder.tsx` | **New file** — placeholder tile component |
| `frontend/src/components/documents/CorpusDocumentCards.tsx` | Add placeholder to `prefixItems` when conditions met |
| `frontend/src/views/Corpuses.tsx` | Thread `onCreateArticle` callback to document cards |

## Testing

- **Playwright CT test**: Mount `CorpusLandingView` wrapper with `canEdit=true` and no article mock — verify CTA renders. Mount with `canEdit=false` — verify CTA absent.
- **Playwright CT test**: Mount `CorpusDocumentCards` wrapper with `canUpdate=true` and no article — verify placeholder tile appears first in the grid. Mount with article present — verify placeholder absent.
- **Screenshots**: `caml--landing--create-cta` and `caml--documents--create-placeholder`

## Out of Scope

- Editor changes (already handles create flow)
- Backend changes (none needed)
- New GraphQL queries (reuses existing `GET_CORPUS_ARTICLE`)
