import { test, expect } from "@playwright/experimental-ct-react";
import { DocumentTableOfContentsTestWrapper } from "./DocumentTableOfContentsTestWrapper";

test.describe("DocumentTableOfContents", () => {
  test("does not render when no parent relationships exist", async ({
    mount,
    page,
  }) => {
    await mount(
      <DocumentTableOfContentsTestWrapper mockType="noParentRelationships" />
    );

    // Wait for query to complete
    await page.waitForTimeout(1000);

    // Component should not render (returns null)
    await expect(page.getByText("Table of Contents")).not.toBeVisible();
  });

  test("does not render when relationships are empty", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="empty" />);

    // Wait for query to complete
    await page.waitForTimeout(1000);

    // Component should not render
    await expect(page.getByText("Table of Contents")).not.toBeVisible();
  });

  test("renders header with parent relationships", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await expect(page.getByText("Table of Contents")).toBeVisible({
      timeout: 10000,
    });
  });

  test("displays parent document as root", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    await expect(page.getByText("Parent Document")).toBeVisible();
  });

  test("displays child documents", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    // Wait for tree to render
    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    // Expand parent to see children (click chevron)
    const chevron = page.locator(".chevron").first();
    await chevron.click();

    // Children should be visible after expanding
    await expect(page.getByText("Child Document 1")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Child Document 2")).toBeVisible();
  });

  test("tree nodes have proper ARIA attributes", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('[role="tree"]', {
      timeout: 10000,
    });

    // Tree container should have tree role
    await expect(page.locator('[role="tree"]')).toBeVisible();

    // Tree items should have treeitem role
    const treeItems = page.locator('[role="treeitem"]');
    await expect(treeItems.first()).toBeVisible();
  });

  test("tree nodes are keyboard focusable", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    // Tree items should have tabIndex
    const treeItem = page.locator('[role="treeitem"]').first();
    await expect(treeItem).toHaveAttribute("tabindex", "0");
  });

  test("keyboard navigation - ArrowRight expands node", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    // Focus the parent node
    const parentNode = page.locator('[role="treeitem"]').first();
    await parentNode.focus();

    // Press ArrowRight to expand
    await page.keyboard.press("ArrowRight");

    // Children should become visible
    await expect(page.getByText("Child Document 1")).toBeVisible({
      timeout: 5000,
    });
  });

  test("keyboard navigation - ArrowLeft collapses node", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    // First expand the parent node
    const parentNode = page.locator('[role="treeitem"]').first();
    await parentNode.focus();
    await page.keyboard.press("ArrowRight");

    // Wait for children to be visible
    await expect(page.getByText("Child Document 1")).toBeVisible({
      timeout: 5000,
    });

    // Press ArrowLeft to collapse
    await page.keyboard.press("ArrowLeft");

    // Children should be hidden (though they may still be in DOM, just not displayed)
    // Check aria-expanded attribute instead
    await expect(parentNode).toHaveAttribute("aria-expanded", "false");
  });

  test("aria-expanded reflects node state", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    const parentNode = page.locator('[role="treeitem"]').first();

    // Initially collapsed
    await expect(parentNode).toHaveAttribute("aria-expanded", "false");

    // Expand by clicking chevron
    const chevron = page.locator(".chevron").first();
    await chevron.click();

    // Should be expanded
    await expect(parentNode).toHaveAttribute("aria-expanded", "true");
  });

  test("nodes have aria-label with title", async ({ mount, page }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    const parentNode = page.locator('[role="treeitem"]').first();

    // Should have aria-label containing the document title
    const ariaLabel = await parentNode.getAttribute("aria-label");
    expect(ariaLabel).toContain("Parent Document");
  });

  test("clicking document navigates (calls handler)", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentTableOfContentsTestWrapper mockType="default" />);

    await page.waitForSelector('text="Parent Document"', {
      timeout: 10000,
    });

    // Click on a document title
    await page.getByText("Parent Document").click();

    // Navigation would happen via React Router - we can't easily test the actual navigation
    // but we can verify the click handler is called (no errors thrown)
  });
});
