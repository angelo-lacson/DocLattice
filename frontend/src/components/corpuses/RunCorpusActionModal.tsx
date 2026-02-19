import React, { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button, Dropdown, Modal } from "semantic-ui-react";
import { toast } from "react-toastify";

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

  const { data: docsData, loading: docsLoading } =
    useQuery<GetCorpusDocumentsForTocOutput>(GET_CORPUS_DOCUMENTS_FOR_TOC, {
      variables: { corpusId, first: 100 },
      skip: !open,
    });

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
