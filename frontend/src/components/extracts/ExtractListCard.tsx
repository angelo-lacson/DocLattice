import React from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { CollectionCard } from "@os-legal/ui";
import { Menu } from "semantic-ui-react";
import { ExtractType } from "../../types/graphql-api";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { getExtractStatus, formatExtractDate } from "../../utils/extractUtils";

// Styled Components

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
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: #f1f5f9;
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

      i.icon {
        margin: 0 !important;
        opacity: 0.7;
      }
    }
  }
`;

// Icons

const KebabIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="3" r="1.5" fill="currentColor" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <circle cx="8" cy="13" r="1.5" fill="currentColor" />
  </svg>
);

// Helper Functions

function formatStats(extract: ExtractType): string[] {
  const stats: string[] = [];

  // Document count
  const docCount = extract.documents?.length || 0;
  stats.push(`${docCount} ${docCount === 1 ? "document" : "documents"}`);

  // Column count (from fieldset)
  const columnCount = extract.fieldset?.fullColumnList?.length || 0;
  if (columnCount > 0) {
    stats.push(`${columnCount} ${columnCount === 1 ? "column" : "columns"}`);
  }

  // Corpus name if available
  if (extract.corpus?.title) {
    stats.push(`from ${extract.corpus.title}`);
  }

  return stats;
}

// Main Component

interface ExtractListCardProps {
  extract: ExtractType;
  currentUserEmail?: string;
  onView?: (extract: ExtractType) => void;
  onDelete?: (extract: ExtractType) => void;
  isMenuOpen?: boolean;
  menuPosition?: { x: number; y: number } | null;
  onOpenMenu?: (e: React.MouseEvent, extractId: string) => void;
  onCloseMenu?: () => void;
}

export const ExtractListCard: React.FC<ExtractListCardProps> = ({
  extract,
  currentUserEmail,
  onView,
  onDelete,
  isMenuOpen,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    // Don't navigate if menu is open
    if (isMenuOpen) return;

    // Navigate to new route-based detail page
    navigate(`/extracts/${extract.id}`);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onOpenMenu) {
      e.preventDefault();
      e.stopPropagation();
      onOpenMenu(e, extract.id);
    }
  };

  const handleMenuButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenMenu) {
      onOpenMenu(e, extract.id);
    }
  };

  const statusLabel = getExtractStatus(extract).label;
  const stats = formatStats(extract);
  const permissions = getPermissions(extract.myPermissions || []);
  const canRemove = permissions.includes(PermissionTypes.CAN_REMOVE);

  // Add creation date to description
  const description = extract.created
    ? `Created ${formatExtractDate(extract.created)}`
    : "No description";

  return (
    <>
      <CardWrapper onContextMenu={handleContextMenu}>
        <CollectionCard
          type="default"
          status={statusLabel}
          title={extract.name || "Untitled Extract"}
          description={description}
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
          {onView && (
            <Menu.Item
              icon="eye"
              content="View Details"
              onClick={(e) => {
                e.stopPropagation();
                onView(extract);
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
                onDelete(extract);
                onCloseMenu?.();
              }}
            />
          )}
        </FloatingMenu>
      )}
    </>
  );
};

export default ExtractListCard;
