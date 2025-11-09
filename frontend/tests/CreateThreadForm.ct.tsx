import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { CreateThreadForm } from "../src/components/threads/CreateThreadForm";
import { MockedProvider } from "@apollo/client/testing";
import {
  CREATE_THREAD,
  CreateThreadInput,
  CreateThreadOutput,
} from "../src/graphql/mutations";
import { GET_CONVERSATIONS } from "../src/graphql/queries";

test.describe("CreateThreadForm", () => {
  test("renders form fields", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    await expect(page.getByText("Start New Discussion")).toBeVisible();
    await expect(page.getByLabel(/title/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
    await expect(page.getByText("Initial Message *")).toBeVisible();
  });

  test("shows character count for title", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const titleInput = page.getByLabel(/title/i);
    await titleInput.fill("Test Title");

    await expect(page.getByText("10 / 200 characters")).toBeVisible();
  });

  test("shows character count for description", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const descriptionInput = page.getByLabel(/description/i);
    await descriptionInput.fill("Test Description");

    await expect(page.getByText("16 / 1000 characters")).toBeVisible();
  });

  test("calls onClose when close button clicked", async ({ mount, page }) => {
    let closeCalled = false;

    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {
            closeCalled = true;
          }}
        />
      </MockedProvider>
    );

    const closeButton = page.getByTitle("Close");
    await closeButton.click();

    expect(closeCalled).toBe(true);
  });

  test("calls onClose when clicking outside modal", async ({ mount, page }) => {
    let closeCalled = false;

    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {
            closeCalled = true;
          }}
        />
      </MockedProvider>
    );

    // Wait for modal to be visible
    await expect(page.getByText("Start New Discussion")).toBeVisible();

    // The overlay should be the parent of the modal - click at the edge of the viewport
    // to hit the overlay outside the modal
    await page.click("body", { position: { x: 5, y: 5 }, force: true });

    expect(closeCalled).toBe(true);
  });

  test("validates required title", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
          initialMessage="<p>Test message content</p>"
        />
      </MockedProvider>
    );

    // Title is empty, but message has content
    // Try to send
    const sendButton = page.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for validation
    await page.waitForTimeout(100);

    // Should show error
    await expect(page.getByText(/please enter a title/i)).toBeVisible();
  });

  test("validates required message", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    // Fill in title but not message
    const titleInput = page.getByLabel(/title/i);
    await titleInput.fill("Test Thread");

    // Send button should be disabled when message is empty
    const sendButton = page.getByRole("button", { name: /send/i });
    await expect(sendButton).toBeDisabled();
  });

  test("submits thread with all fields", async ({ mount, page }) => {
    let mutationCalled = false;
    let mutationVariables: CreateThreadInput | null = null;

    const mocks = [
      {
        request: {
          query: CREATE_THREAD,
          variables: {
            corpusId: "corpus-1",
            title: "Test Thread",
            description: "Test description",
            initialMessage: "<p>Test message content</p>",
          },
        },
        result: {
          data: {
            createThread: {
              ok: true,
              message: "Thread created successfully",
              conversation: {
                id: "thread-1",
                conversationType: "THREAD",
                title: "Test Thread",
                description: "Test description",
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:00:00Z",
                isPinned: false,
                isLocked: false,
                creator: {
                  id: "user-1",
                  username: "testuser",
                  email: "test@example.com",
                },
                corpus: {
                  id: "corpus-1",
                  title: "Test Corpus",
                },
                messageCount: 1,
              },
            },
          } as CreateThreadOutput,
        },
      },
      {
        request: {
          query: GET_CONVERSATIONS,
          variables: {
            corpusId: "corpus-1",
            conversationType: "THREAD",
          },
        },
        result: {
          data: {
            conversations: {
              edges: [],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        },
      },
    ];

    let successCallbackFired = false;

    await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={(id) => {
            successCallbackFired = true;
            expect(id).toBe("thread-1");
          }}
          onClose={() => {}}
          initialMessage="<p>Test message content</p>"
        />
      </MockedProvider>
    );

    // Fill in all fields
    const titleInput = page.getByLabel(/title/i);
    await titleInput.fill("Test Thread");

    const descriptionInput = page.getByLabel(/description/i);
    await descriptionInput.fill("Test description");

    // Submit
    const sendButton = page.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for mutation
    await page.waitForTimeout(500);

    expect(successCallbackFired).toBe(true);
  });

  test("submits thread without optional description", async ({
    mount,
    page,
  }) => {
    const mocks = [
      {
        request: {
          query: CREATE_THREAD,
          variables: {
            corpusId: "corpus-1",
            title: "Test Thread",
            initialMessage: "<p>Test message content</p>",
          },
        },
        result: {
          data: {
            createThread: {
              ok: true,
              message: "Thread created successfully",
              conversation: {
                id: "thread-1",
                conversationType: "THREAD",
                title: "Test Thread",
                description: null,
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:00:00Z",
                isPinned: false,
                isLocked: false,
                creator: {
                  id: "user-1",
                  username: "testuser",
                  email: "test@example.com",
                },
                corpus: {
                  id: "corpus-1",
                  title: "Test Corpus",
                },
                messageCount: 1,
              },
            },
          } as CreateThreadOutput,
        },
      },
      {
        request: {
          query: GET_CONVERSATIONS,
          variables: {
            corpusId: "corpus-1",
            conversationType: "THREAD",
          },
        },
        result: {
          data: {
            conversations: {
              edges: [],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        },
      },
    ];

    let successCallbackFired = false;

    await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {
            successCallbackFired = true;
          }}
          onClose={() => {}}
          initialMessage="<p>Test message content</p>"
        />
      </MockedProvider>
    );

    // Fill in only required fields
    const titleInput = page.getByLabel(/title/i);
    await titleInput.fill("Test Thread");

    // Submit
    const sendButton = page.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for mutation
    await page.waitForTimeout(500);

    expect(successCallbackFired).toBe(true);
  });

  test("displays error on mutation failure", async ({ mount, page }) => {
    const mocks = [
      {
        request: {
          query: CREATE_THREAD,
          variables: {
            corpusId: "corpus-1",
            title: "Test Thread",
            initialMessage: "<p>Test message content</p>",
          },
        },
        result: {
          data: {
            createThread: {
              ok: false,
              message: "You don't have permission to create threads",
              conversation: null,
            },
          } as CreateThreadOutput,
        },
      },
    ];

    await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
          initialMessage="<p>Test message content</p>"
        />
      </MockedProvider>
    );

    // Fill in fields
    const titleInput = page.getByLabel(/title/i);
    await titleInput.fill("Test Thread");

    // Submit
    const sendButton = page.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for mutation
    await page.waitForTimeout(500);

    // Should show error
    await expect(page.getByText(/you don't have permission/i)).toBeVisible();
  });

  test("enforces max length on title", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const titleInput = page.getByLabel(/title/i);

    // Try to enter more than 200 characters
    const longTitle = "A".repeat(250);
    await titleInput.fill(longTitle);

    // Should be truncated to 200
    const value = await titleInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(200);
  });

  test("enforces max length on description", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const descriptionInput = page.getByLabel(/description/i);

    // Try to enter more than 1000 characters
    const longDescription = "A".repeat(1050);
    await descriptionInput.fill(longDescription);

    // Should be truncated to 1000
    const value = await descriptionInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(1000);
  });
});
