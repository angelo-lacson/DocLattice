import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { Provider as JotaiProvider } from "jotai";
import { ToastContainer } from "react-toastify";
import { CorpusAgentManagement } from "../src/components/corpuses/CorpusAgentManagement";

interface Props {
  mocks: ReadonlyArray<MockedResponse>;
  corpusId: string;
  canUpdate?: boolean;
}

/**
 * Wrapper for CorpusAgentManagement CT tests.
 *
 * The component fetches GET_CORPUS_AGENTS and GET_AVAILABLE_TOOLS on mount;
 * `canUpdate=false` short-circuits to a permissioning notice and skips both.
 */
export const CorpusAgentManagementTestWrapper: React.FC<Props> = ({
  mocks,
  corpusId,
  canUpdate = true,
}) => {
  return (
    <JotaiProvider>
      <MockedProvider mocks={mocks} addTypename={false}>
        <div style={{ width: "100vw", padding: 16 }}>
          <CorpusAgentManagement corpusId={corpusId} canUpdate={canUpdate} />
          <ToastContainer />
        </div>
      </MockedProvider>
    </JotaiProvider>
  );
};
