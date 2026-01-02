import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Dimmer, Loader, Message } from "semantic-ui-react";
import Fuse from "fuse.js";
import { useQuery, useMutation, useReactiveVar } from "@apollo/client";
import {
  GetLabelsetWithLabelsInputs,
  GetLabelsetWithLabelsOutputs,
  GET_LABELSET_WITH_ALL_LABELS,
} from "../../graphql/queries";
import {
  DeleteMultipleAnnotationLabelOutputs,
  DeleteMultipleAnnotationLabelInputs,
  DELETE_MULTIPLE_ANNOTATION_LABELS,
  CreateAnnotationLabelForLabelsetOutputs,
  CreateAnnotationLabelForLabelsetInputs,
  CREATE_ANNOTATION_LABEL_FOR_LABELSET,
  DeleteLabelsetInputs,
  DeleteLabelsetOutputs,
  DELETE_LABELSET,
  UpdateAnnotationLabelInputs,
  UpdateAnnotationLabelOutputs,
  UPDATE_ANNOTATION_LABEL,
} from "../../graphql/mutations";
import { ConfirmModal } from "../widgets/modals/ConfirmModal";
import { openedLabelset, userObj } from "../../graphql/cache";
import {
  AnnotationLabelType,
  LabelSetType,
  LabelType,
} from "../../types/graphql-api";
import { toast } from "react-toastify";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";

const fuse_options = {
  includeScore: false,
  findAllMatches: true,
  keys: ["text", "description"],
};

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const ChevronLeftIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11.25 13.5L6.75 9l4.5-4.5" />
  </svg>
);

const OverviewIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="5" height="5" rx="1" />
    <rect x="10" y="3" width="5" height="5" rx="1" />
    <rect x="3" y="10" width="5" height="5" rx="1" />
    <rect x="10" y="10" width="5" height="5" rx="1" />
  </svg>
);

const DocLabelIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.5 1.5H4.5a1.5 1.5 0 00-1.5 1.5v12a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5V6L10.5 1.5z" />
    <path d="M10.5 1.5V6H15" />
    <path d="M6 9h6M6 12h4" />
  </svg>
);

const SpanLabelIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 5.25h12M3 9h8M3 12.75h10" />
    <rect
      x="11"
      y="7.5"
      width="4"
      height="3"
      rx="0.5"
      fill="currentColor"
      opacity="0.2"
      stroke="currentColor"
    />
  </svg>
);

const TextLabelIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 4.5h12M6 9h6M4.5 13.5h9" />
    <path d="M9 3v12" strokeOpacity="0.3" />
  </svg>
);

const RelationshipIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="4.5" cy="9" r="2.5" />
    <circle cx="13.5" cy="9" r="2.5" />
    <path d="M7 9h4" />
    <path d="M10 7l2 2-2 2" />
  </svg>
);

const ShareIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="13.5" cy="3.75" r="2.25" />
    <circle cx="4.5" cy="9" r="2.25" />
    <circle cx="13.5" cy="14.25" r="2.25" />
    <path d="M6.54 10.11l4.92 3.03M11.46 4.86L6.54 7.89" />
  </svg>
);

const EditIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11.5 2.5a1.77 1.77 0 012.5 2.5L5.25 13.75 1.5 14.5l.75-3.75L11.5 2.5z" />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 4h12M5.33 4V2.67a.67.67 0 01.67-.67h4a.67.67 0 01.67.67V4M12.67 4v9.33a.67.67 0 01-.67.67H4a.67.67 0 01-.67-.67V4" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 2v9M4.5 7.5L8 11l3.5-3.5M2 14h12" />
  </svg>
);

const SaveIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13.33 5.33L6.67 12 2.67 8" />
  </svg>
);

const CloseIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 4L4 12M4 4l8 8" />
  </svg>
);

const GripIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="currentColor"
    opacity="0.4"
  >
    <circle cx="5" cy="4" r="1.5" />
    <circle cx="11" cy="4" r="1.5" />
    <circle cx="5" cy="8" r="1.5" />
    <circle cx="11" cy="8" r="1.5" />
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="11" cy="12" r="1.5" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="7" cy="7" r="5" />
    <path d="M14 14l-3.5-3.5" />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M9 3.75v10.5M3.75 9h10.5" />
  </svg>
);

const LabelSetIcon = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 8H10a4 4 0 00-4 4v24a4 4 0 004 4h28a4 4 0 004-4V20" />
    <path d="M32 6l8 8-16 16H16v-8L32 6z" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const PageContainer = styled.div`
  display: flex;
  height: calc(100vh - 60px);
  background: #fafafa;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
`;

const Sidebar = styled.aside`
  width: 260px;
  min-width: 260px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
`;

const SidebarHeader = styled.div`
  padding: 24px 20px;
  border-bottom: 1px solid #e2e8f0;
`;

const BackLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  text-decoration: none;
  padding: 6px 10px 6px 6px;
  margin: -6px -10px -6px -6px;
  border-radius: 6px;
  transition: all 0.15s ease;
  cursor: pointer;
  background: none;
  border: none;

  &:hover {
    background: #f1f5f9;
    color: #1e293b;
  }
`;

const SidebarNav = styled.nav`
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
`;

interface NavItemProps {
  $active?: boolean;
}

const NavItem = styled.button<NavItemProps>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.$active ? "#0f766e" : "#475569")};
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  background: ${(props) =>
    props.$active
      ? "linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, transparent 100%)"
      : "none"};
  width: 100%;
  text-align: left;
  border-left: 2px solid
    ${(props) => (props.$active ? "#0f766e" : "transparent")};
  padding-left: ${(props) => (props.$active ? "18px" : "20px")};

  &:hover {
    background: ${(props) => (props.$active ? undefined : "#f8fafc")};
    color: ${(props) => (props.$active ? "#0f766e" : "#1e293b")};
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .nav-badge {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
    color: ${(props) => (props.$active ? "#fff" : "#94a3b8")};
    background: ${(props) => (props.$active ? "#0f766e" : "#f1f5f9")};
    padding: 2px 8px;
    border-radius: 10px;
  }
`;

const SidebarFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
`;

const EditDetailsButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
`;

const MainContainer = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const MainHeader = styled.header`
  padding: 24px 40px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
`;

const HeaderContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
`;

const Meta = styled.div`
  font-size: 14px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MetaSep = styled.span`
  color: #e2e8f0;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const ShareButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #0f766e;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #0d9488;
  }
`;

const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;
`;

const ContentInner = styled.div`
  max-width: 900px;
`;

// Overview styles
const OverviewSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const OverviewHero = styled.div`
  display: flex;
  gap: 32px;
  align-items: flex-start;
`;

const OverviewIconBox = styled.div`
  width: 120px;
  height: 120px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  flex-shrink: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
  }
`;

const OverviewDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const OverviewDescription = styled.p`
  font-size: 15px;
  line-height: 1.6;
  color: #475569;
  margin: 0 0 24px 0;
  max-width: 600px;
`;

const OverviewStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 500px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;
`;

const StatValue = styled.div`
  font-size: 28px;
  font-weight: 600;
  color: #0f766e;
  line-height: 1;
  margin-bottom: 4px;
`;

const StatLabel = styled.div`
  font-size: 13px;
  color: #475569;
`;

const OverviewActions = styled.div`
  display: flex;
  gap: 12px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #475569;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  &.danger {
    color: #dc2626;

    &:hover {
      background: #fef2f2;
      border-color: #fecaca;
    }
  }
`;

// Labels section styles
const LabelsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const SearchContainer = styled.div`
  position: relative;
  max-width: 400px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px 10px 40px;
  font-size: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;

  &:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }

  &::placeholder {
    color: #94a3b8;
  }
`;

const SearchIconWrapper = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
`;

const LabelsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const LabelItem = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  transition: all 0.15s ease;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  &:hover .label-actions {
    opacity: 1;
  }
`;

const LabelGrip = styled.div`
  cursor: grab;
  color: #94a3b8;
  flex-shrink: 0;

  &:active {
    cursor: grabbing;
  }
`;

const LabelColor = styled.div<{ $color: string }>`
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background-color: ${(props) => props.$color || "#94a3b8"};
  flex-shrink: 0;
`;

const LabelContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const LabelName = styled.p`
  font-size: 15px;
  font-weight: 500;
  color: #1e293b;
  margin: 0 0 2px 0;
`;

const LabelDescription = styled.p`
  font-size: 13px;
  color: #475569;
  margin: 0;
`;

const LabelUsage = styled.span`
  font-size: 12px;
  color: #94a3b8;
  flex-shrink: 0;
`;

const LabelActions = styled.div`
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
`;

const LabelActionButton = styled.button`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  &.danger {
    background: #fef2f2;
    color: #f87171;
    border: 1px solid #fecaca;

    &:hover {
      background: #fee2e2;
      color: #dc2626;
    }
  }

  &.success {
    background: #f0fdf4;
    color: #4ade80;
    border: 1px solid #bbf7d0;

    &:hover {
      background: #dcfce7;
      color: #16a34a;
    }
  }
`;

const LabelEditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  background: #fff;
  border: 2px solid #0f766e;
  border-radius: 10px;
`;

const LabelEditRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const LabelEditInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;

  &:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }
`;

const LabelEditTextarea = styled.textarea`
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #1e293b;
  outline: none;
  resize: vertical;
  min-height: 60px;
  transition: all 0.15s ease;

  &:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }
`;

const LabelEditLabel = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  min-width: 80px;
`;

const ColorInput = styled.input`
  width: 40px;
  height: 32px;
  padding: 2px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
`;

const LabelEditActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
`;

const AddLabelButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #475569;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  align-self: flex-start;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
`;

const EmptyStateIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  color: #94a3b8;
`;

const EmptyStateTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 8px;
`;

const EmptyStateDescription = styled.p`
  font-size: 14px;
  color: #475569;
  margin: 0 0 20px;
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
`;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type TabType =
  | "overview"
  | "text_labels"
  | "doc_labels"
  | "relationship_labels"
  | "span_labels"
  | "sharing";

interface LabelSetDetailPageProps {
  onClose?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const LabelSetDetailPage: React.FC<LabelSetDetailPageProps> = ({
  onClose,
}) => {
  const navigate = useNavigate();
  const opened_labelset = useReactiveVar(openedLabelset);
  const currentUser = useReactiveVar(userObj);

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [creatingLabelType, setCreatingLabelType] = useState<LabelType | null>(
    null
  );
  const [editForm, setEditForm] = useState<{
    text: string;
    description: string;
    color: string;
  }>({ text: "", description: "", color: "" });

  const my_permissions = getPermissions(
    opened_labelset?.myPermissions ? opened_labelset.myPermissions : []
  );
  const canUpdate = my_permissions.includes(PermissionTypes.CAN_UPDATE);
  const canRemove = my_permissions.includes(PermissionTypes.CAN_REMOVE);

  // Mutations
  const [createAnnotationLabelForLabelset] = useMutation<
    CreateAnnotationLabelForLabelsetOutputs,
    CreateAnnotationLabelForLabelsetInputs
  >(CREATE_ANNOTATION_LABEL_FOR_LABELSET);

  const [deleteMultipleLabels] = useMutation<
    DeleteMultipleAnnotationLabelOutputs,
    DeleteMultipleAnnotationLabelInputs
  >(DELETE_MULTIPLE_ANNOTATION_LABELS);

  const [updateAnnotationLabel] = useMutation<
    UpdateAnnotationLabelOutputs,
    UpdateAnnotationLabelInputs
  >(UPDATE_ANNOTATION_LABEL);

  const [deleteLabelset, { loading: delete_loading }] = useMutation<
    DeleteLabelsetOutputs,
    DeleteLabelsetInputs
  >(DELETE_LABELSET);

  // Query
  const {
    refetch,
    loading: label_set_loading,
    error: label_set_fetch_error,
    data: label_set_data,
  } = useQuery<GetLabelsetWithLabelsOutputs, GetLabelsetWithLabelsInputs>(
    GET_LABELSET_WITH_ALL_LABELS,
    {
      variables: {
        id: opened_labelset?.id ? opened_labelset.id : "",
      },
      skip: !opened_labelset?.id,
      notifyOnNetworkStatusChange: true,
    }
  );

  // Handlers
  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      openedLabelset(null);
      navigate("/label_sets");
    }
  };

  const handleDeleteLabel = (labels: AnnotationLabelType[]) => {
    deleteMultipleLabels({
      variables: {
        annotationLabelIdsToDelete: labels.map((label) => label.id),
      },
    })
      .then((result) => {
        if (result.data?.deleteMultipleAnnotationLabels?.ok) {
          refetch();
          toast.success("Label deleted successfully");
        } else {
          toast.error(
            result.data?.deleteMultipleAnnotationLabels?.message ||
              "Failed to delete label"
          );
        }
      })
      .catch((err) => {
        console.error("Error deleting label", err);
        toast.error("Failed to delete label");
      });
  };

  const handleStartEdit = (label: AnnotationLabelType) => {
    setEditingLabelId(label.id);
    setEditForm({
      text: label.text || "",
      description: label.description || "",
      color: label.color || "94a3b8",
    });
  };

  const handleCancelEdit = () => {
    setEditingLabelId(null);
    setCreatingLabelType(null);
    setEditForm({ text: "", description: "", color: "" });
  };

  const handleSaveEdit = () => {
    if (!editingLabelId) return;

    updateAnnotationLabel({
      variables: {
        id: editingLabelId,
        text: editForm.text,
        description: editForm.description,
        color: editForm.color.replace("#", ""),
      },
    })
      .then((result) => {
        if (result.data?.updateAnnotationLabel?.ok) {
          refetch();
          toast.success("Label updated successfully");
          handleCancelEdit();
        } else {
          toast.error(
            result.data?.updateAnnotationLabel?.message ||
              "Failed to update label"
          );
        }
      })
      .catch((err) => {
        console.error("Error updating label", err);
        toast.error("Failed to update label");
      });
  };

  const handleStartCreate = (labelType: LabelType) => {
    // Cancel any existing edit
    setEditingLabelId(null);
    // Start creating a new label
    setCreatingLabelType(labelType);
    setEditForm({
      text: "",
      description: "",
      color: "0F766E", // Default teal color
    });
  };

  const handleSaveCreate = () => {
    if (!creatingLabelType || !editForm.text.trim()) {
      toast.error("Please enter a label name");
      return;
    }

    createAnnotationLabelForLabelset({
      variables: {
        color: editForm.color.replace("#", ""),
        description: editForm.description,
        icon: "tag",
        text: editForm.text,
        labelType: creatingLabelType,
        labelsetId: opened_labelset?.id ? opened_labelset.id : "",
      },
    })
      .then(() => {
        toast.success("Label created successfully");
        refetch();
        handleCancelEdit();
      })
      .catch((err) => {
        toast.error("Failed to create label");
        console.error("Error creating label:", err);
      });
  };

  const handleExportJSON = () => {
    if (!label_set_data?.labelset) return;
    const exportData = {
      title: label_set_data.labelset.title,
      description: label_set_data.labelset.description,
      labels: label_set_data.labelset.allAnnotationLabels?.map((label) => ({
        text: label?.text,
        description: label?.description,
        color: label?.color,
        icon: label?.icon,
        labelType: label?.labelType,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label_set_data.labelset.title || "labelset"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Label set exported successfully");
  };

  const handleDelete = () => {
    if (!opened_labelset?.id) return;

    deleteLabelset({
      variables: { id: opened_labelset.id },
    })
      .then((result) => {
        if (result.data?.deleteLabelset?.ok) {
          toast.success("Label set deleted successfully");
          openedLabelset(null);
          navigate("/label_sets");
        } else {
          toast.error(
            result.data?.deleteLabelset?.message || "Failed to delete label set"
          );
        }
      })
      .catch((err) => {
        console.error("Error deleting labelset:", err);
        toast.error("Failed to delete label set");
      });
    setShowDeleteConfirm(false);
  };

  const handleShare = () => {
    toast.info("Share functionality coming soon");
  };

  const handleEditDetails = () => {
    toast.info("Edit details functionality coming soon");
  };

  // Loading state
  if (label_set_loading && !label_set_data) {
    return (
      <PageContainer>
        <LoadingContainer>
          <Dimmer active inverted>
            <Loader size="large">Loading label set...</Loader>
          </Dimmer>
        </LoadingContainer>
      </PageContainer>
    );
  }

  // Error state
  if (label_set_fetch_error) {
    return (
      <PageContainer>
        <MainContent>
          <Message negative>
            <Message.Header>Error loading label set</Message.Header>
            <p>{label_set_fetch_error.message}</p>
          </Message>
        </MainContent>
      </PageContainer>
    );
  }

  // Get labels from data
  const labels: AnnotationLabelType[] = label_set_data?.labelset
    ?.allAnnotationLabels
    ? (label_set_data.labelset.allAnnotationLabels.filter(
        (item) => item!!
      ) as AnnotationLabelType[])
    : [];

  // Filter labels by type
  const text_labels = labels.filter(
    (label) => label.labelType === LabelType.TokenLabel
  );
  const doc_type_labels = labels.filter(
    (label) => label.labelType === LabelType.DocTypeLabel
  );
  const relationship_labels = labels.filter(
    (label) => label.labelType === LabelType.RelationshipLabel
  );
  const span_labels = labels.filter(
    (label) => label.labelType === LabelType.SpanLabel
  );

  // Setup fuzzy search
  const text_label_fuse = new Fuse(text_labels, fuse_options);
  const doc_label_fuse = new Fuse(doc_type_labels, fuse_options);
  const relationship_label_fuse = new Fuse(relationship_labels, fuse_options);
  const span_label_fuse = new Fuse(span_labels, fuse_options);

  // Apply search filter
  const filterLabels = (
    labels: AnnotationLabelType[],
    fuse: Fuse<AnnotationLabelType>
  ) => {
    if (searchTerm.length > 0) {
      return fuse.search(searchTerm).map((item) => item.item);
    }
    return labels;
  };

  const text_label_results = filterLabels(text_labels, text_label_fuse);
  const doc_label_results = filterLabels(doc_type_labels, doc_label_fuse);
  const relationship_label_results = filterLabels(
    relationship_labels,
    relationship_label_fuse
  );
  const span_label_results = filterLabels(span_labels, span_label_fuse);

  const totalLabels =
    (label_set_data?.labelset?.docLabelCount || 0) +
    (label_set_data?.labelset?.spanLabelCount || 0) +
    (label_set_data?.labelset?.tokenLabelCount || 0);

  const labelset = label_set_data?.labelset || opened_labelset;

  // Render label list
  const renderLabelsList = (
    labels: AnnotationLabelType[],
    labelType: LabelType,
    labelTypeName: string
  ) => {
    if (labels.length === 0 && !searchTerm) {
      // If we're creating, show the form instead of empty state
      if (creatingLabelType === labelType) {
        return (
          <LabelEditForm>
            <LabelEditRow>
              <LabelEditLabel>Name</LabelEditLabel>
              <LabelEditInput
                type="text"
                value={editForm.text}
                onChange={(e) =>
                  setEditForm({ ...editForm, text: e.target.value })
                }
                placeholder="Enter label name"
                autoFocus
              />
            </LabelEditRow>
            <LabelEditRow>
              <LabelEditLabel>Description</LabelEditLabel>
              <LabelEditTextarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="Describe what this label is used for"
              />
            </LabelEditRow>
            <LabelEditRow>
              <LabelEditLabel>Color</LabelEditLabel>
              <ColorInput
                type="color"
                value={`#${editForm.color}`}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    color: e.target.value.replace("#", ""),
                  })
                }
              />
              <LabelColor $color={`#${editForm.color}`} />
            </LabelEditRow>
            <LabelEditActions>
              <LabelActionButton
                className="danger"
                title="Cancel"
                onClick={handleCancelEdit}
              >
                <CloseIcon />
              </LabelActionButton>
              <LabelActionButton
                className="success"
                title="Create"
                onClick={handleSaveCreate}
              >
                <SaveIcon />
              </LabelActionButton>
            </LabelEditActions>
          </LabelEditForm>
        );
      }

      return (
        <EmptyState>
          <EmptyStateIcon>
            <LabelSetIcon />
          </EmptyStateIcon>
          <EmptyStateTitle>
            No {labelTypeName.toLowerCase()} yet
          </EmptyStateTitle>
          <EmptyStateDescription>
            {labelTypeName} are used to categorize and annotate your documents.
          </EmptyStateDescription>
          {canUpdate && (
            <AddLabelButton onClick={() => handleStartCreate(labelType)}>
              <PlusIcon /> Add First Label
            </AddLabelButton>
          )}
        </EmptyState>
      );
    }

    if (labels.length === 0 && searchTerm) {
      return (
        <EmptyState>
          <EmptyStateTitle>No labels match "{searchTerm}"</EmptyStateTitle>
          <EmptyStateDescription>
            Try a different search term or add a new label.
          </EmptyStateDescription>
        </EmptyState>
      );
    }

    // Check if we're creating a new label of this type
    const isCreating = creatingLabelType === labelType;

    return (
      <>
        {/* Create form at top when adding new label */}
        {isCreating && (
          <LabelEditForm>
            <LabelEditRow>
              <LabelEditLabel>Name</LabelEditLabel>
              <LabelEditInput
                type="text"
                value={editForm.text}
                onChange={(e) =>
                  setEditForm({ ...editForm, text: e.target.value })
                }
                placeholder="Enter label name"
                autoFocus
              />
            </LabelEditRow>
            <LabelEditRow>
              <LabelEditLabel>Description</LabelEditLabel>
              <LabelEditTextarea
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="Describe what this label is used for"
              />
            </LabelEditRow>
            <LabelEditRow>
              <LabelEditLabel>Color</LabelEditLabel>
              <ColorInput
                type="color"
                value={`#${editForm.color}`}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    color: e.target.value.replace("#", ""),
                  })
                }
              />
              <LabelColor $color={`#${editForm.color}`} />
            </LabelEditRow>
            <LabelEditActions>
              <LabelActionButton
                className="danger"
                title="Cancel"
                onClick={handleCancelEdit}
              >
                <CloseIcon />
              </LabelActionButton>
              <LabelActionButton
                className="success"
                title="Create"
                onClick={handleSaveCreate}
              >
                <SaveIcon />
              </LabelActionButton>
            </LabelEditActions>
          </LabelEditForm>
        )}

        {/* Existing labels list */}
        <LabelsList>
          {labels.map((label) =>
            editingLabelId === label.id ? (
              <LabelEditForm key={label.id}>
                <LabelEditRow>
                  <LabelEditLabel>Name</LabelEditLabel>
                  <LabelEditInput
                    type="text"
                    value={editForm.text}
                    onChange={(e) =>
                      setEditForm({ ...editForm, text: e.target.value })
                    }
                    placeholder="Label name"
                  />
                </LabelEditRow>
                <LabelEditRow>
                  <LabelEditLabel>Description</LabelEditLabel>
                  <LabelEditTextarea
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                    placeholder="Label description"
                  />
                </LabelEditRow>
                <LabelEditRow>
                  <LabelEditLabel>Color</LabelEditLabel>
                  <ColorInput
                    type="color"
                    value={`#${editForm.color}`}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        color: e.target.value.replace("#", ""),
                      })
                    }
                  />
                  <LabelColor $color={`#${editForm.color}`} />
                </LabelEditRow>
                <LabelEditActions>
                  <LabelActionButton
                    className="danger"
                    title="Cancel"
                    onClick={handleCancelEdit}
                  >
                    <CloseIcon />
                  </LabelActionButton>
                  <LabelActionButton
                    className="success"
                    title="Save"
                    onClick={handleSaveEdit}
                  >
                    <SaveIcon />
                  </LabelActionButton>
                </LabelEditActions>
              </LabelEditForm>
            ) : (
              <LabelItem key={label.id}>
                <LabelGrip>
                  <GripIcon />
                </LabelGrip>
                <LabelColor $color={`#${label.color || "94a3b8"}`} />
                <LabelContent>
                  <LabelName>{label.text}</LabelName>
                  <LabelDescription>{label.description}</LabelDescription>
                </LabelContent>
                <LabelUsage>0 uses</LabelUsage>
                <LabelActions className="label-actions">
                  {canUpdate && (
                    <LabelActionButton
                      title="Edit"
                      onClick={() => handleStartEdit(label)}
                    >
                      <EditIcon />
                    </LabelActionButton>
                  )}
                  {canUpdate && (
                    <LabelActionButton
                      className="danger"
                      title="Delete"
                      onClick={() => handleDeleteLabel([label])}
                    >
                      <TrashIcon />
                    </LabelActionButton>
                  )}
                </LabelActions>
              </LabelItem>
            )
          )}
        </LabelsList>

        {/* Add button - hidden when already creating */}
        {canUpdate && !isCreating && (
          <AddLabelButton onClick={() => handleStartCreate(labelType)}>
            <PlusIcon /> Add Label
          </AddLabelButton>
        )}
      </>
    );
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewSection>
            <OverviewHero>
              <OverviewIconBox>
                {labelset?.icon ? (
                  <img src={labelset.icon} alt="Label set icon" />
                ) : (
                  <LabelSetIcon />
                )}
              </OverviewIconBox>
              <OverviewDetails>
                <OverviewDescription>
                  {labelset?.description || "No description provided."}
                </OverviewDescription>

                <OverviewStats>
                  <StatCard>
                    <StatValue>{totalLabels}</StatValue>
                    <StatLabel>Total Labels</StatLabel>
                  </StatCard>
                  <StatCard>
                    <StatValue>
                      {label_set_data?.labelset?.docLabelCount || 0}
                    </StatValue>
                    <StatLabel>Doc Labels</StatLabel>
                  </StatCard>
                  <StatCard>
                    <StatValue>
                      {label_set_data?.labelset?.spanLabelCount || 0}
                    </StatValue>
                    <StatLabel>Span Labels</StatLabel>
                  </StatCard>
                </OverviewStats>

                <OverviewActions>
                  <ActionButton onClick={handleExportJSON}>
                    <DownloadIcon />
                    Export JSON
                  </ActionButton>
                  {canRemove && (
                    <ActionButton
                      className="danger"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <TrashIcon />
                      Delete
                    </ActionButton>
                  )}
                </OverviewActions>
              </OverviewDetails>
            </OverviewHero>
          </OverviewSection>
        );

      case "text_labels":
        return (
          <LabelsSection>
            <SearchContainer>
              <SearchIconWrapper>
                <SearchIcon />
              </SearchIconWrapper>
              <SearchInput
                type="text"
                placeholder="Search text labels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </SearchContainer>
            {renderLabelsList(
              text_label_results,
              LabelType.TokenLabel,
              "Text Labels"
            )}
          </LabelsSection>
        );

      case "doc_labels":
        return (
          <LabelsSection>
            <SearchContainer>
              <SearchIconWrapper>
                <SearchIcon />
              </SearchIconWrapper>
              <SearchInput
                type="text"
                placeholder="Search doc labels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </SearchContainer>
            {renderLabelsList(
              doc_label_results,
              LabelType.DocTypeLabel,
              "Doc Labels"
            )}
          </LabelsSection>
        );

      case "relationship_labels":
        return (
          <LabelsSection>
            <SearchContainer>
              <SearchIconWrapper>
                <SearchIcon />
              </SearchIconWrapper>
              <SearchInput
                type="text"
                placeholder="Search relationship labels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </SearchContainer>
            {renderLabelsList(
              relationship_label_results,
              LabelType.RelationshipLabel,
              "Relationship Labels"
            )}
          </LabelsSection>
        );

      case "span_labels":
        return (
          <LabelsSection>
            <SearchContainer>
              <SearchIconWrapper>
                <SearchIcon />
              </SearchIconWrapper>
              <SearchInput
                type="text"
                placeholder="Search labels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </SearchContainer>
            {renderLabelsList(
              span_label_results,
              LabelType.SpanLabel,
              "Span Labels"
            )}
          </LabelsSection>
        );

      case "sharing":
        return (
          <Message info>
            <Message.Header>Sharing Settings</Message.Header>
            <p>Sharing configuration will be available here.</p>
          </Message>
        );

      default:
        return null;
    }
  };

  return (
    <PageContainer>
      {(label_set_loading || delete_loading) && (
        <Dimmer active inverted>
          <Loader size="large">
            {delete_loading ? "Deleting..." : "Loading..."}
          </Loader>
        </Dimmer>
      )}

      <Sidebar>
        <SidebarHeader>
          <BackLink onClick={handleBack}>
            <ChevronLeftIcon />
            Label Sets
          </BackLink>
        </SidebarHeader>

        <SidebarNav>
          <NavItem
            $active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            <span className="nav-icon">
              <OverviewIcon />
            </span>
            Overview
          </NavItem>
          <NavItem
            $active={activeTab === "text_labels"}
            onClick={() => setActiveTab("text_labels")}
          >
            <span className="nav-icon">
              <TextLabelIcon />
            </span>
            Text Labels
            <span className="nav-badge">{text_labels.length}</span>
          </NavItem>
          <NavItem
            $active={activeTab === "doc_labels"}
            onClick={() => setActiveTab("doc_labels")}
          >
            <span className="nav-icon">
              <DocLabelIcon />
            </span>
            Doc Labels
            <span className="nav-badge">{doc_type_labels.length}</span>
          </NavItem>
          <NavItem
            $active={activeTab === "relationship_labels"}
            onClick={() => setActiveTab("relationship_labels")}
          >
            <span className="nav-icon">
              <RelationshipIcon />
            </span>
            Relationships
            <span className="nav-badge">{relationship_labels.length}</span>
          </NavItem>
          <NavItem
            $active={activeTab === "span_labels"}
            onClick={() => setActiveTab("span_labels")}
          >
            <span className="nav-icon">
              <SpanLabelIcon />
            </span>
            Span Labels
            <span className="nav-badge">{span_labels.length}</span>
          </NavItem>
          <NavItem
            $active={activeTab === "sharing"}
            onClick={() => setActiveTab("sharing")}
          >
            <span className="nav-icon">
              <ShareIcon />
            </span>
            Sharing
          </NavItem>
        </SidebarNav>

        {canUpdate && (
          <SidebarFooter>
            <EditDetailsButton onClick={handleEditDetails}>
              <EditIcon />
              Edit Details
            </EditDetailsButton>
          </SidebarFooter>
        )}
      </Sidebar>

      <MainContainer>
        <MainHeader>
          <HeaderRow>
            <HeaderContent>
              <TitleRow>
                <Title>{labelset?.title || "Untitled Label Set"}</Title>
                <Badge>{labelset?.isPublic ? "Public" : "Private"}</Badge>
              </TitleRow>
              <Meta>
                <span>
                  Created by{" "}
                  {labelset?.creator?.username ||
                    currentUser?.email ||
                    "Unknown"}
                </span>
                <MetaSep>·</MetaSep>
                <span>
                  {totalLabels} {totalLabels === 1 ? "label" : "labels"}
                </span>
              </Meta>
            </HeaderContent>
            <HeaderActions>
              <ShareButton onClick={handleShare}>
                <ShareIcon />
                Share
              </ShareButton>
            </HeaderActions>
          </HeaderRow>
        </MainHeader>

        <MainContent>
          <ContentInner>{renderContent()}</ContentInner>
        </MainContent>
      </MainContainer>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        message={`Are you sure you want to delete "${
          labelset?.title || "this label set"
        }"? This action cannot be undone.`}
        visible={showDeleteConfirm}
        yesAction={handleDelete}
        noAction={() => setShowDeleteConfirm(false)}
        toggleModal={() => setShowDeleteConfirm(false)}
      />
    </PageContainer>
  );
};

export default LabelSetDetailPage;
