import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { CreateArticlePlaceholderHarness } from "./CreateArticlePlaceholderTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";

test.describe("CreateArticlePlaceholder - Card View", () => {
  test("should render card placeholder with title and subtitle", async ({
    mount,
    page,
  }) => {
    await mount(<CreateArticlePlaceholderHarness viewMode="modern-card" />);

    const placeholder = page.getByTestId("create-article-placeholder");
    await expect(placeholder).toBeVisible({ timeout: 5000 });

    await expect(page.getByText("Readme.CAML")).toBeVisible();
    await expect(page.getByText("Create a corpus article")).toBeVisible();

    await docScreenshot(page, "documents--create-article-placeholder--card");
  });

  test("should trigger onClick when clicked", async ({ mount, page }) => {
    await mount(<CreateArticlePlaceholderHarness viewMode="modern-card" />);

    const placeholder = page.getByTestId("create-article-placeholder");
    await placeholder.click();

    await expect(page.getByTestId("click-detected")).toBeVisible();
  });
});

test.describe("CreateArticlePlaceholder - List View", () => {
  test("should render list placeholder with title and subtitle", async ({
    mount,
    page,
  }) => {
    await mount(<CreateArticlePlaceholderHarness viewMode="modern-list" />);

    const placeholder = page.getByTestId("create-article-placeholder");
    await expect(placeholder).toBeVisible({ timeout: 5000 });

    await expect(page.getByText("Readme.CAML")).toBeVisible();
    await expect(page.getByText("Create a corpus article")).toBeVisible();

    await docScreenshot(page, "documents--create-article-placeholder--list");
  });
});
