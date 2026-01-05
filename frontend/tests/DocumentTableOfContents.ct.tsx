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
});
