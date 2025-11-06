import React from "react";
import { MessageNode } from "./utils";
import { MessageItem } from "./MessageItem";

interface MessageTreeProps {
  messages: MessageNode[];
  highlightedMessageId?: string | null;
  onReply?: (messageId: string) => void;
}

/**
 * Recursive component for rendering hierarchical message tree
 * Handles nested replies with proper indentation
 */
export function MessageTree({
  messages,
  highlightedMessageId,
  onReply,
}: MessageTreeProps) {
  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <>
      {messages.map((message) => (
        <React.Fragment key={message.id}>
          {/* Render current message */}
          <MessageItem
            message={message}
            isHighlighted={message.id === highlightedMessageId}
            onReply={onReply}
          />

          {/* Recursively render children */}
          {message.children && message.children.length > 0 && (
            <MessageTree
              messages={message.children}
              highlightedMessageId={highlightedMessageId}
              onReply={onReply}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
}
