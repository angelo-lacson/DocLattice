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
      await expect(page.getByText(DOC_TITLE).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // ── Step 5: Navigate to corpus list, find our corpus ───────────
    await test.step("navigate to corpus and verify detail page", async () => {
      await spaNavigate(page, "/corpuses");
      await expect(page.getByText(CORPUS_TITLE).first()).toBeVisible({
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
