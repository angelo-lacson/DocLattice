import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import styled from "styled-components";
import { X } from "lucide-react";
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

const Container = styled.div`
  border: 1px solid ${({ theme }) => theme.color.borders.tertiary};
  border-radius: 8px;
  background: ${({ theme }) => theme.color.background.secondary};
  padding: 12px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const ReplyingTo = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.text.secondary};

  strong {
    color: ${({ theme }) => theme.color.text.primary};
    font-weight: 500;
  }
`;

const CancelButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${({ theme }) => theme.color.text.secondary};
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.color.background.tertiary};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ErrorMessage = styled.div`
  padding: 8px 12px;
  margin-bottom: 12px;
  background: ${({ theme }) => theme.color.error}15;
  border: 1px solid ${({ theme }) => theme.color.error}40;
  border-radius: 6px;
  color: ${({ theme }) => theme.color.error};
  font-size: 13px;
`;

export interface ReplyFormProps {
  /** ID of the conversation (required for top-level messages) */
  conversationId?: string;
  /** ID of the parent message (for nested replies) */
  parentMessageId?: string;
  /** Username of the person being replied to */
  replyingToUsername?: string;
  /** Called when reply is submitted successfully */
  onSuccess?: () => void;
  /** Called when reply is cancelled */
  onCancel: () => void;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function ReplyForm({
  conversationId,
  parentMessageId,
  replyingToUsername,
  onSuccess,
  onCancel,
  autoFocus = true,
}: ReplyFormProps) {
  const [error, setError] = useState("");

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
    setError("");

    if (!content.trim()) {
      setError("Please write a message.");
      return;
    }

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
    }
  };

  return (
    <Container>
      {replyingToUsername && (
        <Header>
          <ReplyingTo>
            Replying to <strong>@{replyingToUsername}</strong>
          </ReplyingTo>
          <CancelButton onClick={onCancel} title="Cancel">
            <X />
            Cancel
          </CancelButton>
        </Header>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <MessageComposer
        placeholder={
          replyingToUsername
            ? `Reply to @${replyingToUsername}...`
            : "Write your message..."
        }
        onSubmit={handleSubmit}
        disabled={loading}
        error={error}
        autoFocus={autoFocus}
        maxLength={10000}
      />
    </Container>
  );
}
