import React, { useEffect, useRef, useCallback } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { CollectionCard } from "@os-legal/ui";
import { Menu } from "semantic-ui-react";
import { ExtractType } from "../../types/graphql-api";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { getExtractStatus, formatExtractDate } from "../../utils/extractUtils";

// Styled Components

const CardWrapper = styled.div<{ $isSelected?: boolean }>`
  position: relative;
  border-radius: 12px;
  transition: all 0.15s ease;

  ${(props) =>
    props.$isSelected &&
    `
    box-shadow: 0 0 0 2px #0f766e;
    background: #f0fdfa;
  `}
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
    position: absolute;
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
      cursor: pointer;

      &:hover,
      &:focus {
        background: #f1f5f9 !important;
        outline: none;
      }

      &.danger {
        color: #dc2626 !important;

        &:hover,
        &:focus {
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

// Portal container for floating menu to handle positioning relative to viewport
const MenuPortal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9998;
  pointer-events: none;

  & > * {
    pointer-events: auto;
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
  /** Whether the card is currently selected (for inline selection mode) */
  isSelected?: boolean;
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
  isSelected = false,
}) => {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    // Don't navigate if menu is open
    if (isMenuOpen) return;

    // Use callback if provided, otherwise navigate directly
    if (onView) {
      onView(extract);
    } else {
      navigate(`/extracts/${extract.id}`);
    }
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

  // Handle keyboard shortcut (Shift+F10) for context menu
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.shiftKey && e.key === "F10" && onOpenMenu) {
        e.preventDefault();
        // Open menu at card center
        const rect = e.currentTarget.getBoundingClientRect();
        const syntheticEvent = {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as React.MouseEvent;
        onOpenMenu(syntheticEvent, extract.id);
      }
    },
    [extract.id, onOpenMenu]
  );

  // Handle keyboard navigation within menu
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseMenu?.();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
        if (!items?.length) return;

        const currentIndex = Array.from(items).findIndex(
          (item) => item === document.activeElement
        );
        let nextIndex: number;
        if (e.key === "ArrowDown") {
          nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        }
        (items[nextIndex] as HTMLElement).focus();
      }
    },
    [onCloseMenu]
  );

  // Focus first menu item when menu opens
  useEffect(() => {
    if (isMenuOpen && menuRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const firstItem = menuRef.current?.querySelector(
          '[role="menuitem"]'
        ) as HTMLElement;
        firstItem?.focus();
      }, 0);
    }
  }, [isMenuOpen]);

  // Calculate bounded menu position to keep within viewport
  const getBoundedMenuPosition = () => {
    if (!menuPosition) return { left: 0, top: 0 };

    const menuWidth = 180;
    const menuHeight = 100; // Approximate
    const padding = 8;

    let { x, y } = menuPosition;

    // Bound to viewport
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    return { left: x, top: y };
  };

  const statusLabel = getExtractStatus(extract).label;
  const stats = formatStats(extract);
  const permissions = getPermissions(extract.myPermissions || []);
  const canRemove = permissions.includes(PermissionTypes.CAN_REMOVE);

  // Add creation date to description
  const description = extract.created
    ? `Created ${formatExtractDate(extract.created)}`
    : "No description";

  const boundedPosition = getBoundedMenuPosition();

  return (
    <>
      <CardWrapper
        $isSelected={isSelected}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="article"
        aria-label={`Extract: ${extract.name || "Untitled Extract"}`}
      >
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
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={handleMenuButtonClick}
            >
              <KebabIcon />
            </MenuButton>
          }
        />
      </CardWrapper>

      {/* Floating Context Menu */}
      {isMenuOpen && menuPosition && (
        <MenuPortal>
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              left: boundedPosition.left,
              top: boundedPosition.top,
            }}
            onKeyDown={handleMenuKeyDown}
          >
            <FloatingMenu vertical role="menu" aria-label="Extract actions">
              {onView && (
                <Menu.Item
                  role="menuitem"
                  tabIndex={0}
                  icon="eye"
                  content="View Details"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(extract);
                    onCloseMenu?.();
                  }}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onView(extract);
                      onCloseMenu?.();
                    }
                  }}
                />
              )}
              {canRemove && onDelete && (
                <Menu.Item
                  role="menuitem"
                  tabIndex={0}
                  className="danger"
                  icon="trash"
                  content="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(extract);
                    onCloseMenu?.();
                  }}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onDelete(extract);
                      onCloseMenu?.();
                    }
                  }}
                />
              )}
            </FloatingMenu>
          </div>
        </MenuPortal>
      )}
    </>
  );
};

export default ExtractListCard;
