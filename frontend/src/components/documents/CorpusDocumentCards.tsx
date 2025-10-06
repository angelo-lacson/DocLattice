import { useEffect, useCallback, useState } from "react";
import _ from "lodash";
import { toast } from "react-toastify";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Icon, Popup, Segment } from "semantic-ui-react";
import styled from "styled-components";
import { navigateToDocument } from "../../utils/navigationUtils";

import { DocumentCards } from "../../components/documents/DocumentCards";
import { DocumentMetadataGrid } from "../../components/documents/DocumentMetadataGrid";

import {
  selectedDocumentIds,
  documentSearchTerm,
  authToken,
  filterToLabelId,
  selectedMetaAnnotationId,
  showUploadNewDocumentsModal,
  uploadModalPreloadedFiles,
  openedCorpus,
} from "../../graphql/cache";
import {
  REMOVE_DOCUMENTS_FROM_CORPUS,
  RemoveDocumentsFromCorpusOutputs,
  RemoveDocumentsFromCorpusInputs,
} from "../../graphql/mutations";
import {
  RequestDocumentsInputs,
  RequestDocumentsOutputs,
  GET_DOCUMENTS,
} from "../../graphql/queries";
import { DocumentType } from "../../types/graphql-api";
import { FileUploadPackageProps } from "../widgets/modals/DocumentUploadModal";
import { openedDocument } from "../../graphql/cache";

const ViewToggleContainer = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 100; /* Increased z-index to ensure it's above grid */
`;

const ViewToggleButton = styled(Button)`
  &&& {
    background: white;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

    &:hover {
      background: #f8fafc;
    }
  }
`;

export const CorpusDocumentCards = ({
  opened_corpus_id,
}: {
  opened_corpus_id: string | null;
}) => {
  const [viewMode, setViewMode] = useState<"cards" | "grid">("cards");
  /**
   * Similar to AnnotationCorpusCards, this component wraps the DocumentCards component
   * (which is a pure rendering component) with some query logic for a given corpus_id.
   * If the corpus_id is passed in, it will query and display the documents for
   * that corpus and let you browse them.
   */

  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const selected_metadata_id_to_filter_on = useReactiveVar(
    selectedMetaAnnotationId
  );

  const auth_token = useReactiveVar(authToken);
  const filter_to_label_id = useReactiveVar(filterToLabelId);

  const location = useLocation();
  const navigate = useNavigate();

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup document queries and mutations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Note: openedCorpus is set by CentralRouteManager when on /c/:user/:corpus route
  // This component just reads it for context (e.g., file uploads)

  const {
    refetch: refetchDocuments,
    loading: documents_loading,
    error: documents_error,
    data: documents_response,
    fetchMore: fetchMoreDocuments,
  } = useQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(GET_DOCUMENTS, {
    variables: {
      ...(opened_corpus_id
        ? {
            annotateDocLabels: true,
            inCorpusWithId: opened_corpus_id,
            includeMetadata: true,
          }
        : { annotateDocLabels: false, includeMetadata: false }),
      ...(selected_metadata_id_to_filter_on
        ? { hasAnnotationsWithIds: selected_metadata_id_to_filter_on }
        : {}),
      ...(filter_to_label_id ? { hasLabelWithId: filter_to_label_id } : {}),
      ...(document_search_term ? { textSearch: document_search_term } : {}),
    },
    notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
  });
  if (documents_error) {
    toast.error("ERROR\nCould not fetch documents for corpus.");
  }

  // REMOVED: All manual refetch effects
  // useQuery automatically refetches when variables change (document_search_term,
  // selected_metadata_id_to_filter_on, filter_to_label_id, opened_corpus_id)
  // These manual refetches were causing excessive server requests

  const [removeDocumentsFromCorpus, {}] = useMutation<
    RemoveDocumentsFromCorpusOutputs,
    RemoveDocumentsFromCorpusInputs
  >(REMOVE_DOCUMENTS_FROM_CORPUS, {
    onCompleted: () => {
      refetchDocuments();
    },
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const document_data = documents_response?.documents?.edges
    ? documents_response.documents.edges
    : [];
  const document_items = document_data
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is DocumentType => !!item);

  const handleRemoveContracts = (delete_ids: string[]) => {
    removeDocumentsFromCorpus({
      variables: {
        corpusId: opened_corpus_id ? opened_corpus_id : "",
        documentIdsToRemove: delete_ids,
      },
    })
      .then(() => {
        selectedDocumentIds([]);
        toast.success("SUCCESS! Contracts removed.");
      })
      .catch(() => {
        selectedDocumentIds([]);
        toast.error("ERROR! Contract removal failed.");
      });
  };

  const onSelect = (document: DocumentType) => {
    // console.log("On selected document", document);
    if (selected_document_ids.includes(document.id)) {
      // console.log("Already selected... deselect")
      const values = selected_document_ids.filter((id) => id !== document.id);
      // console.log("Filtered values", values);
      selectedDocumentIds(values);
    } else {
      selectedDocumentIds([...selected_document_ids, document.id]);
    }
    // console.log("selected doc ids", selected_document_ids);
  };

  const onOpen = (document: DocumentType) => {
    // Use smart navigation utility to prefer slugs and prevent redirects
    const corpusData = opened_corpus_id ? openedCorpus() : null;
    navigateToDocument(
      document as any,
      corpusData as any,
      navigate,
      window.location.pathname
    );
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filePackages: FileUploadPackageProps[] = acceptedFiles.map(
      (file) => ({
        file,
        formData: {
          title: file.name,
          description: `Content summary for ${file.name}`,
        },
      })
    );
    showUploadNewDocumentsModal(true);
    uploadModalPreloadedFiles(filePackages);
  }, []);

  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        width: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ViewToggleContainer>
        <Button.Group>
          <Popup
            content="Card View"
            trigger={
              <ViewToggleButton
                icon="grid layout"
                active={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                data-testid="card-view-button"
              />
            }
          />
          <Popup
            content="Metadata Grid View"
            trigger={
              <ViewToggleButton
                icon="table"
                active={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                data-testid="grid-view-button"
              />
            }
          />
        </Button.Group>
      </ViewToggleContainer>

      <div
        id="corpus-document-card-content-container"
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {viewMode === "cards" ? (
          <DocumentCards
            items={document_items}
            loading={documents_loading}
            loading_message="Documents Loading..."
            pageInfo={documents_response?.documents.pageInfo}
            containerStyle={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              paddingTop: "3.5rem", // Add padding to prevent overlap with view toggle buttons
            }}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
            fetchMore={fetchMoreDocuments}
            onShiftClick={onSelect}
            onClick={onOpen}
            removeFromCorpus={
              opened_corpus_id ? handleRemoveContracts : undefined
            }
            onDrop={onDrop}
          />
        ) : (
          <div
            style={{
              paddingTop: "3.5rem",
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <DocumentMetadataGrid
              corpusId={opened_corpus_id || ""}
              documents={document_items}
              loading={documents_loading}
              onDocumentClick={onOpen}
              pageInfo={documents_response?.documents.pageInfo}
              fetchMore={fetchMoreDocuments}
              hasMore={
                documents_response?.documents.pageInfo?.hasNextPage ?? false
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};
