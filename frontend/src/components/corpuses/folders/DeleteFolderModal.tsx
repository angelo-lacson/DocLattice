import React, { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useMutation } from "@apollo/client";
import styled from "styled-components";
import { X, AlertTriangle } from "lucide-react";
import {
  Button,
  Modal,
  ModalHeader as OcModalHeader,
  ModalBody,
  ModalFooter,
} from "@os-legal/ui";
import {
  showDeleteFolderModalAtom,
  activeFolderModalIdAtom,
  folderListAtom,
  folderMapAtom,
  selectedFolderIdAtom,
  closeAllFolderModalsAtom,
  folderCorpusIdAtom,
} from "../../../atoms/folderAtoms";
import {
  DELETE_CORPUS_FOLDER,
  DeleteCorpusFolderInputs,
  DeleteCorpusFolderOutputs,
  GET_CORPUS_FOLDERS,
} from "../../../graphql/queries/folders";
import { ErrorMessage } from "../../widgets/feedback";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

/**
 * DeleteFolderModal - Confirmation modal for deleting folders
 *
 * Features:
 * - Shows warning about subfolder and document counts
 * - Warns that documents will be moved to parent (or corpus root)
 * - Requires explicit confirmation
 * - Clears selection if deleted folder was selected
 * - Optimistic update + refetch
 */

const StyledModalWrapper = styled.div`
  .oc-modal {
    max-width: 500px;
    width: 100%;
  }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #dc2626;
  transition: all 0.15s ease;

  &:hover {
    background: #fecaca;
    color: #991b1b;
  }
`;

const WarningBox = styled.div`
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-bottom: 16px;
  color: #991b1b;
`;

const WarningIcon = styled(AlertTriangle)`
  flex-shrink: 0;
  margin-top: 2px;
`;

const WarningContent = styled.div`
  flex: 1;

  h4 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
  }

  p {
    margin: 0 0 8px 0;
    font-size: 14px;
    line-height: 1.5;
  }

  ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
    font-size: 14px;

    li {
      margin-bottom: 4px;
    }
  }
`;

const FolderInfo = styled.div`
  padding: 12px;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  color: ${OS_LEGAL_COLORS.textTertiary};

  strong {
    color: ${OS_LEGAL_COLORS.textPrimary};
    font-weight: 600;
  }
`;

export const DeleteFolderModal: React.FC = () => {
  const showModal = useAtomValue(showDeleteFolderModalAtom);
  const folderId = useAtomValue(activeFolderModalIdAtom);
  const folderMap = useAtomValue(folderMapAtom);
  const folderList = useAtomValue(folderListAtom);
  const selectedFolderId = useAtomValue(selectedFolderIdAtom);
  const corpusId = useAtomValue(folderCorpusIdAtom);
  const setFolderList = useSetAtom(folderListAtom);
  const setSelectedFolderId = useSetAtom(selectedFolderIdAtom);
  const closeAllModals = useSetAtom(closeAllFolderModalsAtom);

  const folder = folderId ? folderMap.get(folderId) : null;

  const [deleteFolder, { loading, error }] = useMutation<
    DeleteCorpusFolderOutputs,
    DeleteCorpusFolderInputs
  >(DELETE_CORPUS_FOLDER, {
    onCompleted: () => {
      // Remove folder from local cache
      if (folder) {
        setFolderList(folderList.filter((f) => f.id !== folder.id));

        // If deleted folder was selected, clear selection
        if (selectedFolderId === folder.id) {
          setSelectedFolderId(null);
        }
      }

      // Close modal
      handleClose();
    },
    refetchQueries: corpusId
      ? [
          {
            query: GET_CORPUS_FOLDERS,
            variables: { corpusId },
          },
        ]
      : [],
  });

  const handleClose = useCallback(() => {
    closeAllModals();
  }, [closeAllModals]);

  const handleConfirmDelete = useCallback(() => {
    if (!folder) return;

    deleteFolder({
      variables: {
        folderId: folder.id,
      },
    });
  }, [folder, deleteFolder]);

  if (!showModal || !folder) return null;

  const childCount = folderList.filter(
    (f) => f.parent?.id === folder.id
  ).length;
  const documentCount = folder.documentCount || 0;
  const descendantDocCount = folder.descendantDocumentCount || 0;

  const parentName = folder.parent ? folder.parent.name : "Corpus Root";

  return (
    <StyledModalWrapper>
      <Modal open={showModal} onClose={handleClose} size="sm">
        <OcModalHeader title="Delete Folder" onClose={handleClose} />

        <ModalBody>
          <WarningBox>
            <WarningIcon size={24} />
            <WarningContent>
              <h4>This action cannot be undone</h4>
              <p>
                You are about to permanently delete the folder{" "}
                <strong>"{folder.name}"</strong>.
              </p>
              {(childCount > 0 || documentCount > 0) && (
                <ul>
                  {childCount > 0 && (
                    <li>
                      <strong>{childCount}</strong> subfolder
                      {childCount !== 1 ? "s" : ""} will be moved to{" "}
                      <strong>{parentName}</strong>
                    </li>
                  )}
                  {documentCount > 0 && (
                    <li>
                      <strong>{documentCount}</strong> document
                      {documentCount !== 1 ? "s" : ""} will be moved to{" "}
                      <strong>{parentName}</strong>
                    </li>
                  )}
                </ul>
              )}
            </WarningContent>
          </WarningBox>

          <FolderInfo>
            <div style={{ marginBottom: "8px" }}>
              <strong>Folder:</strong> {folder.path || folder.name}
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Documents in folder:</strong> {documentCount}
            </div>
            <div style={{ marginBottom: "8px" }}>
              <strong>Subfolders:</strong> {childCount}
            </div>
            {descendantDocCount > 0 && (
              <div>
                <strong>Documents in subfolders:</strong> {descendantDocCount}
              </div>
            )}
          </FolderInfo>

          {error && (
            <ErrorMessage title="Error Deleting Folder">
              {error.message}
            </ErrorMessage>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmDelete}
            loading={loading}
            disabled={loading}
            style={{ backgroundColor: "#dc2626", borderColor: "#dc2626" }}
          >
            Delete Folder
          </Button>
        </ModalFooter>
      </Modal>
    </StyledModalWrapper>
  );
};
