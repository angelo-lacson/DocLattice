import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { Provider as JotaiProvider } from "jotai";
import { ToastContainer } from "react-toastify";
import { CorpusDescriptionEditor } from "../src/components/corpuses/CorpusDescriptionEditor";

interface Props {
  mocks: ReadonlyArray<MockedResponse>;
  corpusId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onUpdate?: () => void;
}

/**
 * Wrapper for CorpusDescriptionEditor CT tests.
 *
 * The component:
 *  - Fires GET_CORPUS_WITH_HISTORY when `isOpen` is true.
 *  - Calls `fetch(corpus.mdDescription)` once data loads – tests must
 *    intercept that URL with `page.route` before mounting.
 *  - Fires UPDATE_CORPUS_DESCRIPTION on save / reapply, then refetches.
 */
export const CorpusDescriptionEditorTestWrapper: React.FC<Props> = ({
  mocks,
  corpusId,
  isOpen = true,
  onClose = () => {},
  onUpdate = () => {},
}) => {
  return (
    <JotaiProvider>
      <MockedProvider mocks={mocks} addTypename={false}>
        <div style={{ width: "100vw", height: "100vh" }}>
          <CorpusDescriptionEditor
            corpusId={corpusId}
            isOpen={isOpen}
            onClose={onClose}
            onUpdate={onUpdate}
          />
          <ToastContainer />
        </div>
      </MockedProvider>
    </JotaiProvider>
  );
};
