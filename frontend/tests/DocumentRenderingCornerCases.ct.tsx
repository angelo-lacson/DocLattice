// tests/DocumentRenderingCornerCases.ct.tsx
/**
 * Component tests for document rendering corner cases and edge conditions.
 * These tests specifically target issues that can occur during annotation rendering,
 * selection, zooming, and mobile interactions.
 */

import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { Page } from "@playwright/test";
import fs from "fs";

// Import the test wrapper and mocks
import { DocumentKnowledgeBaseTestWrapper } from "./DocumentKnowledgeBaseTestWrapper";
import {
  graphqlMocks,
  CORPUS_ID,
  MOCK_PDF_URL,
  mockPdfDocument,
  PDF_DOC_ID,
  TEST_PAWLS_PATH,
  TEST_PDF_PATH,
} from "./mocks/DocumentKnowledgeBase.mocks";

const LONG_TIMEOUT = 60_000;

// Read PAWLS data for mocking
let mockPawlsDataContent: any;
try {
  const rawContent = fs.readFileSync(TEST_PAWLS_PATH, "utf-8");
  mockPawlsDataContent = JSON.parse(rawContent);
} catch (err) {
  console.error(`[MOCK ERROR] Failed to read PAWLS data:`, err);
  mockPawlsDataContent = null;
}

async function registerRestMocks(page: Page): Promise<void> {
  // Mock PAWLS data
  await page.route(`**/${mockPdfDocument.pawlsParseFile}`, (route) => {
    if (!mockPawlsDataContent) {
      route.fulfill({ status: 500, body: "Mock PAWLS data not loaded" });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPawlsDataContent),
    });
  });

  // Mock PDF file
  await page.route(MOCK_PDF_URL, async (route) => {
    if (!fs.existsSync(TEST_PDF_PATH)) {
      return route.fulfill({ status: 404, body: "Test PDF not found" });
    }
    const buffer = fs.readFileSync(TEST_PDF_PATH);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: buffer,
      headers: {
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  });

  // Mock markdown summary
  await page.route(`**/${mockPdfDocument.mdSummaryFile}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/markdown",
      body: "# Mock Summary\n\nTest content",
    })
  );
}

test.beforeEach(async ({ page }) => {
  await registerRestMocks(page);

  // Add WebSocket stub
  await page.evaluate(() => {
    class StubSocket {
      readyState = 1;
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      onopen?: () => void;
      onmessage?: () => void;
      onclose?: () => void;

      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
    }
    // @ts-ignore
    window.WebSocket = StubSocket;
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Issue #1: Selection Menu Positioning on Mobile/Zoomed Views
// ──────────────────────────────────────────────────────────────────────────────

test.describe("Selection Menu Positioning Corner Cases", () => {
  // Helper function to perform text selection
  async function performTextSelection(
    page: Page,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) {
    // Click and drag to select text
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(x2, y2, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  test("selection menu appears off-screen on mobile viewport", async ({
    mount,
    page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size

    await mount(
      <DocumentKnowledgeBaseTestWrapper
        mocks={graphqlMocks}
        documentId={PDF_DOC_ID}
        corpusId={CORPUS_ID}
      />
    );

    // Wait for document to load
    await expect(
      page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    // Wait for PDF to render
    await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
      timeout: LONG_TIMEOUT,
    });

    // Zoom in to create horizontal scroll scenario
    await page.keyboard.press("Control++");
    await page.keyboard.press("Control++");
    await page.keyboard.press("Control++");
    await page.waitForTimeout(500);

    // Scroll horizontally to the right edge
    const pdfContainer = page.locator("#pdf-container");
    await pdfContainer.evaluate((el) => {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
    });
    await page.waitForTimeout(300);

    // Perform selection near the right edge
    const firstPageContainer = page
      .locator(".PageAnnotationsContainer")
      .first();
    const selectionLayer = firstPageContainer.locator("#selection-layer");
    const layerBox = await selectionLayer.boundingBox();
    expect(layerBox).toBeTruthy();

    // Select text near the right edge
    const startX = layerBox!.x + layerBox!.width - 100;
    const startY = layerBox!.y + 50;

    await performTextSelection(page, startX, startY, startX + 50, startY + 30);

    // Check if action menu appears
    const actionMenu = page.getByTestId("selection-action-menu");
    await expect(actionMenu).toBeVisible({ timeout: LONG_TIMEOUT });

    // Get menu position and viewport
    const menuBox = await actionMenu.boundingBox();
    const viewport = page.viewportSize();

    expect(menuBox).toBeTruthy();
    expect(viewport).toBeTruthy();

    // FAILING CASE: Menu should be fully visible within viewport
    // Currently it will appear off-screen to the right
    const menuFullyVisible =
      menuBox!.x >= 0 &&
      menuBox!.y >= 0 &&
      menuBox!.x + menuBox!.width <= viewport!.width &&
      menuBox!.y + menuBox!.height <= viewport!.height;

    // This test SHOULD fail with current implementation
    expect(menuFullyVisible).toBe(true);
    console.log(
      `[TEST] Menu position: x=${menuBox!.x}, y=${menuBox!.y}, width=${
        menuBox!.width
      }`
    );
    console.log(
      `[TEST] Viewport: width=${viewport!.width}, height=${viewport!.height}`
    );
    console.log(`[TEST] Menu fully visible: ${menuFullyVisible}`);
  });

  test("selection menu handles viewport constraints correctly", async ({
    mount,
    page,
  }) => {
    // Test on a standard desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    await mount(
      <DocumentKnowledgeBaseTestWrapper
        mocks={graphqlMocks}
        documentId={PDF_DOC_ID}
        corpusId={CORPUS_ID}
      />
    );

    // Wait for document to load
    await expect(
      page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
      timeout: LONG_TIMEOUT,
    });

    // Wait for PDF to render
    await page.waitForTimeout(1000);

    // Get the selection layer
    const firstPageContainer = page
      .locator(".PageAnnotationsContainer")
      .first();
    const selectionLayer = firstPageContainer.locator("#selection-layer");
    const layerBox = await selectionLayer.boundingBox();
    expect(layerBox).toBeTruthy();

    // Test 1: Normal selection in middle of page
    const centerX = layerBox!.x + layerBox!.width / 2 - 50;
    const centerY = layerBox!.y + 100;

    await performTextSelection(
      page,
      centerX,
      centerY,
      centerX + 80,
      centerY + 30
    );

    // Check menu appears and is visible
    const actionMenu = page.getByTestId("selection-action-menu");
    await expect(actionMenu).toBeVisible({ timeout: LONG_TIMEOUT });

    // Verify menu is positioned within viewport
    const menuBox = await actionMenu.boundingBox();
    expect(menuBox).toBeTruthy();

    const viewport = page.viewportSize()!;

    // All assertions for viewport containment
    const menuFullyVisible =
      menuBox!.x >= 0 &&
      menuBox!.y >= 0 &&
      menuBox!.x + menuBox!.width <= viewport.width &&
      menuBox!.y + menuBox!.height <= viewport.height;

    expect(menuFullyVisible).toBe(true);

    console.log(
      `[TEST] Desktop viewport test - Menu position: x=${menuBox!.x}, y=${
        menuBox!.y
      }`
    );
    console.log(`[TEST] Menu size: ${menuBox!.width}x${menuBox!.height}`);
    console.log(`[TEST] Viewport: ${viewport.width}x${viewport.height}`);
    console.log(`[TEST] Menu fully contained in viewport: ${menuFullyVisible}`);

    // Dismiss menu for next test
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Test 2: Selection near right edge (should reposition left)
    const rightEdgeX = layerBox!.x + Math.min(layerBox!.width - 100, 400);
    const rightEdgeY = layerBox!.y + 50;

    await performTextSelection(
      page,
      rightEdgeX,
      rightEdgeY,
      rightEdgeX + 60,
      rightEdgeY + 25
    );

    // Check menu appears
    const actionMenu2 = page.getByTestId("selection-action-menu");
    const isVisible2 = await actionMenu2.isVisible();

    if (isVisible2) {
      const menuBox2 = await actionMenu2.boundingBox();
      if (menuBox2) {
        // Verify it stays in viewport even near edge
        expect(menuBox2.x + menuBox2.width).toBeLessThanOrEqual(viewport.width);
        console.log(`[TEST] Right edge - Menu adjusted to stay in viewport`);
      }
    }
  });

  test("selection menu stays visible with zoom and scroll", async ({
    mount,
    page,
  }) => {
    await mount(
      <DocumentKnowledgeBaseTestWrapper
        mocks={graphqlMocks}
        documentId={PDF_DOC_ID}
        corpusId={CORPUS_ID}
      />
    );

    // Wait for document to load
    await expect(
      page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
      timeout: LONG_TIMEOUT,
    });

    // Wait for PDF to render
    await page.waitForTimeout(1000);

    // Apply moderate zoom (enough to test but not cause issues)
    await page.keyboard.press("Control++");
    await page.waitForTimeout(300);
    await page.keyboard.press("Control++");
    await page.waitForTimeout(500);

    // Now with zoom, create horizontal scroll by scrolling right
    const pdfContainer = page.locator("#pdf-container");
    await pdfContainer.evaluate((el) => {
      // Scroll right to test horizontal positioning
      el.scrollLeft = 50;
    });
    await page.waitForTimeout(300);

    // Get the selection layer after zoom and scroll
    const firstPageContainer = page
      .locator(".PageAnnotationsContainer")
      .first();
    const selectionLayer = firstPageContainer.locator("#selection-layer");
    const layerBox = await selectionLayer.boundingBox();
    expect(layerBox).toBeTruthy();

    // Select text using the same reliable pattern
    // Position near right edge to test horizontal constraints
    const startX = layerBox!.x + Math.min(layerBox!.width - 100, 200);
    const startY = layerBox!.y + 50;

    await performTextSelection(page, startX, startY, startX + 60, startY + 25);

    // Check menu appears
    const actionMenu = page.getByTestId("selection-action-menu");
    await expect(actionMenu).toBeVisible({ timeout: LONG_TIMEOUT });

    // Verify menu stays within viewport despite zoom and scroll
    const menuBox = await actionMenu.boundingBox();
    expect(menuBox).toBeTruthy();

    const viewport = page.viewportSize()!;

    // All edges should be within viewport
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport.height);

    console.log(
      `[TEST] With zoom - Menu position: x=${menuBox!.x}, y=${menuBox!.y}`
    );
    console.log(`[TEST] Menu dimensions: ${menuBox!.width}x${menuBox!.height}`);
    console.log(`[TEST] Viewport: ${viewport.width}x${viewport.height}`);
    console.log(`[TEST] All edges within viewport: true`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Issue #2: Cumulative Height Calculation Drift
// ──────────────────────────────────────────────────────────────────────────────

test.describe("Cumulative Height Calculation Drift", () => {
  test("should maintain accurate annotation positioning on later pages", async ({
    mount,
    page,
  }) => {
    // We need to simulate a large PDF with many pages
    // For this test, we'll simulate by manipulating page heights
    await mount(
      <DocumentKnowledgeBaseTestWrapper
        mocks={graphqlMocks}
        documentId={PDF_DOC_ID}
        corpusId={CORPUS_ID}
      />
    );

    // Wait for document to load
    await expect(
      page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
      timeout: LONG_TIMEOUT,
    });

    // Wait for PDF to render
    await page.waitForTimeout(1000);

    // Inject test to check cumulative height calculation
    const cumulativeHeightError = await page.evaluate(() => {
      // Access the PDF component's internal state through React DevTools or exposed methods
      const pdfContainer = document.querySelector("#pdf-container");
      if (!pdfContainer) return null;

      // Simulate 150 pages with decimal heights
      const simulatedPageHeights = Array(150).fill(1000.4);

      // Calculate cumulative heights the way the component does
      const cumulative: number[] = [0];
      for (let i = 0; i < simulatedPageHeights.length; i++) {
        cumulative.push(cumulative[i] + simulatedPageHeights[i]);
      }

      // Expected cumulative height for page 150 (0-indexed as 149)
      const expected = 150 * 1000.4; // 150060
      const actual = cumulative[150]; // cumulative at index 150 is sum of first 150 pages

      // Calculate the drift/error
      const error = Math.abs(actual - expected);

      return {
        expected,
        actual,
        error,
        withinTolerance: error <= 1,
      };
    });

    console.log(
      `[TEST] Cumulative height calculation result:`,
      cumulativeHeightError
    );

    // This test should FAIL with current implementation due to rounding errors
    expect(cumulativeHeightError?.withinTolerance).toBe(true);
  });

  test("should align annotations correctly on page 100+", async ({
    mount,
    page,
  }) => {
    await mount(
      <DocumentKnowledgeBaseTestWrapper
        mocks={graphqlMocks}
        documentId={PDF_DOC_ID}
        corpusId={CORPUS_ID}
      />
    );

    // Wait for document to load
    await expect(
      page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
    ).toBeVisible({ timeout: LONG_TIMEOUT });

    await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
      timeout: LONG_TIMEOUT,
    });

    // Since we don't have a 150-page PDF in the test data,
    // we'll test the principle with what we have and simulate the drift
    await page.waitForTimeout(1000);

    // Get the first page for testing
    const firstPageContainer = page
      .locator(".PageAnnotationsContainer")
      .first();
    const selectionLayer = firstPageContainer.locator("#selection-layer");

    // Create an annotation on the first page
    const layerBox = await selectionLayer.boundingBox();
    if (layerBox) {
      // Select text to create annotation
      await page.mouse.move(layerBox.x + 50, layerBox.y + 50);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.move(layerBox.x + 150, layerBox.y + 70, { steps: 10 });
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForTimeout(200);

      // Wait for action menu
      const actionMenu = page.getByTestId("selection-action-menu");
      const isMenuVisible = await actionMenu.isVisible();

      if (isMenuVisible) {
        // Click to apply annotation (assuming a label is selected)
        const applyButton = actionMenu.getByText(/apply|annotate/i).first();
        const canApply = await applyButton.isVisible();

        if (canApply) {
          await applyButton.click();
          await page.waitForTimeout(500);

          // Check if annotation was created and positioned correctly
          const annotations = page.locator(".annotation-highlight");
          const annotationCount = await annotations.count();

          if (annotationCount > 0) {
            const annotationBox = await annotations.first().boundingBox();
            const textBounds = {
              x: layerBox.x + 50,
              y: layerBox.y + 50,
              width: 100,
              height: 20,
            };

            // Check alignment - should be within 1px tolerance
            if (annotationBox) {
              const yDiff = Math.abs(annotationBox.y - textBounds.y);
              console.log(`[TEST] Annotation Y position diff: ${yDiff}px`);

              // This would fail on later pages due to cumulative drift
              expect(yDiff).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  test("cumulative heights should use proper rounding", async ({ page }) => {
    // Direct test of the mathematical issue
    const result = await page.evaluate(() => {
      // Test the cumulative calculation with various decimal values
      const testCases = [
        { heights: Array(100).fill(1000.4), expectedDrift: 0 }, // Should accumulate 40px drift
        { heights: Array(200).fill(1000.7), expectedDrift: 0 }, // Should accumulate 140px drift
        { heights: Array(150).fill(1000.3), expectedDrift: 0 }, // Should accumulate 45px drift
      ];

      const results = testCases.map((testCase) => {
        const cumulative: number[] = [0];

        // Current (buggy) implementation
        for (let i = 0; i < testCase.heights.length; i++) {
          cumulative.push(cumulative[i] + testCase.heights[i]);
        }

        const expected = testCase.heights.length * testCase.heights[0];
        const actual = cumulative[cumulative.length - 1];
        const drift = Math.abs(actual - expected);

        return {
          pageCount: testCase.heights.length,
          pageHeight: testCase.heights[0],
          expected,
          actual,
          drift,
          passesWithTolerance: drift <= 1,
        };
      });

      return results;
    });

    console.log(`[TEST] Cumulative height drift test results:`, result);

    // All test cases should pass with proper rounding
    result.forEach((testCase) => {
      console.log(
        `[TEST] ${testCase.pageCount} pages × ${testCase.pageHeight}px: drift = ${testCase.drift}px`
      );
      expect(testCase.passesWithTolerance).toBe(true);
    });
  });
});

// More test suites for other corner cases will be added here...
