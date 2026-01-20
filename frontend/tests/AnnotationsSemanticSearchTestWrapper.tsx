/**
 * Test wrapper for Annotations semantic search component tests.
 *
 * Provides:
 * - MockedProvider with configurable GraphQL responses
 * - Proper cache configuration
 * - React Router context
 * - Authentication state setup
 */
import React, { useEffect } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { GraphQLError } from "graphql";
import { Annotations } from "../src/views/Annotations";
import {
  GET_ANNOTATIONS,
  SEMANTIC_SEARCH_ANNOTATIONS,
  GET_CORPUS_LABELSET_AND_LABELS,
} from "../src/graphql/queries";
import { createTestCache } from "./testUtils";
import {
  authStatusVar,
  authToken,
  userObj,
  filterToCorpus,
  filterToLabelsetId,
  filterToLabelId,
  openedCorpus,
  filterToStructuralAnnotations,
  selectedAnnotationIds,
} from "../src/graphql/cache";

interface SemanticSearchResult {
  annotation: any;
  similarityScore: number;
  document: any;
  corpus: any;
}

interface AnnotationsSemanticSearchTestWrapperProps {
  /** Results to return for semantic search queries */
  semanticSearchResults?: SemanticSearchResult[];
  /** Annotations to return for browse mode (GET_ANNOTATIONS) */
  browseAnnotations?: any[];
  /** Simulate a search error with this message */
  simulateSearchError?: string;
  /** Simulate delay in search response (ms) */
  simulateSearchDelay?: number;
  /** Optional corpus ID for filtering */
  corpusId?: string;
}

/**
 * Inner component that handles reactive var setup.
 */
const InnerWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  useEffect(() => {
    // Initialize authentication state
    authStatusVar("AUTHENTICATED");
    authToken("test-token");
    userObj({
      id: "VXNlclR5cGU6MQ==",
      email: "test@example.com",
      username: "testuser",
    });

    // Initialize filter state
    filterToCorpus(null);
    filterToLabelsetId("");
    filterToLabelId("");
    openedCorpus(null);
    filterToStructuralAnnotations("INCLUDE");
    selectedAnnotationIds([]);

    // Cleanup
    return () => {
      filterToCorpus(null);
      filterToLabelsetId("");
      filterToLabelId("");
      openedCorpus(null);
      filterToStructuralAnnotations("INCLUDE");
      selectedAnnotationIds([]);
    };
  }, []);

  return <>{children}</>;
};

/**
 * Creates semantic search mocks that match any query variables.
 * We need to create multiple mocks since each mock can only be used once.
 */
const createSemanticSearchMock = (
  semanticSearchResults: SemanticSearchResult[],
  simulateSearchError?: string,
  simulateSearchDelay: number = 0
): MockedResponse => ({
  request: {
    query: SEMANTIC_SEARCH_ANNOTATIONS,
  },
  variableMatcher: () => true,
  delay: simulateSearchDelay,
  result: simulateSearchError
    ? {
        errors: [new GraphQLError(simulateSearchError)],
      }
    : {
        data: {
          semanticSearch: semanticSearchResults,
        },
      },
});

/**
 * Creates browse mode mocks for GET_ANNOTATIONS query.
 */
const createBrowseMock = (browseAnnotations: any[]): MockedResponse => ({
  request: {
    query: GET_ANNOTATIONS,
    variables: {
      label_Type: "TEXT_LABEL",
    },
  },
  result: {
    data: {
      annotations: {
        totalCount: browseAnnotations.length,
        edges: browseAnnotations.map((annotation) => ({
          node: annotation,
          cursor: annotation.id,
        })),
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: browseAnnotations[0]?.id || null,
          endCursor:
            browseAnnotations[browseAnnotations.length - 1]?.id || null,
        },
      },
    },
  },
});

/**
 * Test wrapper for Annotations component with semantic search mocks.
 */
export const AnnotationsSemanticSearchTestWrapper: React.FC<
  AnnotationsSemanticSearchTestWrapperProps
> = ({
  semanticSearchResults = [],
  browseAnnotations = [],
  simulateSearchError,
  simulateSearchDelay = 0,
}) => {
  // Create mocks array - each mock can only be consumed once
  const mocks: MockedResponse[] = [
    // Browse mode queries (multiple for refetches)
    createBrowseMock(browseAnnotations),
    createBrowseMock(browseAnnotations),
    createBrowseMock(browseAnnotations),
    createBrowseMock(browseAnnotations),

    // Semantic search queries (multiple for repeat searches)
    createSemanticSearchMock(
      semanticSearchResults,
      simulateSearchError,
      simulateSearchDelay
    ),
    createSemanticSearchMock(
      semanticSearchResults,
      simulateSearchError,
      simulateSearchDelay
    ),
    createSemanticSearchMock(
      semanticSearchResults,
      simulateSearchError,
      simulateSearchDelay
    ),
    createSemanticSearchMock(
      semanticSearchResults,
      simulateSearchError,
      simulateSearchDelay
    ),
    createSemanticSearchMock(
      semanticSearchResults,
      simulateSearchError,
      simulateSearchDelay
    ),

    // Corpus labelset query (skipped when no corpus selected)
    {
      request: {
        query: GET_CORPUS_LABELSET_AND_LABELS,
        variables: {
          corpusId: "",
        },
      },
      result: {
        data: {
          corpus: null,
        },
      },
    },
  ];

  const cache = createTestCache();

  return (
    <MockedProvider mocks={mocks} addTypename={false} cache={cache}>
      <MemoryRouter initialEntries={["/annotations"]}>
        <InnerWrapper>
          <Annotations />
        </InnerWrapper>
      </MemoryRouter>
    </MockedProvider>
  );
};
