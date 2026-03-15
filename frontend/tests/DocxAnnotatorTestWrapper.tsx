import React, { useState, useMemo } from "react";
import { MemoryRouter } from "react-router-dom";
import DocxAnnotator from "../src/components/annotator/renderers/docx/DocxAnnotator";
import { ServerSpanAnnotation } from "../src/components/annotator/types/annotations";
import { AnnotationLabelType, LabelType } from "../src/types/graphql-api";
import { PermissionTypes } from "../src/components/types";
import testDocxUrl from "./fixtures/test.docx?url";

const sampleLabels: AnnotationLabelType[] = [
  {
    id: "label-1",
    labelType: LabelType.SpanLabel,
    color: "#FF6B6B",
    description: "Marks important clauses",
    icon: "tag",
    text: "Important Clause",
  },
  {
    id: "label-2",
    labelType: LabelType.SpanLabel,
    color: "#4ECDC4",
    description: "Marks definitions",
    icon: "tag",
    text: "Definition",
  },
];

// Must match Docxodus's text extraction exactly (newlines between paragraphs)
const sampleDocText =
  "Hello World. This is a sample DOCX document for testing.\n" +
  "This paragraph contains an Important Clause that should be annotated.\n" +
  "The Definition section explains key terms used throughout.\n";

const sampleAnnotation1 = new ServerSpanAnnotation(
  0,
  sampleLabels[0],
  "Hello World",
  false,
  { start: 0, end: 11 },
  [
    PermissionTypes.CAN_READ,
    PermissionTypes.CAN_UPDATE,
    PermissionTypes.CAN_REMOVE,
  ],
  false,
  false,
  false,
  "ann-1"
);

// "Important Clause" at offset 84-100 in the Docxodus-extracted text
const sampleAnnotation2 = new ServerSpanAnnotation(
  0,
  sampleLabels[1],
  "Important Clause",
  false,
  { start: 84, end: 100 },
  [
    PermissionTypes.CAN_READ,
    PermissionTypes.CAN_UPDATE,
    PermissionTypes.CAN_REMOVE,
  ],
  false,
  false,
  false,
  "ann-2"
);

export const DocxAnnotatorTestWrapper: React.FC<{
  readOnly?: boolean;
  withAnnotations?: boolean;
}> = ({ readOnly = true, withAnnotations = false }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [docxBytes, setDocxBytes] = useState<Uint8Array>(new Uint8Array(0));
  const [loading, setLoading] = useState(true);

  const annotations = withAnnotations
    ? [sampleAnnotation1, sampleAnnotation2]
    : [];

  // Load test DOCX file via Vite asset URL
  React.useEffect(() => {
    fetch(testDocxUrl)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        setDocxBytes(new Uint8Array(buf));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load test DOCX:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading test DOCX...</div>;
  }

  return (
    <MemoryRouter>
      <div style={{ width: 800, height: 600, padding: 16 }}>
        <DocxAnnotator
          docxBytes={docxBytes}
          docText={sampleDocText}
          annotations={annotations}
          searchResults={[]}
          getSpan={(span) =>
            new ServerSpanAnnotation(
              0,
              sampleLabels[0],
              span.text,
              false,
              { start: span.start, end: span.end },
              [
                PermissionTypes.CAN_READ,
                PermissionTypes.CAN_UPDATE,
                PermissionTypes.CAN_REMOVE,
              ],
              false,
              false,
              false
            )
          }
          visibleLabels={sampleLabels}
          availableLabels={sampleLabels}
          selectedLabelTypeId={readOnly ? null : "label-1"}
          readOnly={readOnly}
          allowInput={!readOnly}
          createAnnotation={() => {}}
          updateAnnotation={() => {}}
          approveAnnotation={() => {}}
          rejectAnnotation={() => {}}
          deleteAnnotation={() => {}}
          selectedAnnotations={selected}
          setSelectedAnnotations={setSelected}
          showStructuralAnnotations={false}
        />
      </div>
    </MemoryRouter>
  );
};
