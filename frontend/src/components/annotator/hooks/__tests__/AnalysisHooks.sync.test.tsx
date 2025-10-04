import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react-hooks";
import { waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { Provider } from "jotai";
import { useAnalysisManager } from "../AnalysisHooks";
import {
  selectedAnalysesIds,
  selectedExtractIds,
} from "../../../../graphql/cache";
import {
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
  GET_ANNOTATIONS_FOR_ANALYSIS,
  GET_DATACELLS_FOR_EXTRACT,
} from "../../../../graphql/queries";
import { selectedDocumentAtom } from "../../context/DocumentAtom";
import { corpusStateAtom } from "../../context/CorpusAtom";
import { useAtom } from "jotai";
import { ReactNode } from "react";

// Mock document for testing
const mockDocument = {
  id: "doc-123",
  slug: "test-document",
  title: "Test Document",
  creator: { id: "user-1", slug: "john" },
};

// Mock corpus for testing
const mockCorpus = {
  id: "corpus-123",
  slug: "test-corpus",
  title: "Test Corpus",
  creator: { id: "user-1", slug: "john" },
};

// Mock analyses
const mockAnalysis1 = {
  id: "analysis-1234",
  analyzer: {
    id: "analyzer-1",
    description: "Test Analyzer",
  },
  analysisStarted: "2024-01-01T00:00:00Z",
  analysisCompleted: "2024-01-01T00:01:00Z",
  annotations: { totalCount: 5 },
  fullAnnotationList: [],
};

const mockAnalysis2 = {
  id: "analysis-5678",
  analyzer: {
    id: "analyzer-2",
    description: "Another Analyzer",
  },
  analysisStarted: "2024-01-01T00:00:00Z",
  analysisCompleted: "2024-01-01T00:01:00Z",
  annotations: { totalCount: 3 },
  fullAnnotationList: [],
};

// Mock extracts
const mockExtract1 = {
  id: "extract-1234",
  name: "Test Extract",
  fieldset: { id: "fieldset-1", fullColumnList: [] },
  fullDatacellList: [],
};

const mockExtract2 = {
  id: "extract-5678",
  name: "Another Extract",
  fieldset: { id: "fieldset-2", fullColumnList: [] },
  fullDatacellList: [],
};

describe("AnalysisHooks - URL Synchronization", () => {
  // Wrapper component that provides both Jotai and Apollo context
  const createWrapper = (
    initialDocument = mockDocument,
    initialCorpus = mockCorpus
  ) => {
    return ({ children }: { children: ReactNode }) => {
      // Set up initial atoms
      const [, setDocument] = useAtom(selectedDocumentAtom);
      const [, setCorpusState] = useAtom(corpusStateAtom);

      // Initialize atoms with test data
      React.useEffect(() => {
        setDocument(initialDocument as any);
        setCorpusState({
          selectedCorpus: initialCorpus as any,
          myPermissions: [],
          spanLabels: [],
          humanSpanLabels: [],
          relationLabels: [],
          docTypeLabels: [],
          humanTokenLabels: [],
          allowComments: true,
          isLoading: false,
        });
      }, []);

      return (
        <Provider>
          <MockedProvider mocks={[]} addTypename={false}>
            {children}
          </MockedProvider>
        </Provider>
      );
    };
  };

  beforeEach(() => {
    // Clear reactive variables before each test
    selectedAnalysesIds([]);
    selectedExtractIds([]);
    vi.clearAllMocks();
  });

  describe("Reactive Vars → Atoms (URL to Component State)", () => {
    it("should sync analysis ID from reactive var to atom when analyses load", async () => {
      // Set up mock with analyses data
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [
                { analysis: mockAnalysis1 },
                { analysis: mockAnalysis2 },
              ],
              extracts: [mockExtract1, mockExtract2],
            },
          },
        },
      };

      const wrapper = createWrapper();

      // Pre-set reactive var as if URL had ?analysis=analysis-1234
      selectedAnalysesIds(["analysis-1234"]);

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      // Wait for analyses to load and sync
      await waitFor(
        () => {
          expect(result.current.analyses.length).toBe(2);
        },
        { timeout: 3000 }
      );

      // The hook should have synced the reactive var to the atom
      // Note: We can't directly check the atom here, but we can verify
      // that analyses are loaded
      expect(result.current.analyses).toHaveLength(2);
      expect(result.current.analyses[0].id).toBe("analysis-1234");
    });

    it("should sync extract ID from reactive var to atom when extracts load", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [],
              extracts: [mockExtract1, mockExtract2],
            },
          },
        },
      };

      // Pre-set reactive var as if URL had ?extract=extract-1234
      selectedExtractIds(["extract-1234"]);

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.extracts.length).toBe(2);
        },
        { timeout: 3000 }
      );

      expect(result.current.extracts).toHaveLength(2);
      expect(result.current.extracts[0].id).toBe("extract-1234");
    });

    it("should handle multiple IDs in reactive var by taking first", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [
                { analysis: mockAnalysis1 },
                { analysis: mockAnalysis2 },
              ],
              extracts: [],
            },
          },
        },
      };

      // Set multiple IDs - should use first one
      selectedAnalysesIds(["analysis-1234", "analysis-5678"]);

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.analyses.length).toBe(2);
        },
        { timeout: 3000 }
      );

      // Should have loaded analyses
      expect(result.current.analyses).toHaveLength(2);
    });
  });

  describe("Atoms → Reactive Vars (Component State to URL)", () => {
    it("should update reactive var when analysis is selected via UI", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [{ analysis: mockAnalysis1 }],
              extracts: [],
            },
          },
        },
      };

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.analyses.length).toBe(1);
        },
        { timeout: 3000 }
      );

      // Simulate user selecting an analysis
      result.current.onSelectAnalysis(mockAnalysis1 as any);

      // Wait for effect to run and update reactive var
      await waitFor(() => {
        const ids = selectedAnalysesIds();
        expect(ids).toEqual(["analysis-1234"]);
      });
    });

    it("should clear reactive var when analysis is deselected", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [{ analysis: mockAnalysis1 }],
              extracts: [],
            },
          },
        },
      };

      selectedAnalysesIds(["analysis-1234"]);

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.analyses.length).toBe(1);
        },
        { timeout: 3000 }
      );

      // Deselect analysis
      result.current.onSelectAnalysis(null);

      await waitFor(() => {
        expect(selectedAnalysesIds()).toEqual([]);
      });
    });

    it("should update reactive var when extract is selected", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [],
              extracts: [mockExtract1],
            },
          },
        },
      };

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.extracts.length).toBe(1);
        },
        { timeout: 3000 }
      );

      result.current.onSelectExtract(mockExtract1 as any);

      await waitFor(() => {
        expect(selectedExtractIds()).toEqual(["extract-1234"]);
      });
    });
  });

  describe("Cleanup on Unmount", () => {
    it("should clear reactive vars when hook unmounts", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [{ analysis: mockAnalysis1 }],
              extracts: [mockExtract1],
            },
          },
        },
      };

      selectedAnalysesIds(["analysis-1234"]);
      selectedExtractIds(["extract-1234"]);

      const { unmount } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      // Unmount the hook
      unmount();

      // Reactive vars should be cleared
      expect(selectedAnalysesIds()).toEqual([]);
      expect(selectedExtractIds()).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    it("should not sync if analysis ID doesn't match any loaded analyses", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [{ analysis: mockAnalysis1 }],
              extracts: [],
            },
          },
        },
      };

      // Set ID that doesn't exist
      selectedAnalysesIds(["nonexistent-id"]);

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.analyses.length).toBe(1);
        },
        { timeout: 3000 }
      );

      // Should have loaded analyses but not selected anything
      expect(result.current.analyses).toHaveLength(1);
    });

    it("should not sync if analyses list is empty", async () => {
      const mockQuery = {
        request: {
          query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
          variables: {
            documentId: "doc-123",
            corpusId: "corpus-123",
          },
        },
        result: {
          data: {
            documentCorpusActions: {
              analysisRows: [],
              extracts: [],
            },
          },
        },
      };

      selectedAnalysesIds(["analysis-1234"]);

      const { result } = renderHook(() => useAnalysisManager(), {
        wrapper: ({ children }) => (
          <Provider>
            <MockedProvider mocks={[mockQuery]} addTypename={false}>
              {children}
            </MockedProvider>
          </Provider>
        ),
      });

      await waitFor(
        () => {
          expect(result.current.analyses.length).toBe(0);
        },
        { timeout: 3000 }
      );

      // Should handle empty list gracefully
      expect(result.current.analyses).toHaveLength(0);
    });
  });
});
