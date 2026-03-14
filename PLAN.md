# DOCX Pipeline Implementation Plan

## Overview

Add first-class DOCX support to OpenContracts with a parallel ingestion pipeline and rendering tree, modeled after the existing TXT pipeline but with rich DOCX rendering via Docxodus WASM.

**Architecture Summary**:
- **Backend**: `DocxParser` using `python-docx` extracts text + structural annotations with character offsets (`{start, end}`)
- **Frontend**: `react-docxodus-viewer` renders DOCX natively with full formatting via WASM, projecting annotations using Docxodus's `ExternalAnnotationProjector`
- **Annotation format**: `SpanAnnotation` with `{start, end}` character offsets (same as TXT), mapping to Docxodus `TextSpan` format
- **Validation**: Hash-based integrity check via `computeDocumentHash()` + `validateExternalAnnotations()` on frontend

---

## Phase 1: Backend — DocxParser

### 1.1 Create `DocxParser` class

**File**: `opencontractserver/pipeline/parsers/docx_parser.py`

```python
class DocxParser(BaseParser):
    """Local DOCX parser using python-docx for text extraction and structural annotation."""

    title = "Python-Docx Parser"
    description = "Extracts text and document structure from DOCX files using python-docx"
    supported_file_types = (FileTypeEnum.DOCX,)
```

**Implementation details**:
- Use `python-docx` (`docx.Document`) to open the DOCX from `document.pdf_file` (polymorphic storage)
- Walk the document body in order: paragraphs, tables (row-by-row, cell-by-cell), headers/footers
- Concatenate all text into a single string, tracking character offsets as we go
- For each structural element, create an annotation entry in `labelled_text`:
  - **PARAGRAPH**: Each `<w:p>` element → `{start, end}` offsets
  - **HEADING**: Paragraphs with heading styles (Heading 1-6) → separate label
  - **TABLE**: Table boundaries → `{start, end}` spanning all cell text
  - **TABLE_ROW** / **TABLE_CELL**: Finer-grained table structure
  - **LIST_ITEM**: Paragraphs with list styles
  - **HEADER** / **FOOTER**: Header/footer content
- Use spaCy (like TxtParser) for sentence segmentation within paragraphs
- Return `OpenContractDocExport` with:
  - `content`: Full concatenated text
  - `pawls_file_content`: `[]` (empty, like TXT — no spatial layout for DOCX)
  - `page_count`: Estimate from section breaks + character density (DOCX has no fixed pages)
  - `labelled_text`: List of structural annotations with `{start, end}` offsets
  - `relationships`: Parent-child links (heading → paragraphs, table → rows → cells)
  - `file_type`: `"application/vnd.openxmlformats-officedocument.wordprocessingml.document"`

**Text extraction order** (must match Docxodus's extraction order for offset alignment):
1. Body paragraphs and tables in document order
2. Within tables: row-major order (row 0 cell 0, row 0 cell 1, ..., row 1 cell 0, ...)
3. Paragraph text = concatenation of all runs in the paragraph
4. Separator: `\n` between paragraphs, `\n\n` between major sections

**Key files to reference**:
- `opencontractserver/pipeline/parsers/oc_text_parser.py` — Pattern to follow
- `opencontractserver/pipeline/base/parser.py` — BaseParser interface
- `opencontractserver/types/dicts.py` — OpenContractDocExport type

### 1.2 Create structural annotation labels

The parser should create/use these `AnnotationLabel` entries (auto-created on first parse):
- `PARAGRAPH` — Body paragraphs
- `HEADING_1` through `HEADING_6` — Heading levels
- `TABLE` — Table boundaries
- `TABLE_ROW` — Table row boundaries
- `TABLE_CELL` — Table cell boundaries
- `LIST_ITEM` — List items
- `HEADER` — Document header content
- `FOOTER` — Document footer content
- `SENTENCE` — Sentence-level (via spaCy, same as TXT)

### 1.3 Register in pipeline

No manual registration needed — auto-discovery will find it in `opencontractserver/pipeline/parsers/`. Just ensure:
- The class inherits from `BaseParser`
- `supported_file_types` includes `FileTypeEnum.DOCX`
- The file is in the `parsers/` directory

### 1.4 Update PipelineSettings defaults

In `opencontractserver/documents/models.py` or initial migration, add default preferred parser mapping:
```python
"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DocxParser"
```

---

## Phase 2: Backend — DocxThumbnailGenerator

### 2.1 Create `DocxThumbnailGenerator`

**File**: `opencontractserver/pipeline/thumbnailers/docx_thumbnailer.py`

```python
class DocxThumbnailGenerator(BaseThumbnailGenerator):
    """Generates thumbnails for DOCX files."""

    title = "DOCX Thumbnail Generator"
    description = "Creates thumbnail preview images from DOCX documents"
    supported_file_types = (FileTypeEnum.DOCX,)
```

**Implementation options** (in order of preference):
1. **mammoth + Pillow**: Convert first page to HTML via mammoth, render to image
2. **python-docx + Pillow**: Extract first paragraph text, render as text thumbnail (similar to TextThumbnailGenerator)
3. **DOCX embedded thumbnail**: Some DOCX files contain a `thumbnail.jpeg` in the package — extract if present

**Recommended approach**: Option 2 (text-based thumbnail like TXT) for simplicity, with option 3 as enhancement (try embedded thumbnail first, fall back to text render).

**Key file to reference**: `opencontractserver/pipeline/thumbnailers/text_thumbnailer.py`

---

## Phase 3: Frontend — DOCX Viewer Component

### 3.1 Install dependencies

```bash
cd frontend
yarn add docxodus react-docxodus-viewer
```

Add WASM files to the public directory or configure `wasmBasePath` prop.

### 3.2 Create DocxAnnotator component

**File**: `frontend/src/components/annotator/renderers/docx/DocxAnnotator.tsx`

This is the core new component. It:
1. Loads the original DOCX file (from `document.pdf_file` URL)
2. Converts DOCX → HTML via Docxodus WASM (client-side, in Web Worker)
3. Builds an `ExternalAnnotationSet` from the server-side `SpanAnnotation` data
4. Projects annotations onto the HTML via `convertDocxToHtmlWithExternalAnnotations()`
5. Renders the annotated HTML using `react-docxodus-viewer`

```typescript
interface DocxAnnotatorProps {
  docxUrl: string;                           // URL to fetch the DOCX file
  annotations: ServerSpanAnnotation[];        // From backend
  searchResults: TextSearchSpanResult[];      // Text search highlights
  visibleLabels: Set<string>;                // Filter
  onAnnotationSelect: (ann: ServerSpanAnnotation) => void;
  onAnnotationCreate: (start: number, end: number, text: string) => void;
  allowInput: boolean;
}
```

**Annotation projection flow**:
1. Fetch DOCX file as `Uint8Array`
2. Call `computeDocumentHash(docxBytes)` → store hash
3. Convert `ServerSpanAnnotation[]` → Docxodus `ExternalAnnotationSet`:
   ```typescript
   {
     documentHash: hash,
     annotations: serverAnnotations.map(ann => ({
       id: ann.id,
       labelId: ann.annotationLabel.id,
       label: ann.annotationLabel.text,
       color: ann.annotationLabel.color,
       spans: [{ start: ann.json.start, end: ann.json.end, text: ann.rawText }]
     })),
     textLabels: { /* label definitions */ }
   }
   ```
4. Call `convertDocxToHtmlWithExternalAnnotations(docxBytes, externalAnnotations, options)`
5. Pass resulting HTML to `react-docxodus-viewer` via the `html` prop

**Annotation creation flow** (user selects text in rendered HTML):
1. User selects text in the viewer
2. Capture selection via `window.getSelection()`
3. Map selection back to character offsets in the extracted text
4. Call `onAnnotationCreate(start, end, selectedText)`
5. Backend creates `SpanAnnotation` with `{start, end}` JSON

**Validation flow**:
1. On load, call `validateExternalAnnotations(docxBytes, annotationSet)`
2. If validation fails (hash mismatch, text mismatch):
   - Show warning banner: "Document may have changed since annotations were created"
   - Offer fallback to TXT view
3. If validation passes, render normally

### 3.3 Create DocxAnnotatorWrapper

**File**: `frontend/src/components/annotator/components/wrappers/DocxAnnotatorWrapper.tsx`

Mirrors `TxtAnnotatorWrapper.tsx`:
- Manages state to minimize parent rerenders
- Filters annotations to `ServerSpanAnnotation` type only
- Handles annotation ref registration for sidebar scroll-to
- Manages DOCX file fetching and caching
- Converts chat sources to text spans

### 3.4 WASM asset management

**Options for serving WASM files**:
1. **Static assets**: Copy WASM files to `frontend/public/wasm/docxodus/` — simplest
2. **CDN**: Load from unpkg/jsdelivr — no build changes needed
3. **Bundled**: Vite can handle WASM imports with plugins

**Recommended**: Option 1 (static assets) for self-hosted deployments, with `wasmBasePath` configurable.

---

## Phase 4: Frontend — Integration into Document Viewer

### 4.1 Add file type detection utility

**File**: `frontend/src/utils/files.ts`

```typescript
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const isDocxFileType = (fileType: string | null | undefined): boolean =>
  fileType === DOCX_MIME_TYPE;
```

### 4.2 Update DocumentKnowledgeBase dispatcher

**File**: `frontend/src/components/knowledge_base/document/DocumentKnowledgeBase.tsx`

Add DOCX branch to the renderer dispatch (around line 1471):

```typescript
if (isPdfFileType(metadata.fileType)) {
  viewerContent = <PDF ... />;
} else if (isDocxFileType(metadata.fileType)) {
  viewerContent = <DocxAnnotatorWrapper ... />;  // NEW
} else if (isTextFileType(metadata.fileType)) {
  viewerContent = <TxtAnnotatorWrapper ... />;
}
```

### 4.3 Update document loading flow

In the `useEffect` that handles document loading (around line 892), add DOCX branch:

```typescript
} else if (isDocxFileType(metadata.fileType)) {
  // Fetch the DOCX file URL (same as PDF — stored in pdf_file)
  const docxUrl = await getCachedPDFUrl();  // Reuse existing function
  setDocxUrlAtom(docxUrl);
  // Also fetch raw text for search functionality
  const rawText = await getDocumentRawText();
  setDocTextAtom(rawText);
  setViewState("LOADED");
}
```

### 4.4 Add Jotai atoms for DOCX state

**File**: `frontend/src/atoms/DocumentAtom.tsx`

```typescript
export const docxUrlAtom = atom<string | null>(null);
export const docxValidationStatusAtom = atom<'valid' | 'warning' | 'error' | null>(null);
```

---

## Phase 5: Annotation Creation UX for DOCX

### 5.1 Text selection → annotation creation

The `react-docxodus-viewer` renders HTML with annotation spans. For creating NEW annotations:

**Approach**: Intercept text selection events on the viewer container.

1. Listen for `mouseup` events on the viewer container
2. Get `window.getSelection()` range
3. Walk the DOM to compute character offset from the beginning of the document text
4. The HTML rendered by Docxodus preserves document text order, so walking text nodes in DOM order gives correct character offsets
5. Create annotation mutation with `{start, end}` JSON

**Alternative approach**: Use Docxodus's `searchTextOffsets()` API:
1. Get selected text string
2. Call `searchTextOffsets(docxBytes, selectedText)` to find all occurrences
3. Find the occurrence that matches the selection position
4. Use the returned `{start, end}` offsets

### 5.2 Annotation interaction

- **Click on annotation highlight** → Select annotation in sidebar
- **Hover** → Show label tooltip (using Docxodus's annotation CSS classes)
- **Right-click** → Context menu with approve/reject/delete actions
- **Scroll-to** → When annotation selected in sidebar, scroll viewer to that position

---

## Phase 6: Search Integration

### 6.1 Text search in DOCX

The existing text search system works on `docTextAtom` (raw text). Since we extract full text server-side and store in `txt_extract_file`, search works identically to TXT:

1. User types search query
2. Frontend searches `docTextAtom` for matches → `TextSearchSpanResult[]`
3. Search results are `{start, end}` spans
4. These get projected as additional highlights in the DOCX viewer

**Implementation**: Add search result spans to the `ExternalAnnotationSet` with a distinct "search-result" label and re-project.

### 6.2 Chat source highlighting

Same approach: Convert chat source references to `{start, end}` spans and include in projection.

---

## Phase 7: Backend Tests

### 7.1 DocxParser tests

**File**: `opencontractserver/tests/test_docx_parser.py`

- Test text extraction from sample DOCX files
- Test structural annotation generation (paragraphs, headings, tables)
- Test character offset accuracy
- Test handling of complex DOCX features (nested tables, footnotes, images)
- Test edge cases (empty documents, password-protected files)
- Test `page_count` estimation
- Test that parser integrates with pipeline registry

### 7.2 DocxThumbnailGenerator tests

- Test thumbnail generation from DOCX
- Test fallback when no embedded thumbnail exists

### 7.3 Sample DOCX fixtures

Create test fixtures in `opencontractserver/tests/fixtures/`:
- `simple.docx` — Basic paragraphs and headings
- `with_tables.docx` — Tables with content
- `complex.docx` — Headers, footers, footnotes, images, lists

---

## Phase 8: Frontend Tests

### 8.1 DocxAnnotator component tests

**File**: `frontend/tests/docx-annotator.ct.tsx`

- Test DOCX loading and WASM conversion
- Test annotation projection onto HTML
- Test annotation selection/creation
- Test search result highlighting
- Test validation warning display
- Test fallback to TXT view

---

## Data Flow Diagram

```
UPLOAD FLOW:
  User uploads .docx
    → Backend: file_type = "application/vnd.openxmlformats...document"
    → Backend: Store in document.pdf_file (polymorphic)
    → Celery chain:
        1. extract_thumbnail → DocxThumbnailGenerator
        2. ingest_doc → DocxParser
           → python-docx extracts text + structure
           → Creates SpanAnnotations with {start, end} offsets
           → Saves txt_extract_file (full text)
           → page_count estimated
        3. set_doc_lock_state → unlock

RENDER FLOW:
  User opens DOCX document
    → Frontend: isDocxFileType() → true
    → Fetch DOCX file URL (same as PDF path)
    → Fetch raw text (for search)
    → Load DOCX bytes in browser
    → Docxodus WASM converts DOCX → HTML (Web Worker)
    → Fetch annotations from GraphQL (SpanAnnotations)
    → Convert to ExternalAnnotationSet
    → Validate via computeDocumentHash()
    → Project annotations via convertDocxToHtmlWithExternalAnnotations()
    → Render annotated HTML in react-docxodus-viewer

ANNOTATION CREATION FLOW:
  User selects text in DOCX viewer
    → Compute character offsets from DOM selection
    → OR use searchTextOffsets() to find exact position
    → GraphQL mutation creates SpanAnnotation with {start, end}
    → Re-fetch annotations → re-project onto HTML
```

---

## Risk Assessment & Mitigations

### Risk 1: Text offset misalignment between python-docx and Docxodus
- **Impact**: Annotations highlight wrong text
- **Mitigation**: Hash-based validation on frontend. If mismatch detected, show warning + TXT fallback.
- **Long-term fix**: Add Docxodus microservice parser that uses same text extraction as WASM module.
- **Testing**: Create a comprehensive test suite that compares python-docx and Docxodus text extraction on diverse DOCX files.

### Risk 2: WASM bundle size
- **Impact**: Slow initial load
- **Mitigation**: Lazy-load WASM only when DOCX document is opened. Web Worker prevents UI blocking. Progressive loading with placeholders.

### Risk 3: Browser compatibility (WebAssembly SIMD required)
- **Impact**: Won't work on older browsers
- **Mitigation**: Feature detection → fall back to TXT annotator if WASM SIMD unsupported. Chrome 89+, Firefox 89+, Safari 15+, Edge 89+ all support it.

### Risk 4: Annotation creation accuracy in rich HTML
- **Impact**: User selects text but offset calculation is wrong
- **Mitigation**: Use Docxodus's `searchTextOffsets()` as ground truth. Validate selected text matches expected text at computed offsets before creating annotation.

### Risk 5: Complex DOCX features (track changes, comments, embedded objects)
- **Impact**: Text extraction may miss or misorder content
- **Mitigation**: Start with body text only (paragraphs + tables). Add header/footer/footnote support incrementally. Docxodus handles rendering of these features even if we don't annotate them.

---

## Implementation Order

1. **Phase 1**: DocxParser (backend) — highest priority, enables DOCX ingestion
2. **Phase 2**: DocxThumbnailGenerator (backend) — needed for document cards
3. **Phase 4.1**: File type detection utility (frontend) — small, needed early
4. **Phase 3.1**: Install docxodus + react-docxodus-viewer dependencies
5. **Phase 3.2-3.3**: DocxAnnotator + DocxAnnotatorWrapper components
6. **Phase 4.2-4.4**: Integration into DocumentKnowledgeBase
7. **Phase 5**: Annotation creation UX
8. **Phase 6**: Search + chat source integration
9. **Phase 7-8**: Tests
10. **Phase 3.4**: WASM asset management (finalize serving strategy)

---

## Files to Create

| File | Purpose |
|------|---------|
| `opencontractserver/pipeline/parsers/docx_parser.py` | DocxParser implementation |
| `opencontractserver/pipeline/thumbnailers/docx_thumbnailer.py` | Thumbnail generation |
| `frontend/src/components/annotator/renderers/docx/DocxAnnotator.tsx` | Main DOCX renderer |
| `frontend/src/components/annotator/renderers/docx/index.ts` | Barrel export |
| `frontend/src/components/annotator/components/wrappers/DocxAnnotatorWrapper.tsx` | State wrapper |
| `opencontractserver/tests/test_docx_parser.py` | Backend tests |
| `frontend/tests/docx-annotator.ct.tsx` | Frontend component tests |

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/utils/files.ts` | Add `isDocxFileType()` utility |
| `frontend/src/components/knowledge_base/document/DocumentKnowledgeBase.tsx` | Add DOCX branch to renderer dispatch + loading flow |
| `frontend/src/atoms/DocumentAtom.tsx` | Add DOCX-specific atoms |
| `frontend/package.json` | Add docxodus + react-docxodus-viewer deps |
| `CHANGELOG.md` | Document the new feature |

## Existing Files That Need No Changes (Already Support DOCX)

| File | What's already there |
|------|---------------------|
| `opencontractserver/pipeline/base/file_types.py` | `FileTypeEnum.DOCX` + MIME mapping |
| `frontend/src/assets/configurations/constants.ts` | DOCX in `SUPPORTED_MIME_TYPES` |
| `config/graphql/pipeline_types.py` | DOCX in GraphQL FileTypeEnum |
| `opencontractserver/documents/models.py` | `file_type` field, `pdf_file` polymorphic storage |
| `opencontractserver/documents/versioning.py` | `.docx` extension mapping |
| `requirements/local.txt` | `python-docx` dependency |
| `requirements/filetypes/docx.txt` | `mammoth` dependency |
