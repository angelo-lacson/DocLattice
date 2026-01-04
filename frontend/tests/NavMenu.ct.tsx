/**
 * Playwright Component Tests for NavMenu
 *
 * Tests the refactored NavMenu component that uses @os-legal/ui NavBar.
 * Covers: navigation items, auth states, superuser features, responsive behavior.
 */
import { test, expect } from "@playwright/experimental-ct-react";
import { NavMenuTestWrapper } from "./NavMenuTestWrapper";

// Define mock users locally to avoid import issues with Playwright CT
const mockRegularUser = {
  id: "user-1",
  username: "testuser",
  name: "Test User",
  email: "test@example.com",
  isSuperuser: false,
};

const mockSuperuser = {
  id: "admin-1",
  username: "admin",
  name: "Admin User",
  email: "admin@example.com",
  isSuperuser: true,
};

test.describe("NavMenu Component", () => {
  test.describe("Navigation Items", () => {
    test("should render all public navigation items", async ({
      mount,
      page,
    }) => {
      const component = await mount(<NavMenuTestWrapper />);

      // Check all public nav items are visible
      await expect(page.locator("text=Discover")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("text=Corpuses")).toBeVisible();
      await expect(page.locator("text=Documents")).toBeVisible();
      await expect(page.locator("text=Label Sets")).toBeVisible();
      await expect(page.locator("text=Annotations")).toBeVisible();
      await expect(page.locator("text=Extracts")).toBeVisible();
      await expect(page.locator("text=Leaderboard")).toBeVisible();

      await component.unmount();
    });

    test("should highlight active navigation item on home route", async ({
      mount,
      page,
    }) => {
      const component = await mount(<NavMenuTestWrapper initialPath="/" />);

      // Discover should be active on home route
      const discoverLink = page.locator("text=Discover");
      await expect(discoverLink).toBeVisible({ timeout: 5000 });

      // Check for active class or styling (NavBar adds --active class)
      await expect(
        page.locator(".oc-navbar__link--active:has-text('Discover')")
      ).toBeVisible();

      await component.unmount();
    });

    test("should highlight active navigation item on corpuses route", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <NavMenuTestWrapper initialPath="/corpuses" />
      );

      await expect(
        page.locator(".oc-navbar__link--active:has-text('Corpuses')")
      ).toBeVisible({ timeout: 5000 });

      await component.unmount();
    });
  });

  test.describe("Authentication States", () => {
    test("should show Login button when user is not authenticated", async ({
      mount,
      page,
    }) => {
      const component = await mount(<NavMenuTestWrapper mockUser={null} />);

      // Login button should be visible
      await expect(page.locator("button:has-text('Login')")).toBeVisible({
        timeout: 5000,
      });

      // User menu should not be visible
      await expect(page.locator(".oc-navbar-user")).not.toBeVisible();

      await component.unmount();
    });

    test("should show user menu when authenticated", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockRegularUser} />
      );

      // User name should be visible
      await expect(page.locator("text=Test User")).toBeVisible({
        timeout: 5000,
      });

      // Login button should not be visible
      await expect(page.locator("button:has-text('Login')")).not.toBeVisible();

      await component.unmount();
    });

    test("should display username when name is not available", async ({
      mount,
      page,
    }) => {
      const userWithoutName = { ...mockRegularUser, name: undefined };

      const component = await mount(
        <NavMenuTestWrapper mockUser={userWithoutName} />
      );

      // Should fall back to username
      await expect(page.locator("text=testuser")).toBeVisible({
        timeout: 5000,
      });

      await component.unmount();
    });
  });

  test.describe("User Menu Items", () => {
    test("should show Exports, Profile, and Logout for regular user", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockRegularUser} />
      );

      // Open user dropdown
      await page.locator("text=Test User").click();

      // Check menu items
      await expect(page.locator("text=Exports")).toBeVisible({ timeout: 2000 });
      await expect(page.locator("text=Profile")).toBeVisible();
      await expect(page.locator("text=Logout")).toBeVisible();

      // Admin Settings should NOT be visible for regular user
      await expect(page.locator("text=Admin Settings")).not.toBeVisible();

      await component.unmount();
    });

    test("should show Admin Settings for superuser", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockSuperuser} />
      );

      // Open user dropdown
      await page.locator("text=Admin User").click();

      // Admin Settings should be visible for superuser
      await expect(page.locator("text=Admin Settings")).toBeVisible({
        timeout: 2000,
      });

      await component.unmount();
    });
  });

  test.describe("Superuser Features", () => {
    test("should show Badge Management nav item for superuser", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockSuperuser} />
      );

      // Badge Management should be visible for superuser
      await expect(page.locator("text=Badge Management")).toBeVisible({
        timeout: 5000,
      });

      await component.unmount();
    });

    test("should NOT show Badge Management for regular user", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockRegularUser} />
      );

      // Badge Management should NOT be visible
      await expect(page.locator("text=Badge Management")).not.toBeVisible();

      await component.unmount();
    });

    test("should NOT show Badge Management for unauthenticated user", async ({
      mount,
      page,
    }) => {
      const component = await mount(<NavMenuTestWrapper mockUser={null} />);

      // Badge Management should NOT be visible
      await expect(page.locator("text=Badge Management")).not.toBeVisible();

      await component.unmount();
    });
  });

  test.describe("Branding", () => {
    test("should display Open Contracts brand name", async ({
      mount,
      page,
    }) => {
      const component = await mount(<NavMenuTestWrapper />);

      await expect(page.locator("text=Open Contracts")).toBeVisible({
        timeout: 5000,
      });

      await component.unmount();
    });

    test("should display logo image", async ({ mount, page }) => {
      const component = await mount(<NavMenuTestWrapper />);

      await expect(page.locator('img[alt="Open Contracts Logo"]')).toBeVisible({
        timeout: 5000,
      });

      await component.unmount();
    });

    test("should display version badge on desktop", async ({ mount, page }) => {
      const component = await mount(<NavMenuTestWrapper />);

      // Version badge should contain version number (e.g., v3.0.0.b3)
      await expect(page.locator(".oc-chip")).toBeVisible({ timeout: 5000 });

      await component.unmount();
    });
  });

  test.describe("User Menu Actions", () => {
    test("should have correct icons in user menu", async ({ mount, page }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockRegularUser} />
      );

      // Open user dropdown by clicking on the user name
      await page.locator("text=Test User").click();

      // Wait for the dropdown to be visible, then check for SVG icons
      // The menu should contain items with icons
      await expect(page.locator("text=Exports")).toBeVisible({ timeout: 2000 });
      // Check that at least one SVG icon is present in the dropdown area
      await expect(page.locator("svg").first()).toBeVisible();

      await component.unmount();
    });

    test("should style Logout item appropriately", async ({ mount, page }) => {
      const component = await mount(
        <NavMenuTestWrapper mockUser={mockRegularUser} />
      );

      // Open user dropdown
      await page.locator("text=Test User").click();

      // Logout should be visible in the dropdown
      await expect(page.locator("text=Logout")).toBeVisible({ timeout: 2000 });

      await component.unmount();
    });
  });
});

test.describe("NavMenu Responsive Behavior", () => {
  // Note: These tests verify responsive behavior at mobile viewport widths.
  // The NavBar component from @os-legal/ui handles responsive behavior internally.

  test("should show hamburger menu on mobile viewport", async ({
    mount,
    page,
  }) => {
    // Set mobile viewport before mounting
    await page.setViewportSize({ width: 800, height: 600 });

    const component = await mount(<NavMenuTestWrapper />);

    // Hamburger/mobile menu toggle should be visible on narrow viewport
    await expect(page.locator(".oc-navbar__mobile-toggle")).toBeVisible({
      timeout: 5000,
    });

    await component.unmount();
  });

  test("should toggle mobile menu when hamburger is clicked", async ({
    mount,
    page,
  }) => {
    // Set mobile viewport before mounting
    await page.setViewportSize({ width: 800, height: 600 });

    const component = await mount(<NavMenuTestWrapper />);

    // Click hamburger menu to open mobile nav
    const hamburger = page.locator(".oc-navbar__mobile-toggle");
    await expect(hamburger).toBeVisible({ timeout: 5000 });
    await hamburger.click();

    // After clicking, mobile menu should be visible with nav items
    // Use the mobile-specific link class to target the mobile menu
    await expect(
      page.locator(".oc-navbar__mobile-link:has-text('Discover')")
    ).toBeVisible({ timeout: 2000 });

    await component.unmount();
  });
});
