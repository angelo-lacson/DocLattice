import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { DocxAnnotatorTestWrapper } from "./DocxAnnotatorTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";
import { setupDocxodusWasm } from "./utils/docxodusWasm";

test.describe("DocxAnnotator", () => {
  // WASM initialization + DOCX conversion needs generous timeouts
  test.setTimeout(60_000);

  test("renders DOCX content via WASM", async ({ mount, page }) => {
    await setupDocxodusWasm(page);

    const component = await mount(<DocxAnnotatorTestWrapper />);

    // Wait for the DOCX annotator to appear (WASM initialized + document converted)
    const annotator = page.getByTestId("docx-annotator");
    await annotator.waitFor({ state: "visible", timeout: 45_000 });

    // Verify rendered content is present
    const content = annotator.locator(".docx-content");
    await expect(content).toBeVisible();

    await docScreenshot(page, "annotator--docx-annotator--rendered");

    await component.unmount();
  });

  test("renders with annotations projected", async ({ mount, page }) => {
    await setupDocxodusWasm(page);

    const component = await mount(
      <DocxAnnotatorTestWrapper withAnnotations={true} />
    );

    const annotator = page.getByTestId("docx-annotator");
    await annotator.waitFor({ state: "visible", timeout: 45_000 });

    const content = annotator.locator(".docx-content");
    await expect(content).toBeVisible();

    await docScreenshot(page, "annotator--docx-annotator--with-annotations");

    await component.unmount();
  });

  test("renders in read-only mode", async ({ mount, page }) => {
    await setupDocxodusWasm(page);

    const component = await mount(<DocxAnnotatorTestWrapper readOnly={true} />);

    const annotator = page.getByTestId("docx-annotator");
    await annotator.waitFor({ state: "visible", timeout: 45_000 });

    const content = annotator.locator(".docx-content");
    await expect(content).toBeVisible();

    await docScreenshot(page, "annotator--docx-annotator--read-only");

    await component.unmount();
  });
});
