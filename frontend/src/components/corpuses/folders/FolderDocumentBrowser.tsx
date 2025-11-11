import React, { useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
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
  display: flex;
  height: 100%;
  overflow: hidden;
  background: #f8fafc;
`;

const Sidebar = styled.aside<{ $visible: boolean }>`
  width: 320px;
  min-width: 320px;
  height: 100%;
  display: ${(props) => (props.$visible ? "flex" : "none")};
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  background: white;
  transition: width 0.2s ease;

  @media (max-width: 768px) {
    position: absolute;
    left: ${(props) => (props.$visible ? "0" : "-320px")};
    z-index: 100;
    box-shadow: ${(props) =>
      props.$visible ? "4px 0 12px rgba(0, 0, 0, 0.1)" : "none"};
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
        <Sidebar $visible={showSidebar}>
          <FolderTreeSidebar
            corpusId={corpusId}
            onFolderSelect={handleFolderSelect}
          />
        </Sidebar>

        {/* Main Content Area */}
        <MainContent $hasSidebar={showSidebar}>
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
