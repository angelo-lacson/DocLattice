/**
 * Test wrapper for CamlArticleEditor.
 *
 * Provides MockedProvider with GraphQL mocks for the article query
 * and upload mutation. Wraps in MemoryRouter and Jotai Provider.
 */
import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "jotai";

import { CamlArticleEditor } from "../src/components/corpuses/CamlArticleEditor";
import { GET_CORPUS_ARTICLE } from "../src/graphql/queries";

const SAMPLE_CAML_CONTENT = `---
version: "1.0"

hero:
  title:
    - "Test Article"
---

::: chapter {#intro}
## Hello World

This is a test article.
:::
`;

/** Mock: no existing article (new article flow) */
const noArticleMock: MockedResponse = {
  request: {
    query: GET_CORPUS_ARTICLE,
    variables: { corpusId: "test-corpus-1", title: "Readme.CAML" },
  },
  result: {
    data: {
      documents: {
        edges: [],
        __typename: "DocumentTypeConnection",
      },
    },
  },
};

/** Mock: existing article */
const existingArticleMock: MockedResponse = {
  request: {
    query: GET_CORPUS_ARTICLE,
    variables: { corpusId: "test-corpus-1", title: "Readme.CAML" },
  },
  result: {
    data: {
      documents: {
        edges: [
          {
            node: {
              id: "doc-article-1",
              title: "Readme.CAML",
              txtExtractFile: null, // Will be overridden by route mock
              modified: "2024-01-15T12:00:00Z",
              creator: {
                email: "test@example.com",
                __typename: "UserType",
              },
              __typename: "DocumentType",
            },
            __typename: "DocumentTypeEdge",
          },
        ],
        __typename: "DocumentTypeConnection",
      },
    },
  },
};

function createTestCache() {
  return new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          documents: relayStylePagination(["inCorpusWithId", "title"]),
        },
      },
      DocumentType: { keyFields: ["id"] },
    },
  });
}

export interface CamlArticleEditorTestWrapperProps {
  hasExistingArticle?: boolean;
  isOpen?: boolean;
  extraMocks?: MockedResponse[];
}

export const CamlArticleEditorTestWrapper: React.FC<
  CamlArticleEditorTestWrapperProps
> = ({ hasExistingArticle = false, isOpen = true, extraMocks = [] }) => {
  const baseMock = hasExistingArticle ? existingArticleMock : noArticleMock;
  // Duplicate the mock for refetch
  const allMocks = [baseMock, baseMock, ...extraMocks];

  return (
    <Provider>
      <MemoryRouter>
        <MockedProvider mocks={allMocks} cache={createTestCache()} addTypename>
          <CamlArticleEditor
            corpusId="test-corpus-1"
            isOpen={isOpen}
            onClose={() => {}}
            onUpdate={() => {}}
          />
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};

export { SAMPLE_CAML_CONTENT };
