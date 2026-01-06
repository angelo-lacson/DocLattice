import { IdGetter, InMemoryCache, makeVar } from "@apollo/client";
import { persistentVar } from "../utils/persistentVar";
import {
  FieldPolicy,
  KeySpecifier,
} from "@apollo/client/cache/inmemory/policies";
import { Reference, relayStylePagination } from "@apollo/client/utilities";
import { User } from "@auth0/auth0-react";
import { FieldNode } from "graphql";
import _ from "lodash";
import {
  ServerAnnotationType,
  CorpusType,
  DocumentType,
  LabelSetType,
  LabelDisplayBehavior,
  AnalysisType,
  ExtractType,
  FieldsetType,
  ColumnType,
  ConversationType,
  LabelType,
  UserType,
} from "../types/graphql-api";
import { ViewState } from "../components/types";
import { FileUploadPackageProps } from "../components/widgets/modals/DocumentUploadModal";

export const mergeArrayByIdFieldPolicy: FieldPolicy<Reference[]> = {
  // eslint-disable-next-line @typescript-eslint/default-param-last
  merge: (existing = [], incoming = [], { readField, mergeObjects }) => {
    const merged = [...incoming];
    const existingIds = existing.map((item) => readField<string>("id", item));

    merged.forEach((item, index) => {
      const itemId = readField<string>("id", item);
      const existingIndex = existingIds.findIndex((id) => id === itemId);
      if (existingIndex !== -1) {
        merged[index] = mergeObjects(existing[existingIndex], merged[index]);
      }
    });
    return merged;
  },
};

/**
 * Apollo Client is magical, but it's not all-knowing. When you use aliases for the same (or similar) queries,
 * apollo isn't smart enough to keep separate caches with separate lists of edges and, most crucially, pageInfo objs.
 * This messes up infinite scroll for batched, aliased queries. One workaround is to use an @connection directive (
 * which doesn't appear to be supported by Graphene?), another is to use a keyArgs (https://www.apollographql.com/docs/react/pagination/key-args/).
 * which tells Apollo to maintain separate caches based on certain filter vars. Finally, where we don't have a keyArgs
 * to filter by (or don't want to use one), it's possible to use a KeyArgsFunc that is capable of creating different caches
 * for aliased fields: https://github.com/apollographql/apollo-client/issues/7540
 * @param args
 * @param context
 * @returns
 */
const ContextAwareRelayStylePaginationKeyArgsFunction = (
  args: Record<string, any> | null,
  context: {
    typename: string;
    fieldName: string;
    field: FieldNode | null;
    variables?: Record<string, any>;
  }
): KeySpecifier | false | ReturnType<IdGetter> => {
  return `${context.field?.alias || context.fieldName}`;
};

// See proper setup here:
// https://www.apollographql.com/docs/react/local-state/managing-state-with-field-policies/
export const cache = new InMemoryCache({
  typePolicies: {
    PageAwareAnnotationType: {
      fields: {
        pageAnnotations: {
          keyArgs: ["documentId", "corpusId", "forAnalysisIds", "labelType"],
        },
      },
    },
    DocumentType: {
      fields: {
        // Field policy map for the Document type
        is_selected: {
          // Field policy for the isSelected field
          read(val, { readField }) {
            // The read function for the isSelected field
            return Boolean(_.includes(selectedDocumentIds(), readField("id")));
          },
        },
        is_open: {
          read(val, { readField }) {
            return openedDocument() && openedDocument()?.id === readField("id");
          },
        },
        // Version history fields - cache separately to enable lazy loading
        versionHistory: {
          // Don't merge with existing data, replace entirely
          merge: false,
        },
        pathHistory: {
          // Key by corpusId since path history is corpus-specific
          keyArgs: ["corpusId"],
          merge: false,
        },
        // Version metadata fields with corpus context
        versionNumber: {
          keyArgs: ["corpusId"],
        },
        lastModified: {
          keyArgs: ["corpusId"],
        },
        canRestore: {
          keyArgs: ["corpusId"],
        },
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        // Without these, Apollo creates new object references on every query,
        // triggering cache updates and infinite re-renders
        assignmentSet: relayStylePagination(),
        corpusSet: relayStylePagination(),
        annotationSet: relayStylePagination(),
        docLabelAnnotations: relayStylePagination(),
        metadataAnnotations: relayStylePagination(),
        conversations: relayStylePagination(),
        chatMessages: relayStylePagination(),
      },
    },
    CorpusType: {
      fields: {
        is_selected: {
          // Field policy for the isSelected field
          read(val, { readField }) {
            // The read function for the isSelected field
            return Boolean(_.includes(selectedCorpusIds(), readField("id")));
          },
        },
        is_open: {
          read(val, { readField }) {
            return openedCorpus() && openedCorpus()?.id === readField("id");
          },
        },
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        // Without these, Apollo creates new object references on every query,
        // triggering cache updates and infinite re-renders
        documents: relayStylePagination(),
        assignmentSet: relayStylePagination(),
        relationshipSet: relayStylePagination(),
        annotations: relayStylePagination(),
        analyses: relayStylePagination(),
        conversations: relayStylePagination(),
      },
    },
    LabelSetType: {
      fields: {
        is_selected: {
          // Field policy for the isSelected field
          read(val, { readField }) {
            // The read function for the isSelected field
            return Boolean(_.includes(selectedLabelsetIds(), readField("id")));
          },
        },
        is_open: {
          read(val, { readField }) {
            return openedLabelset() && openedLabelset()?.id === readField("id");
          },
        },
      },
    },
    AnalysisType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        analyzedDocuments: relayStylePagination(),
        annotations: relayStylePagination(),
      },
    },
    ServerAnnotationType: {
      fields: {
        userFeedback: mergeArrayByIdFieldPolicy,
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        created_by_analyses: relayStylePagination(),
        assignmentSet: relayStylePagination(),
        sourceNodeInRelationships: relayStylePagination(),
        targetNodeInRelationships: relayStylePagination(),
        chatMessages: relayStylePagination(),
        createdByChatMessage: relayStylePagination(),
      },
    },
    RelationshipLabelType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        sourceAnnotations: relayStylePagination(),
        targetAnnotations: relayStylePagination(),
        assignmentSet: relayStylePagination(),
      },
    },
    UserType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        createdAssignments: relayStylePagination(),
        myAssignments: relayStylePagination(),
        userexportSet: relayStylePagination(),
        userimportSet: relayStylePagination(),
        editingDocuments: relayStylePagination(),
        documentSet: relayStylePagination(),
        corpusSet: relayStylePagination(),
        editingCorpuses: relayStylePagination(),
        labelSet: relayStylePagination(),
        relationshipSet: relayStylePagination(),
        annotationSet: relayStylePagination(),
        labelsetSet: relayStylePagination(),
      },
    },
    FieldsetType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        annotationlabelSet: relayStylePagination(),
        relationshipSet: relayStylePagination(),
        labelsetSet: relayStylePagination(),
        analysisSet: relayStylePagination(),
      },
    },
    ExtractType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        extractedDatacells: relayStylePagination(),
      },
    },
    ConversationType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        chatMessages: relayStylePagination(),
      },
    },
    DocumentRelationshipType: {
      keyFields: ["id"],
      fields: {
        // Define field policies if necessary
      },
    },
    ChatMessageType: {
      fields: {
        // CRITICAL: Handle all Connection types properly to prevent infinite loops
        sourceAnnotations: relayStylePagination(),
        createdAnnotations: relayStylePagination(),
      },
    },
    UserFeedbackType: {
      fields: {
        // You can add specific field policies for UserFeedbackType if needed
      },
    },
    Query: {
      fields: {
        annotations: relayStylePagination(
          ContextAwareRelayStylePaginationKeyArgsFunction
        ),
        userFeedback: relayStylePagination(),
        pageAnnotations: {
          keyArgs: [
            "pdfPageInfo",
            ["labelType", "documentId", "corpusId", "forAnalysisIds"],
          ],
          merge: true,
        },
        // CRITICAL: Specify keyArgs to isolate cache entries by folder/corpus/search
        // Without this, refetchQueries pollutes cache across different filter contexts
        documents: relayStylePagination([
          "inCorpusWithId",
          "inFolderId",
          "textSearch",
          "hasLabelWithId",
          "hasAnnotationsWithIds",
        ]),
        corpuses: relayStylePagination(),
        userexports: relayStylePagination(),
        labelsets: relayStylePagination(),
        annotationLabels: relayStylePagination(),
        relationshipLabels: relayStylePagination(),
        extracts: relayStylePagination(),
        columns: relayStylePagination(),
        // Document relationships - cache by corpus/document context
        documentRelationships: relayStylePagination(["corpusId", "documentId"]),
        // Slug resolution queries - cache by input parameters
        userBySlug: {
          keyArgs: ["slug"],
        },
        corpusBySlugs: {
          keyArgs: ["userSlug", "corpusSlug"],
        },
        documentBySlugs: {
          keyArgs: ["userSlug", "documentSlug"],
        },
        documentInCorpusBySlugs: {
          keyArgs: ["userSlug", "corpusSlug", "documentSlug"],
        },
        resolveCorpus: {
          keyArgs: ["userIdent", "corpusIdent"],
        },
        resolveDocument: {
          keyArgs: ["userIdent", "documentIdent", "corpusIdent"],
        },
      },
    },
    DatacellType: {
      keyFields: ["id"],
      fields: {
        // Define field policies if necessary
      },
    },
  },
});

/**
 * Global GUI State / Variables
 */
/**
 * Routing state - managed by CentralRouteManager
 */
export const routeLoading = makeVar<boolean>(false);
export const routeError = makeVar<Error | null>(null);

// Cookie consent modal reactive variable.
// Initialized to `false`; the App component decides at runtime whether to
// show the modal based on the browser's localStorage state.
export const showCookieAcceptModal = makeVar<boolean>(false);
export const showAddDocsToCorpusModal = makeVar<boolean>(false);
export const showRemoveDocsFromCorpusModal = makeVar<boolean>(false);
export const showUploadNewDocumentsModal = makeVar<boolean>(false);
export const showDeleteDocumentsModal = makeVar<boolean>(false);
export const showNewLabelsetModal = makeVar<boolean>(false);
export const showExportModal = makeVar<boolean>(false);
export const showUserSettingsModal = makeVar<boolean>(false);
export const showGlobalSettingsModal = makeVar<boolean>(false);
export const showKnowledgeBaseModal = persistentVar<{
  isOpen: boolean;
  documentId: string | null;
  corpusId: string | null;
  /** Pre-selected annotation IDs to seed selectedAnnotationsAtom */
  annotationIds?: string[] | null;
}>("oc_kbModal", {
  isOpen: false,
  documentId: null,
  corpusId: null,
  annotationIds: null,
});
// if this is true, only render the currently selected annotation.
export const showSelectedAnnotationOnly = makeVar<boolean>(true);
// if this is false, don't render <SelectionBoundary> elements so you only see tokens. Cleaner for complex annotations.
export const showAnnotationBoundingBoxes = makeVar<boolean>(false);
// Show Labels toggle (if false, don't show labels)
export const showAnnotationLabels = makeVar<LabelDisplayBehavior>(
  LabelDisplayBehavior.ON_HOVER
);
export const pagesVisible = makeVar<Record<number, string>>({});
export const showDeleteExtractModal = makeVar<boolean>(false);
export const showCreateExtractModal = makeVar<boolean>(false);
export const showQueryViewState = makeVar<"ASK" | "VIEW" | "DETAILS">("ASK");
export const showSelectCorpusAnalyzerOrFieldsetModal = makeVar<boolean>(false);

export const viewStateVar = makeVar<ViewState>(ViewState.LOADING);
export const editMode = makeVar<"ANNOTATE" | "ANALYZE">("ANNOTATE");
export const allowUserInput = makeVar<boolean>(false);

/**
 *  Document-related global variables.
 */
export const documentSearchTerm = makeVar<string>("");
export const openedDocument = makeVar<DocumentType | null>(null);
export const selectedDocumentIds = makeVar<string[]>([]);
export const viewingDocument = makeVar<DocumentType | null>(null);
export const editingDocument = makeVar<DocumentType | null>(null);

/**
 * Document relationship modal state.
 * Used to trigger the link documents modal from various entry points:
 * - Right-click context menu on a single document
 * - Drag and drop one document onto another
 * - Multi-select + click "Link Documents" button
 */
export interface LinkDocumentsModalState {
  open: boolean;
  initialSourceIds: string[];
  initialTargetIds: string[];
}
export const linkDocumentsModalState = makeVar<LinkDocumentsModalState>({
  open: false,
  initialSourceIds: [],
  initialTargetIds: [],
});

/**
 * Extract-related global variables
 *
 * ENTITY STATE:
 *   openedExtract - Extract resolved from /extracts/:extractId route
 *   Set by: CentralRouteManager OR route components (ExtractDetailRoute)
 *
 * URL-DRIVEN STATE:
 *   selectedExtractIds - Controlled by URL query parameter ?extract=
 *   Set by: CentralRouteManager Phase 2
 *
 * Write access is restricted to:
 *   - CentralRouteManager (for legacy /e/:user/:extractId routes)
 *   - Route components like ExtractDetailRoute (for new /extracts/:extractId routes)
 *
 * All other components must:
 *   - ONLY READ via useReactiveVar()
 *   - UPDATE STATE via navigate() to change the URL (which triggers route resolution)
 *
 * Examples:
 *   /extracts/extract-123             → openedExtract(extractObj) via ExtractDetailRoute
 *   /e/user/extract-123               → openedExtract(extractObj) via CentralRouteManager
 *   /c/user/corpus?extract=456        → selectedExtractIds(["456"])
 *   /d/user/doc?extract=456,789       → selectedExtractIds(["456", "789"])
 */
export const openedExtract = makeVar<ExtractType | null>(null); // ENTITY STATE - set by route components
export const selectedExtractIds = makeVar<string[]>([]); // URL-DRIVEN - set by CentralRouteManager Phase 2
export const selectedExtract = makeVar<ExtractType | null>(null); // Legacy - kept for backward compatibility
export const extractSearchTerm = makeVar<string>("");

/**
 * Corpus-related global variables
 */
export const corpusSearchTerm = makeVar<string>("");
export const filterToCorpus = makeVar<CorpusType | null>(null);
export const selectedCorpus = makeVar<CorpusType | null>(null);
export const openedCorpus = makeVar<CorpusType | null>(null);
export const viewingCorpus = makeVar<CorpusType | null>(null);
export const deletingCorpus = makeVar<CorpusType | null>(null);
export const editingCorpus = makeVar<CorpusType | null>(null);
export const exportingCorpus = makeVar<CorpusType | null>(null);
export const selectedCorpusIds = makeVar<string[]>([]);
export const showAnalyzerSelectionForCorpus = makeVar<CorpusType | null>(null);
export const showCorpusActionOutputs = makeVar<boolean>(true);

/**
 * LabelSet-related global variables
 */
export const labelsetSearchTerm = makeVar<string>("");
export const filterToLabelsetId = makeVar<string | null>(null);
export const openedLabelset = makeVar<LabelSetType | null>(null);
export const deletingLabelset = makeVar<LabelSetType | null>(null);
export const editingLabelset = makeVar<LabelSetType | null>(null); // Not used elsewhere. Maybe should be?
export const selectedLabelsetIds = makeVar<string[]>([]);

/**
 * Annotation-related global variables
 */
export const filterToAnnotationType = makeVar<LabelType | null>(null);
export const filterToLabelId = makeVar<string>("");
export const filterToAnnotationLabelId = makeVar<string>(""); // Not used elsewhere. Maybe should be?
export const selectedAnnotation = makeVar<ServerAnnotationType | null>(null);
export const showStructuralAnnotations = makeVar<boolean>(false);
export const filterToStructuralAnnotations = makeVar<
  "ONLY" | "EXCLUDE" | "INCLUDE"
>("EXCLUDE");
export const displayAnnotationOnAnnotatorLoad = makeVar<
  ServerAnnotationType | undefined
>(undefined);
export const onlyDisplayTheseAnnotations = makeVar<
  ServerAnnotationType[] | undefined
>(undefined);
export const annotationContentSearchTerm = makeVar<string>("");
export const selectedMetaAnnotationId = makeVar<string>("");
export const includeStructuralAnnotations = makeVar<boolean>(false); // These are weird as they don't have a labelset and user probably doesn't want to see them.
export const selectedAnnotationIds = makeVar<string[]>([]);

/**
 * Analyzer-related global variables
 */
export const analyzerSearchTerm = makeVar<string | null>(null);

/**
 * Analysis-related global variables
 *
 * URL-DRIVEN STATE: selectedAnalysesIds is controlled by URL query parameter ?analysis=
 * Examples:
 *   /c/user/corpus?analysis=123       → selectedAnalysesIds(["123"])
 *   /d/user/doc?analysis=123,456      → selectedAnalysesIds(["123", "456"])
 */
export const selectedAnalysesIds = makeVar<string[]>([]); // PRIMARY - URL-driven
export const selectedAnalysis = makeVar<AnalysisType | null>(null); // Legacy - kept for backward compatibility
export const selectedAnalyses = makeVar<AnalysisType[]>([]); // Legacy - kept for backward compatibility
export const analysisSearchTerm = makeVar<string>("");

/**
 * Export-related global variables
 */
export const exportSearchTerm = makeVar<string>("");
export const selectedFieldset = makeVar<FieldsetType | null>(null);
export const editingExtract = makeVar<ExtractType | null>(null);
export const addingColumnToExtract = makeVar<ExtractType | null>(null);
export const editingColumnForExtract = makeVar<ColumnType | null>(null);

/**
 * Thread/Discussion-related global variables
 *
 * ENTITY STATE (set by CentralRouteManager Phase 1):
 * openedThread - The full thread entity for thread routes (/c/user/corpus/discussions/thread-id)
 *
 * URL-DRIVEN STATE (set by CentralRouteManager Phase 2):
 * selectedThreadId - Controlled by URL query parameter ?thread= for sidebar thread selection
 *
 * Examples:
 *   /c/user/corpus/discussions/thread-123  → openedThread(ThreadEntity), openedCorpus(CorpusEntity)
 *   /c/user/corpus?thread=thread-456       → selectedThreadId("thread-456") (sidebar)
 *   /d/user/doc?thread=thread-789          → selectedThreadId("thread-789") (sidebar)
 */
export const openedThread = makeVar<ConversationType | null>(null);
export const selectedThreadId = makeVar<string | null>(null);

/**
 * Folder navigation (URL-driven state - set by CentralRouteManager Phase 2)
 *
 * Tracks currently selected folder within a corpus for document filtering.
 * - null: viewing corpus root (all documents)
 * - string: viewing specific folder (filtered documents)
 *
 * URL Examples:
 *   /c/user/corpus                    → selectedFolderId(null)
 *   /c/user/corpus?folder=folder-123  → selectedFolderId("folder-123")
 */
export const selectedFolderId = makeVar<string | null>(null);

/**
 * Tab state (URL-driven state - set by CentralRouteManager Phase 2)
 *
 * Tracks currently selected tab/view within corpus or document pages.
 * Tab IDs are string-based to allow flexibility across different views.
 *
 * Corpus tab IDs: "home" | "documents" | "annotations" | "analyses" | "extracts" | "discussions" | "analytics" | "settings" | "badges"
 * Document sidebar tab IDs: "chat" | "feed" | "extract" | "analysis" | "discussions"
 *
 * URL Examples:
 *   /c/user/corpus                     → selectedTab(null) = default tab
 *   /c/user/corpus?tab=discussions     → selectedTab("discussions")
 *   /d/user/doc?tab=feed               → selectedTab("feed")
 */
export const selectedTab = makeVar<string | null>(null);

/**
 * Message selection for thread deep-linking (URL-driven state - set by CentralRouteManager Phase 2)
 *
 * Tracks selected message within a thread for scrolling/highlighting.
 *
 * URL Examples:
 *   /c/user/corpus/discussions/thread-123?message=msg-456  → selectedMessageId("msg-456")
 *   /d/user/doc?thread=thread-123&message=msg-456          → selectedMessageId("msg-456")
 */
export const selectedMessageId = makeVar<string | null>(null);

/**
 * Corpus home view selection (URL-driven state - set by CentralRouteManager Phase 2)
 *
 * Controls which view is shown on the corpus home tab: "about" (summary) or "toc" (table of contents).
 * Defaults to "about" when not specified in URL.
 *
 * URL Examples:
 *   /c/user/corpus                    → corpusHomeView(null) = default "about"
 *   /c/user/corpus?homeView=toc       → corpusHomeView("toc")
 *   /c/user/corpus?homeView=about     → corpusHomeView("about")
 */
export type CorpusHomeViewType = "about" | "toc";
export const corpusHomeView = makeVar<CorpusHomeViewType | null>(null);

/**
 * TOC expand all state (URL-driven state - set by CentralRouteManager Phase 2)
 *
 * When true, all nodes in the Table of Contents are expanded by default.
 * Useful for deep-linking to a fully expanded TOC view.
 * Defaults to false when not specified in URL.
 *
 * URL Examples:
 *   /c/user/corpus?homeView=toc                    → tocExpandAll(false) = default collapsed
 *   /c/user/corpus?homeView=toc&tocExpanded=true   → tocExpandAll(true) = all nodes expanded
 */
export const tocExpandAll = makeVar<boolean>(false);

/**
 * Auth-related global variables
 */
export const userObj = makeVar<User | null>(null);
export const authToken = makeVar<string>("");

export const uploadModalPreloadedFiles = makeVar<FileUploadPackageProps[]>([]);

export const showBulkUploadModal = makeVar<boolean>(false);

export const backendUserObj = makeVar<UserType | null>(null);

/**
 * Authentication status lifecycle: LOADING until Auth0 SDK resolves (or immediate for no-auth builds),
 * then AUTHENTICATED when we have a bearer token, otherwise ANONYMOUS.
 */
export type AuthStatus = "LOADING" | "AUTHENTICATED" | "ANONYMOUS";
export const authStatusVar = makeVar<AuthStatus>("LOADING");

/**
 * Tracks whether auth initialization is fully complete, including any cache operations.
 *
 * This is separate from authStatusVar because:
 * - authStatusVar is set BEFORE cache clear (to ensure credentials are available for any refetches)
 * - authInitCompleteVar is set AFTER cache clear (to signal safe to make new queries)
 *
 * Components like App.tsx that make queries (e.g., GET_ME) should wait for this to be true
 * to avoid their queries being aborted by the cache clear operation.
 *
 * Flow:
 * 1. authStatusVar changes to AUTHENTICATED/ANONYMOUS
 * 2. Cache clear happens (if needed)
 * 3. authInitCompleteVar set to true
 * 4. Components can now safely query
 */
export const authInitCompleteVar = makeVar<boolean>(false);
