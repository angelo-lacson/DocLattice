import React, { useEffect } from "react";
import { Provider as JotaiProvider } from "jotai";
import { useSetAtom } from "jotai";
import { FloatingDocumentControls } from "../src/components/knowledge_base/document/FloatingDocumentControls";
import { PermissionTypes } from "../src/components/types";
import {
  showAnnotationBoundingBoxesAtom,
  showStructuralAnnotationsAtom,
  showSelectedAnnotationOnlyAtom,
} from "../src/components/annotator/context/UISettingsAtom";
import { corpusStateAtom } from "../src/components/annotator/context/CorpusAtom";
import {
  selectedDocumentAtom,
  rawPermissionsAtom,
} from "../src/components/annotator/context/DocumentAtom";

interface FloatingDocumentControlsTestWrapperProps {
  visible?: boolean;
  onAnalysesClick?: () => void;
  onExtractsClick?: () => void;
  analysesOpen?: boolean;
  extractsOpen?: boolean;
  panelOffset?: number;
  readOnly?: boolean;
  // Test configuration props
  showBoundingBoxes?: boolean;
  showStructural?: boolean;
  showSelectedOnly?: boolean;
  corpusPermissions?: PermissionTypes[];
}

// Inner component that sets up the atom states
const TestSetup: React.FC<{
  showBoundingBoxes: boolean;
  showStructural: boolean;
  showSelectedOnly: boolean;
  corpusPermissions: PermissionTypes[];
  children: React.ReactNode;
}> = ({
  showBoundingBoxes,
  showStructural,
  showSelectedOnly,
  corpusPermissions,
  children,
}) => {
  const setShowBoundingBoxes = useSetAtom(showAnnotationBoundingBoxesAtom);
  const setShowStructural = useSetAtom(showStructuralAnnotationsAtom);
  const setShowSelectedOnly = useSetAtom(showSelectedAnnotationOnlyAtom);
  const setCorpusState = useSetAtom(corpusStateAtom);
  const setSelectedDocument = useSetAtom(selectedDocumentAtom);
  const setRawPermissions = useSetAtom(rawPermissionsAtom);

  useEffect(() => {
    // Set UI settings
    setShowBoundingBoxes(showBoundingBoxes);
    setShowStructural(showStructural);
    setShowSelectedOnly(showSelectedOnly);

    // Set corpus state with permissions - this is what the component uses for selectedCorpus check
    const corpus = {
      id: "corpus-1",
      title: "Test Corpus",
      description: "Test corpus description",
      myPermissions: corpusPermissions,
      allowComments: true,
      labelSet: null,
      icon: null,
      // Add any other required fields for CorpusType
    };

    setCorpusState({
      selectedCorpus: corpus as any,
      myPermissions: corpusPermissions,
      spanLabels: [],
      humanSpanLabels: [],
      relationLabels: [],
      docTypeLabels: [],
      humanTokenLabels: [],
      allowComments: true,
      isLoading: false,
    });

    // Set document state with permissions (FloatingDocumentControls now uses document permissions)
    setSelectedDocument({
      id: "test-doc",
      title: "Test Document",
      myPermissions: corpusPermissions,
      pdfFile: null,
      backendLock: false,
      isPublic: false,
      // Add any other required fields for DocumentType
    } as any);

    // Also set raw permissions which get processed into the permissions atom
    // Convert PermissionTypes to raw strings
    const rawPerms = corpusPermissions
      .map((perm) => {
        switch (perm) {
          case PermissionTypes.CAN_READ:
            return "READ";
          case PermissionTypes.CAN_UPDATE:
            return "UPDATE";
          case PermissionTypes.CAN_CREATE:
            return "CREATE";
          case PermissionTypes.CAN_REMOVE:
            return "DELETE";
          case PermissionTypes.CAN_PUBLISH:
            return "PUBLISH";
          default:
            return "";
        }
      })
      .filter((p) => p);

    setRawPermissions(rawPerms);

    // Log the setup for debugging
    console.log("Test wrapper set up with:", {
      corpusPermissions,
      rawPerms,
      corpus: corpus.id,
    });
  }, [showBoundingBoxes, showStructural, showSelectedOnly, corpusPermissions]);

  return <>{children}</>;
};

export const FloatingDocumentControlsTestWrapper: React.FC<
  FloatingDocumentControlsTestWrapperProps
> = ({
  visible = true,
  onAnalysesClick,
  onExtractsClick,
  analysesOpen = false,
  extractsOpen = false,
  panelOffset = 0,
  readOnly = false,
  showBoundingBoxes = false,
  showStructural = false,
  showSelectedOnly = false,
  corpusPermissions = [PermissionTypes.CAN_READ, PermissionTypes.CAN_UPDATE],
}) => {
  // No mocking needed here

  return (
    <JotaiProvider>
      <TestSetup
        showBoundingBoxes={showBoundingBoxes}
        showStructural={showStructural}
        showSelectedOnly={showSelectedOnly}
        corpusPermissions={corpusPermissions}
      >
        <div
          style={{
            width: "100vw",
            height: "100vh",
            position: "relative",
            background: "#f5f5f5",
          }}
        >
          <FloatingDocumentControls
            visible={visible}
            onAnalysesClick={onAnalysesClick}
            onExtractsClick={onExtractsClick}
            analysesOpen={analysesOpen}
            extractsOpen={extractsOpen}
            panelOffset={panelOffset}
            readOnly={readOnly}
          />
        </div>
      </TestSetup>
    </JotaiProvider>
  );
};
