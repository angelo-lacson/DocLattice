import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { DocumentLandingRoute } from "../../../routes/DocumentLandingRoute";
import {
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
} from "../../../../graphql/queries";
import {
  createPermissionMocks,
  PERMISSION_SCENARIOS,
} from "../../../../../tests/mocks/permissionMocks";

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

// Mock performance monitor
vi.mock("../../../../utils/performance", () => ({
  performanceMonitor: {
    startMetric: vi.fn(),
    endMetric: vi.fn(),
  },
}));

describe("Document Permission Integration Tests", () => {
  const mockDocumentId = "RG9jdW1lbnRUeXBlOjE=";
  const mockCorpusId = "Q29ycHVzVHlwZTox";

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to avoid noise in tests
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  const createRouteTest = (scenario: keyof typeof PERMISSION_SCENARIOS) => {
    const mocks = createPermissionMocks(scenario);

    // Mock for slug resolution (what the route uses)
    const slugResolutionMock = {
      request: {
        query: RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
        variables: {
          userSlug: "testuser",
          corpusSlug: "test-corpus",
          documentSlug: "test-document",
        },
      },
      result: {
        data: {
          corpusBySlugs: {
            id: mockCorpusId,
            slug: "test-corpus",
            title: "Test Corpus",
            description: "Test corpus description",
            mdDescription: null,
            isPublic: false,
            myPermissions: mocks.corpus.myPermissions,
            creator: {
              id: "user-1",
              username: "testuser",
              slug: "testuser",
            },
            labelSet: {
              id: "labelset-1",
              title: "Test Label Set",
            },
          },
          documentInCorpusBySlugs: {
            id: mockDocumentId,
            slug: "test-document",
            title: "Test Document",
            description: "Test document description",
            fileType: "application/pdf",
            isPublic: false,
            pdfFile: "test.pdf",
            backendLock: false,
            myPermissions: mocks.document.myPermissions,
            creator: {
              id: "user-1",
              username: "testuser",
              slug: "testuser",
            },
          },
        },
      },
    };

    // Mock for full document data (what DocumentKnowledgeBase uses)
    const documentDataMock = {
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
          document: mocks.document,
          corpus: mocks.corpus,
        },
      },
    };

    return [slugResolutionMock, documentDataMock];
  };

  it("should allow editing when user has UPDATE permission on document", async () => {
    const mocks = createRouteTest("DOCUMENT_UPDATE_ONLY");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    // Wait for the component to load
    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Check console logs to verify permission flow
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("[DocumentKnowledgeBase] Determining canEdit:")
      );
    });

    // The component should log that it CAN EDIT because document has UPDATE permission
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("→ Result: CAN EDIT")
    );
  });

  it("should allow editing when user has UPDATE permission on corpus", async () => {
    const mocks = createRouteTest("CORPUS_UPDATE_ONLY");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Check that canUpdateCorpus is true and editing is allowed
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("→ Result: CAN EDIT (canUpdateCorpus is true)")
      );
    });
  });

  it("should be read-only when user has no UPDATE permissions", async () => {
    const mocks = createRouteTest("READ_ONLY");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should log that it CANNOT EDIT
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("→ Result: CANNOT EDIT")
      );
    });
  });

  it("should allow editing when user has full permissions", async () => {
    const mocks = createRouteTest("FULL_ACCESS");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should allow editing with full permissions
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("→ Result: CAN EDIT")
      );
    });
  });

  it("should handle empty permissions gracefully", async () => {
    const mocks = createRouteTest("NO_PERMISSIONS");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should be read-only with no permissions
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("→ Result: CANNOT EDIT")
      );
    });
  });

  it("should prioritize corpus permissions over document permissions", async () => {
    // This tests the specific fix we implemented - corpus permissions should be checked first
    const mocks = createRouteTest("CORPUS_UPDATE_ONLY");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should use corpus permissions (canUpdateCorpus) even if document doesn't have UPDATE
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("→ Result: CAN EDIT (canUpdateCorpus is true)")
      );
    });
  });

  it("should pass correct readOnly prop to PDF component", async () => {
    const mocks = createRouteTest("READ_ONLY");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Should log that PDF component received read_only: true
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        "[PDF] Component received read_only prop:",
        true
      );
    });
  });

  it("should not hardcode readOnly=true from route level", async () => {
    // This test verifies our fix - DocumentLandingRoute should not pass readOnly=true
    const mocks = createRouteTest("FULL_ACCESS");

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(
      () => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // DocumentKnowledgeBase should receive readOnly: false (default)
    await waitFor(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("- readOnly prop: false")
      );
    });
  });
});
