import React, { useState } from "react";
import styled from "styled-components";
import { Pin, Lock, Trash2, RotateCcw } from "lucide-react";
import { useMutation } from "@apollo/client";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_SHADOWS,
  CORPUS_TRANSITIONS,
  mediaQuery,
} from "./styles/discussionStyles";
import {
  PIN_THREAD,
  UNPIN_THREAD,
  LOCK_THREAD,
  UNLOCK_THREAD,
  DELETE_THREAD,
  RESTORE_THREAD,
  PinThreadInput,
  PinThreadOutput,
  UnpinThreadInput,
  UnpinThreadOutput,
  LockThreadInput,
  LockThreadOutput,
  UnlockThreadInput,
  UnlockThreadOutput,
  DeleteThreadInput,
  DeleteThreadOutput,
  RestoreThreadInput,
  RestoreThreadOutput,
} from "../../graphql/mutations";
import { GET_CONVERSATIONS, GET_THREAD_DETAIL } from "../../graphql/queries";

const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem;
  background: ${CORPUS_COLORS.slate[50]};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.lg};
`;

const ModerationButton = styled.button<{
  $variant?: "danger" | "warning" | "primary";
}>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid;
  border-radius: ${CORPUS_RADII.md};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  ${({ $variant }) => {
    switch ($variant) {
      case "danger":
        return `
          background: #fee2e2;
          border-color: #fca5a5;
          color: #dc2626;
          &:hover:not(:disabled) {
            background: #fecaca;
            border-color: #f87171;
          }
        `;
      case "warning":
        return `
          background: #fef3c7;
          border-color: #fcd34d;
          color: #92400e;
          &:hover:not(:disabled) {
            background: #fde68a;
            border-color: #fbbf24;
          }
        `;
      default:
        return `
          background: ${CORPUS_COLORS.teal[50]};
          border-color: ${CORPUS_COLORS.teal[200]};
          color: ${CORPUS_COLORS.teal[700]};
          &:hover:not(:disabled) {
            background: ${CORPUS_COLORS.teal[100]};
            border-color: ${CORPUS_COLORS.teal[300]};
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const ConfirmDialog = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const ConfirmBox = styled.div`
  background: ${CORPUS_COLORS.white};
  border-radius: ${CORPUS_RADII.lg};
  padding: 1.5rem;
  max-width: 25rem;
  width: 100%;
  box-shadow: ${CORPUS_SHADOWS.xl};
`;

const ConfirmTitle = styled.h3`
  margin: 0 0 0.75rem 0;
  font-family: ${CORPUS_FONTS.serif};
  font-size: 1.125rem;
  font-weight: 600;
  color: ${CORPUS_COLORS.slate[800]};
`;

const ConfirmMessage = styled.p`
  margin: 0 0 1.25rem 0;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.875rem;
  color: ${CORPUS_COLORS.slate[600]};
  line-height: 1.5;
`;

const ConfirmActions = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
`;

const ConfirmButton = styled.button<{ $primary?: boolean }>`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: ${CORPUS_RADII.md};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  ${({ $primary }) =>
    $primary
      ? `
    background: #dc2626;
    color: white;
    &:hover:not(:disabled) {
      background: #b91c1c;
    }
  `
      : `
    background: ${CORPUS_COLORS.white};
    border: 1px solid ${CORPUS_COLORS.slate[200]};
    color: ${CORPUS_COLORS.slate[700]};
    &:hover:not(:disabled) {
      background: ${CORPUS_COLORS.slate[50]};
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  padding: 0.5rem 0.75rem;
  background: #fee2e2;
  color: #dc2626;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  border-radius: ${CORPUS_RADII.sm};
  margin-top: 0.5rem;
`;

export interface ModerationControlsProps {
  /** ID of the conversation/thread */
  conversationId: string;
  /** Current pinned state */
  isPinned: boolean;
  /** Current locked state */
  isLocked: boolean;
  /** Current deleted state */
  isDeleted: boolean;
  /** Corpus ID for refetching */
  corpusId?: string;
  /** Callback when moderation action succeeds */
  onSuccess?: () => void;
}

export function ModerationControls({
  conversationId,
  isPinned,
  isLocked,
  isDeleted,
  corpusId,
  onSuccess,
}: ModerationControlsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchQueries = corpusId
    ? [
        {
          query: GET_CONVERSATIONS,
          variables: { corpusId, conversationType: "THREAD" },
        },
        {
          query: GET_THREAD_DETAIL,
          variables: { conversationId },
        },
      ]
    : [
        {
          query: GET_THREAD_DETAIL,
          variables: { conversationId },
        },
      ];

  const [pinThread, { loading: pinning }] = useMutation<
    PinThreadOutput,
    PinThreadInput
  >(PIN_THREAD, {
    refetchQueries,
    onCompleted: (data) => {
      if (data.pinThread.ok) {
        onSuccess?.();
      } else {
        setError(data.pinThread.message || "Failed to pin thread");
      }
    },
    onError: (err) => {
      setError("An error occurred while pinning the thread");
      console.error(err);
    },
  });

  const [unpinThread, { loading: unpinning }] = useMutation<
    UnpinThreadOutput,
    UnpinThreadInput
  >(UNPIN_THREAD, {
    refetchQueries,
    onCompleted: (data) => {
      if (data.unpinThread.ok) {
        onSuccess?.();
      } else {
        setError(data.unpinThread.message || "Failed to unpin thread");
      }
    },
    onError: (err) => {
      setError("An error occurred while unpinning the thread");
      console.error(err);
    },
  });

  const [lockThread, { loading: locking }] = useMutation<
    LockThreadOutput,
    LockThreadInput
  >(LOCK_THREAD, {
    refetchQueries,
    onCompleted: (data) => {
      if (data.lockThread.ok) {
        onSuccess?.();
      } else {
        setError(data.lockThread.message || "Failed to lock thread");
      }
    },
    onError: (err) => {
      setError("An error occurred while locking the thread");
      console.error(err);
    },
  });

  const [unlockThread, { loading: unlocking }] = useMutation<
    UnlockThreadOutput,
    UnlockThreadInput
  >(UNLOCK_THREAD, {
    refetchQueries,
    onCompleted: (data) => {
      if (data.unlockThread.ok) {
        onSuccess?.();
      } else {
        setError(data.unlockThread.message || "Failed to unlock thread");
      }
    },
    onError: (err) => {
      setError("An error occurred while unlocking the thread");
      console.error(err);
    },
  });

  const [deleteThread, { loading: deleting }] = useMutation<
    DeleteThreadOutput,
    DeleteThreadInput
  >(DELETE_THREAD, {
    refetchQueries,
    onCompleted: (data) => {
      if (data.deleteThread.ok) {
        setShowDeleteConfirm(false);
        onSuccess?.();
      } else {
        setError(data.deleteThread.message || "Failed to delete thread");
      }
    },
    onError: (err) => {
      setError("An error occurred while deleting the thread");
      console.error(err);
    },
  });

  const [restoreThread, { loading: restoring }] = useMutation<
    RestoreThreadOutput,
    RestoreThreadInput
  >(RESTORE_THREAD, {
    refetchQueries,
    onCompleted: (data) => {
      if (data.restoreThread.ok) {
        onSuccess?.();
      } else {
        setError(data.restoreThread.message || "Failed to restore thread");
      }
    },
    onError: (err) => {
      setError("An error occurred while restoring the thread");
      console.error(err);
    },
  });

  const loading =
    pinning || unpinning || locking || unlocking || deleting || restoring;

  const handlePinToggle = () => {
    setError(null);
    if (isPinned) {
      unpinThread({ variables: { conversationId } });
    } else {
      pinThread({ variables: { conversationId } });
    }
  };

  const handleLockToggle = () => {
    setError(null);
    if (isLocked) {
      unlockThread({ variables: { conversationId } });
    } else {
      lockThread({ variables: { conversationId } });
    }
  };

  const handleDeleteClick = () => {
    setError(null);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    deleteThread({ variables: { conversationId } });
  };

  const handleRestore = () => {
    setError(null);
    restoreThread({ variables: { conversationId } });
  };

  return (
    <>
      <Container>
        <ModerationButton
          onClick={handlePinToggle}
          disabled={loading || isDeleted}
          title={isPinned ? "Unpin thread" : "Pin thread"}
          aria-label={isPinned ? "Unpin thread" : "Pin thread"}
        >
          <Pin />
          {isPinned ? "Unpin" : "Pin"}
        </ModerationButton>

        <ModerationButton
          onClick={handleLockToggle}
          disabled={loading || isDeleted}
          $variant="warning"
          title={isLocked ? "Unlock thread" : "Lock thread"}
          aria-label={isLocked ? "Unlock thread" : "Lock thread"}
        >
          <Lock />
          {isLocked ? "Unlock" : "Lock"}
        </ModerationButton>

        {!isDeleted ? (
          <ModerationButton
            onClick={handleDeleteClick}
            disabled={loading}
            $variant="danger"
            title="Delete thread"
            aria-label="Delete thread"
          >
            <Trash2 />
            Delete
          </ModerationButton>
        ) : (
          <ModerationButton
            onClick={handleRestore}
            disabled={loading}
            title="Restore thread"
            aria-label="Restore thread"
          >
            <RotateCcw />
            Restore
          </ModerationButton>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}
      </Container>

      {showDeleteConfirm && (
        <ConfirmDialog onClick={() => setShowDeleteConfirm(false)}>
          <ConfirmBox onClick={(e) => e.stopPropagation()}>
            <ConfirmTitle>Delete Thread?</ConfirmTitle>
            <ConfirmMessage>
              Are you sure you want to delete this thread? This is a soft delete
              and can be reversed by moderators.
            </ConfirmMessage>
            <ConfirmActions>
              <ConfirmButton
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </ConfirmButton>
              <ConfirmButton
                $primary
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Thread"}
              </ConfirmButton>
            </ConfirmActions>
          </ConfirmBox>
        </ConfirmDialog>
      )}
    </>
  );
}
