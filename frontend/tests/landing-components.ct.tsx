// Playwright Component Tests for Landing Page Components
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { HeroSection } from "../src/components/landing/HeroSection";
import { StatsBar } from "../src/components/landing/StatsBar";
import { TrendingCorpuses } from "../src/components/landing/TrendingCorpuses";
import { RecentDiscussions } from "../src/components/landing/RecentDiscussions";
import { TopContributors } from "../src/components/landing/TopContributors";
import { CallToAction } from "../src/components/landing/CallToAction";
import { DiscoveryLanding } from "../src/views/DiscoveryLanding";
import { LandingTestWrapper } from "./LandingTestWrapper";
import { GET_DISCOVERY_DATA } from "../src/graphql/landing-queries";

// Mock data
const mockCommunityStats = {
  totalUsers: 1234,
  totalThreads: 234,
  totalMessages: 5678,
  totalAnnotations: 12345,
  activeUsersThisWeek: 89,
  activeUsersThisMonth: 234,
};

const mockCorpuses = [
  {
    node: {
      id: "Q29ycHVzVHlwZTox",
      slug: "legal-contracts",
      title: "Legal Contracts Collection",
      description: "A comprehensive collection of legal contracts for analysis",
      icon: null,
      isPublic: true,
      created: "2024-01-15T10:30:00Z",
      creator: {
        id: "VXNlclR5cGU6MQ==",
        username: "testuser",
        slug: "testuser",
      },
      documents: { totalCount: 150 },
      annotations: { totalCount: 5000 },
      engagementMetrics: {
        totalThreads: 25,
        totalMessages: 150,
        uniqueContributors: 12,
      },
    },
  },
  {
    node: {
      id: "Q29ycHVzVHlwZToy",
      slug: "research-papers",
      title: "Research Papers Archive",
      description: "Academic research papers on various topics",
      icon: null,
      isPublic: true,
      created: "2024-02-01T14:00:00Z",
      creator: {
        id: "VXNlclR5cGU6Mg==",
        username: "researcher",
        slug: "researcher",
      },
      documents: { totalCount: 300 },
      annotations: { totalCount: 8000 },
      engagementMetrics: {
        totalThreads: 45,
        totalMessages: 320,
        uniqueContributors: 28,
      },
    },
  },
];

const mockDiscussions = [
  {
    node: {
      id: "Q29udmVyc2F0aW9uVHlwZTox",
      title: "Discussion about contract clauses",
      description: "Let's analyze the key clauses in this contract",
      createdAt: "2024-03-10T10:00:00Z",
      updatedAt: "2024-03-10T15:30:00Z",
      isPinned: true,
      isLocked: false,
      creator: {
        id: "VXNlclR5cGU6MQ==",
        username: "testuser",
      },
      chatMessages: { totalCount: 15 },
      chatWithCorpus: {
        id: "Q29ycHVzVHlwZTox",
        title: "Legal Contracts Collection",
        slug: "legal-contracts",
        creator: { slug: "testuser" },
      },
    },
  },
  {
    node: {
      id: "Q29udmVyc2F0aW9uVHlwZToy",
      title: "Research methodology questions",
      description:
        "Questions about the research methodology used in this paper",
      createdAt: "2024-03-09T08:00:00Z",
      updatedAt: "2024-03-09T16:45:00Z",
      isPinned: false,
      isLocked: false,
      creator: {
        id: "VXNlclR5cGU6Mg==",
        username: "researcher",
      },
      chatMessages: { totalCount: 8 },
      chatWithCorpus: {
        id: "Q29ycHVzVHlwZToy",
        title: "Research Papers Archive",
        slug: "research-papers",
        creator: { slug: "researcher" },
      },
    },
  },
];

const mockLeaderboard = [
  {
    id: "VXNlclR5cGU6MQ==",
    username: "topcontributor",
    slug: "topcontributor",
    reputationGlobal: 1500,
    totalMessages: 250,
    totalThreadsCreated: 35,
    totalAnnotationsCreated: 500,
    badges: {
      edges: [
        {
          node: {
            badge: {
              id: "QmFkZ2VUeXBlOjE=",
              name: "Expert",
              icon: "🏆",
              color: "#FFD700",
            },
          },
        },
      ],
    },
  },
  {
    id: "VXNlclR5cGU6Mg==",
    username: "activeuser",
    slug: "activeuser",
    reputationGlobal: 1200,
    totalMessages: 180,
    totalThreadsCreated: 20,
    totalAnnotationsCreated: 350,
    badges: {
      edges: [],
    },
  },
];

const mockDiscoveryData = {
  corpuses: {
    edges: mockCorpuses,
    pageInfo: { hasNextPage: false, endCursor: null },
  },
  conversations: {
    edges: mockDiscussions,
    pageInfo: { hasNextPage: false, endCursor: null },
    totalCount: 2,
  },
  communityStats: mockCommunityStats,
  globalLeaderboard: mockLeaderboard,
};

// ============================================================================
// HeroSection Tests
// ============================================================================
test.describe("HeroSection Component", () => {
  test("should render hero section with title and search", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <LandingTestWrapper>
        <HeroSection isAuthenticated={false} />
      </LandingTestWrapper>
    );

    // Check main title is visible
    await expect(page.locator("text=Discover, Analyze &")).toBeVisible({
      timeout: 10000,
    });

    // Check search input is present
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();

    // Check quick links are present
    await expect(page.locator("text=Browse Collections")).toBeVisible();
    await expect(page.locator("text=All Discussions")).toBeVisible();

    await component.unmount();
  });

  test("should show different subtitle for authenticated users", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <LandingTestWrapper>
        <HeroSection isAuthenticated={true} />
      </LandingTestWrapper>
    );

    // Check for authenticated user subtitle
    await expect(page.locator("text=Welcome back!")).toBeVisible({
      timeout: 10000,
    });

    await component.unmount();
  });
});

// ============================================================================
// StatsBar Tests
// ============================================================================
test.describe("StatsBar Component", () => {
  test("should render stats correctly", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <StatsBar stats={mockCommunityStats} loading={false} />
      </LandingTestWrapper>
    );

    // Check that stats values are rendered (formatted numbers)
    await expect(page.locator("text=1.2K")).toBeVisible({ timeout: 10000 }); // totalUsers: 1234 -> 1.2K
    await expect(page.locator("text=Users")).toBeVisible();
    await expect(page.locator("text=Discussions")).toBeVisible();
    await expect(page.locator("text=Annotations")).toBeVisible();

    await component.unmount();
  });

  test("should handle null stats gracefully", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <StatsBar stats={null} loading={false} />
      </LandingTestWrapper>
    );

    // Should show dash for missing values (there are 6 stat cards, all showing dash)
    await expect(page.locator("text=—").first()).toBeVisible({
      timeout: 10000,
    });

    await component.unmount();
  });
});

// ============================================================================
// TrendingCorpuses Tests
// ============================================================================
test.describe("TrendingCorpuses Component", () => {
  test("should render corpus cards", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <TrendingCorpuses corpuses={mockCorpuses} loading={false} />
      </LandingTestWrapper>
    );

    // Check section header
    await expect(page.locator("text=Trending Collections")).toBeVisible({
      timeout: 10000,
    });

    // Check corpus titles are rendered
    await expect(page.locator("text=Legal Contracts Collection")).toBeVisible();
    await expect(page.locator("text=Research Papers Archive")).toBeVisible();

    // Check View All button
    await expect(page.locator("text=View All")).toBeVisible();

    await component.unmount();
  });

  test("should display corpus stats", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <TrendingCorpuses corpuses={mockCorpuses} loading={false} />
      </LandingTestWrapper>
    );

    // Check stats are shown
    await expect(page.locator("text=150 docs")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=25 threads")).toBeVisible();

    await component.unmount();
  });
});

// ============================================================================
// RecentDiscussions Tests
// ============================================================================
test.describe("RecentDiscussions Component", () => {
  test("should render discussion items", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <RecentDiscussions
          discussions={mockDiscussions}
          loading={false}
          totalCount={2}
        />
      </LandingTestWrapper>
    );

    // Check section header
    await expect(page.locator("text=Recent Discussions")).toBeVisible({
      timeout: 10000,
    });

    // Check discussion titles
    await expect(
      page.locator("text=Discussion about contract clauses")
    ).toBeVisible();
    await expect(
      page.locator("text=Research methodology questions")
    ).toBeVisible();

    await component.unmount();
  });

  test("should show pinned badge for pinned discussions", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <LandingTestWrapper>
        <RecentDiscussions discussions={mockDiscussions} loading={false} />
      </LandingTestWrapper>
    );

    // First discussion is pinned
    await expect(page.locator("text=Pinned")).toBeVisible({ timeout: 10000 });

    await component.unmount();
  });

  test("should display reply count", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <RecentDiscussions discussions={mockDiscussions} loading={false} />
      </LandingTestWrapper>
    );

    await expect(page.locator("text=15 replies")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=8 replies")).toBeVisible();

    await component.unmount();
  });
});

// ============================================================================
// TopContributors Tests
// ============================================================================
test.describe("TopContributors Component", () => {
  test("should render contributor cards", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <TopContributors contributors={mockLeaderboard} loading={false} />
      </LandingTestWrapper>
    );

    // Check section header
    await expect(page.locator("text=Top Contributors")).toBeVisible({
      timeout: 10000,
    });

    // Check contributor names
    await expect(page.locator("text=topcontributor")).toBeVisible();
    await expect(page.locator("text=activeuser")).toBeVisible();

    await component.unmount();
  });

  test("should display reputation scores", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <TopContributors contributors={mockLeaderboard} loading={false} />
      </LandingTestWrapper>
    );

    // Check reputation values
    await expect(page.locator("text=1500")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=1200")).toBeVisible();

    await component.unmount();
  });

  test("should show Full Leaderboard button", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <TopContributors contributors={mockLeaderboard} loading={false} />
      </LandingTestWrapper>
    );

    await expect(page.locator("text=Full Leaderboard")).toBeVisible({
      timeout: 10000,
    });

    await component.unmount();
  });
});

// ============================================================================
// CallToAction Tests
// ============================================================================
test.describe("CallToAction Component", () => {
  test("should render CTA for anonymous users", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <CallToAction isAuthenticated={false} />
      </LandingTestWrapper>
    );

    // Check CTA content
    await expect(page.locator("text=Ready to dive in?")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("text=Get Started Free")).toBeVisible();

    // Check features
    await expect(page.locator("text=Open Source & Free")).toBeVisible();
    await expect(page.locator("text=AI-Powered Analysis")).toBeVisible();

    await component.unmount();
  });

  test("should not render for authenticated users", async ({ mount, page }) => {
    const component = await mount(
      <LandingTestWrapper>
        <CallToAction isAuthenticated={true} />
      </LandingTestWrapper>
    );

    // CTA should not be visible for authenticated users
    await expect(page.locator("text=Ready to dive in?")).not.toBeVisible({
      timeout: 5000,
    });

    await component.unmount();
  });
});

// ============================================================================
// DiscoveryLanding Integration Tests
// ============================================================================
test.describe("DiscoveryLanding Page", () => {
  test("should render hero section", async ({ mount, page }) => {
    const discoveryDataMock = {
      request: {
        query: GET_DISCOVERY_DATA,
        variables: {
          corpusLimit: 6,
          discussionLimit: 5,
          leaderboardLimit: 6,
          conversationType: "THREAD",
        },
      },
      result: {
        data: mockDiscoveryData,
      },
    };

    const component = await mount(
      <LandingTestWrapper mocks={[discoveryDataMock]}>
        <DiscoveryLanding isAuthenticatedOverride={false} />
      </LandingTestWrapper>
    );

    // Check hero section
    await expect(page.locator("text=Discover, Analyze &")).toBeVisible({
      timeout: 15000,
    });

    await component.unmount();
  });
});
