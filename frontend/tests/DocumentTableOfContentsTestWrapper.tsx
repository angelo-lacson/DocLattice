import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { relayStylePagination } from "@apollo/client/utilities";
import { DocumentTableOfContents } from "../src/components/corpuses/DocumentTableOfContents";
import {
  GET_DOCUMENT_RELATIONSHIPS,
  GET_CORPUS_DOCUMENTS_FOR_TOC,
} from "../src/graphql/queries";
import { openedCorpus, tocExpandAll } from "../src/graphql/cache";
import {
  DOCUMENT_RELATIONSHIP_TOC_LIMIT,
  CORPUS_DOCUMENTS_TOC_LIMIT,
} from "../src/assets/configurations/constants";

// Test corpus ID
const TEST_CORPUS_ID = "corpus-1";

// Mock corpus for navigation
const mockCorpus = {
  id: TEST_CORPUS_ID,
  slug: "test-corpus",
  creator: { id: "user-1", slug: "test-user" },
};

// Mock documents for the corpus (used by GET_CORPUS_DOCUMENTS_FOR_TOC)
const mockCorpusDocuments = [
  {
    node: {
      id: "doc-1",
      title: "Parent Document",
      slug: "parent-document",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-2",
      title: "Child Document 1",
      slug: "child-document-1",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-3",
      title: "Child Document 2",
      slug: "child-document-2",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
];

// Mock relationships for testing
const mockParentRelationships = [
  {
    node: {
      id: "rel-1",
      relationshipType: "RELATIONSHIP",
      data: null,
      sourceDocument: {
        id: "doc-2",
        title: "Child Document 1",
        icon: null,
        slug: "child-document-1",
        creator: { slug: "test-user" },
      },
      targetDocument: {
        id: "doc-1",
        title: "Parent Document",
        icon: null,
        slug: "parent-document",
        creator: { slug: "test-user" },
      },
      annotationLabel: {
        id: "label-1",
        text: "parent",
        color: "#3b82f6",
        icon: null,
      },
      corpus: { id: TEST_CORPUS_ID },
      creator: { id: "user-1", username: "testuser" },
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      myPermissions: ["read"],
      __typename: "DocumentRelationshipType",
    },
    __typename: "DocumentRelationshipTypeEdge",
  },
  {
    node: {
      id: "rel-2",
      relationshipType: "RELATIONSHIP",
      data: null,
      sourceDocument: {
        id: "doc-3",
        title: "Child Document 2",
        icon: null,
        slug: "child-document-2",
        creator: { slug: "test-user" },
      },
      targetDocument: {
        id: "doc-1",
        title: "Parent Document",
        icon: null,
        slug: "parent-document",
        creator: { slug: "test-user" },
      },
      annotationLabel: {
        id: "label-1",
        text: "parent",
        color: "#3b82f6",
        icon: null,
      },
      corpus: { id: TEST_CORPUS_ID },
      creator: { id: "user-1", username: "testuser" },
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      myPermissions: ["read"],
      __typename: "DocumentRelationshipType",
    },
    __typename: "DocumentRelationshipTypeEdge",
  },
];

// Deep hierarchy documents
const mockDeepHierarchyDocuments = [
  {
    node: {
      id: "doc-root",
      title: "Root Document",
      slug: "root-doc",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-level1",
      title: "Level 1 Document",
      slug: "level-1",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-level2",
      title: "Level 2 Document",
      slug: "level-2",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-level3",
      title: "Level 3 Document",
      slug: "level-3",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-level4",
      title: "Level 4 Document",
      slug: "level-4",
      icon: null,
      fileType: "application/pdf",
      creator: { slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
];

// Deep hierarchy relationships (5 levels: Root -> Level1 -> Level2 -> Level3 -> Level4)
const mockDeepHierarchy = [
  // Level1 -> Root
  {
    node: {
      id: "rel-deep-1",
      relationshipType: "RELATIONSHIP",
      data: null,
      sourceDocument: {
        id: "doc-level1",
        title: "Level 1 Document",
        icon: null,
        slug: "level-1",
        creator: { slug: "test-user" },
      },
      targetDocument: {
        id: "doc-root",
        title: "Root Document",
        icon: null,
        slug: "root-doc",
        creator: { slug: "test-user" },
      },
      annotationLabel: {
        id: "label-1",
        text: "parent",
        color: "#3b82f6",
        icon: null,
      },
      corpus: { id: TEST_CORPUS_ID },
      creator: { id: "user-1", username: "testuser" },
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      myPermissions: ["read"],
      __typename: "DocumentRelationshipType",
    },
    __typename: "DocumentRelationshipTypeEdge",
  },
  // Level2 -> Level1
  {
    node: {
      id: "rel-deep-2",
      relationshipType: "RELATIONSHIP",
      data: null,
      sourceDocument: {
        id: "doc-level2",
        title: "Level 2 Document",
        icon: null,
        slug: "level-2",
        creator: { slug: "test-user" },
      },
      targetDocument: {
        id: "doc-level1",
        title: "Level 1 Document",
        icon: null,
        slug: "level-1",
        creator: { slug: "test-user" },
      },
      annotationLabel: {
        id: "label-1",
        text: "parent",
        color: "#3b82f6",
        icon: null,
      },
      corpus: { id: TEST_CORPUS_ID },
      creator: { id: "user-1", username: "testuser" },
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      myPermissions: ["read"],
      __typename: "DocumentRelationshipType",
    },
    __typename: "DocumentRelationshipTypeEdge",
  },
  // Level3 -> Level2
  {
    node: {
      id: "rel-deep-3",
      relationshipType: "RELATIONSHIP",
      data: null,
      sourceDocument: {
        id: "doc-level3",
        title: "Level 3 Document",
        icon: null,
        slug: "level-3",
        creator: { slug: "test-user" },
      },
      targetDocument: {
        id: "doc-level2",
        title: "Level 2 Document",
        icon: null,
        slug: "level-2",
        creator: { slug: "test-user" },
      },
      annotationLabel: {
        id: "label-1",
        text: "parent",
        color: "#3b82f6",
        icon: null,
      },
      corpus: { id: TEST_CORPUS_ID },
      creator: { id: "user-1", username: "testuser" },
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      myPermissions: ["read"],
      __typename: "DocumentRelationshipType",
    },
    __typename: "DocumentRelationshipTypeEdge",
  },
  // Level4 -> Level3
  {
    node: {
      id: "rel-deep-4",
      relationshipType: "RELATIONSHIP",
      data: null,
      sourceDocument: {
        id: "doc-level4",
        title: "Level 4 Document",
        icon: null,
        slug: "level-4",
        creator: { slug: "test-user" },
      },
      targetDocument: {
        id: "doc-level3",
        title: "Level 3 Document",
        icon: null,
        slug: "level-3",
        creator: { slug: "test-user" },
      },
      annotationLabel: {
        id: "label-1",
        text: "parent",
        color: "#3b82f6",
        icon: null,
      },
      corpus: { id: TEST_CORPUS_ID },
      creator: { id: "user-1", username: "testuser" },
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      myPermissions: ["read"],
      __typename: "DocumentRelationshipType",
    },
    __typename: "DocumentRelationshipTypeEdge",
  },
];

// Cache configuration
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          documentRelationships: relayStylePagination([
            "corpusId",
            "documentId",
          ]),
          documents: relayStylePagination(["inCorpusWithId"]),
        },
      },
      DocumentRelationshipType: {
        keyFields: ["id"],
      },
      DocumentType: {
        keyFields: ["id"],
      },
    },
  });

interface Props {
  mockType?: "default" | "empty" | "noParentRelationships" | "deepHierarchy";
  maxDepth?: number;
}

export const DocumentTableOfContentsTestWrapper: React.FC<Props> = ({
  mockType = "default",
  maxDepth = 4,
}) => {
  // Set up the opened corpus for navigation and reset tocExpandAll
  React.useEffect(() => {
    openedCorpus(mockCorpus as any);
    tocExpandAll(false); // Ensure clean state for tests
    return () => {
      openedCorpus(null);
      tocExpandAll(false);
    };
  }, []);

  // Build mocks based on mockType
  const getMocks = (): MockedResponse[] => {
    const relationshipsVariables = {
      corpusId: TEST_CORPUS_ID,
      first: DOCUMENT_RELATIONSHIP_TOC_LIMIT,
    };

    const documentsVariables = {
      corpusId: TEST_CORPUS_ID,
      first: CORPUS_DOCUMENTS_TOC_LIMIT,
    };

    // Helper to create documents mock
    const createDocumentsMock = (docs: typeof mockCorpusDocuments) => ({
      request: {
        query: GET_CORPUS_DOCUMENTS_FOR_TOC,
        variables: documentsVariables,
      },
      result: {
        data: {
          documents: {
            edges: docs,
            totalCount: docs.length,
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: null,
              endCursor: null,
            },
            __typename: "DocumentTypeConnection",
          },
        },
      },
    });

    if (mockType === "empty") {
      // Empty corpus - no documents
      const emptyRelationshipsMock = {
        request: {
          query: GET_DOCUMENT_RELATIONSHIPS,
          variables: relationshipsVariables,
        },
        result: {
          data: {
            documentRelationships: {
              edges: [],
              totalCount: 0,
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              __typename: "DocumentRelationshipTypeConnection",
            },
          },
        },
      };
      const emptyDocumentsMock = createDocumentsMock([]);
      return [
        emptyRelationshipsMock,
        { ...emptyRelationshipsMock },
        emptyDocumentsMock,
        { ...emptyDocumentsMock },
      ];
    }

    if (mockType === "noParentRelationships") {
      // Documents exist but no parent relationships - shows docs as standalone root items
      const noParentRelsMock = {
        request: {
          query: GET_DOCUMENT_RELATIONSHIPS,
          variables: relationshipsVariables,
        },
        result: {
          data: {
            documentRelationships: {
              edges: [
                {
                  node: {
                    id: "rel-other",
                    relationshipType: "NOTES", // Not a parent relationship
                    data: null,
                    sourceDocument: {
                      id: "doc-a",
                      title: "Doc A",
                      icon: null,
                      slug: "doc-a",
                      creator: { slug: "test-user" },
                    },
                    targetDocument: {
                      id: "doc-b",
                      title: "Doc B",
                      icon: null,
                      slug: "doc-b",
                      creator: { slug: "test-user" },
                    },
                    annotationLabel: null,
                    corpus: { id: TEST_CORPUS_ID },
                    creator: { id: "user-1", username: "testuser" },
                    created: "2025-01-01T00:00:00Z",
                    modified: "2025-01-01T00:00:00Z",
                    myPermissions: ["read"],
                    __typename: "DocumentRelationshipType",
                  },
                  __typename: "DocumentRelationshipTypeEdge",
                },
              ],
              totalCount: 1,
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              __typename: "DocumentRelationshipTypeConnection",
            },
          },
        },
      };
      // Documents for noParentRelationships - these will show as standalone root items
      const standaloneDocsMock = createDocumentsMock([
        {
          node: {
            id: "doc-a",
            title: "Doc A",
            slug: "doc-a",
            icon: null,
            fileType: "application/pdf",
            creator: { slug: "test-user" },
            __typename: "DocumentType",
          },
          __typename: "DocumentTypeEdge",
        },
        {
          node: {
            id: "doc-b",
            title: "Doc B",
            slug: "doc-b",
            icon: null,
            fileType: "application/pdf",
            creator: { slug: "test-user" },
            __typename: "DocumentType",
          },
          __typename: "DocumentTypeEdge",
        },
      ]);
      return [
        noParentRelsMock,
        { ...noParentRelsMock },
        standaloneDocsMock,
        { ...standaloneDocsMock },
      ];
    }

    // Select appropriate mock data for relationships and documents
    const relationshipsMockData =
      mockType === "deepHierarchy"
        ? mockDeepHierarchy
        : mockParentRelationships;

    const documentsMockData =
      mockType === "deepHierarchy"
        ? mockDeepHierarchyDocuments
        : mockCorpusDocuments;

    // Return duplicate mocks for cache-and-network fetch policy
    const relationshipsMock = {
      request: {
        query: GET_DOCUMENT_RELATIONSHIPS,
        variables: relationshipsVariables,
      },
      result: {
        data: {
          documentRelationships: {
            edges: relationshipsMockData,
            totalCount: relationshipsMockData.length,
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: null,
              endCursor: null,
            },
            __typename: "DocumentRelationshipTypeConnection",
          },
        },
      },
    };

    const documentsMock = createDocumentsMock(documentsMockData);

    return [
      relationshipsMock,
      { ...relationshipsMock },
      documentsMock,
      { ...documentsMock },
    ];
  };

  return (
    <Provider>
      <MemoryRouter>
        <MockedProvider
          mocks={getMocks()}
          cache={createTestCache()}
          addTypename
        >
          <DocumentTableOfContents
            corpusId={TEST_CORPUS_ID}
            maxDepth={maxDepth}
          />
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
