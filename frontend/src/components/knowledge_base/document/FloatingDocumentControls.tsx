import React, { useState, useEffect, memo } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "semantic-ui-react";
import {
  Settings,
  Eye,
  BarChart3,
  Database,
  Plus,
  Columns,
  Maximize2,
} from "lucide-react";
import { useCorpusState } from "../../annotator/context/CorpusAtom";
import {
  useDocumentPermissions,
  useDocumentState,
} from "../../annotator/context/DocumentAtom";
import {
  showSelectCorpusAnalyzerOrFieldsetModal,
  openedCorpus,
} from "../../../graphql/cache";
import { PermissionTypes } from "../../types";
import { AnnotationControls } from "../../annotator/controls/AnnotationControls";

const ControlsContainer = styled(motion.div)<{ $panelOffset?: number }>`
  position: fixed;
  bottom: calc(
    2rem + 48px + max(10px, 2rem)
  ); /* UnifiedLabelSelector height (48px) + gap (2rem min 10px) */
  right: ${(props) =>
    props.$panelOffset ? `${props.$panelOffset + 32}px` : "2rem"};
  z-index: 2001;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-end;
  gap: 0.75rem;
  transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    right: 1rem;
    bottom: calc(
      1rem + 40px + max(10px, 2rem)
    ); /* Smaller button size on mobile */
  }
`;

const ActionButton = styled(motion.button)<{ $color?: string }>`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${(props) => props.$color || "white"};
  border: 2px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;

  svg {
    width: 24px;
    height: 24px;
    color: ${(props) => (props.$color ? "white" : "#64748b")};
    transition: transform 0.3s ease;
  }

  &:hover {
    border-color: ${(props) => props.$color || "#3b82f6"};
    box-shadow: 0 6px 20px
      ${(props) =>
        props.$color ? `${props.$color}30` : "rgba(59, 130, 246, 0.15)"};

    svg {
      color: ${(props) => (props.$color ? "white" : "#3b82f6")};
    }
  }

  &[data-expanded="true"] svg {
    transform: rotate(45deg);
  }
`;

const ControlPanel = styled(motion.div)`
  position: absolute;
  right: 0;
  /* Place the panel just above the button stack */
  bottom: calc(56px + 1rem); /* button height + gap */
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border: 1px solid #e2e8f0;
  padding: 1rem;
  min-width: 240px;

  @media (max-width: 768px) {
    bottom: calc(40px + 1rem); /* smaller mobile button height */
  }
`;

const ControlItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover {
    background: #f8fafc;
  }

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

const ControlLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #1e293b;

  svg {
    width: 16px;
    height: 16px;
    color: #64748b;
  }
`;

const StyledCheckbox = styled(Checkbox)`
  &&& {
    transform: scale(1.1);

    label {
      padding-left: 1.75rem !important;

      &:before {
        border-color: #e2e8f0 !important;
        border-radius: 4px !important;
      }

      &:after {
        border-radius: 2px !important;
      }
    }

    &.checked label:before {
      border-color: #3b82f6 !important;
      background: #3b82f6 !important;
    }
  }
`;

const Divider = styled.div`
  height: 1px;
  background: #f1f5f9;
  margin: 0.5rem 0;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 0.75rem;
  font-weight: 600;
  font-size: 0.9375rem;
  color: #1e293b;

  svg {
    width: 20px;
    height: 20px;
    color: #3b82f6;
  }
`;

const WidthMenuItem = styled(motion.button)<{ $isActive: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  background: ${(props) =>
    props.$isActive
      ? "linear-gradient(135deg, rgba(66, 153, 225, 0.08), rgba(66, 153, 225, 0.05))"
      : "transparent"};
  color: ${(props) => (props.$isActive ? "#4299e1" : "#64748b")};
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  white-space: nowrap;
  position: relative;
  overflow: hidden;

  /* Subtle left accent for active state */
  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: ${(props) => (props.$isActive ? "60%" : "0")};
    background: #4299e1;
    border-radius: 1px;
    transition: height 0.2s ease;
  }

  &:hover {
    background: ${(props) =>
      props.$isActive
        ? "linear-gradient(135deg, rgba(66, 153, 225, 0.12), rgba(66, 153, 225, 0.08))"
        : "rgba(0, 0, 0, 0.02)"};
    color: ${(props) => (props.$isActive ? "#4299e1" : "#475569")};
    transform: translateX(2px);
  }

  &:active {
    transform: translateX(2px) scale(0.98);
  }

  .percentage {
    font-size: 0.75rem;
    opacity: 0.6;
    font-weight: 400;
  }
`;

interface FloatingDocumentControlsProps {
  /** Whether to show the controls (e.g., only in document layer) */
  visible?: boolean;
  /** Whether the right panel is currently shown */
  showRightPanel?: boolean;
  /** Callback when analyses button is clicked */
  onAnalysesClick?: () => void;
  /** Callback when extracts button is clicked */
  onExtractsClick?: () => void;
  /** Whether analyses panel is open */
  analysesOpen?: boolean;
  /** Whether extracts panel is open */
  extractsOpen?: boolean;
  /** Offset to apply when sliding panel is open */
  panelOffset?: number;
  /** When true, hide create/edit functionality */
  readOnly?: boolean;
  /** Current panel width mode */
  panelWidthMode?: "quarter" | "half" | "full";
  /** Callback when panel width changes */
  onPanelWidthChange?: (mode: "quarter" | "half" | "full") => void;
  /** Whether auto-zoom is enabled */
  autoZoomEnabled?: boolean;
  /** Callback when auto-zoom toggle changes */
  onAutoZoomChange?: (enabled: boolean) => void;
}

export const FloatingDocumentControls: React.FC<FloatingDocumentControlsProps> =
  memo(
    ({
      visible = true,
      showRightPanel = false,
      onAnalysesClick,
      onExtractsClick,
      analysesOpen = false,
      extractsOpen = false,
      panelOffset = 0,
      readOnly = false,
      panelWidthMode = "half",
      onPanelWidthChange,
      autoZoomEnabled = true,
      onAutoZoomChange,
    }) => {
      const [expandedSettings, setExpandedSettings] = useState(false);
      const [expandedWidthMenu, setExpandedWidthMenu] = useState(false);

      // Get document permissions to check if user can create analyses (not corpus permissions!)
      const { permissions: documentPermissions, setPermissions } =
        useDocumentPermissions();
      const { activeDocument } = useDocumentState();
      const { selectedCorpus } = useCorpusState(); // Still need corpus for context/logging

      // Sync permissions from document state when it loads/changes
      useEffect(() => {
        console.log("FloatingDocumentControls: Document state changed", {
          activeDocument: activeDocument
            ? {
                id: activeDocument.id,
                title: activeDocument.title,
                myPermissions: activeDocument.myPermissions,
              }
            : null,
        });

        if (activeDocument?.myPermissions) {
          console.log(
            "FloatingDocumentControls: Setting permissions from document state",
            {
              rawPermissions: activeDocument.myPermissions,
            }
          );
          setPermissions(activeDocument.myPermissions);
        }
      }, [activeDocument, setPermissions]);

      // Log component lifecycle and key dependency changes
      useEffect(() => {
        console.log(
          "FloatingDocumentControls: Component mounted or key dependencies changed"
        );
      }, []);

      useEffect(() => {
        console.log("FloatingDocumentControls: selectedCorpus changed", {
          previousCorpus: "logged above",
          newCorpus: selectedCorpus
            ? {
                id: selectedCorpus.id,
                title: selectedCorpus.title,
                myPermissions: selectedCorpus.myPermissions,
              }
            : null,
        });
      }, [selectedCorpus]);

      useEffect(() => {
        console.log("FloatingDocumentControls: documentPermissions changed", {
          documentPermissions: documentPermissions
            ? [...documentPermissions]
            : null,
        });
      }, [documentPermissions]);

      useEffect(() => {
        console.log("FloatingDocumentControls: visible prop changed", {
          visible,
        });
      }, [visible]);

      useEffect(() => {
        console.log("FloatingDocumentControls: readOnly prop changed", {
          readOnly,
        });
      }, [readOnly]);

      useEffect(() => {
        console.log("FloatingDocumentControls: showRightPanel prop changed", {
          showRightPanel,
        });
      }, [showRightPanel]);

      console.log("FloatingDocumentControls: Props and State", {
        visible,
        showRightPanel,
        readOnly,
        selectedCorpus: selectedCorpus
          ? {
              id: selectedCorpus.id,
              title: selectedCorpus.title,
              myPermissions: selectedCorpus.myPermissions,
            }
          : null,
        documentPermissions: documentPermissions
          ? [...documentPermissions]
          : null,
        panelOffset,
        analysesOpen,
        extractsOpen,
      });

      const hasReadPermission = documentPermissions?.includes(
        PermissionTypes.CAN_READ
      );
      const hasUpdatePermission = documentPermissions?.includes(
        PermissionTypes.CAN_UPDATE
      );
      const canCreateAnalysis = hasReadPermission && hasUpdatePermission;

      console.log("FloatingDocumentControls: Permission Analysis", {
        hasReadPermission,
        hasUpdatePermission,
        canCreateAnalysis,
        readOnly,
        willShowAnalysisButton: canCreateAnalysis && !readOnly,
        CAN_READ_VALUE: PermissionTypes.CAN_READ,
        CAN_UPDATE_VALUE: PermissionTypes.CAN_UPDATE,
        documentPermissionsArray: documentPermissions
          ? [...documentPermissions]
          : null,
        corpusPermissionsArray: selectedCorpus?.myPermissions || null,
      });

      // Close settings panel when right panel opens
      useEffect(() => {
        if (showRightPanel && expandedSettings) {
          setExpandedSettings(false);
        }
      }, [showRightPanel]); // Remove expandedSettings from deps to avoid closure issues

      // Close width menu when right panel opens
      useEffect(() => {
        if (showRightPanel && expandedWidthMenu) {
          setExpandedWidthMenu(false);
        }
      }, [showRightPanel]);

      // Add logging for early return
      if (!visible) {
        console.log(
          "FloatingDocumentControls: Not rendering - visible prop is false"
        );
        return null;
      }

      console.log(
        "FloatingDocumentControls: Rendering component with final state",
        {
          visible,
          showRightPanel,
          readOnly,
          canCreateAnalysis,
          willRenderAnalysisButton: canCreateAnalysis && !readOnly,
          willShowSettingsButton: !showRightPanel,
          documentPermissionsState: documentPermissions
            ? {
                hasPermissions: !!documentPermissions,
                permissionCount: documentPermissions.length || 0,
                permissions: [...documentPermissions],
              }
            : "No document permissions",
          corpusState: selectedCorpus
            ? {
                id: selectedCorpus.id,
                title: selectedCorpus.title,
                hasPermissions: !!selectedCorpus.myPermissions,
                permissionCount: selectedCorpus.myPermissions?.length || 0,
                permissions: selectedCorpus.myPermissions,
              }
            : "No corpus selected",
        }
      );

      return (
        <ControlsContainer $panelOffset={panelOffset}>
          <AnimatePresence>
            {expandedWidthMenu && showRightPanel && (
              <ControlPanel
                data-testid="width-menu-panel"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
              >
                <PanelHeader>
                  <Columns />
                  Panel Width
                </PanelHeader>
                <WidthMenuItem
                  $isActive={panelWidthMode === "quarter"}
                  onClick={() => {
                    onPanelWidthChange?.("quarter");
                    setExpandedWidthMenu(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  Compact
                  <span className="percentage">25%</span>
                </WidthMenuItem>
                <WidthMenuItem
                  $isActive={panelWidthMode === "half"}
                  onClick={() => {
                    onPanelWidthChange?.("half");
                    setExpandedWidthMenu(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  Standard
                  <span className="percentage">50%</span>
                </WidthMenuItem>
                <WidthMenuItem
                  $isActive={panelWidthMode === "full"}
                  onClick={() => {
                    onPanelWidthChange?.("full");
                    setExpandedWidthMenu(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  Wide
                  <span className="percentage">90%</span>
                </WidthMenuItem>
              </ControlPanel>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {expandedSettings && (
              <ControlPanel
                data-testid="settings-panel"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
              >
                <PanelHeader>
                  <Eye />
                  Annotation Filters
                </PanelHeader>
                <AnnotationControls
                  variant="floating"
                  showLabelFilters
                  compact
                />

                <Divider />

                <ControlItem>
                  <ControlLabel>
                    <Maximize2 />
                    Auto-Zoom Sidebar
                  </ControlLabel>
                  <StyledCheckbox
                    toggle
                    checked={autoZoomEnabled}
                    onChange={() => onAutoZoomChange?.(!autoZoomEnabled)}
                  />
                </ControlItem>
              </ControlPanel>
            )}
          </AnimatePresence>

          {/* Width control button - only show when right panel is open */}
          {showRightPanel && (
            <ActionButton
              data-expanded={expandedWidthMenu}
              data-testid="width-button"
              onClick={() => setExpandedWidthMenu(!expandedWidthMenu)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Panel Width"
            >
              <Columns />
            </ActionButton>
          )}

          {/* Only show Settings button when right panel is closed */}
          {!showRightPanel && (
            <ActionButton
              data-expanded={expandedSettings}
              data-testid="settings-button"
              onClick={() => setExpandedSettings(!expandedSettings)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Annotation Filters"
            >
              <Settings />
            </ActionButton>
          )}

          <ActionButton
            $color="#8b5cf6"
            data-testid="extracts-button"
            onClick={() => {
              /*
               * Ensure exclusivity: if the analyses panel is open we close it before
               * toggling the extracts panel open, and vice-versa. This guarantees
               * that both panels are never visible at the same time.
               */
              if (!extractsOpen) {
                // Opening extracts – make sure analyses panel is closed first
                if (analysesOpen && onAnalysesClick) {
                  onAnalysesClick();
                }
              }
              if (onExtractsClick) onExtractsClick();
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="View Extracts"
          >
            <Database />
          </ActionButton>

          <ActionButton
            $color="#f59e0b"
            data-testid="analyses-button"
            onClick={() => {
              /*
               * Mirror logic for analyses button.
               */
              if (!analysesOpen) {
                // Opening analyses – close extracts first if open
                if (extractsOpen && onExtractsClick) {
                  onExtractsClick();
                }
              }
              if (onAnalysesClick) onAnalysesClick();
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="View Analyses"
          >
            <BarChart3 />
          </ActionButton>

          {/* New button: Start Analysis - only show if user has permissions and not in readOnly mode */}
          {(() => {
            const shouldShowAnalysisButton =
              canCreateAnalysis && !readOnly && selectedCorpus;
            console.log(
              "FloatingDocumentControls: Analysis button render decision",
              {
                canCreateAnalysis,
                readOnly,
                shouldShowAnalysisButton,
                documentPermissions: documentPermissions
                  ? [...documentPermissions]
                  : null,
                selectedCorpusId: selectedCorpus?.id,
                selectedCorpusPermissions: selectedCorpus?.myPermissions,
              }
            );

            return shouldShowAnalysisButton ? (
              <ActionButton
                $color="#10b981"
                data-testid="create-analysis-button"
                onClick={() => {
                  console.log(
                    "FloatingDocumentControls: Analysis button clicked",
                    {
                      selectedCorpus: selectedCorpus
                        ? {
                            id: selectedCorpus.id,
                            title: selectedCorpus.title,
                          }
                        : null,
                      currentOpenedCorpus: openedCorpus(),
                    }
                  );

                  // Note: openedCorpus is managed by CentralRouteManager, not set here
                  // Modal reads corpus from reactive var or component state as needed
                  if (selectedCorpus) {
                    console.log(
                      "FloatingDocumentControls: Opening analysis modal with corpus context"
                    );
                    showSelectCorpusAnalyzerOrFieldsetModal(true);
                  } else {
                    console.warn(
                      "FloatingDocumentControls: No corpus context available for analysis"
                    );
                  }
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Start New Analysis"
              >
                <Plus />
              </ActionButton>
            ) : null;
          })()}
        </ControlsContainer>
      );
    }
  );

FloatingDocumentControls.displayName = "FloatingDocumentControls";
