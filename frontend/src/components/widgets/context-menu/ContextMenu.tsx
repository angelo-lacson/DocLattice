import React, { useEffect, useRef, useCallback } from "react";
import styled from "styled-components";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContextMenuItem {
  /** Unique key for the menu item */
  key: string;
  /** Lucide or other React icon element */
  icon?: React.ReactNode;
  /** Display label */
  label: string;
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
  /** Visual variant — "danger" shows red text/hover */
  variant?: "default" | "primary" | "danger";
  /** Whether to show this item */
  visible?: boolean;
}

export interface ContextMenuProps {
  /** Menu items to render */
  items: ContextMenuItem[];
  /** Pixel position for the menu */
  position: { x: number; y: number };
  /** Called when the menu should close (click-outside, Escape) */
  onClose: () => void;
  /** Optional header text shown at the top of the menu */
  header?: string;
  /** ARIA label for the menu */
  "aria-label"?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const MenuOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9998;
`;

const MenuContainer = styled.div`
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  padding: 4px 0;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
`;

const MenuHeader = styled.div`
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${OS_LEGAL_COLORS.textMuted};
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
`;

const MenuItem = styled.div<{ $variant?: "default" | "primary" | "danger" }>`
  padding: 10px 14px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.1s;
  color: ${(props) =>
    props.$variant === "danger"
      ? OS_LEGAL_COLORS.danger
      : props.$variant === "primary"
      ? OS_LEGAL_COLORS.accent
      : "inherit"};
  font-weight: ${(props) => (props.$variant === "primary" ? 500 : "inherit")};

  &:hover,
  &:focus-visible {
    background: ${(props) =>
      props.$variant === "danger"
        ? OS_LEGAL_COLORS.dangerSurface
        : OS_LEGAL_COLORS.surfaceLight};
    outline: none;
  }

  svg {
    flex-shrink: 0;
    opacity: 0.7;
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MENU_WIDTH = 200;
const VIEWPORT_PADDING = 8;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  onClose,
  header,
  "aria-label": ariaLabel = "Context menu",
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Bound position to viewport
  const getBoundedPosition = useCallback(() => {
    let { x, y } = position;
    const menuHeight = menuRef.current?.offsetHeight ?? 200;

    if (x + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
      x = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
    }
    if (y + menuHeight > window.innerHeight - VIEWPORT_PADDING) {
      y = window.innerHeight - menuHeight - VIEWPORT_PADDING;
    }
    if (x < VIEWPORT_PADDING) x = VIEWPORT_PADDING;
    if (y < VIEWPORT_PADDING) y = VIEWPORT_PADDING;

    return { left: x, top: y };
  }, [position]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const menuItems =
          menuRef.current?.querySelectorAll('[role="menuitem"]');
        if (!menuItems?.length) return;

        const currentIndex = Array.from(menuItems).findIndex(
          (item) => item === document.activeElement
        );
        let nextIndex: number;
        if (e.key === "ArrowDown") {
          nextIndex =
            currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
        }
        (menuItems[nextIndex] as HTMLElement).focus();
      }
    },
    [onClose]
  );

  // Focus first item on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstItem = menuRef.current?.querySelector(
        '[role="menuitem"]'
      ) as HTMLElement;
      firstItem?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const visibleItems = items.filter((item) => item.visible !== false);
  const bounded = getBoundedPosition();

  return (
    <>
      <MenuOverlay onClick={onClose} />
      <MenuContainer
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        style={{ left: bounded.left, top: bounded.top }}
        onKeyDown={handleKeyDown}
      >
        {header && <MenuHeader title={header}>{header}</MenuHeader>}
        {visibleItems.map((item) => (
          <MenuItem
            key={item.key}
            role="menuitem"
            tabIndex={0}
            $variant={item.variant}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick(e);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                item.onClick(e as unknown as React.MouseEvent);
              }
            }}
          >
            {item.icon}
            {item.label}
          </MenuItem>
        ))}
      </MenuContainer>
    </>
  );
};

export default ContextMenu;
