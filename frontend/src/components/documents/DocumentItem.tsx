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
import { navigateToDocument } from "../../utils/navigationUtils";

import {
  editingDocument,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  viewingDocument,
  openedCorpus,
} from "../../graphql/cache";
import { AnnotationLabelType, DocumentType } from "../../types/graphql-api";
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

// Main card - this is where the magic happens
const StyledCard = styled.div`
  position: relative;
  background: linear-gradient(to bottom, #ffffff, #fafbfc);
  border: 1px solid transparent;
  background-clip: padding-box;
  border-radius: 16px;
  overflow: visible;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  width: 100%;
  animation: ${slideIn} 0.4s ease-out;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 16px;
    padding: 1px;
    background: linear-gradient(
      135deg,
      rgba(99, 102, 241, 0.1) 0%,
      rgba(139, 92, 246, 0.1) 50%,
      rgba(236, 72, 153, 0.1) 100%
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.5;
    transition: opacity 0.3s ease;
  }

  &:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 0 80px rgba(99, 102, 241, 0.03);

    &::before {
      opacity: 1;
    }

    .card-header {
      background: linear-gradient(
        135deg,
        rgba(99, 102, 241, 0.15) 0%,
        rgba(139, 92, 246, 0.15) 100%
      );
    }

    .action-bar {
      opacity: 1;
      transform: translateY(0);
    }

    .preview-thumbnail {
      transform: scale(1.05) rotate(2deg);
    }
  }

  &.is-selected {
    &::before {
      background: linear-gradient(
        135deg,
        rgba(34, 197, 94, 0.3) 0%,
        rgba(16, 185, 129, 0.3) 100%
      );
      opacity: 1;
    }

    box-shadow: 0 10px 30px rgba(34, 197, 94, 0.15),
      0 0 0 2px rgba(34, 197, 94, 0.2);
  }

  &.is-open {
    &::before {
      background: linear-gradient(
        135deg,
        rgba(251, 146, 60, 0.3) 0%,
        rgba(250, 204, 21, 0.3) 100%
      );
      opacity: 1;
    }
  }

  &.backend-locked {
    pointer-events: none;
    filter: grayscale(0.5);
    opacity: 0.7;
  }
`;

// Beautiful card header with gradient
const CardHeader = styled.div`
  position: relative;
  height: 140px;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.08) 0%,
    rgba(139, 92, 246, 0.08) 50%,
    rgba(236, 72, 153, 0.08) 100%
  );
  border-radius: 16px 16px 0 0;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: all 0.3s ease;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.3) 50%,
      transparent 100%
    );
    animation: ${shimmer} 3s infinite linear;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover::after {
    opacity: 1;
  }
`;

// Gorgeous preview thumbnail
const PreviewThumbnail = styled.div`
  width: 100px;
  height: 120px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
  }

  .fallback-icon {
    width: 50px;
    height: 50px;
    opacity: 0.2;
  }

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      45deg,
      transparent 30%,
      rgba(255, 255, 255, 0.5) 50%,
      transparent 70%
    );
    transform: translateX(-100%);
    transition: transform 0.6s;
  }

  &:hover::before {
    transform: translateX(100%);
  }
`;

// Modern content section
const ContentSection = styled.div`
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
`;

// Beautiful typography
const Title = styled.h3`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
  letter-spacing: -0.02em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  background: linear-gradient(135deg, #0f172a 0%, #475569 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Description = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: #64748b;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

// Stunning metadata pills
const MetadataSection = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
`;

const MetaPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.08) 0%,
    rgba(139, 92, 246, 0.08) 100%
  );
  border: 1px solid rgba(99, 102, 241, 0.1);
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6366f1;
  transition: all 0.2s ease;

  .icon {
    opacity: 0.7;
    font-size: 0.75rem;
  }

  &:hover {
    background: linear-gradient(
      135deg,
      rgba(99, 102, 241, 0.15) 0%,
      rgba(139, 92, 246, 0.15) 100%
    );
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  }

  &.success {
    background: linear-gradient(
      135deg,
      rgba(34, 197, 94, 0.08) 0%,
      rgba(16, 185, 129, 0.08) 100%
    );
    border-color: rgba(34, 197, 94, 0.2);
    color: #10b981;
  }

  &.warning {
    background: linear-gradient(
      135deg,
      rgba(251, 146, 60, 0.08) 0%,
      rgba(250, 204, 21, 0.08) 100%
    );
    border-color: rgba(251, 146, 60, 0.2);
    color: #f59e0b;
  }
`;

// Gorgeous floating action bar
const ActionBar = styled.div`
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;

const ActionButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08),
    inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  color: #64748b;
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      rgba(99, 102, 241, 0.2) 0%,
      rgba(139, 92, 246, 0.2) 100%
    );
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover {
    transform: translateY(-4px) scale(1.1);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12),
      inset 0 0 0 1px rgba(99, 102, 241, 0.2);
    color: #6366f1;

    &::before {
      opacity: 1;
    }
  }

  &:active {
    transform: scale(0.95);
  }

  &.primary {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;

    &:hover {
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3),
        inset 0 0 0 1px rgba(255, 255, 255, 0.2);
    }
  }

  &.danger:hover {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }

  &.success:hover {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  &.downloading {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    animation: pulse 1.5s ease-in-out infinite;

    @keyframes pulse {
      0% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
      100% {
        opacity: 1;
      }
    }
  }

  .icon {
    margin: 0 !important;
    font-size: 16px;
    z-index: 1;

    &.loading {
      animation: ${spin} 1s linear infinite;
    }
  }
`;

// Premium selection checkbox
const SelectionControl = styled.div`
  position: absolute;
  top: 16px;
  left: 16px;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(99, 102, 241, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 10;

  &:hover {
    transform: scale(1.1);
    border-color: #6366f1;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  }

  &.selected {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    border-color: transparent;

    .icon {
      color: white;
      font-size: 0.875rem;
    }
  }
`;

// Sleek file type badge
const FileTypeBadge = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(10px);
  color: white;
  border-radius: 6px;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
`;

// Beautiful tags
const TagsContainer = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 500;
  color: #475569;
  transition: all 0.2s ease;

  .icon {
    font-size: 0.65rem;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
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

  const {
    id,
    icon,
    is_open,
    is_selected,
    title,
    description,
    pdfFile,
    backendLock,
    isPublic,
    myPermissions,
    fileType,
    pageCount,
  } = item;

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
      } ${backendLock ? "backend-locked" : ""}`}
      onClick={backendLock ? undefined : cardClickHandler}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {backendLock && (
        <Dimmer active inverted style={{ borderRadius: "16px" }}>
          <Loader size="small">Processing...</Loader>
        </Dimmer>
      )}

      <SelectionControl
        className={`selection-control ${is_selected ? "selected" : ""}`}
        onClick={handleCheckboxClick}
      >
        {is_selected && <Icon name="check" />}
      </SelectionControl>

      <CardHeader className="card-header">
        <PreviewThumbnail className="preview-thumbnail">
          {icon ? (
            <img src={icon} alt={title || "Document"} />
          ) : (
            <img
              src={fallback_doc_icon}
              alt="Document"
              className="fallback-icon"
            />
          )}
        </PreviewThumbnail>
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
