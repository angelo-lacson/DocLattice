import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedResponse } from "@apollo/client/testing";
import { CorpusChatTestWrapper } from "./CorpusChatTestWrapper";
import { GET_CORPUS_CONVERSATIONS } from "../src/graphql/queries";
import { docScreenshot } from "./utils/docScreenshot";

const TEST_CORPUS_ID = "test-corpus-123";

const emptyConversationsMock: MockedResponse = {
  request: {
    query: GET_CORPUS_CONVERSATIONS,
    variables: {
      corpusId: TEST_CORPUS_ID,
      conversationType: "CHAT",
    },
  },
  result: {
    data: {
      conversations: {
        __typename: "ConversationTypeConnection",
        pageInfo: {
          __typename: "PageInfo",
          hasNextPage: false,
          endCursor: null,
        },
        edges: [],
      },
    },
  },
};

const conversationsWithDataMock: MockedResponse = {
  request: {
    query: GET_CORPUS_CONVERSATIONS,
    variables: {
      corpusId: TEST_CORPUS_ID,
      conversationType: "CHAT",
    },
  },
  result: {
    data: {
      conversations: {
        __typename: "ConversationTypeConnection",
        pageInfo: {
          __typename: "PageInfo",
          hasNextPage: false,
          endCursor: null,
        },
        edges: [
          {
            __typename: "ConversationTypeEdge",
            node: {
              __typename: "ConversationType",
              id: "conv-1",
              title: "First Conversation",
              createdAt: new Date(Date.now() - 86400000).toISOString(),
              updatedAt: new Date(Date.now() - 86400000).toISOString(),
              chatMessages: {
                __typename: "ChatMessageTypeConnection",
                totalCount: 5,
              },
              creator: {
                __typename: "UserType",
                email: "user@example.com",
              },
            },
          },
          {
            __typename: "ConversationTypeEdge",
            node: {
              __typename: "ConversationType",
              id: "conv-2",
              title: "Second Conversation",
              createdAt: new Date(Date.now() - 172800000).toISOString(),
              updatedAt: new Date(Date.now() - 172800000).toISOString(),
              chatMessages: {
                __typename: "ChatMessageTypeConnection",
                totalCount: 3,
              },
              creator: {
                __typename: "UserType",
                email: "user@example.com",
              },
            },
          },
        ],
      },
    },
  },
};

test.describe("CorpusChat", () => {
  test("renders conversation list with existing conversations", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusChatTestWrapper
        mocks={[conversationsWithDataMock, conversationsWithDataMock]}
        corpusId={TEST_CORPUS_ID}
      />
    );

    // Wait for conversations to load and render
    await expect(page.getByText("First Conversation")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Second Conversation")).toBeVisible();

    await docScreenshot(page, "corpus--chat--conversation-list");
  });

  test("renders empty state when no conversations exist", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusChatTestWrapper
        mocks={[emptyConversationsMock, emptyConversationsMock]}
        corpusId={TEST_CORPUS_ID}
      />
    );

    // Wait for loading to complete — the component should show the conversation
    // list view with a "New Chat" button even when empty
    await page.waitForTimeout(2000);

    // Should see the new chat button
    await expect(
      page.getByRole("button", { name: "New Chat", exact: true })
    ).toBeVisible({ timeout: 10000 });

    await docScreenshot(page, "corpus--chat--empty");
  });

  test("renders new chat input when forceNewChat is true", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <CorpusChatTestWrapper
        mocks={[emptyConversationsMock, emptyConversationsMock]}
        corpusId={TEST_CORPUS_ID}
        forceNewChat
      />
    );

    // In new chat mode, should see the chat input area
    await page.waitForTimeout(2000);

    // The chat input should be visible (textarea or input for composing messages)
    const input = page.locator("textarea, input[type='text']").first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await docScreenshot(page, "corpus--chat--new-chat");
  });
});
