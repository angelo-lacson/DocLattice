import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { CRUDModalTestWrapper } from "./CRUDModalTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("CRUDModal", () => {
  test("renders document CREATE modal", async ({ mount, page }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={true}
        mode="CREATE"
        modelName="document"
        oldInstance={{}}
        formType="document"
      />
    );

    // Modal renders via portal — query page, not component
    await expect(page.getByText("Create Document")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByLabel("Title *")).toBeVisible();
    await expect(page.getByLabel("Description *")).toBeVisible();

    await docScreenshot(page, "crud--modal-document--create-empty");

    await component.unmount();
  });

  test("renders document EDIT modal with data", async ({ mount, page }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={true}
        mode="EDIT"
        modelName="document"
        oldInstance={{
          id: "42",
          title: "My Contract",
          slug: "my-contract",
          description: "A sample contract document.",
        }}
        formType="document"
      />
    );

    await expect(page.getByText("Edit Document")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByLabel("Title *")).toHaveValue("My Contract");

    await docScreenshot(page, "crud--modal-document--edit-prefilled");

    await component.unmount();
  });

  test("renders document VIEW modal (read-only)", async ({ mount, page }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={true}
        mode="VIEW"
        modelName="document"
        oldInstance={{
          id: "42",
          title: "My Contract",
          slug: "my-contract",
          description: "A sample contract document.",
        }}
        formType="document"
      />
    );

    await expect(page.getByText("View Document")).toBeVisible({
      timeout: 5000,
    });

    // Fields should be disabled in VIEW mode
    await expect(page.getByLabel("Title *")).toBeDisabled();
    await expect(page.getByLabel("Description *")).toBeDisabled();

    // No submit buttons should be visible in VIEW mode
    await expect(
      page.getByRole("button", { name: "Update" })
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create" })
    ).not.toBeVisible();

    await docScreenshot(page, "crud--modal-document--view-readonly");

    await component.unmount();
  });

  test("renders labelset CREATE modal", async ({ mount, page }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={true}
        mode="CREATE"
        modelName="labelset"
        oldInstance={{}}
        formType="labelset"
      />
    );

    await expect(page.getByText("Create Labelset")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByLabel("Title *")).toBeVisible();
    await expect(page.getByLabel("Description *")).toBeVisible();

    await docScreenshot(page, "crud--modal-labelset--create-empty");

    await component.unmount();
  });

  test("shows submit button only when form has changes", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={true}
        mode="EDIT"
        modelName="document"
        oldInstance={{
          id: "42",
          title: "Original Title",
          slug: "original",
          description: "Original description.",
        }}
        formType="document"
      />
    );

    await expect(page.getByText("Edit Document")).toBeVisible({
      timeout: 5000,
    });

    // No Update button initially because the form hasn't changed
    await expect(
      page.getByRole("button", { name: "Update" })
    ).not.toBeVisible();

    // Make a change — type a new title
    await page.getByLabel("Title *").fill("Updated Title");

    // Now the Update button should appear
    await expect(page.getByRole("button", { name: "Update" })).toBeVisible({
      timeout: 5000,
    });

    await docScreenshot(page, "crud--modal-document--edit-with-changes");

    await component.unmount();
  });

  test("hides submit when validation fails", async ({ mount, page }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={true}
        mode="EDIT"
        modelName="document"
        oldInstance={{
          id: "42",
          title: "Original Title",
          slug: "original",
          description: "Some description.",
        }}
        formType="document"
        validateTitle={true}
      />
    );

    await expect(page.getByText("Edit Document")).toBeVisible({
      timeout: 5000,
    });

    // Clear the title field — this should trigger validation failure
    await page.getByLabel("Title *").fill("");

    // Even though we made a change, validation fails so no Update button
    await expect(
      page.getByRole("button", { name: "Update" })
    ).not.toBeVisible();

    // The validation error message should be visible
    await expect(page.getByText("Title is required")).toBeVisible();

    await component.unmount();
  });

  test("does not render when closed", async ({ mount, page }) => {
    const component = await mount(
      <CRUDModalTestWrapper
        open={false}
        mode="CREATE"
        modelName="document"
        oldInstance={{}}
        formType="document"
      />
    );

    await expect(page.getByText("Create Document")).not.toBeVisible();

    await component.unmount();
  });
});
