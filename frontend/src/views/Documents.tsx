import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import _ from "lodash";
import styled from "styled-components";
import {
  SearchBox,
  FilterTabs,
  StatBlock,
  StatGrid,
  Button,
  EmptyState,
  Chip,
  Avatar,
} from "@os-legal/ui";
import type { FilterTabItem } from "@os-legal/ui";
import {
  Plus,
  Grid,
  List,
  AlignJustify,
  MoreVertical,
  FileText,
  Loader2,
  SlidersHorizontal,
  X,
  AlertCircle,
} from "lucide-react";
import { Menu, Checkbox } from "semantic-ui-react";

import {
  DeleteMultipleDocumentsInputs,
  DeleteMultipleDocumentsOutputs,
  DELETE_MULTIPLE_DOCUMENTS,
  UpdateDocumentInputs,
  UpdateDocumentOutputs,
  UPDATE_DOCUMENT,
} from "../graphql/mutations";
import {
  RequestDocumentsInputs,
  RequestDocumentsOutputs,
  GET_DOCUMENTS,
} from "../graphql/queries";
import {
  authToken,
  documentSearchTerm,
  editingDocument,
  filterToCorpus,
  filterToLabelId,
  filterToLabelsetId,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  viewingDocument,
  userObj,
  showBulkUploadModal,
  showUploadNewDocumentsModal,
  backendUserObj,
} from "../graphql/cache";

import { CRUDModal } from "../components/widgets/CRUD/CRUDModal";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import { DocumentType, LabelType } from "../types/graphql-api";
import { AddToCorpusModal } from "../components/modals/AddToCorpusModal";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import {
  editDocForm_Schema,
  editDocForm_Ui_Schema,
} from "../components/forms/schemas";
import { FilterToLabelsetSelector } from "../components/widgets/model-filters/FilterToLabelsetSelector";
import { FilterToCorpusSelector } from "../components/widgets/model-filters/FilterToCorpusSelector";
import { BulkUploadModal } from "../components/widgets/modals/BulkUploadModal";
import { FetchMoreOnVisible } from "../components/widgets/infinite_scroll/FetchMoreOnVisible";
import { LoadingOverlay } from "../components/common/LoadingOverlay";
import { navigateToDocument } from "../utils/navigationUtils";
import {
  formatFileSize,
  formatRelativeTime,
  getInitials,
} from "../utils/formatters";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentQueryVariables {
  includeMetadata: boolean;
  annotateDocLabels: boolean;
  textSearch?: string;
  hasLabelWithId?: string;
  inCorpusWithId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS - Following CorpusListView/DiscoveryLanding patterns
// ═══════════════════════════════════════════════════════════════════════════════

const PageContainer = styled.div`
  height: 100%;
  background: #fafafa;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  overflow-y: auto;
  overflow-x: hidden;
`;

const ContentContainer = styled.main`
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 24px 80px;

  @media (max-width: 768px) {
    padding: 32px 16px 60px;
  }
`;

const HeroSection = styled.section`
  margin-bottom: 48px;
`;

const HeroTitle = styled.h1`
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 42px;
  font-weight: 400;
  line-height: 1.2;
  color: #1e293b;
  margin: 0 0 16px;

  span {
    color: #0f766e;
  }

  @media (max-width: 768px) {
    font-size: 32px;
  }
`;

const HeroSubtitle = styled.p`
  font-size: 17px;
  line-height: 1.6;
  color: #64748b;
  margin: 0 0 32px;
  max-width: 600px;
`;

const SearchContainer = styled.div`
  margin-bottom: 16px;
`;

const FilterTabsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const FilterButton = styled.button<{
  $active?: boolean;
  $hasFilters?: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: ${(props) => (props.$active ? "#f1f5f9" : "white")};
  border: 1px solid ${(props) => (props.$hasFilters ? "#0f766e" : "#e2e8f0")};
  border-radius: 8px;
  color: ${(props) => (props.$hasFilters ? "#0f766e" : "#64748b")};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #f8fafc;
    border-color: ${(props) => (props.$hasFilters ? "#0f766e" : "#cbd5e1")};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const FilterBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #0f766e;
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
`;

const FilterPopupContainer = styled.div`
  position: relative;
`;

const FilterPopup = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 50;
  min-width: 320px;
  padding: 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);

  /* Override the harsh gradient labels from filter components */
  .ui.label {
    background: #f1f5f9 !important;
    color: #475569 !important;
    box-shadow: none !important;
    font-size: 0.6875rem !important;
    font-weight: 600 !important;
    letter-spacing: 0.05em !important;
  }

  @media (max-width: 640px) {
    left: 50%;
    transform: translateX(-50%);
    min-width: calc(100vw - 48px);
    max-width: 400px;
  }
`;

const FilterPopupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
`;

const FilterPopupTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
`;

const FilterPopupClose = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;

  &:hover {
    background: #f1f5f9;
    color: #475569;
  }
`;

const FilterPopupContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;

  /* Give each child descending z-index so earlier dropdowns appear above later ones */
  & > *:nth-child(1) {
    position: relative;
    z-index: 30;
  }
  & > *:nth-child(2) {
    position: relative;
    z-index: 20;
  }
  & > *:nth-child(3) {
    position: relative;
    z-index: 10;
  }
  & > *:nth-child(4) {
    position: relative;
    z-index: 5;
  }
`;

const ClearFiltersButton = styled.button`
  margin-top: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #fef2f2;
    border-color: #fca5a5;
    color: #dc2626;
  }
`;

const StatsContainer = styled.div`
  margin-bottom: 48px;
  padding: 32px 0;

  /* Override stat value size like StatsSection does */
  [class*="StatBlock"] > *:first-child,
  [data-testid="stat-value"] {
    font-size: 36px !important;
  }

  @media (max-width: 768px) {
    padding: 24px 0;

    [class*="StatBlock"] > *:first-child,
    [data-testid="stat-value"] {
      font-size: 28px !important;
    }
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
`;

const SectionTitle = styled.h2`
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 24px;
  font-weight: 400;
  color: #0f766e;
  margin: 0;
`;

const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ViewToggle = styled.div`
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 3px;
`;

const ViewToggleButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: ${(props) => (props.$active ? "#f1f5f9" : "transparent")};
  border: none;
  border-radius: 6px;
  color: ${(props) => (props.$active ? "#1e293b" : "#94a3b8")};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: #475569;
  }
`;

const DocumentsListContainer = styled.section`
  position: relative;
  min-height: 200px;
`;

const EmptyStateWrapper = styled.div`
  padding: 48px 24px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
`;

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT GRID STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
`;

const DocumentCardWrapper = styled.div<{ $selected?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid ${(props) => (props.$selected ? "#0f766e" : "#e2e8f0")};
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.15s;
  cursor: pointer;
  box-shadow: ${(props) =>
    props.$selected ? "0 0 0 2px rgba(15, 118, 110, 0.2)" : "none"};

  &:hover {
    border-color: ${(props) => (props.$selected ? "#0f766e" : "#cbd5e1")};
    box-shadow: ${(props) =>
      props.$selected
        ? "0 0 0 2px rgba(15, 118, 110, 0.2)"
        : "0 4px 6px rgba(15, 23, 42, 0.04)"};
    transform: translateY(-2px);
  }
`;

const CardCheckbox = styled.div<{ $visible?: boolean }>`
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  transition: opacity 0.15s;

  ${DocumentCardWrapper}:hover & {
    opacity: 1;
  }
`;

const CardPreview = styled.div`
  position: relative;
  height: 160px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const CardThumbnail = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
`;

const CardPreviewPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  color: #94a3b8;
`;

const PreviewLines = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 80%;
  max-width: 180px;
`;

const PreviewLine = styled.div<{ $width?: string }>`
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  width: ${(props) => props.$width || "100%"};
`;

const TypeBadge = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
`;

const ProcessingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(248, 250, 252, 0.9);
  backdrop-filter: blur(2px);
`;

const ProcessingText = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: #475569;
`;

const CardBody = styled.div`
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const CardTitle = styled.h4`
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  word-break: break-word;
`;

const CardMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
`;

const MetaSeparator = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #94a3b8;
  opacity: 0.5;
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  background: #fafafa;
`;

const CardUploader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #475569;
`;

const CardMenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;

  ${DocumentCardWrapper}:hover & {
    opacity: 1;
  }

  &:hover {
    background: #f1f5f9;
    color: #475569;
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT LIST STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentsListView = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
`;

const ListHeader = styled.div`
  display: grid;
  grid-template-columns: 40px 1fr 100px 100px 120px 150px 48px;
  gap: 16px;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e2e8f0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;

  @media (max-width: 768px) {
    grid-template-columns: 32px 1fr 80px 48px;

    & > :nth-child(3),
    & > :nth-child(5),
    & > :nth-child(6) {
      display: none;
    }
  }
`;

const ListItem = styled.div<{ $selected?: boolean }>`
  display: grid;
  grid-template-columns: 40px 1fr 100px 100px 120px 150px 48px;
  gap: 16px;
  padding: 12px 16px;
  align-items: center;
  cursor: pointer;
  transition: background 0.1s;
  background: ${(props) =>
    props.$selected ? "rgba(15, 118, 110, 0.04)" : "transparent"};

  &:hover {
    background: ${(props) =>
      props.$selected ? "rgba(15, 118, 110, 0.06)" : "#f8fafc"};
  }

  &:not(:last-child) {
    border-bottom: 1px solid #e2e8f0;
  }

  @media (max-width: 768px) {
    grid-template-columns: 32px 1fr 80px 48px;

    & > :nth-child(3),
    & > :nth-child(5),
    & > :nth-child(6) {
      display: none;
    }
  }
`;

const ListItemIcon = styled.div`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
`;

const ListItemName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ListItemType = styled.span`
  font-size: 12px;
  text-transform: uppercase;
  color: #94a3b8;
`;

const ListItemSize = styled.span`
  font-size: 13px;
  color: #475569;
`;

const ListItemUploader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
`;

const ListItemActions = styled.div`
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity 0.1s;

  ${ListItem}:hover & {
    opacity: 1;
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPACT VIEW STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentsCompactView = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
`;

const CompactItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
  background: ${(props) =>
    props.$selected ? "rgba(15, 118, 110, 0.04)" : "transparent"};

  &:hover {
    background: ${(props) =>
      props.$selected ? "rgba(15, 118, 110, 0.06)" : "#f8fafc"};
  }

  &:not(:last-child) {
    border-bottom: 1px solid #e2e8f0;
  }
`;

const CompactItemName = styled.span`
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CompactItemMeta = styled.span`
  font-size: 12px;
  color: #94a3b8;
  flex-shrink: 0;
`;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT MENU STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const FloatingMenu = styled(Menu)`
  &.ui.menu {
    position: fixed;
    z-index: 9999;
    min-width: 200px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    padding: 4px 0;

    .item {
      padding: 10px 14px !important;
      font-size: 14px !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;

      &:hover {
        background: #f1f5f9 !important;
      }

      &.danger {
        color: #dc2626 !important;

        &:hover {
          background: #fef2f2 !important;
        }
      }

      &.primary {
        color: #0f766e !important;
        font-weight: 500 !important;
      }

      i.icon {
        margin: 0 !important;
        opacity: 0.7;
      }
    }
  }
`;

const MenuHeader = styled.div`
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <path
      d="M12 6a4 4 0 00-4 4v28a4 4 0 004 4h24a4 4 0 004-4V18l-12-12H12z"
      fill="currentColor"
      opacity="0.1"
    />
    <path
      d="M12 6a4 4 0 00-4 4v28a4 4 0 004 4h24a4 4 0 004-4V18l-12-12H12z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M28 6v12h12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getDocumentType(doc: DocumentType): string {
  // Use fileType field directly if available (preferred)
  if (doc.fileType) {
    const ft = doc.fileType.toLowerCase();
    if (ft === "pdf") return "PDF";
    if (ft === "docx" || ft === "doc") return "DOCX";
    if (ft === "txt") return "TXT";
    return ft.toUpperCase();
  }
  // Fallback: parse from title if it has a valid extension
  const fileName = doc.title || "";
  const parts = fileName.split(".");
  // Only use extension if there are multiple parts (filename.ext)
  if (parts.length > 1) {
    const ext = parts.pop()?.toLowerCase();
    if (ext === "pdf") return "PDF";
    if (ext === "docx" || ext === "doc") return "DOCX";
    if (ext === "txt") return "TXT";
    if (ext) return ext.toUpperCase();
  }
  // Default to PDF if no extension found
  return "PDF";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const Documents = () => {
  const auth_token = useReactiveVar(authToken);
  const current_user = useReactiveVar(userObj);
  const backend_user = useReactiveVar(backendUserObj);
  const document_to_edit = useReactiveVar(editingDocument);
  const document_to_view = useReactiveVar(viewingDocument);
  const show_bulk_upload_modal = useReactiveVar(showBulkUploadModal);
  const show_upload_new_documents_modal = useReactiveVar(
    showUploadNewDocumentsModal
  );
  const filtered_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filtered_to_label_id = useReactiveVar(filterToLabelId);
  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const show_add_docs_to_corpus_modal = useReactiveVar(
    showAddDocsToCorpusModal
  );
  const show_delete_documents_modal = useReactiveVar(showDeleteDocumentsModal);

  const [searchCache, setSearchCache] = useState<string>(document_search_term);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "compact">("grid");
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>("all");
  const [contextMenu, setContextMenu] = useState<{
    document: DocumentType;
    position: { x: number; y: number };
  } | null>(null);
  const [showFilterPopup, setShowFilterPopup] = useState(false);

  const filterPopupRef = useRef<HTMLDivElement>(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Build query variables with proper typing
  const documentVariables: DocumentQueryVariables = {
    includeMetadata: true,
    annotateDocLabels: Boolean(filtered_to_corpus || filtered_to_labelset_id),
    ...(document_search_term && { textSearch: document_search_term }),
    ...(filtered_to_label_id && { hasLabelWithId: filtered_to_label_id }),
    ...(filtered_to_corpus && { inCorpusWithId: filtered_to_corpus.id }),
  };

  const {
    refetch: refetchDocuments,
    loading: documents_loading,
    error: documents_error,
    data: documents_data,
    fetchMore: fetchMoreDocuments,
  } = useQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(GET_DOCUMENTS, {
    variables: documentVariables,
    nextFetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });

  const document_nodes = documents_data?.documents?.edges
    ? documents_data.documents.edges
    : [];
  const document_items = document_nodes
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is DocumentType => !!item);

  // Filter by status
  const filteredDocuments = useMemo(() => {
    if (activeStatusFilter === "all") return document_items;
    if (activeStatusFilter === "processed") {
      return document_items.filter((doc) => !doc.backendLock);
    }
    if (activeStatusFilter === "processing") {
      return document_items.filter((doc) => doc.backendLock);
    }
    // 'error' filter - would need error field in DocumentType
    return document_items;
  }, [document_items, activeStatusFilter]);

  // Calculate stats with single pass through array
  const stats = useMemo(() => {
    const result = document_items.reduce(
      (acc, doc) => {
        acc.totalPages += doc.pageCount || 0;
        if (doc.backendLock) {
          acc.processingCount += 1;
        } else {
          acc.processedCount += 1;
        }
        return acc;
      },
      { totalPages: 0, processedCount: 0, processingCount: 0 }
    );

    return {
      totalDocs: document_items.length,
      totalPages: result.totalPages,
      processedCount: result.processedCount,
      processingCount: result.processingCount,
    };
  }, [document_items]);

  // Filter tabs configuration
  const statusFilterItems: FilterTabItem[] = useMemo(
    () => [
      {
        id: "all",
        label: "All Documents",
        count: String(document_items.length),
      },
      {
        id: "processed",
        label: "Processed",
        count: String(stats.processedCount),
      },
      {
        id: "processing",
        label: "Processing",
        count: String(stats.processingCount),
      },
    ],
    [document_items.length, stats.processedCount, stats.processingCount]
  );

  // Refetch effects
  useEffect(() => {
    if (auth_token) {
      refetchDocuments();
    }
  }, [auth_token]);

  useEffect(() => {
    refetchDocuments();
  }, [location]);

  useEffect(() => {
    refetchDocuments();
  }, [document_search_term]);

  useEffect(() => {
    refetchDocuments();
  }, [filtered_to_label_id]);

  useEffect(() => {
    refetchDocuments();
  }, [filtered_to_labelset_id]);

  useEffect(() => {
    refetchDocuments();
  }, [filtered_to_corpus]);

  // Polling for processing documents
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    const areDocumentsProcessing = document_items.some(
      (doc) => doc.backendLock
    );

    if (areDocumentsProcessing) {
      pollInterval = setInterval(() => {
        refetchDocuments();
      }, 15000);

      const timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        toast.info(
          "Document processing is taking too long... polling paused after 10 minutes."
        );
      }, 600000);

      return () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
      };
    }
  }, [document_items, refetchDocuments]);

  // Debounced search
  const debouncedSearch = useRef(
    _.debounce((searchTerm: string) => {
      documentSearchTerm(searchTerm);
    }, 1000)
  );

  // Cleanup debounce on unmount to prevent memory leaks
  useEffect(() => {
    const currentDebounce = debouncedSearch.current;
    return () => {
      currentDebounce.cancel();
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchCache(e.target.value);
    debouncedSearch.current(e.target.value);
  };

  // Mutations
  const [tryDeleteDocuments] = useMutation<
    DeleteMultipleDocumentsOutputs,
    DeleteMultipleDocumentsInputs
  >(DELETE_MULTIPLE_DOCUMENTS, {
    onCompleted: () => {
      selectedDocumentIds([]);
      refetchDocuments();
    },
  });

  const handleDeleteDocuments = (
    ids: string[] | null,
    callback?: (args?: any) => void | any
  ) => {
    if (ids) {
      tryDeleteDocuments({ variables: { documentIdsToDelete: ids } })
        .then(() => {
          toast.success("SUCCESS - Deleted Documents");
          if (callback) callback();
        })
        .catch(() => {
          toast.error("ERROR - Could Not Delete Documents");
          if (callback) callback();
        });
    }
  };

  const [tryUpdateDocument] = useMutation<
    UpdateDocumentOutputs,
    UpdateDocumentInputs
  >(UPDATE_DOCUMENT);

  const handleUpdateDocument = (document_obj: Record<string, unknown>) => {
    tryUpdateDocument({
      variables: document_obj as unknown as UpdateDocumentInputs,
    })
      .then(() => {
        toast.success("Document updated successfully");
        refetchDocuments();
      })
      .catch((error) => {
        toast.error(`Failed to update document: ${error.message}`);
      });
  };

  // Infinite scroll
  const handleFetchMore = useCallback(() => {
    if (
      !documents_loading &&
      documents_data?.documents?.pageInfo?.hasNextPage
    ) {
      fetchMoreDocuments({
        variables: {
          limit: 20,
          cursor: documents_data.documents.pageInfo.endCursor,
        },
      });
    }
  }, [documents_loading, documents_data, fetchMoreDocuments]);

  // Selection handlers
  const handleSelect = (docId: string) => {
    if (selected_document_ids.includes(docId)) {
      selectedDocumentIds(selected_document_ids.filter((id) => id !== docId));
    } else {
      selectedDocumentIds([...selected_document_ids, docId]);
    }
  };

  const handleSelectAll = () => {
    if (selected_document_ids.length === filteredDocuments.length) {
      selectedDocumentIds([]);
    } else {
      selectedDocumentIds(filteredDocuments.map((d) => d.id));
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, doc: DocumentType) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      document: doc,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) {
        handleCloseContextMenu();
      }
    };

    if (contextMenu) {
      const timer = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [contextMenu, handleCloseContextMenu]);

  // Close filter popup on click outside
  useEffect(() => {
    if (!showFilterPopup) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterPopupRef.current &&
        !filterPopupRef.current.contains(event.target as Node)
      ) {
        setShowFilterPopup(false);
      }
    };

    // Delay to prevent immediate close from the button click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFilterPopup]);

  // Document click handler
  const handleDocumentClick = (doc: DocumentType) => {
    if (contextMenu) return;
    navigateToDocument(doc as any, null, navigate, window.location.pathname);
  };

  // Get section title based on filter
  const getSectionTitle = () => {
    switch (activeStatusFilter) {
      case "processed":
        return "Processed Documents";
      case "processing":
        return "Processing Documents";
      default:
        return "All Documents";
    }
  };

  // Check if advanced filters are active and count them
  const activeFilterCount = [
    filtered_to_labelset_id,
    filtered_to_corpus,
    filtered_to_label_id,
  ].filter(Boolean).length;
  const hasAdvancedFilters = activeFilterCount > 0;

  // Clear all advanced filters
  const handleClearFilters = () => {
    filterToLabelsetId("");
    filterToCorpus(null);
    filterToLabelId("");
    setShowFilterPopup(false);
  };

  return (
    <PageContainer>
      <ContentContainer>
        {/* Modals */}
        <BulkUploadModal />
        <AddToCorpusModal
          open={show_add_docs_to_corpus_modal}
          onClose={() => showAddDocsToCorpusModal(false)}
          onSuccess={() => {
            toast.success("Documents added to corpus successfully!");
            selectedDocumentIds([]);
          }}
          documents={document_items}
          selectedDocumentIds={selected_document_ids}
          multiStep={true}
          title="Add Documents to Corpus"
        />
        <ConfirmModal
          message="Are you sure you want to delete these documents?"
          yesAction={() =>
            handleDeleteDocuments(
              selected_document_ids.length > 0 ? selected_document_ids : null,
              () => showDeleteDocumentsModal(false)
            )
          }
          noAction={() => showDeleteDocumentsModal(false)}
          toggleModal={() => showDeleteDocumentsModal(false)}
          visible={show_delete_documents_modal}
        />
        <CRUDModal
          open={document_to_edit !== null}
          mode="EDIT"
          oldInstance={document_to_edit ? document_to_edit : {}}
          modelName="document"
          uiSchema={editDocForm_Ui_Schema}
          dataSchema={editDocForm_Schema}
          onSubmit={handleUpdateDocument}
          onClose={() => editingDocument(null)}
          hasFile={true}
          fileField="pdfFile"
          fileLabel="PDF File"
          fileIsImage={false}
          acceptedFileTypes="pdf"
        />
        <CRUDModal
          open={document_to_view !== null}
          mode="VIEW"
          oldInstance={document_to_view ? document_to_view : {}}
          modelName="document"
          uiSchema={editDocForm_Ui_Schema}
          dataSchema={editDocForm_Schema}
          onClose={() => viewingDocument(null)}
          hasFile={true}
          fileField="pdfFile"
          fileLabel="PDF File"
          fileIsImage={false}
          acceptedFileTypes="pdf"
        />

        {/* Hero Section */}
        <HeroSection>
          <HeroTitle>
            Your <span>documents</span>
          </HeroTitle>
          <HeroSubtitle>
            Browse, search, and manage all documents across your corpuses.
            Upload new files or explore your existing library.
          </HeroSubtitle>

          <SearchContainer>
            <SearchBox
              placeholder="Search for documents..."
              value={searchCache}
              onChange={handleSearchChange}
              onSubmit={() => documentSearchTerm(searchCache)}
            />
          </SearchContainer>

          <FilterTabsRow>
            <FilterTabs
              items={statusFilterItems}
              value={activeStatusFilter}
              onChange={setActiveStatusFilter}
            />
            <FilterPopupContainer ref={filterPopupRef}>
              <FilterButton
                $active={showFilterPopup}
                $hasFilters={hasAdvancedFilters}
                onClick={() => setShowFilterPopup(!showFilterPopup)}
                aria-expanded={showFilterPopup}
                aria-haspopup="dialog"
              >
                <SlidersHorizontal />
                Filters
                {activeFilterCount > 0 && (
                  <FilterBadge>{activeFilterCount}</FilterBadge>
                )}
              </FilterButton>
              {showFilterPopup && (
                <FilterPopup role="dialog" aria-label="Advanced filters">
                  <FilterPopupHeader>
                    <FilterPopupTitle>Advanced Filters</FilterPopupTitle>
                    <FilterPopupClose onClick={() => setShowFilterPopup(false)}>
                      <X size={16} />
                    </FilterPopupClose>
                  </FilterPopupHeader>
                  <FilterPopupContent>
                    <FilterToLabelsetSelector
                      fixed_labelset_id={
                        filtered_to_corpus?.labelSet?.id
                          ? filtered_to_corpus.labelSet.id
                          : undefined
                      }
                    />
                    <FilterToCorpusSelector
                      uses_labelset_id={filtered_to_labelset_id}
                    />
                    {filtered_to_labelset_id ||
                    filtered_to_corpus?.labelSet?.id ? (
                      <FilterToLabelSelector
                        label_type={LabelType.TokenLabel}
                        only_labels_for_labelset_id={
                          filtered_to_labelset_id
                            ? filtered_to_labelset_id
                            : filtered_to_corpus?.labelSet?.id
                            ? filtered_to_corpus.labelSet.id
                            : undefined
                        }
                      />
                    ) : null}
                    {hasAdvancedFilters && (
                      <ClearFiltersButton onClick={handleClearFilters}>
                        Clear all filters
                      </ClearFiltersButton>
                    )}
                  </FilterPopupContent>
                </FilterPopup>
              )}
            </FilterPopupContainer>
          </FilterTabsRow>
        </HeroSection>

        {/* Stats Grid */}
        <StatsContainer>
          <StatGrid columns={2}>
            <StatBlock
              value={stats.totalDocs.toString()}
              label="Documents"
              sublabel="in your library"
            />
            <StatBlock
              value={stats.totalPages.toLocaleString()}
              label="Pages"
              sublabel="total content"
            />
            <StatBlock
              value={stats.processedCount.toString()}
              label="Processed"
              sublabel="ready for analysis"
            />
            <StatBlock
              value={stats.processingCount.toString()}
              label="Processing"
              sublabel="being analyzed"
            />
          </StatGrid>
        </StatsContainer>

        {/* Documents Section */}
        <DocumentsListContainer>
          <LoadingOverlay
            active={documents_loading}
            inverted
            size="large"
            content="Loading documents..."
          />

          <SectionHeader>
            <SectionTitle>{getSectionTitle()}</SectionTitle>
            <ActionButtons>
              <ViewToggle role="group" aria-label="Document view options">
                <ViewToggleButton
                  $active={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                >
                  <Grid size={16} />
                </ViewToggleButton>
                <ViewToggleButton
                  $active={viewMode === "list"}
                  onClick={() => setViewMode("list")}
                  title="List view"
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                >
                  <List size={16} />
                </ViewToggleButton>
                <ViewToggleButton
                  $active={viewMode === "compact"}
                  onClick={() => setViewMode("compact")}
                  title="Compact view"
                  aria-label="Compact view"
                  aria-pressed={viewMode === "compact"}
                >
                  <AlignJustify size={16} />
                </ViewToggleButton>
              </ViewToggle>

              {auth_token &&
                current_user &&
                (selected_document_ids.length > 0 ? (
                  <ActionButtons>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => showAddDocsToCorpusModal(true)}
                    >
                      Add to Corpus
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => showDeleteDocumentsModal(true)}
                      style={{ color: "#dc2626" }}
                    >
                      Delete ({selected_document_ids.length})
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => selectedDocumentIds([])}
                    >
                      Clear
                    </Button>
                  </ActionButtons>
                ) : (
                  <ActionButtons>
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<Plus size={16} />}
                      onClick={() => showUploadNewDocumentsModal(true)}
                    >
                      Upload
                    </Button>
                    {backend_user && !backend_user.isUsageCapped && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => showBulkUploadModal(true)}
                      >
                        Bulk Upload
                      </Button>
                    )}
                  </ActionButtons>
                ))}
            </ActionButtons>
          </SectionHeader>

          {filteredDocuments.length > 0 ? (
            <>
              {viewMode === "grid" && (
                <DocumentsGrid>
                  {filteredDocuments.map((doc) => (
                    <DocumentCardWrapper
                      key={doc.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open document ${doc.title || "Untitled"}`}
                      $selected={selected_document_ids.includes(doc.id)}
                      onClick={() => handleDocumentClick(doc)}
                      onContextMenu={(e) => handleContextMenu(e, doc)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleDocumentClick(doc);
                        }
                      }}
                    >
                      <CardCheckbox
                        $visible={selected_document_ids.includes(doc.id)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select ${doc.title || "Untitled"}`}
                          checked={selected_document_ids.includes(doc.id)}
                          onChange={() => handleSelect(doc.id)}
                        />
                      </CardCheckbox>

                      <CardPreview>
                        {doc.icon ? (
                          <CardThumbnail
                            src={doc.icon}
                            alt={doc.title || "Document"}
                          />
                        ) : (
                          <CardPreviewPlaceholder>
                            <FileText size={48} />
                            <PreviewLines>
                              <PreviewLine />
                              <PreviewLine $width="85%" />
                              <PreviewLine $width="90%" />
                              <PreviewLine $width="70%" />
                            </PreviewLines>
                          </CardPreviewPlaceholder>
                        )}

                        <TypeBadge>
                          <Chip size="sm" variant="filled" color="default">
                            {getDocumentType(doc)}
                          </Chip>
                        </TypeBadge>

                        {doc.backendLock && (
                          <ProcessingOverlay>
                            <Loader2
                              size={24}
                              className="animate-spin"
                              style={{ animation: "spin 1s linear infinite" }}
                            />
                            <ProcessingText>Processing...</ProcessingText>
                          </ProcessingOverlay>
                        )}
                      </CardPreview>

                      <CardBody>
                        <CardTitle title={doc.title || "Untitled"}>
                          {doc.title || "Untitled"}
                        </CardTitle>
                        <CardMeta>
                          {doc.pageCount ? (
                            <span>{doc.pageCount} pages</span>
                          ) : (
                            <span>Document</span>
                          )}
                        </CardMeta>
                      </CardBody>

                      <CardFooter>
                        <CardUploader>
                          <Avatar
                            fallback={getInitials(doc.creator?.email)}
                            size="xs"
                          />
                          <span>{formatRelativeTime(doc.created)}</span>
                        </CardUploader>
                        <CardMenuButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, doc);
                          }}
                        >
                          <MoreVertical size={16} />
                        </CardMenuButton>
                      </CardFooter>
                    </DocumentCardWrapper>
                  ))}
                </DocumentsGrid>
              )}

              {viewMode === "list" && (
                <DocumentsListView role="table" aria-label="Documents list">
                  <ListHeader role="rowgroup">
                    <Checkbox
                      aria-label="Select all documents"
                      checked={
                        selected_document_ids.length ===
                          filteredDocuments.length &&
                        filteredDocuments.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                    <span>Name</span>
                    <span>Type</span>
                    <span>Pages</span>
                    <span>Status</span>
                    <span>Uploaded</span>
                    <span></span>
                  </ListHeader>
                  {filteredDocuments.map((doc) => (
                    <ListItem
                      key={doc.id}
                      role="row"
                      tabIndex={0}
                      aria-label={`Open document ${doc.title || "Untitled"}`}
                      $selected={selected_document_ids.includes(doc.id)}
                      onClick={() => handleDocumentClick(doc)}
                      onContextMenu={(e) => handleContextMenu(e, doc)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleDocumentClick(doc);
                        }
                      }}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${doc.title || "Untitled"}`}
                          checked={selected_document_ids.includes(doc.id)}
                          onChange={() => handleSelect(doc.id)}
                        />
                      </div>
                      <ListItemName title={doc.title || "Untitled"}>
                        {doc.title || "Untitled"}
                      </ListItemName>
                      <ListItemType>{getDocumentType(doc)}</ListItemType>
                      <ListItemSize>
                        {doc.pageCount ? `${doc.pageCount} pages` : ""}
                      </ListItemSize>
                      <div>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={doc.backendLock ? "warning" : "success"}
                        >
                          {doc.backendLock ? "Processing" : "Processed"}
                        </Chip>
                      </div>
                      <ListItemUploader>
                        <Avatar
                          fallback={getInitials(doc.creator?.email)}
                          size="xs"
                        />
                        <span>{formatRelativeTime(doc.created)}</span>
                      </ListItemUploader>
                      <ListItemActions>
                        <CardMenuButton
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, doc);
                          }}
                        >
                          <MoreVertical size={16} />
                        </CardMenuButton>
                      </ListItemActions>
                    </ListItem>
                  ))}
                </DocumentsListView>
              )}

              {viewMode === "compact" && (
                <DocumentsCompactView>
                  {filteredDocuments.map((doc) => (
                    <CompactItem
                      key={doc.id}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`Open document ${doc.title || "Untitled"}`}
                      $selected={selected_document_ids.includes(doc.id)}
                      onClick={() => handleDocumentClick(doc)}
                      onContextMenu={(e) => handleContextMenu(e, doc)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleDocumentClick(doc);
                        }
                      }}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${doc.title || "Untitled"}`}
                          checked={selected_document_ids.includes(doc.id)}
                          onChange={() => handleSelect(doc.id)}
                        />
                      </div>
                      <ListItemIcon>
                        <FileText size={20} />
                      </ListItemIcon>
                      <CompactItemName title={doc.title || "Untitled"}>
                        {doc.title || "Untitled"}
                      </CompactItemName>
                      <CompactItemMeta>
                        {doc.pageCount ? `${doc.pageCount} pages` : ""}
                      </CompactItemMeta>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={doc.backendLock ? "warning" : "success"}
                      >
                        {doc.backendLock ? "Processing" : "Processed"}
                      </Chip>
                      <CardMenuButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e, doc);
                        }}
                      >
                        <MoreVertical size={16} />
                      </CardMenuButton>
                    </CompactItem>
                  ))}
                </DocumentsCompactView>
              )}

              <FetchMoreOnVisible fetchNextPage={handleFetchMore} />
            </>
          ) : documents_error ? (
            <EmptyStateWrapper>
              <EmptyState
                icon={<AlertCircle size={48} />}
                title="Failed to load documents"
                description={
                  documents_error.message ||
                  "An error occurred while loading documents. Please try again."
                }
                size="lg"
                action={
                  <Button variant="primary" onClick={() => refetchDocuments()}>
                    Try Again
                  </Button>
                }
              />
            </EmptyStateWrapper>
          ) : !documents_loading ? (
            <EmptyStateWrapper>
              <EmptyState
                icon={<DocumentIcon />}
                title={
                  activeStatusFilter !== "all"
                    ? `No ${getSectionTitle().toLowerCase()}`
                    : hasAdvancedFilters
                    ? "No documents match your filters"
                    : "No documents yet"
                }
                description={
                  activeStatusFilter !== "all"
                    ? "Try selecting a different filter to see more documents."
                    : hasAdvancedFilters
                    ? "Try adjusting your filters or clearing them to see more documents."
                    : "Upload your first document to get started with document analysis, annotation, and AI-powered insights."
                }
                size="lg"
                action={
                  activeStatusFilter === "all" &&
                  !hasAdvancedFilters &&
                  auth_token ? (
                    <Button
                      variant="primary"
                      leftIcon={<Plus size={16} />}
                      onClick={() => showUploadNewDocumentsModal(true)}
                    >
                      Upload Your First Document
                    </Button>
                  ) : undefined
                }
              />
            </EmptyStateWrapper>
          ) : null}
        </DocumentsListContainer>

        {/* Context Menu */}
        {contextMenu && (
          <FloatingMenu
            vertical
            style={{
              left: contextMenu.position.x,
              top: contextMenu.position.y,
            }}
          >
            <MenuHeader title={contextMenu.document.title || "Untitled"}>
              {contextMenu.document.title || "Untitled"}
            </MenuHeader>
            <Menu.Item
              className="primary"
              icon="external"
              content="Open Document"
              onClick={(e) => {
                e.stopPropagation();
                handleDocumentClick(contextMenu.document);
                handleCloseContextMenu();
              }}
            />
            <Menu.Item
              icon="eye"
              content="View Details"
              onClick={(e) => {
                e.stopPropagation();
                viewingDocument(contextMenu.document);
                handleCloseContextMenu();
              }}
            />
            {auth_token && (
              <>
                <Menu.Item
                  icon="folder open"
                  content="Add to Corpus"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectedDocumentIds([contextMenu.document.id]);
                    showAddDocsToCorpusModal(true);
                    handleCloseContextMenu();
                  }}
                />
                <Menu.Item
                  icon="edit"
                  content="Edit Details"
                  onClick={(e) => {
                    e.stopPropagation();
                    editingDocument(contextMenu.document);
                    handleCloseContextMenu();
                  }}
                />
                <Menu.Item
                  icon="check square"
                  content={
                    selected_document_ids.includes(contextMenu.document.id)
                      ? "Deselect"
                      : "Select"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(contextMenu.document.id);
                    handleCloseContextMenu();
                  }}
                />
                <Menu.Item
                  className="danger"
                  icon="trash"
                  content="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectedDocumentIds([contextMenu.document.id]);
                    showDeleteDocumentsModal(true);
                    handleCloseContextMenu();
                  }}
                />
              </>
            )}
          </FloatingMenu>
        )}
      </ContentContainer>
    </PageContainer>
  );
};
