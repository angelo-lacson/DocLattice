/**
 * useThreadWebSocket - Hook for subscribing to thread updates via WebSocket.
 *
 * This hook connects to the thread updates consumer (ws/thread-updates/)
 * to receive real-time streaming updates when agents respond to @mentions
 * in a conversation.
 *
 * Features:
 * - Automatic WebSocket connection management
 * - Agent response streaming (AGENT_STREAM_START, AGENT_STREAM_TOKEN, etc.)
 * - Tool call notifications
 * - Error handling with reconnection
 * - Heartbeat/ping-pong for connection health
 *
 * Part of Issue #623 - @ Mentions Feature (Extended) - Agent Mentions
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useReactiveVar } from "@apollo/client";
import { authToken } from "../graphql/cache";
import { getThreadUpdatesWebSocket } from "../components/chat/get_websockets";

// ============================================================================
// Types
// ============================================================================

/**
 * Message types from the thread updates WebSocket consumer.
 */
export type ThreadMessageType =
  | "CONNECTED"
  | "AGENT_STREAM_START"
  | "AGENT_STREAM_TOKEN"
  | "AGENT_TOOL_CALL"
  | "AGENT_STREAM_COMPLETE"
  | "AGENT_STREAM_ERROR"
  | "pong"
  | "heartbeat_ack";

/**
 * Structure of messages received from the thread updates consumer.
 */
export interface ThreadUpdateMessage {
  type: ThreadMessageType;
  conversation_id?: string;
  session_id?: string;
  message_id?: string;
  agent_id?: string;
  agent_name?: string;
  agent_slug?: string;
  token?: string;
  content?: string;
  sources?: Array<{
    page: number;
    json: any;
    annotation_id: number;
    label: string;
    label_id: number;
    rawText: string;
  }>;
  timeline?: Array<{
    type: string;
    tool?: string;
    args?: any;
    result?: string;
  }>;
  tool?: string;
  args?: any;
  error?: string;
}

/**
 * Streaming agent response being accumulated.
 */
export interface StreamingAgentResponse {
  messageId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  content: string;
  sources: ThreadUpdateMessage["sources"];
  timeline: ThreadUpdateMessage["timeline"];
  isComplete: boolean;
  error?: string;
}

/**
 * Connection state for the WebSocket.
 */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * Hook options.
 */
export interface UseThreadWebSocketOptions {
  /** Conversation ID to subscribe to (required) */
  conversationId: string;
  /** Callback when agent starts streaming */
  onStreamStart?: (response: StreamingAgentResponse) => void;
  /** Callback for each streaming token */
  onStreamToken?: (
    messageId: string,
    token: string,
    accumulated: string
  ) => void;
  /** Callback when agent calls a tool */
  onToolCall?: (messageId: string, tool: string, args: any) => void;
  /** Callback when agent finishes streaming */
  onStreamComplete?: (response: StreamingAgentResponse) => void;
  /** Callback on error */
  onError?: (messageId: string, error: string) => void;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
}

/**
 * Hook return value.
 */
export interface UseThreadWebSocketReturn {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Session ID from the server */
  sessionId: string | null;
  /** Currently streaming responses by message ID */
  streamingResponses: Map<string, StreamingAgentResponse>;
  /** Manually connect to WebSocket */
  connect: () => void;
  /** Manually disconnect from WebSocket */
  disconnect: () => void;
  /** Send a ping to check connection */
  sendPing: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for subscribing to thread updates via WebSocket.
 *
 * @param options - Configuration options
 * @returns WebSocket state and control functions
 */
export function useThreadWebSocket(
  options: UseThreadWebSocketOptions
): UseThreadWebSocketReturn {
  const {
    conversationId,
    onStreamStart,
    onStreamToken,
    onToolCall,
    onStreamComplete,
    onError,
    autoReconnect = true,
    reconnectDelay = 3000,
    heartbeatInterval = 30000,
  } = options;

  const token = useReactiveVar(authToken);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const streamingResponsesRef = useRef<Map<string, StreamingAgentResponse>>(
    new Map()
  );

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamingResponses, setStreamingResponses] = useState<
    Map<string, StreamingAgentResponse>
  >(new Map());

  // Clear heartbeat interval
  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // Clear reconnect timeout
  const clearReconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  }, []);

  // Update streaming responses state
  const updateStreamingResponses = useCallback(() => {
    setStreamingResponses(new Map(streamingResponsesRef.current));
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: ThreadUpdateMessage = JSON.parse(event.data);

        switch (data.type) {
          case "CONNECTED":
            setSessionId(data.session_id || null);
            break;

          case "AGENT_STREAM_START": {
            const response: StreamingAgentResponse = {
              messageId: data.message_id || "",
              agentId: data.agent_id || "",
              agentName: data.agent_name || "",
              agentSlug: data.agent_slug || "",
              content: "",
              sources: [],
              timeline: [],
              isComplete: false,
            };
            streamingResponsesRef.current.set(response.messageId, response);
            updateStreamingResponses();
            onStreamStart?.(response);
            break;
          }

          case "AGENT_STREAM_TOKEN": {
            const messageId = data.message_id || "";
            const existing = streamingResponsesRef.current.get(messageId);
            if (existing) {
              existing.content += data.token || "";
              updateStreamingResponses();
              onStreamToken?.(messageId, data.token || "", existing.content);
            }
            break;
          }

          case "AGENT_TOOL_CALL": {
            const messageId = data.message_id || "";
            const existing = streamingResponsesRef.current.get(messageId);
            if (existing && data.tool) {
              existing.timeline = [
                ...(existing.timeline || []),
                { type: "tool_call", tool: data.tool, args: data.args },
              ];
              updateStreamingResponses();
              onToolCall?.(messageId, data.tool, data.args);
            }
            break;
          }

          case "AGENT_STREAM_COMPLETE": {
            const messageId = data.message_id || "";
            const existing = streamingResponsesRef.current.get(messageId);
            if (existing) {
              existing.content = data.content || existing.content;
              existing.sources = data.sources || existing.sources;
              existing.timeline = data.timeline || existing.timeline;
              existing.isComplete = true;
              updateStreamingResponses();
              onStreamComplete?.(existing);
            }
            break;
          }

          case "AGENT_STREAM_ERROR": {
            const messageId = data.message_id || "";
            const existing = streamingResponsesRef.current.get(messageId);
            if (existing) {
              existing.error = data.error;
              existing.isComplete = true;
              updateStreamingResponses();
            }
            onError?.(messageId, data.error || "Unknown error");
            break;
          }

          case "pong":
          case "heartbeat_ack":
            // Connection is healthy
            break;
        }
      } catch (e) {
        console.error("[useThreadWebSocket] Failed to parse message:", e);
      }
    },
    [
      onStreamStart,
      onStreamToken,
      onToolCall,
      onStreamComplete,
      onError,
      updateStreamingResponses,
    ]
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (!conversationId) {
      console.warn("[useThreadWebSocket] No conversationId provided");
      return;
    }

    clearReconnect();
    setConnectionState("connecting");

    const wsUrl = getThreadUpdatesWebSocket(conversationId, token || undefined);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState("connected");
      streamingResponsesRef.current.clear();
      updateStreamingResponses();

      // Start heartbeat
      clearHeartbeat();
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, heartbeatInterval);
    };

    ws.onmessage = handleMessage;

    ws.onerror = (event) => {
      console.error("[useThreadWebSocket] WebSocket error:", event);
      setConnectionState("error");
    };

    ws.onclose = (event) => {
      clearHeartbeat();
      setConnectionState("disconnected");
      setSessionId(null);

      // Auto-reconnect if enabled and not a normal closure
      if (autoReconnect && event.code !== 1000) {
        reconnectRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };
  }, [
    conversationId,
    token,
    autoReconnect,
    reconnectDelay,
    heartbeatInterval,
    handleMessage,
    clearHeartbeat,
    clearReconnect,
    updateStreamingResponses,
  ]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    clearHeartbeat();
    clearReconnect();

    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    setConnectionState("disconnected");
    setSessionId(null);
    streamingResponsesRef.current.clear();
    updateStreamingResponses();
  }, [clearHeartbeat, clearReconnect, updateStreamingResponses]);

  // Send ping
  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  // Connect when conversationId changes
  useEffect(() => {
    if (conversationId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconnect when token changes
  useEffect(() => {
    if (connectionState === "connected" && conversationId) {
      disconnect();
      connect();
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionState,
    sessionId,
    streamingResponses,
    connect,
    disconnect,
    sendPing,
  };
}

export default useThreadWebSocket;
