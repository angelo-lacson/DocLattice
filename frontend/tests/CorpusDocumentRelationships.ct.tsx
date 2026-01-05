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
});
