import React, { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import TxtAnnotator from "../src/components/annotator/renderers/txt/TxtAnnotator";
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

const sampleText =
  "This is a sample document text. It contains multiple sentences for testing purposes. " +
  "The annotator should render this text and allow selections to be made by the user.";

const sampleAnnotation = new ServerSpanAnnotation(
  0,
  sampleLabels[0],
  "sample document text",
  false,
  { start: 10, end: 30 },
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

export const TxtAnnotatorTestWrapper: React.FC<{
  readOnly?: boolean;
  withAnnotations?: boolean;
}> = ({ readOnly = true, withAnnotations = false }) => {
  const [selected, setSelected] = useState<string[]>([]);

  const annotations = withAnnotations ? [sampleAnnotation] : [];

  return (
    <MemoryRouter>
      <div style={{ width: 600, height: 400, padding: 16 }}>
        <TxtAnnotator
          text={sampleText}
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
          deleteAnnotation={() => {}}
          selectedAnnotations={selected}
          setSelectedAnnotations={setSelected}
          showStructuralAnnotations={false}
        />
      </div>
    </MemoryRouter>
  );
};
