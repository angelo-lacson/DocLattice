# E2E Test Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add E2E tests that exercise real CRUD workflows and view interactions to boost frontend Istanbul coverage from ~40% toward ~50%+.

**Architecture:** Two new Playwright spec files — `corpus-workflow.spec.ts` (deep create/upload/navigate flow) and `view-interactions.spec.ts` (shallow interactions on each view + admin routes). Both import from the existing `fixtures.ts` and `helpers.ts`. The workflow spec creates its own data via UI interactions; the interactions spec reuses it (1 worker, shared database).

**Tech Stack:** Playwright, Istanbul (via existing coverage fixture), existing Django+Postgres E2E stack from `test.yml`.

**Key reference files:**
- Existing e2e tests: `frontend/tests/e2e/login-and-navigation.spec.ts`
- Fixtures: `frontend/tests/e2e/fixtures.ts`
- Helpers: `frontend/tests/e2e/helpers.ts`
- Playwright config: `frontend/playwright.config.ts`
- Spec doc: `docs/superpowers/specs/2026-04-16-e2e-coverage-expansion-design.md`

---

### Task 1: Add helper functions to `helpers.ts`

**Files:**
- Modify: `frontend/tests/e2e/helpers.ts`

- [ ] **Step 1: Add ADMIN_VIEWS array and CRUD helpers**

Append the following to `frontend/tests/e2e/helpers.ts`:

```typescript
/**
 * Admin views that require superuser access. Separated from the main
 * VIEWS catalog because the navigation spec runs on an empty database
 * where these are not relevant.
 */
export const ADMIN_VIEWS: ViewSpec[] = [
  {
    path: "/admin/settings",
    name: "GlobalSettings",
    matcher: { kind: "text", text: /Global Settings/i },
    requiresAuth: true,
  },
  {
    path: "/system_settings",
    name: "SystemSettings",
    matcher: { kind: "text", text: /System Settings/i },
    requiresAuth: true,
  },
];

/**
 * Create a corpus via the UI by clicking the Add button on /corpuses,
 * filling the modal, and submitting. Waits for the success toast.
 *
 * Caller must already be authenticated and on a page where spaNavigate works.
 */
export async function createCorpusViaUI(
  page: Page,
  title: string,
  description: string
): Promise<void> {
  await spaNavigate(page, "/corpuses");
  await expectViewVisible(page, { kind: "text", text: /Your\s+corpuses/i });

  // Open the Add dropdown and click "Create Corpus"
  await page.getByLabel("Add").click();
  await page.getByText("Create Corpus").click();

  // Fill the modal form
  await expect(page.locator("#corpus-title")).toBeVisible({ timeout: 10_000 });
  await page.fill("#corpus-title", title);
  await page.fill("#corpus-description", description);

  // Submit — the button text "Create Corpus" appears twice (menu item + modal button).
  // Target the one inside the modal footer.
  await page.locator(".oc-modal-footer button", { hasText: /Create Corpus/i }).click();

  // Wait for the success toast and modal to close
  await expect(page.getByText(/Created corpus/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#corpus-title")).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Upload a plain-text document from the /documents view. Opens the upload
 * modal, attaches a file created from `content`, fills title/description,
 * and submits. Waits for the upload to complete.
 *
 * Caller must already be authenticated.
 */
export async function uploadDocumentViaUI(
  page: Page,
  filename: string,
  content: string,
  title: string,
  description: string
): Promise<void> {
  await spaNavigate(page, "/documents");
  await expectViewVisible(page, { kind: "text", text: /Your\s+documents/i });

  // Click the "Upload" button
  await page.getByRole("button", { name: /^Upload$/i }).click();

  // Wait for the upload modal's file dropzone
  await expect(page.getByTestId("file-dropzone")).toBeVisible({ timeout: 10_000 });

  // Create a text file buffer and attach it via the hidden file input
  const buffer = Buffer.from(content, "utf-8");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer,
  });

  // Wait for the "Details" step to appear
  await expect(page.locator("#document-title")).toBeVisible({ timeout: 10_000 });
  await page.fill("#document-title", title);
  await page.fill("#document-description", description);

  // Click Upload (skip corpus step since we upload from /documents)
  // The button may say "Upload" or "Skip Corpus" + "Upload"
  await page.getByRole("button", { name: /^Upload$/i }).last().click();

  // Wait for upload to complete — the modal shows a progress state then closes
  // or shows a success state. Wait for the modal to disappear.
  await expect(page.getByTestId("file-dropzone")).not.toBeVisible({ timeout: 30_000 });
}
```

- [ ] **Step 2: Verify helpers.ts has no syntax errors**

Run:
```bash
cd frontend && npx tsc --noEmit tests/e2e/helpers.ts --esModuleInterop --target ES2020 --moduleResolution node --module ES2020 --skipLibCheck 2>&1 | head -20
```

Note: This may show import errors since the file is meant to run under Playwright's config. As long as there are no syntax errors in the new code, proceed.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/e2e/helpers.ts
git commit -m "Add CRUD and admin helpers to E2E test utilities"
```

---

### Task 2: Create `corpus-workflow.spec.ts` — Deep CRUD Workflow

**Files:**
- Create: `frontend/tests/e2e/corpus-workflow.spec.ts`

- [ ] **Step 1: Write the workflow spec**

Create `frontend/tests/e2e/corpus-workflow.spec.ts`:

```typescript
/**
 * E2E integration test: corpus creation, document upload, and navigation.
 *
 * This spec exercises the primary user journey through the application:
 * create a corpus, upload a text document, verify it's processed, and
 * navigate through the corpus detail views. Each step builds on the
 * previous one, creating data that the view-interactions spec can reuse.
 *
 * The test document is a small .txt file processed by TxtParser (spacy).
 * CELERY_TASK_ALWAYS_EAGER ensures synchronous processing in the Django
 * process — no Celery worker or external parser containers are needed.
 */

import { test, expect } from "./fixtures";
import {
  TEST_USER,
  loginViaUI,
  spaNavigate,
  expectViewVisible,
  createCorpusViaUI,
  uploadDocumentViaUI,
} from "./helpers";

/** Small text document that TxtParser will split into sentence annotations. */
const TEST_DOCUMENT_CONTENT = [
  "OpenContracts is a document analytics platform for legal documents.",
  "It supports PDF and text-based document formats for analysis.",
  "Users can annotate documents and create structured data extracts.",
  "The platform uses machine learning models for document parsing.",
  "This is a test document for end-to-end integration coverage testing.",
].join("\n");

const CORPUS_TITLE = "E2E Test Corpus";
const CORPUS_DESCRIPTION = "Corpus created by the E2E workflow spec.";
const DOC_TITLE = "E2E Test Document";
const DOC_DESCRIPTION = "Text document for coverage testing.";

test.describe("Corpus workflow", () => {
  test("creates corpus, uploads document, and navigates detail views", async ({
    page,
  }) => {
    // ── Step 1: Login ──────────────────────────────────────────────
    await test.step("login", async () => {
      await loginViaUI(page, TEST_USER.username, TEST_USER.password);
    });

    // ── Step 2: Create corpus ──────────────────────────────────────
    await test.step("create corpus via UI", async () => {
      await createCorpusViaUI(page, CORPUS_TITLE, CORPUS_DESCRIPTION);
    });

    // ── Step 3: Upload document ────────────────────────────────────
    await test.step("upload text document via UI", async () => {
      await uploadDocumentViaUI(
        page,
        "test-document.txt",
        TEST_DOCUMENT_CONTENT,
        DOC_TITLE,
        DOC_DESCRIPTION
      );
    });

    // ── Step 4: Verify document appears in list ────────────────────
    await test.step("verify document in document list", async () => {
      await spaNavigate(page, "/documents");
      await expect(page.getByText(DOC_TITLE)).toBeVisible({ timeout: 15_000 });
    });

    // ── Step 5: Navigate to corpus list, find our corpus ───────────
    await test.step("navigate to corpus and verify detail page", async () => {
      await spaNavigate(page, "/corpuses");
      await expect(page.getByText(CORPUS_TITLE)).toBeVisible({
        timeout: 15_000,
      });

      // Click the corpus card to navigate to its detail page
      await page.getByText(CORPUS_TITLE).first().click();

      // Wait for the corpus detail page to load — look for the corpus title
      // as a heading or the tab navigation
      await expect(page.getByText(/Documents/i).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // ── Step 6: Browse corpus tabs ─────────────────────────────────
    await test.step("browse corpus detail tabs", async () => {
      // Click through the main tabs to exercise their rendering
      const tabs = ["Documents", "Annotations", "Extracts", "Settings"];
      for (const tabName of tabs) {
        const tab = page.getByRole("tab", { name: new RegExp(tabName, "i") });
        // Some tabs may not exist depending on corpus state — click if visible
        if (await tab.isVisible().catch(() => false)) {
          await tab.click();
          // Give the tab content time to render
          await page.waitForTimeout(1000);
        }
      }
    });

    // ── Step 7: Visit extracts page ────────────────────────────────
    await test.step("visit extracts page with data", async () => {
      await spaNavigate(page, "/extracts");
      await expectViewVisible(page, {
        kind: "text",
        text: /Extract\s+structured data/i,
      });
    });

    // ── Step 8: Visit annotations page ─────────────────────────────
    await test.step("visit annotations page with data", async () => {
      await spaNavigate(page, "/annotations");
      await expectViewVisible(page, {
        kind: "text",
        text: /Browse\s+annotations/i,
      });
    });
  });
});
```

- [ ] **Step 2: Verify the spec compiles**

Run:
```bash
cd frontend && npx tsc --noEmit tests/e2e/corpus-workflow.spec.ts --esModuleInterop --target ES2020 --moduleResolution node --module ES2020 --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/e2e/corpus-workflow.spec.ts
git commit -m "Add E2E corpus workflow spec for deep CRUD coverage"
```

---

### Task 3: Create `view-interactions.spec.ts` — Shallow Breadth

**Files:**
- Create: `frontend/tests/e2e/view-interactions.spec.ts`

- [ ] **Step 1: Write the interactions spec**

Create `frontend/tests/e2e/view-interactions.spec.ts`:

```typescript
/**
 * E2E integration test: view interactions and admin routes.
 *
 * This spec exercises interactive features on each list view (modals,
 * filters, search) and navigates admin routes. It runs AFTER
 * corpus-workflow.spec.ts (alphabetical order) so the database already
 * contains a corpus and document created by that spec.
 *
 * Each test.describe block targets one view to keep failures isolated.
 */

import { test, expect } from "./fixtures";
import {
  TEST_USER,
  ADMIN_VIEWS,
  loginViaUI,
  spaNavigate,
  expectViewVisible,
} from "./helpers";

test.describe("View interactions", () => {
  test("exercises interactive features across all views", async ({ page }) => {
    await loginViaUI(page, TEST_USER.username, TEST_USER.password);

    // ── Corpuses: search and grid/list toggle ──────────────────────
    await test.step("corpuses — search and view toggle", async () => {
      await spaNavigate(page, "/corpuses");
      await expectViewVisible(page, { kind: "text", text: /Your\s+corpuses/i });

      // Use the search input
      const search = page.getByPlaceholder(/Search/i);
      if (await search.isVisible().catch(() => false)) {
        await search.fill("E2E Test");
        await page.waitForTimeout(500);
        await search.clear();
      }
    });

    // ── Documents: search filter ───────────────────────────────────
    await test.step("documents — search", async () => {
      await spaNavigate(page, "/documents");
      await expectViewVisible(page, {
        kind: "text",
        text: /Your\s+documents/i,
      });

      const search = page.getByPlaceholder(/Search/i);
      if (await search.isVisible().catch(() => false)) {
        await search.fill("E2E");
        await page.waitForTimeout(500);
        await search.clear();
      }
    });

    // ── Label Sets: open create modal and close ────────────────────
    await test.step("label sets — open create modal", async () => {
      await spaNavigate(page, "/label_sets");
      await expectViewVisible(page, {
        kind: "text",
        text: /Organize your\s+labels/i,
      });

      // Try to open the create modal via the Add button
      const addButton = page.getByLabel("Add");
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
        // Look for a "Create" option in the dropdown
        const createOption = page.getByText(/Create Label/i);
        if (await createOption.isVisible().catch(() => false)) {
          await createOption.click();
          // Close the modal by pressing Escape
          await page.keyboard.press("Escape");
          await page.waitForTimeout(500);
        } else {
          // Close the dropdown
          await page.keyboard.press("Escape");
        }
      }
    });

    // ── Extracts: check for create button ──────────────────────────
    await test.step("extracts — interact with create button", async () => {
      await spaNavigate(page, "/extracts");
      await expectViewVisible(page, {
        kind: "text",
        text: /Extract\s+structured data/i,
      });

      // Look for the "New Extract" or "Create Your First Extract" button
      const newExtractBtn = page.getByRole("button", {
        name: /New Extract|Create Your First Extract/i,
      });
      if (await newExtractBtn.first().isVisible().catch(() => false)) {
        await newExtractBtn.first().click();
        // The create extract modal should appear — close it
        await page.waitForTimeout(1000);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    });

    // ── Annotations: search controls ───────────────────────────────
    await test.step("annotations — search", async () => {
      await spaNavigate(page, "/annotations");
      await expectViewVisible(page, {
        kind: "text",
        text: /Browse\s+annotations/i,
      });

      const search = page.getByPlaceholder(/Search/i);
      if (await search.isVisible().catch(() => false)) {
        await search.fill("test");
        await page.waitForTimeout(500);
        await search.clear();
      }
    });

    // ── Discussions: verify page renders ───────────────────────────
    await test.step("discussions — verify rendering", async () => {
      await spaNavigate(page, "/discussions");
      await expectViewVisible(page, {
        kind: "anyText",
        texts: [/^Discussions$/i, /Search discussions/i],
      });
    });

    // ── Discovery landing: interact with sections ──────────────────
    await test.step("landing page — browse sections", async () => {
      await spaNavigate(page, "/");
      await expectViewVisible(page, {
        kind: "anyText",
        texts: [
          /Featured Collections/i,
          /Recent Activity/i,
          /Top Contributors/i,
        ],
      });
      // Scroll down to trigger lazy-loaded sections
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    });

    // ── Admin routes ───────────────────────────────────────────────
    for (const view of ADMIN_VIEWS) {
      await test.step(`admin — ${view.name}`, async () => {
        await spaNavigate(page, view.path);
        await expectViewVisible(page, view.matcher, 15_000);
      });
    }
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/tests/e2e/view-interactions.spec.ts
git commit -m "Add E2E view interactions spec for breadth coverage"
```

---

### Task 4: Run E2E tests locally and fix issues

**Files:**
- Possibly modify: `frontend/tests/e2e/helpers.ts`, `frontend/tests/e2e/corpus-workflow.spec.ts`, `frontend/tests/e2e/view-interactions.spec.ts`

This task is iterative — run the tests against the live stack and fix selector/timing issues.

- [ ] **Step 1: Verify the backend stack is running**

The E2E tests need the Django + Postgres + Redis stack. Check if it's up:

```bash
curl -sf http://localhost:8000/api/health/ && echo "Django is ready" || echo "Django is NOT running — start it with: docker compose -f test.yml up -d postgres redis && docker compose -f test.yml up -d --no-deps django"
```

- [ ] **Step 2: Run the corpus-workflow spec**

```bash
cd frontend && E2E_TEST_PASSWORD='Openc0ntracts_def@ult' npx playwright test tests/e2e/corpus-workflow.spec.ts --reporter=list
```

Expected: The test should login, create a corpus, upload a document, and navigate views. Fix any selector mismatches or timing issues.

Common issues to watch for:
- **Modal selectors wrong**: Adjust CSS selectors in `createCorpusViaUI`/`uploadDocumentViaUI` if the modal structure differs
- **Toast text mismatch**: Update the regex if the success message differs
- **File input not found**: The `input[type="file"]` might be deeply nested — try `page.locator('input[type="file"]').first()`
- **Upload timeout**: Increase the 30s timeout if synchronous parsing takes longer

- [ ] **Step 3: Run the view-interactions spec**

```bash
cd frontend && E2E_TEST_PASSWORD='Openc0ntracts_def@ult' npx playwright test tests/e2e/view-interactions.spec.ts --reporter=list
```

Expected: The test should exercise interactive features on each view. Fix selector/timing issues.

- [ ] **Step 4: Run all E2E specs together**

```bash
cd frontend && E2E_TEST_PASSWORD='Openc0ntracts_def@ult' npx playwright test tests/e2e/ --reporter=list
```

Expected: All three specs pass (corpus-workflow, login-and-navigation, view-interactions) in order.

- [ ] **Step 5: Commit any fixes**

```bash
git add frontend/tests/e2e/
git commit -m "Fix E2E test selectors and timing from local test run"
```

---

### Task 5: Run with coverage and verify improvement

**Files:**
- No file changes expected

- [ ] **Step 1: Run E2E tests with coverage collection**

```bash
cd frontend && COVERAGE=true E2E_TEST_PASSWORD='Openc0ntracts_def@ult' npx playwright test tests/e2e/ --reporter=list
```

- [ ] **Step 2: Generate coverage report**

```bash
cd frontend && mkdir -p coverage/e2e/.nyc_output && npx nyc report --reporter=text --temp-dir=coverage/e2e/.nyc_output 2>&1 | head -40
```

Expected: Coverage report shows improvement over the baseline. Look at the specific files from the design (Corpuses.tsx, Documents.tsx, etc.) and verify they have non-zero coverage.

- [ ] **Step 3: Compare against baseline**

Check which large files gained coverage:
```bash
cd frontend && npx nyc report --reporter=text --temp-dir=coverage/e2e/.nyc_output 2>&1 | grep -E "Corpuses|Documents|Extracts|LabelSets|Annotations|admin|SystemSettings|GlobalSettings" | head -20
```

---

### Task 6: Push and update PR

**Files:**
- No file changes expected

- [ ] **Step 1: Push changes**

```bash
git push
```

- [ ] **Step 2: Update PR description**

Add a section to PR #1263's description about the new E2E tests:

```bash
gh pr edit 1263 --add-label "tests"
```

- [ ] **Step 3: Verify CI passes**

```bash
gh pr checks 1263
```

Wait for the Frontend E2E Integration workflow to complete. If it fails, check the logs:

```bash
gh run list --workflow=frontend-e2e.yml --branch=fix/codecov-frontend-e2e-flag --limit 1 --json databaseId,status,conclusion
```

If the run fails, download the Playwright report artifact and fix the issues (return to Task 4).
