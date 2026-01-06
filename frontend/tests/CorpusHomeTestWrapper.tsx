import React, { useEffect } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { CorpusHome } from "../src/components/corpuses/CorpusHome";
import { CorpusType } from "../src/types/graphql-api";
import { relayStylePagination } from "@apollo/client/utilities";
import {
  corpusHomeView,
  CorpusHomeViewType,
  tocExpandAll,
} from "../src/graphql/cache";

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
  initialTocExpanded?: boolean;
}

/**
 * Helper component that simulates CentralRouteManager Phase 2 behavior
 * by setting the corpusHomeView and tocExpandAll reactive vars from URL params
 */
const RouteParamInitializer: React.FC<{
  children: React.ReactNode;
  initialHomeView?: CorpusHomeViewType | null;
  initialTocExpanded?: boolean;
}> = ({ children, initialHomeView, initialTocExpanded }) => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Simulate CentralRouteManager Phase 2: parse homeView from URL
    const homeViewParam = searchParams.get("homeView");
    const newHomeView: CorpusHomeViewType | null =
      homeViewParam === "toc" || homeViewParam === "about"
        ? homeViewParam
        : initialHomeView ?? null;
    corpusHomeView(newHomeView);

    // Parse tocExpanded from URL
    const tocExpandedParam = searchParams.get("tocExpanded") === "true";
    tocExpandAll(tocExpandedParam || initialTocExpanded || false);

    // Cleanup on unmount
    return () => {
      corpusHomeView(null);
      tocExpandAll(false);
    };
  }, [searchParams, initialHomeView, initialTocExpanded]);

  return <>{children}</>;
};

export const CorpusHomeTestWrapper: React.FC<Props> = ({
  mocks,
  corpus,
  initialHomeView,
  initialTocExpanded,
}) => {
  // Default stats matching the mock data in CorpusHome.ct.tsx
  const stats = {
    totalDocs: 3,
    totalAnnotations: 5,
    totalAnalyses: 0,
    totalExtracts: 0,
  };

  // Build initial route with homeView and tocExpanded query params if specified
  const params: string[] = [];
  if (initialHomeView) {
    params.push(`homeView=${initialHomeView}`);
  }
  if (initialTocExpanded) {
    params.push("tocExpanded=true");
  }
  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  const initialRoute = `/c/test-user/test-corpus${queryString}`;

  return (
    <Provider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
          <RouteParamInitializer
            initialHomeView={initialHomeView}
            initialTocExpanded={initialTocExpanded}
          >
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
