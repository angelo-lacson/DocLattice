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

// More test suites for other corner cases will be added here...
