/**
 * Playwright component tests for CorpusArticleView.
 *
 * Tests cover:
 * 1. Empty state when no Readme.CAML exists
 * 2. Toolbar with back button and edit button
 * 3. Documents drawer slide-out
 */
import { test, expect } from "@playwright/experimental-ct-react";
import { docScreenshot } from "./utils/docScreenshot";
import { CorpusArticleViewTestWrapper } from "./CorpusArticleViewTestWrapper";

test.describe("CorpusArticleView - No Article", () => {
  test("should show empty state when no Readme.CAML exists", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusArticleViewTestWrapper hasArticle={false} />
    );

    // Should show the empty state message
    await expect(
      page.getByText("No article found for this corpus.")
    ).toBeVisible({ timeout: 10000 });

    // Should show the upload instruction
    await expect(page.getByText("Readme.CAML")).toBeVisible();

    // Back button should be visible
    await expect(page.getByText("Back")).toBeVisible();

    await docScreenshot(page, "caml--article-view--empty-state");

    await component.unmount();
  });
});

test.describe("CorpusArticleView - With Article", () => {
  test("should show back button and toolbar when article exists", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusArticleViewTestWrapper hasArticle={true} />
    );

    // Toolbar with back button should always be visible
    await expect(page.getByText("Back")).toBeVisible({ timeout: 10000 });

    // Since fetch() for the txtExtractFile URL won't work in tests,
    // the view may show loading or error state — but toolbar is always present
    await docScreenshot(page, "caml--article-view--toolbar");

    await component.unmount();
  });
});

test.describe("CorpusArticleView - Documents Drawer", () => {
  test("should show Documents button and open drawer on click", async ({
    mount,
    page,
  }) => {
    // Intercept fetch for the CAML file to return minimal valid content
    await page.route("**/media/test/readme.caml", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "---\nversion: '1.0'\nhero:\n  title:\n    - Test Article\n---\n\n::: chapter {#intro}\n## Hello World\n:::\n",
      })
    );

    const component = await mount(
      <CorpusArticleViewTestWrapper
        hasArticle={true}
        showDocumentsButton={true}
      />
    );

    // Wait for the article to parse and render the main toolbar
    await expect(page.getByText("Back")).toBeVisible({ timeout: 15000 });

    // Documents button should be visible in Explore mode
    const docsButton = page.getByText("Documents", { exact: true });
    await expect(docsButton).toBeVisible({ timeout: 10000 });

    // Click to open drawer
    await docsButton.click();

    // Drawer close button should appear (drawer is open)
    await expect(page.getByTitle("Close")).toBeVisible({ timeout: 5000 });

    // Let animation settle
    await page.waitForTimeout(500);

    await docScreenshot(page, "caml--article-view--documents-drawer");

    // Close via X button
    await page.getByTitle("Close").click();

    // Close button should disappear (drawer closed)
    await expect(page.getByTitle("Close")).not.toBeVisible({ timeout: 3000 });

    await component.unmount();
  });
});
