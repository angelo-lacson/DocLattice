import React, { useEffect } from "react";
import { useSetAtom, useAtomValue, useAtom } from "jotai";
import { useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { selectedFolderId as selectedFolderIdReactiveVar } from "../../../graphql/cache";
import { FolderTreeSidebar } from "./FolderTreeSidebar";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { CreateFolderModal } from "./CreateFolderModal";
import { EditFolderModal } from "./EditFolderModal";
import { MoveFolderModal } from "./MoveFolderModal";
import { DeleteFolderModal } from "./DeleteFolderModal";
import {
  folderCorpusIdAtom,
  selectedFolderIdAtom,
  sidebarCollapsedAtom,
} from "../../../atoms/folderAtoms";

/**
 * FolderDocumentBrowser - Main container for folder-based document browsing
 *
 * Features:
 * - Three-column layout: Sidebar | Breadcrumb + Content | Modals
 * - Folder tree navigation on left (collapsible)
 * - Breadcrumb navigation at top of content area
 * - Document list in main content area (passed as children)
 * - All folder modals mounted and controlled by atoms
 * - Responsive: sidebar collapses on mobile
 *
 * Props:
 * - corpusId: The corpus to browse
 * - initialFolderId: Optional initial folder selection
 * - onFolderChange: Optional callback when folder selection changes
 * - children: Main content area (typically CorpusDocumentCards)
 * - showSidebar: Whether to show folder sidebar (default: true)
 * - showBreadcrumb: Whether to show breadcrumb (default: true)
 */

interface FolderDocumentBrowserProps {
  corpusId: string;
  initialFolderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  children?: React.ReactNode;
  showSidebar?: boolean;
  showBreadcrumb?: boolean;
}

const BrowserContainer = styled.div`
  position: relative;
  display: flex;
  height: 100%;
  overflow: hidden;
  background: #f8fafc;
`;

const Sidebar = styled.aside<{ $visible: boolean; $collapsed: boolean }>`
  width: ${(props) => (props.$collapsed ? "0px" : "320px")};
  min-width: ${(props) => (props.$collapsed ? "0px" : "320px")};
  height: 100%;
  display: ${(props) => (props.$visible ? "flex" : "none")};
  flex-direction: column;
  border-right: ${(props) =>
    props.$collapsed ? "none" : "1px solid #e2e8f0"};
  background: white;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    position: absolute;
    left: ${(props) => (props.$visible && !props.$collapsed ? "0" : "-320px")};
    z-index: 100;
    width: 320px;
    min-width: 320px;
    box-shadow: ${(props) =>
      props.$visible && !props.$collapsed
        ? "4px 0 12px rgba(0, 0, 0, 0.1)"
        : "none"};
  }
`;

const MainContent = styled.main<{ $hasSidebar: boolean }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  margin-left: ${(props) => (props.$hasSidebar ? "0" : "0")};

  @media (max-width: 768px) {
    margin-left: 0;
  }
`;

const BreadcrumbWrapper = styled.div<{ $visible: boolean }>`
  display: ${(props) => (props.$visible ? "block" : "none")};
  flex-shrink: 0;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  background: white;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 5px;

    &:hover {
      background: #94a3b8;
    }
  }
`;

const ToggleButton = styled.button<{ $collapsed: boolean }>`
  position: absolute;
  left: ${(props) => (props.$collapsed ? "0" : "320px")};
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 48px;
  background: white;
  border: 1px solid #e2e8f0;
  border-left: ${(props) => (props.$collapsed ? "1px solid #e2e8f0" : "none")};
  border-radius: ${(props) =>
    props.$collapsed ? "0 6px 6px 0" : "6px 0 0 6px"};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 101;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  color: #64748b;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);

  &:hover {
    background: #f8fafc;
    color: #3b82f6;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(-50%) scale(0.95);
  }

  @media (max-width: 768px) {
    display: none;
  }
`;

export const FolderDocumentBrowser: React.FC<FolderDocumentBrowserProps> = ({
  corpusId,
  initialFolderId = null,
  onFolderChange,
  children,
  showSidebar = true,
  showBreadcrumb = true,
}) => {
  const setCorpusId = useSetAtom(folderCorpusIdAtom);
  const setSelectedFolderId = useSetAtom(selectedFolderIdAtom);
  const selectedFolderId = useReactiveVar(selectedFolderIdReactiveVar);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize corpus context
  useEffect(() => {
    setCorpusId(corpusId);
  }, [corpusId, setCorpusId]);

  // Sync reactive var to Jotai atom for UI components that still use it
  // (This is a temporary bridge until all folder components read from reactive var)
  useEffect(() => {
    setSelectedFolderId(selectedFolderId);
  }, [selectedFolderId, setSelectedFolderId]);

  // Call callback when folder changes
  useEffect(() => {
    if (onFolderChange) {
      onFolderChange(selectedFolderId);
    }
  }, [selectedFolderId, onFolderChange]);

  // Handle folder selection by updating URL (NOT reactive var directly!)
  // CentralRouteManager Phase 2 will detect URL change and set reactive var
  const handleFolderSelect = (folderId: string | null) => {
    const searchParams = new URLSearchParams(location.search);

    if (folderId) {
      searchParams.set("folder", folderId);
    } else {
      searchParams.delete("folder");
    }

    const newSearch = searchParams.toString();
    navigate({ search: newSearch ? `?${newSearch}` : "" }, { replace: true });
  };

  return (
    <>
      <BrowserContainer>
        {/* Folder Tree Sidebar */}
        <Sidebar $visible={showSidebar} $collapsed={sidebarCollapsed}>
          <FolderTreeSidebar
            corpusId={corpusId}
            onFolderSelect={handleFolderSelect}
          />
        </Sidebar>

        {/* Toggle Button */}
        {showSidebar && (
          <ToggleButton
            $collapsed={sidebarCollapsed}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </ToggleButton>
        )}

        {/* Main Content Area */}
        <MainContent $hasSidebar={showSidebar && !sidebarCollapsed}>
          {/* Breadcrumb Navigation */}
          <BreadcrumbWrapper $visible={showBreadcrumb}>
            <FolderBreadcrumb onFolderSelect={handleFolderSelect} />
          </BreadcrumbWrapper>

          {/* Document List or Custom Content */}
          <ContentArea>{children}</ContentArea>
        </MainContent>
      </BrowserContainer>

      {/* Folder Action Modals */}
      <CreateFolderModal />
      <EditFolderModal />
      <MoveFolderModal />
      <DeleteFolderModal />
    </>
  );
};
