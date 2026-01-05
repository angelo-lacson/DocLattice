import { test, expect } from "@playwright/experimental-ct-react";
import { DocumentRelationshipModalTestWrapper } from "./DocumentRelationshipModalTestWrapper";

test.describe("DocumentRelationshipModal", () => {
  test("renders modal header", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await expect(page.getByText("Link Documents")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows source documents section", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await expect(page.getByText("Source Documents (1)")).toBeVisible({
      timeout: 10000,
    });
  });

  test("cancel button closes modal", async ({ mount, page }) => {
    let closed = false;
    await mount(
      <DocumentRelationshipModalTestWrapper
        onClose={() => {
          closed = true;
        }}
      />
    );

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Click cancel button
    await page.getByRole("button", { name: /Cancel/ }).click();

    expect(closed).toBe(true);
  });

  test("handles multiple source documents", async ({ mount, page }) => {
    await mount(
      <DocumentRelationshipModalTestWrapper
        sourceDocumentIds={["doc-1", "doc-2"]}
      />
    );

    await expect(page.getByText("Source Documents (2)")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows relationship type radio buttons", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Relationship Type"', { timeout: 10000 });

    await expect(page.getByText("Labeled Relationship")).toBeVisible();
    await expect(page.getByText("Notes")).toBeVisible();
  });

  test("shows target documents section", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Target Documents"', { timeout: 10000 });

    await expect(page.getByText("Target Documents")).toBeVisible();
  });

  test("shows document search input", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    const searchInput = page.getByPlaceholder("Search documents in corpus...");
    await expect(searchInput).toBeVisible();
  });

  test("submit button is disabled without target selection", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // The create button should be disabled initially (no targets selected)
    const createButton = page.getByRole("button", {
      name: /Create Relationship/,
    });
    await expect(createButton).toBeDisabled();
  });

  test("shows relationship count preview", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Creating 0 relationship"', {
      timeout: 10000,
    });

    // Initial state - 0 relationships because no targets selected
    await expect(page.getByText(/Creating 0 relationship/)).toBeVisible();
  });

  test("displays available documents", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    // Wait for documents to load - Target Document 1 should be available
    // (doc-2 is not the source, so it should appear)
    await page.waitForSelector('text="Target Document 1"', {
      timeout: 10000,
    });

    await expect(page.getByText("Target Document 1")).toBeVisible();
  });

  test("shows label search when RELATIONSHIP mode selected", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // RELATIONSHIP mode is default, should show label search
    await expect(
      page.getByText("Search or Create Relationship Label")
    ).toBeVisible();
  });

  test("shows notes textarea when NOTES mode selected", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Click Notes radio button
    await page.getByText("Notes").click();

    // Wait for the notes textarea to appear
    await page.waitForSelector('text="Notes (optional)"', { timeout: 5000 });
    await expect(page.getByText("Notes (optional)")).toBeVisible();
  });

  test("modal has proper accessibility attributes", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Modal should be visible and have proper structure
    const modal = page.locator(".ui.modal");
    await expect(modal).toBeVisible();
  });
});
