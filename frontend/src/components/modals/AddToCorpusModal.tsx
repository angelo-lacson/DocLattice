import React, { useState, useCallback, useEffect } from "react";
import { Modal, Button, Card } from "semantic-ui-react";
import { useQuery, useMutation, gql } from "@apollo/client";
import { toast } from "react-toastify";
import _ from "lodash";
import {
  Folder,
  ArrowLeft,
  Check,
  ArrowRight,
  FileText,
  Tags,
} from "lucide-react";
import { Input } from "@os-legal/ui";
import { ErrorMessage, InfoMessage, LoadingState } from "../widgets/feedback";
import {
  GET_CORPUSES,
  GetCorpusesInputs,
  GetCorpusesOutputs,
} from "../../graphql/queries";
import {
  LINK_DOCUMENTS_TO_CORPUS,
  LinkDocumentsToCorpusInputs,
  LinkDocumentsToCorpusOutputs,
} from "../../graphql/mutations";
import { CorpusType, DocumentType } from "../../types/graphql-api";
import styled from "styled-components";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";

// Styled components for better UI
const SearchWrapper = styled.div`
  margin-bottom: 1.5rem;
`;

const CorpusListWrapper = styled.div`
  max-height: 400px;
  overflow-y: auto;
  padding-right: 0.5rem;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;

const StyledCard = styled(Card)`
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 0.5rem !important;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
  }

  &.selected {
    background-color: #e2ffdb !important;
    border-color: #21ba45 !important;
  }
`;

const DocumentList = styled.ul`
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 1rem;
  list-style: none;
  padding: 0;
`;

const DocumentListItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.surfaceLight};

  &:last-child {
    border-bottom: none;
  }
`;

const MetaLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.2em 0.5em;
  font-size: 0.8rem;
  font-weight: 500;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 4px;
  color: ${OS_LEGAL_COLORS.textTertiary};
  margin-right: 0.5rem;
`;

interface AddToCorpusModalProps {
  // For single document mode
  documentId?: string;
  // For multiple documents mode
  documents?: DocumentType[];
  selectedDocumentIds?: string[];
  open: boolean;
  onClose: () => void;
  onSuccess: (corpusId: string, corpus?: CorpusType | null) => void;
  // Optional props for customization
  title?: string;
  multiStep?: boolean; // Enable multi-step workflow like the widgets version
}

export const AddToCorpusModal: React.FC<AddToCorpusModalProps> = ({
  documentId,
  documents = [],
  selectedDocumentIds = [],
  open,
  onClose,
  onSuccess,
  title = "Add to Corpus",
  multiStep = true,
}) => {
  const [addingToCorpusId, setAddingToCorpusId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCorpus, setSelectedCorpus] = useState<CorpusType | null>(null);
  const [view, setView] = useState<"SELECT" | "CONFIRM">("SELECT");

  // Determine if we're in single or multi-document mode
  const isSingleDocument = !!documentId && !documents.length;
  const documentIds = isSingleDocument
    ? [documentId]
    : selectedDocumentIds.length
    ? selectedDocumentIds
    : documents.map((d) => d.id);

  const selectedDocs = documents.filter((d) => documentIds.includes(d.id));

  // Debounced search function
  const debouncedSetSearchTerm = useCallback(
    _.debounce(setSearchTerm, 300),
    []
  );

  // Query for corpuses with search
  const GET_EDITABLE_CORPUSES = gql`
    query GetEditableCorpuses($textSearch: String) {
      corpuses(textSearch: $textSearch, first: 10) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          node {
            id
            icon
            title
            creator {
              email
            }
            description
            documentCount
            labelSet {
              id
              title
            }
            myPermissions
          }
        }
      }
    }
  `;

  const { data, loading, error, refetch } = useQuery<
    GetCorpusesOutputs,
    GetCorpusesInputs
  >(GET_EDITABLE_CORPUSES, {
    variables: {
      textSearch: searchTerm,
    },
    skip: !open,
    notifyOnNetworkStatusChange: true,
  });

  // Reset state when modal opens/closes and refetch corpuses
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setSelectedCorpus(null);
      setView("SELECT");
      setAddingToCorpusId(null);
    } else {
      // Refetch corpuses when modal opens to ensure fresh data
      refetch();
    }
  }, [open, refetch]);

  // Mutation to add documents to corpus
  const [linkDocuments] = useMutation<
    LinkDocumentsToCorpusOutputs,
    LinkDocumentsToCorpusInputs
  >(LINK_DOCUMENTS_TO_CORPUS, {
    onCompleted: (data) => {
      const result = (data as any).linkDocumentsToCorpus || data;
      if (result.ok) {
        toast.success(
          `Document${
            documentIds.length > 1 ? "s" : ""
          } added to corpus successfully!`
        );
        onSuccess(selectedCorpus?.id || addingToCorpusId || "", selectedCorpus);
        onClose();
      } else {
        toast.error(result.message || "Failed to add documents to corpus");
      }
    },
    onError: (err) => {
      console.error("Error adding documents to corpus:", err);
      toast.error("Failed to add documents to corpus");
    },
  });

  const handleAdd = async (corpus?: CorpusType) => {
    const targetCorpus = corpus || selectedCorpus;
    if (!targetCorpus) return;

    setAddingToCorpusId(targetCorpus.id);

    try {
      await linkDocuments({
        variables: {
          corpusId: targetCorpus.id,
          documentIds: documentIds,
        },
      });
    } finally {
      setAddingToCorpusId(null);
    }
  };

  const handleSearchChange = (value: string) => {
    debouncedSetSearchTerm(value);
  };

  const corpuses =
    data?.corpuses?.edges
      ?.map((edge) => edge?.node)
      .filter(
        (corpus): corpus is CorpusType =>
          corpus !== null &&
          corpus !== undefined &&
          (corpus.myPermissions?.includes("update_corpus") ?? false)
      ) || [];

  const renderCorpusList = () => {
    if (loading) {
      return <LoadingState message="Loading your corpuses..." />;
    }

    if (error) {
      return (
        <ErrorMessage title="Error loading corpuses">
          {error.message}
        </ErrorMessage>
      );
    }

    if (corpuses.length === 0) {
      return (
        <InfoMessage title="No corpuses available">
          {searchTerm
            ? `No corpuses found matching "${searchTerm}". Try a different search term.`
            : "You don't have any corpuses with edit permissions."}
        </InfoMessage>
      );
    }

    return (
      <CorpusListWrapper data-testid={`corpus-list`}>
        {corpuses.map((corpus) => (
          <StyledCard
            key={corpus.id}
            fluid
            className={selectedCorpus?.id === corpus.id ? "selected" : ""}
            onClick={() => {
              if (multiStep) {
                setSelectedCorpus(corpus);
              } else {
                handleAdd(corpus);
              }
            }}
            data-testid={`corpus-item-${corpus.id}`}
          >
            <Card.Content>
              {corpus.icon && (
                <Folder
                  size={16}
                  style={{
                    float: "right",
                    color: OS_LEGAL_COLORS.textSecondary,
                  }}
                />
              )}
              <Card.Header data-testid={`corpus-title-${corpus.id}`}>
                {corpus.title || "Untitled Corpus"}
              </Card.Header>
              <Card.Meta>by {corpus.creator?.email || "Unknown"}</Card.Meta>
              {corpus.description && (
                <Card.Description>{corpus.description}</Card.Description>
              )}
            </Card.Content>
            <Card.Content extra>
              <MetaLabel>
                <FileText size={12} />
                {corpus.documentCount || 0} documents
              </MetaLabel>
              {corpus.labelSet?.title && (
                <MetaLabel>
                  <Tags size={12} />
                  {corpus.labelSet.title}
                </MetaLabel>
              )}
              {!multiStep && (
                <Button
                  primary
                  size="small"
                  floated="right"
                  loading={addingToCorpusId === corpus.id}
                  disabled={addingToCorpusId !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAdd(corpus);
                  }}
                  data-testid={`add-to-corpus-btn-${corpus.id}`}
                >
                  Add
                </Button>
              )}
            </Card.Content>
          </StyledCard>
        ))}
      </CorpusListWrapper>
    );
  };

  const renderContent = () => {
    if (multiStep && view === "CONFIRM") {
      return (
        <>
          <p>
            Please confirm adding the following document
            {selectedDocs.length > 1 ? "s" : ""} to{" "}
            <strong>{selectedCorpus?.title}</strong>:
          </p>
          {selectedDocs.length > 0 && (
            <DocumentList>
              {selectedDocs.map((doc) => (
                <DocumentListItem key={doc.id}>
                  <FileText size={20} color={OS_LEGAL_COLORS.textSecondary} />
                  <div>
                    <strong>{doc.title}</strong>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: OS_LEGAL_COLORS.textSecondary,
                      }}
                    >
                      by {doc.creator?.email || "Unknown"}
                    </div>
                  </div>
                </DocumentListItem>
              ))}
            </DocumentList>
          )}
        </>
      );
    }

    return (
      <>
        <SearchWrapper>
          <Input
            fullWidth
            placeholder="Search corpuses..."
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleSearchChange(e.target.value)
            }
            data-testid="corpus-search-input"
          />
        </SearchWrapper>
        <p>
          Select a corpus to enable collaborative features like annotations, AI
          chat, and data extraction:
        </p>
        {renderCorpusList()}
      </>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="small"
      data-testid="add-to-corpus-modal"
    >
      <Modal.Header>
        <Folder
          size={16}
          style={{ marginRight: "0.5rem", verticalAlign: "middle" }}
        />
        {multiStep && view === "CONFIRM" ? "Confirm Selection" : title}
      </Modal.Header>
      <Modal.Content data-testid="add-to-corpus-modal-content">
        {renderContent()}
      </Modal.Content>
      <Modal.Actions>
        {multiStep && view === "CONFIRM" ? (
          <>
            <Button onClick={() => setView("SELECT")} data-testid="back-button">
              <ArrowLeft size={14} style={{ marginRight: "0.5rem" }} />
              Back
            </Button>
            <Button onClick={onClose} data-testid="cancel-button">
              Cancel
            </Button>
            <Button
              primary
              onClick={() => handleAdd()}
              loading={addingToCorpusId !== null}
              disabled={!selectedCorpus || addingToCorpusId !== null}
              data-testid="confirm-add-button"
            >
              <Check size={14} style={{ marginRight: "0.5rem" }} />
              Add to Corpus
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} data-testid="cancel-button">
              Cancel
            </Button>
            {multiStep && selectedCorpus && (
              <Button
                primary
                onClick={() => setView("CONFIRM")}
                data-testid="next-button"
              >
                Next
                <ArrowRight size={14} style={{ marginLeft: "0.5rem" }} />
              </Button>
            )}
          </>
        )}
      </Modal.Actions>
    </Modal>
  );
};
