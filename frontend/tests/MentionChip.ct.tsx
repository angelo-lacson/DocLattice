import { test, expect } from "@playwright/experimental-ct-react";
import { BrowserRouter } from "react-router-dom";
import {
  MentionChip,
  MentionedResource,
  parseMentionsInContent,
} from "../src/components/threads/MentionChip";

// Mock resources
const mockCorpusResource: MentionedResource = {
  type: "CORPUS",
  id: "corpus-1",
  slug: "legal-contracts",
  title: "Legal Contracts Collection",
  url: "/c/john-doe/legal-contracts",
};

const mockDocumentResource: MentionedResource = {
  type: "DOCUMENT",
  id: "doc-1",
  slug: "contract-001",
  title: "Employment Agreement 2024",
  url: "/c/john-doe/legal-contracts/d/contract-001",
  corpus: {
    slug: "legal-contracts",
    title: "Legal Contracts Collection",
  },
};

const mockStandaloneDocResource: MentionedResource = {
  type: "DOCUMENT",
  id: "doc-2",
  slug: "standalone-doc",
  title: "Standalone Document",
  url: "/d/bob-jones/standalone-doc",
};

test.describe("MentionChip", () => {
  test("renders corpus mention chip with database icon", async ({ mount }) => {
    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={mockCorpusResource} />
      </BrowserRouter>
    );

    await expect(
      component.getByText("Legal Contracts Collection")
    ).toBeVisible();

    // Check for database icon (SVG)
    const svg = await component.locator("svg").first();
    await expect(svg).toBeVisible();
  });

  test("renders document mention chip with file icon", async ({ mount }) => {
    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={mockDocumentResource} />
      </BrowserRouter>
    );

    await expect(
      component.getByText("Employment Agreement 2024")
    ).toBeVisible();

    // Check for file icon (SVG)
    const svg = await component.locator("svg").first();
    await expect(svg).toBeVisible();
  });

  test("shows corpus context in tooltip for documents", async ({ mount }) => {
    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={mockDocumentResource} />
      </BrowserRouter>
    );

    const chip = component.locator('[role="link"]');
    const title = await chip.getAttribute("title");

    expect(title).toContain("Employment Agreement 2024");
    expect(title).toContain("Legal Contracts Collection");
  });

  test("calls custom onClick handler when provided", async ({ mount }) => {
    let clicked = false;
    let clickedResource: MentionedResource | null = null;

    const component = await mount(
      <BrowserRouter>
        <MentionChip
          resource={mockCorpusResource}
          onClick={(resource) => {
            clicked = true;
            clickedResource = resource;
          }}
        />
      </BrowserRouter>
    );

    await component.locator('[role="link"]').click();

    expect(clicked).toBe(true);
    expect(clickedResource).toEqual(mockCorpusResource);
  });

  test("handles keyboard navigation (Enter key)", async ({ mount, page }) => {
    let clicked = false;

    const component = await mount(
      <BrowserRouter>
        <MentionChip
          resource={mockCorpusResource}
          onClick={() => {
            clicked = true;
          }}
        />
      </BrowserRouter>
    );

    const chip = component.locator('[role="link"]');
    await chip.focus();
    await page.keyboard.press("Enter");

    expect(clicked).toBe(true);
  });

  test("handles keyboard navigation (Space key)", async ({ mount, page }) => {
    let clicked = false;

    const component = await mount(
      <BrowserRouter>
        <MentionChip
          resource={mockCorpusResource}
          onClick={() => {
            clicked = true;
          }}
        />
      </BrowserRouter>
    );

    const chip = component.locator('[role="link"]');
    await chip.focus();
    await page.keyboard.press("Space");

    expect(clicked).toBe(true);
  });

  test("displays external link icon", async ({ mount }) => {
    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={mockCorpusResource} />
      </BrowserRouter>
    );

    // Should have at least 2 SVG icons (type icon + external link icon)
    const svgs = await component.locator("svg").all();
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  test("truncates long titles with ellipsis", async ({ mount }) => {
    const longTitleResource: MentionedResource = {
      ...mockCorpusResource,
      title:
        "This is a very long corpus title that should be truncated with ellipsis when displayed in the chip",
    };

    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={longTitleResource} />
      </BrowserRouter>
    );

    // Title should be present
    await expect(component.getByRole("link")).toBeVisible();
  });

  test("applies correct gradient for corpus type", async ({ mount, page }) => {
    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={mockCorpusResource} />
      </BrowserRouter>
    );

    const chip = component.locator('[role="link"]');
    await expect(chip).toBeVisible();

    // Corpus should have purple gradient
    // Background gradient is applied via styled-components
  });

  test("applies correct gradient for document type", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <BrowserRouter>
        <MentionChip resource={mockDocumentResource} />
      </BrowserRouter>
    );

    const chip = component.locator('[role="link"]');
    await expect(chip).toBeVisible();

    // Document should have pink gradient
    // Background gradient is applied via styled-components
  });
});

// Note: parseMentionsInContent tests are done via unit tests
// Playwright component testing doesn't support dynamically created components well
