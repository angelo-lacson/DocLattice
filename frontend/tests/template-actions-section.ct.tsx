import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedProvider } from "@apollo/client/testing";
import { TemplateActionsSection } from "../src/components/corpuses/settings/TemplateActionsSection";
import { GET_CORPUS_ACTION_TEMPLATES } from "../src/graphql/queries";
import { docScreenshot } from "./utils/docScreenshot";

const mockTemplates = [
  {
    id: "tmpl-1",
    name: "Document Description Updater",
    description: "Writes concise document descriptions",
    trigger: "ADD_DOCUMENT",
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "tmpl-2",
    name: "Corpus Description Updater",
    description: "Maintains corpus-level summaries",
    trigger: "ADD_DOCUMENT",
    sortOrder: 2,
    isActive: true,
  },
  {
    id: "tmpl-3",
    name: "Key Terms Annotator",
    description: "Identifies and annotates key terms",
    trigger: "ADD_DOCUMENT",
    sortOrder: 3,
    isActive: true,
  },
];

const mockActions = [
  {
    id: "action-1",
    name: "Document Description Updater",
    trigger: "ADD_DOCUMENT",
    disabled: true,
    sourceTemplate: { id: "tmpl-1", name: "Document Description Updater" },
    taskInstructions: "Read the document text...",
    agentConfig: {
      id: "agent-1",
      name: "Doc Desc Agent",
      description: "Writes descriptions",
    },
  },
  {
    id: "action-3",
    name: "Key Terms Annotator",
    trigger: "ADD_DOCUMENT",
    disabled: false,
    sourceTemplate: { id: "tmpl-3", name: "Key Terms Annotator" },
    taskInstructions: "Identify key terms...",
    agentConfig: {
      id: "agent-3",
      name: "Key Terms Agent",
      description: "Annotates key terms",
    },
  },
];

const templatesMock = {
  request: {
    query: GET_CORPUS_ACTION_TEMPLATES,
    variables: { isActive: true },
  },
  result: {
    data: {
      corpusActionTemplates: {
        edges: mockTemplates.map((t) => ({ node: t })),
      },
    },
  },
};

const emptyTemplatesMock = {
  request: {
    query: GET_CORPUS_ACTION_TEMPLATES,
    variables: { isActive: true },
  },
  result: {
    data: {
      corpusActionTemplates: {
        edges: [],
      },
    },
  },
};

test.describe("TemplateActionsSection", () => {
  test("renders action library with available and added sections", async ({
    mount,
    page,
  }) => {
    await mount(
      <MockedProvider mocks={[templatesMock]} addTypename={false}>
        <TemplateActionsSection
          corpusId="corpus-1"
          actions={mockActions}
          onUpdate={() => {}}
        />
      </MockedProvider>
    );

    // Wait for the GraphQL mock to resolve and the section to render
    await expect(page.locator("text=Action Library")).toBeVisible({
      timeout: 10000,
    });

    // Both section labels visible
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Added to this corpus", { exact: true })
    ).toBeVisible();

    // The one template not yet added should be visible in Available
    await expect(
      page.locator("text=Corpus Description Updater").first()
    ).toBeVisible();

    // All three template names should be visible somewhere on the page
    await expect(
      page.locator("text=Document Description Updater").first()
    ).toBeVisible();
    await expect(
      page.locator("text=Key Terms Annotator").first()
    ).toBeVisible();

    // Toggle switches present only for added templates (2)
    const toggles = page.locator(".ui.toggle.checkbox");
    await expect(toggles).toHaveCount(2);

    // Add button visible for the available template
    await expect(page.locator("text=Add").first()).toBeVisible();

    await docScreenshot(page, "corpus-settings--action-library--mixed-state", {
      fullPage: true,
    });
  });

  test("renders nothing when no templates returned", async ({
    mount,
    page,
  }) => {
    await mount(
      <MockedProvider mocks={[emptyTemplatesMock]} addTypename={false}>
        <TemplateActionsSection
          corpusId="corpus-1"
          actions={[]}
          onUpdate={() => {}}
        />
      </MockedProvider>
    );

    // Should not render the section at all
    await expect(page.locator("text=Action Library")).not.toBeVisible();
  });
});
