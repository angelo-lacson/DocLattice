import React, { useState, useEffect, useCallback } from "react";
import { useLazyQuery, useMutation, gql } from "@apollo/client";
import styled from "styled-components";
import {
  GitBranch,
  User,
  Clock,
  Calendar,
  File,
  Undo2,
  Download,
  Info,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@os-legal/ui";
import { formatDistanceToNow, format } from "date-fns";

// GraphQL query for fetching version history
export const GET_DOCUMENT_VERSION_HISTORY = gql`
  query GetDocumentVersionHistory($documentId: ID!) {
    document(id: $documentId) {
      id
      title
      versionHistory {
        versions {
          id
          versionNumber
          hash
          createdAt
          createdBy {
            username
          }
          sizeBytes
          changeType
        }
        currentVersion {
          id
          versionNumber
        }
      }
    }
  }
`;

// GraphQL mutation for restoring a document to a previous version
export const RESTORE_DOCUMENT_TO_VERSION = gql`
  mutation RestoreDocumentToVersion($documentId: ID!, $corpusId: ID!) {
    restoreDocumentToVersion(documentId: $documentId, corpusId: $corpusId) {
      ok
      message
      document {
        id
        title
        isCurrent
      }
      newVersionNumber
    }
  }
`;

const PanelContainer = styled.div`
  padding: 0;
`;

const Timeline = styled.div`
  position: relative;
  padding-left: 40px;
  margin-top: 20px;

  &::before {
    content: "";
    position: absolute;
    left: 15px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #e2e8f0;
  }
`;

const TimelineItem = styled.div<{ $isCurrent: boolean }>`
  position: relative;
  padding: 16px 0;
  padding-left: 20px;

  &::before {
    content: "";
    position: absolute;
    left: -31px;
    top: 24px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${(props) => (props.$isCurrent ? "#3b82f6" : "#cbd5e1")};
    border: 2px solid ${(props) => (props.$isCurrent ? "#1d4ed8" : "#94a3b8")};
  }

  ${(props) =>
    props.$isCurrent &&
    `
    &::after {
      content: "Current";
      position: absolute;
      left: -85px;
      top: 22px;
      font-size: 10px;
      font-weight: 600;
      color: #3b82f6;
      text-transform: uppercase;
    }
  `}
`;

const VersionCard = styled.div<{ $isCurrent: boolean }>`
  background: ${(props) => (props.$isCurrent ? "#eff6ff" : "#f8fafc")};
  border: 1px solid ${(props) => (props.$isCurrent ? "#3b82f6" : "#e2e8f0")};
  border-radius: 8px;
  padding: 12px 16px;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transform: translateX(4px);
  }
`;

const VersionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const VersionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
`;

const VersionBadge = styled.span<{ $type: string }>`
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  background: ${(props) => {
    switch (props.$type) {
      case "INITIAL":
        return "#dcfce7";
      case "CONTENT_UPDATE":
        return "#dbeafe";
      case "MINOR_EDIT":
        return "#fef3c7";
      case "MAJOR_REVISION":
        return "#fce7f3";
      default:
        return "#f1f5f9";
    }
  }};
  color: ${(props) => {
    switch (props.$type) {
      case "INITIAL":
        return "#15803d";
      case "CONTENT_UPDATE":
        return "#1d4ed8";
      case "MINOR_EDIT":
        return "#b45309";
      case "MAJOR_REVISION":
        return "#be185d";
      default:
        return "#475569";
    }
  }};
`;

const VersionMeta = styled.div`
  font-size: 12px;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;

  .meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
`;

const VersionActions = styled.div`
  margin-top: 12px;
  display: flex;
  gap: 8px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: #64748b;

  .icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.3;
  }

  h3 {
    color: #475569;
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
  }
`;

interface DocumentVersion {
  id: string;
  versionNumber: number;
  hash: string;
  createdAt: string;
  createdBy: {
    username: string;
  };
  sizeBytes?: number;
  changeType: string;
}

interface VersionHistoryData {
  versions: DocumentVersion[];
  currentVersion: {
    id: string;
    versionNumber: number;
  };
}

interface VersionHistoryPanelProps {
  documentId: string;
  corpusId: string;
  documentTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (versionId: string) => void;
  onDownload?: (versionId: string) => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  documentId,
  corpusId,
  documentTitle = "Document",
  isOpen,
  onClose,
  onRestore,
  onDownload,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  const [fetchHistory, { loading, error, data }] = useLazyQuery(
    GET_DOCUMENT_VERSION_HISTORY,
    {
      fetchPolicy: "cache-first",
    }
  );

  const [restoreToVersion, { loading: restoreLoading }] = useMutation(
    RESTORE_DOCUMENT_TO_VERSION,
    {
      onCompleted: (data) => {
        if (data.restoreDocumentToVersion.ok) {
          setRestoreSuccess(
            `Successfully restored to version ${data.restoreDocumentToVersion.newVersionNumber}`
          );
          setRestoreError(null);
          // Refetch the history to show new version
          fetchHistory({ variables: { documentId } });
        } else {
          setRestoreError(
            data.restoreDocumentToVersion.message || "Failed to restore"
          );
          setRestoreSuccess(null);
        }
      },
      onError: (error) => {
        setRestoreError(error.message || "An unexpected error occurred");
        setRestoreSuccess(null);
      },
    }
  );

  const handleRestore = useCallback(
    (versionId: string) => {
      setRestoreError(null);
      setRestoreSuccess(null);
      restoreToVersion({
        variables: {
          documentId: versionId,
          corpusId: corpusId,
        },
      });
      // Also call the external callback if provided
      onRestore?.(versionId);
    },
    [corpusId, onRestore, restoreToVersion]
  );

  // Fetch history when panel opens
  useEffect(() => {
    if (isOpen && documentId) {
      fetchHistory({ variables: { documentId } });
    }
    // fetchHistory is stable from useLazyQuery, but we only care about isOpen and documentId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId]);

  // Auto-dismiss success messages after 5 seconds
  useEffect(() => {
    if (restoreSuccess) {
      const timer = setTimeout(() => setRestoreSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [restoreSuccess]);

  // Auto-dismiss error messages after 10 seconds
  useEffect(() => {
    if (restoreError) {
      const timer = setTimeout(() => setRestoreError(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [restoreError]);

  const versionHistory: VersionHistoryData | null =
    data?.document?.versionHistory;

  const formatBytes = (bytes?: number): string => {
    if (!bytes) return "Unknown size";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const renderVersionList = () => {
    if (loading) {
      return (
        <div style={{ padding: "40px", textAlign: "center" }}>
          <Spinner size="md" />
          <div style={{ marginTop: "0.5rem", color: "#64748b" }}>
            Loading version history...
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div
          style={{
            padding: "1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
          }}
        >
          <strong
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <XCircle size={16} />
            Failed to load version history
          </strong>
          <p style={{ margin: "0.5rem 0 0 0" }}>{error.message}</p>
        </div>
      );
    }

    if (!versionHistory || versionHistory.versions.length === 0) {
      return (
        <EmptyState>
          <GitBranch size={48} />
          <h3>No Version History</h3>
          <p>This document has no previous versions.</p>
        </EmptyState>
      );
    }

    // Sort versions by version number descending (newest first)
    const sortedVersions = [...versionHistory.versions].sort(
      (a, b) => b.versionNumber - a.versionNumber
    );

    return (
      <Timeline>
        {sortedVersions.map((version) => {
          const isCurrent = version.id === versionHistory.currentVersion.id;
          const isSelected = version.id === selectedVersion;

          return (
            <TimelineItem key={version.id} $isCurrent={isCurrent}>
              <VersionCard
                $isCurrent={isCurrent}
                onClick={() => setSelectedVersion(version.id)}
                style={{
                  cursor: "pointer",
                  boxShadow: isSelected
                    ? "0 0 0 2px rgba(59, 130, 246, 0.4)"
                    : undefined,
                }}
              >
                <VersionHeader>
                  <VersionTitle>
                    Version {version.versionNumber}
                    {isCurrent && " (Current)"}
                  </VersionTitle>
                  <VersionBadge $type={version.changeType}>
                    {version.changeType.replace("_", " ")}
                  </VersionBadge>
                </VersionHeader>

                <VersionMeta>
                  <div className="meta-item">
                    <User size={11} />
                    {version.createdBy.username}
                  </div>
                  <div className="meta-item">
                    <Clock size={11} />
                    {formatDistanceToNow(new Date(version.createdAt), {
                      addSuffix: true,
                    })}
                  </div>
                  <div className="meta-item">
                    <Calendar size={11} />
                    {format(new Date(version.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                  <div className="meta-item">
                    <File size={11} />
                    {formatBytes(version.sizeBytes)}
                  </div>
                </VersionMeta>

                {isSelected && !isCurrent && (
                  <VersionActions>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={restoreLoading}
                      loading={restoreLoading}
                      leftIcon={<Undo2 size={12} />}
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        handleRestore(version.id);
                      }}
                    >
                      Restore This Version
                    </Button>
                    {onDownload && (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Download size={12} />}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          onDownload(version.id);
                        }}
                      >
                        Download
                      </Button>
                    )}
                  </VersionActions>
                )}

                {isSelected && isCurrent && (
                  <VersionActions>
                    <div
                      style={{
                        margin: "8px 0 0",
                        padding: "0.5rem 0.75rem",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        color: "#1e40af",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Info size={14} />
                      This is the current version
                    </div>
                  </VersionActions>
                )}
              </VersionCard>
            </TimelineItem>
          );
        })}
      </Timeline>
    );
  };

  return (
    <Modal open={isOpen} onClose={onClose} size="md">
      <ModalHeader>
        <div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <GitBranch size={20} style={{ marginRight: "8px" }} />
            Version History
          </div>
          <div
            style={{
              fontSize: "14px",
              fontWeight: "normal",
              color: "#64748b",
              marginTop: "4px",
            }}
          >
            {documentTitle}
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <PanelContainer>
          {restoreSuccess && (
            <div
              style={{
                marginBottom: "16px",
                padding: "1rem",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                color: "#166534",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <CheckCircle size={16} />
                  Version Restored
                </strong>
                <p style={{ margin: "0.5rem 0 0 0" }}>{restoreSuccess}</p>
              </div>
              <button
                onClick={() => setRestoreSuccess(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#166534",
                }}
                aria-label="Dismiss"
              >
                <XCircle size={16} />
              </button>
            </div>
          )}
          {restoreError && (
            <div
              style={{
                marginBottom: "16px",
                padding: "1rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#991b1b",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <AlertCircle size={16} />
                  Restore Failed
                </strong>
                <p style={{ margin: "0.5rem 0 0 0" }}>{restoreError}</p>
              </div>
              <button
                onClick={() => setRestoreError(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#991b1b",
                }}
                aria-label="Dismiss"
              >
                <XCircle size={16} />
              </button>
            </div>
          )}
          {renderVersionList()}
        </PanelContainer>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default VersionHistoryPanel;
