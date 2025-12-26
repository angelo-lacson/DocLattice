/**
 * EditMessageModal - Mobile-responsive modal for editing thread messages
 *
 * Part of Issue #686 - Mobile UI Layout Improvements
 *
 * Features:
 * - Full-screen modal on mobile devices for better touch interaction
 * - Responsive layout that adapts to screen size
 * - Uses MessageComposer for consistent editing experience
 * - Loading states and error handling
 */

import React, { useState, useCallback } from "react";
import { Modal, Button } from "semantic-ui-react";
import styled from "styled-components";
import { useMutation } from "@apollo/client";
import { X, Save, AlertCircle } from "lucide-react";
import { color } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MessageComposer } from "./MessageComposer";
import {
  UPDATE_MESSAGE,
  UpdateMessageInput,
  UpdateMessageOutput,
} from "../../graphql/mutations";
import { GET_THREAD_DETAIL } from "../../graphql/queries";

/**
 * Props for the EditMessageModal component.
 */
interface EditMessageModalProps {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Global ID of the message being edited */
  messageId: string;
  /** Initial content to populate the editor with */
  initialContent: string;
  /** Corpus ID for mention context (enables @-mentions) */
  corpusId?: string;
  /** Conversation ID for refetching thread data after update */
  conversationId?: string;
  /** Callback fired after successful message update */
  onSuccess?: () => void;
}

const StyledModal = styled(Modal)`
  &&& {
    /* Desktop/tablet styles */
    width: 90vw;
    max-width: 700px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);

    /* Mobile: Full screen modal for better touch interaction */
    @media (max-width: 600px) {
      width: 100vw !important;
      max-width: 100vw !important;
      height: 100vh !important;
      max-height: 100vh !important;
      margin: 0 !important;
      border-radius: 0;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
    }

    & > .content {
      padding: 0;

      @media (max-width: 600px) {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
    }
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md} ${spacing.lg};
  background: ${color.N2};
  border-bottom: 1px solid ${color.N4};

  @media (max-width: 600px) {
    padding: ${spacing.md};
    /* Safe area for notched devices */
    padding-top: max(${spacing.md}, env(safe-area-inset-top));
  }
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: ${color.N10};
  display: flex;
  align-items: center;
  gap: ${spacing.sm};

  @media (max-width: 600px) {
    font-size: 16px;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${color.N7};
  cursor: pointer;
  padding: ${spacing.xs};
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  /* Larger touch target on mobile */
  @media (max-width: 600px) {
    width: 44px;
    height: 44px;
  }

  &:hover {
    background: ${color.N3};
    color: ${color.N9};
  }

  &:active {
    background: ${color.N4};
  }
`;

const ModalContent = styled.div`
  padding: ${spacing.lg};
  flex: 1;
  overflow-y: auto;

  @media (max-width: 600px) {
    padding: ${spacing.md};
    /* Account for virtual keyboard */
    padding-bottom: max(${spacing.md}, env(safe-area-inset-bottom));
  }
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${spacing.sm};
  padding: ${spacing.md} ${spacing.lg};
  background: ${color.N2};
  border-top: 1px solid ${color.N4};

  @media (max-width: 600px) {
    padding: ${spacing.md};
    /* Safe area for bottom */
    padding-bottom: max(${spacing.md}, env(safe-area-inset-bottom));
    /* Full-width buttons on mobile */
    flex-direction: column-reverse;
    gap: ${spacing.xs};
  }
`;

const ActionButton = styled(Button)<{ $variant?: "primary" | "secondary" }>`
  &&& {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${spacing.xs};
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.2s;
    min-height: 44px;

    @media (max-width: 600px) {
      width: 100%;
      padding: 12px 20px;
    }

    ${(props) =>
      props.$variant === "primary" &&
      `
      background: linear-gradient(135deg, ${color.B6} 0%, ${color.B5} 100%);
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(74, 144, 226, 0.35);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #5a7ee2 0%, ${color.B6} 100%);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(74, 144, 226, 0.45);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
    `}

    ${(props) =>
      props.$variant === "secondary" &&
      `
      background: ${color.N1};
      color: ${color.N8};
      border: 1px solid ${color.N4};

      &:hover:not(:disabled) {
        background: ${color.N2};
        border-color: ${color.N5};
      }
    `}
  }
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.xs};
  padding: ${spacing.sm} ${spacing.md};
  background: ${color.R1};
  color: ${color.R7};
  border: 1px solid ${color.R3};
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: ${spacing.md};

  svg {
    flex-shrink: 0;
  }
`;

export const EditMessageModal: React.FC<EditMessageModalProps> = ({
  isOpen,
  onClose,
  messageId,
  initialContent,
  corpusId,
  conversationId,
  onSuccess,
}) => {
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);

  const [updateMessage, { loading }] = useMutation<
    UpdateMessageOutput,
    UpdateMessageInput
  >(UPDATE_MESSAGE);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      setError("Message cannot be empty");
      return;
    }

    try {
      // Build refetch queries if conversationId is available
      const refetchQueries = conversationId
        ? [
            {
              query: GET_THREAD_DETAIL,
              variables: { conversationId },
            },
          ]
        : [];

      const result = await updateMessage({
        variables: {
          messageId,
          content,
        },
        refetchQueries,
        awaitRefetchQueries: true,
      });

      if (result.data?.updateMessage.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(
          result.data?.updateMessage.message || "Failed to update message"
        );
      }
    } catch (err) {
      console.error("Error updating message:", err);
      setError("An error occurred while updating the message");
    }
  }, [content, messageId, conversationId, updateMessage, onSuccess, onClose]);

  const handleClose = useCallback(() => {
    // Check for unsaved changes
    if (content !== initialContent) {
      if (
        window.confirm(
          "You have unsaved changes. Are you sure you want to close?"
        )
      ) {
        setContent(initialContent);
        setError(null);
        onClose();
      }
    } else {
      onClose();
    }
  }, [content, initialContent, onClose]);

  const hasChanges = content !== initialContent;

  return (
    <StyledModal
      open={isOpen}
      onClose={handleClose}
      closeOnDimmerClick={!hasChanges}
    >
      <Modal.Content>
        <ModalHeader>
          <ModalTitle>Edit Message</ModalTitle>
          <CloseButton onClick={handleClose} aria-label="Close modal">
            <X size={20} />
          </CloseButton>
        </ModalHeader>

        <ModalContent>
          {error && (
            <ErrorMessage>
              <AlertCircle size={16} />
              {error}
            </ErrorMessage>
          )}

          <MessageComposer
            placeholder="Edit your message..."
            initialContent={initialContent}
            onChange={handleContentChange}
            onSubmit={handleSave}
            disabled={loading}
            autoFocus
            enableMentions
            corpusId={corpusId}
          />
        </ModalContent>

        <ModalFooter>
          <ActionButton
            $variant="secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </ActionButton>
          <ActionButton
            $variant="primary"
            onClick={handleSave}
            disabled={loading || !hasChanges || !content.trim()}
            loading={loading}
            aria-label={loading ? "Saving changes..." : "Save message changes"}
          >
            <Save size={16} />
            Save Changes
          </ActionButton>
        </ModalFooter>
      </Modal.Content>
    </StyledModal>
  );
};

export default EditMessageModal;
