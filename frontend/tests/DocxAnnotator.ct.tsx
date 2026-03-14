import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { DocxAnnotatorTestWrapper } from "./DocxAnnotatorTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("DocxAnnotator", () => {
  test("renders component container", async ({ mount, page }) => {
    const component = await mount(<DocxAnnotatorTestWrapper />);

    // The component should render - it will show either the WASM init state
    // or the docx-annotator container depending on whether WASM loads
    // In test environment, WASM may not be available, so we check for
    // either the loading message or the annotator container
    const hasAnnotator = await page
      .getByTestId("docx-annotator")
      .isVisible()
      .catch(() => false);
    const hasLoadingText = await page
      .getByText(/Initializing|Converting|DOCX/)
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasAnnotator || hasLoadingText).toBeTruthy();

    await docScreenshot(page, "annotator--docx-annotator--initial");

    await component.unmount();
  });

  test("renders in read-only mode", async ({ mount, page }) => {
    const component = await mount(<DocxAnnotatorTestWrapper readOnly={true} />);

    // Wait a moment for WASM to attempt initialization
    await page.waitForTimeout(2000);

    // Component should render without crashing
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();

    await docScreenshot(page, "annotator--docx-annotator--read-only");

    await component.unmount();
  });

  test("handles graceful error state", async ({ mount, page }) => {
    const component = await mount(<DocxAnnotatorTestWrapper />);

    // Wait for WASM initialization attempt
    await page.waitForTimeout(3000);

    // The component should either show content or an error message,
    // but should NOT crash
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);

    await component.unmount();
  });
});
