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
  showStructuralAnnotations,
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
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

  // Track if Phase 2 has run at least once (prevents Phase 4 from overwriting URL on mount)
  const hasInitializedFromUrl = useRef<boolean>(false);

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

      // Type assertion: route.type is guaranteed to be "document" | "corpus" here
      // because "browse" and "unknown" are handled by early return above
      const requestKey = buildRequestKey(
        route.type as "document" | "corpus",
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
                // Type assertion: redirect query doesn't include analyses field,
                // but buildCanonicalPath only needs slug and creator
                const canonicalPath = buildCanonicalPath(
                  idData.document as any,
                  idData.document.corpus as any
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
            console.log(
              "[GraphQL] 🔵 CentralRouteManager: Calling RESOLVE_DOCUMENT_BY_SLUGS_FULL",
              {
                userSlug: route.userIdent!,
                documentSlug: route.documentIdent,
              }
            );
            const { data, error } = await resolveDocumentOnly({
              variables: {
                userSlug: route.userIdent!,
                documentSlug: route.documentIdent,
              },
            });
            console.log(
              "[GraphQL] ✅ CentralRouteManager: RESOLVE_DOCUMENT_BY_SLUGS_FULL completed",
              {
                hasData: !!data?.documentBySlugs,
                hasError: !!error,
              }
            );

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
                // Type assertion: redirect query doesn't include analyses field,
                // but buildCanonicalPath only needs slug and creator
                const canonicalPath = buildCanonicalPath(
                  null,
                  idData.corpus as any
                );
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
    console.log("🔍 Phase 2 RAW URL CHECK:", {
      "location.search": location.search,
      "window.location.search": window.location.search,
      "window.location.href": window.location.href,
    });

    // Selection state
    const annIds = parseQueryParam(searchParams.get("ann"));
    const analysisIds = parseQueryParam(searchParams.get("analysis"));
    const extractIds = parseQueryParam(searchParams.get("extract"));

    // Visualization state (booleans and enums)
    const structural = searchParams.get("structural") === "true";
    const selectedOnly = searchParams.get("selectedOnly") === "true";
    const boundingBoxes = searchParams.get("boundingBoxes") === "true";
    const labelsParam = searchParams.get("labels");

    console.log("[RouteManager] Phase 2: Setting query param state:", {
      annIds,
      analysisIds,
      extractIds,
      structural,
      selectedOnly,
      boundingBoxes,
      labels: labelsParam,
    });

    // CRITICAL: Only update reactive vars if values have changed
    // Reactive vars trigger re-renders even when set to same value, causing infinite loops
    const currentAnnIds = selectedAnnotationIds();
    const currentAnalysisIds = selectedAnalysesIds();
    const currentExtractIds = selectedExtractIds();
    const currentStructural = showStructuralAnnotations();
    const currentSelectedOnly = showSelectedAnnotationOnly();
    const currentBoundingBoxes = showAnnotationBoundingBoxes();
    const currentLabels = showAnnotationLabels();

    // Helper to compare arrays
    const arraysEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((val, idx) => val === b[idx]);

    if (!arraysEqual(currentAnnIds, annIds)) {
      selectedAnnotationIds(annIds);
    }
    if (!arraysEqual(currentAnalysisIds, analysisIds)) {
      selectedAnalysesIds(analysisIds);
    }
    if (!arraysEqual(currentExtractIds, extractIds)) {
      selectedExtractIds(extractIds);
    }
    if (currentStructural !== structural) {
      showStructuralAnnotations(structural);
    }
    if (currentSelectedOnly !== selectedOnly) {
      showSelectedAnnotationOnly(selectedOnly);
    }
    if (currentBoundingBoxes !== boundingBoxes) {
      showAnnotationBoundingBoxes(boundingBoxes);
    }

    // Parse label display behavior (default to ON_HOVER if not specified)
    const newLabels =
      labelsParam === "ALWAYS"
        ? "ALWAYS"
        : labelsParam === "HIDE"
        ? "HIDE"
        : "ON_HOVER";

    if (currentLabels !== newLabels) {
      showAnnotationLabels(newLabels as any);
    }

    console.log(
      "[RouteManager] Phase 2: Reactive vars updated (if changed). Annotation IDs:",
      annIds
    );

    // Mark that we've initialized from URL - allows Phase 4 to start syncing
    hasInitializedFromUrl.current = true;
  }, [searchParams]);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Entity Data → Canonical Redirects
  // ═══════════════════════════════════════════════════════════════
  const corpus = useReactiveVar(openedCorpus);
  const document = useReactiveVar(openedDocument);

  // CRITICAL: Use IDs as dependencies to avoid infinite loops
  // GraphQL returns new object references even when data unchanged
  const corpusId = corpus?.id;
  const documentId = document?.id;

  useEffect(() => {
    if (!corpus && !document) return;

    // IMPORTANT: Don't redirect if we're on a browse route
    // This prevents race conditions where reactive vars haven't been cleared yet
    const currentRoute = parseRoute(location.pathname);
    if (currentRoute.type === "browse" || currentRoute.type === "unknown") {
      console.log(
        "[RouteManager] Phase 3: Skipping redirect - on browse route"
      );
      return;
    }

    const canonicalPath = buildCanonicalPath(document, corpus);
    if (!canonicalPath) return;

    // Normalize paths for comparison (remove trailing slashes)
    const normalize = (path: string) => path.replace(/\/$/, "").toLowerCase();

    const currentPath = normalize(location.pathname);
    const canonical = normalize(canonicalPath);

    if (currentPath !== canonical) {
      console.log("[RouteManager] Phase 3: Redirecting to canonical path:", {
        from: currentPath,
        to: canonical,
        preservingSearch: location.search,
      });
      navigate(canonicalPath + location.search, { replace: true });
    } else {
      console.log(
        "[RouteManager] Phase 3: Path already canonical, no redirect"
      );
    }
  }, [corpusId, documentId, location.pathname]); // Only depend on IDs, not full objects

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: Reactive Vars → URL Sync (Bidirectional)
  // ═══════════════════════════════════════════════════════════════
  const annIds = useReactiveVar(selectedAnnotationIds);
  const analysisIds = useReactiveVar(selectedAnalysesIds);
  const extractIds = useReactiveVar(selectedExtractIds);
  const structural = useReactiveVar(showStructuralAnnotations);
  const selectedOnly = useReactiveVar(showSelectedAnnotationOnly);
  const boundingBoxes = useReactiveVar(showAnnotationBoundingBoxes);
  const labels = useReactiveVar(showAnnotationLabels);

  useEffect(() => {
    const currentUrlParams = new URLSearchParams(location.search);
    const urlAnalysisIds = parseQueryParam(currentUrlParams.get("analysis"));
    const urlExtractIds = parseQueryParam(currentUrlParams.get("extract"));

    // CRITICAL: Don't sync on initial mount - wait for Phase 2 to read URL first
    // This prevents overwriting deep link params with default reactive var values
    if (!hasInitializedFromUrl.current) {
      console.log(
        "[RouteManager] Phase 4 SKIPPED - waiting for Phase 2 initialization"
      );
      return;
    }

    // CRITICAL: Don't sync while route is loading!
    // Prevents race condition where Phase 4 reads stale reactive vars before Phase 2 updates them
    if (routeLoading()) {
      console.log(
        "[RouteManager] Phase 4 SKIPPED - route still loading, preventing race condition"
      );
      return;
    }

    // CRITICAL: Don't sync if URL has analysis/extract params but corresponding reactive vars are empty
    // This prevents stripping params during the window when GET_DOCUMENT_ANALYSES_AND_EXTRACTS is still loading
    // Phase 2 sets reactive vars from URL, but if they're cleared or not yet propagated, we must wait
    const urlHasAnalysis = urlAnalysisIds.length > 0;
    const urlHasExtract = urlExtractIds.length > 0;
    const analysisVarEmpty = analysisIds.length === 0;
    const extractVarEmpty = extractIds.length === 0;

    if (
      (urlHasAnalysis && analysisVarEmpty) ||
      (urlHasExtract && extractVarEmpty)
    ) {
      console.log(
        "[RouteManager] Phase 4 SKIPPED - URL has params but reactive vars don't match (analyses/extracts still loading or cleared)",
        {
          urlHasAnalysis,
          analysisVarEmpty,
          urlHasExtract,
          extractVarEmpty,
        }
      );
      return;
    }

    console.log("[RouteManager] Phase 4: Building query from reactive vars:", {
      annIds,
      analysisIds,
      extractIds,
      structural,
      selectedOnly,
      boundingBoxes,
      labels,
    });

    const queryString = buildQueryParams({
      annotationIds: annIds,
      analysisIds,
      extractIds,
      showStructural: structural,
      showSelectedOnly: selectedOnly,
      showBoundingBoxes: boundingBoxes,
      labelDisplay: labels,
    });

    // Both should have consistent "?" prefix for comparison
    const expectedSearch = queryString; // Already has "?" from buildQueryParams
    const currentSearch = location.search; // Also has "?"

    console.log("[RouteManager] Phase 4: URL comparison:", {
      current: currentSearch,
      expected: expectedSearch,
      match: currentSearch === expectedSearch,
    });

    if (currentSearch !== expectedSearch) {
      console.log(
        "[RouteManager] Phase 4: Syncing reactive vars → URL:",
        queryString
      );
      navigate({ search: queryString }, { replace: true });
    }
  }, [
    annIds,
    analysisIds,
    extractIds,
    structural,
    selectedOnly,
    boundingBoxes,
    labels,
  ]);

  // This component is purely side-effect driven, renders nothing
  return null;
}
