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
});
