import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { SidebarControlBarTestWrapper } from "./SidebarControlBarTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("SidebarControlBar", () => {
  test("renders control bar with search and filter controls", async ({
    mount,
    page,
  }) => {
    const component = await mount(<SidebarControlBarTestWrapper />);

    // Verify search input is visible
    await expect(page.getByPlaceholder("Search in content...")).toBeVisible({
      timeout: 10000,
    });

    // Verify Content Types dropdown header is visible
    await expect(page.getByText("Content Types")).toBeVisible();

    // Verify sort dropdown is present (os-legal Dropdown)
    const sortDropdown = page.locator(".oc-dropdown");
    await expect(sortDropdown).toBeVisible();

    await docScreenshot(page, "knowledge-base--sidebar-control-bar--default");

    await component.unmount();
  });

  test("sort dropdown shows sort options", async ({ mount, page }) => {
    const component = await mount(<SidebarControlBarTestWrapper />);

    // Click the sort dropdown trigger to open it
    const sortDropdown = page.locator(".oc-dropdown");
    await expect(sortDropdown).toBeVisible({ timeout: 10000 });
    await sortDropdown.locator(".oc-dropdown__trigger").click();

    // Verify all sort options are visible
    await expect(
      page.locator(".oc-dropdown__option", { hasText: "Page Number" })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator(".oc-dropdown__option", { hasText: "Content Type" })
    ).toBeVisible();
    await expect(
      page.locator(".oc-dropdown__option", { hasText: "Date Created" })
    ).toBeVisible();

    await docScreenshot(
      page,
      "knowledge-base--sidebar-control-bar--sort-options"
    );

    await component.unmount();
  });

  test("content type filters are visible", async ({ mount, page }) => {
    const component = await mount(<SidebarControlBarTestWrapper />);

    // Click the Content Types dropdown to expand it
    await expect(page.getByText("Content Types")).toBeVisible({
      timeout: 10000,
    });
    await page.getByText("Content Types").click();

    // Verify content type filter options appear
    await expect(page.getByText("Notes")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Annotations")).toBeVisible();
    await expect(page.getByText("Relationships")).toBeVisible();

    // Verify quick action buttons
    await expect(page.getByText("Select All")).toBeVisible();
    await expect(page.getByText("Clear All")).toBeVisible();

    await component.unmount();
  });

  test("returns null in chat mode", async ({ mount, page }) => {
    const component = await mount(
      <SidebarControlBarTestWrapper initialViewMode="chat" />
    );

    // In chat mode, the control bar should not render
    await expect(page.getByPlaceholder("Search in content...")).not.toBeVisible(
      { timeout: 5000 }
    );

    await component.unmount();
  });
});
