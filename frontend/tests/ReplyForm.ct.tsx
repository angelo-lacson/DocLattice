import { test, expect } from "@playwright/experimental-ct-react";
import { ReplyForm } from "../src/components/threads/ReplyForm";
import { MockedProvider } from "@apollo/client/testing";
import {
  CREATE_THREAD_MESSAGE,
  REPLY_TO_MESSAGE,
  CreateThreadMessageOutput,
  ReplyToMessageOutput,
} from "../src/graphql/mutations";
import { GET_THREAD_DETAIL } from "../src/graphql/queries";

test.describe("ReplyForm - Top-level Message", () => {
  test("renders for top-level message", async ({ mount }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm conversationId="conv-1" onCancel={() => {}} />
      </MockedProvider>
    );

    await expect(component).toBeVisible();
    // Should have the composer
    await expect(component.locator(".ProseMirror")).toBeVisible();
  });

  test("shows placeholder for top-level message", async ({ mount }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm conversationId="conv-1" onCancel={() => {}} />
      </MockedProvider>
    );

    await expect(component.getByText("Write your message...")).toBeVisible();
  });

  test("submits top-level message", async ({ mount, page }) => {
    const mocks = [
      {
        request: {
          query: CREATE_THREAD_MESSAGE,
          variables: {
            conversationId: "conv-1",
            content: expect.stringContaining("Test message"),
          },
        },
        result: {
          data: {
            createThreadMessage: {
              ok: true,
              message: "Message created successfully",
              chatMessage: {
                id: "msg-1",
                content: "<p>Test message</p>",
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:00:00Z",
                sender: {
                  id: "user-1",
                  username: "testuser",
                  email: "test@example.com",
                },
                conversation: {
                  id: "conv-1",
                  title: "Test Thread",
                },
                upvoteCount: 0,
                downvoteCount: 0,
                userVote: null,
              },
            },
          } as CreateThreadMessageOutput,
        },
      },
      {
        request: {
          query: GET_THREAD_DETAIL,
          variables: {
            conversationId: "conv-1",
          },
        },
        result: {
          data: {
            conversation: {
              id: "conv-1",
              allMessages: [],
            },
          },
        },
      },
    ];

    let successCalled = false;

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          onSuccess={() => {
            successCalled = true;
          }}
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test message content");

    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    await page.waitForTimeout(500);

    expect(successCalled).toBe(true);
  });

  test("calls onCancel when cancel button clicked", async ({ mount }) => {
    let cancelCalled = false;

    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          replyingToUsername="testuser"
          onCancel={() => {
            cancelCalled = true;
          }}
        />
      </MockedProvider>
    );

    const cancelButton = component.getByRole("button", { name: /cancel/i });
    await cancelButton.click();

    expect(cancelCalled).toBe(true);
  });
});

test.describe("ReplyForm - Nested Reply", () => {
  test("renders for nested reply", async ({ mount }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    await expect(component).toBeVisible();
    await expect(component.getByText(/replying to/i)).toBeVisible();
    await expect(component.getByText("@testuser")).toBeVisible();
  });

  test("shows username in placeholder for nested reply", async ({ mount }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    await expect(component.getByText("Reply to @testuser...")).toBeVisible();
  });

  test("submits nested reply", async ({ mount, page }) => {
    const mocks = [
      {
        request: {
          query: REPLY_TO_MESSAGE,
          variables: {
            parentMessageId: "msg-1",
            content: expect.stringContaining("Test reply"),
          },
        },
        result: {
          data: {
            replyToMessage: {
              ok: true,
              message: "Reply created successfully",
              chatMessage: {
                id: "msg-2",
                content: "<p>Test reply</p>",
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:00:00Z",
                sender: {
                  id: "user-2",
                  username: "replier",
                  email: "replier@example.com",
                },
                parentMessage: {
                  id: "msg-1",
                  content: "<p>Original message</p>",
                  sender: {
                    id: "user-1",
                    username: "testuser",
                  },
                },
                conversation: {
                  id: "conv-1",
                  title: "Test Thread",
                },
                upvoteCount: 0,
                downvoteCount: 0,
                userVote: null,
              },
            },
          } as ReplyToMessageOutput,
        },
      },
      {
        request: {
          query: GET_THREAD_DETAIL,
          variables: {
            conversationId: "conv-1",
          },
        },
        result: {
          data: {
            conversation: {
              id: "conv-1",
              allMessages: [],
            },
          },
        },
      },
    ];

    let successCalled = false;

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onSuccess={() => {
            successCalled = true;
          }}
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test reply content");

    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    await page.waitForTimeout(500);

    expect(successCalled).toBe(true);
  });

  test("displays error on mutation failure", async ({ mount, page }) => {
    const mocks = [
      {
        request: {
          query: REPLY_TO_MESSAGE,
          variables: {
            parentMessageId: "msg-1",
            content: expect.stringContaining("Test reply"),
          },
        },
        result: {
          data: {
            replyToMessage: {
              ok: false,
              message: "Parent message not found",
              chatMessage: null,
            },
          } as ReplyToMessageOutput,
        },
      },
    ];

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onSuccess={() => {}}
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test reply content");

    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    await page.waitForTimeout(500);

    await expect(
      component.getByText(/parent message not found/i)
    ).toBeVisible();
  });

  test("validates required content before submit", async ({ mount, page }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    // Try to send without content
    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    await page.waitForTimeout(100);

    await expect(component.getByText(/please write a message/i)).toBeVisible();
  });

  test("disables form while submitting", async ({ mount, page }) => {
    const mocks = [
      {
        request: {
          query: REPLY_TO_MESSAGE,
          variables: {
            parentMessageId: "msg-1",
            content: expect.stringContaining("Test reply"),
          },
        },
        // Delay response to test loading state
        delay: 1000,
        result: {
          data: {
            replyToMessage: {
              ok: true,
              message: "Reply created successfully",
              chatMessage: {
                id: "msg-2",
                content: "<p>Test reply</p>",
                createdAt: "2025-01-01T00:00:00Z",
                updatedAt: "2025-01-01T00:00:00Z",
                sender: {
                  id: "user-2",
                  username: "replier",
                  email: "replier@example.com",
                },
                parentMessage: {
                  id: "msg-1",
                  content: "<p>Original message</p>",
                  sender: {
                    id: "user-1",
                    username: "testuser",
                  },
                },
                conversation: {
                  id: "conv-1",
                  title: "Test Thread",
                },
                upvoteCount: 0,
                downvoteCount: 0,
                userVote: null,
              },
            },
          } as ReplyToMessageOutput,
        },
      },
      {
        request: {
          query: GET_THREAD_DETAIL,
          variables: {
            conversationId: "conv-1",
          },
        },
        result: {
          data: {
            conversation: {
              id: "conv-1",
              allMessages: [],
            },
          },
        },
      },
    ];

    const component = await mount(
      <MockedProvider mocks={mocks} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onCancel={() => {}}
        />
      </MockedProvider>
    );

    const editor = component.locator(".ProseMirror");
    await editor.click();
    await editor.fill("Test reply content");

    const sendButton = component.getByRole("button", { name: /send/i });
    await sendButton.click();

    // While loading, button should be disabled
    await page.waitForTimeout(200);
    await expect(sendButton).toBeDisabled();
  });

  test("auto-focuses editor when autoFocus is true", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <MockedProvider mocks={[]} addTypename={false}>
        <ReplyForm
          conversationId="conv-1"
          parentMessageId="msg-1"
          replyingToUsername="testuser"
          onCancel={() => {}}
          autoFocus={true}
        />
      </MockedProvider>
    );

    const editor = component.locator(".ProseMirror");

    // Should be able to type without clicking
    await page.keyboard.type("Auto-focused!");

    await expect(editor).toContainText("Auto-focused!");
  });
});
