/**
 * Playwright component tests for the CamlArticleEditor.
 *
 * Tests cover:
 * 1. New article mode (template loaded, "Create Article" button)
 * 2. Editor pane with CAML source
 * 3. Preview pane with rendered output
 * 4. Unsaved changes indicator
 */
import { test, expect } from "@playwright/experimental-ct-react";
import { docScreenshot } from "./utils/docScreenshot";
import { CamlArticleEditorTestWrapper } from "./CamlArticleEditorTestWrapper";

test.describe("CamlArticleEditor - New Article", () => {
  test("should render editor with template for new article", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CamlArticleEditorTestWrapper hasExistingArticle={false} />
    );

    // Modal should be visible
    await expect(page.getByText("Create Article")).toBeVisible({
      timeout: 10000,
    });

    // Editor pane should have CAML source header
    await expect(page.getByText("CAML Source")).toBeVisible();

    // Preview pane should show rendered content
    await expect(page.getByText("Preview")).toBeVisible();

    // Template content should be in the editor textarea
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    const value = await textarea.inputValue();
    expect(value).toContain("hero:");
    expect(value).toContain("version:");

    await docScreenshot(page, "caml--editor--new-article");

    await component.unmount();
  });
});

test.describe("CamlArticleEditor - Live Preview", () => {
  test("should update preview when editor content changes", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CamlArticleEditorTestWrapper hasExistingArticle={false} />
    );

    // Wait for editor to load
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Clear and type new CAML content
    await textarea.fill(`---
hero:
  title:
    - "My Custom Title"
---

::: chapter {#test}
## Test Chapter

Hello from the preview!
:::`);

    // Wait for preview to update
    await page.waitForTimeout(300);

    // Preview should show the rendered content
    await expect(page.getByText("My Custom Title")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Test Chapter")).toBeVisible();
    await expect(page.getByText("Hello from the preview!")).toBeVisible();

    // Should show unsaved changes badge
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await docScreenshot(page, "caml--editor--live-preview");

    await component.unmount();
  });
});

test.describe("CamlArticleEditor - Close Behavior", () => {
  test("should show close button", async ({ mount, page }) => {
    const component = await mount(
      <CamlArticleEditorTestWrapper hasExistingArticle={false} />
    );

    // Close button should be present in action bar
    const closeButton = page.locator("button").filter({ hasText: "Close" });
    await expect(closeButton).toBeVisible({ timeout: 10000 });

    await component.unmount();
  });
});
