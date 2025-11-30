// Playwright Component Test for Admin Components (Settings Panel, Agent Management)
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { gql } from "@apollo/client";
import {
  GlobalSettingsPanelWrapper,
  GlobalAgentManagementWrapper,
  CorpusAgentManagementWrapper,
} from "./AdminComponentsTestWrapper";

// GraphQL queries/mutations used by GlobalAgentManagement
const GET_GLOBAL_AGENTS = gql`
  query GetGlobalAgents {
    agentConfigurations(scope: "GLOBAL") {
      edges {
        node {
          id
          name
          slug
          description
          systemInstructions
          availableTools
          permissionRequiredTools
          badgeConfig
          avatarUrl
          scope
          isActive
          isPublic
          creator {
            id
            username
          }
          created
          modified
        }
      }
    }
  }
`;

const GET_CORPUS_AGENTS = gql`
  query GetCorpusAgents($corpusId: ID!) {
    agentConfigurations(corpusId: $corpusId) {
      edges {
        node {
          id
          name
          slug
          description
          systemInstructions
          availableTools
          permissionRequiredTools
          badgeConfig
          avatarUrl
          scope
          isActive
          isPublic
          creator {
            id
            username
          }
          created
          modified
        }
      }
    }
  }
`;

// Mock data
const mockGlobalAgent = {
  id: "QWdlbnRDb25maWd1cmF0aW9uVHlwZTox",
  name: "Research Assistant",
  slug: "research-assistant",
  description: "AI assistant for research and document analysis",
  systemInstructions: "You are a helpful research assistant...",
  availableTools: ["similarity_search", "load_document_text"],
  permissionRequiredTools: [],
  badgeConfig: { icon: "robot", color: "#6366f1", label: "AI" },
  avatarUrl: null,
  scope: "GLOBAL",
  isActive: true,
  isPublic: true,
  creator: { id: "VXNlclR5cGU6MQ==", username: "admin" },
  created: "2024-01-15T10:30:00Z",
  modified: "2024-01-15T10:30:00Z",
};

const mockCorpusAgent = {
  id: "QWdlbnRDb25maWd1cmF0aW9uVHlwZToy",
  name: "Legal Analyst",
  slug: "legal-analyst",
  description: "AI assistant specialized for legal document review",
  systemInstructions: "You are a legal analyst...",
  availableTools: ["similarity_search", "search_exact_text"],
  permissionRequiredTools: ["create_annotation"],
  badgeConfig: { icon: "gavel", color: "#8b5cf6", label: "Legal" },
  avatarUrl: null,
  scope: "CORPUS",
  isActive: true,
  isPublic: false,
  creator: { id: "VXNlclR5cGU6MQ==", username: "admin" },
  created: "2024-01-15T10:30:00Z",
  modified: "2024-01-15T10:30:00Z",
};

test.describe("GlobalSettingsPanel Component", () => {
  test("should render the settings panel with all settings cards", async ({
    mount,
    page,
  }) => {
    const component = await mount(<GlobalSettingsPanelWrapper />);

    // Check page title
    await expect(page.locator("text=Admin Settings")).toBeVisible();

    // Check all settings cards are present
    await expect(page.locator("text=Badge Management")).toBeVisible();
    await expect(page.locator("text=Global Agents")).toBeVisible();
    await expect(page.locator("text=System Settings")).toBeVisible();
    await expect(page.locator("text=User Management")).toBeVisible();

    await component.unmount();
  });

  test("should show Coming Soon badge for unavailable features", async ({
    mount,
    page,
  }) => {
    const component = await mount(<GlobalSettingsPanelWrapper />);

    // Coming Soon badges should be visible
    const comingSoonBadges = page.locator("text=Coming Soon");
    await expect(comingSoonBadges).toHaveCount(2);

    await component.unmount();
  });

  test("should display descriptions for each settings card", async ({
    mount,
    page,
  }) => {
    const component = await mount(<GlobalSettingsPanelWrapper />);

    // Check descriptions are present
    await expect(
      page.locator("text=Create and manage badges that can be awarded")
    ).toBeVisible();
    await expect(
      page.locator("text=Configure global AI agents available")
    ).toBeVisible();

    await component.unmount();
  });
});

test.describe("GlobalAgentManagement Component", () => {
  test("should display list of global agents", async ({ mount, page }) => {
    const getGlobalAgentsMock = {
      request: {
        query: GET_GLOBAL_AGENTS,
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [{ node: mockGlobalAgent }],
          },
        },
      },
    };

    const component = await mount(
      <GlobalAgentManagementWrapper mocks={[getGlobalAgentsMock]} />
    );

    // Wait for agents to load
    await expect(page.locator("text=Research Assistant")).toBeVisible({
      timeout: 5000,
    });

    // Check slug is displayed
    await expect(page.locator("text=research-assistant")).toBeVisible();

    // Check status badge
    await expect(page.locator("text=Active")).toBeVisible();

    await component.unmount();
  });

  test("should show empty state when no agents exist", async ({
    mount,
    page,
  }) => {
    const emptyAgentsMock = {
      request: {
        query: GET_GLOBAL_AGENTS,
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [],
          },
        },
      },
    };

    const component = await mount(
      <GlobalAgentManagementWrapper mocks={[emptyAgentsMock]} />
    );

    // Check for empty state message
    await expect(page.locator("text=No Global Agents")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.locator("text=Create your first global agent")
    ).toBeVisible();

    await component.unmount();
  });

  test("should open create agent modal", async ({ mount, page }) => {
    const emptyAgentsMock = {
      request: {
        query: GET_GLOBAL_AGENTS,
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [],
          },
        },
      },
    };

    const component = await mount(
      <GlobalAgentManagementWrapper mocks={[emptyAgentsMock]} />
    );

    // Wait for content to load
    await expect(page.locator("text=No Global Agents")).toBeVisible({
      timeout: 5000,
    });

    // Click create agent button
    await page.locator('button:has-text("Create Agent")').first().click();

    // Modal should open
    await expect(page.locator("text=Create Global Agent")).toBeVisible();

    // Form fields should be present
    await expect(page.locator("label:has-text('Name')")).toBeVisible();
    await expect(page.locator("label:has-text('Description')")).toBeVisible();
    await expect(
      page.locator("label:has-text('System Instructions')")
    ).toBeVisible();

    await component.unmount();
  });

  test("should display tools as badges", async ({ mount, page }) => {
    const getGlobalAgentsMock = {
      request: {
        query: GET_GLOBAL_AGENTS,
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [{ node: mockGlobalAgent }],
          },
        },
      },
    };

    const component = await mount(
      <GlobalAgentManagementWrapper mocks={[getGlobalAgentsMock]} />
    );

    // Wait for agents to load
    await expect(page.locator("text=Research Assistant")).toBeVisible({
      timeout: 5000,
    });

    // Tools should be displayed as badges
    await expect(page.locator("text=similarity_search")).toBeVisible();
    await expect(page.locator("text=load_document_text")).toBeVisible();

    await component.unmount();
  });

  test("should have edit and delete buttons", async ({ mount, page }) => {
    const getGlobalAgentsMock = {
      request: {
        query: GET_GLOBAL_AGENTS,
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [{ node: mockGlobalAgent }],
          },
        },
      },
    };

    const component = await mount(
      <GlobalAgentManagementWrapper mocks={[getGlobalAgentsMock]} />
    );

    // Wait for agents to load
    await expect(page.locator("text=Research Assistant")).toBeVisible({
      timeout: 5000,
    });

    // Edit and delete buttons should be present
    await expect(page.locator("button i.edit.icon")).toBeVisible();
    await expect(page.locator("button i.trash.icon")).toBeVisible();

    await component.unmount();
  });
});

test.describe("CorpusAgentManagement Component", () => {
  test("should display list of corpus agents", async ({ mount, page }) => {
    const getCorpusAgentsMock = {
      request: {
        query: GET_CORPUS_AGENTS,
        variables: { corpusId: "Q29ycHVzVHlwZTox" },
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [{ node: mockCorpusAgent }],
          },
        },
      },
    };

    const component = await mount(
      <CorpusAgentManagementWrapper
        corpusId="Q29ycHVzVHlwZTox"
        canUpdate={true}
        mocks={[getCorpusAgentsMock]}
      />
    );

    // Wait for agents to load
    await expect(page.locator("text=Legal Analyst")).toBeVisible({
      timeout: 5000,
    });

    // Check slug is displayed
    await expect(page.locator("text=legal-analyst")).toBeVisible();

    await component.unmount();
  });

  test("should show empty state when no corpus agents exist", async ({
    mount,
    page,
  }) => {
    const emptyAgentsMock = {
      request: {
        query: GET_CORPUS_AGENTS,
        variables: { corpusId: "Q29ycHVzVHlwZTox" },
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [],
          },
        },
      },
    };

    const component = await mount(
      <CorpusAgentManagementWrapper
        corpusId="Q29ycHVzVHlwZTox"
        canUpdate={true}
        mocks={[emptyAgentsMock]}
      />
    );

    // Check for empty state
    await expect(page.locator("text=No Corpus Agents")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.locator("text=Create your first corpus-specific agent")
    ).toBeVisible();

    await component.unmount();
  });

  test("should show permission message when canUpdate is false", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusAgentManagementWrapper
        corpusId="Q29ycHVzVHlwZTox"
        canUpdate={false}
        mocks={[]}
      />
    );

    // Should show permission denied message
    await expect(
      page.locator("text=You do not have permission to manage agents")
    ).toBeVisible({ timeout: 5000 });

    await component.unmount();
  });

  test("should open create modal with corpus-specific title", async ({
    mount,
    page,
  }) => {
    const emptyAgentsMock = {
      request: {
        query: GET_CORPUS_AGENTS,
        variables: { corpusId: "Q29ycHVzVHlwZTox" },
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [],
          },
        },
      },
    };

    const component = await mount(
      <CorpusAgentManagementWrapper
        corpusId="Q29ycHVzVHlwZTox"
        canUpdate={true}
        mocks={[emptyAgentsMock]}
      />
    );

    // Wait for content to load
    await expect(page.locator("text=No Corpus Agents")).toBeVisible({
      timeout: 5000,
    });

    // Click create agent button
    await page.locator('button:has-text("Create Agent")').first().click();

    // Modal should open with corpus-specific title
    await expect(page.locator("text=Create Corpus Agent")).toBeVisible();

    await component.unmount();
  });

  test("should display helper text", async ({ mount, page }) => {
    const emptyAgentsMock = {
      request: {
        query: GET_CORPUS_AGENTS,
        variables: { corpusId: "Q29ycHVzVHlwZTox" },
      },
      result: {
        data: {
          agentConfigurations: {
            edges: [],
          },
        },
      },
    };

    const component = await mount(
      <CorpusAgentManagementWrapper
        corpusId="Q29ycHVzVHlwZTox"
        canUpdate={true}
        mocks={[emptyAgentsMock]}
      />
    );

    // Check helper text is displayed
    await expect(
      page.locator("text=Create custom AI agents specifically for this corpus")
    ).toBeVisible({ timeout: 5000 });

    await component.unmount();
  });
});
