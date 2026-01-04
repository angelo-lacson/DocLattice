import React, { useState, useCallback, useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import styled from "styled-components";
import {
  FolderPlus,
  Upload,
  List,
  LayoutGrid,
  Table2,
  PanelLeftOpen,
  ChevronLeft,
  ChevronUp,
  MoreVertical,
} from "lucide-react";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import {
  sidebarCollapsedAtom,
  canCreateFoldersAtom,
  folderBreadcrumbAtom,
} from "../../../atoms/folderAtoms";
import {
  TABLET_BREAKPOINT,
  DESKTOP_BREAKPOINT,
} from "../../../assets/configurations/constants";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_SPACING,
} from "../../../assets/configurations/osLegalStyles";
import { FolderViewMode } from "../../../types/ui";

// Re-export for backward compatibility with existing imports
export type ViewMode = FolderViewMode;

/**
 * FolderToolbar - Toolbar component for folder-based document browsing
 *
 * Features:
 * - Breadcrumb navigation
 * - Back/up navigation buttons
 * - New folder and upload actions
 * - View mode toggles (list/card/table)
 * - Sidebar toggle
 * - Mobile kebab menu
 */

interface FolderToolbarProps {
  showSidebar: boolean;
  selectedFolderId: string | null;
  canGoBack: boolean;
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onFolderSelect: (folderId: string | null) => void;
  onGoBack: () => void;
  onGoUp: () => void;
  onNewFolder: () => void;
  onUpload: () => void;
}

// ===============================================
// STYLED COMPONENTS
// ===============================================

const ToolbarContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  background: ${OS_LEGAL_COLORS.surface};
  flex-shrink: 0;

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    padding: 10px 12px;
    gap: 8px;
  }
`;

const ToolbarBreadcrumb = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    display: none;
  }
`;

// Mobile-only folder title - shows current folder name when breadcrumb is hidden
const MobileFolderTitle = styled.div`
  display: none;
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textPrimary};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    display: block;
  }
`;

const ToolbarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const NavButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  color: ${OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.borderHover};
    color: ${OS_LEGAL_COLORS.textPrimary};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  font-size: 13px;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textPrimary};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.borderHover};
  }

  svg {
    width: 16px;
    height: 16px;
    color: ${OS_LEGAL_COLORS.folderIcon};
  }

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    padding: 8px;

    span {
      display: none;
    }
  }
`;

const PrimaryButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${OS_LEGAL_COLORS.accent};
  border: 1px solid ${OS_LEGAL_COLORS.accent};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  font-size: 13px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.accentHover};
    border-color: ${OS_LEGAL_COLORS.accentHover};
  }

  svg {
    width: 16px;
    height: 16px;
  }

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    padding: 8px 12px;

    span {
      display: none;
    }
  }
`;

const ViewToggleGroup = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  overflow: hidden;
`;

const ViewToggleButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: ${(props) =>
    props.$active ? OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.surface};
  border: none;
  border-right: 1px solid ${OS_LEGAL_COLORS.border};
  color: ${(props) =>
    props.$active ? "white" : OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.15s ease;

  &:last-child {
    border-right: none;
  }

  &:hover:not(:disabled) {
    background: ${(props) =>
      props.$active
        ? OS_LEGAL_COLORS.accentHover
        : OS_LEGAL_COLORS.surfaceHover};
    color: ${(props) =>
      props.$active ? "white" : OS_LEGAL_COLORS.textPrimary};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const SidebarToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  color: ${OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.15s ease;
  margin-right: 8px;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.borderHover};
    color: ${OS_LEGAL_COLORS.textPrimary};
  }

  svg {
    width: 16px;
    height: 16px;
  }

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    display: none;
  }
`;

const MobileKebabButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  color: ${OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: auto;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    color: ${OS_LEGAL_COLORS.textPrimary};
  }

  svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    display: flex;
  }
`;

const MobileMenuOverlay = styled.div<{ $visible: boolean }>`
  display: ${(props) => (props.$visible ? "block" : "none")};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;

  @media (min-width: ${DESKTOP_BREAKPOINT}px) {
    display: none;
  }
`;

const MobileMenu = styled.div<{ $visible: boolean }>`
  display: ${(props) => (props.$visible ? "block" : "none")};
  position: absolute;
  top: 100%;
  right: 8px;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  box-shadow: ${OS_LEGAL_SPACING.shadowCardHover};
  min-width: 180px;
  z-index: 100;
  overflow: hidden;

  @media (min-width: ${DESKTOP_BREAKPOINT}px) {
    display: none;
  }
`;

const MobileMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  font-size: 14px;
  color: ${OS_LEGAL_COLORS.textPrimary};
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }

  &:active {
    background: ${OS_LEGAL_COLORS.border};
  }

  svg {
    width: 18px;
    height: 18px;
    color: ${OS_LEGAL_COLORS.textSecondary};
  }

  &:not(:last-child) {
    border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  }
`;

// ===============================================
// COMPONENT
// ===============================================

export const FolderToolbar: React.FC<FolderToolbarProps> = ({
  showSidebar,
  selectedFolderId,
  canGoBack,
  viewMode,
  onViewModeChange,
  onFolderSelect,
  onGoBack,
  onGoUp,
  onNewFolder,
  onUpload,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const canCreateFolders = useAtomValue(canCreateFoldersAtom);
  const breadcrumbPath = useAtomValue(folderBreadcrumbAtom);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get current folder name for mobile display
  const currentFolderName = selectedFolderId
    ? breadcrumbPath.length > 0
      ? breadcrumbPath[breadcrumbPath.length - 1].name
      : "Loading..."
    : "Documents";

  // Memoized view mode change handler to prevent unnecessary re-renders
  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      if (onViewModeChange) {
        onViewModeChange(mode);
      }
    },
    [onViewModeChange]
  );

  // Close mobile menu handler
  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  // Escape key handler for accessibility - closes mobile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        closeMobileMenu();
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [mobileMenuOpen, closeMobileMenu]);

  return (
    <ToolbarContainer>
      {/* Desktop sidebar toggle */}
      {showSidebar && (
        <SidebarToggleButton
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? "Show folders" : "Hide folders"}
          title={sidebarCollapsed ? "Show folders" : "Hide folders"}
        >
          <PanelLeftOpen />
        </SidebarToggleButton>
      )}

      <ToolbarBreadcrumb>
        <FolderBreadcrumb onFolderSelect={onFolderSelect} />
      </ToolbarBreadcrumb>

      {/* Mobile-only current folder name */}
      <MobileFolderTitle>{currentFolderName}</MobileFolderTitle>

      <ToolbarActions>
        {/* Navigation buttons */}
        <NavButton
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Go back"
          aria-label="Go back"
        >
          <ChevronLeft />
        </NavButton>
        <NavButton
          onClick={onGoUp}
          disabled={selectedFolderId === null}
          title="Go to root"
          aria-label="Go to root"
        >
          <ChevronUp />
        </NavButton>

        {/* New Folder button */}
        {canCreateFolders && (
          <ActionButton onClick={onNewFolder} title="Create new folder">
            <FolderPlus />
            <span>New Folder</span>
          </ActionButton>
        )}

        {/* Upload button */}
        <PrimaryButton onClick={onUpload} title="Upload documents">
          <Upload />
          <span>Upload</span>
        </PrimaryButton>

        {/* View toggle buttons */}
        {onViewModeChange && (
          <ViewToggleGroup>
            <ViewToggleButton
              $active={viewMode === "modern-list"}
              onClick={() => handleViewModeChange("modern-list")}
              title="List view"
              aria-label="List view"
              data-testid="list-view-button"
            >
              <List />
            </ViewToggleButton>
            <ViewToggleButton
              $active={viewMode === "modern-card"}
              onClick={() => handleViewModeChange("modern-card")}
              title="Card view"
              aria-label="Card view"
              data-testid="card-view-button"
            >
              <LayoutGrid />
            </ViewToggleButton>
            <ViewToggleButton
              $active={viewMode === "grid"}
              onClick={() => handleViewModeChange("grid")}
              title="Table view"
              aria-label="Table view"
              data-testid="grid-view-button"
            >
              <Table2 />
            </ViewToggleButton>
          </ViewToggleGroup>
        )}
      </ToolbarActions>

      {/* Mobile kebab menu */}
      {showSidebar && (
        <MobileKebabButton
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="More options"
          title="More options"
        >
          <MoreVertical />
        </MobileKebabButton>
      )}

      {/* Mobile menu overlay - click to close */}
      <MobileMenuOverlay
        $visible={mobileMenuOpen}
        onClick={closeMobileMenu}
        role="presentation"
        aria-hidden="true"
      />

      {/* Mobile dropdown menu */}
      <MobileMenu
        $visible={mobileMenuOpen}
        role="menu"
        aria-label="Toolbar actions menu"
      >
        <MobileMenuItem
          role="menuitem"
          onClick={() => {
            setSidebarCollapsed(false);
            closeMobileMenu();
          }}
        >
          <PanelLeftOpen />
          Show Folders
        </MobileMenuItem>
        {canCreateFolders && (
          <MobileMenuItem
            role="menuitem"
            onClick={() => {
              onNewFolder();
              closeMobileMenu();
            }}
          >
            <FolderPlus />
            New Folder
          </MobileMenuItem>
        )}
        <MobileMenuItem
          role="menuitem"
          onClick={() => {
            onUpload();
            closeMobileMenu();
          }}
        >
          <Upload />
          Upload Documents
        </MobileMenuItem>
      </MobileMenu>
    </ToolbarContainer>
  );
};
