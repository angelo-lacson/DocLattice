import { useState, useEffect, useMemo } from "react";
import { useLazyQuery } from "@apollo/client";
import {
  SEARCH_AGENTS_FOR_MENTION,
  SearchAgentsForMentionInput,
  SearchAgentsForMentionOutput,
} from "../../../graphql/queries";

/**
 * Agent mention resource for autocomplete display
 */
export interface AgentMentionResource {
  id: string;
  name: string;
  slug: string;
  description: string;
  scope: "GLOBAL" | "CORPUS";
  mentionFormat: string | null;
  corpus: {
    id: string;
    title: string;
  } | null;
}

/**
 * Hook for searching agents for @ mention autocomplete
 *
 * Searches for active agents that can be mentioned in a conversation:
 * - Global agents (always available)
 * - Corpus-scoped agents (if corpusId is provided)
 *
 * Part of Issue #623 - @ Mentions Feature (Extended) - Agent Mentions
 *
 * @param query - Search query string
 * @param corpusId - Optional corpus ID to include corpus-scoped agents
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 * @param minChars - Minimum characters before searching (default: 1 for agents)
 * @param limit - Max results to return (default: 10)
 */
export function useAgentMentionSearch(
  query: string,
  corpusId?: string,
  debounceMs: number = 300,
  minChars: number = 1,
  limit: number = 10
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const [searchAgents, { data, loading, error }] = useLazyQuery<
    SearchAgentsForMentionOutput,
    SearchAgentsForMentionInput
  >(SEARCH_AGENTS_FOR_MENTION, {
    fetchPolicy: "network-only",
  });

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  // Execute search when debounced query changes
  useEffect(() => {
    // Allow empty query to fetch all available agents
    if (debouncedQuery.length < minChars && debouncedQuery.length > 0) {
      return;
    }

    searchAgents({
      variables: {
        textSearch: debouncedQuery || undefined,
        corpusId: corpusId,
      },
    });
  }, [debouncedQuery, minChars, corpusId, searchAgents]);

  // Transform results
  const agents: AgentMentionResource[] = useMemo(() => {
    return (
      data?.searchAgentsForMention?.edges?.slice(0, limit).map((edge) => ({
        id: edge.node.id,
        name: edge.node.name,
        slug: edge.node.slug,
        description: edge.node.description,
        scope: edge.node.scope,
        mentionFormat: edge.node.mentionFormat,
        corpus: edge.node.corpus,
      })) || []
    );
  }, [data, limit]);

  return {
    agents,
    loading,
    error,
    hasResults: agents.length > 0,
  };
}
