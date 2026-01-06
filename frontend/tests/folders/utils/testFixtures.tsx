import React from "react";
import { useHydrateAtoms } from "jotai/utils";
import { FolderBreadcrumb } from "../../../src/components/corpuses/folders/FolderBreadcrumb";
import { CreateFolderModal } from "../../../src/components/corpuses/folders/CreateFolderModal";
import {
  FolderToolbar,
  ViewMode,
} from "../../../src/components/corpuses/folders/FolderToolbar";
import {
  selectedFolderIdAtom,
  folderListAtom,
  showCreateFolderModalAtom,
  createFolderParentIdAtom,
  folderCorpusIdAtom,
  sidebarCollapsedAtom,
} from "../../../src/atoms/folderAtoms";

/**
 * Test fixtures for folder components
 * These are separate components that can be imported and mounted in tests
 */

interface BreadcrumbFixtureProps {
  folderId: string | null;
  folders: any[];
  maxDepth?: number;
}

export function BreadcrumbFixture({
  folderId,
  folders,
  maxDepth,
}: BreadcrumbFixtureProps) {
  useHydrateAtoms([
    [selectedFolderIdAtom, folderId],
    [folderListAtom, folders],
  ]);
  return <FolderBreadcrumb maxDepth={maxDepth} />;
}

interface ModalFixtureProps {
  showModal?: boolean;
  parentId?: string | null;
  folders?: any[];
}

export function CreateModalFixture({
  showModal = true,
  parentId = null,
  folders = [],
}: ModalFixtureProps) {
  useHydrateAtoms([
    [showCreateFolderModalAtom, showModal],
    [createFolderParentIdAtom, parentId],
    [folderCorpusIdAtom, "corpus-1"],
    [folderListAtom, folders],
  ]);
  return <CreateFolderModal />;
}

// Re-export ViewMode for tests
export type { ViewMode };

interface ToolbarFixtureProps {
  showSidebar?: boolean;
  selectedFolderId?: string | null;
  canGoBack?: boolean;
  viewMode?: ViewMode;
  canCreateFolders?: boolean;
  onViewModeChange?: (mode: ViewMode) => void;
  onFolderSelect?: (folderId: string | null) => void;
  onGoBack?: () => void;
  onGoUp?: () => void;
  onNewFolder?: () => void;
  onUpload?: () => void;
}

export function ToolbarFixture({
  showSidebar = true,
  selectedFolderId = null,
  canGoBack = false,
  viewMode = "modern-list",
  canCreateFolders = true,
  onViewModeChange = () => {},
  onFolderSelect = () => {},
  onGoBack = () => {},
  onGoUp = () => {},
  onNewFolder = () => {},
  onUpload = () => {},
}: ToolbarFixtureProps) {
  // Create a folder with permissions that will allow/disallow folder creation
  // canCreateFoldersAtom checks for "update_corpus" or "create_corpus" permissions
  // When canCreateFolders=false, we need to select a folder with restricted permissions
  // (at root/null folder, canCreateFoldersAtom returns true by default)
  const effectiveFolderId = canCreateFolders
    ? selectedFolderId
    : selectedFolderId || "restricted-folder";

  const foldersWithPermissions = canCreateFolders
    ? [
        {
          id: selectedFolderId || "root-folder",
          name: "Test Folder",
          parent: null,
          path: "Test Folder",
          myPermissions: ["update_corpus", "create_corpus"], // Allows folder creation
          documentCount: 0,
          children: [],
        },
      ]
    : [
        {
          id: "restricted-folder",
          name: "Restricted Folder",
          parent: null,
          path: "Restricted Folder",
          myPermissions: ["read_corpus"], // No create/update permissions
          documentCount: 0,
          children: [],
        },
      ];

  // Hydrate atoms for the toolbar to read from
  // canCreateFoldersAtom and folderBreadcrumbAtom are derived atoms,
  // so we set their source atoms (folderListAtom, selectedFolderIdAtom)
  useHydrateAtoms([
    [selectedFolderIdAtom, effectiveFolderId],
    [folderListAtom, foldersWithPermissions],
    [sidebarCollapsedAtom, false],
  ] as const);

  return (
    <div style={{ width: "100%", minHeight: "60px" }}>
      <FolderToolbar
        showSidebar={showSidebar}
        selectedFolderId={selectedFolderId}
        canGoBack={canGoBack}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onFolderSelect={onFolderSelect}
        onGoBack={onGoBack}
        onGoUp={onGoUp}
        onNewFolder={onNewFolder}
        onUpload={onUpload}
      />
    </div>
  );
}
