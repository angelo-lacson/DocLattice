import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { ActionExecutionTrail } from "../src/components/corpuses/ActionExecutionTrail";
import { ActionExecutionCard } from "../src/components/corpuses/ActionExecutionCard";
import { ActionTrailStats } from "../src/components/corpuses/ActionTrailStats";
import {
  GET_CORPUS_ACTION_EXECUTIONS,
  GET_CORPUS_ACTION_TRAIL_STATS,
  GET_CORPUS_ACTIONS,
  CorpusActionExecutionNode,
  CorpusActionTrailStats,
} from "../src/graphql/queries";

// ============================================================
// MOCK DATA
// ============================================================

const mockExecution: CorpusActionExecutionNode = {
  id: "exec-1",
  status: "completed",
  actionType: "fieldset",
  trigger: "add_document",
  queuedAt: "2025-01-15T10:00:00Z",
  startedAt: "2025-01-15T10:00:05Z",
  completedAt: "2025-01-15T10:00:35Z",
  durationSeconds: 30,
  waitTimeSeconds: 5,
  errorMessage: "",
  affectedObjects: [
    { type: "extract", id: 1 },
    { type: "datacell", id: 2, column_name: "parties" },
    { type: "datacell", id: 3, column_name: "effective_date" },
  ],
  executionMetadata: { model: "gpt-4", tokens_used: 1500 },
  corpusAction: {
    id: "action-1",
    name: "Extract Contract Fields",
    fieldset: { id: "fs-1", name: "Contract Fieldset" },
  },
  document: {
    id: "doc-1",
    title: "Sample Contract.pdf",
    slug: "sample-contract",
    creator: { id: "user-1", slug: "john" },
  },
  corpus: {
    id: "corpus-1",
    slug: "legal-corpus",
    creator: { id: "user-1", slug: "john" },
  },
  extract: { id: "extract-1", name: "Contract Extract" },
  creator: { id: "user-1", username: "john" },
};

const mockFailedExecution: CorpusActionExecutionNode = {
  ...mockExecution,
  id: "exec-2",
  status: "failed",
  errorMessage: "Connection timeout while processing document",
  completedAt: "2025-01-15T10:01:00Z",
  durationSeconds: 55,
  affectedObjects: [],
};

const mockRunningExecution: CorpusActionExecutionNode = {
  ...mockExecution,
  id: "exec-3",
  status: "running",
  completedAt: null,
  durationSeconds: null,
  affectedObjects: [],
};

const mockStats: CorpusActionTrailStats = {
  totalExecutions: 150,
  completed: 120,
  failed: 10,
  running: 5,
  queued: 10,
  skipped: 5,
  avgDurationSeconds: 25.5,
  fieldsetCount: 80,
  analyzerCount: 40,
  agentCount: 30,
};

const mockActions = [
  {
    id: "action-1",
    name: "Extract Contract Fields",
    trigger: "add_document",
    disabled: false,
    runOnAllCorpuses: false,
    creator: { id: "user-1", username: "john" },
    fieldset: { id: "fs-1", name: "Contract Fieldset" },
    analyzer: null,
    agentConfig: null,
    agentPrompt: null,
    preAuthorizedTools: [],
    created: "2025-01-01T00:00:00Z",
    modified: "2025-01-01T00:00:00Z",
  },
];

// ============================================================
// GRAPHQL MOCKS
// ============================================================

const createMocks = (
  options: {
    executions?: CorpusActionExecutionNode[];
    stats?: CorpusActionTrailStats;
  } = {}
): MockedResponse[] => [
  {
    request: {
      query: GET_CORPUS_ACTION_EXECUTIONS,
      variables: {
        corpusId: "corpus-1",
        first: 20,
      },
    },
    result: {
      data: {
        corpusActionExecutions: {
          edges: (options.executions || [mockExecution]).map((node) => ({
            node,
          })),
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: (options.executions || [mockExecution]).length,
        },
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_ACTION_TRAIL_STATS,
      variables: { corpusId: "corpus-1" },
    },
    result: {
      data: {
        corpusActionTrailStats: options.stats || mockStats,
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_ACTIONS,
      variables: { corpusId: "corpus-1" },
    },
    result: {
      data: {
        corpusActions: {
          edges: mockActions.map((node) => ({ node })),
        },
      },
    },
  },
];

// ============================================================
// STATS COMPONENT TESTS
// ============================================================

test.describe("ActionTrailStats Component", () => {
  test("should display all stats correctly", async ({ mount, page }) => {
    await mount(<ActionTrailStats stats={mockStats} loading={false} />);

    // Verify all stat values are displayed
    await expect(page.getByText("150")).toBeVisible();
    await expect(page.getByText("120")).toBeVisible();

    // Verify labels
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();
    await expect(page.getByText("Queued")).toBeVisible();
    await expect(page.getByText("Failed")).toBeVisible();
  });

  test("should show loading state with placeholder cards", async ({
    mount,
    page,
  }) => {
    await mount(<ActionTrailStats stats={null} loading={true} />);

    // Check for loading region
    const region = page.getByRole("region", {
      name: "Action execution statistics",
    });
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute("aria-busy", "true");
  });

  test("should be accessible with proper ARIA labels", async ({
    mount,
    page,
  }) => {
    await mount(<ActionTrailStats stats={mockStats} loading={false} />);

    const region = page.getByRole("region", {
      name: "Action execution statistics",
    });
    await expect(region).toBeVisible();
  });

  test("should handle zero counts correctly", async ({ mount, page }) => {
    const zeroStats: CorpusActionTrailStats = {
      totalExecutions: 0,
      completed: 0,
      failed: 0,
      running: 0,
      queued: 0,
      skipped: 0,
      avgDurationSeconds: null,
      fieldsetCount: 0,
      analyzerCount: 0,
      agentCount: 0,
    };

    await mount(<ActionTrailStats stats={zeroStats} loading={false} />);

    // Should show multiple zeros for the different stat cards
    const zeros = page.getByText("0");
    await expect(zeros.first()).toBeVisible();
  });
});

// ============================================================
// CARD COMPONENT TESTS
// ============================================================

test.describe("ActionExecutionCard Component", () => {
  test("should display completed execution correctly", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution} />
      </MemoryRouter>
    );

    // Action name visible
    await expect(page.getByText("Extract Contract Fields")).toBeVisible();

    // Document link visible
    await expect(page.getByText("Sample Contract.pdf")).toBeVisible();

    // Status badge (use exact match to avoid "Completed At")
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();

    // Duration shown
    await expect(page.getByText(/Duration.*30s/)).toBeVisible();

    // Affected objects section
    await expect(page.getByText(/Affected Objects/)).toBeVisible();
    await expect(page.getByText(/parties/)).toBeVisible();
    await expect(page.getByText(/effective_date/)).toBeVisible();
  });

  test("should display failed execution with error message", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockFailedExecution} />
      </MemoryRouter>
    );

    // Status badge shows failed
    await expect(page.getByText("Failed")).toBeVisible();

    // Error section visible
    await expect(page.getByText(/Error/)).toBeVisible();
    await expect(page.getByText(/Connection timeout/)).toBeVisible();
  });

  test("should display running execution without duration", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockRunningExecution} />
      </MemoryRouter>
    );

    // Status badge shows running
    await expect(page.getByText("Running")).toBeVisible();

    // No error section should be visible
    await expect(page.getByText(/Error Message/)).not.toBeVisible();
  });

  test("should have accessible article role", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution} />
      </MemoryRouter>
    );

    const article = page.getByRole("article");
    await expect(article).toBeVisible();
  });

  test("should show document link as clickable button", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution} />
      </MemoryRouter>
    );

    const docLink = page.getByText("Sample Contract.pdf");
    await expect(docLink).toBeVisible();

    // Should be clickable (button element)
    await docLink.click();
    // Navigation would happen in real app - just verify no error
  });

  test("should render affected object chips", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution} />
      </MemoryRouter>
    );

    // Check for object list
    const objectList = page.getByRole("list");
    await expect(objectList).toBeVisible();

    // Check for list items
    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(3);
  });
});

// ============================================================
// TRAIL COMPONENT TESTS
// ============================================================

test.describe("ActionExecutionTrail Component", () => {
  test("should load and display executions", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data to load
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Stats should be visible
    await expect(page.getByText("150")).toBeVisible();

    // Execution card should be visible (use heading role to be specific)
    await expect(
      page.getByRole("heading", { name: "Extract Contract Fields" })
    ).toBeVisible();
    await expect(page.getByText("Sample Contract.pdf")).toBeVisible();
  });

  test("should display filter dropdowns", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for initial load
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Check filter labels are visible (use locator for labels)
    await expect(page.locator('label[for="status-filter"]')).toBeVisible();
    await expect(page.locator('label[for="type-filter"]')).toBeVisible();
    await expect(page.locator('label[for="action-filter"]')).toBeVisible();
    await expect(page.locator('label[for="time-filter"]')).toBeVisible();
  });

  test("should show empty state when no executions", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider
          mocks={createMocks({ executions: [] })}
          addTypename={false}
        >
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for empty state
    await expect(page.getByText("No Executions Found")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText(/Action executions will appear here/)
    ).toBeVisible();
  });

  test("should show results count when executions exist", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Check for results count
    await expect(page.getByText(/Showing 1 of 1 executions/)).toBeVisible();
  });

  test("filters should have accessible search region", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Check search region
    const searchRegion = page.getByRole("search", {
      name: "Filter action executions",
    });
    await expect(searchRegion).toBeVisible();
  });
});

// ============================================================
// MOBILE RESPONSIVE TESTS
// ============================================================

test.describe("ActionExecutionTrail Mobile Layout", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test("should display compact layout on mobile", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Stats region should adapt to smaller viewport
    const statsRegion = page.getByRole("region", {
      name: "Action execution statistics",
    });
    await expect(statsRegion).toBeVisible();

    // Filters should still be visible
    const searchRegion = page.getByRole("search", {
      name: "Filter action executions",
    });
    await expect(searchRegion).toBeVisible();

    // Execution card should be visible and readable (use heading role)
    await expect(
      page.getByRole("heading", { name: "Extract Contract Fields" })
    ).toBeVisible();
  });

  test("should show card correctly on mobile viewport", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution} />
      </MemoryRouter>
    );

    // Card should be fully visible
    const card = page.getByRole("article");
    await expect(card).toBeVisible();

    // Content should be readable (use heading role for action name)
    await expect(
      page.getByRole("heading", { name: "Extract Contract Fields" })
    ).toBeVisible();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  });
});

// ============================================================
// DESKTOP LAYOUT TESTS
// ============================================================

test.describe("ActionExecutionTrail Desktop Layout", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("should display full layout on desktop", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Stats should show in full grid - scope to stats region to avoid dropdown matches
    const statsRegion = page.getByRole("region", {
      name: "Action execution statistics",
    });
    await expect(statsRegion.getByText("Total")).toBeVisible();
    await expect(statsRegion.getByText("Completed")).toBeVisible();
    await expect(statsRegion.getByText("Running")).toBeVisible();
    await expect(statsRegion.getByText("Queued")).toBeVisible();
    await expect(statsRegion.getByText("Failed")).toBeVisible();

    // All filter labels visible (use label locators)
    await expect(page.locator('label[for="status-filter"]')).toBeVisible();
    await expect(page.locator('label[for="type-filter"]')).toBeVisible();
    await expect(page.locator('label[for="action-filter"]')).toBeVisible();
    await expect(page.locator('label[for="time-filter"]')).toBeVisible();
  });
});

// ============================================================
// ACCESSIBILITY TESTS
// ============================================================

test.describe("ActionExecutionTrail Accessibility", () => {
  test("should have proper ARIA roles and labels", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Check main regions
    await expect(
      page.getByRole("region", { name: "Action execution statistics" })
    ).toBeVisible();
    await expect(
      page.getByRole("search", { name: "Filter action executions" })
    ).toBeVisible();
    await expect(
      page.getByRole("feed", { name: "Action execution history" })
    ).toBeVisible();
  });

  test("should have accessible status announcements", async ({
    mount,
    page,
  }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Check for live region with results count
    const statusElement = page.getByRole("status");
    await expect(statusElement.first()).toBeVisible();
  });

  test("stats component should have aria-live for screen readers", async ({
    mount,
    page,
  }) => {
    await mount(<ActionTrailStats stats={mockStats} loading={false} />);

    // Values should have aria-live for dynamic updates
    const liveElements = page.locator('[aria-live="polite"]');
    await expect(liveElements.first()).toBeVisible();
  });
});

// ============================================================
// ERROR HANDLING TESTS
// ============================================================

test.describe("ActionExecutionTrail Error Handling", () => {
  test("should display error message when query fails", async ({
    mount,
    page,
  }) => {
    const errorMocks: MockedResponse[] = [
      {
        request: {
          query: GET_CORPUS_ACTION_EXECUTIONS,
          variables: {
            corpusId: "corpus-1",
            first: 20,
          },
        },
        error: new Error("Network error: Failed to fetch"),
      },
      {
        request: {
          query: GET_CORPUS_ACTION_TRAIL_STATS,
          variables: { corpusId: "corpus-1" },
        },
        result: {
          data: {
            corpusActionTrailStats: mockStats,
          },
        },
      },
      {
        request: {
          query: GET_CORPUS_ACTIONS,
          variables: { corpusId: "corpus-1" },
        },
        result: {
          data: {
            corpusActions: {
              edges: [],
            },
          },
        },
      },
    ];

    await mount(
      <MemoryRouter>
        <MockedProvider mocks={errorMocks} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for error message
    await expect(page.getByText("Error Loading Executions")).toBeVisible({
      timeout: 10000,
    });
  });
});
