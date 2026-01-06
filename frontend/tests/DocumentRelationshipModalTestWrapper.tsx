import React, { useEffect } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider, useSetAtom } from "jotai";
import { relayStylePagination } from "@apollo/client/utilities";
import { DocumentRelationshipModal } from "../src/components/documents/DocumentRelationshipModal";
import { GET_DOCUMENTS } from "../src/graphql/queries";
import { openedCorpus } from "../src/graphql/cache";
import { corpusStateAtom } from "../src/components/annotator/context/CorpusAtom";
import { DOCUMENT_PICKER_SEARCH_LIMIT } from "../src/assets/configurations/constants";

// Test corpus ID
const TEST_CORPUS_ID = "corpus-1";

// Mock corpus for corpus state
const mockCorpus = {
  id: TEST_CORPUS_ID,
  slug: "test-corpus",
  title: "Test Corpus",
  isPublic: false,
  creator: { id: "user-1", slug: "test-user" },
  labelSet: {
    id: "labelset-1",
    title: "Test Labelset",
    allAnnotationLabels: [],
  },
};

// Mock documents for source and target
const mockDocuments = [
  {
    node: {
      id: "doc-1",
      title: "Source Document 1",
      description: "First source document",
      icon: null,
      slug: "source-document-1",
      pdfFile: "/files/doc1.pdf",
      fileType: "pdf",
      pageCount: 10,
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      isPublic: false,
      myPermissions: ["read"],
      creator: { id: "user-1", slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-2",
      title: "Target Document 1",
      description: "First target document",
      icon: null,
      slug: "target-document-1",
      pdfFile: "/files/doc2.pdf",
      fileType: "pdf",
      pageCount: 5,
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      isPublic: false,
      myPermissions: ["read"],
      creator: { id: "user-1", slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
  {
    node: {
      id: "doc-3",
      title: "Target Document 2",
      description: "Second target document",
      icon: null,
      slug: "target-document-2",
      pdfFile: "/files/doc3.pdf",
      fileType: "pdf",
      pageCount: 8,
      created: "2025-01-01T00:00:00Z",
      modified: "2025-01-01T00:00:00Z",
      isPublic: false,
      myPermissions: ["read"],
      creator: { id: "user-1", slug: "test-user" },
      __typename: "DocumentType",
    },
    __typename: "DocumentTypeEdge",
  },
];

// Cache configuration
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          documents: relayStylePagination(),
        },
      },
      DocumentType: {
        keyFields: ["id"],
      },
    },
  });

interface Props {
  open?: boolean;
  onClose?: () => void;
  initialSourceIds?: string[];
  initialTargetIds?: string[];
}

// Inner component that sets up Jotai atoms
const ModalWithState: React.FC<Props> = ({
  open = true,
  onClose = () => {},
  initialSourceIds = ["doc-1"],
  initialTargetIds = [],
}) => {
  const setCorpusState = useSetAtom(corpusStateAtom);

  useEffect(() => {
    // Set up corpus state using the atom
    openedCorpus(mockCorpus as any);
    setCorpusState({
      selectedCorpus: mockCorpus as any,
      spanLabels: [],
      relationLabels: [],
      docTypeLabels: [],
      selectedLabelSet: mockCorpus.labelSet as any,
    });

    return () => {
      openedCorpus(null);
    };
  }, [setCorpusState]);

  return (
    <DocumentRelationshipModal
      open={open}
      onClose={onClose}
      corpusId={TEST_CORPUS_ID}
      initialSourceIds={initialSourceIds}
      initialTargetIds={initialTargetIds}
      onSuccess={() => {}}
    />
  );
};

export const DocumentRelationshipModalTestWrapper: React.FC<Props> = (
  props
) => {
  // Build mocks
  const getMocks = (): MockedResponse[] => {
    return [
      // Document query mock - initial query with empty debounced search term
      {
        request: {
          query: GET_DOCUMENTS,
          variables: {
            inCorpusWithId: TEST_CORPUS_ID,
            textSearch: undefined,
            limit: DOCUMENT_PICKER_SEARCH_LIMIT,
            annotateDocLabels: false,
            includeMetadata: false,
          },
        },
        result: {
          data: {
            documents: {
              edges: mockDocuments,
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
      // Duplicate for refetch or debounce cycle
      {
        request: {
          query: GET_DOCUMENTS,
          variables: {
            inCorpusWithId: TEST_CORPUS_ID,
            textSearch: undefined,
            limit: DOCUMENT_PICKER_SEARCH_LIMIT,
            annotateDocLabels: false,
            includeMetadata: false,
          },
        },
        result: {
          data: {
            documents: {
              edges: mockDocuments,
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
    ];
  };

  return (
    <Provider>
      <MockedProvider mocks={getMocks()} cache={createTestCache()} addTypename>
        <ModalWithState {...props} />
      </MockedProvider>
    </Provider>
  );
};
