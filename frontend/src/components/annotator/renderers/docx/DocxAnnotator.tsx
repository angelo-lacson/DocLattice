/**
 * DocxAnnotator Component
 *
 * Renders DOCX documents using Docxodus WASM with incremental annotation
 * overlay. Uses the convert-once / project-many pattern:
 *
 *   1. convertDocxToHtml()  — expensive (~900ms), cached on docxBytes change
 *   2. projectAnnotationsOntoHtml() — fast (~56ms), runs on annotation change
 *   3. generateAnnotationVisibilityCss() — instant, CSS-only label toggling
 *
 * Text selection creates new annotations using character offsets (same format
 * as TXT). Selection disambiguation uses DOM positions (anchorNode/focusNode)
 * and a TreeWalker to compute exact character offsets, resolving ambiguity
 * when the same text appears multiple times.
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
  convertDocxToHtml,
  projectAnnotationsOntoHtml,
  generateAnnotationCss,
  generateAnnotationVisibilityCss,
  findTextOccurrences,
  AnnotationLabelMode,
} from "docxodus";
import type {
  ExternalAnnotationSet,
  ExternalAnnotationProjectionSettings,
  AnnotationLabel,
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

/** CSS class prefix for annotation elements produced by the projector. */
const CSS_CLASS_PREFIX = "oc-annot-";

/** Stable projection settings shared by projection and CSS generation. */
const PROJECTION_SETTINGS: ExternalAnnotationProjectionSettings = {
  cssClassPrefix: CSS_CLASS_PREFIX,
  labelMode: AnnotationLabelMode.Tooltip,
  includeMetadata: true,
  validateBeforeProjection: false,
};

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
 * Build an ExternalAnnotationSet from server annotations.
 *
 * Label visibility filtering is NOT done here — all annotations matching the
 * structural filter are included, and visibility is toggled via CSS rules
 * produced by generateAnnotationVisibilityCss().
 */
function buildExternalAnnotationSet(
  docText: string,
  annotations: ServerSpanAnnotation[],
  showStructural: boolean
): ExternalAnnotationSet {
  const filteredAnnotations = annotations.filter((ann) => {
    if (ann.structural && !showStructural) return false;
    return true;
  });

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

/**
 * Build the labels record for generateAnnotationCss() from all available
 * corpus labels. This ensures CSS rules exist for every possible label
 * before any annotation uses it.
 */
function buildLabelsRecord(
  availableLabels: AnnotationLabelType[]
): Record<string, AnnotationLabel> {
  const record: Record<string, AnnotationLabel> = {};
  for (const label of availableLabels) {
    record[label.id] = {
      id: label.id,
      text: label.text ?? "",
      color: label.color ?? "#FFD700",
      description: label.description ?? "",
      icon: label.icon ?? "",
      labelType: "text",
    };
  }
  return record;
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
  // Cached base HTML from one-time DOCX conversion (sanitized)
  const [baseHtml, setBaseHtml] = useState<string>("");
  // Annotated HTML with all annotations projected
  const [annotatedHtml, setAnnotatedHtml] = useState<string>("");
  // CSS from docxodus for annotation highlight styles
  const [annotationCss, setAnnotationCss] = useState<string>("");
  // CSS for toggling label visibility without re-projecting
  const [visibilityCss, setVisibilityCss] = useState<string>("");

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

  // ── Effect 1: Initialize Docxodus WASM ──────────────────────────────
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

  // ── Effect 2: Convert DOCX → base HTML (expensive, cached) ─────────
  // Only re-runs when docxBytes changes. The base HTML is sanitized once
  // here; subsequent projection operates on this safe foundation.
  useEffect(() => {
    if (!wasmReady || !docxBytes || docxBytes.length === 0) return;

    let cancelled = false;
    setConverting(true);

    convertDocxToHtml(docxBytes)
      .then((html) => {
        if (!cancelled) {
          setBaseHtml(
            DOMPurify.sanitize(html, {
              ADD_ATTR: ["data-annotation-id", "data-label-id", "data-label"],
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
  }, [wasmReady, docxBytes]);

  // ── Effect 3: Project annotations onto base HTML (~56ms) ────────────
  // Re-runs when annotations change or structural toggle flips.
  // Label visibility is handled separately via CSS (Effect 5).
  useEffect(() => {
    if (!baseHtml || !wasmReady) return;
    let cancelled = false;

    const annotationSet = buildExternalAnnotationSet(
      docText,
      annotations,
      showStructuralAnnotations
    );

    if (annotationSet.labelledText.length === 0) {
      setAnnotatedHtml(baseHtml);
      return;
    }

    projectAnnotationsOntoHtml(baseHtml, annotationSet, PROJECTION_SETTINGS)
      .then((html) => {
        if (!cancelled) {
          setAnnotatedHtml(
            DOMPurify.sanitize(html, {
              ADD_ATTR: ["data-annotation-id", "data-label-id", "data-label"],
            })
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Annotation projection error:", err);
          setAnnotatedHtml(baseHtml);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baseHtml, docText, annotations, showStructuralAnnotations, wasmReady]);

  // ── Effect 4: Generate annotation CSS from label definitions ────────
  useEffect(() => {
    if (!wasmReady) return;
    let cancelled = false;

    const labels = buildLabelsRecord(availableLabels);
    if (Object.keys(labels).length === 0) {
      setAnnotationCss("");
      return;
    }

    generateAnnotationCss(labels, PROJECTION_SETTINGS)
      .then((css) => {
        if (!cancelled) setAnnotationCss(css);
      })
      .catch((err) => {
        if (!cancelled) console.error("Annotation CSS generation error:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [wasmReady, availableLabels]);

  // ── Effect 5: Generate visibility CSS (instant, CSS-only) ───────────
  // When label filters change, toggle annotation visibility via CSS rules
  // instead of re-projecting the entire HTML.
  useEffect(() => {
    if (!wasmReady) return;
    let cancelled = false;

    const visibleLabelIds = new Set(visibleLabels.map((l) => l.id));
    const allLabelIds = new Set(
      annotations
        .map((a) => a.annotationLabel?.id)
        .filter((id): id is string => Boolean(id))
    );
    const hiddenLabelIds = [...allLabelIds].filter(
      (id) => !visibleLabelIds.has(id)
    );

    if (hiddenLabelIds.length === 0) {
      setVisibilityCss("");
      return;
    }

    generateAnnotationVisibilityCss(hiddenLabelIds, CSS_CLASS_PREFIX)
      .then((css) => {
        if (!cancelled) setVisibilityCss(css);
      })
      .catch((err) => {
        if (!cancelled) console.error("Visibility CSS generation error:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [wasmReady, visibleLabels, annotations]);

  /**
   * Compute an approximate character offset from a DOM selection point.
   *
   * Walks text nodes in document order within the container, skipping text
   * inside annotation label elements (injected by the WASM renderer and not
   * part of the original document text). The result may differ slightly from
   * the true docText offset (e.g. inter-paragraph newlines in docText aren't
   * present as DOM text nodes), but is close enough to disambiguate which
   * occurrence of repeated text the user selected via closest-match.
   */
  const getGlobalOffsetFromDomPosition = useCallback(
    (
      container: HTMLElement,
      node: Node | null,
      localOffset: number
    ): number | null => {
      if (!node) return null;

      // If the node is an element, resolve to the child at the given offset
      let targetNode: Node = node;
      let targetOffset: number = localOffset;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (localOffset < el.childNodes.length) {
          targetNode = el.childNodes[localOffset];
          targetOffset = 0;
        } else if (el.childNodes.length > 0) {
          // Past the end — point to end of last child
          targetNode = el.childNodes[el.childNodes.length - 1];
          targetOffset = targetNode.textContent?.length ?? 0;
        } else {
          return null;
        }
      }

      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (n: Node) => {
            // Skip text nodes inside annotation label elements — these are
            // injected by the WASM renderer and are not part of docText.
            let parent = n.parentElement;
            while (parent && parent !== container) {
              if (parent.classList.contains(`${CSS_CLASS_PREFIX}label`)) {
                return NodeFilter.FILTER_REJECT;
              }
              parent = parent.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let globalOffset = 0;
      let current: Node | null;
      while ((current = walker.nextNode())) {
        if (current === targetNode) {
          return globalOffset + targetOffset;
        }
        globalOffset += current.textContent?.length ?? 0;
      }

      return null;
    },
    []
  );

  // Handle text selection for new annotation creation.
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly || !allowInput || !selectedLabelTypeId) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim())
        return;

      const selectedText = selection.toString().trim();

      const occurrences = findTextOccurrences(docText, selectedText);
      if (occurrences.length === 0) return;

      let match = occurrences[0];

      if (occurrences.length > 1) {
        const contentEl = containerRef.current?.querySelector(
          ".docx-content"
        ) as HTMLElement | null;
        if (contentEl) {
          const anchorOffset = getGlobalOffsetFromDomPosition(
            contentEl,
            selection.anchorNode,
            selection.anchorOffset
          );

          if (anchorOffset !== null) {
            match = occurrences.reduce((closest, occ) =>
              Math.abs(occ.start - anchorOffset) <
              Math.abs(closest.start - anchorOffset)
                ? occ
                : closest
            );
          }
        }
      }

      const menuPos = clampMenuPosition(e.clientX, e.clientY);
      setMenuPosition(menuPos);
      setPendingSelection({
        text: selectedText,
        start: match.start,
        end: match.end,
      });
    },
    [
      readOnly,
      allowInput,
      selectedLabelTypeId,
      docText,
      getGlobalOffsetFromDomPosition,
    ]
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

      const annotationEl = target.closest(
        "[data-annotation-id]"
      ) as HTMLElement | null;
      if (annotationEl) {
        const annotationId = annotationEl.getAttribute("data-annotation-id");
        if (annotationId) {
          if (e.ctrlKey || e.metaKey) {
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

  // App-specific CSS for selection highlights and hover effects.
  // Layered after annotationCss and visibilityCss so these override.
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
      .${CSS_CLASS_PREFIX}label {
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

  if (!wasmReady || converting || !annotatedHtml) {
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
          : converting
          ? "Converting document..."
          : "Projecting annotations..."}
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
      <style>{annotationCss}</style>
      <style>{visibilityCss}</style>
      <style>{customCss}</style>
      <div
        className="docx-content"
        dangerouslySetInnerHTML={{ __html: annotatedHtml }}
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
