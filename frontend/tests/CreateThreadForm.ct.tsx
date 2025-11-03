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
  test("renders form fields", async ({ mount }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    await expect(component.getByText("Start New Discussion")).toBeVisible();
    await expect(component.getByLabelText(/title/i)).toBeVisible();
    await expect(component.getByLabelText(/description/i)).toBeVisible();
    await expect(component.getByText("Initial Message *")).toBeVisible();
  });

  test("shows character count for title", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const titleInput = component.getByLabelText(/title/i);
    await titleInput.fill("Test Title");

    await expect(component.getByText("10 / 200 characters")).toBeVisible();
  });

  test("shows character count for description", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const descriptionInput = component.getByLabelText(/description/i);
    await descriptionInput.fill("Test Description");

    await expect(component.getByText("16 / 1000 characters")).toBeVisible();
  });

  test("calls onClose when close button clicked", async ({ mount }) => {
    let closeCalled = false;

    const component = await mount(
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

    const closeButton = component.getByTitle("Close");
    await closeButton.click();

    expect(closeCalled).toBe(true);
  });

  test("calls onClose when clicking outside modal", async ({ mount, page }) => {
    let closeCalled = false;

    const component = await mount(
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

    // Click on the overlay (outside the modal)
    const overlay = component.locator('[class*="Overlay"]').first();
    await overlay.click({ position: { x: 5, y: 5 } });

    expect(closeCalled).toBe(true);
  });

  test("validates required title", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    // Fill in message but not title
    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test message content");

    // Try to send
    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for validation
    await page.waitForTimeout(100);

    // Should show error
    await expect(component.getByText(/please enter a title/i)).toBeVisible();
  });

  test("validates required message", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    // Fill in title but not message
    const titleInput = component.getByLabelText(/title/i);
    await titleInput.fill("Test Thread");

    // Try to send (message is empty)
    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for validation
    await page.waitForTimeout(100);

    // Should show error
    await expect(component.getByText(/please write a message/i)).toBeVisible();
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
            initialMessage: expect.stringContaining("Test message"),
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

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={(id) => {
            successCallbackFired = true;
            expect(id).toBe("thread-1");
          }}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    // Fill in all fields
    const titleInput = component.getByLabelText(/title/i);
    await titleInput.fill("Test Thread");

    const descriptionInput = component.getByLabelText(/description/i);
    await descriptionInput.fill("Test description");

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test message content");

    // Submit
    const sendButton = component.getByRole("button", { name: /send/i });
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
            initialMessage: expect.stringContaining("Test message"),
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

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {
            successCallbackFired = true;
          }}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    // Fill in only required fields
    const titleInput = component.getByLabelText(/title/i);
    await titleInput.fill("Test Thread");

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test message content");

    // Submit
    const sendButton = component.getByRole("button", { name: /send/i });
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
            initialMessage: expect.stringContaining("Test message"),
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

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    // Fill in fields
    const titleInput = component.getByLabelText(/title/i);
    await titleInput.fill("Test Thread");

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test message content");

    // Submit
    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    // Wait for mutation
    await page.waitForTimeout(500);

    // Should show error
    await expect(
      component.getByText(/you don't have permission/i)
    ).toBeVisible();
  });

  test("enforces max length on title", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const titleInput = component.getByLabelText(/title/i);

    // Try to enter more than 200 characters
    const longTitle = "A".repeat(250);
    await titleInput.fill(longTitle);

    // Should be truncated to 200
    const value = await titleInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(200);
  });

  test("enforces max length on description", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <CreateThreadForm
          corpusId="corpus-1"
          onSuccess={() => {}}
          onClose={() => {}}
        />
      </MockedProvider>
    );

    const descriptionInput = component.getByLabelText(/description/i);

    // Try to enter more than 1000 characters
    const longDescription = "A".repeat(1050);
    await descriptionInput.fill(longDescription);

    // Should be truncated to 1000
    const value = await descriptionInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(1000);
  });
});
