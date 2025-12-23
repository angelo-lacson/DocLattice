// Playwright Component Test for MentionChip (Issue #689)
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MemoryRouter } from "react-router-dom";
import {
  MentionChip,
  MentionedResource,
} from "../src/components/threads/MentionChip";

// Test wrapper that provides routing context
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const mockCorpusResource: MentionedResource = {
  type: "CORPUS",
  id: "corpus-1",
  slug: "test-corpus",
  title: "Test Corpus Title",
  url: "/c/creator/test-corpus",
};

const mockDocumentResource: MentionedResource = {
  type: "DOCUMENT",
  id: "doc-1",
  slug: "test-document",
  title: "Test Document Title",
  url: "/d/creator/corpus/test-document",
  corpus: {
    slug: "parent-corpus",
    title: "Parent Corpus",
  },
};

const mockAnnotationResource: MentionedResource = {
  type: "ANNOTATION",
  id: "ann-1",
  slug: "annotation-1",
  title: "Annotation Title",
  url: "/d/creator/corpus/doc?ann=ann-1",
  rawText:
    "This is a long annotation text that should be truncated to show only the first 24 characters in the chip display.",
  annotationLabel: "Definition",
  document: {
    title: "Source Document",
  },
};

const mockAnnotationWithShortText: MentionedResource = {
  type: "ANNOTATION",
  id: "ann-2",
  slug: "annotation-2",
  title: "Short Annotation",
  url: "/d/creator/corpus/doc?ann=ann-2",
  rawText: "Short text",
  annotationLabel: "Clause",
  document: {
    title: "Source Document",
  },
};

const mockAnnotationWithoutText: MentionedResource = {
  type: "ANNOTATION",
  id: "ann-3",
  slug: "annotation-3",
  title: "No Text Annotation",
  url: "/d/creator/corpus/doc?ann=ann-3",
  rawText: null,
  annotationLabel: "Section",
  document: {
    title: "Source Document",
  },
};

test.describe("MentionChip Component", () => {
  test.describe("Corpus Mentions", () => {
    test("should render corpus chip with correct title", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockCorpusResource} />
        </TestWrapper>
      );

      // Check chip text shows the corpus title
      await expect(page.locator("text=Test Corpus Title")).toBeVisible();

      await component.unmount();
    });

    test("should display corpus icon", async ({ mount, page }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockCorpusResource} />
        </TestWrapper>
      );

      // Check that an SVG icon is present (Database icon for corpus)
      await expect(page.locator("svg")).toBeVisible();

      await component.unmount();
    });
  });

  test.describe("Document Mentions", () => {
    test("should render document chip with correct title", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockDocumentResource} />
        </TestWrapper>
      );

      // Check chip text shows the document title
      await expect(page.locator("text=Test Document Title")).toBeVisible();

      await component.unmount();
    });

    test("should show tooltip with corpus context on hover", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockDocumentResource} />
        </TestWrapper>
      );

      // Hover to see tooltip
      const chip = page.locator("span").first();
      await chip.hover();

      // Check tooltip contains corpus info
      const title = await chip.getAttribute("title");
      expect(title).toContain("Parent Corpus");

      await component.unmount();
    });
  });

  test.describe("Annotation Mentions (Issue #689)", () => {
    test("should truncate long annotation text to ~24 characters", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockAnnotationResource} />
        </TestWrapper>
      );

      // Get the chip text content
      const chipText = page.locator("span").nth(1); // ChipText is second span
      const textContent = await chipText.textContent();

      // Verify text is truncated (should be around 24 chars + ellipsis)
      expect(textContent?.length).toBeLessThanOrEqual(30);
      expect(textContent).toContain("…");

      await component.unmount();
    });

    test("should show full annotation text in tooltip on hover", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockAnnotationResource} />
        </TestWrapper>
      );

      // Hover to see tooltip
      const chip = page.locator("span").first();
      await chip.hover();

      // Check tooltip contains full text (or sanitized version)
      const title = await chip.getAttribute("title");
      expect(title).toBeTruthy();
      expect(title!.length).toBeGreaterThan(24);

      await component.unmount();
    });

    test("should display short annotation text without truncation", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockAnnotationWithShortText} />
        </TestWrapper>
      );

      // Check chip shows full short text
      await expect(page.locator("text=Short text")).toBeVisible();

      await component.unmount();
    });

    test("should fallback to label when rawText is null", async ({
      mount,
      page,
    }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockAnnotationWithoutText} />
        </TestWrapper>
      );

      // Should show the annotation label as fallback
      await expect(page.locator("text=Section")).toBeVisible();

      await component.unmount();
    });

    test("should display annotation icon", async ({ mount, page }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockAnnotationResource} />
        </TestWrapper>
      );

      // Check that an SVG icon is present (Tag icon for annotation)
      await expect(page.locator("svg")).toBeVisible();

      await component.unmount();
    });
  });

  test.describe("Keyboard Navigation", () => {
    test("should be focusable with keyboard", async ({ mount, page }) => {
      const component = await mount(
        <TestWrapper>
          <MentionChip resource={mockCorpusResource} />
        </TestWrapper>
      );

      // Tab to focus the chip
      await page.keyboard.press("Tab");

      // Check chip is focused
      const chip = page.locator('[role="link"]');
      await expect(chip).toBeFocused();

      await component.unmount();
    });
  });
});
