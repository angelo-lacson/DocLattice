# CAML Article Creation CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two entry points for creating a Readme.CAML article when one doesn't exist — a subtle CTA on the landing view and a placeholder tile in the document grid — visible only to users with edit permissions.

**Architecture:** The landing CTA is a styled component inside `CorpusLandingView` that conditionally renders when `!hasArticle && canEdit`. The document placeholder is a new `CreateArticlePlaceholder` component injected into `CorpusDocumentCards`'s `prefixItems` array. Both call the existing `setShowArticleEditor(true)` callback chain.

**Tech Stack:** React, styled-components, Apollo Client (GET_CORPUS_ARTICLE query), Playwright CT, docScreenshot

---

### Task 1: Add CreateArticlePlaceholder component

**Files:**
- Create: `frontend/src/components/documents/CreateArticlePlaceholder.tsx`

- [ ] **Step 1: Create the placeholder component**

Create `frontend/src/components/documents/CreateArticlePlaceholder.tsx`:

```tsx
/**
 * CreateArticlePlaceholder — Ghost tile shown in the document grid when
 * no Readme.CAML exists and the user has edit permissions.
 *
 * Follows the FolderCard pattern: a self-contained card inserted into
 * DocumentCards' prefixItems array.
 */
import React from "react";
import styled from "styled-components";
import { BookOpen } from "lucide-react";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_SPACING,
  OS_LEGAL_SHADOWS,
} from "../../assets/configurations/osLegalStyles";

// ---------------------------------------------------------------------------
// Card view (matches FolderCard / ModernDocumentItem 200px height)
// ---------------------------------------------------------------------------

const CardContainer = styled.div`
  position: relative;
  background: ${OS_LEGAL_COLORS.surface};
  border: 2px dashed ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
  overflow: hidden;
  transition: all 0.2s ease;
  cursor: pointer;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
  padding: 1rem;

  &:hover {
    border-color: ${OS_LEGAL_COLORS.accent};
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }
`;

const IconCircle = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${OS_LEGAL_COLORS.textMuted};
`;

const Title = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const Subtitle = styled.span`
  font-size: 0.6875rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  max-width: 180px;
`;

// ---------------------------------------------------------------------------
// List view (matches ModernDocumentItem list row)
// ---------------------------------------------------------------------------

const ListContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 2px dashed ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${OS_LEGAL_COLORS.accent};
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }
`;

const ListTitle = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const ListSubtitle = styled.span`
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textMuted};
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateArticlePlaceholderProps {
  viewMode?: "modern-card" | "modern-list";
  onClick: () => void;
}

export const CreateArticlePlaceholder: React.FC<
  CreateArticlePlaceholderProps
> = ({ viewMode = "modern-card", onClick }) => {
  if (viewMode === "modern-list") {
    return (
      <ListContainer
        onClick={onClick}
        data-testid="create-article-placeholder"
      >
        <IconCircle>
          <BookOpen size={18} />
        </IconCircle>
        <div>
          <ListTitle>Readme.CAML</ListTitle>
          <br />
          <ListSubtitle>Create a corpus article</ListSubtitle>
        </div>
      </ListContainer>
    );
  }

  return (
    <CardContainer onClick={onClick} data-testid="create-article-placeholder">
      <IconCircle>
        <BookOpen size={20} />
      </IconCircle>
      <Title>Readme.CAML</Title>
      <Subtitle>Create a corpus article</Subtitle>
    </CardContainer>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/documents/CreateArticlePlaceholder.tsx
git commit -m "Add CreateArticlePlaceholder component for document grid"
```

---

### Task 2: Wire placeholder into CorpusDocumentCards

**Files:**
- Modify: `frontend/src/components/documents/CorpusDocumentCards.tsx`
- Modify: `frontend/src/views/Corpuses.tsx`

- [ ] **Step 1: Add props and article query to CorpusDocumentCards**

In `frontend/src/components/documents/CorpusDocumentCards.tsx`:

1. Add imports at the top:

```typescript
import { CreateArticlePlaceholder } from "./CreateArticlePlaceholder";
import {
  GET_CORPUS_ARTICLE,
  GetCorpusArticleInput,
  GetCorpusArticleOutput,
} from "../../graphql/queries";
import { CAML_ARTICLE_FILENAME } from "../../assets/configurations/constants";
import { useMemo } from "react";
```

2. Extend the props interface (around line 45):

```typescript
interface CorpusDocumentCardsProps {
  opened_corpus_id: string | null;
  viewMode?: ViewMode;
  onCreateArticle?: () => void;
  canUpdate?: boolean;
}
```

3. Destructure new props in the component (around line 50):

```typescript
export const CorpusDocumentCards = ({
  opened_corpus_id,
  viewMode = "modern-list",
  onCreateArticle,
  canUpdate = false,
}: CorpusDocumentCardsProps) => {
```

4. Add the article query inside the component (after existing `useReactiveVar` calls, before the folder query):

```typescript
  // Check if Readme.CAML already exists (for placeholder tile)
  const articleQueryVars = useMemo<GetCorpusArticleInput>(
    () => ({
      corpusId: opened_corpus_id || "",
      title: CAML_ARTICLE_FILENAME,
    }),
    [opened_corpus_id]
  );

  const { data: articleData } = useQuery<
    GetCorpusArticleOutput,
    GetCorpusArticleInput
  >(GET_CORPUS_ARTICLE, {
    variables: articleQueryVars,
    skip: !opened_corpus_id,
  });

  const hasArticle =
    (articleData?.documents?.edges?.length ?? 0) > 0 &&
    !!articleData?.documents?.edges[0]?.node?.txtExtractFile;
```

5. Add the placeholder to `prefixItems` (after the folder cards loop, around line 302, before the `return`):

```typescript
  // Add "Create article" placeholder if no Readme.CAML exists and user can edit
  if (!hasArticle && canUpdate && onCreateArticle && !selected_folder_id) {
    prefixItems.push(
      <CreateArticlePlaceholder
        key="create-article"
        viewMode={viewMode === "modern-list" ? "modern-list" : "modern-card"}
        onClick={onCreateArticle}
      />
    );
  }
```

Note: Only shown at root folder level (`!selected_folder_id`) — doesn't make sense inside subfolders.

- [ ] **Step 2: Pass onCreateArticle and canUpdate from Corpuses.tsx**

In `frontend/src/views/Corpuses.tsx`, find the `<CorpusDocumentCards` JSX (around line 2424). Change:

```tsx
                  <CorpusDocumentCards
                    opened_corpus_id={opened_corpus_id}
                    viewMode={documentsViewMode}
                  />
```

to:

```tsx
                  <CorpusDocumentCards
                    opened_corpus_id={opened_corpus_id}
                    viewMode={documentsViewMode}
                    onCreateArticle={() => setShowArticleEditor(true)}
                    canUpdate={canUpdate}
                  />
```

`canUpdate` is already available in the `CorpusQueryView` component scope (it's a prop).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/documents/CorpusDocumentCards.tsx frontend/src/views/Corpuses.tsx
git commit -m "Wire CreateArticlePlaceholder into document grid"
```

---

### Task 3: Add landing view CTA

**Files:**
- Modify: `frontend/src/components/corpuses/CorpusHome/CorpusLandingView.tsx`
- Modify: `frontend/src/components/corpuses/CorpusHome.tsx`

- [ ] **Step 1: Add CreateArticleCTA styled component and render logic**

In `frontend/src/components/corpuses/CorpusHome/CorpusLandingView.tsx`:

1. Add a new styled component after the existing styled imports (around line 57, after the `} from "./styles"` import):

```typescript
const CreateArticleCTA = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 1rem 1.25rem;
  margin-top: 0.5rem;
  background: none;
  border: 2px dashed ${OS_LEGAL_COLORS.border};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;

  &:hover {
    border-color: ${OS_LEGAL_COLORS.accent};
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }
`;

const CTAIconCircle = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${OS_LEGAL_COLORS.textMuted};
  flex-shrink: 0;
`;

const CTATextGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const CTATitle = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const CTASubtitle = styled.span`
  font-size: 0.6875rem;
  color: ${OS_LEGAL_COLORS.textMuted};
`;
```

2. Add `OS_LEGAL_COLORS` to the imports from `osLegalStyles` if not already there. It is NOT currently imported — add:

```typescript
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";
```

3. Add `onCreateArticle` to the props interface (around line 78, after `onViewArticle`):

```typescript
  /** Callback when "Create Article" CTA is clicked */
  onCreateArticle?: () => void;
```

4. Destructure `onCreateArticle` in the component (around line 116, after `onViewArticle`):

```typescript
  onCreateArticle,
```

5. Add the CTA render between the description and the chat section. Find the `{/* Chat section */}` comment (line 342) and insert BEFORE it:

```tsx
        {/* Create article CTA — shown when no Readme.CAML and user can edit */}
        {!hasArticle && canEdit && onCreateArticle && (
          <CreateArticleCTA
            onClick={onCreateArticle}
            data-testid={`${testId}-create-article-cta`}
          >
            <CTAIconCircle>
              <BookOpen size={16} />
            </CTAIconCircle>
            <CTATextGroup>
              <CTATitle>Create an introductory article</CTATitle>
              <CTASubtitle>
                Write a rich article for this corpus using CAML
              </CTASubtitle>
            </CTATextGroup>
          </CreateArticleCTA>
        )}
```

- [ ] **Step 2: Pass onCreateArticle from CorpusHome**

In `frontend/src/components/corpuses/CorpusHome.tsx`, find the `<CorpusLandingView` JSX (around line 197). Add the new prop:

```tsx
      onCreateArticle={onEditArticle}
```

alongside the existing props like `onViewArticle={handleViewArticle}`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/corpuses/CorpusHome/CorpusLandingView.tsx frontend/src/components/corpuses/CorpusHome.tsx
git commit -m "Add create-article CTA to corpus landing view"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run TypeScript**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 2: Run pre-commit**

```bash
pre-commit run --all-files
```
Expected: All pass (or only the pre-existing pyupgrade issue).

- [ ] **Step 3: Run unit tests**

```bash
cd frontend && yarn test:unit --run
```
Expected: All pass (880+).

- [ ] **Step 4: Run CAML component tests**

```bash
cd frontend && yarn test:ct --reporter=list -g "CamlArticle|CorpusArticleView|Article as Landing"
```
Expected: All 20 pass.
