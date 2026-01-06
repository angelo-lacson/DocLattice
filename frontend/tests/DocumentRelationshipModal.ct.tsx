import { test, expect } from "@playwright/experimental-ct-react";
import { DocumentRelationshipModalTestWrapper } from "./DocumentRelationshipModalTestWrapper";

test.describe("DocumentRelationshipModal", () => {
  test("renders modal header", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await expect(page.getByText("Link Documents")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows source documents column", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    // The column header should be visible
    await expect(
      page.locator(".column-title").filter({ hasText: "Source Documents" })
    ).toBeVisible({
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

  test("displays source document pills", async ({ mount, page }) => {
    await mount(
      <DocumentRelationshipModalTestWrapper initialSourceIds={["doc-1"]} />
    );

    // Wait for source document to be displayed
    await page.waitForSelector('text="Source Document 1"', {
      timeout: 10000,
    });

    // Should show Source Document 1 as a pill
    await expect(page.getByText("Source Document 1")).toBeVisible();
  });

  test("shows relationship type radio buttons", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Relationship Type"', { timeout: 10000 });

    await expect(page.getByText("Labeled Relationship")).toBeVisible();
    await expect(page.getByText("Notes")).toBeVisible();
  });

  test("shows target documents column", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    // The column header should be visible (use exact match to avoid "No target documents")
    await expect(
      page.locator(".column-title").filter({ hasText: "Target Documents" })
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows add target button", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Should show "Add Target" button
    const addTargetButton = page.getByRole("button", { name: /Add Target/ });
    await expect(addTargetButton).toBeVisible();
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

    // Initial state shows "Creating 0 relationships" (plural because 0 !== 1)
    await page.waitForSelector('text="Creating 0 relationships"', {
      timeout: 10000,
    });

    await expect(page.getByText(/Creating 0 relationships/)).toBeVisible();
  });

  test("shows search when adding target", async ({ mount, page }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Click "Add Target" button
    await page.getByRole("button", { name: /Add Target/ }).click();

    // Now the search input should be visible
    const searchInput = page.getByPlaceholder("Search documents in corpus...");
    await expect(searchInput).toBeVisible();
  });

  test("shows label search when RELATIONSHIP mode selected", async ({
    mount,
    page,
  }) => {
    await mount(<DocumentRelationshipModalTestWrapper />);

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // RELATIONSHIP mode is default, should show label dropdown
    await expect(page.getByText("Relationship Label")).toBeVisible();
    // The dropdown should be visible with placeholder text
    await expect(
      page
        .locator(".ui.dropdown")
        .filter({ hasText: "Search or type to create" })
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

  test("can move document from source to target", async ({ mount, page }) => {
    // Start with 2 source documents so after moving one, we have 1 source x 1 target = 1 relationship
    await mount(
      <DocumentRelationshipModalTestWrapper
        initialSourceIds={["doc-1", "doc-2"]}
      />
    );

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Wait for source documents to load
    await page.waitForSelector('text="Source Document 1"', {
      timeout: 10000,
    });

    // Click the "move to target" button on first document (arrow right)
    const moveButton = page.locator('button[title="Move to targets"]').first();
    await moveButton.click();

    // Document should now appear in target column
    // The relationship count should update to 1 (1 source x 1 target)
    await expect(page.getByText(/Creating 1 relationship/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("displays initial target documents", async ({ mount, page }) => {
    // Mount with both source and target documents pre-populated
    await mount(
      <DocumentRelationshipModalTestWrapper
        initialSourceIds={["doc-1"]}
        initialTargetIds={["doc-2"]}
      />
    );

    await page.waitForSelector('text="Link Documents"', { timeout: 10000 });

    // Both documents should be visible as pills
    await page.waitForSelector('text="Source Document 1"', {
      timeout: 10000,
    });
    await page.waitForSelector('text="Target Document 1"', {
      timeout: 10000,
    });

    // Should show relationship count of 1 (1 source x 1 target)
    await expect(page.getByText(/Creating 1 relationship/)).toBeVisible({
      timeout: 5000,
    });
  });
});
