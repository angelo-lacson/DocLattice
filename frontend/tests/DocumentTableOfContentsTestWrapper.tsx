import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { relayStylePagination } from "@apollo/client/utilities";
import { DocumentTableOfContents } from "../src/components/corpuses/DocumentTableOfContents";
import { GET_DOCUMENT_RELATIONSHIPS } from "../src/graphql/queries";
import { openedCorpus } from "../src/graphql/cache";
import { DOCUMENT_RELATIONSHIP_TOC_LIMIT } from "../src/assets/configurations/constants";

// Test corpus ID
const TEST_CORPUS_ID = "corpus-1";

// Mock corpus for navigation
const mockCorpus = {
  id: TEST_CORPUS_ID,
  slug: "test-corpus",
  creator: { id: "user-1", slug: "test-user" },
};

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
        },
      },
      DocumentRelationshipType: {
        keyFields: ["id"],
      },
    },
  });

interface Props {
  mockType?: "default" | "empty" | "noParentRelationships";
}

export const DocumentTableOfContentsTestWrapper: React.FC<Props> = ({
  mockType = "default",
}) => {
  // Set up the opened corpus for navigation
  React.useEffect(() => {
    openedCorpus(mockCorpus as any);
    return () => {
      openedCorpus(null);
    };
  }, []);

  // Build mocks based on mockType
  const getMocks = (): MockedResponse[] => {
    const baseVariables = {
      corpusId: TEST_CORPUS_ID,
      first: DOCUMENT_RELATIONSHIP_TOC_LIMIT,
    };

    if (mockType === "empty" || mockType === "noParentRelationships") {
      return [
        {
          request: {
            query: GET_DOCUMENT_RELATIONSHIPS,
            variables: baseVariables,
          },
          result: {
            data: {
              documentRelationships: {
                edges:
                  mockType === "noParentRelationships"
                    ? [
                        {
                          node: {
                            id: "rel-other",
                            relationshipType: "NOTES",
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
                      ]
                    : [],
                totalCount: mockType === "noParentRelationships" ? 1 : 0,
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
        },
      ];
    }

    return [
      {
        request: {
          query: GET_DOCUMENT_RELATIONSHIPS,
          variables: baseVariables,
        },
        result: {
          data: {
            documentRelationships: {
              edges: mockParentRelationships,
              totalCount: mockParentRelationships.length,
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
      },
    ];
  };

  return (
    <Provider>
      <MockedProvider mocks={getMocks()} cache={createTestCache()} addTypename>
        <DocumentTableOfContents corpusId={TEST_CORPUS_ID} maxDepth={4} />
      </MockedProvider>
    </Provider>
  );
};
