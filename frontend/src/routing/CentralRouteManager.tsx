/**
 * CentralRouteManager - Single source of truth for routing state
 *
 * This component handles ALL URL ↔ State synchronization in one place:
 * 1. URL Path → Entity Resolution (GraphQL fetches)
 * 2. URL Query Params → Reactive Vars (selections)
 * 3. Entity Data → Canonical Redirects (slug normalization)
 * 4. Reactive Vars → URL Updates (bidirectional sync)
 *
 * Components consume state via reactive vars and never touch URLs directly.
 */

import { useEffect, useRef } from "react";
import { useLazyQuery } from "@apollo/client";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import {
  openedCorpus,
  openedDocument,
  selectedAnnotationIds,
  selectedAnalysesIds,
  selectedExtractIds,
  routeLoading,
  routeError,
  authStatusVar,
} from "../graphql/cache";
import {
  RESOLVE_CORPUS_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
  GET_CORPUS_BY_ID_FOR_REDIRECT,
  GET_DOCUMENT_BY_ID_FOR_REDIRECT,
  GetCorpusByIdForRedirectInput,
  GetCorpusByIdForRedirectOutput,
  GetDocumentByIdForRedirectInput,
  GetDocumentByIdForRedirectOutput,
} from "../graphql/queries";
import { CorpusType, DocumentType } from "../types/graphql-api";
import {
  ResolveCorpusFullQuery,
  ResolveCorpusFullVariables,
  ResolveDocumentFullQuery,
  ResolveDocumentFullVariables,
  ResolveDocumentInCorpusFullQuery,
  ResolveDocumentInCorpusFullVariables,
} from "../types/graphql-slug-queries";
import {
  parseRoute,
  parseQueryParam,
  buildCanonicalPath,
  buildQueryParams,
  requestTracker,
  buildRequestKey,
} from "../utils/navigationUtils";
import { getIdentifierType, isValidGraphQLId } from "../utils/idValidation";
import { performanceMonitor } from "../utils/performance";

/**
 * CentralRouteManager Component
 * Mounted once in App.tsx, manages all routing state globally
 */
export function CentralRouteManager() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Track last processed route to prevent duplicate work
  const lastProcessedPath = useRef<string>("");

  // ═══════════════════════════════════════════════════════════════
  // GraphQL Queries - Slug-based
  // ═══════════════════════════════════════════════════════════════
  const [resolveCorpus] = useLazyQuery<
    ResolveCorpusFullQuery,
    ResolveCorpusFullVariables
  >(RESOLVE_CORPUS_BY_SLUGS_FULL, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const [resolveDocumentOnly] = useLazyQuery<
    ResolveDocumentFullQuery,
    ResolveDocumentFullVariables
  >(RESOLVE_DOCUMENT_BY_SLUGS_FULL, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const [resolveDocumentInCorpus] = useLazyQuery<
    ResolveDocumentInCorpusFullQuery,
    ResolveDocumentInCorpusFullVariables
  >(RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  // GraphQL Queries - ID-based (for fallback/redirect)
  const [resolveCorpusById] = useLazyQuery<
    GetCorpusByIdForRedirectOutput,
    GetCorpusByIdForRedirectInput
  >(GET_CORPUS_BY_ID_FOR_REDIRECT, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const [resolveDocumentById] = useLazyQuery<
    GetDocumentByIdForRedirectOutput,
    GetDocumentByIdForRedirectInput
  >(GET_DOCUMENT_BY_ID_FOR_REDIRECT, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: URL Path → Entity Resolution
  // ═══════════════════════════════════════════════════════════════
  const authStatus = useReactiveVar(authStatusVar);

  useEffect(() => {
    const currentPath = location.pathname;
    const route = parseRoute(currentPath);

    console.log(
      "[RouteManager] Processing route:",
      route,
      "authStatus:",
      authStatus
    );

    // Browse routes - no entity fetch needed
    if (route.type === "browse" || route.type === "unknown") {
      openedCorpus(null);
      openedDocument(null);
      routeLoading(false);
      routeError(null);
      lastProcessedPath.current = currentPath;
      return;
    }

    // CRITICAL: Wait for auth to initialize before fetching protected entities
    // This prevents 401/403 errors on deep links and page refreshes
    if (authStatus === "LOADING") {
      console.log(
        "[RouteManager] ⏳ Waiting for auth to initialize before resolving entity..."
      );
      routeLoading(true);
      // Don't update lastProcessedPath - we need to re-process when auth is ready
      return;
    }

    // Skip if we've already processed this exact path (after auth is ready)
    if (lastProcessedPath.current === currentPath) {
      console.log(
        "[RouteManager] Skipping duplicate path processing:",
        currentPath
      );
      return;
    }

    lastProcessedPath.current = currentPath;

    // Entity routes - async resolution required
    const resolveEntity = async () => {
      routeLoading(true);
      routeError(null);

      const requestKey = buildRequestKey(
        route.type,
        route.userIdent,
        route.corpusIdent,
        route.documentIdent
      );

      // Prevent duplicate simultaneous requests
      if (requestTracker.isPending(requestKey)) {
        console.log("[RouteManager] Request already pending:", requestKey);
        return;
      }

      const metricKey = `route-resolution-${requestKey}`;
      performanceMonitor.startMetric(metricKey, route);

      try {
        await requestTracker.trackRequest(requestKey, async () => {
          // ────────────────────────────────────────────────────────
          // DOCUMENT IN CORPUS (/d/user/corpus/document)
          // ────────────────────────────────────────────────────────
          if (
            route.type === "document" &&
            route.corpusIdent &&
            route.documentIdent
          ) {
            console.log("[RouteManager] Resolving document in corpus");

            // Try slug-based resolution first
            const { data, error } = await resolveDocumentInCorpus({
              variables: {
                userSlug: route.userIdent!,
                corpusSlug: route.corpusIdent,
                documentSlug: route.documentIdent,
              },
            });

            if (error) {
              console.error(
                "[RouteManager] ❌ GraphQL error resolving document in corpus:",
                error
              );
              console.error("[RouteManager] Variables:", {
                userSlug: route.userIdent,
                corpusSlug: route.corpusIdent,
                documentSlug: route.documentIdent,
              });
            }

            if (!data?.documentInCorpusBySlugs) {
              console.warn(
                "[RouteManager] ⚠️  documentInCorpusBySlugs is null"
              );
            }

            if (!data?.corpusBySlugs) {
              console.warn("[RouteManager] ⚠️  corpusBySlugs is null");
            }

            if (
              !error &&
              data?.documentInCorpusBySlugs &&
              data?.corpusBySlugs
            ) {
              const corpus = data.corpusBySlugs as any as CorpusType;
              const document =
                data.documentInCorpusBySlugs as any as DocumentType;

              console.log("[RouteManager] ✅ Resolved via slugs:", {
                corpus: corpus.id,
                document: document.id,
              });

              openedCorpus(corpus);
              openedDocument(document);
              routeLoading(false);
              return;
            }

            // Fallback: Try ID-based resolution for document
            const docType = getIdentifierType(route.documentIdent);
            if (
              docType === "id" ||
              (docType === "unknown" && isValidGraphQLId(route.documentIdent))
            ) {
              console.log(
                "[RouteManager] Trying ID-based fallback for document"
              );
              const { data: idData } = await resolveDocumentById({
                variables: { id: route.documentIdent },
              });

              if (idData?.document) {
                // Redirect to canonical slug URL
                const canonicalPath = buildCanonicalPath(
                  idData.document,
                  idData.document.corpus
                );
                if (canonicalPath) {
                  navigate(canonicalPath + location.search, { replace: true });
                  return;
                }
              }
            }

            // Not found
            console.warn("[RouteManager] Document in corpus not found");
            navigate("/404", { replace: true });
            return;
          }

          // ────────────────────────────────────────────────────────
          // STANDALONE DOCUMENT (/d/user/document)
          // ────────────────────────────────────────────────────────
          if (
            route.type === "document" &&
            !route.corpusIdent &&
            route.documentIdent
          ) {
            console.log("[RouteManager] Resolving standalone document");

            // Try slug-based resolution
            const { data, error } = await resolveDocumentOnly({
              variables: {
                userSlug: route.userIdent!,
                documentSlug: route.documentIdent,
              },
            });

            if (error) {
              console.error(
                "[RouteManager] ❌ GraphQL error resolving standalone document:",
                error
              );
              console.error("[RouteManager] Variables:", {
                userSlug: route.userIdent,
                documentSlug: route.documentIdent,
              });
            }

            if (!data?.documentBySlugs) {
              console.warn("[RouteManager] ⚠️  documentBySlugs is null");
            }

            if (!error && data?.documentBySlugs) {
              const document = data.documentBySlugs as any as DocumentType;

              console.log(
                "[RouteManager] ✅ Resolved document via slugs:",
                document.id
              );

              openedCorpus(null);
              openedDocument(document);
              routeLoading(false);
              return;
            }

            // Fallback: Try ID-based resolution
            const docType = getIdentifierType(route.documentIdent);
            if (
              docType === "id" ||
              (docType === "unknown" && isValidGraphQLId(route.documentIdent))
            ) {
              console.log(
                "[RouteManager] Trying ID-based fallback for document"
              );
              const { data: idData } = await resolveDocumentById({
                variables: { id: route.documentIdent },
              });

              if (idData?.document) {
                const canonicalPath = buildCanonicalPath(idData.document);
                if (canonicalPath) {
                  navigate(canonicalPath + location.search, { replace: true });
                  return;
                }
              }
            }

            console.warn("[RouteManager] Document not found");
            navigate("/404", { replace: true });
            return;
          }

          // ────────────────────────────────────────────────────────
          // CORPUS (/c/user/corpus)
          // ────────────────────────────────────────────────────────
          if (route.type === "corpus" && route.corpusIdent) {
            console.log("[RouteManager] Resolving corpus");

            // Try slug-based resolution
            const { data, error } = await resolveCorpus({
              variables: {
                userSlug: route.userIdent!,
                corpusSlug: route.corpusIdent,
              },
            });

            if (error) {
              console.error(
                "[RouteManager] ❌ GraphQL error resolving corpus:",
                error
              );
              console.error("[RouteManager] Variables:", {
                userSlug: route.userIdent,
                corpusSlug: route.corpusIdent,
              });
            }

            if (!data?.corpusBySlugs) {
              console.warn("[RouteManager] ⚠️  corpusBySlugs is null");
            }

            if (!error && data?.corpusBySlugs) {
              const corpus = data.corpusBySlugs as any as CorpusType;

              console.log(
                "[RouteManager] ✅ Resolved corpus via slugs:",
                corpus.id
              );

              openedCorpus(corpus);
              openedDocument(null);
              routeLoading(false);
              return;
            }

            // Fallback: Try ID-based resolution
            const corpusType = getIdentifierType(route.corpusIdent);
            if (
              corpusType === "id" ||
              (corpusType === "unknown" && isValidGraphQLId(route.corpusIdent))
            ) {
              console.log("[RouteManager] Trying ID-based fallback for corpus");
              const { data: idData } = await resolveCorpusById({
                variables: { id: route.corpusIdent },
              });

              if (idData?.corpus) {
                const canonicalPath = buildCanonicalPath(null, idData.corpus);
                if (canonicalPath) {
                  navigate(canonicalPath + location.search, { replace: true });
                  return;
                }
              }
            }

            console.warn("[RouteManager] Corpus not found");
            navigate("/404", { replace: true });
            return;
          }

          // Invalid route configuration
          console.warn("[RouteManager] Invalid route configuration:", route);
          navigate("/404", { replace: true });
        });

        performanceMonitor.endMetric(metricKey, { success: true });
      } catch (error) {
        console.error("[RouteManager] Resolution failed:", error);
        performanceMonitor.endMetric(metricKey, { success: false });
        routeError(error as Error);
        routeLoading(false);
      }
    };

    resolveEntity();
  }, [location.pathname, authStatus]); // Re-run when path OR auth status changes

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: URL Query Params → Reactive Vars
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const annIds = parseQueryParam(searchParams.get("ann"));
    const analysisIds = parseQueryParam(searchParams.get("analysis"));
    const extractIds = parseQueryParam(searchParams.get("extract"));

    console.log("[RouteManager] Setting query param state:", {
      annIds,
      analysisIds,
      extractIds,
    });

    selectedAnnotationIds(annIds);
    selectedAnalysesIds(analysisIds);
    selectedExtractIds(extractIds);
  }, [searchParams]);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Entity Data → Canonical Redirects
  // ═══════════════════════════════════════════════════════════════
  const corpus = useReactiveVar(openedCorpus);
  const document = useReactiveVar(openedDocument);

  useEffect(() => {
    if (!corpus && !document) return;

    const canonicalPath = buildCanonicalPath(document, corpus);
    if (!canonicalPath) return;

    // Normalize paths for comparison (remove trailing slashes)
    const normalize = (path: string) => path.replace(/\/$/, "").toLowerCase();

    const currentPath = normalize(location.pathname);
    const canonical = normalize(canonicalPath);

    if (currentPath !== canonical) {
      console.log(
        "[RouteManager] Redirecting to canonical path:",
        canonicalPath
      );
      navigate(canonicalPath + location.search, { replace: true });
    }
  }, [corpus, document, location.pathname]);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Reactive Vars → URL Sync (Bidirectional)
  // ═══════════════════════════════════════════════════════════════
  const annIds = useReactiveVar(selectedAnnotationIds);
  const analysisIds = useReactiveVar(selectedAnalysesIds);
  const extractIds = useReactiveVar(selectedExtractIds);

  useEffect(() => {
    const queryString = buildQueryParams({
      annotationIds: annIds,
      analysisIds,
      extractIds,
    });

    const expectedSearch = queryString || "";
    const currentSearch = location.search.startsWith("?")
      ? location.search.substring(1)
      : location.search;

    if (currentSearch !== expectedSearch) {
      console.log("[RouteManager] Syncing reactive vars → URL:", queryString);
      navigate({ search: queryString }, { replace: true });
    }
  }, [annIds, analysisIds, extractIds]);

  // This component is purely side-effect driven, renders nothing
  return null;
}
