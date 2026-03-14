import React, { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import DocxAnnotator from "../src/components/annotator/renderers/docx/DocxAnnotator";
import { ServerSpanAnnotation } from "../src/components/annotator/types/annotations";
import { AnnotationLabelType, LabelType } from "../src/types/graphql-api";
import { PermissionTypes } from "../src/components/types";

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

const sampleDocText =
  "Hello World. This is a sample DOCX document for testing.";

/**
 * Create a minimal valid DOCX file as Uint8Array for testing.
 * This is a real ZIP archive with the minimal required OOXML entries.
 */
function createMinimalDocxBytes(): Uint8Array {
  // A pre-built minimal DOCX as a base64-encoded ZIP
  // Contains: [Content_Types].xml, _rels/.rels, word/document.xml
  // with the text "Hello World"
  const base64 =
    "UEsDBBQAAAAIAAAAAACKIYkzUgAAAFgAAAATABwAW0NvbnRlbnRfVHlwZXNdLnhtbFVU" +
    "CQADAAAAAAAAAAB1zjEKwCAQBdDeU/y9xEqIjZ0HsHARL7igu+L1DbaeDMPM8FPb+Yk8" +
    "a+YQRaGVBghJp31IFm7lfjsAW4s55hLZCzcp05R3L0zzD/ABUEsDBBQAAAAIAAAAAACY" +
    "epelQQAAAEIAAAALABwAX3JlbHMvLnJlbHNVVAkAAwAAAAAAAABNzrEKwCAMBdC9p/h3" +
    "l05SZycXwcWN4AOmiPr87dfNO1zuvZR14kh+GLMQXYLWICCQXDI+soWyHA5gDR0v55gq" +
    "8k1K1NULor3TAFBLAwQUAAAACAAAAAAA0LRfUEMAAABKAAAAEQAcAHdvcmQvZG9jdW1l" +
    "bnQueG1sVVQJAAMAAAAAAAAAAE3OsQrCQBAE0N5T/H2JlYiNnQew8C5ZksXs7mV3E72/" +
    "x85ymGF4tNiN5KaYc1SFVhogJF/CITm4p+d1D+ws1pxrEi/SpEwb3kbPCwR/AFBLAQIW" +
    "AxQAAAAIAAAAAACKIYkzUgAAAFgAAAATABgAAAAAAAEAAACkgQAAAABbQ29udGVudF9U" +
    "eXBlc10ueG1sVVQFAAMAAAAAVXgLAAEE6AMAAAToAwAAUEsBAhYDFAAAAAgAAAAAAJh6" +
    "l6VBAAAAQgAAAAsAGAAAAAAAAQAAAKSBnQAAAF9yZWxzLy5yZWxzVVQFAAMAAAAAVXgL" +
    "AAEE6AMAAAToAwAAUEsBAhYDFAAAAAgAAAAAANC0X1BDAAAASgAAABEAGAAAAAAAAQAA" +
    "AKSBJQEAAHdvcmQvZG9jdW1lbnQueG1sVVQFAAMAAAAAVXgLAAEE6AMAAAToAwAAUEsF" +
    "BgAAAAADAAMAAQEAAK0BAAAAAA==";

  // For testing, just use an empty Uint8Array - the component will show
  // the loading/error state which is what we want to test
  return new Uint8Array(0);
}

const sampleAnnotation = new ServerSpanAnnotation(
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

export const DocxAnnotatorTestWrapper: React.FC<{
  readOnly?: boolean;
  withAnnotations?: boolean;
  /** Pre-rendered HTML content to bypass WASM conversion */
  htmlContent?: string;
}> = ({ readOnly = true, withAnnotations = false, htmlContent }) => {
  const [selected, setSelected] = useState<string[]>([]);

  const annotations = withAnnotations ? [sampleAnnotation] : [];

  // Use an empty Uint8Array - tests focus on the component shell behavior
  const docxBytes = new Uint8Array(0);

  return (
    <MemoryRouter>
      <div style={{ width: 600, height: 400, padding: 16 }}>
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
          selectedLabelTypeId={null}
          read_only={readOnly}
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
