import React, { useEffect, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button, Dropdown, Modal } from "semantic-ui-react";
import { toast } from "react-toastify";

import { CORPUS_DOCUMENTS_TOC_LIMIT } from "../../assets/configurations/constants";
import {
  GET_CORPUS_DOCUMENTS_FOR_TOC,
  GetCorpusDocumentsForTocOutput,
} from "../../graphql/queries";
import {
  RUN_CORPUS_ACTION,
  RunCorpusActionInput,
  RunCorpusActionOutput,
} from "../../graphql/mutations";

interface RunCorpusActionModalProps {
  open: boolean;
  corpusId: string;
  actionId: string;
  actionName: string;
  onClose: () => void;
}

export const RunCorpusActionModal: React.FC<RunCorpusActionModalProps> = ({
  open,
  corpusId,
  actionId,
  actionName,
  onClose,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Reset document selection when the action changes (e.g. modal reopened
  // for a different action without unmounting).
  useEffect(() => {
    setSelectedDocId(null);
  }, [actionId]);

  const {
    data: docsData,
    loading: docsLoading,
    error: docsError,
  } = useQuery<GetCorpusDocumentsForTocOutput>(GET_CORPUS_DOCUMENTS_FOR_TOC, {
    variables: { corpusId, first: CORPUS_DOCUMENTS_TOC_LIMIT },
    skip: !open,
  });

  const totalCount = docsData?.documents?.totalCount ?? 0;
  const isLimitExceeded = totalCount > CORPUS_DOCUMENTS_TOC_LIMIT;

  const [runAction, { loading: running }] = useMutation<
    RunCorpusActionOutput,
    RunCorpusActionInput
  >(RUN_CORPUS_ACTION);

  const documentOptions =
    docsData?.documents?.edges?.map(({ node }) => ({
      key: node.id,
      value: node.id,
      text: node.title,
    })) ?? [];

  const handleRun = async () => {
    if (!selectedDocId) return;
    try {
      const { data } = await runAction({
        variables: { corpusActionId: actionId, documentId: selectedDocId },
      });
      if (data?.runCorpusAction?.ok) {
        toast.success("Action queued. Check the execution trail for results.");
        handleClose();
      } else {
        toast.error(
          data?.runCorpusAction?.message ?? "Failed to queue action."
        );
      }
    } catch {
      toast.error("Failed to queue action.");
    }
  };

  const handleClose = () => {
    setSelectedDocId(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} size="tiny">
      <Modal.Header>Run: {actionName}</Modal.Header>
      <Modal.Content>
        <p>Select a document to run this action against:</p>
        {docsError && (
          <div
            style={{
              padding: "0.75rem 1rem",
              border: "1px solid #fca5a5",
              borderRadius: "8px",
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
              Failed to load documents
            </div>
            <p>Please try again or check your permissions for this corpus.</p>
          </div>
        )}
        <Dropdown
          placeholder="Select document..."
          fluid
          search
          selection
          loading={docsLoading}
          options={documentOptions}
          value={selectedDocId ?? undefined}
          onChange={(_, { value }) => setSelectedDocId(value as string)}
        />
        {isLimitExceeded && (
          <div
            style={{
              padding: "0.75rem 1rem",
              border: "1px solid #93c5fd",
              borderRadius: "8px",
              background: "#eff6ff",
              color: "#1e40af",
              fontSize: "0.875rem",
            }}
          >
            Showing first {CORPUS_DOCUMENTS_TOC_LIMIT} of {totalCount}{" "}
            documents. Use the search box above to filter.
          </div>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          primary
          loading={running}
          disabled={!selectedDocId || running}
          onClick={handleRun}
        >
          Run
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
