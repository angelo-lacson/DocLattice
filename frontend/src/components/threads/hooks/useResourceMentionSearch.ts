import { useState, useEffect, useCallback } from "react";
import { useLazyQuery } from "@apollo/client";
import {
  SEARCH_CORPUSES_FOR_MENTION,
  SEARCH_DOCUMENTS_FOR_MENTION,
  SearchCorpusesForMentionInput,
  SearchCorpusesForMentionOutput,
  SearchDocumentsForMentionInput,
  SearchDocumentsForMentionOutput,
} from "../../../graphql/queries";
import { MentionResource } from "../ResourceMentionPicker";

/**
 * Hook for searching corpuses and documents for @ mentions
 * Combines results from both queries and provides debounced search
 *
 * Security: Backend filters via .visible_to_user() - frontend trusts results
 * Part of Issue #623 - @ Mentions Feature
 *
 * @param query - Search query string
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 * @param minChars - Minimum characters before searching (default: 2)
 */
export function useResourceMentionSearch(
  query: string,
  debounceMs: number = 300,
  minChars: number = 2
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [resources, setResources] = useState<MentionResource[]>([]);

  // Lazy queries for searching
  const [searchCorpuses, { data: corpusData, loading: corpusLoading }] =
    useLazyQuery<SearchCorpusesForMentionOutput, SearchCorpusesForMentionInput>(
      SEARCH_CORPUSES_FOR_MENTION,
      {
        fetchPolicy: "network-only", // Always fetch fresh results
      }
    );

  const [searchDocuments, { data: documentData, loading: documentLoading }] =
    useLazyQuery<
      SearchDocumentsForMentionOutput,
      SearchDocumentsForMentionInput
    >(SEARCH_DOCUMENTS_FOR_MENTION, {
      fetchPolicy: "network-only", // Always fetch fresh results
    });

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  // Execute searches when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < minChars) {
      setResources([]);
      return;
    }

    // Execute both searches in parallel
    searchCorpuses({ variables: { textSearch: debouncedQuery } });
    searchDocuments({ variables: { textSearch: debouncedQuery } });
  }, [debouncedQuery, minChars, searchCorpuses, searchDocuments]);

  // Combine results from both queries
  useEffect(() => {
    const corpusResults: MentionResource[] =
      corpusData?.searchCorpusesForMention?.edges?.map((edge) => ({
        id: edge.node.id,
        slug: edge.node.slug,
        title: edge.node.title,
        type: "corpus" as const,
        creator: {
          slug: edge.node.creator.slug,
        },
      })) || [];

    const documentResults: MentionResource[] =
      documentData?.searchDocumentsForMention?.edges?.map((edge) => ({
        id: edge.node.id,
        slug: edge.node.slug,
        title: edge.node.title,
        type: "document" as const,
        creator: {
          slug: edge.node.creator.slug,
        },
        corpus: edge.node.corpus
          ? {
              slug: edge.node.corpus.slug,
              title: edge.node.corpus.title,
              creator: {
                slug: edge.node.corpus.creator.slug,
              },
            }
          : undefined,
      })) || [];

    // Combine and limit to 10 total results
    const combined = [...corpusResults, ...documentResults].slice(0, 10);

    setResources(combined);
  }, [corpusData, documentData]);

  const loading = corpusLoading || documentLoading;

  return {
    resources,
    loading,
    hasResults: resources.length > 0,
  };
}
