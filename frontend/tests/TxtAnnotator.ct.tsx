import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { TxtAnnotatorTestWrapper } from "./TxtAnnotatorTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("TxtAnnotator", () => {
  test("renders text content", async ({ mount, page }) => {
    const component = await mount(<TxtAnnotatorTestWrapper />);

    // Verify the annotator container is rendered
    const annotator = page.getByTestId("txt-annotator");
    await expect(annotator).toBeVisible({ timeout: 10000 });

    // Verify the sample text content is rendered
    await expect(
      page.getByText("This is a sample document text")
    ).toBeVisible();
    await expect(
      page.getByText("It contains multiple sentences for testing purposes")
    ).toBeVisible();

    await docScreenshot(page, "annotator--txt-annotator--default");

    await component.unmount();
  });

  test("renders in read-only mode", async ({ mount, page }) => {
    const component = await mount(<TxtAnnotatorTestWrapper readOnly={true} />);

    const annotator = page.getByTestId("txt-annotator");
    await expect(annotator).toBeVisible({ timeout: 10000 });

    // Text should be visible in read-only mode
    await expect(
      page.getByText("This is a sample document text")
    ).toBeVisible();

    await docScreenshot(page, "annotator--txt-annotator--read-only");

    await component.unmount();
  });

  test("renders with annotations", async ({ mount, page }) => {
    const component = await mount(
      <TxtAnnotatorTestWrapper readOnly={true} withAnnotations={true} />
    );

    const annotator = page.getByTestId("txt-annotator");
    await expect(annotator).toBeVisible({ timeout: 10000 });

    // Verify that the annotated span is rendered (annotation covers "sample document text")
    const annotatedSpan = page.getByTestId(/^annotated-span-/);
    await expect(annotatedSpan.first()).toBeVisible({ timeout: 10000 });

    await component.unmount();
  });

  test("renders available labels context in edit mode", async ({
    mount,
    page,
  }) => {
    const component = await mount(<TxtAnnotatorTestWrapper readOnly={false} />);

    const annotator = page.getByTestId("txt-annotator");
    await expect(annotator).toBeVisible({ timeout: 10000 });

    // In edit mode the text is still rendered and selectable
    await expect(
      page.getByText("This is a sample document text")
    ).toBeVisible();

    await component.unmount();
  });
});
