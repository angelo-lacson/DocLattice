/**
 * Comprehensive tests for CentralRouteManager
 * Tests all 4 phases of the routing system:
 * 1. URL Path → Entity Resolution
 * 2. URL Query Params → Reactive Vars
 * 3. Entity Data → Canonical Redirects
 * 4. Reactive Vars → URL Sync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { CentralRouteManager } from "../CentralRouteManager";
import {
  openedCorpus,
  openedDocument,
  selectedAnnotationIds,
  selectedAnalysesIds,
  selectedExtractIds,
  routeLoading,
  routeError,
} from "../../graphql/cache";
import {
  RESOLVE_CORPUS_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
} from "../../graphql/queries";

// Mock navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("CentralRouteManager", () => {
  beforeEach(() => {
    // Clear all reactive vars
    openedCorpus(null);
    openedDocument(null);
    selectedAnnotationIds([]);
    selectedAnalysesIds([]);
    selectedExtractIds([]);
    routeLoading(false);
    routeError(null);

    // Clear mocks
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Phase 1: URL Path → Entity Resolution", () => {
    describe("Corpus Routes", () => {
      it("should resolve corpus from slug-based URL", async () => {
        const mockCorpus = {
          id: "corpus-123",
          slug: "my-corpus",
          title: "My Corpus",
          creator: { id: "user-1", slug: "john" },
        };

        const mocks = [
          {
            request: {
              query: RESOLVE_CORPUS_BY_SLUGS_FULL,
              variables: {
                userSlug: "john",
                corpusSlug: "my-corpus",
              },
            },
            result: {
              data: {
                corpusBySlugs: mockCorpus,
              },
            },
          },
        ];

        render(
          <MockedProvider mocks={mocks} addTypename={false}>
            <MemoryRouter initialEntries={["/c/john/my-corpus"]}>
              <CentralRouteManager />
            </MemoryRouter>
          </MockedProvider>
        );

        // Should set loading state initially
        expect(routeLoading()).toBe(true);

        // Wait for resolution
        await waitFor(() => {
          expect(routeLoading()).toBe(false);
        });

        // Should set corpus in reactive var
        expect(openedCorpus()).toEqual(mockCorpus);
        expect(openedDocument()).toBeNull();
      });

      it("should navigate to 404 when corpus not found", async () => {
        const mocks = [
          {
            request: {
              query: RESOLVE_CORPUS_BY_SLUGS_FULL,
              variables: {
                userSlug: "john",
                corpusSlug: "non-existent",
              },
            },
            result: {
              data: {
                corpusBySlugs: null,
              },
            },
          },
        ];

        render(
          <MockedProvider mocks={mocks} addTypename={false}>
            <MemoryRouter initialEntries={["/c/john/non-existent"]}>
              <CentralRouteManager />
            </MemoryRouter>
          </MockedProvider>
        );

        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith("/404", { replace: true });
        });
      });
    });

    describe("Document Routes", () => {
      it("should resolve standalone document", async () => {
        const mockDocument = {
          id: "doc-123",
          slug: "my-document",
          title: "My Document",
          creator: { id: "user-1", slug: "john" },
        };

        const mocks = [
          {
            request: {
              query: RESOLVE_DOCUMENT_BY_SLUGS_FULL,
              variables: {
                userSlug: "john",
                documentSlug: "my-document",
              },
            },
            result: {
              data: {
                documentBySlugs: mockDocument,
              },
            },
          },
        ];

        render(
          <MockedProvider mocks={mocks} addTypename={false}>
            <MemoryRouter initialEntries={["/d/john/my-document"]}>
              <CentralRouteManager />
            </MemoryRouter>
          </MockedProvider>
        );

        await waitFor(() => {
          expect(routeLoading()).toBe(false);
        });

        expect(openedDocument()).toEqual(mockDocument);
        expect(openedCorpus()).toBeNull();
      });

      it("should resolve document in corpus", async () => {
        const mockCorpus = {
          id: "corpus-123",
          slug: "my-corpus",
          title: "My Corpus",
          creator: { id: "user-1", slug: "john" },
        };

        const mockDocument = {
          id: "doc-123",
          slug: "my-document",
          title: "My Document",
          creator: { id: "user-1", slug: "john" },
        };

        const mocks = [
          {
            request: {
              query: RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
              variables: {
                userSlug: "john",
                corpusSlug: "my-corpus",
                documentSlug: "my-document",
              },
            },
            result: {
              data: {
                corpusBySlugs: mockCorpus,
                documentInCorpusBySlugs: mockDocument,
              },
            },
          },
        ];

        render(
          <MockedProvider mocks={mocks} addTypename={false}>
            <MemoryRouter initialEntries={["/d/john/my-corpus/my-document"]}>
              <CentralRouteManager />
            </MemoryRouter>
          </MockedProvider>
        );

        await waitFor(() => {
          expect(routeLoading()).toBe(false);
        });

        expect(openedCorpus()).toEqual(mockCorpus);
        expect(openedDocument()).toEqual(mockDocument);
      });
    });

    describe("Browse Routes", () => {
      it("should not fetch entities for browse routes", () => {
        render(
          <MockedProvider mocks={[]} addTypename={false}>
            <MemoryRouter initialEntries={["/annotations"]}>
              <CentralRouteManager />
            </MemoryRouter>
          </MockedProvider>
        );

        expect(routeLoading()).toBe(false);
        expect(openedCorpus()).toBeNull();
        expect(openedDocument()).toBeNull();
      });

      it("should not fetch for corpuses list view", () => {
        render(
          <MockedProvider mocks={[]} addTypename={false}>
            <MemoryRouter initialEntries={["/corpuses"]}>
              <CentralRouteManager />
            </MemoryRouter>
          </MockedProvider>
        );

        expect(routeLoading()).toBe(false);
      });
    });
  });

  describe("Phase 2: URL Query Params → Reactive Vars", () => {
    it("should parse annotation IDs from URL", () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/annotations?ann=123,456"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      expect(selectedAnnotationIds()).toEqual(["123", "456"]);
    });

    it("should parse analysis IDs from URL", () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/corpuses?analysis=789"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      expect(selectedAnalysesIds()).toEqual(["789"]);
    });

    it("should parse extract IDs from URL", () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/extracts?extract=101,202"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      expect(selectedExtractIds()).toEqual(["101", "202"]);
    });

    it("should parse multiple query param types", () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter
            initialEntries={["/annotations?ann=1,2&analysis=3&extract=4,5"]}
          >
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      expect(selectedAnnotationIds()).toEqual(["1", "2"]);
      expect(selectedAnalysesIds()).toEqual(["3"]);
      expect(selectedExtractIds()).toEqual(["4", "5"]);
    });

    it("should clear params when not in URL", () => {
      // Set initial values
      selectedAnnotationIds(["old-1"]);
      selectedAnalysesIds(["old-2"]);

      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/annotations"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      expect(selectedAnnotationIds()).toEqual([]);
      expect(selectedAnalysesIds()).toEqual([]);
    });
  });

  describe("Phase 3: Entity Data → Canonical Redirects", () => {
    it("should redirect to canonical corpus path", async () => {
      const mockCorpus = {
        id: "corpus-123",
        slug: "normalized-slug",
        title: "My Corpus",
        creator: { id: "user-1", slug: "john-doe" },
      };

      const mocks = [
        {
          request: {
            query: RESOLVE_CORPUS_BY_SLUGS_FULL,
            variables: {
              userSlug: "john",
              corpusSlug: "old-slug",
            },
          },
          result: {
            data: {
              corpusBySlugs: mockCorpus,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/c/john/old-slug"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          "/c/john-doe/normalized-slug",
          { replace: true }
        );
      });
    });

    it("should preserve query params during canonical redirect", async () => {
      const mockDocument = {
        id: "doc-123",
        slug: "canonical-doc",
        title: "My Document",
        creator: { id: "user-1", slug: "jane" },
      };

      const mocks = [
        {
          request: {
            query: RESOLVE_DOCUMENT_BY_SLUGS_FULL,
            variables: {
              userSlug: "john",
              documentSlug: "old-doc",
            },
          },
          result: {
            data: {
              documentBySlugs: mockDocument,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter
            initialEntries={["/d/john/old-doc?ann=123&analysis=456"]}
          >
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        const call = mockNavigate.mock.calls.find((call) =>
          call[0].includes("/d/jane/canonical-doc")
        );
        expect(call).toBeDefined();
        expect(call[0]).toContain("ann=123");
        expect(call[0]).toContain("analysis=456");
      });
    });
  });

  describe("Phase 4: Reactive Vars → URL Sync", () => {
    it("should update URL when annotation IDs change", async () => {
      const { rerender } = render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/annotations"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      // Change reactive var
      selectedAnnotationIds(["new-123", "new-456"]);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          { search: "ann=new-123,new-456" },
          { replace: true }
        );
      });
    });

    it("should update URL when analysis IDs change", async () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/corpuses"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      selectedAnalysesIds(["789"]);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          { search: "analysis=789" },
          { replace: true }
        );
      });
    });

    it("should combine multiple params in URL", async () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/annotations"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      selectedAnnotationIds(["1", "2"]);
      selectedAnalysesIds(["3"]);
      selectedExtractIds(["4"]);

      await waitFor(() => {
        const lastCall =
          mockNavigate.mock.calls[mockNavigate.mock.calls.length - 1];
        expect(lastCall[0].search).toContain("ann=1,2");
        expect(lastCall[0].search).toContain("analysis=3");
        expect(lastCall[0].search).toContain("extract=4");
      });
    });

    it("should clear URL params when reactive vars empty", async () => {
      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/annotations?ann=123"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      // Clear reactive var
      selectedAnnotationIds([]);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          { search: "" },
          { replace: true }
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("should set error state on GraphQL failure", async () => {
      const mocks = [
        {
          request: {
            query: RESOLVE_CORPUS_BY_SLUGS_FULL,
            variables: {
              userSlug: "john",
              corpusSlug: "my-corpus",
            },
          },
          error: new Error("Network error"),
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/c/john/my-corpus"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        expect(routeError()).toBeTruthy();
        expect(routeLoading()).toBe(false);
      });
    });
  });

  describe("Request Deduplication", () => {
    it("should not trigger duplicate requests for same route", async () => {
      const mockCorpus = {
        id: "corpus-123",
        slug: "my-corpus",
        title: "My Corpus",
        creator: { id: "user-1", slug: "john" },
      };

      const queryMock = vi.fn(() => ({
        data: { corpusBySlugs: mockCorpus },
      }));

      const mocks = [
        {
          request: {
            query: RESOLVE_CORPUS_BY_SLUGS_FULL,
            variables: {
              userSlug: "john",
              corpusSlug: "my-corpus",
            },
          },
          result: queryMock,
        },
      ];

      const { rerender } = render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/c/john/my-corpus"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      // Force re-render (should not trigger second request due to ref guard)
      rerender(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/c/john/my-corpus"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Query should only be called once
        expect(queryMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Route Change Handling", () => {
    it("should clear old entities when navigating to browse route", async () => {
      const mockCorpus = {
        id: "corpus-123",
        slug: "my-corpus",
        title: "My Corpus",
        creator: { id: "user-1", slug: "john" },
      };

      // Set initial corpus
      openedCorpus(mockCorpus);

      render(
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter initialEntries={["/annotations"]}>
            <CentralRouteManager />
          </MemoryRouter>
        </MockedProvider>
      );

      // Should clear corpus when on browse route
      expect(openedCorpus()).toBeNull();
      expect(openedDocument()).toBeNull();
    });
  });
});
