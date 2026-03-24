/**
 * Playwright component tests for the CAML article rendering system.
 *
 * Tests cover:
 * 1. Full article rendering with all block types
 * 2. Hero section with accent text and stats
 * 3. Cards grid rendering
 * 4. Pills row rendering
 * 5. Interactive tabs
 * 6. Timeline rendering
 * 7. CTA buttons
 * 8. Dark-themed chapters
 * 9. Footer navigation
 */
import { test, expect } from "@playwright/experimental-ct-react";
import { docScreenshot } from "./utils/docScreenshot";
import {
  CamlArticleTestWrapper,
  SAMPLE_CAML_DOCUMENT,
} from "./CamlArticleTestWrapper";
import type { CamlDocument } from "../src/caml/parser/types";

test.describe("CamlArticle - Full Rendering", () => {
  test("should render a complete article with hero, chapters, and footer", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Verify hero section renders
    await expect(page.getByText("Supply Chain")).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("OpenContracts · Corpus Analysis")
    ).toBeVisible();
    await expect(page.getByText("42 Documents")).toBeVisible();

    // Verify chapters render
    await expect(page.getByText("Key Findings")).toBeVisible();
    await expect(page.getByText("Deep Analysis")).toBeVisible();

    // Verify footer renders
    await expect(page.getByText("Documentation")).toBeVisible();
    await expect(page.getByText("Published with OpenContracts")).toBeVisible();

    await docScreenshot(page, "caml--article--full-render", {
      fullPage: true,
    });

    await component.unmount();
  });
});

test.describe("CamlArticle - Hero Section", () => {
  test("should render hero with kicker, accent title, subtitle, and stats", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Kicker
    await expect(page.getByText("OpenContracts · Corpus Analysis")).toBeVisible(
      { timeout: 5000 }
    );

    // Title with accent text (the {Supply Chain} should be rendered with accent styling)
    await expect(page.getByText("Understanding the")).toBeVisible();
    await expect(page.getByText("Supply Chain")).toBeVisible();

    // Subtitle
    await expect(page.getByText("An interactive exploration")).toBeVisible();

    // Stats pills
    await expect(page.getByText("42 Documents")).toBeVisible();
    await expect(page.getByText("1,280 Annotations")).toBeVisible();
    await expect(page.getByText("8 Contributors")).toBeVisible();

    await docScreenshot(page, "caml--hero--with-stats");

    await component.unmount();
  });
});

test.describe("CamlArticle - Cards Block", () => {
  test("should render cards in a grid with labels, meta, body, and footer", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Wait for cards to render
    await expect(page.getByText("Force Majeure")).toBeVisible({
      timeout: 5000,
    });

    // Check all 4 cards are present
    await expect(page.getByText("§ 12.1")).toBeVisible();
    await expect(page.getByText("Indemnification")).toBeVisible();
    await expect(page.getByText("Termination")).toBeVisible();
    await expect(page.getByText("IP Rights")).toBeVisible();

    // Check card body text
    await expect(
      page.getByText("Present in 38 of 42 agreements")
    ).toBeVisible();

    // Check card footer
    await expect(page.getByText("Last updated: Q2 2024")).toBeVisible();

    await docScreenshot(page, "caml--cards--grid-render");

    await component.unmount();
  });
});

test.describe("CamlArticle - Pills Block", () => {
  test("should render pills with big text, labels, and status indicators", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Wait for pills to render
    await expect(page.getByText("42")).toBeVisible({ timeout: 5000 });

    // Check pill big text values
    await expect(page.getByText("1.2K")).toBeVisible();

    // Check labels
    await expect(page.getByText("Across 3 jurisdictions")).toBeVisible();

    // Check status
    await expect(page.getByText("Complete")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();

    await docScreenshot(page, "caml--pills--with-status");

    await component.unmount();
  });
});

test.describe("CamlArticle - Tabs Block", () => {
  test("should render interactive tabs and switch between them", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Wait for tabs to render
    await expect(page.getByText("Risk Assessment")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("Compliance")).toBeVisible();

    // First tab content should be visible by default
    await expect(page.getByText("Key Risks Identified")).toBeVisible();
    await expect(page.getByText("Supply chain disruption risk")).toBeVisible();

    // Check source chips
    await expect(page.getByText("Agreement-A.pdf")).toBeVisible();

    await docScreenshot(page, "caml--tabs--risk-active");

    // Click the second tab
    await page.getByText("Compliance").click();
    await page.waitForTimeout(300);

    // Second tab content should now be visible
    await expect(page.getByText("Regulatory Alignment")).toBeVisible();
    await expect(page.getByText("All agreements comply")).toBeVisible();

    await docScreenshot(page, "caml--tabs--compliance-active");

    await component.unmount();
  });
});

test.describe("CamlArticle - Timeline Block", () => {
  test("should render timeline with legend and entries", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Scroll to timeline chapter
    await page.getByText("Agreement Timeline").scrollIntoViewIfNeeded();

    // Legend
    await expect(page.getByText("Executed")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Amended")).toBeVisible();

    // Timeline entries
    await expect(page.getByText("Jan 2023")).toBeVisible();
    await expect(page.getByText("Master Agreement signed")).toBeVisible();
    await expect(
      page.getByText("Amendment 1 — Force Majeure update")
    ).toBeVisible();

    await docScreenshot(page, "caml--timeline--with-legend");

    await component.unmount();
  });
});

test.describe("CamlArticle - CTA Block", () => {
  test("should render CTA buttons with primary and secondary styles", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Scroll to CTA section
    await page.getByText("Explore Documents").scrollIntoViewIfNeeded();

    // Primary button
    const primaryBtn = page.getByText("Explore Documents");
    await expect(primaryBtn).toBeVisible({ timeout: 5000 });

    // Secondary button
    await expect(page.getByText("View Source Data")).toBeVisible();

    await docScreenshot(page, "caml--cta--buttons");

    await component.unmount();
  });
});

test.describe("CamlArticle - Dark Theme Chapter", () => {
  test("should render dark-themed chapter with gradient background", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // Scroll to dark chapter
    await page.getByText("Deep Analysis").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await expect(page.getByText("Deep Analysis")).toBeVisible({
      timeout: 5000,
    });

    // The chapter should have a dark background - verify via visual screenshot
    await docScreenshot(page, "caml--chapter--dark-gradient");

    await component.unmount();
  });
});

test.describe("CamlArticle - Pullquote", () => {
  test("should render pullquote with styled blockquote", async ({
    mount,
    page,
  }) => {
    const component = await mount(<CamlArticleTestWrapper />);

    // The pullquote text
    await expect(
      page.getByText("The majority of agreements include force majeure")
    ).toBeVisible({ timeout: 5000 });

    await docScreenshot(page, "caml--prose--pullquote");

    await component.unmount();
  });
});

test.describe("CamlArticle - Empty Document", () => {
  test("should render gracefully with minimal document", async ({
    mount,
    page,
  }) => {
    const minimalDoc: CamlDocument = {
      frontmatter: {},
      chapters: [
        {
          id: "minimal",
          blocks: [
            {
              type: "prose",
              content: "A minimal CAML article with just prose.",
            },
          ],
        },
      ],
    };

    const component = await mount(
      <CamlArticleTestWrapper document={minimalDoc} />
    );

    await expect(
      page.getByText("A minimal CAML article with just prose.")
    ).toBeVisible({ timeout: 5000 });

    await docScreenshot(page, "caml--article--minimal");

    await component.unmount();
  });
});

test.describe("CamlArticle - Corpus Stats Block", () => {
  test("should render live corpus stats from props", async ({
    mount,
    page,
  }) => {
    const statsDoc: CamlDocument = {
      frontmatter: {},
      chapters: [
        {
          id: "stats-chapter",
          title: "Corpus Overview",
          blocks: [
            {
              type: "corpus-stats",
              items: [
                { key: "documents", label: "Documents" },
                { key: "annotations", label: "Annotations" },
                { key: "contributors", label: "Contributors" },
              ],
            },
          ],
        },
      ],
    };

    const component = await mount(
      <CamlArticleTestWrapper
        document={statsDoc}
        stats={{ documents: 42, annotations: 1280, contributors: 8 }}
      />
    );

    // Values should render from stats prop
    await expect(page.getByText("42")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("1280")).toBeVisible();
    await expect(page.getByText("Documents")).toBeVisible();

    await docScreenshot(page, "caml--corpus-stats--with-data");

    await component.unmount();
  });
});
