import { useState, useEffect } from "react";
import { useLazyQuery } from "@apollo/client";
import {
  SEARCH_USERS_FOR_MENTION,
  SearchUsersForMentionInput,
  SearchUsersForMentionOutput,
} from "../../../graphql/queries";
import { MentionUser } from "../MentionPicker";

/**
 * Hook to fetch users for @mention autocomplete via GraphQL.
 *
 * Uses SEARCH_USERS_FOR_MENTION query with debounced input.
 * Backend filters results by privacy settings via UserQueryOptimizer.
 *
 * @param query - Search query string
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 * @param minChars - Minimum characters before searching (default: 2)
 */
export function useMentionUsers(
  query: string,
  debounceMs: number = 300,
  minChars: number = 2
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const [searchUsers, { data, loading, error }] = useLazyQuery<
    SearchUsersForMentionOutput,
    SearchUsersForMentionInput
  >(SEARCH_USERS_FOR_MENTION, {
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
    if (debouncedQuery.length < minChars) {
      return;
    }

    searchUsers({ variables: { textSearch: debouncedQuery } });
  }, [debouncedQuery, minChars, searchUsers]);

  // Map GraphQL response to MentionUser[]
  const users: MentionUser[] =
    data?.searchUsersForMention?.edges?.map((edge) => ({
      id: edge.node.id,
      username: edge.node.username,
      email: edge.node.email ?? undefined,
    })) ?? [];

  return {
    users,
    loading,
    error: error ?? null,
  };
}
