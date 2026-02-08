import React, { useRef, useState, MouseEvent } from "react";
import {
  Icon,
  Card,
  Popup,
  Menu,
  Label,
  Dimmer,
  Loader,
  Button,
} from "semantic-ui-react";
import _ from "lodash";
import styled, { keyframes } from "styled-components";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { navigateToDocument } from "../../utils/navigationUtils";

import {
  editingDocument,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  viewingDocument,
  openedCorpus,
} from "../../graphql/cache";
import {
  AnnotationLabelType,
  DocumentType,
  DocumentProcessingStatus,
} from "../../types/graphql-api";
import {
  RETRY_DOCUMENT_PROCESSING,
  RetryDocumentProcessingOutputType,
  RetryDocumentProcessingInputType,
} from "../../graphql/mutations";
import { downloadFile } from "../../utils/files";
import fallback_doc_icon from "../../assets/images/defaults/default_doc_icon.jpg";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";

// Animations
const shimmer = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

// Corporate styled card container
const StyledCard = styled.div`
  position: relative;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: visible;
  transition: all 0.2s ease;
  cursor: pointer;
  min-height: 280px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  width: 100%;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    border-color: #cbd5e1;

    .card-header {
      &::after {
        opacity: 1;
      }
    }

    .action-bar {
      opacity: 1;
      transform: translateY(0);
    }

    img:not(.fallback-icon) {
      transform: translateY(5%);
    }
  }

  &.is-selected {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1),
      0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }

  &.is-open {
    border-color: #f59e0b;
    background: #fffbeb;
  }

  &.backend-locked {
    pointer-events: none;
    opacity: 0.6;
    background: #f9fafb;
  }
`;

// Clean card header
const CardHeader = styled.div`
  position: relative;
  height: 140px;
  background: #f8fafc;
  border-radius: 12px 12px 0 0;
  overflow: hidden;
  border-bottom: 1px solid #e2e8f0;
  transition: background 0.2s ease;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    transition: transform 0.3s ease;
  }

  .fallback-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 50px;
    height: 50px;
    opacity: 0.2;
    object-fit: contain;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(0, 0, 0, 0.1) 100%
    );
    opacity: 0.5;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
`;

// Content section
const ContentSection = styled.div`
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  min-height: 0;
  overflow: hidden;
`;

// Typography
const Title = styled.h3`
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Description = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: #64748b;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Metadata section
const MetadataSection = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
`;

const MetaPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #475569;
  transition: background 0.15s ease;

  .icon {
    opacity: 0.8;
    font-size: 0.7rem;
  }

  &:hover {
    background: #e2e8f0;
  }

  &.success {
    background: #dcfce7;
    color: #15803d;
  }

  &.warning {
    background: #fed7aa;
    color: #c2410c;
  }
`;

// Action bar
const ActionBar = styled.div`
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transform: translateY(8px);
  transition: all 0.2s ease;
`;

const ActionButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: white;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  color: #64748b;
  position: relative;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border-color: #cbd5e1;
    color: #475569;
  }

  &:active {
    transform: scale(0.98);
  }

  &.primary {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;

    &:hover {
      background: #2563eb;
      border-color: #2563eb;
    }
  }

  &.danger:hover {
    background: #ef4444;
    border-color: #ef4444;
    color: white;
  }

  &.success:hover {
    background: #10b981;
    border-color: #10b981;
    color: white;
  }

  &.downloading {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
    animation: pulse 1.5s ease-in-out infinite;

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.8;
      }
    }
  }

  .icon {
    margin: 0 !important;
    font-size: 13px;

    &.loading {
      animation: ${spin} 1s linear infinite;
    }
  }
`;

// Selection checkbox
const SelectionControl = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: white;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  z-index: 10;

  &:hover {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  &.selected {
    background: #3b82f6;
    border-color: #3b82f6;

    .icon {
      color: white;
      font-size: 0.75rem;
    }
  }
`;

// File type badge
const FileTypeBadge = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 3px 8px;
  background: #0f172a;
  color: white;
  border-radius: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

// Tags container
const TagsContainer = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 500;
  color: #475569;

  .icon {
    font-size: 0.65rem;
  }
`;

// ===============================================
// PROCESSING FAILURE COMPONENTS
// ===============================================
const FailureDimmer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(4px);
  z-index: 10;
  gap: 8px;
  padding: 16px;
  border-radius: 12px;
`;

const FailureIconWrapper = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fef2f2;
  border: 2px solid #fecaca;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dc2626;
`;

const FailureLabel = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #dc2626;
  text-align: center;
`;

const FailureMessage = styled.div`
  font-size: 0.6875rem;
  color: #94a3b8;
  text-align: center;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const ClassicRetryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid #dc2626;
  border-radius: 6px;
  background: white;
  color: #dc2626;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #dc2626;
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface DocumentItemProps {
  item: DocumentType;
  delete_caption?: string;
  download_caption?: string;
  edit_caption?: string;
  add_caption?: string;
  contextMenuOpen: string | null;
  onShiftClick?: (document: DocumentType) => void;
  onClick?: (document: DocumentType) => void;
  removeFromCorpus?: (doc_ids: string[]) => void | any;
  setContextMenuOpen: (args: any) => any | void;
}

export const DocumentItem: React.FC<DocumentItemProps> = ({
  item,
  add_caption = "Add to Corpus",
  edit_caption = "Edit",
  delete_caption = "Delete",
  download_caption = "Download",
  contextMenuOpen,
  onShiftClick,
  onClick,
  removeFromCorpus,
  setContextMenuOpen,
}) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const [retryProcessing, { loading: retryLoading }] = useMutation<
    RetryDocumentProcessingOutputType,
    RetryDocumentProcessingInputType
  >(RETRY_DOCUMENT_PROCESSING, {
    update: (cache, { data }) => {
      if (data?.retryDocumentProcessing?.ok) {
        const doc = data.retryDocumentProcessing.document;
        if (doc) {
          cache.modify({
            id: cache.identify({ __typename: "DocumentType", id: doc.id }),
            fields: {
              backendLock: () => doc.backendLock,
              processingStatus: () => doc.processingStatus,
              processingError: () => doc.processingError,
              canRetry: () => doc.canRetry,
            },
          });
        }
      }
    },
  });

  const {
    id,
    icon,
    is_open,
    is_selected,
    title,
    description,
    pdfFile,
    backendLock,
    processingStatus,
    processingError,
    canRetry,
    isPublic,
    myPermissions,
    fileType,
    pageCount,
  } = item;

  const isFailed = processingStatus === DocumentProcessingStatus.FAILED;
  const isProcessing =
    backendLock &&
    processingStatus !== DocumentProcessingStatus.FAILED &&
    processingStatus != null;

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await retryProcessing({
        variables: { documentId: id },
      });
      if (result.data?.retryDocumentProcessing?.ok) {
        toast.success("Document reprocessing has been queued");
      } else {
        toast.error(
          result.data?.retryDocumentProcessing?.message ||
            "Failed to retry processing"
        );
      }
    } catch {
      toast.error("Failed to retry document processing");
    }
  };

  const cardClickHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      (event.target as HTMLElement).closest(".action-button") ||
      (event.target as HTMLElement).closest(".selection-control")
    ) {
      return;
    }

    event.stopPropagation();
    if (event.shiftKey) {
      if (onShiftClick && _.isFunction(onShiftClick)) {
        onShiftClick(item);
      }
    } else {
      if (onClick && _.isFunction(onClick)) {
        onClick(item);
      }
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShiftClick) {
      onShiftClick(item);
    }
  };

  const handleOpenKnowledgeBase = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentCorpus = openedCorpus();
    navigateToDocument(
      item as any,
      currentCorpus as any,
      navigate,
      window.location.pathname
    );
    if (onClick) onClick(item);
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    viewingDocument(item);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    editingDocument(item);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pdfFile && !isDownloading) {
      setIsDownloading(true);
      try {
        await downloadFile(pdfFile);
      } finally {
        setTimeout(() => setIsDownloading(false), 1000);
      }
    }
  };

  const handleRemoveFromCorpus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (removeFromCorpus) {
      removeFromCorpus([item.id]);
    }
  };

  const my_permissions = getPermissions(
    item.myPermissions ? item.myPermissions : []
  );

  const canEdit = my_permissions.includes(PermissionTypes.CAN_UPDATE);
  const canDelete = my_permissions.includes(PermissionTypes.CAN_REMOVE);

  let doc_label_objs = item?.docLabelAnnotations
    ? item.docLabelAnnotations.edges
        .map((edge) =>
          edge?.node?.annotationLabel ? edge.node.annotationLabel : undefined
        )
        .filter((lbl): lbl is AnnotationLabelType => !!lbl)
    : [];

  return (
    <StyledCard
      className={`noselect ${is_open ? "is-open" : ""} ${
        is_selected ? "is-selected" : ""
      } ${isProcessing ? "backend-locked" : ""}`}
      onClick={isProcessing ? undefined : cardClickHandler}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isProcessing && (
        <Dimmer active inverted style={{ borderRadius: "12px" }}>
          <Loader size="small">Processing...</Loader>
        </Dimmer>
      )}
      {isFailed && (
        <FailureDimmer role="alert">
          <FailureIconWrapper aria-hidden="true">
            <Icon name="warning sign" style={{ margin: 0 }} />
          </FailureIconWrapper>
          <FailureLabel>Processing Failed</FailureLabel>
          {processingError && (
            <FailureMessage>{processingError}</FailureMessage>
          )}
          {canRetry && (
            <ClassicRetryButton
              onClick={handleRetry}
              disabled={retryLoading}
              aria-label="Retry processing this document"
            >
              <Icon name="redo" style={{ margin: 0 }} aria-hidden="true" />
              {retryLoading ? "Retrying..." : "Retry Processing"}
            </ClassicRetryButton>
          )}
        </FailureDimmer>
      )}

      <SelectionControl
        className={`selection-control ${is_selected ? "selected" : ""}`}
        onClick={handleCheckboxClick}
      >
        {is_selected && <Icon name="check" />}
      </SelectionControl>

      <CardHeader className="card-header">
        {icon ? (
          <img src={icon} alt={title || "Document"} />
        ) : (
          <>
            <div
              style={{ width: "100%", height: "100%", background: "#f8fafc" }}
            />
            <img
              src={fallback_doc_icon}
              alt="Document"
              className="fallback-icon"
            />
          </>
        )}
        {fileType && <FileTypeBadge>{fileType}</FileTypeBadge>}
      </CardHeader>

      <ContentSection>
        <Title>{title || "Untitled Document"}</Title>

        <Description>{description || "No description available"}</Description>

        <MetadataSection>
          {pageCount && (
            <MetaPill>
              <Icon name="file outline" />
              {pageCount} pages
            </MetaPill>
          )}

          {isPublic && (
            <MetaPill className="success">
              <Icon name="globe" />
              Public
            </MetaPill>
          )}

          {!canEdit && (
            <MetaPill className="warning">
              <Icon name="lock" />
              Read-only
            </MetaPill>
          )}

          {doc_label_objs.length > 0 && (
            <TagsContainer>
              {doc_label_objs.slice(0, 2).map((label, index) => (
                <Tag key={`doc_${id}_label${index}`}>
                  <Icon
                    name={(label.icon as any) || "tag"}
                    style={{ color: label.color }}
                  />
                  {label.text}
                </Tag>
              ))}
            </TagsContainer>
          )}
        </MetadataSection>

        <ActionBar className="action-bar">
          <ActionButton
            className="action-button primary"
            onClick={handleOpenKnowledgeBase}
            disabled={backendLock}
            title="Open Knowledge Base"
          >
            <Icon name="book" />
          </ActionButton>

          <ActionButton
            className="action-button"
            onClick={handleView}
            disabled={backendLock}
            title="View Details"
          >
            <Icon name="eye" />
          </ActionButton>

          {pdfFile && (
            <ActionButton
              className={`action-button ${isDownloading ? "downloading" : ""}`}
              onClick={handleDownload}
              disabled={backendLock || isDownloading}
              title={isDownloading ? "Downloading..." : download_caption}
            >
              <Icon
                name={isDownloading ? "spinner" : "download"}
                className={isDownloading ? "loading" : ""}
              />
            </ActionButton>
          )}

          {canEdit && !backendLock && (
            <ActionButton
              className="action-button"
              onClick={handleEdit}
              title={edit_caption}
            >
              <Icon name="edit" />
            </ActionButton>
          )}

          {removeFromCorpus && !backendLock && (
            <ActionButton
              className="action-button danger"
              onClick={handleRemoveFromCorpus}
              title="Remove from Corpus"
            >
              <Icon name="remove circle" />
            </ActionButton>
          )}
        </ActionBar>
      </ContentSection>
    </StyledCard>
  );
};
