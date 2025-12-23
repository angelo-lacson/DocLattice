/**
 * NetworkStatusHandler - Component that handles network recovery and reconnection.
 *
 * This component monitors page visibility and network status changes, and
 * automatically refetches active Apollo Client queries when:
 * - The page becomes visible after being hidden (e.g., screen unlock on mobile)
 * - The network comes back online after being offline
 *
 * It also displays toast notifications to inform users of connectivity changes.
 *
 * Related to Issue #697 - Error on screen unlock
 */

import { useCallback, useRef } from "react";
import { useApolloClient, useReactiveVar } from "@apollo/client";
import { toast } from "react-toastify";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { authStatusVar, authToken } from "../../graphql/cache";

/**
 * Props for the NetworkStatusHandler component.
 */
export interface NetworkStatusHandlerProps {
  /** Minimum time (ms) hidden before triggering a refetch (default: 2000) */
  resumeThreshold?: number;
  /** Whether to show toast notifications (default: true) */
  showToasts?: boolean;
  /** Whether to refetch queries on resume (default: true) */
  refetchOnResume?: boolean;
  /** Whether to refetch queries when coming back online (default: true) */
  refetchOnOnline?: boolean;
}

/**
 * Component that handles network recovery and reconnection.
 *
 * This component should be placed inside the ApolloProvider to have access
 * to the Apollo Client for refetching queries.
 *
 * @example
 * ```tsx
 * <ApolloProvider client={client}>
 *   <NetworkStatusHandler />
 *   <App />
 * </ApolloProvider>
 * ```
 */
export function NetworkStatusHandler({
  resumeThreshold = 2000,
  showToasts = true,
  refetchOnResume = true,
  refetchOnOnline = true,
}: NetworkStatusHandlerProps = {}) {
  const client = useApolloClient();
  const auth_status = useReactiveVar(authStatusVar);
  const token = useReactiveVar(authToken);

  // Track if we've shown the offline toast to avoid duplicates
  const offlineToastShownRef = useRef(false);
  // Track last refetch time to debounce
  const lastRefetchRef = useRef(0);

  /**
   * Refetch all active queries with debouncing.
   */
  const refetchActiveQueries = useCallback(
    async (reason: string) => {
      const now = Date.now();
      // Debounce: don't refetch if we just did within the last 2 seconds
      if (now - lastRefetchRef.current < 2000) {
        console.log(
          `[NetworkStatusHandler] Skipping refetch (debounced): ${reason}`
        );
        return;
      }
      lastRefetchRef.current = now;

      try {
        console.log(`[NetworkStatusHandler] Refetching active queries: ${reason}`);

        // Refetch all active (observed) queries
        // This will re-execute queries that components are currently watching
        await client.refetchQueries({
          include: "active",
        });

        console.log("[NetworkStatusHandler] Refetch completed successfully");
      } catch (error) {
        console.error("[NetworkStatusHandler] Error refetching queries:", error);

        // If refetch fails, it might be a network issue
        // The errorLink will handle showing appropriate error messages
      }
    },
    [client]
  );

  /**
   * Handle page resume (visibility change from hidden to visible).
   */
  const handleResume = useCallback(() => {
    console.log("[NetworkStatusHandler] Page resumed from background");

    // Only refetch if we have authentication or are in anonymous mode
    // and refetchOnResume is enabled
    if (!refetchOnResume) {
      return;
    }

    // Check if we're online before attempting refetch
    if (!navigator.onLine) {
      console.log(
        "[NetworkStatusHandler] Skipping refetch: device is offline"
      );
      return;
    }

    // Refetch active queries to get fresh data
    refetchActiveQueries("page resumed from background");

    // Show a subtle notification that we're reconnecting
    if (showToasts) {
      toast.info("Reconnecting...", {
        toastId: "network-reconnecting",
        autoClose: 1500,
        position: "bottom-right",
      });
    }
  }, [refetchOnResume, refetchActiveQueries, showToasts]);

  /**
   * Handle page hide (visibility change from visible to hidden).
   */
  const handleHide = useCallback(() => {
    console.log("[NetworkStatusHandler] Page hidden");
    // We could optionally pause polling queries here, but for now we just log
  }, []);

  /**
   * Handle network coming back online.
   */
  const handleOnline = useCallback(() => {
    console.log("[NetworkStatusHandler] Network came online");

    // Clear the offline toast tracking
    offlineToastShownRef.current = false;

    if (showToasts) {
      // Dismiss any offline toast
      toast.dismiss("network-offline");

      toast.success("Connection restored", {
        toastId: "network-online",
        autoClose: 3000,
        position: "bottom-right",
      });
    }

    if (refetchOnOnline) {
      // Slight delay to allow network to stabilize
      setTimeout(() => {
        refetchActiveQueries("network came online");
      }, 500);
    }
  }, [showToasts, refetchOnOnline, refetchActiveQueries]);

  /**
   * Handle network going offline.
   */
  const handleOffline = useCallback(() => {
    console.log("[NetworkStatusHandler] Network went offline");

    if (showToasts && !offlineToastShownRef.current) {
      offlineToastShownRef.current = true;

      toast.warning("You appear to be offline. Some features may not work.", {
        toastId: "network-offline",
        autoClose: false, // Keep visible until online
        position: "bottom-right",
      });
    }
  }, [showToasts]);

  // Set up the network status monitoring
  useNetworkStatus({
    onResume: handleResume,
    onHide: handleHide,
    onOnline: handleOnline,
    onOffline: handleOffline,
    resumeThreshold,
    enabled: true,
  });

  // This component doesn't render anything
  return null;
}

export default NetworkStatusHandler;
