import React, { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";
import { ArrowUp, FolderUp } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";

/**
 * ParentFolderCard - Special card for navigating up one folder level
 *
 * Features:
 * - Displays ".." style card to go to parent folder
 * - Droppable - accepts documents and folders to move to parent
 * - Click to navigate up one level
 * - Visual feedback when drop target is active
 */

interface ParentFolderCardProps {
  parentFolderId: string | null; // null means parent is corpus root
  parentFolderName?: string; // "Corpus Root" if null
  viewMode?: "modern-card" | "modern-list";
  onNavigate?: (folderId: string | null) => void;
}

// ===============================================
// CARD VIEW (Desktop)
// ===============================================
const CardContainer = styled.div<{ $isDropTarget: boolean }>`
  position: relative;
  background: white;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
  cursor: pointer;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: ${(props) =>
    props.$isDropTarget ? "rgba(34, 197, 94, 0.08)" : "#f8fafc"};
  border-color: ${(props) =>
    props.$isDropTarget ? "rgba(34, 197, 94, 0.5)" : "#cbd5e1"};

  &:hover {
    border-color: ${(props) =>
      props.$isDropTarget ? "rgba(34, 197, 94, 0.7)" : "#94a3b8"};
    background-color: ${(props) =>
      props.$isDropTarget ? "rgba(34, 197, 94, 0.12)" : "#f1f5f9"};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }
`;

const IconWrapper = styled.div<{ $isDropTarget: boolean }>`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${(props) =>
    props.$isDropTarget
      ? "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.25) 100%)"
      : "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)"};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  transition: all 0.2s ease;
  color: ${(props) => (props.$isDropTarget ? "#16a34a" : "#64748b")};

  ${CardContainer}:hover & {
    background: ${(props) =>
      props.$isDropTarget
        ? "linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.35) 100%)"
        : "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)"};
    color: ${(props) => (props.$isDropTarget ? "#15803d" : "#475569")};
    transform: scale(1.05);
  }
`;

const CardTitle = styled.div<{ $isDropTarget: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.$isDropTarget ? "#16a34a" : "#475569")};
  text-align: center;
`;

const CardSubtitle = styled.div`
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
  text-align: center;
`;

// ===============================================
// LIST VIEW (Mobile & Dense)
// ===============================================
const ListContainer = styled.div<{ $isDropTarget: boolean }>`
  position: relative;
  background: white;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  background-color: ${(props) =>
    props.$isDropTarget ? "rgba(34, 197, 94, 0.08)" : "#f8fafc"};
  border-color: ${(props) =>
    props.$isDropTarget ? "rgba(34, 197, 94, 0.5)" : "#cbd5e1"};

  &:hover {
    border-color: ${(props) =>
      props.$isDropTarget ? "rgba(34, 197, 94, 0.7)" : "#94a3b8"};
    background-color: ${(props) =>
      props.$isDropTarget ? "rgba(34, 197, 94, 0.12)" : "#f1f5f9"};
  }

  @media (max-width: 640px) {
    padding: 10px 12px;
    gap: 10px;
  }
`;

const ListIconWrapper = styled.div<{ $isDropTarget: boolean }>`
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: ${(props) =>
    props.$isDropTarget
      ? "linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.25) 100%)"
      : "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)"};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${(props) => (props.$isDropTarget ? "#16a34a" : "#64748b")};
  transition: all 0.15s ease;

  @media (max-width: 640px) {
    width: 40px;
    height: 40px;
  }
`;

const ListContent = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ListTitle = styled.div<{ $isDropTarget: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => (props.$isDropTarget ? "#16a34a" : "#475569")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: 640px) {
    font-size: 13px;
  }
`;

const ListSubtitle = styled.div`
  font-size: 12px;
  color: #94a3b8;

  @media (max-width: 640px) {
    font-size: 11px;
  }
`;

export const ParentFolderCard: React.FC<ParentFolderCardProps> = ({
  parentFolderId,
  parentFolderName,
  viewMode = "modern-card",
  onNavigate,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Droppable setup - documents/folders can be dropped here to move to parent
  const { setNodeRef, isOver } = useDroppable({
    id: "parent-folder-drop-target",
    data: {
      type: "folder",
      folderId: parentFolderId,
      isParentFolder: true,
    },
  });

  const displayName = parentFolderName || "Corpus Root";

  const handleClick = useCallback(() => {
    if (onNavigate) {
      onNavigate(parentFolderId);
    } else {
      // Update URL to navigate to parent folder
      const searchParams = new URLSearchParams(location.search);
      if (parentFolderId) {
        searchParams.set("folder", parentFolderId);
      } else {
        searchParams.delete("folder");
      }
      const newSearch = searchParams.toString();
      navigate({ search: newSearch ? `?${newSearch}` : "" }, { replace: true });
    }
  }, [parentFolderId, onNavigate, navigate, location.search]);

  if (viewMode === "modern-list") {
    return (
      <ListContainer
        ref={setNodeRef}
        $isDropTarget={isOver}
        onClick={handleClick}
      >
        <ListIconWrapper $isDropTarget={isOver}>
          <FolderUp size={24} />
        </ListIconWrapper>

        <ListContent>
          <ListTitle $isDropTarget={isOver}>..</ListTitle>
          <ListSubtitle>Go to {displayName}</ListSubtitle>
        </ListContent>
      </ListContainer>
    );
  }

  // Card view (default)
  return (
    <CardContainer
      ref={setNodeRef}
      $isDropTarget={isOver}
      onClick={handleClick}
    >
      <IconWrapper $isDropTarget={isOver}>
        <FolderUp size={32} />
      </IconWrapper>
      <CardTitle $isDropTarget={isOver}>..</CardTitle>
      <CardSubtitle>Go to {displayName}</CardSubtitle>
    </CardContainer>
  );
};
