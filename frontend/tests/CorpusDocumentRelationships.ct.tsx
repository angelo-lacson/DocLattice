import { test, expect } from "@playwright/experimental-ct-react";
import { CorpusDocumentRelationshipsTestWrapper } from "./CorpusDocumentRelationshipsTestWrapper";

test.describe("CorpusDocumentRelationships", () => {
  test("renders relationships header", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    await expect(page.getByText("Document Relationships")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows empty state when no relationships", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper mockType="empty" />);

    await page.waitForSelector('text="No Document Relationships"', {
      timeout: 10000,
    });

    await expect(page.getByText("No Document Relationships")).toBeVisible();
  });

  test("shows error state on fetch failure", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper mockType="error" />);

    await page.waitForSelector('text="Error Loading Relationships"', {
      timeout: 10000,
    });

    await expect(page.getByText("Error Loading Relationships")).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/ })).toBeVisible();
  });

  test("displays relationships in table", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    // Wait for table to load
    await page.waitForSelector('text="Source Document 1"', {
      timeout: 10000,
    });

    // Check source documents are displayed
    await expect(page.getByText("Source Document 1")).toBeVisible();
    await expect(page.getByText("Source Document 2")).toBeVisible();

    // Check target documents are displayed
    await expect(page.getByText("Target Document 1")).toBeVisible();
    await expect(page.getByText("Target Document 2")).toBeVisible();
  });

  test("displays relationship labels", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    await page.waitForSelector('text="references"', {
      timeout: 10000,
    });

    await expect(page.getByText("references")).toBeVisible();
  });

  test("shows type badges for relationships", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    await page.waitForSelector('text="Relationship"', {
      timeout: 10000,
    });

    // Should show both relationship types
    await expect(page.getByText("Relationship").first()).toBeVisible();
    await expect(page.getByText("Notes")).toBeVisible();
  });

  test("filter dropdown is visible", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    await page.waitForSelector('text="All Types"', {
      timeout: 10000,
    });

    await expect(page.getByText("All Types")).toBeVisible();
  });

  test("shows delete button for relationships with permission", async ({
    mount,
    page,
  }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    await page.waitForSelector('text="Source Document 1"', {
      timeout: 10000,
    });

    // rel-1 has "remove" permission, should show delete button
    const deleteButtons = page.locator('button[title="Delete relationship"]');
    await expect(deleteButtons.first()).toBeVisible();
  });

  test("shows total count", async ({ mount, page }) => {
    await mount(<CorpusDocumentRelationshipsTestWrapper />);

    await page.waitForSelector('text="Showing 2 of 2 relationships"', {
      timeout: 10000,
    });

    await expect(page.getByText("Showing 2 of 2 relationships")).toBeVisible();
  });
});
