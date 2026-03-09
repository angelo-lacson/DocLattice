import React from "react";
import { Provider as JotaiProvider } from "jotai";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { RelationshipActionModal } from "../src/components/knowledge_base/document/unified_feed/RelationshipActionModal";
import { RelationGroup } from "../src/components/annotator/types/annotations";

export const RelationshipActionModalTestWrapper: React.FC<{
  open?: boolean;
  mocks?: MockedResponse[];
  selectedAnnotationIds?: string[];
  existingRelationships?: RelationGroup[];
  annotations?: Array<{ id: string; rawText?: string }>;
}> = ({
  open = true,
  mocks = [],
  selectedAnnotationIds = ["ann-1", "ann-2"],
  existingRelationships = [],
  annotations = [
    { id: "ann-1", rawText: "First annotation text" },
    { id: "ann-2", rawText: "Second annotation text" },
  ],
}) => (
  <JotaiProvider>
    <MockedProvider mocks={mocks} addTypename={false}>
      <RelationshipActionModal
        open={open}
        onClose={() => {}}
        selectedAnnotationIds={selectedAnnotationIds}
        existingRelationships={existingRelationships}
        corpusId="corpus-1"
        documentId="doc-1"
        annotations={annotations}
        onAddToExisting={async () => {}}
        onCreate={async () => {}}
      />
    </MockedProvider>
  </JotaiProvider>
);
