import React from "react";
import { test, expect } from "./utils/coverage";
import { CookieConsentHarness } from "./CookieConsentTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("CookieConsent - Rendering", () => {
  test("should render the cookie consent modal with all sections", async ({
    mount,
    page,
  }) => {
    await mount(<CookieConsentHarness />);

    // Modal should be visible
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Header should show title
    await expect(page.locator(".oc-modal-header__title")).toContainText(
      "Cookie Policy"
    );

    // Demo banner should be visible
    await expect(page.getByText("Demo system")).toBeVisible();

    // All section labels should be visible
    await expect(page.getByText("Cookie Usage")).toBeVisible();
    await expect(page.getByText("Data We Collect")).toBeVisible();
    await expect(page.getByText("Data You Agree to Share")).toBeVisible();

    // Data items
    await expect(
      page.getByText("User information (email, name, IP)")
    ).toBeVisible();
    await expect(page.getByText("Usage information")).toBeVisible();
    await expect(page.getByText("System information")).toBeVisible();
    await expect(page.getByText("Labelsets & labels")).toBeVisible();
    await expect(page.getByText("Configured data extractors")).toBeVisible();

    // Accept button
    const acceptBtn = page.getByRole("button", { name: /Accept/ });
    await expect(acceptBtn).toBeVisible();

    // Disclaimer text
    await expect(page.getByText(/WITHOUT WARRANTY OF ANY KIND/i)).toBeVisible();

    // Capture screenshot for documentation
    await docScreenshot(page, "cookie-consent--modal--default");
  });
});
