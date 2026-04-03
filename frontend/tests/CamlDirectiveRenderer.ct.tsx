/**
 * Playwright component tests for CamlDirectiveRenderer.
 *
 * Tests cover:
 * 1. Directive extraction and rendering via mock handler
 * 2. Directives are stripped from visible prose text
 * 3. Multiple directives across chapters
 * 4. Duplicate prose block disambiguation
 */
import { test, expect } from "@playwright/experimental-ct-react";
import { docScreenshot } from "./utils/docScreenshot";
import { CamlDirectiveRendererTestWrapper } from "./CamlDirectiveRendererTestWrapper";
import { DOCUMENT_WITH_DUPLICATES } from "./CamlDirectiveRendererFixtures";

test.describe("CamlDirectiveRenderer - Basic Rendering", () => {
  test("should render prose with directives resolved into mock chips", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlDirectiveRendererTestWrapper />);

    // Wait for the article to render
    await expect(page.getByText("Introduction")).toBeVisible({
      timeout: 10000,
    });

    // Directive syntax should NOT be visible
    await expect(page.locator("text={{@cite")).toHaveCount(0);

    // Mock citation chips should be rendered (at least one)
    const chips = page.locator("[data-testid^='mock-citation-']");
    await expect(chips.first()).toBeVisible({ timeout: 5000 });

    // The chip should contain the agent name
    await expect(chips.first()).toContainText("@cite:");

    await docScreenshot(page, "caml--directive-renderer--with-citations");

    await component.unmount();
  });

  test("should render paragraph-scope directives with args", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlDirectiveRendererTestWrapper />);

    // Wait for the analysis chapter to render
    await expect(page.getByText("Analysis")).toBeVisible({ timeout: 10000 });

    // Both intro and analysis chapters should produce mock chips
    const chips = page.locator("[data-testid^='mock-citation-']");
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThanOrEqual(2);

    await component.unmount();
  });
});

test.describe("CamlDirectiveRenderer - Duplicate Content", () => {
  test("should render correct directives for duplicate prose blocks", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CamlDirectiveRendererTestWrapper document={DOCUMENT_WITH_DUPLICATES} />
    );

    // Wait for content to render
    await expect(page.getByText("Duplicate Content Test")).toBeVisible({
      timeout: 10000,
    });

    // Each duplicate prose block should have its own mock citation chip
    const chips = page.locator("[data-testid^='mock-citation-']");
    const chipCount = await chips.count();
    expect(chipCount).toBe(2);

    await docScreenshot(page, "caml--directive-renderer--duplicate-blocks");

    await component.unmount();
  });
});
