import React, { useEffect, useCallback, useState, useRef } from "react";
import { useSetAtom, useAtom, useAtomValue } from "jotai";
import { useReactiveVar, useMutation } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { X } from "lucide-react";
import { toast } from "react-toastify";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  selectedFolderId as selectedFolderIdReactiveVar,
  showUploadNewDocumentsModal,
  selectedDocumentIds as selectedDocumentIdsReactiveVar,
} from "../../../graphql/cache";
import { FolderTreeSidebar } from "./FolderTreeSidebar";
import { FolderToolbar } from "./FolderToolbar";
import { CreateFolderModal } from "./CreateFolderModal";
import { DocumentRelationshipModal } from "../../documents/DocumentRelationshipModal";
import { EditFolderModal } from "./EditFolderModal";
import { MoveFolderModal } from "./MoveFolderModal";
import { DeleteFolderModal } from "./DeleteFolderModal";
import { TrashFolderView } from "./TrashFolderView";
import {
  folderCorpusIdAtom,
  selectedFolderIdAtom,
  sidebarCollapsedAtom,
  openCreateFolderModalAtom,
  folderListAtom,
} from "../../../atoms/folderAtoms";
import {
  MOVE_DOCUMENT_TO_FOLDER,
  MoveDocumentToFolderInputs,
  MoveDocumentToFolderOutputs,
  MOVE_CORPUS_FOLDER,
  MoveCorpusFolderInputs,
  MoveCorpusFolderOutputs,
  GET_CORPUS_FOLDERS,
} from "../../../graphql/queries/folders";
import { TABLET_BREAKPOINT } from "../../../assets/configurations/constants";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_SPACING,
} from "../../../assets/configurations/osLegalStyles";
import { FolderViewMode } from "../../../types/ui";

// Re-export FolderViewMode as ViewMode for backward compatibility
export type ViewMode = FolderViewMode;

/**
 * FolderDocumentBrowser - Main container for folder-based document browsing
 *
 * Features:
 * - File system layout: Toolbar | Sidebar + Content | Modals
 * - Folder tree navigation on left (collapsible)
 * - Toolbar with breadcrumb, navigation, actions, view toggles
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
 * - viewMode: Current view mode
 * - onViewModeChange: Callback when view mode changes
 */

interface FolderDocumentBrowserProps {
  corpusId: string;
  initialFolderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  children?: React.ReactNode;
  showSidebar?: boolean;
  showBreadcrumb?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

// ===============================================
// FILE SYSTEM LAYOUT COMPONENTS
// ===============================================

const BrowserContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  padding: 8px;

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    padding: 4px;
  }
`;

const FileSystemContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
  overflow: hidden;
  min-height: 0;
`;

// ===============================================
// CONTENT LAYOUT COMPONENTS
// ===============================================

const ContentWrapper = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
`;

const Sidebar = styled.aside<{ $visible: boolean; $collapsed: boolean }>`
  width: ${(props) => (props.$collapsed ? "0px" : "240px")};
  min-width: ${(props) => (props.$collapsed ? "0px" : "240px")};
  display: ${(props) => (props.$visible ? "flex" : "none")};
  flex-direction: column;
  border-right: ${(props) =>
    props.$collapsed ? "none" : `1px solid ${OS_LEGAL_COLORS.border}`};
  background: ${OS_LEGAL_COLORS.surfaceHover};
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    position: absolute;
    left: ${(props) => (props.$visible && !props.$collapsed ? "0" : "-240px")};
    top: 0;
    bottom: 0;
    z-index: 100;
    width: 240px;
    min-width: 240px;
    box-shadow: ${(props) =>
      props.$visible && !props.$collapsed
        ? "4px 0 12px rgba(0, 0, 0, 0.1)"
        : "none"};
  }
`;

const MainContent = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0;
  background: ${OS_LEGAL_COLORS.surface};
  position: relative;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }

  &::-webkit-scrollbar-thumb {
    background: ${OS_LEGAL_COLORS.borderHover};
    border-radius: 5px;

    &:hover {
      background: ${OS_LEGAL_COLORS.textMuted};
    }
  }
`;

// Mobile close button for sidebar
const MobileSidebarCloseButton = styled.button`
  display: none;
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  color: ${OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  z-index: 10;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    display: flex;
  }

  &:hover {
    background: ${OS_LEGAL_COLORS.border};
    color: ${OS_LEGAL_COLORS.textPrimary};
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

// Mobile backdrop for sidebar - dismissible via click or Escape key
const MobileSidebarBackdrop = styled.div<{ $visible: boolean }>`
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 98; /* Below toggle button (99) */
  opacity: ${(props) => (props.$visible ? "1" : "0")};
  pointer-events: ${(props) => (props.$visible ? "auto" : "none")};
  transition: opacity 0.3s ease;

  @media (max-width: ${TABLET_BREAKPOINT}px) {
    display: block;
  }
`;

const ContextMenuOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
`;

const ContextMenu = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  top: ${(props) => props.$y}px;
  left: ${(props) => props.$x}px;
  background: ${OS_LEGAL_COLORS.surface};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusButton};
  box-shadow: ${OS_LEGAL_SPACING.shadowCardHover};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  padding: 4px;
  min-width: 180px;
  max-width: calc(100vw - 16px);
  z-index: 1000;
`;

const ContextMenuItem = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: ${OS_LEGAL_COLORS.textPrimary};
  text-align: left;
  transition: all 0.15s ease;

  &:hover {
    background-color: ${OS_LEGAL_COLORS.surfaceHover};
    color: ${OS_LEGAL_COLORS.textPrimary};
  }

  &:active {
    background-color: ${OS_LEGAL_COLORS.border};
  }
`;

export const FolderDocumentBrowser: React.FC<FolderDocumentBrowserProps> = ({
  corpusId,
  initialFolderId = null,
  onFolderChange,
  children,
  showSidebar = true,
  showBreadcrumb = true,
  viewMode = "modern-list",
  onViewModeChange,
}) => {
  const setCorpusId = useSetAtom(folderCorpusIdAtom);
  const setSelectedFolderId = useSetAtom(selectedFolderIdAtom);
  const selectedFolderId = useReactiveVar(selectedFolderIdReactiveVar);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const openCreateModal = useSetAtom(openCreateFolderModalAtom);
  const folderList = useAtomValue(folderListAtom);
  const location = useLocation();
  const navigate = useNavigate();

  // Drag-and-drop state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<
    "document" | "folder" | null
  >(null);

  // Document relationship modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const selectedDocumentIds = useReactiveVar(selectedDocumentIdsReactiveVar);

  // Context menu state for right-clicking in content area
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Adjust context menu position if it would go off screen
  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const rect = contextMenuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;

      let adjustedX = contextMenu.x;
      let adjustedY = contextMenu.y;

      // Adjust horizontal position - check both left and right edges
      if (rect.right > viewportWidth - margin) {
        adjustedX = viewportWidth - rect.width - margin;
      }
      if (adjustedX < margin) {
        adjustedX = margin;
      }

      // Adjust vertical position - check both top and bottom edges
      if (rect.bottom > viewportHeight - margin) {
        adjustedY = viewportHeight - rect.height - margin;
      }
      if (adjustedY < margin) {
        adjustedY = margin;
      }

      if (adjustedX !== contextMenu.x || adjustedY !== contextMenu.y) {
        contextMenuRef.current.style.left = `${adjustedX}px`;
        contextMenuRef.current.style.top = `${adjustedY}px`;
      }
    }
  }, [contextMenu]);

  // Configure drag sensors - require 8px movement before drag starts
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Move document to folder mutation
  const [moveDocumentToFolder] = useMutation<
    MoveDocumentToFolderOutputs,
    MoveDocumentToFolderInputs
  >(MOVE_DOCUMENT_TO_FOLDER, {
    // Evict all documents queries from cache to force refetch
    update(cache) {
      cache.evict({ fieldName: "documents" });
      cache.gc();
    },
    refetchQueries: [
      {
        query: GET_CORPUS_FOLDERS,
        variables: { corpusId },
      },
    ],
  });

  // Move folder mutation
  const [moveFolder] = useMutation<
    MoveCorpusFolderOutputs,
    MoveCorpusFolderInputs
  >(MOVE_CORPUS_FOLDER, {
    refetchQueries: [
      {
        query: GET_CORPUS_FOLDERS,
        variables: { corpusId },
      },
    ],
  });

  // Get parent folder ID for current folder (for ".." navigation)
  const currentFolder = folderList.find((f) => f.id === selectedFolderId);
  const parentFolderId = currentFolder?.parent?.id || null;

  // Unified drag-drop handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragData = event.active.data.current;
    setActiveDragId(event.active.id as string);
    setActiveDragType(dragData?.type === "document" ? "document" : "folder");
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      setActiveDragType(null);

      if (!over || active.id === over.id) {
        return; // Dropped on itself or no drop target
      }

      const dragData = active.data.current;
      const dropData = over.data.current;

      // Determine what was dropped and where
      const isDraggingDocument = dragData?.type === "document";

      // Extract target folder ID from drop target
      let targetFolderId: string | null;
      const overId = over.id as string;

      if (overId === "root" || overId === "corpus-root-drop-target") {
        // Dropped on corpus root
        targetFolderId = null;
      } else if (overId === "parent-folder-drop-target") {
        // Dropped on parent folder (..)
        targetFolderId = parentFolderId;
      } else if (overId.startsWith("folder-card-")) {
        // Dropped on a folder card in content area
        targetFolderId =
          dropData?.folderId || overId.replace("folder-card-", "");
      } else if (dropData?.type === "folder") {
        // Dropped on folder in sidebar tree
        targetFolderId = dropData.folderId || (overId as string);
      } else {
        // Try to use overId as folder ID (for sidebar tree nodes)
        targetFolderId = overId;
      }

      if (isDraggingDocument) {
        // Moving document to folder
        const documentId = dragData.documentId;

        moveDocumentToFolder({
          variables: {
            documentId,
            corpusId,
            folderId: targetFolderId,
          },
        })
          .then((result) => {
            if (result.data?.moveDocumentToFolder.ok) {
              toast.success(
                targetFolderId
                  ? "Document moved to folder"
                  : "Document moved to corpus root"
              );
            } else {
              toast.error(
                result.data?.moveDocumentToFolder.message ||
                  "Failed to move document"
              );
            }
          })
          .catch((error) => {
            toast.error(`Error moving document: ${error.message}`);
          });
      } else {
        // Moving folder to folder
        const draggedFolderId = active.id as string;

        // Prevent moving folder into itself or its descendants
        if (draggedFolderId === targetFolderId) {
          toast.error("Cannot move a folder into itself");
          return;
        }

        moveFolder({
          variables: {
            folderId: draggedFolderId,
            newParentId: targetFolderId,
          },
        })
          .then((result) => {
            if (result.data?.moveCorpusFolder.ok) {
              toast.success("Folder moved successfully");
            } else {
              toast.error(
                result.data?.moveCorpusFolder.message || "Failed to move folder"
              );
            }
          })
          .catch((error) => {
            toast.error(`Error moving folder: ${error.message}`);
          });
      }
    },
    [corpusId, parentFolderId, moveDocumentToFolder, moveFolder]
  );

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

  // Handle right-click in content area to create folder in current directory
  const handleContentAreaContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      // Check if the right-click target is a card or interactive element
      const target = e.target as HTMLElement;
      const isCard =
        target.closest('[role="button"]') ||
        target.closest(".folder-card") ||
        target.closest(".document-card") ||
        target.closest("button") ||
        target.closest("a");

      // Only show context menu if NOT clicking on a card or interactive element
      if (!isCard) {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    []
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
  }, []);

  // Escape key handler for accessibility - closes mobile sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSidebar && !sidebarCollapsed) {
        setSidebarCollapsed(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSidebar, sidebarCollapsed, setSidebarCollapsed]);

  const handleCreateFolderInCurrentDir = React.useCallback(() => {
    // Pass the current folder ID - creates subfolder of current directory
    // If selectedFolderId is null, creates folder at root level
    openCreateModal(selectedFolderId);
    closeContextMenu();
  }, [selectedFolderId, openCreateModal, closeContextMenu]);

  // Handle "New Folder" toolbar button
  const handleNewFolder = React.useCallback(() => {
    openCreateModal(selectedFolderId);
  }, [selectedFolderId, openCreateModal]);

  // Handle "Upload" toolbar button
  const handleUpload = React.useCallback(() => {
    showUploadNewDocumentsModal(true);
  }, []);

  // Navigate back/up functionality
  const canGoBack = selectedFolderId !== null && selectedFolderId !== "trash";
  const handleGoBack = React.useCallback(() => {
    if (parentFolderId) {
      handleFolderSelect(parentFolderId);
    } else {
      handleFolderSelect(null);
    }
  }, [parentFolderId]);

  const handleGoUp = React.useCallback(() => {
    handleFolderSelect(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <BrowserContainer>
        {/* Mobile backdrop for sidebar */}
        <MobileSidebarBackdrop
          $visible={showSidebar && !sidebarCollapsed}
          onClick={() => setSidebarCollapsed(true)}
        />

        <FileSystemContainer>
          {/* Toolbar with breadcrumb, navigation, and actions */}
          {showBreadcrumb && selectedFolderId !== "trash" && (
            <FolderToolbar
              showSidebar={showSidebar}
              selectedFolderId={selectedFolderId}
              canGoBack={canGoBack}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              onFolderSelect={handleFolderSelect}
              onGoBack={handleGoBack}
              onGoUp={handleGoUp}
              onNewFolder={handleNewFolder}
              onUpload={handleUpload}
              selectedDocumentCount={selectedDocumentIds.length}
              onLinkDocuments={() => setShowLinkModal(true)}
            />
          )}

          {/* Content area with sidebar and main content */}
          <ContentWrapper>
            {/* Folder Tree Sidebar */}
            <Sidebar $visible={showSidebar} $collapsed={sidebarCollapsed}>
              {/* Mobile close button */}
              <MobileSidebarCloseButton
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Close folders"
                title="Close folders"
              >
                <X />
              </MobileSidebarCloseButton>
              <FolderTreeSidebar
                corpusId={corpusId}
                onFolderSelect={(folderId) => {
                  handleFolderSelect(folderId);
                  // Auto-close sidebar on mobile/tablet after selection
                  if (window.innerWidth <= TABLET_BREAKPOINT) {
                    setSidebarCollapsed(true);
                  }
                }}
              />
            </Sidebar>

            {/* Main Content Area */}
            <MainContent>
              {/* Document List or Custom Content */}
              <ContentArea
                onContextMenu={
                  selectedFolderId === "trash"
                    ? undefined
                    : handleContentAreaContextMenu
                }
              >
                {selectedFolderId === "trash" ? (
                  <TrashFolderView
                    corpusId={corpusId}
                    onBack={() => handleFolderSelect(null)}
                  />
                ) : (
                  children
                )}
              </ContentArea>
            </MainContent>
          </ContentWrapper>
        </FileSystemContainer>
      </BrowserContainer>

      {/* Folder Action Modals */}
      <CreateFolderModal />
      <EditFolderModal />
      <MoveFolderModal />
      <DeleteFolderModal />

      {/* Document Relationship Modal */}
      <DocumentRelationshipModal
        open={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        corpusId={corpusId}
        sourceDocumentIds={selectedDocumentIds}
        onSuccess={() => {
          setShowLinkModal(false);
          // Clear selection after successful link
          selectedDocumentIdsReactiveVar([]);
        }}
      />

      {/* Context menu for content area */}
      {contextMenu && (
        <>
          <ContextMenuOverlay onClick={closeContextMenu} />
          <ContextMenu
            ref={contextMenuRef}
            $x={contextMenu.x}
            $y={contextMenu.y}
          >
            <ContextMenuItem onClick={handleCreateFolderInCurrentDir}>
              Create Folder Here
            </ContextMenuItem>
          </ContextMenu>
        </>
      )}
    </DndContext>
  );
};
