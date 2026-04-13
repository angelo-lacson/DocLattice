/**
 * Playwright component tests for the CamlArticleEditor.
 *
 * Tests cover:
 * 1. New article mode (template loaded, "Create Article" button)
 * 2. Editor pane with CAML source
 * 3. Preview pane with rendered output
 * 4. Unsaved changes indicator
 */
import { test, expect } from "./utils/coverage";
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

    // Modal header should be visible ("Create Article" appears in header + save button)
    await expect(page.getByText("Create Article").first()).toBeVisible({
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

    // Clear and type new CAML content (simple structure — no YAML list for title)
    await textarea.fill(`::: chapter {#test}
## Test Chapter

Hello from the preview!
:::`);

    // Wait for preview to update
    await page.waitForTimeout(500);

    // Preview should show the rendered chapter heading
    await expect(
      page.getByRole("heading", { name: "Test Chapter" })
    ).toBeVisible({ timeout: 5000 });

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
    // Case history title - use testId to avoid matching the raw textarea content
    await expect(page.getByTestId("case-history-title")).toBeVisible({
      timeout: 5000,
    });

    await docScreenshot(page, "caml--editor--full-template", {
      fullPage: true,
    });

    await component.unmount();
  });
});
