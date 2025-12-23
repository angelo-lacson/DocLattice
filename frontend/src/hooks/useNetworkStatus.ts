/**
 * useNetworkStatus - Hook for detecting page visibility and network status changes.
 *
 * This hook monitors:
 * - Page visibility (using the visibilitychange event)
 * - Network status (using online/offline events)
 *
 * It's particularly useful for mobile devices where the app may be suspended
 * when the screen is locked, and needs to reconnect when unlocked.
 *
 * Related to Issue #697 - Error on screen unlock
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Network and visibility status.
 */
export interface NetworkStatus {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Whether the page is currently visible */
  isVisible: boolean;
  /** Timestamp of last visibility change */
  lastVisibilityChange: number;
  /** Timestamp of last network status change */
  lastNetworkChange: number;
  /** Whether the app just resumed from being hidden */
  justResumed: boolean;
}

/**
 * Options for the useNetworkStatus hook.
 */
export interface UseNetworkStatusOptions {
  /** Callback when the page becomes visible after being hidden */
  onResume?: () => void;
  /** Callback when the page becomes hidden */
  onHide?: () => void;
  /** Callback when the network comes back online */
  onOnline?: () => void;
  /** Callback when the network goes offline */
  onOffline?: () => void;
  /** Minimum time (ms) hidden before onResume is called (default: 1000) */
  resumeThreshold?: number;
  /** Whether to enable the hook (default: true) */
  enabled?: boolean;
}

/**
 * Return value of the useNetworkStatus hook.
 */
export interface UseNetworkStatusReturn {
  /** Current network and visibility status */
  status: NetworkStatus;
  /** Manually trigger a resume action (useful for testing) */
  triggerResume: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for monitoring page visibility and network status.
 *
 * @param options - Configuration options
 * @returns Network status and control functions
 *
 * @example
 * ```tsx
 * const { status } = useNetworkStatus({
 *   onResume: () => {
 *     // Refetch data or reconnect WebSocket
 *     client.refetchQueries({ include: 'active' });
 *   },
 *   onOnline: () => {
 *     // Network recovered
 *     toast.success('Connection restored');
 *   },
 * });
 * ```
 */
export function useNetworkStatus(
  options: UseNetworkStatusOptions = {}
): UseNetworkStatusReturn {
  const {
    onResume,
    onHide,
    onOnline,
    onOffline,
    resumeThreshold = 1000,
    enabled = true,
  } = options;

  // Track when page was hidden to calculate hidden duration
  const hiddenAtRef = useRef<number>(0);

  // Store callbacks in refs to avoid effect re-runs
  const callbacksRef = useRef({
    onResume,
    onHide,
    onOnline,
    onOffline,
  });
  callbacksRef.current = {
    onResume,
    onHide,
    onOnline,
    onOffline,
  };

  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isVisible:
      typeof document !== "undefined"
        ? document.visibilityState === "visible"
        : true,
    lastVisibilityChange: Date.now(),
    lastNetworkChange: Date.now(),
    justResumed: false,
  }));

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    const isVisible = document.visibilityState === "visible";
    const now = Date.now();

    if (isVisible) {
      // Page became visible
      const hiddenDuration = hiddenAtRef.current > 0 ? now - hiddenAtRef.current : 0;
      const shouldTriggerResume = hiddenDuration >= resumeThreshold;

      setStatus((prev) => ({
        ...prev,
        isVisible: true,
        lastVisibilityChange: now,
        justResumed: shouldTriggerResume,
      }));

      if (shouldTriggerResume) {
        console.log(
          `[useNetworkStatus] Page resumed after ${hiddenDuration}ms hidden`
        );
        callbacksRef.current.onResume?.();

        // Clear justResumed after a short delay
        setTimeout(() => {
          setStatus((prev) => ({ ...prev, justResumed: false }));
        }, 100);
      }

      hiddenAtRef.current = 0;
    } else {
      // Page became hidden
      hiddenAtRef.current = now;

      setStatus((prev) => ({
        ...prev,
        isVisible: false,
        lastVisibilityChange: now,
        justResumed: false,
      }));

      callbacksRef.current.onHide?.();
    }
  }, [resumeThreshold]);

  // Handle online event
  const handleOnline = useCallback(() => {
    const now = Date.now();
    console.log("[useNetworkStatus] Network came online");

    setStatus((prev) => ({
      ...prev,
      isOnline: true,
      lastNetworkChange: now,
    }));

    callbacksRef.current.onOnline?.();
  }, []);

  // Handle offline event
  const handleOffline = useCallback(() => {
    const now = Date.now();
    console.log("[useNetworkStatus] Network went offline");

    setStatus((prev) => ({
      ...prev,
      isOnline: false,
      lastNetworkChange: now,
    }));

    callbacksRef.current.onOffline?.();
  }, []);

  // Manual trigger for testing or programmatic use
  const triggerResume = useCallback(() => {
    console.log("[useNetworkStatus] Manual resume triggered");
    setStatus((prev) => ({ ...prev, justResumed: true }));
    callbacksRef.current.onResume?.();

    setTimeout(() => {
      setStatus((prev) => ({ ...prev, justResumed: false }));
    }, 100);
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!enabled || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initialize state based on current values
    setStatus((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
      isVisible: document.visibilityState === "visible",
    }));

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, handleVisibilityChange, handleOnline, handleOffline]);

  return {
    status,
    triggerResume,
  };
}

export default useNetworkStatus;
