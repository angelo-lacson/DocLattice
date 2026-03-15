/**
 * DocxAnnotator Component
 *
 * Renders DOCX documents using Docxodus WASM with annotation projection.
 * Uses convertDocxToHtmlWithExternalAnnotations() to render the document
 * with annotations overlaid on the native DOCX HTML output. Text selection
 * creates new annotations using character offsets (same format as TXT).
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  initialize as initDocxodus,
  convertDocxToHtmlWithExternalAnnotations,
  findTextOccurrences,
  AnnotationLabelMode,
} from "docxodus";
import type {
  ExternalAnnotationSet,
  ExternalAnnotationProjectionSettings,
} from "docxodus";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { ServerSpanAnnotation } from "../../types/annotations";
import { TextSearchSpanResult } from "../../../types";
import {
  SelectionActionMenu,
  ActionMenuItem,
  MenuDivider,
  ShortcutHint,
} from "../../components/SelectionActionMenu";
import { clampMenuPosition } from "../../../../utils/layout";
import DOMPurify from "dompurify";
import { Tag, X } from "lucide-react";
import { OS_LEGAL_COLORS } from "../../../../assets/configurations/osLegalStyles";

/** Stable empty arrays to avoid re-render loops. */
const EMPTY_ANNOTATIONS: ServerSpanAnnotation[] = [];
const EMPTY_SEARCH_RESULTS: TextSearchSpanResult[] = [];

interface ChatSourceHighlight {
  start_index: number;
  end_index: number;
  sourceId: string;
  messageId: string;
}

const EMPTY_CHAT_SOURCES: ChatSourceHighlight[] = [];

interface DocxAnnotatorProps {
  /** Raw DOCX file bytes */
  docxBytes: Uint8Array;
  /** Plain text content extracted by the backend parser */
  docText: string;
  /** Annotations to project onto the document */
  annotations: ServerSpanAnnotation[];
  /** Search results to highlight */
  searchResults?: TextSearchSpanResult[];
  /** Chat source highlights */
  chatSources?: ChatSourceHighlight[];
  /** Currently selected chat source ID */
  selectedChatSourceId?: string;
  /** Labels visible in the current filter */
  visibleLabels: AnnotationLabelType[];
  /** All available annotation labels */
  availableLabels: AnnotationLabelType[];
  /** Currently selected label type ID for new annotations */
  selectedLabelTypeId: string | null;
  /** Whether the annotator is read-only */
  readOnly: boolean;
  /** Whether user input is allowed */
  allowInput: boolean;
  /** Callback to create a new annotation from text selection */
  getSpan: (span: {
    start: number;
    end: number;
    text: string;
  }) => ServerSpanAnnotation;
  /** CRUD callbacks */
  createAnnotation: (annotation: ServerSpanAnnotation) => void;
  updateAnnotation?: (annotation: ServerSpanAnnotation) => void;
  approveAnnotation?: (annotationId: string) => void;
  rejectAnnotation?: (annotationId: string) => void;
  deleteAnnotation: (annotationId: string) => void;
  /** Selection state */
  selectedAnnotations: string[];
  setSelectedAnnotations: (ids: string[]) => void;
  /** Whether to show structural annotations */
  showStructuralAnnotations: boolean;
  /** Ref registration callback for sidebar scroll-into-view */
  onAnnotationRefChange?: (
    annotationId: string,
    element: HTMLElement | null
  ) => void;
  /** Zoom level */
  zoomLevel?: number;
  /** Max dimensions */
  maxHeight?: string;
  maxWidth?: string;
}

/**
 * Convert server annotations to Docxodus ExternalAnnotationSet format.
 */
function buildExternalAnnotationSet(
  docText: string,
  annotations: ServerSpanAnnotation[],
  visibleLabels: AnnotationLabelType[],
  showStructural: boolean
): ExternalAnnotationSet {
  const visibleLabelIds = new Set(visibleLabels.map((l) => l.id));

  const filteredAnnotations = annotations.filter((ann) => {
    if (ann.annotationLabel?.id && !visibleLabelIds.has(ann.annotationLabel.id))
      return false;
    if (ann.structural && !showStructural) return false;
    return true;
  });

  // Build labelled_text in docxodus format using TextSpan {start, end, text}
  const labelledText = filteredAnnotations.map((ann) => ({
    id: ann.id,
    annotationLabel: ann.annotationLabel?.text ?? "Unknown",
    rawText: ann.rawText,
    page: 0,
    annotationJson: ann.json
      ? { start: ann.json.start, end: ann.json.end, text: ann.rawText }
      : undefined,
    annotationType: ann.structural ? "structural" : "text",
    structural: ann.structural,
  }));

  // Build text label definitions
  const textLabels: Record<
    string,
    {
      id: string;
      text: string;
      color: string;
      description?: string;
      icon?: string;
      labelType?: string;
    }
  > = {};
  for (const ann of filteredAnnotations) {
    const label = ann.annotationLabel;
    if (label && label.id && !textLabels[label.id]) {
      textLabels[label.id] = {
        id: label.id,
        text: label.text ?? "",
        color: label.color ?? "#FFD700",
        icon: "",
        labelType: "text",
      };
    }
  }

  return {
    title: "",
    content: docText,
    pageCount: 1,
    pawlsFileContent: [],
    docLabels: [],
    labelledText: labelledText as ExternalAnnotationSet["labelledText"],
    textLabels: textLabels as ExternalAnnotationSet["textLabels"],
    docLabelDefinitions: {},
    documentId: "",
    documentHash: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: "1.0",
  };
}

const DocxAnnotator: React.FC<DocxAnnotatorProps> = ({
  docxBytes,
  docText,
  annotations = EMPTY_ANNOTATIONS,
  searchResults = EMPTY_SEARCH_RESULTS,
  chatSources = EMPTY_CHAT_SOURCES,
  selectedChatSourceId,
  visibleLabels,
  availableLabels,
  selectedLabelTypeId,
  readOnly,
  allowInput,
  getSpan,
  createAnnotation,
  deleteAnnotation,
  selectedAnnotations,
  setSelectedAnnotations,
  showStructuralAnnotations,
  onAnnotationRefChange,
  zoomLevel = 1,
  maxHeight = "100%",
  maxWidth = "100%",
}) => {
  const [html, setHtml] = useState<string>("");
  const [wasmReady, setWasmReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Context menu state for annotation creation
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);

  // Initialize Docxodus WASM
  useEffect(() => {
    let cancelled = false;
    initDocxodus()
      .then(() => {
        if (!cancelled) setWasmReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(`Failed to initialize Docxodus WASM: ${err}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Convert DOCX to HTML with annotations projected
  useEffect(() => {
    if (!wasmReady || !docxBytes || docxBytes.length === 0) return;

    let cancelled = false;
    setConverting(true);

    const annotationSet = buildExternalAnnotationSet(
      docText,
      annotations,
      visibleLabels,
      showStructuralAnnotations
    );

    const projectionSettings: ExternalAnnotationProjectionSettings = {
      cssClassPrefix: "oc-annot-",
      labelMode: AnnotationLabelMode.Tooltip,
      includeMetadata: true,
      validateBeforeProjection: false,
    };

    convertDocxToHtmlWithExternalAnnotations(
      docxBytes,
      annotationSet,
      undefined,
      projectionSettings
    )
      .then((resultHtml) => {
        if (!cancelled) {
          // Sanitize WASM-produced HTML to prevent XSS from crafted DOCX files.
          // RETURN_DOM_FRAGMENT=false ensures we get a string back.
          // ADD_ATTR preserves data-annotation-id used for annotation click handling.
          setHtml(
            DOMPurify.sanitize(resultHtml, {
              ADD_ATTR: ["data-annotation-id"],
            })
          );
          setConverting(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("DOCX conversion error:", err);
          setError(`DOCX conversion failed: ${err}`);
          setConverting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    wasmReady,
    docxBytes,
    docText,
    annotations,
    visibleLabels,
    showStructuralAnnotations,
  ]);

  // Handle text selection for new annotation creation
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly || !allowInput || !selectedLabelTypeId) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim())
        return;

      const selectedText = selection.toString().trim();

      // Find matching offsets in the document text.
      // TODO: When the same text appears multiple times, this picks the first
      // occurrence. A more robust approach would use DOM selection offsets
      // (selection.getRangeAt(0)) to disambiguate, similar to TxtAnnotator.
      const occurrences = findTextOccurrences(docText, selectedText);
      if (occurrences.length === 0) return;

      const match = occurrences[0];

      const menuPos = clampMenuPosition(e.clientX, e.clientY);
      setMenuPosition(menuPos);
      setPendingSelection({
        text: selectedText,
        start: match.start,
        end: match.end,
      });
    },
    [readOnly, allowInput, selectedLabelTypeId, docText]
  );

  // Handle annotation creation from menu
  const handleCreateAnnotation = useCallback(() => {
    if (!pendingSelection) return;

    try {
      const newAnnotation = getSpan(pendingSelection);
      createAnnotation(newAnnotation);
    } catch {
      // Label not found - ignore
    }

    setMenuPosition(null);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [pendingSelection, getSpan, createAnnotation]);

  // Handle clicking on projected annotation spans in the HTML
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if the clicked element is an annotation span
      const annotationEl = target.closest(
        "[data-annotation-id]"
      ) as HTMLElement | null;
      if (annotationEl) {
        const annotationId = annotationEl.getAttribute("data-annotation-id");
        if (annotationId) {
          if (e.ctrlKey || e.metaKey) {
            // Toggle in multi-select
            setSelectedAnnotations(
              selectedAnnotations.includes(annotationId)
                ? selectedAnnotations.filter((id) => id !== annotationId)
                : [...selectedAnnotations, annotationId]
            );
          } else {
            setSelectedAnnotations([annotationId]);
          }
          return;
        }
      }

      // Click on empty space clears selection
      if (!menuPosition) {
        setSelectedAnnotations([]);
      }
    },
    [selectedAnnotations, setSelectedAnnotations, menuPosition]
  );

  // Close menu on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuPosition(null);
        setPendingSelection(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Inject custom CSS for annotation highlighting
  const customCss = useMemo(() => {
    const selectedStyles = selectedAnnotations
      .map(
        (id) => `
      [data-annotation-id="${CSS.escape(id)}"] {
        outline: 2px solid ${OS_LEGAL_COLORS.primaryBlue} !important;
        outline-offset: 1px;
        background-color: rgba(59, 130, 246, 0.15) !important;
      }
    `
      )
      .join("\n");

    return `
      .oc-annot-label {
        font-size: 0.7em;
        padding: 1px 4px;
        border-radius: 3px;
        vertical-align: super;
        opacity: 0.8;
        cursor: pointer;
      }
      [data-annotation-id] {
        cursor: pointer;
        transition: outline 0.15s ease, background-color 0.15s ease;
      }
      [data-annotation-id]:hover {
        outline: 1px solid ${OS_LEGAL_COLORS.borderHover};
        outline-offset: 1px;
      }
      ${selectedStyles}
    `;
  }, [selectedAnnotations]);

  if (error) {
    return (
      <div
        style={{
          padding: "2rem",
          color: OS_LEGAL_COLORS.textSecondary,
          textAlign: "center",
        }}
      >
        <p>{error}</p>
      </div>
    );
  }

  if (!wasmReady || converting) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: OS_LEGAL_COLORS.textSecondary,
          fontSize: "0.875rem",
        }}
      >
        {!wasmReady
          ? "Initializing DOCX renderer..."
          : "Converting document..."}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="docx-annotator"
      style={{
        maxHeight,
        maxWidth,
        overflow: "auto",
        position: "relative",
        fontSize: `${zoomLevel}em`,
      }}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    >
      <style>{customCss}</style>
      <div
        className="docx-content"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          padding: "1.5rem",
          lineHeight: 1.6,
          color: OS_LEGAL_COLORS.textPrimary,
          backgroundColor: OS_LEGAL_COLORS.background,
        }}
      />

      {/* Annotation creation menu */}
      {menuPosition && pendingSelection && (
        <SelectionActionMenu
          ref={menuRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
            zIndex: 1000,
          }}
        >
          <ActionMenuItem onClick={handleCreateAnnotation}>
            <Tag size={14} />
            <span>Annotate Selection</span>
            <ShortcutHint>Enter</ShortcutHint>
          </ActionMenuItem>
          <MenuDivider />
          <ActionMenuItem
            onClick={() => {
              setMenuPosition(null);
              setPendingSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <X size={14} />
            <span>Cancel</span>
          </ActionMenuItem>
        </SelectionActionMenu>
      )}
    </div>
  );
};

export default React.memo(DocxAnnotator);
