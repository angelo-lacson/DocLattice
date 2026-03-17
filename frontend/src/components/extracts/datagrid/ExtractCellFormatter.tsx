import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@os-legal/ui";
import { Code, Check, Edit2, Eye, X as XIcon } from "lucide-react";
import { CellStatus } from "../../../types/extract-grid";
import styled from "styled-components";
import { JSONSchema7 } from "json-schema";
import { ExtractCellEditor } from "./ExtractCellEditor";
import ReactJson from "react-json-view";
import { TruncatedText } from "../../widgets/data-display/TruncatedText";
import { useReactiveVar } from "@apollo/client";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
  selectedExtract,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showSelectedAnnotationOnly,
  showStructuralAnnotations,
} from "../../../graphql/cache";
import {
  DatacellType,
  ExtractType,
  ServerAnnotationType,
  LabelDisplayBehavior,
} from "../../../types/graphql-api";
import { useNavigate, useLocation } from "react-router-dom";
import {
  getDocumentUrl,
  updateAnnotationDisplayParams,
} from "../../../utils/navigationUtils";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

const StatusDot = styled.div<{ statusColor: string }>`
  width: 12px;
  height: 12px;
  background-color: ${(props) => props.statusColor};
  border-radius: 50%;
  cursor: pointer;
  position: absolute;
  top: 8px;
  right: 8px;
  transition: all 0.2s ease;
  box-shadow: ${(props) => {
    switch (props.statusColor) {
      case "#10b981":
        return "0 0 0 3px rgba(16, 185, 129, 0.15)";
      case "#ef4444":
        return "0 0 0 3px rgba(239, 68, 68, 0.15)";
      case OS_LEGAL_COLORS.folderIcon:
        return "0 0 0 3px rgba(245, 158, 11, 0.15)";
      default:
        return "0 0 0 3px rgba(148, 163, 184, 0.15)";
    }
  }};

  &:hover {
    transform: scale(1.2);
    box-shadow: ${(props) => {
      switch (props.statusColor) {
        case "#10b981":
          return "0 0 0 4px rgba(16, 185, 129, 0.25)";
        case "#ef4444":
          return "0 0 0 4px rgba(239, 68, 68, 0.25)";
        case OS_LEGAL_COLORS.folderIcon:
          return "0 0 0 4px rgba(245, 158, 11, 0.25)";
        default:
          return "0 0 0 4px rgba(148, 163, 184, 0.25)";
      }
    }};
  }
`;

const ButtonContainer = styled.div`
  padding: 8px;

  .buttons {
    display: flex;
    gap: 8px;

    button {
      border-radius: 8px !important;
      transition: all 0.15s ease !important;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
    }
  }

  .status-message {
    font-size: 0.75rem;
    color: ${OS_LEGAL_COLORS.textSecondary};
    text-align: center;
    margin-top: 4px;
    font-weight: 500;
  }

  .ui.button {
    margin: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 8px;
    min-width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &.green {
      background: linear-gradient(
        135deg,
        ${OS_LEGAL_COLORS.green},
        ${OS_LEGAL_COLORS.success}
      );

      &:hover:not(:disabled) {
        background: linear-gradient(
          135deg,
          ${OS_LEGAL_COLORS.success},
          ${OS_LEGAL_COLORS.successHover}
        );
      }
    }

    &.red {
      background: linear-gradient(
        135deg,
        ${OS_LEGAL_COLORS.dangerBorderHover},
        ${OS_LEGAL_COLORS.danger}
      );

      &:hover:not(:disabled) {
        background: linear-gradient(
          135deg,
          ${OS_LEGAL_COLORS.danger},
          ${OS_LEGAL_COLORS.dangerHover}
        );
      }
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(40%);
    }

    i.icon {
      margin: 0 !important;
      font-size: 0.9em;
    }
  }
`;

const CellContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  height: 100%;
  min-height: 45px;
  position: relative;
  transition: background-color 0.15s ease;

  .cell-loader {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 10px;
    color: ${OS_LEGAL_COLORS.textSecondary};
    font-style: italic;
  }

  &:hover {
    background-color: rgba(59, 130, 246, 0.05);
  }
`;

interface ExtractCellFormatterProps {
  value: any;
  cellStatus: CellStatus | null;
  cellId: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (cellId: string, editedData: any) => void;
  readOnly: boolean;
  isExtractComplete: boolean;
  schema: JSONSchema7;
  extractIsList: boolean;
  row: any;
  column: any;
  cell?: DatacellType;
  extract?: ExtractType;
}

/**
 * ExtractCellFormatter component displays the content of a cell in the extract data grid.
 * It handles displaying the value, editing, approving, and rejecting the cell.
 * If the cell has correctedData, it displays that instead of the original data.
 * It also provides a control to view the original value when correctedData is present.
 */
export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  cellId,
  onApprove,
  onReject,
  onEdit,
  readOnly,
  isExtractComplete,
  schema,
  extractIsList,
  row,
  column,
  cell,
  extract,
}) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOriginalModalOpen, setIsOriginalModalOpen] = useState(false);

  const [viewSourceAnnotations, setViewSourceAnnotations] = useState<
    ServerAnnotationType[] | null
  >(null);

  const only_display_these_annotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );

  const cellRef = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState<number>(0);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (cellRef.current) {
      const computedStyle = getComputedStyle(cellRef.current);
      const padding =
        parseFloat(computedStyle.paddingLeft) +
        parseFloat(computedStyle.paddingRight);
      setCellWidth(cellRef.current.offsetWidth - padding);
    }
  }, [cellRef]);

  const statusColor = () => {
    if (cellStatus?.isApproved) return OS_LEGAL_COLORS.greenMedium; // Modern green
    if (cellStatus?.isRejected) return OS_LEGAL_COLORS.dangerBorderHover; // Modern red
    if (cellStatus?.isEdited) return OS_LEGAL_COLORS.folderIcon; // Modern amber
    return OS_LEGAL_COLORS.textMuted; // Modern gray
  };

  const getCellBackground = () => {
    if (cellStatus?.isLoading) return "rgba(59, 130, 246, 0.05)"; // Light blue
    if (cellStatus?.isApproved) return "rgba(16, 185, 129, 0.05)"; // Light green
    if (cellStatus?.isRejected) return "rgba(239, 68, 68, 0.05)"; // Light red
    if (cellStatus?.isEdited) return "rgba(245, 158, 11, 0.05)"; // Light amber
    return "transparent";
  };

  const openViewer = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const openOriginalViewer = () => {
    setIsOriginalModalOpen(true);
  };

  const closeOriginalModal = () => {
    setIsOriginalModalOpen(false);
  };

  const handleJsonEdit = (edit: any) => {
    const updatedValue = edit.updated_src;
    onEdit(cellId, updatedValue);
  };

  const displayedValue =
    cellStatus?.correctedData != null ? cellStatus.correctedData : value;

  const displayValue = () => {
    if (typeof displayedValue === "object" && displayedValue !== null) {
      return (
        <div
          onClick={openViewer}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Code size={16} />
          <span style={{ marginLeft: "5px" }}>View/Edit JSON</span>
        </div>
      );
    } else {
      return <TruncatedText text={String(displayedValue)} limit={cellWidth} />;
    }
  };

  useEffect(() => {
    if (viewSourceAnnotations !== null) {
      onlyDisplayTheseAnnotations(viewSourceAnnotations);
      displayAnnotationOnAnnotatorLoad(viewSourceAnnotations[0]);
      // Update display settings via URL - CentralRouteManager will set reactive vars
      updateAnnotationDisplayParams(location, navigate, {
        showSelectedOnly: false,
        showBoundingBoxes: true,
        showStructural: true,
        labelDisplay: LabelDisplayBehavior.ALWAYS,
      });
    }
  }, [viewSourceAnnotations, location, navigate]);

  useEffect(() => {
    if (
      only_display_these_annotations &&
      only_display_these_annotations.length > 0
    ) {
      const first = only_display_these_annotations[0];
      if (first.document && first.corpus) {
        const url = getDocumentUrl(first.document, first.corpus);
        if (url !== "#") {
          navigate(`${url}?ann=${first.id}`);
        } else {
          console.warn("Cannot navigate - missing slugs:", first);
        }
      }
      setViewSourceAnnotations(null);
    }
  }, [only_display_these_annotations, navigate]);

  return (
    <CellContainer ref={cellRef} style={{ background: getCellBackground() }}>
      {displayValue()}
      {cellStatus?.isLoading && <div className="cell-loader">Loading...</div>}
      {!cellStatus?.isLoading && isExtractComplete && (
        <>
          <StatusDot
            statusColor={statusColor()}
            onClick={() => setIsPopupOpen(!isPopupOpen)}
          />
          {isPopupOpen && (
            <div
              style={{
                position: "absolute",
                top: "-4px",
                right: "24px",
                zIndex: 100,
                background: "white",
                borderRadius: "8px",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
                border: `1px solid ${OS_LEGAL_COLORS.border}`,
              }}
              onMouseLeave={() => setTimeout(() => setIsPopupOpen(false), 300)}
            >
              <ButtonContainer>
                <div className="buttons">
                  <button
                    className="ui button green"
                    onClick={() => {
                      onApprove();
                      setIsPopupOpen(false);
                    }}
                    disabled={
                      cellStatus?.isApproved || readOnly || !isExtractComplete
                    }
                    title="Approve"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="ui button"
                    onClick={() => {
                      if (
                        typeof displayedValue === "object" &&
                        displayedValue !== null
                      ) {
                        openViewer();
                      } else {
                        setIsEditing(true);
                      }
                      setIsPopupOpen(false);
                    }}
                    disabled={readOnly || !isExtractComplete}
                    title="Edit"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    className="ui button"
                    style={{
                      background: OS_LEGAL_COLORS.primaryBlue,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onClick={() => {
                      if (
                        cell?.fullSourceList &&
                        cell.fullSourceList.length > 0
                      ) {
                        selectedExtract(extract);
                        setViewSourceAnnotations(
                          cell.fullSourceList as ServerAnnotationType[]
                        );
                      }
                      setIsPopupOpen(false);
                    }}
                    disabled={
                      !cell?.fullSourceList || cell.fullSourceList.length === 0
                    }
                    title="View Sources"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    className="ui button red"
                    onClick={() => {
                      onReject();
                      setIsPopupOpen(false);
                    }}
                    disabled={
                      cellStatus?.isRejected || readOnly || !isExtractComplete
                    }
                    title="Reject"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
                {cellStatus?.isApproved && (
                  <div className="status-message">
                    Cell is currently approved
                  </div>
                )}
                {cellStatus?.isRejected && (
                  <div className="status-message">
                    Cell is currently rejected
                  </div>
                )}
                {cellStatus?.isEdited && !cellStatus?.isApproved && (
                  <div className="status-message">Cell has been edited</div>
                )}
              </ButtonContainer>
            </div>
          )}
          {isEditing && (
            <Modal open={isEditing} onClose={() => setIsEditing(false)}>
              <ModalHeader>Edit {column.name}</ModalHeader>
              <ModalBody>
                <ExtractCellEditor
                  row={row}
                  column={column}
                  onRowChange={(updatedRow: any, commitChanges?: boolean) => {
                    if (commitChanges) {
                      onEdit(cellId, updatedRow[column.key]);
                    }
                  }}
                  onClose={() => setIsEditing(false)}
                  schema={schema}
                  extractIsList={extractIsList}
                />
              </ModalBody>
            </Modal>
          )}
          <Modal open={isModalOpen} onClose={closeModal}>
            <ModalHeader>Edit JSON Data</ModalHeader>
            <ModalBody>
              <ReactJson
                src={displayedValue}
                onEdit={handleJsonEdit}
                onAdd={handleJsonEdit}
                onDelete={handleJsonEdit}
                theme="rjv-default"
                style={{ padding: "20px" }}
                enableClipboard={false}
                displayDataTypes={false}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={closeModal}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
          <Modal open={isOriginalModalOpen} onClose={closeOriginalModal}>
            <ModalHeader>Original Value</ModalHeader>
            <ModalBody>
              {typeof value === "object" && value !== null ? (
                <ReactJson
                  src={value}
                  theme="rjv-default"
                  style={{ padding: "20px" }}
                  enableClipboard={false}
                  displayDataTypes={false}
                />
              ) : (
                <div style={{ padding: "20px" }}>{String(value)}</div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="secondary" onClick={closeOriginalModal}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
        </>
      )}
    </CellContainer>
  );
};
