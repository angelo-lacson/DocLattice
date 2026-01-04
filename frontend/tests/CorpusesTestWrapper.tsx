import React from "react";
import {
  MockedProvider,
  MockedResponse,
  MockLink,
} from "@apollo/client/testing";
import { InMemoryCache, ApolloLink, Observable } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Corpuses } from "../src/views/Corpuses";
import { relayStylePagination } from "@apollo/client/utilities";
import {
  authStatusVar,
  openedCorpus,
  selectedTab,
  selectedFolderId,
} from "../src/graphql/cache";
import { OperationDefinitionNode } from "graphql";
import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache";
import {
  GET_CORPUSES,
  GET_DOCUMENTS,
  GET_CORPUS_STATS,
} from "../src/graphql/queries";
import { GET_CORPUS_FOLDERS } from "../src/graphql/queries/folders";
import { GET_CORPUS_METADATA_COLUMNS } from "../src/graphql/metadataOperations";
import { CorpusType } from "../src/types/graphql-api";

// Create minimal cache similar to DocumentKnowledgeBaseTestWrapper
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
        },
      },
      CorpusType: { keyFields: ["id"] },
      ServerAnnotationType: {
        fields: {
          userFeedback: mergeArrayByIdFieldPolicy,
        },
      },
    },
  });

/**
 * Minimal URL-to-state sync for tests (mimics CentralRouteManager Phase 2)
 * Only syncs tab and folder params - tests don't render full CentralRouteManager
 */
const UrlToStateSync: React.FC = () => {
  const location = useLocation();

  React.useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");
    const folderParam = searchParams.get("folder");

    // Sync tab param to reactive var
    selectedTab(tabParam);

    // Sync folder param to reactive var
    selectedFolderId(folderParam);
  }, [location.search]);

  return null;
};

// Create wildcard link to respond to common queries regardless of variables
const createWildcardLink = (mocks: ReadonlyArray<MockedResponse>) => {
  // Ordinary single-shot behaviour for most mocks
  const mockLink = new MockLink(mocks);

  // Capture canonical results for frequently-queried items
  // These can be answered regardless of variables and without consuming mocks
  const corpusesResult = mocks.find(
    (m) => m.request.query === GET_CORPUSES
  )?.result;

  // Find the latest (most complete) document result that has documents
  const documentsResults = mocks.filter(
    (m) => m.request.query === GET_DOCUMENTS
  );
  const documentsWithData = documentsResults.find(
    (m) =>
      (m.result as any)?.data?.documents?.edges?.length > 0 ||
      (m.request.variables as any)?.inCorpusWithId
  );
  const documentsResult =
    documentsWithData?.result || documentsResults[0]?.result;

  const foldersResult = mocks.find(
    (m) => m.request.query === GET_CORPUS_FOLDERS
  )?.result;

  const statsResult = mocks.find(
    (m) => m.request.query === GET_CORPUS_STATS
  )?.result;

  // Find metadata columns result with actual columns (not empty)
  const metadataColumnsResults = mocks.filter(
    (m) => m.request.query === GET_CORPUS_METADATA_COLUMNS
  );
  const columnsWithData = metadataColumnsResults.find(
    (m) => (m.result as any)?.data?.corpusMetadataColumns?.length > 0
  );
  // Use columns with data after some requests, otherwise use first mock
  let metadataColumnsCallCount = 0;
  const getMetadataColumnsResult = () => {
    metadataColumnsCallCount++;
    // After 2 calls (initial + refetch), return columns with data
    if (metadataColumnsCallCount > 2 && columnsWithData) {
      return columnsWithData.result;
    }
    return metadataColumnsResults[0]?.result;
  };

  return new ApolloLink((operation) => {
    const isCorpusesQuery =
      operation.operationName === "GetCorpuses" ||
      operation.query === GET_CORPUSES;
    const isDocumentsQuery = operation.query === GET_DOCUMENTS;
    const isFoldersQuery = operation.query === GET_CORPUS_FOLDERS;
    const isStatsQuery = operation.query === GET_CORPUS_STATS;
    const isMetadataColumnsQuery =
      operation.query === GET_CORPUS_METADATA_COLUMNS;

    if (isCorpusesQuery && corpusesResult) {
      console.log("[MOCK] wildcard GetCorpuses", operation.variables);
      return Observable.of(corpusesResult as any);
    }

    if (isDocumentsQuery && documentsResult) {
      console.log("[MOCK] wildcard GetDocuments", operation.variables);
      return Observable.of(documentsResult as any);
    }

    if (isFoldersQuery && foldersResult) {
      console.log("[MOCK] wildcard GetCorpusFolders", operation.variables);
      return Observable.of(foldersResult as any);
    }

    if (isStatsQuery && statsResult) {
      console.log("[MOCK] wildcard GetCorpusStats", operation.variables);
      return Observable.of(statsResult as any);
    }

    if (isMetadataColumnsQuery && metadataColumnsResults.length > 0) {
      const result = getMetadataColumnsResult();
      console.log(
        "[MOCK] wildcard GetCorpusMetadataColumns (call #" +
          metadataColumnsCallCount +
          ")",
        operation.variables
      );
      return Observable.of(result as any);
    }

    // Delegate everything else to MockLink (single-shot semantics)
    return mockLink.request(operation) as any;
  });
};

interface WrapperProps {
  mocks: ReadonlyArray<MockedResponse>;
  initialEntries?: string[];
  initialCorpus?: CorpusType | null;
}

export const CorpusesTestWrapper: React.FC<WrapperProps> = ({
  mocks,
  initialEntries = ["/corpuses"],
  initialCorpus = null,
}) => {
  // Mark authentication as done immediately for tests
  // Component tests set reactive vars directly (pragmatic exception to The ONE PLACE TO RULE THEM ALL)
  React.useEffect(() => {
    authStatusVar("AUTHENTICATED");
  }, []);

  // Ensure the openedCorpus reactive var is initialised **in the browser runtime**
  React.useEffect(() => {
    openedCorpus(initialCorpus);
  }, [initialCorpus]);

  const link = createWildcardLink(mocks);
  return (
    <Provider>
      <MemoryRouter initialEntries={initialEntries}>
        {/* Minimal URL-to-state sync for tab/folder params (mimics CentralRouteManager Phase 2) */}
        <UrlToStateSync />
        <MockedProvider link={link} cache={createTestCache()} addTypename>
          <Corpuses />
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
