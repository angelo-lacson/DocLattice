import { getUnifiedAgentWebSocket } from "../../chat/get_websockets";

/**
 * Get WebSocket URL for document queries.
 *
 * @deprecated This function now delegates to getUnifiedAgentWebSocket() which uses
 * the secure unified endpoint with proper permission checks. The legacy
 * DocumentQueryConsumer and StandaloneDocumentQueryConsumer have been deprecated.
 *
 * @param documentId - Document identifier.
 * @param token - Optional authentication token from the user session.
 * @param conversationId - (Optional) If provided, the conversation id to load from.
 * @param corpusId - (Optional) If provided, scopes the document to a corpus.
 * @returns WebSocket URL with necessary query parameters.
 */
export const getWebSocketUrl = (
  documentId: string,
  token?: string,
  conversationId?: string,
  corpusId?: string
): string => {
  // Delegate to unified endpoint for proper permission enforcement
  return getUnifiedAgentWebSocket(
    { documentId, corpusId, conversationId },
    token
  );
};
