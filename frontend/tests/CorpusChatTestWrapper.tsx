import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { CorpusChat } from "../src/components/corpuses/CorpusChat";
import { authToken, userObj } from "../src/graphql/cache";
import { relayStylePagination } from "@apollo/client/utilities";

const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          conversations: relayStylePagination(["corpusId", "conversationType"]),
          chatMessages: {
            keyArgs: ["conversationId"],
            merge(_existing = [], incoming: unknown[]) {
              return incoming;
            },
          },
        },
      },
    },
  });

interface Props {
  mocks: ReadonlyArray<MockedResponse>;
  corpusId: string;
  /** Set to true to start in the new-chat view rather than the conversation list */
  forceNewChat?: boolean;
  initialQuery?: string;
  onNavigateHome?: () => void;
  onMessageSelect?: (id: string) => void;
}

export const CorpusChatTestWrapper: React.FC<Props> = ({
  mocks,
  corpusId,
  forceNewChat = false,
  initialQuery,
  onNavigateHome,
  onMessageSelect = () => {},
}) => {
  // Set auth synchronously so the WebSocket effect sees the token on the
  // very first render — this avoids a re-mount race that closes/reopens the
  // socket and can drop early test messages.
  authToken("test-auth-token");
  userObj({
    id: "test-user",
    email: "test@example.com",
    username: "testuser",
  });

  return (
    <MemoryRouter initialEntries={["/"]}>
      <JotaiProvider>
        <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
          <div style={{ height: "600px", width: "400px", display: "flex" }}>
            <CorpusChat
              corpusId={corpusId}
              showLoad={false}
              setShowLoad={() => {}}
              onMessageSelect={onMessageSelect}
              forceNewChat={forceNewChat}
              initialQuery={initialQuery}
              onNavigateHome={onNavigateHome}
            />
          </div>
        </MockedProvider>
      </JotaiProvider>
    </MemoryRouter>
  );
};
