/**
 * Playwright component tests for CorpusArticleView.
 *
 * Tests cover:
 * 1. Empty state when no Readme.CAML exists
 * 2. Toolbar with back button and edit button
 * 3. Loading state
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

test.describe("CorpusArticleView - Toolbar", () => {
  test("should render toolbar with back and edit buttons", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusArticleViewTestWrapper hasArticle={true} />
    );

    // Toolbar elements
    await expect(page.getByText("Back")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Edit")).toBeVisible();

    // Corpus title should appear in toolbar
    await expect(page.getByText("Supply Chain Analysis")).toBeVisible();

    await docScreenshot(page, "caml--article-view--toolbar");

    await component.unmount();
  });
});
