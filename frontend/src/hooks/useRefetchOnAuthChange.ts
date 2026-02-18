import { useEffect } from "react";
import { useApolloClient } from "@apollo/client";

/**
 * Refetches all active Apollo queries after any cache clear.
 *
 * All authentication changes (login, logout, token refresh, session expiry)
 * flow through `client.clearStore()` via the CacheManager. This hook
 * registers a single `onClearStore` callback that refetches every active
 * observable query once the clear completes, so mounted components
 * automatically receive data appropriate to the new auth context.
 *
 * Place this hook once near the app root (e.g., in App.tsx).
 *
 * Why `onClearStore` instead of watching `authStatusVar`:
 * - No race condition: the callback fires AFTER clearStore resolves.
 * - No-op when nothing is mounted (e.g., during initial AuthGate init).
 * - Works for every auth transition without tracking previous state.
 */
export function useRefetchOnAuthChange(): void {
  const client = useApolloClient();

  useEffect(() => {
    return client.onClearStore(async () => {
      await client.refetchQueries({ include: "active" });
    });
  }, [client]);
}
