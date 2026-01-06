import React, { useEffect } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { CorpusHome } from "../src/components/corpuses/CorpusHome";
import { CorpusType } from "../src/types/graphql-api";
import { relayStylePagination } from "@apollo/client/utilities";
import { corpusHomeView, CorpusHomeViewType } from "../src/graphql/cache";

// Minimal cache matching production cache configuration
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
          documents: relayStylePagination(),
          documentRelationships: relayStylePagination([
            "corpusId",
            "documentId",
          ]),
        },
      },
      CorpusType: {
        keyFields: ["id"],
        fields: {
          // CRITICAL: Handle DocumentTypeConnection properly to prevent infinite loops
          documents: relayStylePagination(),
        },
      },
      DocumentRelationshipType: {
        keyFields: ["id"],
      },
    },
  });

interface Props {
  mocks: ReadonlyArray<MockedResponse>;
  corpus: CorpusType;
  initialHomeView?: CorpusHomeViewType | null;
}

/**
 * Helper component that simulates CentralRouteManager Phase 2 behavior
 * by setting the corpusHomeView reactive var from URL params
 */
const RouteParamInitializer: React.FC<{
  children: React.ReactNode;
  initialHomeView?: CorpusHomeViewType | null;
}> = ({ children, initialHomeView }) => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Simulate CentralRouteManager Phase 2: parse homeView from URL
    const homeViewParam = searchParams.get("homeView");
    const newHomeView: CorpusHomeViewType | null =
      homeViewParam === "toc" || homeViewParam === "about"
        ? homeViewParam
        : initialHomeView ?? null;
    corpusHomeView(newHomeView);

    // Cleanup on unmount
    return () => {
      corpusHomeView(null);
    };
  }, [searchParams, initialHomeView]);

  return <>{children}</>;
};

export const CorpusHomeTestWrapper: React.FC<Props> = ({
  mocks,
  corpus,
  initialHomeView,
}) => {
  // Default stats matching the mock data in CorpusHome.ct.tsx
  const stats = {
    totalDocs: 3,
    totalAnnotations: 5,
    totalAnalyses: 0,
    totalExtracts: 0,
  };

  // Build initial route with homeView query param if specified
  const initialRoute = initialHomeView
    ? `/c/test-user/test-corpus?homeView=${initialHomeView}`
    : "/c/test-user/test-corpus";

  return (
    <Provider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
          <RouteParamInitializer initialHomeView={initialHomeView}>
            <CorpusHome
              corpus={corpus}
              onEditDescription={() => {}}
              stats={stats}
              statsLoading={false}
              chatQuery=""
              onChatQueryChange={() => {}}
              onChatSubmit={() => {}}
              onViewChatHistory={() => {}}
            />
          </RouteParamInitializer>
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
