import React, { useState, useMemo, useCallback } from "react";
import {
  Modal,
  Form,
  Radio,
  Icon,
  Input,
  Dropdown,
  Button,
} from "semantic-ui-react";
import styled from "styled-components";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "react-toastify";
import { Link2, FileText, X, Plus, Search } from "lucide-react";

import { useCorpusState } from "../annotator/context/CorpusAtom";
import { LabelType, DocumentType } from "../../types/graphql-api";
import {
  SMART_LABEL_SEARCH_OR_CREATE,
  SmartLabelSearchOrCreateInputs,
  SmartLabelSearchOrCreateOutputs,
  CREATE_DOCUMENT_RELATIONSHIP,
  CreateDocumentRelationshipInputs,
  CreateDocumentRelationshipOutputs,
} from "../../graphql/mutations";
import {
  GET_DOCUMENTS,
  RequestDocumentsOutputs,
  GET_DOCUMENT_RELATIONSHIPS,
} from "../../graphql/queries";

// ============================================================================
// TYPES
// ============================================================================

interface DocumentRelationshipModalProps {
  open: boolean;
  onClose: () => void;
  corpusId: string;
  sourceDocumentIds: string[];
  sourceDocuments?: Array<{ id: string; title: string; icon?: string }>;
  onSuccess?: () => void;
}

type RelationshipMode = "RELATIONSHIP" | "NOTES";

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const ModalContent = styled(Modal.Content)`
  max-height: 70vh;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: #f1f5f9;
  }
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
    &:hover {
      background: #94a3b8;
    }
  }
`;

const ModeSection = styled.div`
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
`;

const DocumentPill = styled.div<{ $variant?: "source" | "target" }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin: 0.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  background: ${(props) =>
    props.$variant === "source" ? "#dbeafe" : "#dcfce7"};
  border: 2px solid
    ${(props) => (props.$variant === "source" ? "#3b82f6" : "#22c55e")};
  color: ${(props) => (props.$variant === "source" ? "#1e40af" : "#166534")};
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.6;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
`;

const DocumentSection = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;

  .section-title {
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pills-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-height: 40px;
    padding: 0.5rem;
    background: #fafafa;
    border-radius: 4px;
  }
`;

const SearchResultItem = styled.div<{ $selected: boolean }>`
  padding: 0.75rem;
  margin: 0.25rem 0;
  border: 1px solid ${(props) => (props.$selected ? "#3b82f6" : "#e5e7eb")};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  background: ${(props) => (props.$selected ? "#eff6ff" : "white")};
  display: flex;
  align-items: center;
  gap: 0.75rem;

  &:hover {
    border-color: #3b82f6;
    background: #f8fafc;
  }

  .doc-icon {
    flex-shrink: 0;
  }

  .doc-info {
    flex: 1;
    min-width: 0;

    .doc-title {
      font-weight: 500;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 2rem;
  color: #64748b;
  font-style: italic;
`;

const InfoBox = styled.div`
  margin-top: 1rem;
  padding: 0.75rem;
  background: #f1f5f9;
  border-radius: 6px;
  border-left: 4px solid #3b82f6;
  font-size: 0.875rem;
  color: #475569;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export const DocumentRelationshipModal: React.FC<
  DocumentRelationshipModalProps
> = ({
  open,
  onClose,
  corpusId,
  sourceDocumentIds,
  sourceDocuments = [],
  onSuccess,
}) => {
  const { relationLabels, selectedCorpus, setCorpus } = useCorpusState();

  // Mode state
  const [mode, setMode] = useState<RelationshipMode>("RELATIONSHIP");

  // Target document selection
  const [targetDocumentIds, setTargetDocumentIds] = useState<string[]>([]);
  const [documentSearchTerm, setDocumentSearchTerm] = useState("");

  // Label selection (for RELATIONSHIP mode)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [labelSearchTerm, setLabelSearchTerm] = useState("");
  const [showCreateLabel, setShowCreateLabel] = useState(false);
  const [newLabelText, setNewLabelText] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#10b981");
  const [newLabelDescription, setNewLabelDescription] = useState("");

  // Notes data (for NOTES mode)
  const [notesContent, setNotesContent] = useState("");

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if we have corpus context
  const hasCorpus = Boolean(corpusId && selectedCorpus?.id);
  const hasLabelset = Boolean(selectedCorpus?.labelSet);

  // Query for documents in corpus (for target selection)
  const { data: documentsData, loading: documentsLoading } =
    useQuery<RequestDocumentsOutputs>(GET_DOCUMENTS, {
      variables: {
        inCorpusWithId: corpusId,
        textSearch: documentSearchTerm || undefined,
        limit: 20,
        annotateDocLabels: false,
        includeMetadata: false,
      },
      skip: !open || !corpusId,
      fetchPolicy: "cache-and-network",
    });

  // Mutations
  const [smartLabelSearchOrCreate] = useMutation<
    SmartLabelSearchOrCreateOutputs,
    SmartLabelSearchOrCreateInputs
  >(SMART_LABEL_SEARCH_OR_CREATE);

  const [createDocumentRelationship] = useMutation<
    CreateDocumentRelationshipOutputs,
    CreateDocumentRelationshipInputs
  >(CREATE_DOCUMENT_RELATIONSHIP);

  // All documents from query
  const allDocuments = useMemo(() => {
    return (
      documentsData?.documents?.edges
        ?.map((e) => e?.node)
        .filter(
          (doc): doc is NonNullable<typeof doc> => doc != null && doc.id != null
        ) || []
    );
  }, [documentsData]);

  // Derive source document info from query when not provided via props
  const resolvedSourceDocuments = useMemo(() => {
    if (sourceDocuments.length > 0) {
      return sourceDocuments;
    }
    // Find source documents from the query results
    return allDocuments
      .filter((doc) => sourceDocumentIds.includes(doc.id))
      .map((doc) => ({
        id: doc.id,
        title: doc.title || "Untitled",
        icon: doc.icon || undefined,
      }));
  }, [sourceDocuments, allDocuments, sourceDocumentIds]);

  // Get available documents (excluding source documents)
  const availableDocuments = useMemo(() => {
    return allDocuments.filter((doc) => !sourceDocumentIds.includes(doc.id));
  }, [allDocuments, sourceDocumentIds]);

  // Get selected target documents with info
  const selectedTargetDocuments = useMemo(() => {
    return allDocuments.filter((doc) => targetDocumentIds.includes(doc.id));
  }, [allDocuments, targetDocumentIds]);

  // Filter relationship labels
  const filteredRelationshipLabels = useMemo(() => {
    if (!hasCorpus || !selectedCorpus?.labelSet) {
      return [];
    }

    const labels =
      relationLabels?.filter(
        (label) => label.labelType === LabelType.RelationshipLabel
      ) || [];

    if (!labelSearchTerm) return labels;

    return labels.filter((label) =>
      label.text?.toLowerCase().includes(labelSearchTerm.toLowerCase())
    );
  }, [relationLabels, labelSearchTerm, hasCorpus, selectedCorpus?.labelSet]);

  // Get selected label info
  const selectedLabel = useMemo(() => {
    if (!selectedLabelId) return null;
    return relationLabels?.find((l) => l.id === selectedLabelId);
  }, [selectedLabelId, relationLabels]);

  // Handle creating a new relationship label
  const handleCreateLabel = useCallback(async () => {
    if (!hasCorpus) {
      toast.error("Cannot create labels without a selected corpus");
      return;
    }

    if (!newLabelText.trim()) {
      toast.error("Please enter a label name");
      return;
    }

    try {
      const result = await smartLabelSearchOrCreate({
        variables: {
          corpusId,
          searchTerm: newLabelText,
          labelType: LabelType.RelationshipLabel,
          color: newLabelColor,
          description: newLabelDescription,
          createIfNotFound: true,
        },
      });

      if (result.data?.smartLabelSearchOrCreate?.ok) {
        const { labels, labelsetCreated, labelCreated } =
          result.data.smartLabelSearchOrCreate;

        if (labels && labels.length > 0) {
          const newLabel = labels[0];

          // Update corpus state with new label
          if (labelCreated) {
            setCorpus({
              relationLabels: [...(relationLabels || []), newLabel],
            });
          }

          // Select the new label
          setSelectedLabelId(newLabel.id);
          setShowCreateLabel(false);
          setLabelSearchTerm("");
          setNewLabelText("");
          setNewLabelDescription("");

          if (labelsetCreated) {
            toast.success(`Created labelset and label "${newLabelText}"`);
          } else if (labelCreated) {
            toast.success(`Created label "${newLabelText}"`);
          } else {
            toast.info(`Selected existing label "${newLabelText}"`);
          }
        }
      } else {
        toast.error(
          result.data?.smartLabelSearchOrCreate?.message ||
            "Failed to create label"
        );
      }
    } catch (error) {
      console.error("Error creating relationship label:", error);
      toast.error("Failed to create label");
    }
  }, [
    hasCorpus,
    corpusId,
    newLabelText,
    newLabelColor,
    newLabelDescription,
    smartLabelSearchOrCreate,
    relationLabels,
    setCorpus,
  ]);

  // Handle adding/removing target documents
  const toggleTargetDocument = useCallback((docId: string) => {
    setTargetDocumentIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  }, []);

  const removeTargetDocument = useCallback((docId: string) => {
    setTargetDocumentIds((prev) => prev.filter((id) => id !== docId));
  }, []);

  // Check if form is valid
  const canSubmit = useMemo(() => {
    if (targetDocumentIds.length === 0) return false;
    if (mode === "RELATIONSHIP" && !selectedLabelId) return false;
    return true;
  }, [targetDocumentIds, mode, selectedLabelId]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);

    try {
      // Create relationships for each source-target pair
      const promises = sourceDocumentIds.flatMap((sourceId) =>
        targetDocumentIds.map((targetId) =>
          createDocumentRelationship({
            variables: {
              sourceDocumentId: sourceId,
              targetDocumentId: targetId,
              relationshipType: mode,
              corpusId,
              annotationLabelId:
                mode === "RELATIONSHIP"
                  ? selectedLabelId ?? undefined
                  : undefined,
              data:
                mode === "NOTES" && notesContent
                  ? { notes: notesContent }
                  : undefined,
            },
            refetchQueries: [
              {
                query: GET_DOCUMENT_RELATIONSHIPS,
                variables: { corpusId },
              },
            ],
          })
        )
      );

      const results = await Promise.all(promises);

      // Check results
      const successCount = results.filter(
        (r) => r.data?.createDocumentRelationship?.ok
      ).length;
      const totalCount = results.length;

      if (successCount === totalCount) {
        toast.success(
          `Created ${successCount} document relationship${
            successCount > 1 ? "s" : ""
          }`
        );
        onSuccess?.();
        handleClose();
      } else if (successCount > 0) {
        toast.warning(
          `Created ${successCount} of ${totalCount} relationships. Some failed.`
        );
        onSuccess?.();
        handleClose();
      } else {
        const errorMsg =
          results[0]?.data?.createDocumentRelationship?.message ||
          "Failed to create relationships";
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error("Error creating document relationships:", error);
      toast.error("Failed to create relationships");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state on close
  const handleClose = () => {
    setMode("RELATIONSHIP");
    setTargetDocumentIds([]);
    setDocumentSearchTerm("");
    setSelectedLabelId(null);
    setLabelSearchTerm("");
    setShowCreateLabel(false);
    setNewLabelText("");
    setNewLabelColor("#10b981");
    setNewLabelDescription("");
    setNotesContent("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} size="small">
      <Modal.Header>
        <Link2 size={20} style={{ marginRight: "0.5rem" }} />
        Link Documents
      </Modal.Header>
      <ModalContent>
        {!hasCorpus && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "1rem",
              background: "#fef2f2",
              border: "2px solid #ef4444",
              borderRadius: "8px",
              color: "#991b1b",
            }}
          >
            <Icon name="warning circle" />
            <strong>No Corpus Context</strong>
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              Document relationships require a corpus context.
            </p>
          </div>
        )}

        {/* Source Documents Section */}
        <DocumentSection>
          <div className="section-title">
            <Icon name="arrow right" color="blue" />
            Source Documents ({sourceDocumentIds.length})
          </div>
          <div className="pills-container">
            {resolvedSourceDocuments.length > 0 ? (
              resolvedSourceDocuments.map((doc) => (
                <DocumentPill key={doc.id} $variant="source">
                  <FileText size={14} />
                  <span>
                    {doc.title.length > 30
                      ? `${doc.title.substring(0, 30)}...`
                      : doc.title}
                  </span>
                </DocumentPill>
              ))
            ) : documentsLoading ? (
              <span style={{ color: "#64748b", fontStyle: "italic" }}>
                Loading document info...
              </span>
            ) : (
              <span style={{ color: "#64748b", fontStyle: "italic" }}>
                {sourceDocumentIds.length} document
                {sourceDocumentIds.length > 1 ? "s" : ""} selected
              </span>
            )}
          </div>
        </DocumentSection>

        {/* Relationship Type Selection */}
        <ModeSection style={{ marginTop: "1rem" }}>
          <Form.Field>
            <label style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
              Relationship Type
            </label>
            <Form.Group inline>
              <Form.Field>
                <Radio
                  label="Labeled Relationship"
                  value="RELATIONSHIP"
                  checked={mode === "RELATIONSHIP"}
                  onChange={() => setMode("RELATIONSHIP")}
                  disabled={!hasCorpus}
                />
              </Form.Field>
              <Form.Field>
                <Radio
                  label="Notes"
                  value="NOTES"
                  checked={mode === "NOTES"}
                  onChange={() => setMode("NOTES")}
                  disabled={!hasCorpus}
                />
              </Form.Field>
            </Form.Group>
          </Form.Field>

          {/* Label Selection (for RELATIONSHIP mode) */}
          {mode === "RELATIONSHIP" && (
            <>
              {!hasLabelset && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.75rem",
                    background: "#fef3c7",
                    border: "1px solid #fbbf24",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    color: "#92400e",
                  }}
                >
                  <Icon name="info circle" />
                  <strong>No labelset found.</strong> Creating a label will
                  automatically create a labelset for this corpus.
                </div>
              )}

              {!selectedLabel ? (
                !showCreateLabel ? (
                  <>
                    <Form.Field style={{ marginTop: "1rem" }}>
                      <label>Search or Create Relationship Label</label>
                      <Input
                        fluid
                        icon="search"
                        placeholder="Search for a relationship label..."
                        value={labelSearchTerm}
                        onChange={(e) => setLabelSearchTerm(e.target.value)}
                      />
                    </Form.Field>

                    {filteredRelationshipLabels.length > 0 ? (
                      <Form.Field>
                        <label>Select from existing labels:</label>
                        <Dropdown
                          placeholder="Select relationship label"
                          fluid
                          selection
                          options={filteredRelationshipLabels.map((label) => ({
                            key: label.id,
                            text: label.text,
                            value: label.id,
                            icon: label.icon || undefined,
                          }))}
                          value={selectedLabelId || undefined}
                          onChange={(_, data) =>
                            setSelectedLabelId(data.value as string)
                          }
                        />
                      </Form.Field>
                    ) : (
                      <p
                        style={{
                          color: "#64748b",
                          fontStyle: "italic",
                          margin: "0.5rem 0",
                        }}
                      >
                        No matching labels found.
                      </p>
                    )}

                    {labelSearchTerm && (
                      <Button
                        icon
                        labelPosition="left"
                        color="green"
                        onClick={() => {
                          setNewLabelText(labelSearchTerm);
                          setShowCreateLabel(true);
                        }}
                        style={{ marginTop: "0.5rem" }}
                        size="small"
                      >
                        <Icon name="plus" />
                        Create "{labelSearchTerm}" label
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Form.Field style={{ marginTop: "1rem" }}>
                      <label>Label Name</label>
                      <Input
                        fluid
                        placeholder="Enter label name"
                        value={newLabelText}
                        onChange={(e) => setNewLabelText(e.target.value)}
                      />
                    </Form.Field>

                    <Form.Field>
                      <label>Color</label>
                      <Input
                        type="color"
                        value={newLabelColor}
                        onChange={(e) => setNewLabelColor(e.target.value)}
                        style={{ width: "60px" }}
                      />
                    </Form.Field>

                    <Form.Field>
                      <label>Description (optional)</label>
                      <Input
                        fluid
                        placeholder="Enter description"
                        value={newLabelDescription}
                        onChange={(e) => setNewLabelDescription(e.target.value)}
                      />
                    </Form.Field>

                    <Button.Group fluid style={{ marginTop: "0.5rem" }}>
                      <Button
                        onClick={() => {
                          setShowCreateLabel(false);
                          setNewLabelText("");
                          setNewLabelDescription("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button.Or />
                      <Button positive onClick={handleCreateLabel}>
                        Create Label
                      </Button>
                    </Button.Group>
                  </>
                )
              ) : (
                <Form.Field style={{ marginTop: "1rem" }}>
                  <label>Selected Label</label>
                  <div
                    style={{
                      padding: "0.75rem",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          backgroundColor: selectedLabel.color || "#10b981",
                        }}
                      />
                      {selectedLabel.text}
                    </span>
                    <Button
                      size="tiny"
                      basic
                      onClick={() => {
                        setSelectedLabelId(null);
                        setLabelSearchTerm("");
                      }}
                    >
                      Change
                    </Button>
                  </div>
                </Form.Field>
              )}
            </>
          )}

          {/* Notes Content (for NOTES mode) */}
          {mode === "NOTES" && (
            <Form.Field style={{ marginTop: "1rem" }}>
              <label>Notes (optional)</label>
              <Form.TextArea
                placeholder="Add notes about this document relationship..."
                value={notesContent}
                onChange={(_, data) => setNotesContent(data.value as string)}
                rows={3}
              />
            </Form.Field>
          )}
        </ModeSection>

        {/* Target Documents Section */}
        <DocumentSection>
          <div className="section-title">
            <Icon name="bullseye" color="green" />
            Target Documents
          </div>

          {/* Selected targets */}
          {selectedTargetDocuments.length > 0 && (
            <div
              className="pills-container"
              style={{ marginBottom: "0.75rem" }}
            >
              {selectedTargetDocuments.map((doc) => (
                <DocumentPill key={doc.id} $variant="target">
                  <FileText size={14} />
                  <span>
                    {(doc.title || "Untitled").length > 25
                      ? `${(doc.title || "Untitled").substring(0, 25)}...`
                      : doc.title || "Untitled"}
                  </span>
                  <RemoveButton
                    onClick={() => removeTargetDocument(doc.id)}
                    title="Remove"
                  >
                    <X size={14} />
                  </RemoveButton>
                </DocumentPill>
              ))}
            </div>
          )}

          {/* Search for documents */}
          <Form.Field>
            <Input
              fluid
              icon="search"
              placeholder="Search documents in corpus..."
              value={documentSearchTerm}
              onChange={(e) => setDocumentSearchTerm(e.target.value)}
            />
          </Form.Field>

          {/* Document search results */}
          <div
            style={{
              maxHeight: "200px",
              overflowY: "auto",
              marginTop: "0.5rem",
            }}
          >
            {documentsLoading ? (
              <EmptyState>Loading documents...</EmptyState>
            ) : availableDocuments.length > 0 ? (
              availableDocuments.map((doc) => (
                <SearchResultItem
                  key={doc.id}
                  $selected={targetDocumentIds.includes(doc.id)}
                  onClick={() => toggleTargetDocument(doc.id)}
                >
                  <div className="doc-icon">
                    <FileText size={20} color="#64748b" />
                  </div>
                  <div className="doc-info">
                    <div className="doc-title">{doc.title}</div>
                  </div>
                  {targetDocumentIds.includes(doc.id) && (
                    <Icon name="check" color="green" />
                  )}
                </SearchResultItem>
              ))
            ) : (
              <EmptyState>
                {documentSearchTerm
                  ? "No documents found matching your search"
                  : "No other documents in this corpus"}
              </EmptyState>
            )}
          </div>
        </DocumentSection>

        <InfoBox>
          <strong>
            Creating{" "}
            {sourceDocumentIds.length * Math.max(targetDocumentIds.length, 0)}{" "}
            relationship
            {sourceDocumentIds.length * targetDocumentIds.length !== 1
              ? "s"
              : ""}
          </strong>
          : Each source document will be linked to each target document.
        </InfoBox>
      </ModalContent>

      <Modal.Actions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          primary
          onClick={handleSubmit}
          disabled={!hasCorpus || !canSubmit || isSubmitting}
          loading={isSubmitting}
        >
          <Link2 size={16} style={{ marginRight: "0.5rem" }} />
          Create Relationship{targetDocumentIds.length > 1 ? "s" : ""}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default DocumentRelationshipModal;
