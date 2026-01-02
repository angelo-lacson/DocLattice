import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { Extracts } from "../src/views/Extracts";
import {
  authToken,
  userObj,
  backendUserObj,
  extractSearchTerm,
  selectedExtractIds,
  showCreateExtractModal,
  showDeleteExtractModal,
} from "../src/graphql/cache";
import { GET_EXTRACTS } from "../src/graphql/queries";
import { REQUEST_DELETE_EXTRACT } from "../src/graphql/mutations";
import { ExtractType, PageInfo } from "../src/types/graphql-api";

// Create minimal cache
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      ExtractType: { keyFields: ["id"] },
      Query: {
        fields: {
          extracts: {
            keyArgs: ["searchText"],
            merge(existing, incoming) {
              return incoming;
            },
          },
        },
      },
    },
  });

// Default page info
const defaultPageInfo: PageInfo = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
  __typename: "PageInfo",
};

// Create GraphQL mocks
const createMocks = (
  extracts: ExtractType[],
  options: { loading?: boolean; error?: boolean } = {}
): MockedResponse[] => {
  const extractsMock: MockedResponse = {
    request: {
      query: GET_EXTRACTS,
    },
    variableMatcher: () => true,
    result: options.error
      ? undefined
      : {
          data: {
            extracts: {
              edges: extracts.map((extract) => ({
                node: extract,
                __typename: "ExtractTypeEdge",
              })),
              pageInfo: defaultPageInfo,
              __typename: "ExtractTypeConnection",
            },
          },
        },
    error: options.error ? new Error("Failed to load extracts") : undefined,
  };

  const deleteMock: MockedResponse = {
    request: {
      query: REQUEST_DELETE_EXTRACT,
    },
    variableMatcher: () => true,
    result: {
      data: {
        deleteExtract: {
          ok: true,
          __typename: "DeleteExtractMutation",
        },
      },
    },
  };

  // Return multiple copies for refetches
  return [
    extractsMock,
    { ...extractsMock },
    { ...extractsMock },
    { ...extractsMock },
    deleteMock,
  ];
};

interface WrapperProps {
  extracts?: ExtractType[];
  userEmail?: string;
  isAuthenticated?: boolean;
  loading?: boolean;
  error?: boolean;
  initialSearchTerm?: string;
  initialSelectedIds?: string[];
}

// Component that initializes reactive vars synchronously before children render
const ReactiveVarInitializer: React.FC<{
  isAuthenticated: boolean;
  userEmail: string;
  initialSearchTerm: string;
  initialSelectedIds: string[];
  children: React.ReactNode;
}> = ({
  isAuthenticated,
  userEmail,
  initialSearchTerm,
  initialSelectedIds,
  children,
}) => {
  // Use ref to ensure initialization only happens once per mount
  const initialized = React.useRef(false);

  if (!initialized.current) {
    // Set auth state synchronously before first render
    if (isAuthenticated && userEmail) {
      authToken("test-token");
      userObj({ email: userEmail } as any);
      backendUserObj({ isUsageCapped: false } as any);
    } else {
      authToken("");
      userObj(null);
      backendUserObj(null);
    }

    // Reset other state
    extractSearchTerm(initialSearchTerm);
    selectedExtractIds(initialSelectedIds);
    showCreateExtractModal(false);
    showDeleteExtractModal(false);

    initialized.current = true;
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      authToken("");
      userObj(null);
      backendUserObj(null);
      extractSearchTerm("");
      selectedExtractIds([]);
      showCreateExtractModal(false);
      showDeleteExtractModal(false);
    };
  }, []);

  return <>{children}</>;
};

export const ExtractsTestWrapper: React.FC<WrapperProps> = ({
  extracts = [],
  userEmail = "test@example.com",
  isAuthenticated = true,
  loading = false,
  error = false,
  initialSearchTerm = "",
  initialSelectedIds = [],
}) => {
  return (
    <Provider>
      <MemoryRouter initialEntries={["/extracts"]}>
        <MockedProvider
          mocks={createMocks(extracts, { loading, error })}
          cache={createTestCache()}
          addTypename={true}
        >
          <ReactiveVarInitializer
            isAuthenticated={isAuthenticated}
            userEmail={userEmail}
            initialSearchTerm={initialSearchTerm}
            initialSelectedIds={initialSelectedIds}
          >
            <div style={{ height: "100vh", width: "100vw" }}>
              <Extracts />
            </div>
          </ReactiveVarInitializer>
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
