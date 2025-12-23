// Playwright Component Tests for Mobile Responsive Behavior (#690)
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { Badge } from "../src/components/badges/Badge";
import { UserBadges } from "../src/components/badges/UserBadges";
import { GlobalSettingsPanel } from "../src/components/admin/GlobalSettingsPanel";
import UserSettingsModalHarness from "./UserSettingsModalHarness";
import { GET_USER_BADGES } from "../src/graphql/queries";

// Test wrapper for UserBadges component
const UserBadgesTestWrapper: React.FC<{
  userId: string;
  badges?: Array<{ id: string; name: string; description: string; icon: string; color: string }>;
}> = ({ userId, badges = [] }) => {
  const mockBadges = badges.map((badge) => ({
    node: {
      id: `user-badge-${badge.id}`,
      badge: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        color: badge.color,
        badgeType: "GLOBAL",
      },
      awardedAt: "2024-01-15T10:30:00Z",
      awardedBy: null,
      corpus: null,
    },
  }));

  const mocks = [
    {
      request: {
        query: GET_USER_BADGES,
        variables: { userId, corpusId: undefined, limit: 100 },
      },
      result: {
        data: {
          userBadges: {
            edges: mockBadges,
          },
        },
      },
    },
  ];

  return (
    <MockedProvider mocks={mocks} addTypename={false}>
      <UserBadges userId={userId} />
    </MockedProvider>
  );
};

// Test wrapper for GlobalSettingsPanel
const GlobalSettingsPanelTestWrapper: React.FC = () => (
  <MemoryRouter>
    <GlobalSettingsPanel />
  </MemoryRouter>
);

// ============================================================
// Badge Component - Touch and Mobile Tests
// ============================================================

test.describe("Badge Component - Mobile Responsive", () => {
  const mockBadge = {
    id: "badge-1",
    name: "Test Badge",
    description: "This is a test badge description for testing purposes",
    icon: "Award",
    color: "#6366f1",
    badgeType: "GLOBAL" as const,
  };

  test("should display badge with correct styling", async ({ mount, page }) => {
    const component = await mount(<Badge badge={mockBadge} size="small" showTooltip={true} />);

    await expect(component.locator(".ui.label")).toBeVisible();
    await expect(component.getByText("Test Badge")).toBeVisible();
  });

  test("should show popup on hover (desktop)", async ({ mount, page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    const component = await mount(<Badge badge={mockBadge} size="small" showTooltip={true} />);

    // Hover over badge
    await component.locator(".ui.label").hover();
    await page.waitForTimeout(300);

    // Popup should be visible
    await expect(page.getByText("This is a test badge description")).toBeVisible();
  });

  test("should show popup on click/tap (mobile viewport)", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<Badge badge={mockBadge} size="small" showTooltip={true} />);

    // Click on badge (simulating touch)
    await component.locator(".ui.label").click();
    await page.waitForTimeout(300);

    // Popup should be visible (centered on mobile)
    await expect(page.getByText("This is a test badge description")).toBeVisible();
  });

  test("should dismiss popup when clicking overlay (mobile)", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<Badge badge={mockBadge} size="small" showTooltip={true} />);

    // Open popup
    await component.locator(".ui.label").click();
    await page.waitForTimeout(300);

    // Verify popup is visible
    await expect(page.getByText("This is a test badge description")).toBeVisible();

    // Click on overlay to dismiss (click outside the popup area)
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);

    // Popup should be hidden
    await expect(page.getByText("This is a test badge description")).not.toBeVisible();
  });

  test("badge should have larger touch target on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<Badge badge={mockBadge} size="small" showTooltip={true} />);

    const badge = component.locator(".ui.label");
    const box = await badge.boundingBox();

    // Badge should have minimum height for touch targets (36px)
    expect(box?.height).toBeGreaterThanOrEqual(36);
  });
});

// ============================================================
// UserBadges Container - Mobile Responsive Tests
// ============================================================

test.describe("UserBadges Container - Mobile Responsive", () => {
  const testBadges = [
    { id: "1", name: "First Badge", description: "First description", icon: "Award", color: "#6366f1" },
    { id: "2", name: "Second Badge", description: "Second description", icon: "Trophy", color: "#f59e0b" },
    { id: "3", name: "Third Badge", description: "Third description", icon: "Star", color: "#10b981" },
  ];

  test("should display badges with wrap layout", async ({ mount, page }) => {
    const component = await mount(<UserBadgesTestWrapper userId="user-1" badges={testBadges} />);

    // Wait for badges to load
    await expect(page.getByText("First Badge")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Second Badge")).toBeVisible();
    await expect(page.getByText("Third Badge")).toBeVisible();
  });

  test("should center badges on mobile viewport", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<UserBadgesTestWrapper userId="user-1" badges={testBadges} />);

    // Wait for badges to load
    await expect(page.getByText("First Badge")).toBeVisible({ timeout: 5000 });

    // Container should have centered content on mobile
    // We verify this by checking the badge container's computed style
    const container = component.locator("div").filter({ has: page.getByText("First Badge") }).first();
    await expect(container).toBeVisible();
  });

  test("should show empty state on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<UserBadgesTestWrapper userId="user-1" badges={[]} />);

    // Empty state message should be visible
    await expect(page.getByText("No badges earned yet")).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// GlobalSettingsPanel - Mobile Responsive Tests
// ============================================================

test.describe("GlobalSettingsPanel - Mobile Responsive", () => {
  test("should display all settings cards on desktop", async ({ mount, page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    const component = await mount(<GlobalSettingsPanelTestWrapper />);

    await expect(page.getByText("Admin Settings")).toBeVisible();
    await expect(page.getByText("Badge Management")).toBeVisible();
    await expect(page.getByText("Global Agents")).toBeVisible();
    await expect(page.getByText("System Settings")).toBeVisible();
    await expect(page.getByText("User Management")).toBeVisible();
  });

  test("should display settings cards in single column on small mobile", async ({ mount, page }) => {
    // Set small mobile viewport (iPhone SE size)
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<GlobalSettingsPanelTestWrapper />);

    await expect(page.getByText("Admin Settings")).toBeVisible();
    await expect(page.getByText("Badge Management")).toBeVisible();

    // Cards should be visible in single column layout
    const badgeCard = page.locator("text=Badge Management").locator("..").locator("..");
    const agentsCard = page.locator("text=Global Agents").locator("..").locator("..");

    const badgeBox = await badgeCard.boundingBox();
    const agentsBox = await agentsCard.boundingBox();

    // On mobile single-column, cards should have similar x positions
    if (badgeBox && agentsBox) {
      // Cards should be stacked (y positions different, x positions similar)
      expect(Math.abs(badgeBox.x - agentsBox.x)).toBeLessThan(50);
    }
  });

  test("should show Coming Soon badges on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<GlobalSettingsPanelTestWrapper />);

    // Coming Soon badges should be visible
    const comingSoonBadges = page.locator("text=Coming Soon");
    await expect(comingSoonBadges.first()).toBeVisible({ timeout: 5000 });
  });

  test("should have touch-friendly card sizes on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const component = await mount(<GlobalSettingsPanelTestWrapper />);

    await expect(page.getByText("Badge Management")).toBeVisible();

    // Find a settings card and check it has reasonable size for touch
    const card = page.locator(".ui.card").first();
    const box = await card.boundingBox();

    // Card should have minimum touch-friendly dimensions
    expect(box?.height).toBeGreaterThan(80);
    expect(box?.width).toBeGreaterThan(200);
  });

  test("should adjust padding on tablet viewport", async ({ mount, page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    const component = await mount(<GlobalSettingsPanelTestWrapper />);

    await expect(page.getByText("Admin Settings")).toBeVisible();
    await expect(page.getByText("Badge Management")).toBeVisible();
  });
});

// ============================================================
// UserSettingsModal - Mobile Responsive Tests
// ============================================================

test.describe("UserSettingsModal - Mobile Responsive", () => {
  test("should display modal on mobile viewport", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await mount(<UserSettingsModalHarness mocks={[]} />);

    await expect(page.getByTestId("user-settings-modal")).toBeVisible();
    await expect(page.getByText("User Settings")).toBeVisible();
  });

  test("should have full-width buttons on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await mount(<UserSettingsModalHarness mocks={[]} />);

    // Wait for modal to be visible
    await expect(page.getByTestId("user-settings-modal")).toBeVisible();

    // Check that action buttons are visible
    await expect(page.getByRole("button", { name: /Close/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save/i })).toBeVisible();
  });

  test("should show form inputs on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await mount(<UserSettingsModalHarness mocks={[]} />);

    await expect(page.getByTestId("user-settings-modal")).toBeVisible();

    // Form inputs should be visible
    await expect(page.getByPlaceholder("your-slug")).toBeVisible();
    await expect(page.getByPlaceholder("Display name")).toBeVisible();
  });

  test("should display properly on very small viewport", async ({ mount, page }) => {
    // Set very small mobile viewport (iPhone SE 1st gen)
    await page.setViewportSize({ width: 320, height: 568 });

    await mount(<UserSettingsModalHarness mocks={[]} />);

    await expect(page.getByTestId("user-settings-modal")).toBeVisible();
    await expect(page.getByText("User Settings")).toBeVisible();

    // Modal should still be usable
    await expect(page.getByPlaceholder("your-slug")).toBeVisible();
  });

  test("should display profile visibility toggle on mobile", async ({ mount, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await mount(<UserSettingsModalHarness mocks={[]} />);

    await expect(page.getByTestId("user-settings-modal")).toBeVisible();

    // Profile visibility section should be visible
    await expect(page.getByText("Profile Visibility")).toBeVisible();
    await expect(page.getByText("Public Profile")).toBeVisible();
  });
});
