/**
 * useExtractCompletionNotification - Hook to listen for extract completion via WebSocket.
 *
 * This hook listens for EXTRACT_COMPLETE notifications and triggers a callback
 * when the specific extract completes. Used in ExtractDetail to replace polling.
 *
 * Issue #624: Real-time notifications for job completion.
 */

import { useCallback, useRef, useEffect } from "react";
import {
  useNotificationWebSocket,
  NotificationUpdate,
} from "./useNotificationWebSocket";

/**
 * Extract numeric ID from a GraphQL global ID.
 * Global IDs are base64 encoded "{TypeName}:{id}" strings.
 */
function extractNumericId(globalId: string): number | null {
  try {
    const decoded = atob(globalId);
    const parts = decoded.split(":");
    if (parts.length === 2) {
      return parseInt(parts[1], 10);
    }
  } catch {
    // Invalid base64 or format
  }
  return null;
}

export interface UseExtractCompletionNotificationOptions {
  /** The global ID of the extract to watch */
  extractId: string | null;
  /** Callback when the extract completes */
  onComplete: () => void;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Hook to listen for EXTRACT_COMPLETE notifications for a specific extract.
 *
 * @param options - Configuration options
 * @returns Connection state from WebSocket
 */
export function useExtractCompletionNotification(
  options: UseExtractCompletionNotificationOptions
) {
  const { extractId, onComplete, enabled = true } = options;

  // Ref to track the callback to avoid reconnection on callback changes
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Extract the numeric ID once
  const numericId = extractId ? extractNumericId(extractId) : null;

  // Handle incoming notifications
  const handleNotificationCreated = useCallback(
    (notification: NotificationUpdate) => {
      // Only process EXTRACT_COMPLETE notifications
      if (notification.notificationType !== "EXTRACT_COMPLETE") {
        return;
      }

      // Check if this notification is for our extract
      const notificationExtractId = notification.data?.extract_id;
      if (
        numericId !== null &&
        notificationExtractId !== undefined &&
        Number(notificationExtractId) === numericId
      ) {
        console.debug(
          `[useExtractCompletionNotification] Extract ${numericId} completed`
        );
        onCompleteRef.current();
      }
    },
    [numericId]
  );

  // Subscribe to WebSocket notifications
  const { connectionState } = useNotificationWebSocket({
    onNotificationCreated: handleNotificationCreated,
    enabled: enabled && numericId !== null,
    autoReconnect: true,
  });

  return {
    connectionState,
  };
}

export default useExtractCompletionNotification;
