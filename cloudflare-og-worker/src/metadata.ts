/**
 * GraphQL metadata fetching for OG previews
 *
 * Fetches minimal metadata from the OpenContracts backend API
 * for generating Open Graph tags. Only returns data for public entities.
 */

import type {
  Env,
  EntityType,
  ParsedRoute,
  OGMetadata,
  GraphQLResponse,
  OGCorpusData,
  OGDocumentData,
  OGThreadData,
  OGExtractData,
} from "./types";

/**
 * GraphQL query definitions for each entity type
 */
const QUERIES: Record<EntityType, string> = {
  corpus: `
    query OGCorpus($userSlug: String!, $corpusSlug: String!) {
      ogCorpusMetadata(userSlug: $userSlug, corpusSlug: $corpusSlug) {
        title
        description
        iconUrl
        documentCount
        creatorName
        isPublic
      }
    }
  `,

  document: `
    query OGDocument($userSlug: String!, $documentSlug: String!) {
      ogDocumentMetadata(userSlug: $userSlug, documentSlug: $documentSlug) {
        title
        description
        iconUrl
        corpusTitle
        creatorName
        isPublic
      }
    }
  `,

  document_in_corpus: `
    query OGDocumentInCorpus($userSlug: String!, $corpusSlug: String!, $documentSlug: String!) {
      ogDocumentInCorpusMetadata(
        userSlug: $userSlug
        corpusSlug: $corpusSlug
        documentSlug: $documentSlug
      ) {
        title
        description
        iconUrl
        corpusTitle
        creatorName
        isPublic
      }
    }
  `,

  thread: `
    query OGThread($userSlug: String!, $corpusSlug: String!, $threadId: String!) {
      ogThreadMetadata(userSlug: $userSlug, corpusSlug: $corpusSlug, threadId: $threadId) {
        title
        corpusTitle
        messageCount
        creatorName
        isPublic
      }
    }
  `,

  extract: `
    query OGExtract($extractId: String!) {
      ogExtractMetadata(extractId: $extractId) {
        name
        corpusTitle
        fieldsetName
        creatorName
        isPublic
      }
    }
  `,
};

/**
 * Build GraphQL variables from parsed route
 */
function buildVariables(route: ParsedRoute): Record<string, string> {
  const vars: Record<string, string> = {};

  if (route.userSlug) vars.userSlug = route.userSlug;
  if (route.corpusSlug) vars.corpusSlug = route.corpusSlug;
  if (route.documentSlug) vars.documentSlug = route.documentSlug;
  if (route.extractId) vars.extractId = route.extractId;
  if (route.threadId) vars.threadId = route.threadId;

  return vars;
}

/**
 * Fetch OG metadata from the backend API
 *
 * @param route - Parsed route information
 * @param env - Worker environment bindings
 * @returns OG metadata or null if entity not found/not public
 */
export async function fetchOGMetadata(
  route: ParsedRoute,
  env: Env
): Promise<OGMetadata | null> {
  const query = QUERIES[route.type];
  if (!query) {
    console.error(`No query defined for entity type: ${route.type}`);
    return null;
  }

  const variables = buildVariables(route);

  try {
    const response = await fetch(`${env.API_URL}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // No auth header - these are public queries
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      console.error(`GraphQL request failed with status ${response.status}`);
      return null;
    }

    const json = (await response.json()) as GraphQLResponse;

    if (json.errors && json.errors.length > 0) {
      console.error("GraphQL errors:", json.errors);
      return null;
    }

    return extractMetadata(route.type, json.data, env);
  } catch (error) {
    console.error("Failed to fetch OG metadata:", error);
    return null;
  }
}

/**
 * Extract and normalize metadata from GraphQL response
 */
function extractMetadata(
  type: EntityType,
  data: Record<string, unknown>,
  env: Env
): OGMetadata | null {
  switch (type) {
    case "corpus": {
      const corpus = (data as OGCorpusData).ogCorpusMetadata;
      if (!corpus || !corpus.isPublic) return null;

      return {
        title: corpus.title,
        description:
          corpus.description ||
          `A corpus with ${corpus.documentCount} documents`,
        image: corpus.iconUrl || `${env.OG_IMAGE_BASE}/corpus-og.png`,
        type,
        entityName: corpus.title,
        creatorName: corpus.creatorName,
        documentCount: corpus.documentCount,
      };
    }

    case "document": {
      const doc = (data as OGDocumentData).ogDocumentMetadata;
      if (!doc || !doc.isPublic) return null;

      return {
        title: doc.title,
        description: doc.description || "Document on OpenContracts",
        image: doc.iconUrl || `${env.OG_IMAGE_BASE}/document-og.png`,
        type,
        entityName: doc.title,
        creatorName: doc.creatorName,
        corpusTitle: doc.corpusTitle || undefined,
      };
    }

    case "document_in_corpus": {
      // Uses same response type as document
      const doc = (
        data as { ogDocumentInCorpusMetadata: OGDocumentData["ogDocumentMetadata"] }
      ).ogDocumentInCorpusMetadata;
      if (!doc || !doc.isPublic) return null;

      return {
        title: doc.title,
        description:
          doc.description ||
          (doc.corpusTitle
            ? `Document in ${doc.corpusTitle}`
            : "Document on OpenContracts"),
        image: doc.iconUrl || `${env.OG_IMAGE_BASE}/document-og.png`,
        type,
        entityName: doc.title,
        creatorName: doc.creatorName,
        corpusTitle: doc.corpusTitle || undefined,
      };
    }

    case "thread": {
      const thread = (data as OGThreadData).ogThreadMetadata;
      if (!thread || !thread.isPublic) return null;

      return {
        title: thread.title || "Discussion",
        description: `Discussion in ${thread.corpusTitle} with ${thread.messageCount} messages`,
        image: `${env.OG_IMAGE_BASE}/discussion-og.png`,
        type,
        entityName: thread.title || "Discussion",
        creatorName: thread.creatorName,
        corpusTitle: thread.corpusTitle,
      };
    }

    case "extract": {
      const extract = (data as OGExtractData).ogExtractMetadata;
      if (!extract || !extract.isPublic) return null;

      return {
        title: extract.name,
        description: `Data extraction using ${extract.fieldsetName} on ${extract.corpusTitle}`,
        image: `${env.OG_IMAGE_BASE}/extract-og.png`,
        type,
        entityName: extract.name,
        creatorName: extract.creatorName,
        corpusTitle: extract.corpusTitle,
      };
    }

    default:
      return null;
  }
}
