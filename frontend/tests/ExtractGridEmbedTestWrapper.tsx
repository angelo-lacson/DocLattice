/**
 * Test wrapper for ExtractGridEmbed.
 *
 * Provides MockedProvider with GraphQL mocks for the GET_EXTRACT_GRID_EMBED
 * query. Supports multiple visual states: loading, error, empty, and populated.
 */
import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "jotai";

import { ExtractGridEmbed } from "../src/components/extracts/ExtractGridEmbed";
import { GET_EXTRACT_GRID_EMBED } from "../src/graphql/queries";

const TEST_EXTRACT_ID = "RXh0cmFjdFR5cGU6MQ==";

/** Mock: populated extract with 2 documents and 2 columns */
const populatedExtractMock: MockedResponse = {
  request: {
    query: GET_EXTRACT_GRID_EMBED,
    variables: { extractId: TEST_EXTRACT_ID },
  },
  result: {
    data: {
      extract: {
        id: TEST_EXTRACT_ID,
        name: "Contract Key Terms",
        corpus: {
          id: "Q29ycHVzVHlwZTox",
          slug: "supply-chain-analysis",
          creator: { slug: "test-user" },
        },
        fieldset: {
          id: "fieldset-1",
          fullColumnList: [
            { id: "col-1", name: "Effective Date" },
            { id: "col-2", name: "Governing Law" },
          ],
        },
        fullDatacellList: [
          {
            id: "cell-1",
            column: { id: "col-1", name: "Effective Date" },
            document: {
              id: "doc-1",
              title: "Master Services Agreement",
              slug: "master-services-agreement",
              creator: { slug: "test-user" },
            },
            data: "2024-01-15",
            correctedData: null,
            completed: "2024-03-01T12:00:00Z",
            failed: null,
            fullSourceList: [{ id: "src-1", page: 2, rawText: "January 15" }],
          },
          {
            id: "cell-2",
            column: { id: "col-2", name: "Governing Law" },
            document: {
              id: "doc-1",
              title: "Master Services Agreement",
              slug: "master-services-agreement",
              creator: { slug: "test-user" },
            },
            data: "State of Delaware",
            correctedData: null,
            completed: "2024-03-01T12:00:00Z",
            failed: null,
            fullSourceList: [{ id: "src-2", page: 5, rawText: "Delaware" }],
          },
          {
            id: "cell-3",
            column: { id: "col-1", name: "Effective Date" },
            document: {
              id: "doc-2",
              title: "NDA - Acme Corp",
              slug: "nda-acme-corp",
              creator: { slug: "test-user" },
            },
            data: "2023-11-01",
            correctedData: "2023-11-02",
            completed: "2024-03-01T12:00:00Z",
            failed: null,
            fullSourceList: [],
          },
          {
            id: "cell-4",
            column: { id: "col-2", name: "Governing Law" },
            document: {
              id: "doc-2",
              title: "NDA - Acme Corp",
              slug: "nda-acme-corp",
              creator: { slug: "test-user" },
            },
            data: null,
            correctedData: null,
            completed: null,
            failed: "2024-03-01T12:00:00Z",
            fullSourceList: [],
          },
        ],
      },
    },
  },
};

/** Mock: extract exists but has no datacells (empty state) */
const emptyExtractMock: MockedResponse = {
  request: {
    query: GET_EXTRACT_GRID_EMBED,
    variables: { extractId: TEST_EXTRACT_ID },
  },
  result: {
    data: {
      extract: {
        id: TEST_EXTRACT_ID,
        name: "Empty Extract",
        corpus: {
          id: "Q29ycHVzVHlwZTox",
          slug: "supply-chain-analysis",
          creator: { slug: "test-user" },
        },
        fieldset: {
          id: "fieldset-1",
          fullColumnList: [{ id: "col-1", name: "Term" }],
        },
        fullDatacellList: [],
      },
    },
  },
};

/** Mock: extract not found (null result) */
const notFoundExtractMock: MockedResponse = {
  request: {
    query: GET_EXTRACT_GRID_EMBED,
    variables: { extractId: TEST_EXTRACT_ID },
  },
  result: {
    data: {
      extract: null,
    },
  },
};

/** Mock: GraphQL error */
const errorExtractMock: MockedResponse = {
  request: {
    query: GET_EXTRACT_GRID_EMBED,
    variables: { extractId: TEST_EXTRACT_ID },
  },
  error: new Error("Network error"),
};

function createTestCache() {
  return new InMemoryCache({
    typePolicies: {
      ExtractType: { keyFields: ["id"] },
    },
  });
}

export type ExtractGridEmbedState =
  | "populated"
  | "empty"
  | "not-found"
  | "error"
  | "missing-id";

export interface ExtractGridEmbedTestWrapperProps {
  state?: ExtractGridEmbedState;
}

export const ExtractGridEmbedTestWrapper: React.FC<
  ExtractGridEmbedTestWrapperProps
> = ({ state = "populated" }) => {
  const mockMap: Record<
    Exclude<ExtractGridEmbedState, "missing-id">,
    MockedResponse
  > = {
    populated: populatedExtractMock,
    empty: emptyExtractMock,
    "not-found": notFoundExtractMock,
    error: errorExtractMock,
  };

  const extractId = state === "missing-id" ? undefined : TEST_EXTRACT_ID;
  const mocks = state === "missing-id" ? [] : [mockMap[state]];

  return (
    <Provider>
      <MemoryRouter>
        <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
          <div style={{ width: "800px", padding: "16px" }}>
            <ExtractGridEmbed extractId={extractId} />
          </div>
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};

export { TEST_EXTRACT_ID };
