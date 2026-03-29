# CAML NPM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch from local `link:` CAML packages to published npm versions, wire up corpus stats, update editor template with new block types (map, case-history), fix broken test imports, and add screenshot tests.

**Architecture:** The `@os-legal/caml` (parser) and `@os-legal/caml-react` (renderer) packages are already integrated via `link:` protocol. This plan switches to npm `^0.0.1`, fixes test wrappers that still import from deleted in-tree paths, threads stats data through to `CamlArticle`, updates the editor template, and adds Playwright screenshot tests for new block types.

**Tech Stack:** yarn, @os-legal/caml, @os-legal/caml-react, Playwright CT, docScreenshot utility

---

### Task 1: Switch package.json from link: to npm versions

**Files:**
- Modify: `frontend/package.json:14-15,129`

- [ ] **Step 1: Update dependencies**

In `frontend/package.json`, change lines 14-15 from:
```json
"@os-legal/caml": "link:../../os-legal-caml/packages/caml",
"@os-legal/caml-react": "link:../../os-legal-caml/packages/caml-react",
```
to:
```json
"@os-legal/caml": "^0.0.1",
"@os-legal/caml-react": "^0.0.1",
```

- [ ] **Step 2: Remove resolutions override**

In `frontend/package.json`, remove line 129:
```json
"@os-legal/caml": "link:../../os-legal-caml/packages/caml",
```
from the `"resolutions"` block. Keep the other resolutions entries intact.

- [ ] **Step 3: Install dependencies**

Run:
```bash
cd frontend && yarn install
```
Expected: Clean install, lockfile updated with npm registry versions.

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors. If there are type mismatches between the local dev version and the published version, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/yarn.lock
git commit -m "Switch @os-legal/caml packages from link: to npm ^0.0.1"
```

---

### Task 2: Fix broken test wrapper imports

The test wrappers still import from deleted in-tree paths (`../src/caml/renderer`, `../src/caml/parser/types`). Fix them to import from the npm packages.

**Files:**
- Modify: `frontend/tests/CamlArticleTestWrapper.tsx:9-10`
- Modify: `frontend/tests/CamlArticle.ct.tsx:21`

- [ ] **Step 1: Fix CamlArticleTestWrapper imports**

In `frontend/tests/CamlArticleTestWrapper.tsx`, change lines 9-10 from:
```typescript
import { CamlArticle } from "../src/caml/renderer";
import type { CamlDocument } from "../src/caml/parser/types";
```
to:
```typescript
import type { CamlDocument } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";
```

- [ ] **Step 2: Add CamlThemeProvider to test wrapper render**

In `frontend/tests/CamlArticleTestWrapper.tsx`, the render function (lines 206-215) currently renders `<CamlArticle>` without a theme provider. Update it to match production usage:

Change:
```tsx
  return (
    <MemoryRouter>
      <div
        style={{ width: "100vw", minHeight: "100vh", background: "#ffffff" }}
        data-testid="caml-article-test-root"
      >
        <CamlArticle document={doc} stats={stats} />
      </div>
    </MemoryRouter>
  );
```
to:
```tsx
  return (
    <MemoryRouter>
      <div
        style={{ width: "100vw", minHeight: "100vh", background: "#ffffff" }}
        data-testid="caml-article-test-root"
      >
        <CamlThemeProvider>
          <CamlArticle document={doc} stats={stats} />
        </CamlThemeProvider>
      </div>
    </MemoryRouter>
  );
```

- [ ] **Step 3: Fix CamlArticle.ct.tsx import**

In `frontend/tests/CamlArticle.ct.tsx`, change line 21 from:
```typescript
import type { CamlDocument } from "../src/caml/parser/types";
```
to:
```typescript
import type { CamlDocument } from "@os-legal/caml";
```

- [ ] **Step 4: Verify existing tests pass**

Run:
```bash
cd frontend && yarn test:ct --reporter=list -g "CamlArticle"
```
Expected: All existing CamlArticle tests pass (hero, cards, pills, tabs, timeline, CTA, dark theme, pullquote, empty doc, corpus stats).

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/CamlArticleTestWrapper.tsx frontend/tests/CamlArticle.ct.tsx
git commit -m "Fix CAML test imports to use @os-legal/caml npm packages"
```

---

### Task 3: Wire up corpus stats to CorpusArticleView

Currently `CorpusArticleView` accepts a `stats` prop but `CorpusHome` never passes it. The stats data is already available in `Corpuses.tsx` and passed to `CorpusHome`.

**Files:**
- Modify: `frontend/src/components/corpuses/CorpusHome.tsx:16-28,57,130-137`

- [ ] **Step 1: Add stats fields to CorpusHomeProps**

In `frontend/src/components/corpuses/CorpusHome.tsx`, the `stats` type (lines 23-28) currently has:
```typescript
  stats: {
    totalDocs: number;
    totalAnnotations: number;
    totalAnalyses: number;
    totalExtracts: number;
  };
```

Add `totalThreads`:
```typescript
  stats: {
    totalDocs: number;
    totalAnnotations: number;
    totalAnalyses: number;
    totalExtracts: number;
    totalThreads: number;
  };
```

- [ ] **Step 2: Destructure stats in CorpusHome component**

In `frontend/src/components/corpuses/CorpusHome.tsx`, add `stats` to the destructured props (line 57 area):

Change:
```typescript
export const CorpusHome: React.FC<CorpusHomeProps> = ({
  corpus,
  onEditDescription,
  onEditArticle,
  chatQuery = "",
```
to:
```typescript
export const CorpusHome: React.FC<CorpusHomeProps> = ({
  corpus,
  onEditDescription,
  onEditArticle,
  stats,
  chatQuery = "",
```

- [ ] **Step 3: Pass stats to CorpusArticleView**

In `frontend/src/components/corpuses/CorpusHome.tsx`, the article view render (lines 130-137) currently doesn't pass stats:
```tsx
      <CorpusArticleView
        corpus={corpus}
        onBack={handleBackToLanding}
        onEditArticle={onEditArticle}
        testId="corpus-home-article"
      />
```

Change to:
```tsx
      <CorpusArticleView
        corpus={corpus}
        onBack={handleBackToLanding}
        onEditArticle={onEditArticle}
        stats={{
          documents: stats.totalDocs,
          annotations: stats.totalAnnotations,
          threads: stats.totalThreads,
        }}
        testId="corpus-home-article"
      />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd frontend && npx tsc --noEmit
```
Expected: No type errors. The `CorpusHomeProps.stats` shape already receives all fields from `Corpuses.tsx`'s `GET_CORPUS_STATS` query result, which includes `totalThreads`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/corpuses/CorpusHome.tsx
git commit -m "Wire corpus stats through to CAML article renderer"
```

---

### Task 4: Update CAML editor template with new block types

Add map and case-history block examples to the `CAML_TEMPLATE` constant in `CamlArticleEditor.tsx` so users see the full range of available blocks.

**Files:**
- Modify: `frontend/src/components/corpuses/CamlArticleEditor.tsx:193-231`

- [ ] **Step 1: Replace CAML_TEMPLATE**

In `frontend/src/components/corpuses/CamlArticleEditor.tsx`, replace the `CAML_TEMPLATE` constant (lines 193-231) with:

```typescript
const CAML_TEMPLATE = `---
version: "1.0"

hero:
  kicker: "Your organization · Interactive analysis"
  title:
    - "Your article"
    - "{title here}"
  subtitle: >
    Write a compelling subtitle that describes what this
    article is about and why readers should care.
  stats:
    - "Documents analyzed"
    - "Key findings"
---

::: chapter {#introduction}
>! Chapter 1
## Getting started

Write your article content here using CAML syntax.
You can use **bold**, *italic*, and [links](https://example.com).

>>> "Use triple blockquotes for pullquotes that stand out."

:::: cards {columns: 2}

- **Key Finding 1** | #0f766e
  Describe the first key finding here.
  ~ Source: Document A

- **Key Finding 2** | #c4573a
  Describe the second key finding here.
  ~ Source: Document B

::::

:::

::: chapter {#case-tracker}
>! Chapter 2
## Case History

:::: case-history
title: Example Case v. Sample Corp
docket: No. 24-cv-01234 (S.D.N.Y.)
status: Pending

- District Court | S.D.N.Y. | 2024-03-15 | Motion to Dismiss | Denied
  Court found sufficient facts to proceed.

- Court of Appeals | 2nd Circuit | 2025-01-20 | Appeal | Pending
  Oral arguments scheduled.

::::

:::

::: chapter {#jurisdiction}
>! Chapter 3
## Jurisdiction Map

:::: map {type: us}
legend:
- Compliant | #0f766e
- Pending | #f59e0b
- Non-compliant | #dc2626

- CA | Compliant
- NY | Compliant
- TX | Pending
- FL | Non-compliant
- IL | Compliant

::::

:::
`;
```

- [ ] **Step 2: Verify editor renders the new template**

Run:
```bash
cd frontend && yarn test:ct --reporter=list -g "CamlArticleEditor"
```
Expected: Existing tests still pass. The "new article" test should find `hero:` and `version:` in the textarea.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/corpuses/CamlArticleEditor.tsx
git commit -m "Update CAML editor template with case-history and map blocks"
```

---

### Task 5: Add map and case-history blocks to test fixture and screenshot tests

Add new block types to `SAMPLE_CAML_DOCUMENT` and write Playwright tests with `docScreenshot` calls.

**Files:**
- Modify: `frontend/tests/CamlArticleTestWrapper.tsx:15-195` (add blocks to fixture)
- Modify: `frontend/tests/CamlArticle.ct.tsx` (add new test describes)

- [ ] **Step 1: Add map block to SAMPLE_CAML_DOCUMENT**

In `frontend/tests/CamlArticleTestWrapper.tsx`, add a new chapter to the `chapters` array in `SAMPLE_CAML_DOCUMENT` (after the timeline chapter, before the closing `]`). Insert before the final `],` on line 194:

```typescript
    {
      id: "jurisdiction",
      kicker: "Chapter 4",
      title: "Jurisdiction Map",
      blocks: [
        {
          type: "map",
          mapType: "us",
          mode: "categorical",
          legend: [
            { label: "Compliant", color: "#0f766e" },
            { label: "Pending", color: "#f59e0b" },
            { label: "Non-compliant", color: "#dc2626" },
          ],
          states: [
            { code: "CA", status: "Compliant" },
            { code: "NY", status: "Compliant", count: 247 },
            { code: "TX", status: "Pending", count: 56 },
            { code: "FL", status: "Non-compliant" },
            { code: "IL", status: "Compliant" },
            { code: "OH", status: "Pending" },
          ],
        },
      ],
    },
    {
      id: "case-tracker",
      kicker: "Chapter 5",
      title: "Case Tracker",
      blocks: [
        {
          type: "case-history",
          title: "SEC v. Meridian Capital Partners LLC",
          docket: "No. 22-cv-04817 (S.D.N.Y.)",
          status: "Affirmed",
          entries: [
            {
              courtLevel: "District Court",
              courtName: "S.D.N.Y.",
              date: "2022-06-10",
              action: "Motion for TRO",
              outcome: "Granted",
              detail: "Court issued TRO freezing defendant assets.",
            },
            {
              courtLevel: "Court of Appeals",
              courtName: "2nd Circuit",
              date: "2023-11-08",
              action: "Appeal",
              outcome: "Affirmed",
            },
            {
              courtLevel: "Supreme Court",
              courtName: "SCOTUS",
              date: "2024-03-25",
              action: "Certiorari",
              outcome: "Cert Denied",
            },
          ],
        },
      ],
    },
```

- [ ] **Step 2: Add map block test with screenshot**

In `frontend/tests/CamlArticle.ct.tsx`, add the following test describe after the "Corpus Stats Block" describe:

```typescript
test.describe("CamlArticle - Map Block", () => {
  test("should render US map with categorical legend and state tiles", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Scroll to map chapter
    await page.getByText("Jurisdiction Map").scrollIntoViewIfNeeded();

    // Legend should render
    await expect(page.getByText("Compliant").first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Pending").first()).toBeVisible();
    await expect(page.getByText("Non-compliant")).toBeVisible();

    // State tiles should render (check for state codes in tiles)
    await expect(page.getByText("CA").first()).toBeVisible();
    await expect(page.getByText("NY").first()).toBeVisible();
    await expect(page.getByText("TX").first()).toBeVisible();

    await docScreenshot(page, "caml--map--categorical");

    await component.unmount();
  });
});
```

- [ ] **Step 3: Add case-history block test with screenshot**

In `frontend/tests/CamlArticle.ct.tsx`, add after the map test:

```typescript
test.describe("CamlArticle - Case History Block", () => {
  test("should render case history with entries and outcome badges", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Scroll to case history chapter
    await page.getByText("Case Tracker").scrollIntoViewIfNeeded();

    // Case title and docket
    await expect(
      page.getByText("SEC v. Meridian Capital Partners LLC")
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("No. 22-cv-04817 (S.D.N.Y.)")
    ).toBeVisible();

    // Status badge
    await expect(page.getByText("Affirmed").first()).toBeVisible();

    // Court entries
    await expect(page.getByText("District Court").first()).toBeVisible();
    await expect(page.getByText("Motion for TRO")).toBeVisible();
    await expect(page.getByText("Granted").first()).toBeVisible();

    // Later entries
    await expect(page.getByText("Court of Appeals").first()).toBeVisible();
    await expect(page.getByText("Cert Denied")).toBeVisible();

    await docScreenshot(page, "caml--case-history--with-entries");

    await component.unmount();
  });
});
```

- [ ] **Step 4: Run all CAML tests**

Run:
```bash
cd frontend && yarn test:ct --reporter=list -g "CamlArticle"
```
Expected: All tests pass including the new map and case-history tests. Screenshots saved to `docs/assets/images/screenshots/auto/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/CamlArticleTestWrapper.tsx frontend/tests/CamlArticle.ct.tsx docs/assets/images/screenshots/auto/
git commit -m "Add map and case-history blocks to CAML test fixture with screenshots"
```

---

### Task 6: Add editor screenshot test with new template

Update the editor screenshot test to capture the updated template that includes map and case-history blocks.

**Files:**
- Modify: `frontend/tests/CamlArticleEditor.ct.tsx`

- [ ] **Step 1: Add test for new template blocks in editor preview**

In `frontend/tests/CamlArticleEditor.ct.tsx`, add a new test describe after the existing "Close Behavior" describe:

```typescript
test.describe("CamlArticleEditor - New Block Types in Template", () => {
  test("should render map and case-history blocks in preview from template", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CamlArticleEditorTestWrapper hasExistingArticle={false} />
    );

    // Wait for editor to load
    await expect(page.getByText("Create Article").first()).toBeVisible({
      timeout: 10000,
    });

    // The textarea should contain the new block types
    const textarea = page.locator("textarea");
    const value = await textarea.inputValue();
    expect(value).toContain("case-history");
    expect(value).toContain("map {type: us}");

    // Preview pane should render these blocks
    // Case history title
    await expect(
      page.getByText("Example Case v. Sample Corp")
    ).toBeVisible({ timeout: 5000 });

    await docScreenshot(page, "caml--editor--full-template", {
      fullPage: true,
    });

    await component.unmount();
  });
});
```

- [ ] **Step 2: Run editor tests**

Run:
```bash
cd frontend && yarn test:ct --reporter=list -g "CamlArticleEditor"
```
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/CamlArticleEditor.ct.tsx docs/assets/images/screenshots/auto/
git commit -m "Add editor screenshot test for map and case-history template blocks"
```

---

### Task 7: Final verification and pre-commit

- [ ] **Step 1: Run TypeScript compilation**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 2: Run linting**

```bash
cd frontend && yarn lint
```
Expected: No errors.

- [ ] **Step 3: Run pre-commit hooks**

```bash
pre-commit run --all-files
```
Expected: All hooks pass.

- [ ] **Step 4: Run full CAML test suite**

```bash
cd frontend && yarn test:ct --reporter=list -g "CamlArticle|CorpusArticleView"
```
Expected: All tests pass, all screenshots generated.

- [ ] **Step 5: Verify screenshots exist**

```bash
ls -la docs/assets/images/screenshots/auto/caml--*
```
Expected: Screenshots for all CAML test scenarios including new `caml--map--categorical.png` and `caml--case-history--with-entries.png`.
