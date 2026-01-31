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
 *
 * Security Note: User-generated content is rendered using MarkdownMessageRenderer
 * which applies XSS protection via rehype-sanitize. All HTML in markdown content
 * is sanitized before being rendered to prevent XSS attacks.
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button } from "semantic-ui-react";
import styled from "styled-components";
import { useMutation } from "@apollo/client";
import { X, Save, AlertCircle } from "lucide-react";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_SHADOWS,
  CORPUS_TRANSITIONS,
  mediaQuery,
} from "./styles/discussionStyles";
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
    border-radius: ${CORPUS_RADII.xl};
    overflow: hidden;
    box-shadow: ${CORPUS_SHADOWS.xl};

    /* Mobile: Full screen modal for better touch interaction */
    ${mediaQuery.mobile} {
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

      ${mediaQuery.mobile} {
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
  padding: 1rem 1.5rem;
  background: ${CORPUS_COLORS.slate[50]};
  border-bottom: 1px solid ${CORPUS_COLORS.slate[200]};

  ${mediaQuery.mobile} {
    padding: 1rem;
    /* Safe area for notched devices */
    padding-top: max(1rem, env(safe-area-inset-top));
  }
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-family: ${CORPUS_FONTS.serif};
  font-size: 1.25rem;
  font-weight: 600;
  color: ${CORPUS_COLORS.slate[800]};
  display: flex;
  align-items: center;
  gap: 0.5rem;

  ${mediaQuery.mobile} {
    font-size: 1.125rem;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${CORPUS_COLORS.slate[500]};
  cursor: pointer;
  padding: 0.375rem;
  border-radius: ${CORPUS_RADII.md};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${CORPUS_TRANSITIONS.fast};

  /* Larger touch target on mobile */
  ${mediaQuery.mobile} {
    width: 2.75rem;
    height: 2.75rem;
  }

  &:hover {
    background: ${CORPUS_COLORS.slate[100]};
    color: ${CORPUS_COLORS.slate[700]};
  }

  &:active {
    background: ${CORPUS_COLORS.slate[200]};
  }
`;

const ModalContent = styled.div`
  padding: 1.5rem;
  flex: 1;
  overflow-y: auto;

  ${mediaQuery.mobile} {
    padding: 1rem;
    /* Account for virtual keyboard */
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  background: ${CORPUS_COLORS.slate[50]};
  border-top: 1px solid ${CORPUS_COLORS.slate[200]};

  ${mediaQuery.mobile} {
    padding: 1rem;
    /* Safe area for bottom */
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
    /* Full-width buttons on mobile */
    flex-direction: column-reverse;
    gap: 0.375rem;
  }
`;

const ActionButton = styled(Button)<{ $variant?: "primary" | "secondary" }>`
  &&& {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 1.25rem;
    border-radius: ${CORPUS_RADII.md};
    font-family: ${CORPUS_FONTS.sans};
    font-weight: 600;
    font-size: 0.875rem;
    transition: all ${CORPUS_TRANSITIONS.normal};
    min-height: 2.75rem;

    ${mediaQuery.mobile} {
      width: 100%;
      padding: 0.75rem 1.25rem;
    }

    ${(props) =>
      props.$variant === "primary" &&
      `
      background: linear-gradient(135deg, ${CORPUS_COLORS.teal[600]} 0%, ${CORPUS_COLORS.teal[700]} 100%);
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(15, 118, 110, 0.35);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, ${CORPUS_COLORS.teal[500]} 0%, ${CORPUS_COLORS.teal[600]} 100%);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(15, 118, 110, 0.45);
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
      background: ${CORPUS_COLORS.white};
      color: ${CORPUS_COLORS.slate[700]};
      border: 1px solid ${CORPUS_COLORS.slate[200]};

      &:hover:not(:disabled) {
        background: ${CORPUS_COLORS.slate[50]};
        border-color: ${CORPUS_COLORS.slate[300]};
      }
    `}
  }
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 0.875rem;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: ${CORPUS_RADII.md};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  margin-bottom: 1rem;

  svg {
    flex-shrink: 0;
  }
`;

const UnsavedWarningOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
`;

const UnsavedWarningBox = styled.div`
  background: ${CORPUS_COLORS.white};
  border-radius: ${CORPUS_RADII.lg};
  padding: 1.5rem;
  max-width: 25rem;
  width: 100%;
  box-shadow: ${CORPUS_SHADOWS.xl};

  ${mediaQuery.mobile} {
    max-width: 90vw;
  }
`;

const UnsavedWarningTitle = styled.h3`
  margin: 0 0 0.5rem 0;
  font-family: ${CORPUS_FONTS.serif};
  font-size: 1.125rem;
  font-weight: 600;
  color: ${CORPUS_COLORS.slate[800]};
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const UnsavedWarningText = styled.p`
  margin: 0 0 1rem 0;
  font-family: ${CORPUS_FONTS.sans};
  color: ${CORPUS_COLORS.slate[600]};
  font-size: 0.875rem;
  line-height: 1.5;
`;

const UnsavedWarningButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;

  ${mediaQuery.mobile} {
    flex-direction: column-reverse;
  }
`;

const UnsavedWarningButton = styled.button<{ $variant: "cancel" | "discard" }>`
  padding: 0.5rem 1rem;
  border-radius: ${CORPUS_RADII.md};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};
  border: none;

  ${mediaQuery.mobile} {
    padding: 0.75rem;
    width: 100%;
  }

  ${(props) =>
    props.$variant === "cancel" &&
    `
    background: ${CORPUS_COLORS.white};
    border: 1px solid ${CORPUS_COLORS.slate[200]};
    color: ${CORPUS_COLORS.slate[700]};

    &:hover {
      background: ${CORPUS_COLORS.slate[50]};
    }
  `}

  ${(props) =>
    props.$variant === "discard" &&
    `
    background: #dc2626;
    color: white;

    &:hover {
      background: #b91c1c;
    }
  `}
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
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  const [updateMessage, { loading }] = useMutation<
    UpdateMessageOutput,
    UpdateMessageInput
  >(UPDATE_MESSAGE);

  // Debounce timer ref for content changes (Issue #686 - Performance optimization)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleContentChange = useCallback((newContent: string) => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce content updates to reduce re-renders on rapid typing
    debounceTimerRef.current = setTimeout(() => {
      setContent(newContent);
      setError(null);
    }, 150);
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
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  }, [content, initialContent, onClose]);

  const handleConfirmClose = useCallback(() => {
    setContent(initialContent);
    setError(null);
    setShowUnsavedWarning(false);
    onClose();
  }, [initialContent, onClose]);

  const handleCancelClose = useCallback(() => {
    setShowUnsavedWarning(false);
  }, []);

  const hasChanges = content !== initialContent;

  return (
    <StyledModal
      open={isOpen}
      onClose={handleClose}
      closeOnDimmerClick={!hasChanges}
    >
      <Modal.Content style={{ position: "relative" }}>
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

        {/* Unsaved changes warning overlay */}
        {showUnsavedWarning && (
          <UnsavedWarningOverlay>
            <UnsavedWarningBox>
              <UnsavedWarningTitle>
                <AlertCircle size={20} />
                Unsaved Changes
              </UnsavedWarningTitle>
              <UnsavedWarningText>
                You have unsaved changes. Are you sure you want to close without
                saving?
              </UnsavedWarningText>
              <UnsavedWarningButtons>
                <UnsavedWarningButton
                  $variant="cancel"
                  onClick={handleCancelClose}
                >
                  Continue Editing
                </UnsavedWarningButton>
                <UnsavedWarningButton
                  $variant="discard"
                  onClick={handleConfirmClose}
                >
                  Discard Changes
                </UnsavedWarningButton>
              </UnsavedWarningButtons>
            </UnsavedWarningBox>
          </UnsavedWarningOverlay>
        )}
      </Modal.Content>
    </StyledModal>
  );
};

export default EditMessageModal;
