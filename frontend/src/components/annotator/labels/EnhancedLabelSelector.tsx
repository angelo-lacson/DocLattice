import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import styled from "styled-components";
import {
  Tag,
  FileText,
  Plus,
  X,
  Tags,
  Search,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@apollo/client";
import {
  Input,
  Button,
  Modal,
  Form,
  Message,
  Dropdown,
} from "semantic-ui-react";
import { toast } from "react-toastify";
import {
  AnnotationLabelType,
  LabelType,
  LabelSetType,
} from "../../../types/graphql-api";
import { PermissionTypes } from "../../types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { useCorpusState } from "../context/CorpusAtom";
import { useSelectedDocument } from "../context/DocumentAtom";
import { DocTypeAnnotation } from "../types/annotations";
import {
  useAddDocTypeAnnotation,
  useDeleteDocTypeAnnotation,
  usePdfAnnotations,
} from "../hooks/AnnotationHooks";
import { useReactiveVar } from "@apollo/client";
import { selectedAnalysis, selectedExtract } from "../../../graphql/cache";
import {
  SMART_LABEL_SEARCH_OR_CREATE,
  SmartLabelSearchOrCreateInputs,
  SmartLabelSearchOrCreateOutputs,
} from "../../../graphql/mutations";

interface EnhancedLabelSelectorProps {
  activeSpanLabel: AnnotationLabelType | null;
  setActiveLabel: (label: AnnotationLabelType | undefined) => void;
  sidebarWidth: string;
  labels?: AnnotationLabelType[];
  showRightPanel?: boolean;
  panelOffset?: number;
  hideControls?: boolean;
  readOnly?: boolean;
}

export const EnhancedLabelSelector: React.FC<EnhancedLabelSelectorProps> = ({
  activeSpanLabel,
  setActiveLabel,
  sidebarWidth,
  labels,
  showRightPanel,
  panelOffset = 0,
  hideControls = false,
  readOnly = false,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width <= 768;
  const componentRef = useRef<HTMLDivElement>(null);

  // State
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateLabelModal, setShowCreateLabelModal] = useState(false);
  const [showCreateLabelsetModal, setShowCreateLabelsetModal] = useState(false);
  const [newLabelText, setNewLabelText] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#1a75bc");
  const [newLabelDescription, setNewLabelDescription] = useState("");
  const [newLabelsetTitle, setNewLabelsetTitle] = useState("");
  const [newLabelsetDescription, setNewLabelsetDescription] = useState("");
  const [showNoLabelsMessage, setShowNoLabelsMessage] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hooks
  const { selectedDocument } = useSelectedDocument();
  const {
    humanSpanLabels,
    humanTokenLabels,
    docTypeLabels,
    canUpdateCorpus,
    selectedCorpus,
  } = useCorpusState();
  const { pdfAnnotations } = usePdfAnnotations();
  const deleteDocTypeAnnotation = useDeleteDocTypeAnnotation();
  const createDocTypeAnnotation = useAddDocTypeAnnotation();

  const selected_extract = useReactiveVar(selectedExtract);
  const selected_analysis = useReactiveVar(selectedAnalysis);
  const isReadOnlyMode =
    readOnly ||
    Boolean(selected_analysis) ||
    Boolean(selected_extract) ||
    !canUpdateCorpus;

  const doc_annotations = pdfAnnotations.docTypes;

  // GraphQL Mutations
  const [smartLabelSearchOrCreate] = useMutation<
    SmartLabelSearchOrCreateOutputs,
    SmartLabelSearchOrCreateInputs
  >(SMART_LABEL_SEARCH_OR_CREATE);

  // Determine label type based on document type
  const getLabelType = useCallback(() => {
    const isTextFile = selectedDocument?.fileType?.startsWith("text/") ?? false;
    const isPdfFile = selectedDocument?.fileType === "application/pdf";

    if (isTextFile) return LabelType.SpanLabel;
    if (isPdfFile) return LabelType.TokenLabel;
    return LabelType.SpanLabel; // Default
  }, [selectedDocument?.fileType]);

  // Compute available labels
  const filteredLabelChoices = useMemo<AnnotationLabelType[]>(() => {
    const isTextFile = selectedDocument?.fileType?.startsWith("text/") ?? false;
    const isPdfFile = selectedDocument?.fileType === "application/pdf";
    let availableLabels: AnnotationLabelType[] = [];

    if (isTextFile) {
      availableLabels = [...humanSpanLabels];
    } else if (isPdfFile) {
      availableLabels = [...humanTokenLabels];
    }

    // Filter by search term
    if (searchTerm) {
      availableLabels = availableLabels.filter((label) =>
        label.text?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Exclude active label
    return activeSpanLabel
      ? availableLabels.filter((label) => label.id !== activeSpanLabel.id)
      : availableLabels;
  }, [
    humanSpanLabels,
    humanTokenLabels,
    selectedDocument?.fileType,
    activeSpanLabel,
    searchTerm,
  ]);

  const annotationLabelOptions =
    labels && labels.length > 0 ? labels : filteredLabelChoices;

  // Filter doc labels
  const existingDocLabels = useMemo(() => {
    return doc_annotations.map((annotation) => annotation.annotationLabel.id);
  }, [doc_annotations]);

  const filteredDocLabelChoices = useMemo(() => {
    return docTypeLabels.filter(
      (label) => !existingDocLabels.includes(label.id)
    );
  }, [docTypeLabels, existingDocLabels]);

  // Check if corpus has a labelset
  const hasLabelset = Boolean(selectedCorpus?.labelSet);

  // Handle creating a new label (with optional labelset creation)
  const handleCreateLabel = async (includeNewLabelset: boolean = false) => {
    if (!newLabelText.trim()) {
      toast.error("Please enter a label name");
      return;
    }

    if (!hasLabelset && !includeNewLabelset) {
      // Redirect to labelset creation modal
      setShowCreateLabelModal(false);
      setShowCreateLabelsetModal(true);
      return;
    }

    try {
      const result = await smartLabelSearchOrCreate({
        variables: {
          corpusId: selectedCorpus?.id!,
          searchTerm: newLabelText,
          labelType: getLabelType(),
          color: newLabelColor,
          description: newLabelDescription,
          createIfNotFound: true,
          labelsetTitle: includeNewLabelset
            ? newLabelsetTitle || `${selectedCorpus?.title} Labels`
            : undefined,
          labelsetDescription: includeNewLabelset
            ? newLabelsetDescription
            : undefined,
        },
      });

      if (result.data?.smartLabelSearchOrCreate?.ok) {
        const { labels, labelsetCreated, labelCreated } =
          result.data.smartLabelSearchOrCreate;

        if (labels && labels.length > 0) {
          // Set the active label
          setActiveLabel(labels[0]);

          // Show appropriate success message
          if (labelsetCreated && labelCreated) {
            toast.success(`Created labelset and label "${newLabelText}"`);
          } else if (labelCreated) {
            toast.success(`Created label "${newLabelText}"`);
          } else {
            toast.info(`Selected existing label "${newLabelText}"`);
          }

          // Close modals and reset
          setShowCreateLabelModal(false);
          setShowCreateLabelsetModal(false);
          setNewLabelText("");
          setNewLabelDescription("");
          setNewLabelsetTitle("");
          setNewLabelsetDescription("");
          setIsExpanded(false);

          // Refetch corpus data to update labels
          window.location.reload();
        }
      } else {
        toast.error(
          result.data?.smartLabelSearchOrCreate?.message ||
            "Failed to create label"
        );
      }
    } catch (error) {
      console.error("Error creating label:", error);
      toast.error("Failed to create label");
    }
  };

  // Handle doc type label toggle
  const handleDocLabelToggle = useCallback(
    (label: AnnotationLabelType) => {
      const existingAnnotation = doc_annotations.find(
        (ann) => ann.annotationLabel.id === label.id
      );

      if (existingAnnotation) {
        deleteDocTypeAnnotation(existingAnnotation.id);
      } else {
        createDocTypeAnnotation(label);
      }
    },
    [doc_annotations, createDocTypeAnnotation, deleteDocTypeAnnotation]
  );

  // Mouse handlers
  const handleMouseEnter = (): void => {
    if (isMobile) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = (): void => {
    if (isMobile) return;
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
      setSearchTerm("");
    }, 300);
  };

  const handleSelectorClick = (): void => {
    if (!isMobile) return;
    setIsExpanded(!isExpanded);
  };

  // Check for no labels condition and show message
  useEffect(() => {
    if (!hasLabelset && isExpanded && !readOnly) {
      setShowNoLabelsMessage(true);
    }
  }, [hasLabelset, isExpanded, readOnly]);

  // Hide controls when needed
  if (hideControls) return null;

  // Calculate position based on panel offset
  const calculatePosition = () => {
    if (isMobile) {
      return { bottom: "1rem", right: "1rem" };
    }
    return {
      bottom: "2.5rem",
      right: panelOffset > 0 ? `${panelOffset + 24}px` : "1.5rem",
    };
  };

  return (
    <>
      <StyledEnhancedSelector
        {...calculatePosition()}
        isExpanded={isExpanded}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleSelectorClick}
        ref={componentRef}
      >
        <motion.div
          className="selector-button"
          data-testid="label-selector-toggle-button"
          animate={{
            scale: activeSpanLabel ? 1.05 : 1,
            boxShadow: activeSpanLabel
              ? "0 8px 32px rgba(26, 117, 188, 0.15)"
              : "0 4px 24px rgba(0, 0, 0, 0.08)",
          }}
        >
          <Tag className="tag-icon" size={24} />
          {activeSpanLabel && (
            <motion.div
              className="active-label-display"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
            >
              <span
                className="color-dot"
                style={{ backgroundColor: activeSpanLabel.color || "#1a75bc" }}
              />
              <span>{activeSpanLabel.text}</span>
              <button
                className="clear-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveLabel(undefined);
                  if (isMobile) setIsExpanded(false);
                }}
              >
                ×
              </button>
            </motion.div>
          )}
        </motion.div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="labels-menu"
              data-testid="label-selector-dropdown"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              {/* Search input */}
              <div className="search-container">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search or create label..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                  autoFocus={!isMobile}
                />
              </div>

              {/* Show message if no labelset exists */}
              {!hasLabelset && !readOnly && (
                <div className="no-labelset-message">
                  <AlertCircle size={16} />
                  <span>No labelset configured</span>
                  <button
                    className="create-labelset-link"
                    onClick={() => {
                      setNewLabelText(searchTerm);
                      setShowCreateLabelsetModal(true);
                      setIsExpanded(false);
                    }}
                  >
                    Create one
                  </button>
                </div>
              )}

              {/* Annotation Labels */}
              {hasLabelset && (
                <>
                  <div className="label-section">
                    <div className="section-title">Annotation Labels</div>
                    {annotationLabelOptions.length > 0 ? (
                      annotationLabelOptions.map((label) => (
                        <button
                          key={label.id}
                          onClick={() => {
                            setActiveLabel(label);
                            setIsExpanded(false);
                            setSearchTerm("");
                          }}
                          className={`label-option ${
                            activeSpanLabel?.id === label.id ? "active" : ""
                          }`}
                        >
                          <span
                            className="color-dot"
                            style={{
                              backgroundColor: label.color || "#1a75bc",
                            }}
                          />
                          {label.text}
                        </button>
                      ))
                    ) : searchTerm ? (
                      <button
                        className="create-label-button"
                        onClick={() => {
                          setNewLabelText(searchTerm);
                          setShowCreateLabelModal(true);
                          setIsExpanded(false);
                        }}
                      >
                        <Plus size={16} />
                        Create "{searchTerm}"
                      </button>
                    ) : (
                      <div className="empty-state">No labels available</div>
                    )}
                  </div>

                  {/* Document Labels */}
                  {filteredDocLabelChoices.length > 0 && (
                    <div className="label-section">
                      <div className="section-title">Document Labels</div>
                      {filteredDocLabelChoices.map((label) => {
                        const isApplied = existingDocLabels.includes(label.id);
                        return (
                          <button
                            key={label.id}
                            onClick={() => handleDocLabelToggle(label)}
                            className={`label-option ${
                              isApplied ? "active" : ""
                            }`}
                          >
                            <FileText
                              size={16}
                              className="doc-icon"
                              style={{ color: label.color || "#6b7280" }}
                            />
                            {label.text}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </StyledEnhancedSelector>

      {/* Create Label Modal */}
      <Modal
        open={showCreateLabelModal}
        onClose={() => setShowCreateLabelModal(false)}
        size="small"
      >
        <Modal.Header>Create New Label</Modal.Header>
        <Modal.Content>
          <Form>
            <Form.Field>
              <label>Label Name</label>
              <Input
                value={newLabelText}
                onChange={(e, { value }) => setNewLabelText(value)}
                placeholder="Enter label name"
              />
            </Form.Field>
            <Form.Field>
              <label>Color</label>
              <input
                type="color"
                value={newLabelColor}
                onChange={(e) => setNewLabelColor(e.target.value)}
              />
            </Form.Field>
            <Form.Field>
              <label>Description (optional)</label>
              <Input
                value={newLabelDescription}
                onChange={(e, { value }) => setNewLabelDescription(value)}
                placeholder="Enter description"
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowCreateLabelModal(false)}>Cancel</Button>
          <Button primary onClick={() => handleCreateLabel(false)}>
            Create Label
          </Button>
        </Modal.Actions>
      </Modal>

      {/* Create Labelset Modal */}
      <Modal
        open={showCreateLabelsetModal}
        onClose={() => setShowCreateLabelsetModal(false)}
        size="small"
      >
        <Modal.Header>Create Labelset and Label</Modal.Header>
        <Modal.Content>
          <Message info>
            <Message.Header>No labelset exists for this corpus</Message.Header>
            <p>
              You need to create a labelset first, then add your label to it.
            </p>
          </Message>
          <Form>
            <Form.Field>
              <label>Labelset Name</label>
              <Input
                value={newLabelsetTitle}
                onChange={(e, { value }) => setNewLabelsetTitle(value)}
                placeholder="e.g., Contract Labels"
              />
            </Form.Field>
            <Form.Field>
              <label>Labelset Description (optional)</label>
              <Input
                value={newLabelsetDescription}
                onChange={(e, { value }) => setNewLabelsetDescription(value)}
                placeholder="Description of this labelset"
              />
            </Form.Field>
            <div className="ui divider" />
            <Form.Field>
              <label>Label Name</label>
              <Input
                value={newLabelText}
                onChange={(e, { value }) => setNewLabelText(value)}
                placeholder="Enter label name"
              />
            </Form.Field>
            <Form.Field>
              <label>Label Color</label>
              <input
                type="color"
                value={newLabelColor}
                onChange={(e) => setNewLabelColor(e.target.value)}
              />
            </Form.Field>
            <Form.Field>
              <label>Label Description (optional)</label>
              <Input
                value={newLabelDescription}
                onChange={(e, { value }) => setNewLabelDescription(value)}
                placeholder="Enter description"
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowCreateLabelsetModal(false)}>
            Cancel
          </Button>
          <Button primary onClick={() => handleCreateLabel(true)}>
            Create Labelset & Label
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

interface StyledEnhancedSelectorProps {
  isExpanded: boolean;
  bottom: string;
  right: string;
}

const StyledEnhancedSelector = styled.div<StyledEnhancedSelectorProps>`
  position: fixed;
  bottom: ${(props) => props.bottom};
  right: ${(props) => props.right};
  z-index: 1000;
  transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

  @media (max-width: 768px) {
    bottom: 1rem;
    right: 1rem;
  }

  .selector-button {
    min-width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(200, 200, 200, 0.8);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    flex-shrink: 0;
    cursor: pointer;
    position: relative;
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

    .tag-icon {
      color: #1a75bc;
      stroke-width: 2.2;
      transition: all 0.3s;
    }

    &:hover {
      transform: translateY(-2px);
    }
  }

  .active-label-display {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #475569;

    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .clear-button {
      background: none;
      border: none;
      color: #64748b;
      font-size: 1.2rem;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin-left: 4px;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #ef4444;
      }
    }
  }

  .labels-menu {
    position: absolute;
    bottom: calc(100% + 12px);
    right: 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border-radius: 14px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 280px;
    max-width: 320px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    border: 1px solid rgba(200, 200, 200, 0.8);

    .search-container {
      position: relative;
      display: flex;
      align-items: center;
      padding: 0.5rem;
      background: rgba(248, 249, 250, 0.8);
      border-radius: 8px;
      border: 1px solid rgba(200, 200, 200, 0.5);

      .search-icon {
        position: absolute;
        left: 12px;
        color: #64748b;
        pointer-events: none;
      }

      .search-input {
        flex: 1;
        border: none;
        background: transparent;
        padding: 0.25rem 0.5rem 0.25rem 2rem;
        font-size: 0.875rem;
        outline: none;
        color: #1e293b;

        &::placeholder {
          color: #94a3b8;
        }
      }
    }

    .no-labelset-message {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      background: rgba(254, 243, 199, 0.5);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: 8px;
      font-size: 0.875rem;
      color: #92400e;

      svg {
        flex-shrink: 0;
        color: #f59e0b;
      }

      .create-labelset-link {
        margin-left: auto;
        background: none;
        border: none;
        color: #1a75bc;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        font-size: 0.875rem;

        &:hover {
          color: #1557a0;
        }
      }
    }

    .label-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .section-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 0 0.5rem;
      }
    }

    button {
      border: none;
      background: transparent;
      padding: 0.75rem 1rem;
      cursor: pointer;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      position: relative;
      transition: all 0.2s;
      text-align: left;

      .color-dot {
        width: 8px;
        height: 8px;
        border-radius: 4px;
        transition: all 0.2s;
        flex-shrink: 0;
      }

      .doc-icon {
        flex-shrink: 0;
      }

      &:hover {
        background: rgba(0, 0, 0, 0.03);
        color: #1e293b;

        .color-dot {
          transform: scale(1.2);
        }
      }

      &.active {
        color: #1a75bc;
        font-weight: 600;
        background: rgba(26, 117, 188, 0.08);

        .color-dot {
          transform: scale(1.3);
        }
      }

      &.create-label-button {
        background: rgba(26, 117, 188, 0.08);
        color: #1a75bc;
        font-weight: 600;

        &:hover {
          background: rgba(26, 117, 188, 0.12);
        }
      }
    }

    .empty-state {
      padding: 0.75rem 1rem;
      color: #64748b;
      font-size: 0.875rem;
      text-align: center;
      font-style: italic;
    }
  }
`;

export default EnhancedLabelSelector;
