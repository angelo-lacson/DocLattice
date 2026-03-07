import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedProvider } from "@apollo/client/testing";
import { TemplateActionsSection } from "../src/components/corpuses/settings/TemplateActionsSection";
import { docScreenshot } from "./utils/docScreenshot";

const mockTemplateActions = [
  {
    id: "action-1",
    name: "Document Description Updater",
    trigger: "add_document",
    disabled: true,
    sourceTemplate: { id: "tmpl-1", name: "Document Description Updater" },
    taskInstructions:
      "Read the document text and write a concise 2-3 sentence description summarising what this document is about.",
    agentConfig: {
      id: "agent-1",
      name: "Document Description Updater Agent",
      description: "Writes concise document descriptions",
    },
  },
  {
    id: "action-2",
    name: "Corpus Description Updater",
    trigger: "add_document",
    disabled: true,
    sourceTemplate: { id: "tmpl-2", name: "Corpus Description Updater" },
    taskInstructions:
      "Update the corpus description to reflect the addition of a new document.",
    agentConfig: {
      id: "agent-2",
      name: "Corpus Description Updater Agent",
      description: "Maintains corpus-level summaries",
    },
  },
  {
    id: "action-3",
    name: "Key Terms Annotator",
    trigger: "add_document",
    disabled: false,
    sourceTemplate: { id: "tmpl-3", name: "Key Terms Annotator" },
    taskInstructions:
      "Identify and annotate the most important key terms in the document.",
    agentConfig: {
      id: "agent-3",
      name: "Key Terms Annotator Agent",
      description: "Identifies and annotates key terms",
    },
  },
];

test.describe("TemplateActionsSection", () => {
  test("renders template rows with toggles", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <TemplateActionsSection
          actions={mockTemplateActions}
          onToggle={() => {}}
        />
      </MockedProvider>
    );

    // All template names visible
    await expect(
      page.locator("text=Document Description Updater").first()
    ).toBeVisible();
    await expect(
      page.locator("text=Corpus Description Updater").first()
    ).toBeVisible();
    await expect(
      page.locator("text=Key Terms Annotator").first()
    ).toBeVisible();

    // Section title visible
    await expect(page.locator("text=Quick Actions")).toBeVisible();

    // Trigger badges visible
    const badges = page.locator("text=On Add");
    await expect(badges.first()).toBeVisible();

    // Toggle switches present (3 of them)
    const toggles = page.locator(".ui.toggle.checkbox");
    await expect(toggles).toHaveCount(3);

    await docScreenshot(
      page,
      "corpus-settings--template-actions--mixed-state",
      { fullPage: true }
    );
  });

  test("renders nothing when no template actions", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <TemplateActionsSection actions={[]} onToggle={() => {}} />
      </MockedProvider>
    );

    // Should not render the section at all
    await expect(page.locator("text=Quick Actions")).not.toBeVisible();
  });
});
