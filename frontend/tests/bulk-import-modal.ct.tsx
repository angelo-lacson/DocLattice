// Playwright Component Test for BulkImportModal
//
// Tests the bulk ZIP import modal styling and step navigation.
// Uses docScreenshot to capture the visual state of each step.
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { BulkImportModal } from "../src/components/widgets/modals/BulkImportModal";
import { BulkImportTestWrapper } from "./wrappers/BulkImportTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("BulkImportModal", () => {
  test("should render confirm step with warning and info alerts", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <BulkImportTestWrapper>
        <BulkImportModal />
      </BulkImportTestWrapper>
    );

    // Check header
    await expect(page.locator("text=Bulk Import Documents")).toBeVisible();
    await expect(
      page.locator("text=Review import details before proceeding")
    ).toBeVisible();

    // Step indicator should show all three steps
    await expect(page.locator("text=Confirm")).toBeVisible();
    await expect(page.locator("text=Select File")).toBeVisible();
    await expect(page.getByText("Import", { exact: true })).toBeVisible();

    // Warning alert should be visible
    await expect(
      page.locator("text=Important: Bulk Import Cannot Be Easily Undone")
    ).toBeVisible();

    // Info alert should be visible
    await expect(page.locator("text=Supported Format")).toBeVisible();

    // Footer buttons
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    await expect(page.locator('button:has-text("Continue")')).toBeVisible();

    await docScreenshot(page, "corpus--bulk-import-modal--confirm-step");

    await component.unmount();
  });

  test("should navigate to upload step when Continue is clicked", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <BulkImportTestWrapper>
        <BulkImportModal />
      </BulkImportTestWrapper>
    );

    // Wait for confirm step to be visible
    await expect(
      page.locator("text=Important: Bulk Import Cannot Be Easily Undone")
    ).toBeVisible();

    // Click Continue
    await page.locator('button:has-text("Continue")').click();

    // Should now show upload step
    await expect(
      page.locator("text=Drag & drop a ZIP file here")
    ).toBeVisible();
    await expect(page.locator('button:has-text("Browse Files")')).toBeVisible();

    // Footer should show Back and Start Import
    await expect(page.locator('button:has-text("Back")')).toBeVisible();
    await expect(page.locator('button:has-text("Start Import")')).toBeVisible();

    await docScreenshot(page, "corpus--bulk-import-modal--upload-step");

    await component.unmount();
  });

  test("should navigate back from upload to confirm step", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <BulkImportTestWrapper>
        <BulkImportModal />
      </BulkImportTestWrapper>
    );

    // Go to upload step
    await page.locator('button:has-text("Continue")').click();
    await expect(
      page.locator("text=Drag & drop a ZIP file here")
    ).toBeVisible();

    // Click Back
    await page.locator('button:has-text("Back")').click();

    // Should be back on confirm step
    await expect(
      page.locator("text=Important: Bulk Import Cannot Be Easily Undone")
    ).toBeVisible();

    await component.unmount();
  });
});
