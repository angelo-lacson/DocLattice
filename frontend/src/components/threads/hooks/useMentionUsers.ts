import { useState, useEffect } from "react";
import { useLazyQuery } from "@apollo/client";
import {
  SEARCH_USERS_FOR_MENTION,
  SearchUsersForMentionInput,
  SearchUsersForMentionOutput,
} from "../../../graphql/queries";
import { MentionUser } from "../MentionPicker";

/**
 * Standalone hook to fetch users for @mention autocomplete via GraphQL.
 *
 * Uses SEARCH_USERS_FOR_MENTION query with debounced input.
 * Backend filters results by privacy settings via UserQueryOptimizer.
 *
 * NOTE: The primary render path uses `useUnifiedMentionSearch` +
 * `UnifiedMentionPicker` (which search users, corpuses, documents,
 * annotations, and agents in parallel). This hook and the companion
 * `MentionPicker` component are exported for consumers that only need
 * user-only mention support.
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

  // Map GraphQL response to MentionUser[].
  // Guard: return empty when the live query is below minChars so stale
  // results from a previous (longer) query are not shown after backspace.
  const users: MentionUser[] =
    debouncedQuery.length < minChars
      ? []
      : data?.searchUsersForMention?.edges?.map((edge) => ({
          id: edge.node.id,
          username: edge.node.username,
          email: edge.node.email ?? undefined,
        })) ?? [];

  return {
    users,
    loading,
    error: error?.message ?? null,
  };
}
