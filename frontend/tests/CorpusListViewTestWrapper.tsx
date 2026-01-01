import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { CorpusListView } from "../src/components/corpuses/CorpusListView";
import { authToken, userObj } from "../src/graphql/cache";
import { CorpusType, PageInfo } from "../src/types/graphql-api";
import { START_FORK_CORPUS } from "../src/graphql/mutations";

// Create minimal cache
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      CorpusType: { keyFields: ["id"] },
    },
  });

// Mock for fork mutation (always succeeds)
const createMocks = (): MockedResponse[] => [
  {
    request: {
      query: START_FORK_CORPUS,
    },
    variableMatcher: () => true,
    result: {
      data: {
        startForkCorpus: {
          ok: true,
          __typename: "StartForkCorpusMutation",
        },
      },
    },
  },
];

interface WrapperProps {
  corpuses: CorpusType[];
  searchValue: string;
  userEmail?: string;
  isAuthenticated?: boolean;
  loading?: boolean;
  pageInfo?: PageInfo;
  onSearchChange?: (value: string) => void;
  onCreateCorpus?: () => void;
  onImportCorpus?: () => void;
  allowImport?: boolean;
}

export const CorpusListViewTestWrapper: React.FC<WrapperProps> = ({
  corpuses,
  searchValue,
  userEmail = "test@example.com",
  isAuthenticated = true,
  loading = false,
  pageInfo,
  onSearchChange = () => {},
  onCreateCorpus = () => {},
  onImportCorpus,
  allowImport = false,
}) => {
  // Set up auth state for tests
  React.useEffect(() => {
    if (isAuthenticated && userEmail) {
      authToken("test-token");
      userObj({ email: userEmail } as any);
    } else {
      authToken("");
      userObj(null);
    }
  }, [isAuthenticated, userEmail]);

  const defaultPageInfo: PageInfo = {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
    __typename: "PageInfo",
  };

  return (
    <Provider>
      <MemoryRouter initialEntries={["/corpuses"]}>
        <MockedProvider mocks={createMocks()} cache={createTestCache()}>
          <CorpusListView
            corpuses={corpuses}
            pageInfo={pageInfo ?? defaultPageInfo}
            loading={loading}
            fetchMore={() => {}}
            onCreateCorpus={onCreateCorpus}
            onImportCorpus={onImportCorpus}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            allowImport={allowImport}
          />
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
