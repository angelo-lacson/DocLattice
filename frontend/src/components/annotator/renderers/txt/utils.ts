// src/utils.ts
import { Annotation } from "./span";
import {
  hexToRgb as sharedHexToRgb,
  hexToRgba,
  blendColors,
} from "../../../../utils/colorUtils";

// Re-export for backwards compatibility
export { hexToRgba, blendColors };

export const mapTokensWithAnnotations = (
  tokens: string[],
  annotations: Annotation[],
  visibleTags?: string[]
): Array<{ i: number; content: string; annotations: Annotation[] }> => {
  const tokenAnnotations = tokens.map((token, i) => ({
    i,
    content: token,
    annotations: [] as Annotation[],
  }));

  for (const annotation of annotations) {
    if (visibleTags && !visibleTags.includes(annotation.tag)) continue;

    for (let i = annotation.start; i < annotation.end; i++) {
      if (tokenAnnotations[i]) {
        tokenAnnotations[i].annotations.push(annotation);
      }
    }
  }

  return tokenAnnotations;
};

export const selectionIsEmpty = (selection: Selection) => {
  let position =
    selection?.anchorNode && selection?.focusNode
      ? selection.anchorNode.compareDocumentPosition(selection.focusNode)
      : 0;
  return position === 0 && selection.focusOffset === selection.anchorOffset;
};

export const selectionIsBackwards = (selection: Selection) => {
  if (selectionIsEmpty(selection)) return false;

  let position =
    selection?.anchorNode && selection?.focusNode
      ? selection.anchorNode.compareDocumentPosition(selection.focusNode)
      : null;
  let backward = false;
  if (
    (!position && selection.anchorOffset > selection.focusOffset) ||
    position === Node.DOCUMENT_POSITION_PRECEDING
  )
    backward = true;

  return backward;
};
