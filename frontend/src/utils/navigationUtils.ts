/**
 * Navigation utilities for consistent slug-based routing
 * Only supports new explicit route patterns with /c/ and /d/ prefixes
 */

import { CorpusType, DocumentType, UserType } from "../types/graphql-api";

/**
 * Route parsing types
 */
export interface ParsedRoute {
  type: "corpus" | "document" | "browse" | "unknown";
  userIdent?: string;
  corpusIdent?: string;
  documentIdent?: string;
  browsePath?: string;
}

/**
 * Query parameter interface for URL construction
 */
export interface QueryParams {
  annotationIds?: string[];
  analysisIds?: string[];
  extractIds?: string[];
}

/**
 * Parses a URL pathname into route type and identifiers
 * Supports patterns:
 * - /c/:userIdent/:corpusIdent
 * - /d/:userIdent/:docIdent
 * - /d/:userIdent/:corpusIdent/:docIdent
 * - /annotations, /extracts, /corpuses, /documents, etc.
 *
 * @param pathname - URL pathname to parse
 * @returns Parsed route object with type and identifiers
 */
export function parseRoute(pathname: string): ParsedRoute {
  const segments = pathname.split("/").filter(Boolean);

  // Corpus route: /c/user/corpus
  if (segments[0] === "c" && segments.length === 3) {
    return {
      type: "corpus",
      userIdent: segments[1],
      corpusIdent: segments[2],
    };
  }

  // Document routes
  if (segments[0] === "d") {
    // /d/user/corpus/document (4 segments)
    if (segments.length === 4) {
      return {
        type: "document",
        userIdent: segments[1],
        corpusIdent: segments[2],
        documentIdent: segments[3],
      };
    }
    // /d/user/document (3 segments)
    if (segments.length === 3) {
      return {
        type: "document",
        userIdent: segments[1],
        documentIdent: segments[2],
      };
    }
  }

  // Browse routes: /annotations, /extracts, /corpuses, /documents, /label_sets
  const browseRoutes = [
    "annotations",
    "extracts",
    "corpuses",
    "documents",
    "label_sets",
  ];
  if (segments.length === 1 && browseRoutes.includes(segments[0])) {
    return {
      type: "browse",
      browsePath: segments[0],
    };
  }

  return { type: "unknown" };
}

/**
 * Parses a comma-separated query parameter into an array
 * @param param - Query parameter value (e.g., "1,2,3" or null)
 * @returns Array of strings, or empty array if null/empty
 */
export function parseQueryParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").filter(Boolean);
}

/**
 * Builds canonical path from corpus/document entities
 * @param document - Optional document entity
 * @param corpus - Optional corpus entity
 * @returns Canonical path or empty string if entities missing
 */
export function buildCanonicalPath(
  document?: DocumentType | null,
  corpus?: CorpusType | null
): string {
  // Document in corpus context
  if (
    document?.slug &&
    document?.creator?.slug &&
    corpus?.slug &&
    corpus?.creator?.slug
  ) {
    return `/d/${corpus.creator.slug}/${corpus.slug}/${document.slug}`;
  }

  // Standalone document
  if (document?.slug && document?.creator?.slug) {
    return `/d/${document.creator.slug}/${document.slug}`;
  }

  // Corpus only
  if (corpus?.slug && corpus?.creator?.slug) {
    return `/c/${corpus.creator.slug}/${corpus.slug}`;
  }

  return "";
}

/**
 * Builds a query string from multiple parameter arrays
 * Used for preserving state across navigation
 *
 * @example
 * buildQueryParams({ annotationIds: ["1", "2"], analysisIds: ["3"] })
 * // Returns: "?ann=1,2&analysis=3"
 */
export function buildQueryParams(params: QueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.annotationIds?.length) {
    searchParams.set("ann", params.annotationIds.join(","));
  }
  if (params.analysisIds?.length) {
    searchParams.set("analysis", params.analysisIds.join(","));
  }
  if (params.extractIds?.length) {
    searchParams.set("extract", params.extractIds.join(","));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

/**
 * Builds the URL for a corpus
 * Always uses slug-based URL with /c/ prefix
 *
 * @param corpus - Corpus object with slug and creator
 * @param queryParams - Optional query parameters for URL-driven state
 * @returns Full corpus URL with query string, or "#" if slugs missing
 */
export function getCorpusUrl(
  corpus: Pick<CorpusType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  queryParams?: QueryParams
): string {
  // Always use slug-based URL with /c/ prefix
  // If slugs are missing, we can't generate a valid URL
  if (!corpus.slug || !corpus.creator?.slug) {
    console.warn("Cannot generate corpus URL without slugs:", corpus);
    return "#"; // Return a safe fallback that won't navigate
  }

  const basePath = `/c/${corpus.creator.slug}/${corpus.slug}`;
  const query = queryParams ? buildQueryParams(queryParams) : "";
  return basePath + query;
}

/**
 * Builds the URL for a document
 * Always uses slug-based URL with /d/ prefix
 *
 * @param document - Document object with slug and creator
 * @param corpus - Optional corpus for context (generates 3-segment URL)
 * @param queryParams - Optional query parameters for URL-driven state
 * @returns Full document URL with query string, or "#" if slugs missing
 */
export function getDocumentUrl(
  document: Pick<DocumentType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  corpus?:
    | (Pick<CorpusType, "id" | "slug"> & {
        creator?: Pick<UserType, "id" | "slug"> | null;
      })
    | null,
  queryParams?: QueryParams
): string {
  let basePath: string;

  // If we have corpus context and all slugs, use the full URL
  if (
    corpus?.slug &&
    corpus?.creator?.slug &&
    document.slug &&
    document.creator?.slug
  ) {
    basePath = `/d/${corpus.creator.slug}/${corpus.slug}/${document.slug}`;
  }
  // Standalone document URL
  else if (document.slug && document.creator?.slug) {
    basePath = `/d/${document.creator.slug}/${document.slug}`;
  }
  // Can't generate URL without slugs
  else {
    console.warn(
      "Cannot generate document URL without slugs:",
      document,
      corpus
    );
    return "#"; // Return a safe fallback that won't navigate
  }

  const query = queryParams ? buildQueryParams(queryParams) : "";
  return basePath + query;
}

/**
 * Checks if the current path matches the canonical path
 * Prevents unnecessary redirects
 */
export function isCanonicalPath(
  currentPath: string,
  canonicalPath: string
): boolean {
  // Normalize paths (remove trailing slashes, query params)
  const normalize = (path: string) => {
    const withoutQuery = path.split("?")[0];
    return withoutQuery.replace(/\/$/, "").toLowerCase();
  };

  return normalize(currentPath) === normalize(canonicalPath);
}

/**
 * Smart navigation function for corpuses
 * Only navigates if not already at the destination
 *
 * @param corpus - Corpus to navigate to
 * @param navigate - React Router navigate function
 * @param currentPath - Current path to check if already at destination
 * @param queryParams - Optional query parameters to preserve in URL
 */
export function navigateToCorpus(
  corpus: Pick<CorpusType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  navigate: (path: string, options?: { replace?: boolean }) => void,
  currentPath?: string,
  queryParams?: QueryParams
) {
  const targetPath = getCorpusUrl(corpus, queryParams);

  // Don't navigate to invalid URL
  if (targetPath === "#") {
    console.error("Cannot navigate to corpus without slugs");
    return;
  }

  // Don't navigate if we're already there
  if (currentPath && isCanonicalPath(currentPath, targetPath)) {
    console.log("Already at canonical corpus path:", targetPath);
    return;
  }

  navigate(targetPath, { replace: true });
}

/**
 * Smart navigation function for documents
 * Only navigates if not already at the destination
 *
 * @param document - Document to navigate to
 * @param corpus - Optional corpus for context (creates 3-segment URL)
 * @param navigate - React Router navigate function
 * @param currentPath - Current path to check if already at destination
 * @param queryParams - Optional query parameters to preserve in URL
 */
export function navigateToDocument(
  document: Pick<DocumentType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  corpus:
    | (Pick<CorpusType, "id" | "slug"> & {
        creator?: Pick<UserType, "id" | "slug"> | null;
      })
    | null,
  navigate: (path: string, options?: { replace?: boolean }) => void,
  currentPath?: string,
  queryParams?: QueryParams
) {
  const targetPath = getDocumentUrl(document, corpus, queryParams);

  // Don't navigate to invalid URL
  if (targetPath === "#") {
    console.error("Cannot navigate to document without slugs");
    return;
  }

  // Don't navigate if we're already there
  if (currentPath && isCanonicalPath(currentPath, targetPath)) {
    console.log("Already at canonical document path:", targetPath);
    return;
  }

  navigate(targetPath, { replace: true });
}

/**
 * Request tracking to prevent duplicate GraphQL queries
 */
class RequestTracker {
  private pendingRequests: Map<string, Promise<any>> = new Map();

  isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  async trackRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
    // If already pending, return the existing promise
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Create and track new request
    const promise = request().finally(() => {
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }
}

export const requestTracker = new RequestTracker();

/**
 * Build a unique key for request deduplication
 */
export function buildRequestKey(
  type: "corpus" | "document",
  userIdent?: string,
  corpusIdent?: string,
  documentIdent?: string
): string {
  const parts = [type, userIdent, corpusIdent, documentIdent].filter(Boolean);
  return parts.join("-");
}
