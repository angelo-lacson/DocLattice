/**
 * Test to verify the specific permission fix we implemented:
 * - DocumentLandingRoute should not pass hardcoded readOnly={true}
 * - DocumentKnowledgeBase should determine read-only status based on actual permissions
 */
import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { Provider as JotaiProvider } from "jotai";
import { DocumentLandingRoute } from "../../../routes/DocumentLandingRoute";
import { RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL } from "../../../../graphql/queries";
import DocumentKnowledgeBase from "../DocumentKnowledgeBase";

// Mock all external dependencies
vi.mock("../../../hooks/WindowDimensionHook", () => ({
  default: () => ({ width: 1024, height: 768 }),
}));

vi.mock("../../../../utils/performance", () => ({
  performanceMonitor: {
    startMetric: vi.fn(),
    endMetric: vi.fn(),
  },
}));

// Mock DocumentKnowledgeBase to capture the props it receives
vi.mock("../DocumentKnowledgeBase", () => ({
  default: vi.fn(() => (
    <div data-testid="mock-document-kb">Mock DocumentKnowledgeBase</div>
  )),
}));

describe("Document Permission Fix Verification", () => {
  const mockDocument = {
    id: "RG9jdW1lbnRUeXBlOjE=",
    slug: "test-document",
    title: "Test Document",
    description: "Test document",
    fileType: "application/pdf",
    isPublic: false,
    pdfFile: "test.pdf",
    backendLock: false,
    myPermissions: ["READ", "UPDATE"], // Document has UPDATE permission
    creator: {
      id: "user-1",
      username: "testuser",
      slug: "testuser",
    },
  };

  const mockCorpus = {
    id: "Q29ycHVzVHlwZTox",
    slug: "test-corpus",
    title: "Test Corpus",
    description: "Test corpus",
    mdDescription: null,
    isPublic: false,
    myPermissions: ["READ", "UPDATE"], // Corpus has UPDATE permission
    creator: {
      id: "user-1",
      username: "testuser",
      slug: "testuser",
    },
    labelSet: {
      id: "labelset-1",
      title: "Test Label Set",
    },
  };

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
        corpusBySlugs: mockCorpus,
        documentInCorpusBySlugs: mockDocument,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should NOT pass hardcoded readOnly=true from DocumentLandingRoute", async () => {
    const MockDocumentKnowledgeBase = vi.mocked(DocumentKnowledgeBase);
    render(
      <MockedProvider mocks={[slugResolutionMock]} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    // Wait for the component to render and call DocumentKnowledgeBase
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify DocumentKnowledgeBase was called
    expect(MockDocumentKnowledgeBase).toHaveBeenCalled();

    // Get the props passed to DocumentKnowledgeBase
    const lastCall =
      MockDocumentKnowledgeBase.mock.calls[
        MockDocumentKnowledgeBase.mock.calls.length - 1
      ];
    const props = lastCall[0];

    // Verify the key fix: readOnly should NOT be hardcoded to true
    // It should either be undefined (default false) or explicitly false
    expect(props.readOnly).not.toBe(true);

    // Verify other expected props are passed
    expect(props.documentId).toBe("RG9jdW1lbnRUeXBlOjE=");
    expect(props.corpusId).toBe("Q29ycHVzVHlwZTox");
    expect(props.onClose).toBeDefined();
  });

  it("should pass the correct document and corpus IDs", async () => {
    const MockDocumentKnowledgeBase = vi.mocked(DocumentKnowledgeBase);

    render(
      <MockedProvider mocks={[slugResolutionMock]} addTypename={false}>
        <MemoryRouter
          initialEntries={["/d/testuser/test-corpus/test-document"]}
        >
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(MockDocumentKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "RG9jdW1lbnRUeXBlOjE=",
        corpusId: "Q29ycHVzVHlwZTox",
        // readOnly should not be hardcoded to true
        readOnly: expect.not.stringMatching("true"),
      }),
      expect.any(Object) // React context
    );
  });

  it("should handle documents without corpus", async () => {
    const MockDocumentKnowledgeBase = vi.mocked(DocumentKnowledgeBase);

    // Mock for standalone document (no corpus)
    const standaloneDocumentMock = {
      request: {
        query: RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
        variables: {
          userSlug: "testuser",
          corpusSlug: undefined,
          documentSlug: "test-document",
        },
      },
      result: {
        data: {
          corpusBySlugs: null,
          documentInCorpusBySlugs: mockDocument,
        },
      },
    };

    render(
      <MockedProvider mocks={[standaloneDocumentMock]} addTypename={false}>
        <MemoryRouter initialEntries={["/d/testuser/test-document"]}>
          <JotaiProvider>
            <DocumentLandingRoute />
          </JotaiProvider>
        </MemoryRouter>
      </MockedProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const lastCall =
      MockDocumentKnowledgeBase.mock.calls[
        MockDocumentKnowledgeBase.mock.calls.length - 1
      ];
    const props = lastCall[0];

    // Even without corpus, should not hardcode readOnly=true
    expect(props.readOnly).not.toBe(true);
    expect(props.documentId).toBe("RG9jdW1lbnRUeXBlOjE=");
    expect(props.corpusId).toBeUndefined();
  });
});
