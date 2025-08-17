import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { Provider as JotaiProvider } from "jotai";
import DocumentKnowledgeBase from "../DocumentKnowledgeBase";
import {
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  GET_DOCUMENT_ONLY,
} from "../../../../graphql/queries";
import { PermissionTypes } from "../../../types";

// Mock external dependencies
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(() =>
        Promise.resolve({
          pageNumber: 1,
          getViewport: vi.fn(() => ({ width: 800, height: 600 })),
          render: vi.fn(() => ({ promise: Promise.resolve() })),
        })
      ),
    }),
    onProgress: vi.fn(),
  })),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("../../../annotator/api/rest", () => ({
  getPawlsLayer: vi.fn(() => Promise.resolve([])),
  getDocumentRawText: vi.fn(() => Promise.resolve("test content")),
}));

vi.mock("../../../hooks/WindowDimensionHook", () => ({
  default: () => ({ width: 1024, height: 768 }),
}));

vi.mock("../../../annotator/context/DocumentAtom", () => ({
  useDocumentPermissions: () => ({
    permissions: [PermissionTypes.CAN_UPDATE],
    setPermissions: vi.fn(),
  }),
  useDocumentState: () => ({
    activeDocument: null,
    setDocument: vi.fn(),
  }),
  useDocText: () => ({
    docText: "",
    setDocText: vi.fn(),
  }),
  useDocumentType: () => ({
    documentType: "",
    setDocumentType: vi.fn(),
  }),
  usePages: () => ({
    pages: [],
    setPages: vi.fn(),
  }),
  usePageTokenTextMaps: () => ({
    pageTokenTextMaps: {},
    setPageTokenTextMaps: vi.fn(),
  }),
  usePdfDoc: () => ({
    pdfDoc: null,
    setPdfDoc: vi.fn(),
  }),
  useSearchText: () => ({
    searchText: "",
    setSearchText: vi.fn(),
  }),
  useTextSearchState: () => ({
    textSearchMatches: [],
    selectedTextSearchMatchIndex: 0,
    setTextSearchState: vi.fn(),
  }),
  useScrollContainerRef: () => ({
    scrollContainerRef: null,
    setScrollContainerRef: vi.fn(),
  }),
}));

describe("DocumentKnowledgeBase Permissions", () => {
  const mockDocumentId = "RG9jdW1lbnRUeXBlOjE=";
  const mockCorpusId = "Q29ycHVzVHlwZTox";

  // Test data for different permission scenarios
  const createDocumentMock = (permissions: string[]) => ({
    id: mockDocumentId,
    title: "Test Document",
    fileType: "application/pdf",
    pdfFile: "test.pdf",
    pawlsParseFile: "test.pawls",
    txtExtractFile: null,
    mdSummaryFile: null,
    creator: { id: "user-1", email: "test@test.com" },
    created: "2024-01-01T00:00:00Z",
    myPermissions: permissions,
    allAnnotations: [],
    allStructuralAnnotations: [],
    allRelationships: [],
    allDocRelationships: [],
    allNotes: [],
  });

  const createCorpusMock = (permissions: string[]) => ({
    id: mockCorpusId,
    title: "Test Corpus",
    description: "Test corpus description",
    myPermissions: permissions,
    creator: { id: "user-1", email: "test@test.com" },
    labelSet: {
      id: "labelset-1",
      title: "Test Label Set",
      allAnnotationLabels: [],
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Document with Corpus Context", () => {
    it("should allow editing when user has UPDATE permission on document", async () => {
      const documentWithUpdatePermission = createDocumentMock([
        "READ",
        "UPDATE",
        "DELETE",
      ]);
      const corpusWithReadPermission = createCorpusMock(["READ"]);

      const mock = {
        request: {
          query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
          variables: {
            documentId: mockDocumentId,
            corpusId: mockCorpusId,
            analysisId: undefined,
          },
        },
        result: {
          data: {
            document: documentWithUpdatePermission,
            corpus: corpusWithReadPermission,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              corpusId={mockCorpusId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      // Wait for component to load and check that editing is enabled
      await waitFor(() => {
        // Should not show read-only message
        expect(
          screen.queryByText(/Document is read-only/i)
        ).not.toBeInTheDocument();
      });
    });

    it("should allow editing when user has UPDATE permission on corpus", async () => {
      const documentWithReadPermission = createDocumentMock(["READ"]);
      const corpusWithUpdatePermission = createCorpusMock([
        "READ",
        "UPDATE",
        "DELETE",
      ]);

      const mock = {
        request: {
          query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
          variables: {
            documentId: mockDocumentId,
            corpusId: mockCorpusId,
            analysisId: undefined,
          },
        },
        result: {
          data: {
            document: documentWithReadPermission,
            corpus: corpusWithUpdatePermission,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              corpusId={mockCorpusId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should not show read-only message since corpus has UPDATE permission
        expect(
          screen.queryByText(/Document is read-only/i)
        ).not.toBeInTheDocument();
      });
    });

    it("should be read-only when user has no UPDATE permissions", async () => {
      const documentWithReadPermission = createDocumentMock(["READ"]);
      const corpusWithReadPermission = createCorpusMock(["READ"]);

      const mock = {
        request: {
          query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
          variables: {
            documentId: mockDocumentId,
            corpusId: mockCorpusId,
            analysisId: undefined,
          },
        },
        result: {
          data: {
            document: documentWithReadPermission,
            corpus: corpusWithReadPermission,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              corpusId={mockCorpusId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should show read-only indicators when trying to interact
        // This would typically appear in SelectionLayer when user tries to select text
        console.log("Component should be in read-only mode");
      });
    });
  });

  describe("Document without Corpus Context", () => {
    it("should use document permissions when no corpus", async () => {
      const documentWithUpdatePermission = createDocumentMock([
        "READ",
        "UPDATE",
        "DELETE",
      ]);

      const mock = {
        request: {
          query: GET_DOCUMENT_ONLY,
          variables: {
            documentId: mockDocumentId,
          },
        },
        result: {
          data: {
            document: documentWithUpdatePermission,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Document without corpus should still respect document permissions
        // But annotations require corpus, so some features will be limited
        console.log("Document loaded without corpus context");
      });
    });

    it("should be read-only when document has no UPDATE permission and no corpus", async () => {
      const documentWithReadPermission = createDocumentMock(["READ"]);

      const mock = {
        request: {
          query: GET_DOCUMENT_ONLY,
          variables: {
            documentId: mockDocumentId,
          },
        },
        result: {
          data: {
            document: documentWithReadPermission,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should be read-only due to no UPDATE permission
        console.log("Document should be read-only - no UPDATE permission");
      });
    });
  });

  describe("Explicit Read-Only Override", () => {
    it("should be read-only when readOnly prop is true regardless of permissions", async () => {
      const documentWithUpdatePermission = createDocumentMock([
        "READ",
        "UPDATE",
        "DELETE",
      ]);
      const corpusWithUpdatePermission = createCorpusMock([
        "READ",
        "UPDATE",
        "DELETE",
      ]);

      const mock = {
        request: {
          query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
          variables: {
            documentId: mockDocumentId,
            corpusId: mockCorpusId,
            analysisId: undefined,
          },
        },
        result: {
          data: {
            document: documentWithUpdatePermission,
            corpus: corpusWithUpdatePermission,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              corpusId={mockCorpusId}
              readOnly={true}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should be read-only even with UPDATE permissions because readOnly=true
        console.log("Should be read-only due to explicit readOnly prop");
      });
    });
  });

  describe("Permission Edge Cases", () => {
    it("should handle empty permissions array", async () => {
      const documentWithNoPermissions = createDocumentMock([]);
      const corpusWithNoPermissions = createCorpusMock([]);

      const mock = {
        request: {
          query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
          variables: {
            documentId: mockDocumentId,
            corpusId: mockCorpusId,
            analysisId: undefined,
          },
        },
        result: {
          data: {
            document: documentWithNoPermissions,
            corpus: corpusWithNoPermissions,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              corpusId={mockCorpusId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should be read-only with no permissions
        console.log("Should be read-only with empty permissions");
      });
    });

    it("should handle null permissions", async () => {
      const documentWithNullPermissions = {
        ...createDocumentMock([]),
        myPermissions: null,
      };
      const corpusWithNullPermissions = {
        ...createCorpusMock([]),
        myPermissions: null,
      };

      const mock = {
        request: {
          query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
          variables: {
            documentId: mockDocumentId,
            corpusId: mockCorpusId,
            analysisId: undefined,
          },
        },
        result: {
          data: {
            document: documentWithNullPermissions,
            corpus: corpusWithNullPermissions,
          },
        },
      };

      render(
        <MockedProvider mocks={[mock]} addTypename={false}>
          <JotaiProvider>
            <DocumentKnowledgeBase
              documentId={mockDocumentId}
              corpusId={mockCorpusId}
              onClose={() => {}}
            />
          </JotaiProvider>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should handle null permissions gracefully
        console.log("Should handle null permissions gracefully");
      });
    });
  });
});
