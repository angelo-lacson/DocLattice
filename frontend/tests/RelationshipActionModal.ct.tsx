import { test, expect } from "@playwright/experimental-ct-react";
import { RelationshipActionModalTestWrapper } from "./RelationshipActionModalTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("RelationshipActionModal", () => {
  test("renders modal with selected annotations", async ({ mount, page }) => {
    const component = await mount(<RelationshipActionModalTestWrapper />);

    // Wait for modal to appear
    await expect(page.getByText("Add Annotations to Relationship")).toBeVisible(
      {
        timeout: 10000,
      }
    );

    // Verify selected annotation count is displayed
    await expect(page.getByText("Selected: 2 annotations")).toBeVisible({
      timeout: 10000,
    });

    // Verify the two mode radio buttons are present
    await expect(page.getByText("Add to existing relationship")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Create new relationship")).toBeVisible({
      timeout: 10000,
    });

    // Verify footer buttons
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
      timeout: 10000,
    });

    // Without a corpus loaded in Jotai, the "No Corpus Selected" error should show
    await expect(page.getByText("No Corpus Selected")).toBeVisible({
      timeout: 10000,
    });

    await docScreenshot(
      page,
      "knowledge-base--relationship-action-modal--initial"
    );

    await component.unmount();
  });

  test("create mode radio is disabled without corpus state", async ({
    mount,
    page,
  }) => {
    const component = await mount(<RelationshipActionModalTestWrapper />);

    // Wait for modal to appear
    await expect(page.getByText("Add Annotations to Relationship")).toBeVisible(
      { timeout: 10000 }
    );

    // Without corpus state, the "Create new relationship" radio should be disabled
    const createRadio = page.locator('input[type="radio"][value="create"]');
    await expect(createRadio).toBeDisabled();

    // The "Add to existing" radio should be checked by default
    const addRadio = page.locator('input[type="radio"][value="add"]');
    await expect(addRadio).toBeChecked();

    await docScreenshot(
      page,
      "knowledge-base--relationship-action-modal--create-disabled"
    );

    await component.unmount();
  });

  test("shows no editable relationships message in add mode", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <RelationshipActionModalTestWrapper existingRelationships={[]} />
    );

    // Wait for modal to appear
    await expect(page.getByText("Add Annotations to Relationship")).toBeVisible(
      {
        timeout: 10000,
      }
    );

    // In add mode with no existing relationships, should show the empty message
    await expect(page.getByText("No editable relationships found")).toBeVisible(
      {
        timeout: 10000,
      }
    );

    await component.unmount();
  });
});
