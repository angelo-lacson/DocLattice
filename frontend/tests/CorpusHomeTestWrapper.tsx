import React, { useEffect } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { CorpusHome } from "../src/components/corpuses/CorpusHome";
import { CorpusType } from "../src/types/graphql-api";
import { relayStylePagination } from "@apollo/client/utilities";
import {
  corpusDetailView,
  CorpusDetailViewType,
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
          documents: relayStylePagination(["inCorpusWithId"]),
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
      DocumentType: {
        keyFields: ["id"],
      },
    },
  });

interface Props {
  mocks: ReadonlyArray<MockedResponse>;
  corpus: CorpusType;
  /** Initial view for landing/details switch */
  initialView?: CorpusDetailViewType;
  /** Initial home view for About/TOC switch (within details view) */
  initialHomeView?: CorpusHomeViewType | null;
  initialTocExpanded?: boolean;
}

/**
 * Helper component that simulates CentralRouteManager Phase 2 behavior
 * by setting the reactive vars from URL params
 */
const RouteParamInitializer: React.FC<{
  children: React.ReactNode;
  initialView?: CorpusDetailViewType;
  initialHomeView?: CorpusHomeViewType | null;
  initialTocExpanded?: boolean;
}> = ({ children, initialView, initialHomeView, initialTocExpanded }) => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Simulate CentralRouteManager Phase 2: parse view from URL
    const viewParam = searchParams.get("view");
    const newView: CorpusDetailViewType =
      viewParam === "details" ? "details" : initialView ?? "landing";
    corpusDetailView(newView);

    // Parse homeView from URL (for details view About/TOC tabs)
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
      corpusDetailView("landing");
      corpusHomeView(null);
      tocExpandAll(false);
    };
  }, [searchParams, initialView, initialHomeView, initialTocExpanded]);

  return <>{children}</>;
};

export const CorpusHomeTestWrapper: React.FC<Props> = ({
  mocks,
  corpus,
  initialView,
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

  // Build initial route with query params if specified
  const params: string[] = [];
  if (initialView === "details") {
    params.push("view=details");
  }
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
            initialView={initialView}
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
