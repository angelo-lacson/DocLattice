/**
 * Test wrapper for `FieldsetModal` Playwright CT tests.
 *
 * Playwright CT's babel plugin treats this file as a component module — all
 * exports here must be React components. Mock builders live in a sibling
 * `FieldsetModalMocks.ts` so the plugin still recognizes
 * `FieldsetModalTestWrapper` as a mountable component.
 */
import React, { useState } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { FieldsetModal } from "../src/components/widgets/modals/FieldsetModal";
import { GET_REGISTERED_EXTRACT_TASKS } from "../src/graphql/queries";
import { FieldsetType } from "../src/types/graphql-api";

const extractTasksMock: MockedResponse = {
  request: { query: GET_REGISTERED_EXTRACT_TASKS },
  result: {
    data: {
      registeredExtractTasks: {
        "opencontractserver.tasks.data_extract_tasks.doc_extract_query_task":
          "Extract structured data using LLM queries",
      },
    },
  },
};

const defaultTaskMocks: MockedResponse[] = Array.from({ length: 6 }, () => ({
  ...extractTasksMock,
}));

interface WrapperProps {
  startOpen?: boolean;
  mode?: "create" | "edit";
  existingFieldset?: FieldsetType | null;
  mocks?: MockedResponse[];
}

export const FieldsetModalTestWrapper: React.FC<WrapperProps> = ({
  startOpen = true,
  mode = "create",
  existingFieldset = null,
  mocks,
}) => {
  const [open, setOpen] = useState(startOpen);
  const [successPayload, setSuccessPayload] = useState<string>("");

  const effectiveMocks = mocks ?? defaultTaskMocks;

  return (
    <MockedProvider mocks={effectiveMocks} addTypename={false}>
      <div style={{ padding: 24 }}>
        <button onClick={() => setOpen(true)} data-testid="open-fieldset-modal">
          Open Fieldset Modal
        </button>
        <FieldsetModal
          open={open}
          mode={mode}
          existingFieldset={existingFieldset}
          onClose={() => setOpen(false)}
          onSuccess={(fs) => {
            setSuccessPayload(JSON.stringify(fs));
            setOpen(false);
          }}
        />
        <span
          data-testid="success-payload"
          style={{ position: "absolute", left: -9999 }}
        >
          {successPayload}
        </span>
      </div>
    </MockedProvider>
  );
};
