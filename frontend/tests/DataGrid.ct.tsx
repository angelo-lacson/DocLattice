import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { DataGridTestWrapper } from "./DataGridTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";
import { ExtractType } from "../src/types/graphql-api";

test.describe("ExtractDataGrid", () => {
  test("renders table with columns and documents", async ({ mount, page }) => {
    const component = await mount(<DataGridTestWrapper />);

    // Headers should be visible
    await expect(page.locator("text=Document").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=Contract Value").first()).toBeVisible();
    await expect(page.locator("text=Effective Date").first()).toBeVisible();

    // Document titles should be visible
    await expect(
      page.locator("text=Master Service Agreement.pdf").first()
    ).toBeVisible();
    await expect(
      page.locator("text=Non-Disclosure Agreement.pdf").first()
    ).toBeVisible();

    await docScreenshot(page, "extracts--data-grid--with-data");
    await component.unmount();
  });

  test("shows empty state when no documents", async ({ mount, page }) => {
    const component = await mount(<DataGridTestWrapper rows={[]} cells={[]} />);

    // Empty state messaging
    await expect(page.locator("text=No documents yet").first()).toBeVisible({
      timeout: 10000,
    });

    await docScreenshot(page, "extracts--data-grid--empty");
    await component.unmount();
  });

  test("shows checkbox column when extract not started", async ({
    mount,
    page,
  }) => {
    // Default extract has started: null, so checkboxes should be present
    const component = await mount(<DataGridTestWrapper />);

    await expect(page.locator("text=Document").first()).toBeVisible({
      timeout: 10000,
    });

    // There should be checkboxes (select-all + one per row)
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible();
    // 1 select-all + 2 rows = 3 checkboxes
    await expect(checkboxes).toHaveCount(3);

    await component.unmount();
  });

  test("hides checkbox column when extract is started", async ({
    mount,
    page,
  }) => {
    const startedExtract: ExtractType = {
      id: "extract-1",
      name: "Test Extract",
      started: "2024-01-01T00:00:00Z",
      finished: "2024-01-02T00:00:00Z",
      error: "",
      fieldset: {
        id: "fieldset-1",
        name: "Test Fieldset",
        description: "",
        inUse: false,
        creator: { id: "user-1", email: "test@example.com" },
        columns: { edges: [] },
      },
      corpus: {
        id: "corpus-1",
        title: "Test Corpus",
      } as any,
      creator: { id: "user-1", email: "test@example.com" },
      created: "2024-01-01T00:00:00Z",
    };

    const component = await mount(
      <DataGridTestWrapper extract={startedExtract} />
    );

    await expect(page.locator("text=Document").first()).toBeVisible({
      timeout: 10000,
    });

    // No checkboxes should be present when extract has started
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(0);

    await component.unmount();
  });
});
