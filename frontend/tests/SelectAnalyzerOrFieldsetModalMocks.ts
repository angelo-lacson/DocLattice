/**
 * GraphQL mock fixtures for `SelectAnalyzerOrFieldsetModal` Playwright CT
 * tests.  Mocks live outside the test wrapper so the Playwright CT babel
 * plugin can treat the wrapper file as a pure component module.
 */
import { MockedResponse } from "@apollo/client/testing";
import { GET_ANALYZERS, GET_FIELDSETS } from "../src/graphql/queries";
import type {
  AnalyzerType,
  CorpusType,
  FieldsetType,
} from "../src/types/graphql-api";

// Note: `FieldsetType` is imported only for the `buildFieldsetsMock`
// parameter typing — a `makeFieldset` fixture factory was removed after the
// fieldset tab tests switched to explicit inline fixtures (no consumers
// remaining). Re-add if future tests need a minimal factory.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a minimal AnalyzerType fixture. */
export const makeAnalyzer = (
  overrides: Partial<AnalyzerType> & Pick<AnalyzerType, "id">
): AnalyzerType =>
  ({
    __typename: "AnalyzerType",
    analyzerId: overrides.id,
    description: "",
    hostGremlin: null,
    disabled: false,
    isPublic: false,
    manifest: null,
    inputSchema: null,
    ...overrides,
  } as AnalyzerType);

export const SAMPLE_CORPUS: CorpusType = {
  __typename: "CorpusType",
  id: "corpus-1",
  title: "Sample Corpus",
  description: "A corpus used in tests",
  isPublic: false,
  myPermissions: ["read", "update", "create", "remove", "permission"],
} as CorpusType;

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

export const buildAnalyzersMock = (
  analyzers: AnalyzerType[]
): MockedResponse => ({
  // The component calls `useQuery(GET_ANALYZERS, { skip, fetchPolicy })`
  // without explicit `variables`, so Apollo passes `undefined`. We omit the
  // `variables` key here so MockedProvider's deep-equal matcher does not
  // compare `{}` against `undefined` (which would silently miss).
  request: { query: GET_ANALYZERS },
  result: {
    data: {
      analyzers: {
        __typename: "AnalyzerTypeConnection",
        pageInfo: {
          __typename: "PageInfo",
          hasNextPage: false,
          hasPreviousPage: false,
          endCursor: null,
          startCursor: null,
        },
        edges: analyzers.map((node) => ({
          __typename: "AnalyzerTypeEdge",
          node,
        })),
      },
    },
  },
});

export const buildFieldsetsMock = (
  fieldsets: FieldsetType[],
  searchText = ""
): MockedResponse => ({
  request: { query: GET_FIELDSETS, variables: { searchText } },
  result: {
    data: {
      fieldsets: {
        __typename: "FieldsetTypeConnection",
        pageInfo: {
          __typename: "PageInfo",
          hasNextPage: false,
          hasPreviousPage: false,
          endCursor: null,
          startCursor: null,
        },
        edges: fieldsets.map((node) => ({
          __typename: "FieldsetTypeEdge",
          node,
        })),
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Convenience: build a complete mock set for the modal
// ---------------------------------------------------------------------------

/**
 * Build the standard mock set for tests. GraphQL queries may refetch
 * (cache-and-network), so we provide duplicates.
 */
export const buildMockSet = (
  analyzers: AnalyzerType[],
  fieldsets: FieldsetType[] = []
): MockedResponse[] => {
  const analyzerMock = buildAnalyzersMock(analyzers);
  const fieldsetMock = buildFieldsetsMock(fieldsets);
  return [
    analyzerMock,
    { ...analyzerMock },
    { ...analyzerMock },
    fieldsetMock,
    { ...fieldsetMock },
    { ...fieldsetMock },
  ];
};
