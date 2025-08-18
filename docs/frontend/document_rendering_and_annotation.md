# Document Rendering and Annotation

> **Note**: For permission-related aspects of document rendering and annotations, see the [Consolidated Permissioning Guide](../permissioning/consolidated_permissioning_guide.md) - comprehensive documentation covering permission flows, document-level access control, corpus-level permissions, and component integration patterns.

## Overview

The `DocumentKnowledgeBase` component is responsible for rendering documents and enabling annotation functionality. It automatically selects the appropriate renderer based on the document's file type and provides a unified annotation experience across different document formats.

## Renderer Selection

The component chooses between two renderers based on the document's `fileType`:

### PDF Renderer
- **File types**: `application/pdf`
- **Component**: `PDF` (from `components/annotator/renderers/pdf/PDF.tsx`)
- **When selected**: When `document.fileType === "application/pdf"` and a PDF file URL is available

### Text Renderer
- **File types**: `application/txt`, `text/plain`
- **Component**: `TxtAnnotator` (wrapped by `TxtAnnotatorWrapper`)
- **When selected**: When `document.fileType === "application/txt"` or `"text/plain"` and a text extract file is available

The selection logic can be found in `DocumentKnowledgeBase.tsx` around lines 1003-1064:

```typescript
if (metadata.fileType === "application/pdf") {
  // Render PDF component
} else if (metadata.fileType === "application/txt" || metadata.fileType === "text/plain") {
  // Render TxtAnnotator component
} else {
  // Show unsupported file type message
}
```

## How Annotation Works

### PDF Annotation

1. **Token-based System**: PDFs use a PAWLS format that provides token-level information for each page
2. **Page Structure**: Each page is rendered as a canvas with an overlay for annotations
3. **Selection**: Users click and drag to select tokens on the page
4. **Creation Flow**:
   - User selects text by clicking and dragging
   - `SelectionBoundary` component detects the selection
   - Selection is converted to token indices
   - `createAnnotationHandler` is called with the annotation data
   - Annotation is sent to the backend via GraphQL mutation

### Text Annotation

1. **Character-based System**: Text documents use character offsets (start/end indices) for annotations
2. **Span-based Rendering**: Text is broken into spans based on annotation boundaries
3. **Selection**: Users click and drag to select text
4. **Creation Flow**:
   - User selects text with mouse
   - `handleMouseUp` event captures the selection
   - Browser's Selection API provides the selected text and range
   - Global character offsets are calculated from the selection
   - `getSpan` creates a new `ServerSpanAnnotation` object
   - `createAnnotation` is called to persist the annotation

## Key Differences

| Feature | PDF | Text |
|---------|-----|------|
| Selection Unit | Tokens | Characters |
| Position Storage | Bounding boxes + token IDs | Start/end character indices |
| Rendering | Canvas + overlay | HTML spans with styling |
| Multi-page | Yes (virtualized scrolling) | No (single continuous text) |
| Visual Feedback | Highlight boxes on tokens | Background color on text spans |

## Annotation Data Structure

Both renderers create annotations that include:
- Label information (type, color, text)
- Position data (format depends on document type)
- Permissions (can_update, can_remove, etc.)
- Metadata (creator, created date, etc.)

The annotations are stored in the `pdfAnnotationsAtom` and synchronized with the backend through GraphQL mutations.

## Smart Label Management

### Overview

The Smart Label System provides an intelligent, streamlined approach to managing annotation labels directly from the document view. This eliminates the need to navigate away from your document to create labels or labelsets.

### Key Features

1. **Inline Label Creation**: Create new labels without leaving the document
2. **Automatic Labelset Management**: System automatically creates labelsets when needed
3. **Smart Search**: Search existing labels with partial, case-insensitive matching
4. **Type-Aware Labels**: Automatically determines label type based on document format

### How It Works

#### Label Selection and Creation Flow

1. **Opening the Label Selector**
   - Click the label selector button (tag icon) in the bottom-right corner
   - The selector expands to show available labels and a search field

2. **Searching for Labels**
   - Start typing in the search field
   - Results update in real-time with partial, case-insensitive matching
   - If no match is found, a "Create" option appears

3. **Creating New Labels**
   - When no labelset exists:
     - System prompts to create both labelset and label
     - Labelset is automatically named based on corpus title
     - Single operation creates all necessary components
   - When labelset exists:
     - Click "Create [label name]" from search results
     - Enter color and description (optional)
     - Label is immediately available for use

### Smart Mutation System

The system uses a unified `smartLabelSearchOrCreate` GraphQL mutation that:

```graphql
mutation SmartLabelSearchOrCreate(
  $corpusId: String!
  $searchTerm: String!
  $labelType: String!
  $createIfNotFound: Boolean
) {
  smartLabelSearchOrCreate(
    corpusId: $corpusId
    searchTerm: $searchTerm
    labelType: $labelType
    createIfNotFound: $createIfNotFound
  ) {
    labels { id, text, color }
    labelset { id, title }
    labelCreated
    labelsetCreated
  }
}
```

This single mutation handles:
- Searching for existing labels
- Creating new labels
- Creating labelsets when needed
- Updating corpus associations
- All in a single atomic transaction

### Context-Aware Guidance

When annotation conditions aren't met, the system provides helpful guidance:

| Condition | Message | Action |
|-----------|---------|--------|
| No labelset | "No labelset configured" | Prompts to create labelset |
| No labels | "No labels available" | Guides to label creation |
| No label selected | "Select a label to annotate" | Points to label selector |
| Read-only mode | "Document is read-only" | Explains restriction |
| No permissions | "No corpus permissions" | Indicates permission issue |

### Label Types by Document Format

The system automatically selects the appropriate label type:

- **PDF Documents**: Token labels (word/phrase level)
- **Text Documents**: Span labels (character range)
- **Document Labels**: Apply to entire document (available for all formats)

## Common Features

Both renderers support:
- Multiple annotation labels with different colors
- Annotation selection and highlighting
- Search result highlighting
- Chat source highlighting
- Hover effects showing annotation labels
- Context menus for editing/deleting annotations
- Smart label management system
