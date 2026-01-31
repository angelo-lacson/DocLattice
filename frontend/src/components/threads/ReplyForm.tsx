import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import styled from "styled-components";
import { X, Quote } from "lucide-react";
import {
  CREATE_THREAD_MESSAGE,
  REPLY_TO_MESSAGE,
  CreateThreadMessageInput,
  CreateThreadMessageOutput,
  ReplyToMessageInput,
  ReplyToMessageOutput,
} from "../../graphql/mutations";
import { GET_THREAD_DETAIL } from "../../graphql/queries";
import { MessageComposer } from "./MessageComposer";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_TRANSITIONS,
} from "./styles/discussionStyles";

const Container = styled.div`
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.lg};
  background: ${CORPUS_COLORS.slate[50]};
  padding: 0.875rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
`;

const ReplyingTo = styled.div`
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  color: ${CORPUS_COLORS.slate[600]};

  strong {
    color: ${CORPUS_COLORS.teal[700]};
    font-weight: 600;
  }
`;

const CancelButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: ${CORPUS_RADII.sm};
  background: transparent;
  font-family: ${CORPUS_FONTS.sans};
  color: ${CORPUS_COLORS.slate[500]};
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  &:hover {
    background: ${CORPUS_COLORS.slate[200]};
    color: ${CORPUS_COLORS.slate[700]};
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const ErrorMessage = styled.div`
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: ${CORPUS_RADII.md};
  font-family: ${CORPUS_FONTS.sans};
  color: #dc2626;
  font-size: 0.8125rem;
`;

const QuoteButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.sm};
  background: ${CORPUS_COLORS.white};
  font-family: ${CORPUS_FONTS.sans};
  color: ${CORPUS_COLORS.slate[600]};
  font-size: 0.75rem;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};
  margin-left: auto;

  &:hover {
    background: ${CORPUS_COLORS.teal[50]};
    border-color: ${CORPUS_COLORS.teal[300]};
    color: ${CORPUS_COLORS.teal[700]};
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const QuotedMessage = styled.div`
  padding: 0.625rem;
  margin-bottom: 0.625rem;
  border-left: 3px solid ${CORPUS_COLORS.teal[400]};
  background: ${CORPUS_COLORS.slate[100]};
  border-radius: ${CORPUS_RADII.sm};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  color: ${CORPUS_COLORS.slate[600]};
  font-style: italic;

  &::before {
    content: "Quoting:";
    display: block;
    font-weight: 600;
    font-style: normal;
    margin-bottom: 0.25rem;
    color: ${CORPUS_COLORS.slate[700]};
  }
`;

export interface ReplyFormProps {
  /** ID of the conversation (required for top-level messages) */
  conversationId?: string;
  /** ID of the parent message (for nested replies) */
  parentMessageId?: string;
  /** Username of the person being replied to */
  replyingToUsername?: string;
  /** Parent message content to quote */
  parentMessageContent?: string;
  /** Called when reply is submitted successfully */
  onSuccess?: () => void;
  /** Called when reply is cancelled */
  onCancel: () => void;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Initial content (for testing) */
  initialContent?: string;
  /** Corpus ID for context-aware mention search (Issue #741) */
  corpusId?: string;
}

export function ReplyForm({
  conversationId,
  parentMessageId,
  replyingToUsername,
  parentMessageContent,
  onSuccess,
  onCancel,
  autoFocus = true,
  initialContent,
  corpusId,
}: ReplyFormProps) {
  const [error, setError] = useState("");
  const [showQuote, setShowQuote] = useState(false);

  // Submission guard to prevent double submissions
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine which mutation to use
  const isTopLevel = !parentMessageId && conversationId;
  const isNestedReply = !!parentMessageId;

  // Top-level message mutation
  const [createMessage, { loading: createLoading }] = useMutation<
    CreateThreadMessageOutput,
    CreateThreadMessageInput
  >(CREATE_THREAD_MESSAGE, {
    refetchQueries: conversationId
      ? [
          {
            query: GET_THREAD_DETAIL,
            variables: { conversationId },
          },
        ]
      : [],
    onCompleted: (data) => {
      if (data.createThreadMessage.ok) {
        onSuccess?.();
      } else {
        setError(
          data.createThreadMessage.message ||
            "Failed to post message. Please try again."
        );
      }
    },
    onError: (err) => {
      console.error("Failed to create message:", err);
      setError("An unexpected error occurred. Please try again.");
    },
  });

  // Nested reply mutation
  const [replyToMessage, { loading: replyLoading }] = useMutation<
    ReplyToMessageOutput,
    ReplyToMessageInput
  >(REPLY_TO_MESSAGE, {
    refetchQueries:
      conversationId && parentMessageId
        ? [
            {
              query: GET_THREAD_DETAIL,
              variables: { conversationId },
            },
          ]
        : [],
    onCompleted: (data) => {
      if (data.replyToMessage.ok) {
        onSuccess?.();
      } else {
        setError(
          data.replyToMessage.message ||
            "Failed to post reply. Please try again."
        );
      }
    },
    onError: (err) => {
      console.error("Failed to create reply:", err);
      setError("An unexpected error occurred. Please try again.");
    },
  });

  const loading = createLoading || replyLoading;

  const handleSubmit = async (content: string) => {
    // Guard against double submissions
    if (isSubmitting) {
      console.warn("[ReplyForm] Blocked duplicate submission");
      return;
    }

    setError("");

    if (!content.trim()) {
      setError("Please write a message.");
      return;
    }

    // Set submission guard
    setIsSubmitting(true);

    try {
      if (isTopLevel && conversationId) {
        await createMessage({
          variables: {
            conversationId,
            content,
          },
        });
      } else if (isNestedReply && parentMessageId) {
        await replyToMessage({
          variables: {
            parentMessageId,
            content,
          },
        });
      } else {
        setError("Invalid reply configuration.");
      }
    } catch (err) {
      // Error already handled in mutation callbacks
    } finally {
      // Reset submission guard after a short delay to prevent rapid re-submissions
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  const handleToggleQuote = () => {
    setShowQuote(!showQuote);
  };

  // Extract plain text from HTML content for quote
  const getPlainTextFromHTML = (html: string) => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  const quotedText = parentMessageContent
    ? getPlainTextFromHTML(parentMessageContent)
    : "";

  return (
    <Container>
      {replyingToUsername && (
        <Header>
          <ReplyingTo>
            Replying to <strong>@{replyingToUsername}</strong>
          </ReplyingTo>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {parentMessageContent && (
              <QuoteButton
                onClick={handleToggleQuote}
                title="Quote parent message"
              >
                <Quote />
                {showQuote ? "Hide Quote" : "Quote"}
              </QuoteButton>
            )}
            <CancelButton onClick={onCancel} title="Cancel">
              <X />
              Cancel
            </CancelButton>
          </div>
        </Header>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {showQuote && quotedText && (
        <QuotedMessage>
          {quotedText.length > 200
            ? quotedText.substring(0, 200) + "..."
            : quotedText}
        </QuotedMessage>
      )}

      <MessageComposer
        placeholder={
          replyingToUsername
            ? `Reply to @${replyingToUsername}...`
            : "Write your message..."
        }
        onSubmit={handleSubmit}
        disabled={loading || isSubmitting}
        error={error}
        autoFocus={autoFocus}
        maxLength={10000}
        initialContent={initialContent}
        corpusId={corpusId}
      />
    </Container>
  );
}
