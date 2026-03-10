import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { LeaderboardTestWrapper } from "./LeaderboardTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("Leaderboard", () => {
  test("renders leaderboard header and stats", async ({ mount, page }) => {
    const component = await mount(<LeaderboardTestWrapper />);

    // Should show the leaderboard heading
    await expect(page.locator("h1")).toContainText("Community Leaderboard", {
      timeout: 10000,
    });

    // Community stats should load and display
    await expect(page.getByText("Active Users")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Messages", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Badges Awarded")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Active This Week")).toBeVisible({
      timeout: 10000,
    });

    await docScreenshot(page, "community--leaderboard--with-data");

    await component.unmount();
  });

  test("shows leaderboard entries with user data", async ({ mount, page }) => {
    const component = await mount(<LeaderboardTestWrapper />);

    // Wait for the table to render with user data
    await expect(page.getByText("top_user")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("second_user")).toBeVisible({
      timeout: 10000,
    });

    // First user should have "Rising Star" badge
    await expect(page.getByText("Rising Star")).toBeVisible({
      timeout: 10000,
    });

    // Score column should show badge counts (use exact to avoid matching details column)
    await expect(page.getByText("50 badges", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("35 badges", { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // Current user rank info should be displayed
    await expect(page.getByText("#5")).toBeVisible({ timeout: 10000 });

    await component.unmount();
  });

  test("shows metric dropdown with options", async ({ mount, page }) => {
    const component = await mount(<LeaderboardTestWrapper />);

    // Wait for the filter bar to be visible
    const dropdownTriggers = page.locator(".oc-dropdown__trigger");
    await expect(dropdownTriggers.first()).toBeVisible({ timeout: 10000 });

    // The metric dropdown should show current selection
    const metricValue = page.locator(".oc-dropdown__value").first();
    await expect(metricValue).toContainText("Top Badge Earners", {
      timeout: 10000,
    });

    // Click the metric dropdown to see options
    await dropdownTriggers.first().click();

    const menu = page.locator(".oc-dropdown__menu");
    await expect(menu).toBeVisible({ timeout: 10000 });

    // Should list all metric options
    await expect(page.locator(".oc-dropdown__option")).toHaveCount(5, {
      timeout: 10000,
    });
    await expect(
      page.locator(".oc-dropdown__option", {
        hasText: "Most Active Contributors",
      })
    ).toBeVisible();
    await expect(
      page.locator(".oc-dropdown__option", { hasText: "Top Annotators" })
    ).toBeVisible();

    await docScreenshot(page, "community--leaderboard--filters");

    await component.unmount();
  });

  test("renders time scope and limit dropdowns", async ({ mount, page }) => {
    const component = await mount(<LeaderboardTestWrapper />);

    // There should be 3 dropdown triggers: metric, scope, limit
    const triggers = page.locator(".oc-dropdown__trigger");
    await expect(triggers).toHaveCount(3, { timeout: 10000 });

    // The scope dropdown (second) should show "All Time" by default
    const scopeValue = page.locator(".oc-dropdown__value").nth(1);
    await expect(scopeValue).toContainText("All Time", { timeout: 10000 });

    // The limit dropdown (third) should show "Top 25" by default
    const limitValue = page.locator(".oc-dropdown__value").nth(2);
    await expect(limitValue).toContainText("Top 25", { timeout: 10000 });

    await component.unmount();
  });
});
