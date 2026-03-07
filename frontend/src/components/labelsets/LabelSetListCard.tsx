import React from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { CollectionCard } from "@os-legal/ui";
import { Menu } from "semantic-ui-react";
import { LabelSetType } from "../../types/graphql-api";
import { getLabelsetUrl } from "../../utils/navigationUtils";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const CardWrapper = styled.div`
  position: relative;
`;

const MenuButton = styled.button`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: ${OS_LEGAL_COLORS.textSecondary};
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: ${OS_LEGAL_COLORS.surfaceLight};
      color: #334155;
    }
  }
`;

const FloatingMenu = styled(Menu)`
  &.ui.menu {
    position: fixed;
    z-index: 9999;
    min-width: 180px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    border: 1px solid ${OS_LEGAL_COLORS.border};
    padding: 4px 0;

    .item {
      padding: 10px 14px !important;
      font-size: 14px !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;

      &:hover {
        background: ${OS_LEGAL_COLORS.surfaceLight} !important;
      }

      &.danger {
        color: ${OS_LEGAL_COLORS.danger} !important;

        &:hover {
          background: ${OS_LEGAL_COLORS.dangerSurface} !important;
        }
      }

      i.icon {
        margin: 0 !important;
        opacity: 0.7;
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const KebabIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="3" r="1.5" fill="currentColor" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <circle cx="8" cy="13" r="1.5" fill="currentColor" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getVisibilityStatus(
  labelset: LabelSetType,
  currentUserEmail?: string
): string {
  const isOwner = labelset.creator?.email === currentUserEmail;
  if (labelset.isPublic) return "Public";
  if (isOwner) return "Private";
  return "Shared";
}

function formatStats(labelset: LabelSetType): string[] {
  const stats: string[] = [];

  // Total labels count
  const totalLabels =
    (labelset.docLabelCount || 0) +
    (labelset.spanLabelCount || 0) +
    (labelset.tokenLabelCount || 0);
  stats.push(`${totalLabels} ${totalLabels === 1 ? "label" : "labels"}`);

  // Corpus uses
  const corpusCount = labelset.corpusCount || 0;
  if (corpusCount > 0) {
    stats.push(
      `Used in ${corpusCount} ${corpusCount === 1 ? "corpus" : "corpuses"}`
    );
  }

  // Breakdown by type if there are labels
  if (totalLabels > 0) {
    const breakdown: string[] = [];
    if (labelset.tokenLabelCount && labelset.tokenLabelCount > 0) {
      breakdown.push(`${labelset.tokenLabelCount} text`);
    }
    if (labelset.docLabelCount && labelset.docLabelCount > 0) {
      breakdown.push(`${labelset.docLabelCount} doc`);
    }
    if (labelset.spanLabelCount && labelset.spanLabelCount > 0) {
      breakdown.push(`${labelset.spanLabelCount} span`);
    }
    if (breakdown.length > 0) {
      stats.push(breakdown.join(", "));
    }
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface LabelSetListCardProps {
  labelset: LabelSetType;
  currentUserEmail?: string;
  onEdit?: (labelset: LabelSetType) => void;
  onView?: (labelset: LabelSetType) => void;
  onDelete?: (labelset: LabelSetType) => void;
  onDuplicate?: (labelset: LabelSetType) => void;
  isMenuOpen?: boolean;
  menuPosition?: { x: number; y: number } | null;
  onOpenMenu?: (e: React.MouseEvent, labelsetId: string) => void;
  onCloseMenu?: () => void;
}

export const LabelSetListCard: React.FC<LabelSetListCardProps> = ({
  labelset,
  currentUserEmail,
  onEdit,
  onView,
  onDelete,
  onDuplicate,
  isMenuOpen,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    // Don't navigate if menu is open
    if (isMenuOpen) return;

    const url = getLabelsetUrl(labelset);
    if (url !== "#") {
      navigate(url);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onOpenMenu) {
      e.preventDefault();
      e.stopPropagation();
      onOpenMenu(e, labelset.id);
    }
  };

  const handleMenuButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenMenu) {
      onOpenMenu(e, labelset.id);
    }
  };

  const visibilityStatus = getVisibilityStatus(labelset, currentUserEmail);
  const stats = formatStats(labelset);
  const permissions = getPermissions(labelset.myPermissions || []);
  const canUpdate = permissions.includes(PermissionTypes.CAN_UPDATE);
  const canRemove = permissions.includes(PermissionTypes.CAN_REMOVE);

  return (
    <>
      <CardWrapper onContextMenu={handleContextMenu}>
        <CollectionCard
          type="default"
          image={labelset.icon || undefined}
          imageAlt={labelset.title || "Label set icon"}
          status={visibilityStatus}
          title={labelset.title || "Untitled Label Set"}
          description={labelset.description || "No description"}
          stats={stats}
          onClick={handleClick}
          menu={
            <MenuButton
              type="button"
              className="oc-collection-card__menu-button"
              aria-label="Open menu"
              onClick={handleMenuButtonClick}
            >
              <KebabIcon />
            </MenuButton>
          }
        />
      </CardWrapper>

      {/* Floating Context Menu */}
      {isMenuOpen && menuPosition && (
        <FloatingMenu
          vertical
          style={{
            left: menuPosition.x,
            top: menuPosition.y,
          }}
        >
          {canUpdate && onEdit && (
            <Menu.Item
              icon="edit outline"
              content="Edit"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(labelset);
                onCloseMenu?.();
              }}
            />
          )}
          {onView && (
            <Menu.Item
              icon="eye"
              content="View Details"
              onClick={(e) => {
                e.stopPropagation();
                onView(labelset);
                onCloseMenu?.();
              }}
            />
          )}
          {onDuplicate && (
            <Menu.Item
              icon="copy"
              content="Duplicate"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(labelset);
                onCloseMenu?.();
              }}
            />
          )}
          {canRemove && onDelete && (
            <Menu.Item
              className="danger"
              icon="trash"
              content="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(labelset);
                onCloseMenu?.();
              }}
            />
          )}
        </FloatingMenu>
      )}
    </>
  );
};

export default LabelSetListCard;
