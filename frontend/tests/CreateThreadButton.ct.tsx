import { test, expect } from "@playwright/experimental-ct-react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { CreateThreadButton } from "../src/components/threads/CreateThreadButton";

test.describe("CreateThreadButton", () => {
  test("renders primary button variant by default", async ({ mount }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });

    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
    await expect(button.getByText("New Discussion")).toBeVisible();
  });

  test("renders secondary button variant", async ({ mount }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" variant="secondary" />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
  });

  test("renders floating action button variant", async ({ mount }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" floating={true} />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });

    // FAB should not have text, only icon
    await expect(button.getByText("New Discussion")).not.toBeVisible();
  });

  test("opens CreateThreadForm modal when clicked", async ({ mount, page }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    // Modal should appear
    await expect(page.getByText("Start New Discussion")).toBeVisible();
    await expect(page.getByLabelText("Title *")).toBeVisible();
    await expect(page.getByLabelText("Description (optional)")).toBeVisible();
  });

  test("closes modal when close button clicked", async ({ mount, page }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    // Open modal
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    await expect(page.getByText("Start New Discussion")).toBeVisible();

    // Close modal
    const closeButton = page.getByRole("button", { name: /close/i });
    await closeButton.click();

    // Modal should be gone
    await expect(page.getByText("Start New Discussion")).not.toBeVisible();
  });

  test("respects disabled prop", async ({ mount }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" disabled={true} />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
    await expect(button).toBeDisabled();
  });

  test("does not open modal when disabled", async ({ mount, page }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" disabled={true} />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click({ force: true }); // Force click on disabled button

    // Modal should NOT appear
    await expect(page.getByText("Start New Discussion")).not.toBeVisible();
  });

  test("displays icon in button", async ({ mount }) => {
    const component = await mount(
      <MemoryRouter>
        <MockedProvider>
          <CreateThreadButton corpusId="test-corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    await component.waitFor({ timeout: 5000 });
    const button = component.getByRole("button", {
      name: /start new discussion/i,
    });
    await expect(button).toBeVisible({ timeout: 10000 });
    const icon = button.locator("svg");
    await expect(icon).toBeVisible();
  });
});
