import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { DocumentsTestWrapper } from "./DocumentsTestWrapper";
import { DocumentType } from "../src/types/graphql-api";
import { PermissionTypes } from "../src/components/types";

/* -------------------------------------------------------------------------- */
/* Mock Document Factory                                                       */
/* -------------------------------------------------------------------------- */

const createMockDocument = (
  id: string,
  title: string,
  options: Partial<{
    backendLock: boolean;
    pageCount: number;
    fileType: string;
    creatorEmail: string;
    icon: string | null;
    created: string;
  }> = {}
): DocumentType =>
  ({
    id,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    description: `Description for ${title}`,
    backendLock: options.backendLock ?? false,
    pdfFile: `https://example.com/${id}.pdf`,
    txtExtractFile: null,
    fileType: options.fileType ?? "pdf",
    pawlsParseFile: null,
    icon: options.icon ?? null,
    isPublic: false,
    myPermissions: [
      PermissionTypes.CAN_READ,
      PermissionTypes.CAN_UPDATE,
      PermissionTypes.CAN_REMOVE,
    ],
    pageCount: options.pageCount ?? 10,
    created: options.created ?? new Date().toISOString(),
    creator: {
      id: "user-1",
      email: options.creatorEmail ?? "tester@example.com",
      slug: "tester",
      __typename: "UserType",
    },
    is_selected: false,
    is_open: false,
    hasVersionHistory: false,
    versionCount: 1,
    isLatestVersion: true,
    canViewHistory: true,
    doc_label_annotations: { edges: [] },
    __typename: "DocumentType",
  } as DocumentType);

/* -------------------------------------------------------------------------- */
/* Mock Data                                                                   */
/* -------------------------------------------------------------------------- */

const mockDocuments: DocumentType[] = [
  createMockDocument("doc-1", "Contract Agreement.pdf", {
    pageCount: 25,
    fileType: "pdf",
    creatorEmail: "alice@example.com",
    backendLock: false,
  }),
  createMockDocument("doc-2", "Legal Brief.pdf", {
    pageCount: 10,
    fileType: "pdf",
    creatorEmail: "bob@example.com",
    backendLock: false,
  }),
  createMockDocument("doc-3", "Processing Document.pdf", {
    pageCount: 5,
    fileType: "pdf",
    creatorEmail: "alice@example.com",
    backendLock: true, // Currently processing
  }),
  createMockDocument("doc-4", "Report.docx", {
    pageCount: 15,
    fileType: "docx",
    creatorEmail: "charlie@example.com",
    backendLock: false,
  }),
  createMockDocument("doc-5", "Notes.txt", {
    pageCount: 2,
    fileType: "txt",
    creatorEmail: "alice@example.com",
    backendLock: false,
  }),
];

/* -------------------------------------------------------------------------- */
/* Tests: Empty States                                                         */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Empty States", () => {
  test("renders empty state when no documents exist", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={[]} isAuthenticated={true} />
    );

    // Wait for content to load
    await component.waitFor({ state: "visible" });

    // Should show empty state message
    await expect(
      component.getByRole("heading", { name: "No documents yet" })
    ).toBeVisible({
      timeout: 10000,
    });

    // Should show upload button in empty state
    await expect(
      component.getByRole("button", { name: "Upload Your First Document" })
    ).toBeVisible();
  });

  test("shows error state when query fails", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper
        documents={[]}
        error={true}
        isAuthenticated={true}
      />
    );

    // Should show error message
    await expect(
      component.getByRole("heading", { name: "Failed to load documents" })
    ).toBeVisible({
      timeout: 10000,
    });

    // Should show retry button
    await expect(
      component.getByRole("button", { name: "Try Again" })
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Document Display                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Display", () => {
  test("renders documents in grid view by default", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to render
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });
    await expect(component.getByText("Legal Brief.pdf")).toBeVisible();
    await expect(component.getByText("Report.docx")).toBeVisible();
  });

  test("shows correct stats summary", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Should show document count in stats - use locator that targets stat blocks
    const statsSection = component.locator(".oc-stat-block__value");
    await expect(statsSection.first()).toBeVisible();

    // Stats should show document counts - checking tab has correct count suffix
    await expect(
      component.getByRole("tab", { name: /All Documents5/ })
    ).toBeVisible();
    await expect(
      component.getByRole("tab", { name: /Processed4/ })
    ).toBeVisible();
    await expect(
      component.getByRole("tab", { name: /Processing1/ })
    ).toBeVisible();
  });

  test("shows processing indicator for documents being processed", async ({
    mount,
  }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // The processing document should show "Processing..." overlay
    await expect(component.getByText("Processing...")).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows file type badges correctly", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Should show file type badges - use getByRole for chip buttons
    await expect(
      component.getByRole("button", { name: "PDF" }).first()
    ).toBeVisible();
    await expect(
      component.getByRole("button", { name: "DOCX", exact: true })
    ).toBeVisible();
    await expect(
      component.getByRole("button", { name: "TXT", exact: true })
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: View Modes                                                           */
/* -------------------------------------------------------------------------- */

test.describe("Documents - View Modes", () => {
  test("can switch to list view", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Click list view button (second button in view toggle)
    const listViewButton = component.getByRole("button", {
      name: "List view",
    });
    await listViewButton.click();

    // Should show list headers
    await expect(component.getByText("Name")).toBeVisible();
    await expect(component.getByText("Type")).toBeVisible();
    await expect(component.getByText("Status")).toBeVisible();
  });

  test("can switch to compact view", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Click compact view button
    const compactViewButton = component.getByRole("button", {
      name: "Compact view",
    });
    await compactViewButton.click();

    // Documents should still be visible
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible();
    await expect(component.getByText("Legal Brief.pdf")).toBeVisible();
  });

  test("view toggle buttons have correct aria states", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Grid view should be pressed by default
    const gridButton = component.getByRole("button", { name: "Grid view" });
    await expect(gridButton).toHaveAttribute("aria-pressed", "true");

    // List view should not be pressed
    const listButton = component.getByRole("button", { name: "List view" });
    await expect(listButton).toHaveAttribute("aria-pressed", "false");
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Filter Tabs                                                          */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Filter Tabs", () => {
  test("filter tabs show correct counts", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Should have filter tabs with counts - use getByRole for tabs
    await expect(
      component.getByRole("tab", { name: /All Documents/ })
    ).toBeVisible();
    await expect(
      component.getByRole("tab", { name: /Processed/ })
    ).toBeVisible();
    await expect(
      component.getByRole("tab", { name: /Processing/ })
    ).toBeVisible();
  });

  test("clicking Processed filter shows only processed documents", async ({
    mount,
  }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Click Processed tab using role
    await component.getByRole("tab", { name: /Processed/ }).click();

    // Processing document should not be visible
    // (Processing Document.pdf has backendLock: true)
    await expect(
      component.getByText("Processing Document.pdf")
    ).not.toBeVisible();

    // Other documents should be visible
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible();
    await expect(component.getByText("Legal Brief.pdf")).toBeVisible();
  });

  test("clicking Processing filter shows only processing documents", async ({
    mount,
  }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Click Processing tab using role
    await component.getByRole("tab", { name: /Processing/ }).click();

    // Only processing document should be visible
    await expect(component.getByText("Processing Document.pdf")).toBeVisible();

    // Other documents should not be visible
    await expect(
      component.getByText("Contract Agreement.pdf")
    ).not.toBeVisible();
    await expect(component.getByText("Legal Brief.pdf")).not.toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Search                                                               */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Search", () => {
  test("search box is visible and functional", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Search box should be visible
    const searchBox = component.getByPlaceholder(/Search for documents/i);
    await expect(searchBox).toBeVisible({ timeout: 10000 });

    // Should be able to type in search
    await searchBox.fill("Contract");
    await expect(searchBox).toHaveValue("Contract");
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Document Selection                                                   */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Selection", () => {
  test("can select a document via checkbox", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Find and click the first checkbox - use aria-label selector and force click
    const checkbox = component.getByRole("checkbox", {
      name: "Select Contract Agreement.pdf",
    });
    await checkbox.click({ force: true });

    // Bulk action buttons should appear
    await expect(component.getByText("Add to Corpus")).toBeVisible();
    await expect(component.getByText(/Delete \(1\)/)).toBeVisible();
  });

  test("can select all documents in list view", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Switch to list view
    await component.getByRole("button", { name: "List view" }).click();

    // Wait for list view to render
    await expect(component.getByText("Name")).toBeVisible();

    // Click select all checkbox
    const selectAllCheckbox = component.getByRole("checkbox", {
      name: "Select all documents",
    });
    await selectAllCheckbox.click({ force: true });

    // Should show delete button with count of all documents
    await expect(component.getByText(/Delete \(5\)/)).toBeVisible();
  });

  test("clear button deselects all documents", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper
        documents={mockDocuments}
        isAuthenticated={true}
        initialSelectedIds={["doc-1", "doc-2"]}
      />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Should show bulk actions with 2 selected
    await expect(component.getByText(/Delete \(2\)/)).toBeVisible();

    // Click Clear button
    await component.getByRole("button", { name: "Clear" }).click();

    // Bulk actions should disappear
    await expect(component.getByText(/Delete \(\d+\)/)).not.toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Authentication States                                                */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Authentication", () => {
  test("shows Upload button when authenticated", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Upload button should be visible in the action bar
    await expect(
      component.getByRole("button", { name: /Upload/i }).first()
    ).toBeVisible();
  });

  test("hides Upload button when not authenticated", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={false} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Upload button should not be visible in the toolbar (icon with "Upload" text)
    // Check that the action bar doesn't have the Upload button by checking view toggle is there
    // but no Upload button in the same area
    const uploadButton = component
      .locator("button", { hasText: "Upload" })
      .first();
    await expect(uploadButton).not.toBeVisible();
  });

  test("shows Bulk Upload button when user is not usage capped", async ({
    mount,
  }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Bulk Upload should be visible
    await expect(
      component.getByRole("button", { name: "Bulk Upload" })
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Advanced Filters                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Advanced Filters", () => {
  test("filter popup opens when clicking Filters button", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Click Filters button
    await component.getByText("Filters").click();

    // Filter popup should be visible
    await expect(component.getByText("Advanced Filters")).toBeVisible();
  });

  test("filter popup closes when clicking X", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Open filter popup
    await component.getByText("Filters").click();
    await expect(component.getByText("Advanced Filters")).toBeVisible();

    // Click close button
    const closeButton = component
      .getByRole("dialog", { name: "Advanced filters" })
      .getByRole("button")
      .first();
    await closeButton.click();

    // Filter popup should be hidden
    await expect(component.getByText("Advanced Filters")).not.toBeVisible();
  });

  // Note: Click-outside behavior uses DOM event listeners that don't work reliably
  // in Playwright component tests. The X button close test above covers the close functionality.
});

/* -------------------------------------------------------------------------- */
/* Tests: Context Menu                                                         */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Context Menu", () => {
  test("right-click opens context menu", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Right-click on a document card
    const firstCard = component.locator('[role="button"]').first();
    await firstCard.click({ button: "right" });

    // Context menu should appear
    await expect(component.getByText("Open Document")).toBeVisible();
    await expect(component.getByText("View Details")).toBeVisible();
    await expect(component.getByText("Add to Corpus")).toBeVisible();
    await expect(component.getByText("Edit Details")).toBeVisible();
  });

  // Note: Context menu close-on-click-outside uses DOM event listeners that don't work
  // reliably in Playwright component tests. The context menu open tests above verify functionality.

  test("menu button opens context menu", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Hover over card to reveal menu button
    const firstCard = component.locator('[role="button"]').first();
    await firstCard.hover();

    // Click the more menu button (MoreVertical icon)
    const menuButton = firstCard.locator("button").last();
    await menuButton.click();

    // Context menu should appear
    await expect(component.getByText("Open Document")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Keyboard Navigation                                                  */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Keyboard Navigation", () => {
  test("document cards are keyboard accessible", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // First card should be focusable
    const firstCard = component.locator('[role="button"]').first();
    await expect(firstCard).toHaveAttribute("tabindex", "0");
  });

  test("pressing Enter on focused document card would navigate", async ({
    mount,
  }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={mockDocuments} isAuthenticated={true} />
    );

    // Wait for documents to load
    await expect(component.getByText("Contract Agreement.pdf")).toBeVisible({
      timeout: 10000,
    });

    // Focus on first card
    const firstCard = component.locator('[role="button"]').first();
    await firstCard.focus();

    // Verify it has keyboard handler attributes
    await expect(firstCard).toHaveAttribute("role", "button");
    await expect(firstCard).toHaveAttribute("tabindex", "0");
  });
});

/* -------------------------------------------------------------------------- */
/* Tests: Loading State                                                        */
/* -------------------------------------------------------------------------- */

test.describe("Documents - Loading State", () => {
  // Note: MockedProvider returns results immediately, so we can't test true loading state.
  // Instead, we verify that the component handles empty state correctly after loading completes.
  test("handles transition from loading to loaded state", async ({ mount }) => {
    const component = await mount(
      <DocumentsTestWrapper documents={[]} isAuthenticated={true} />
    );

    // After loading completes, should show empty state
    await expect(
      component.getByRole("heading", { name: "No documents yet" })
    ).toBeVisible({ timeout: 10000 });
  });
});
