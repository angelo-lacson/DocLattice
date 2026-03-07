import { test, expect } from "@playwright/experimental-ct-react";
import { FolderTestWrapper } from "./utils/FolderTestWrapper";
import { DeleteFolderModalFixture } from "./utils/testFixtures";
import { createMockFolder } from "./utils/mockFolderData";
import { docScreenshot } from "../utils/docScreenshot";

test.describe("DeleteFolderModal", () => {
  const targetFolder = createMockFolder({
    id: "folder-1",
    name: "Contracts",
    path: "Contracts",
    documentCount: 5,
    descendantDocumentCount: 12,
  });

  const childFolder = createMockFolder({
    id: "folder-1-1",
    name: "Legal",
    path: "Contracts / Legal",
    parent: { id: "folder-1", name: "Contracts" },
    documentCount: 3,
  });

  const allFolders = [targetFolder, childFolder];

  test("renders confirmation dialog with folder info", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture folderId="folder-1" folders={allFolders} />
      </FolderTestWrapper>
    );

    // Modal title (use locator to target the header title specifically)
    await expect(
      page.locator(".oc-modal-header__title", { hasText: "Delete Folder" })
    ).toBeVisible({ timeout: 5000 });

    // Warning text
    await expect(page.getByText("This action cannot be undone")).toBeVisible();

    // Folder name in warning (quoted in the warning text)
    await expect(page.getByText('"Contracts"')).toBeVisible();

    // Folder info section
    await expect(page.getByText("Documents in folder:")).toBeVisible();
    await expect(page.getByText("Subfolders:", { exact: true })).toBeVisible();

    await docScreenshot(page, "folders--delete-folder-modal--confirmation");
  });

  test("does not render when showModal is false", async ({ mount, page }) => {
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture
          showModal={false}
          folderId="folder-1"
          folders={allFolders}
        />
      </FolderTestWrapper>
    );

    await expect(page.getByText("Delete Folder")).not.toBeVisible();
  });

  test("does not render when folder is not found", async ({ mount, page }) => {
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture folderId="nonexistent" folders={allFolders} />
      </FolderTestWrapper>
    );

    await expect(page.getByText("Delete Folder")).not.toBeVisible();
  });

  test("shows subfolder and document counts in warning", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture folderId="folder-1" folders={allFolders} />
      </FolderTestWrapper>
    );

    // Should show subfolder count
    await expect(page.getByText("1 subfolder")).toBeVisible({ timeout: 5000 });

    // Should show document count - use locator to target the warning list item
    await expect(page.locator("li", { hasText: "5 documents" })).toBeVisible();

    // Should mention where items move to (Corpus Root since folder has no parent)
    await expect(
      page.locator("li", { hasText: "Corpus Root" }).first()
    ).toBeVisible();
  });

  test("has Cancel and Delete Folder buttons", async ({ mount, page }) => {
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture folderId="folder-1" folders={allFolders} />
      </FolderTestWrapper>
    );

    await expect(page.getByText("Cancel")).toBeVisible({ timeout: 5000 });

    const deleteButton = page.getByRole("button", { name: "Delete Folder" });
    await expect(deleteButton).toBeVisible();
  });

  test("has close button in header", async ({ mount, page }) => {
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture folderId="folder-1" folders={allFolders} />
      </FolderTestWrapper>
    );

    const closeButton = page.getByRole("button", { name: "Close" });
    await expect(closeButton).toBeVisible({ timeout: 5000 });
  });

  test("shows parent name when deleting a subfolder", async ({
    mount,
    page,
  }) => {
    // Delete the child folder - items should move to parent "Contracts"
    const component = await mount(
      <FolderTestWrapper>
        <DeleteFolderModalFixture folderId="folder-1-1" folders={allFolders} />
      </FolderTestWrapper>
    );

    await expect(page.getByText('"Legal"')).toBeVisible({ timeout: 5000 });
    // Items will be moved to the parent folder "Contracts"
    await expect(page.getByText("Folder:", { exact: true })).toBeVisible();
  });
});
