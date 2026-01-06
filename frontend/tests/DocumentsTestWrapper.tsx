import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { Documents } from "../src/views/Documents";
import {
  authToken,
  userObj,
  backendUserObj,
  documentSearchTerm,
  selectedDocumentIds,
  filterToCorpus,
  filterToLabelId,
  filterToLabelsetId,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  showBulkUploadModal,
  showUploadNewDocumentsModal,
  editingDocument,
  viewingDocument,
} from "../src/graphql/cache";
import { GET_DOCUMENTS } from "../src/graphql/queries";
import {
  DELETE_MULTIPLE_DOCUMENTS,
  UPDATE_DOCUMENT,
} from "../src/graphql/mutations";
import { DocumentType, PageInfo } from "../src/types/graphql-api";
import { PermissionTypes } from "../src/components/types";

// Create minimal cache
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      DocumentType: { keyFields: ["id"] },
      Query: {
        fields: {
          documents: {
            keyArgs: ["textSearch", "inCorpusWithId", "hasLabelWithId"],
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
  documents: DocumentType[],
  options: { loading?: boolean; error?: boolean } = {}
): MockedResponse[] => {
  const documentsMock: MockedResponse = {
    request: {
      query: GET_DOCUMENTS,
    },
    variableMatcher: () => true,
    result: options.error
      ? undefined
      : {
          data: {
            documents: {
              edges: documents.map((doc) => ({
                node: doc,
                __typename: "DocumentTypeEdge",
              })),
              pageInfo: defaultPageInfo,
              __typename: "DocumentTypeConnection",
            },
          },
        },
    error: options.error ? new Error("Failed to load documents") : undefined,
  };

  const deleteMock: MockedResponse = {
    request: {
      query: DELETE_MULTIPLE_DOCUMENTS,
    },
    variableMatcher: () => true,
    result: {
      data: {
        deleteMultipleDocuments: {
          ok: true,
          __typename: "DeleteMultipleDocumentsMutation",
        },
      },
    },
  };

  const updateMock: MockedResponse = {
    request: {
      query: UPDATE_DOCUMENT,
    },
    variableMatcher: () => true,
    result: {
      data: {
        updateDocument: {
          ok: true,
          document: documents[0] ?? null,
          __typename: "UpdateDocumentMutation",
        },
      },
    },
  };

  // Return multiple copies of document mock for refetches
  return [
    documentsMock,
    { ...documentsMock },
    { ...documentsMock },
    { ...documentsMock },
    { ...documentsMock },
    deleteMock,
    updateMock,
  ];
};

interface WrapperProps {
  documents?: DocumentType[];
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
    documentSearchTerm(initialSearchTerm);
    selectedDocumentIds(initialSelectedIds);
    filterToCorpus(null);
    filterToLabelId("");
    filterToLabelsetId("");
    showAddDocsToCorpusModal(false);
    showDeleteDocumentsModal(false);
    showBulkUploadModal(false);
    showUploadNewDocumentsModal(false);
    editingDocument(null);
    viewingDocument(null);

    initialized.current = true;
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      authToken("");
      userObj(null);
      backendUserObj(null);
      documentSearchTerm("");
      selectedDocumentIds([]);
      filterToCorpus(null);
      filterToLabelId("");
      filterToLabelsetId("");
    };
  }, []);

  return <>{children}</>;
};

export const DocumentsTestWrapper: React.FC<WrapperProps> = ({
  documents = [],
  userEmail = "test@example.com",
  isAuthenticated = true,
  loading = false,
  error = false,
  initialSearchTerm = "",
  initialSelectedIds = [],
}) => {
  return (
    <Provider>
      <MemoryRouter initialEntries={["/documents"]}>
        <MockedProvider
          mocks={createMocks(documents, { loading, error })}
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
              <Documents />
            </div>
          </ReactiveVarInitializer>
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
