import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { LabelSetFormFields } from "../src/components/forms/LabelSetFormFields";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("LabelSetFormFields", () => {
  test("renders empty create form", async ({ mount, page }) => {
    const component = await mount(
      <LabelSetFormFields formData={{}} onChange={() => {}} />
    );

    await expect(page.getByLabel("Title *")).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("Description *")).toBeVisible({
      timeout: 5000,
    });

    // Verify fields are empty
    await expect(page.getByLabel("Title *")).toHaveValue("");
    await expect(page.getByLabel("Description *")).toHaveValue("");

    await docScreenshot(page, "forms--labelset-fields--empty");

    await component.unmount();
  });

  test("renders with pre-filled data", async ({ mount, page }) => {
    const component = await mount(
      <LabelSetFormFields
        formData={{ title: "Contract Labels", description: "Labels for NDA" }}
        onChange={() => {}}
      />
    );

    await expect(page.getByLabel("Title *")).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("Title *")).toHaveValue("Contract Labels");
    await expect(page.getByLabel("Description *")).toHaveValue(
      "Labels for NDA"
    );

    await docScreenshot(page, "forms--labelset-fields--prefilled");

    await component.unmount();
  });

  test("renders in disabled state", async ({ mount, page }) => {
    const component = await mount(
      <LabelSetFormFields
        formData={{ title: "Read Only", description: "Cannot edit" }}
        onChange={() => {}}
        disabled={true}
      />
    );

    await expect(page.getByLabel("Title *")).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel("Title *")).toBeDisabled();
    await expect(page.getByLabel("Description *")).toBeDisabled();

    await docScreenshot(page, "forms--labelset-fields--disabled");

    await component.unmount();
  });

  test("calls onChange when title is typed", async ({ mount, page }) => {
    let lastUpdate: Record<string, any> = {};

    const component = await mount(
      <LabelSetFormFields
        formData={{}}
        onChange={(updates) => {
          lastUpdate = updates;
        }}
      />
    );

    await expect(page.getByLabel("Title *")).toBeVisible({ timeout: 5000 });
    await page.getByLabel("Title *").fill("New Label Set");

    expect(lastUpdate).toHaveProperty("title");

    await component.unmount();
  });
});
