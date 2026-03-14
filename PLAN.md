# DOCX Pipeline Implementation Plan

## Overview

Add first-class DOCX support to OpenContracts with a parallel ingestion pipeline and rendering tree. One backend parser (Docxodus .NET microservice), one frontend renderer (Docxodus WASM via react-docxodus-viewer).

**Architecture Summary**:
- **Backend**: `DocxodusServiceParser` — containerized .NET microservice wrapping Docxodus `OpenContractExporter.Export()`. Returns `OpenContractDocExport` JSON with structural annotations and character offsets
- **Frontend**: `react-docxodus-viewer` renders DOCX natively via WASM, projecting annotations using Docxodus `ExternalAnnotationProjector`
- **Annotation format**: `SpanAnnotation` with `{start, end}` character offsets (same as TXT), mapping to Docxodus `TextSpan` format
- **Offset alignment**: Both backend and frontend use the **same Docxodus library** → character offsets are guaranteed identical. No validation/reconciliation needed

---

## Phase 1: Backend — Docxodus Microservice

### 1.1 Build the Docxodus .NET microservice

**New repository/directory**: `docxodus-service/` (or separate repo, like Docling)

A minimal ASP.NET Core Web API wrapping Docxodus's `OpenContractExporter.Export()`.

**Project structure**:
```
docxodus-service/
├── DocxodusService.csproj        # .NET 8.0 project, references Docxodus NuGet
├── Program.cs                    # Minimal API with /parse and /health endpoints
├── Models/
│   └── ParseRequest.cs           # Request DTO
├── Dockerfile
└── .dockerignore
```

**REST API contract**:
```
POST /parse
Content-Type: application/json

Request:
{
    "filename": "contract.docx",
    "docx_base64": "<base64-encoded DOCX bytes>"
}

Response: OpenContractDocExport JSON (camelCase)
{
    "title": "Contract Title",
    "content": "Full extracted text...",
    "description": "...",
    "pageCount": 5,
    "pawlsFileContent": [
        {
            "page": {"width": 612.0, "height": 792.0, "index": 0},
            "tokens": [
                {"x": 72, "y": 72, "width": 50, "height": 12, "text": "Word"},
                ...
            ]
        },
        ...
    ],
    "labelledText": [
        {
            "id": "ann-1",
            "annotationLabel": "HEADING_1",
            "rawText": "Article 1 - Definitions",
            "page": 1,
            "annotationJson": {"start": 0, "end": 25},
            "parentId": null,
            "annotationType": "SPAN_LABEL",
            "structural": true,
            "contentModalities": ["TEXT"]
        },
        ...
    ],
    "relationships": [
        {
            "id": "rel-1",
            "relationshipLabel": "PARENT_CHILD",
            "sourceAnnotationIds": ["ann-1"],
            "targetAnnotationIds": ["ann-2", "ann-3"],
            "structural": true
        },
        ...
    ],
    "docLabels": [],
    "textLabels": {
        "HEADING_1": {"id": null, "color": "#4A90D9", "description": "Heading Level 1", ...},
        "PARAGRAPH": {"id": null, "color": "grey", "description": "Paragraph", ...},
        "TABLE": {"id": null, "color": "#E8A838", "description": "Table", ...},
        ...
    }
}

GET /health
Response: {"status": "healthy"}
```

**Core implementation** (`Program.cs`):
```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapPost("/parse", async (ParseRequest request) =>
{
    try
    {
        var docxBytes = Convert.FromBase64String(request.DocxBase64);
        var wmlDoc = new WmlDocument(request.Filename ?? "document.docx", docxBytes);
        var export = OpenContractExporter.Export(wmlDoc);

        return Results.Json(export, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: 422,
            title: "DOCX parsing failed"
        );
    }
});

app.Run();
```

**What `OpenContractExporter.Export()` produces** (already built into Docxodus):
- `title` + `description`: Extracted from DOCX core properties
- `content`: Full text in document order (paragraphs, tables, headers, footers, footnotes)
- `pageCount`: Estimated from section breaks and character density
- `pawlsFileContent`: PAWLS tokens with estimated bounding boxes per page
- `labelledText`: Structural annotations with `{start, end}` character offsets:
  - Headings (H1-H6), Paragraphs, Tables, Table Rows, Table Cells
  - List items, Headers, Footers, Footnotes, Endnotes
  - Section boundaries
- `relationships`: Parent-child hierarchy (heading → paragraphs, table → rows → cells)
- `textLabels`: Label definitions with colors and icons

**Dockerfile**:
```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "DocxodusService.dll"]
```

### 1.2 Create `DocxodusServiceParser` class

**File**: `opencontractserver/pipeline/parsers/docxodus_parser.py`

Mirrors the existing `DoclingParser` pattern:

```python
class DocxodusServiceParser(BaseParser):
    """
    Parser that delegates DOCX processing to a Docxodus microservice via REST API.
    Uses the same Docxodus library as the frontend WASM renderer, guaranteeing
    that character offsets in annotations align perfectly with the frontend.
    """

    title = "Docxodus Parser (REST)"
    description = "Parses DOCX documents using Docxodus microservice API."
    author = "OpenContracts Team"
    dependencies = ["requests"]
    supported_file_types = [FileTypeEnum.DOCX]

    @dataclass
    class Settings:
        service_url: str = field(
            default="",
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.REQUIRED,
                    required=True,
                    description="URL of the Docxodus parser microservice",
                    env_var="DOCXODUS_PARSER_SERVICE_URL",
                )
            },
        )
        request_timeout: int = field(
            default=120,
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description="Request timeout in seconds",
                    env_var="DOCXODUS_PARSER_TIMEOUT",
                )
            },
        )
```

**Implementation** (following DoclingParser's `_parse_single_chunk_impl` pattern):
1. Read DOCX bytes from `document.pdf_file` via `default_storage`
2. Base64-encode and POST to the Docxodus microservice `/parse` endpoint
3. Receive `OpenContractDocExport` JSON response
4. Normalize field names (camelCase → snake_case) via `_normalize_response()` — same pattern as DoclingParser
5. Return the normalized result directly (it's already the right format)
6. Handle errors:
   - `Timeout` / `ConnectionError` → `DocumentParsingError(is_transient=True)` → auto-retry
   - `4xx` responses → `DocumentParsingError(is_transient=False)` → fail permanently
   - `5xx` responses → `DocumentParsingError(is_transient=True)` → auto-retry

**No chunking needed**: DOCX files are typically much smaller than PDFs. The microservice processes the full file in one request. If needed later, chunking by sections could be added.

### 1.3 Docker Compose integration

**In `local.yml`** (add alongside `docling-parser`):
```yaml
docxodus-parser:
    image: jscrudato/docxodus-service
    container_name: docxodus-parser
    environment:
      ASPNETCORE_URLS: "http://+:8080"
```

Add `docxodus-parser` to `depends_on` for `django` and `celeryworker` services (same pattern as `docling-parser`).

**In `.envs/.local/.django`**:
```
DOCXODUS_PARSER_SERVICE_URL=http://docxodus-parser:8080/parse
```

**In `production.yml`**: Same service definition, potentially with health checks and resource limits.

### 1.4 Pipeline registration

No manual registration needed — auto-discovery finds `DocxodusServiceParser` in `opencontractserver/pipeline/parsers/`. The parser declares `supported_file_types = [FileTypeEnum.DOCX]` and gets automatically registered.

Default preferred parser mapping (via PipelineSettings or env):
```
"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DocxodusServiceParser"
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
    supported_file_types = [FileTypeEnum.DOCX]
```

**Implementation** (two-tier approach):
1. **Try embedded thumbnail first**: DOCX files are ZIP archives. Some contain `docProps/thumbnail.jpeg`. Extract via `zipfile` if present — no extra dependencies needed.
2. **Fall back to text render**: Extract first ~500 chars of text via the `txt_extract_file` (populated by the parser), render as text-based thumbnail using Pillow (same approach as `TextThumbnailGenerator`).

**Key file to reference**: `opencontractserver/pipeline/thumbnailers/text_thumbnailer.py`

---

## Phase 3: Frontend — DOCX Viewer Component

### 3.1 Install dependencies

```bash
cd frontend
yarn add docxodus react-docxodus-viewer
```

Copy WASM files to `frontend/public/wasm/docxodus/` for self-hosted deployments.

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
  annotations: ServerSpanAnnotation[];       // From backend
  searchResults: TextSearchSpanResult[];     // Text search highlights
  visibleLabels: Set<string>;               // Filter
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
2. Use Docxodus's `searchTextOffsets(docxBytes, selectedText)` to find exact offsets
3. If multiple occurrences, use DOM position to disambiguate
4. Call `onAnnotationCreate(start, end, selectedText)`
5. Backend creates `SpanAnnotation` with `{start, end}` JSON

**No validation needed**: Since both the backend parser (Docxodus .NET) and frontend renderer (Docxodus WASM) use the same library, offsets are guaranteed aligned.

### 3.3 Create DocxAnnotatorWrapper

**File**: `frontend/src/components/annotator/components/wrappers/DocxAnnotatorWrapper.tsx`

Mirrors `TxtAnnotatorWrapper.tsx`:
- Manages state to minimize parent rerenders
- Filters annotations to `ServerSpanAnnotation` type only
- Handles annotation ref registration for sidebar scroll-to
- Manages DOCX file fetching and caching
- Converts chat sources to text spans

### 3.4 WASM asset management

**Recommended**: Static assets in `frontend/public/wasm/docxodus/` with `wasmBasePath` prop pointing there. For CDN deployments, override via environment variable.

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

Add DOCX branch to the renderer dispatch:

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

Add DOCX branch to the document loading `useEffect`:

```typescript
} else if (isDocxFileType(metadata.fileType)) {
  // Fetch the DOCX file URL (same as PDF — stored in pdf_file)
  const docxUrl = await getCachedPDFUrl();
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
```

---

## Phase 5: Annotation Creation UX for DOCX

### 5.1 Text selection → annotation creation

Use Docxodus's `searchTextOffsets()` API for reliable offset computation:

1. Listen for `mouseup` events on the viewer container
2. Get selected text via `window.getSelection().toString()`
3. Call `searchTextOffsets(docxBytes, selectedText)` → returns all `{start, end}` matches
4. Use DOM position context to pick the correct occurrence if multiple matches
5. Create annotation mutation with `{start, end}` JSON

### 5.2 Annotation interaction

- **Click on annotation highlight** → Select annotation in sidebar (via `data-annotation-id` attributes on projected `<span>` elements)
- **Hover** → Show label tooltip (Docxodus supports `above`, `inline`, and `tooltip` annotation modes)
- **Right-click** → Context menu with approve/reject/delete actions
- **Scroll-to** → When annotation selected in sidebar, scroll to the annotation's `<span>` element in the viewer

---

## Phase 6: Search Integration

### 6.1 Text search in DOCX

The existing text search works on `docTextAtom` (raw text from `txt_extract_file`):

1. User types search query
2. Frontend searches `docTextAtom` for matches → `TextSearchSpanResult[]`
3. Search results are `{start, end}` spans
4. These get projected as additional highlights via the `ExternalAnnotationSet` with a special "search-result" label
5. Re-call `convertDocxToHtmlWithExternalAnnotations()` with updated set

### 6.2 Chat source highlighting

Same approach: Convert chat source references to `{start, end}` spans and include in projection.

---

## Phase 7: Backend Tests

### 7.1 DocxodusServiceParser tests

**File**: `opencontractserver/tests/test_docxodus_parser.py`

- Test request/response format with mocked microservice (using `responses` or `requests-mock`)
- Test base64 encoding of DOCX bytes
- Test timeout handling → `DocumentParsingError(is_transient=True)`
- Test connection error handling → `DocumentParsingError(is_transient=True)`
- Test 4xx error handling → `DocumentParsingError(is_transient=False)`
- Test 5xx error handling → `DocumentParsingError(is_transient=True)`
- Test response normalization (camelCase → snake_case)
- Test that returned `OpenContractDocExport` integrates correctly with `save_parsed_data()`
- Test pipeline registry auto-discovery

### 7.2 DocxThumbnailGenerator tests

- Test embedded thumbnail extraction from DOCX ZIP
- Test fallback to text render when no embedded thumbnail
- Test thumbnail dimensions (300x300)

### 7.3 Integration test with real microservice

- Test end-to-end: Upload DOCX → parse → annotations created → text extracted
- Use sample DOCX fixtures
- Verify structural annotations have correct labels and offsets
- Verify parent-child relationships

### 7.4 Sample DOCX fixtures

Create test fixtures in `opencontractserver/tests/fixtures/`:
- `simple.docx` — Basic paragraphs and headings
- `with_tables.docx` — Tables with content
- `complex.docx` — Headers, footers, footnotes, images, lists, nested tables

---

## Phase 8: Frontend Tests

### 8.1 DocxAnnotator component tests

**File**: `frontend/tests/docx-annotator.ct.tsx`

- Test DOCX loading and WASM conversion
- Test annotation projection onto HTML
- Test annotation selection/creation
- Test search result highlighting
- Test WASM SIMD feature detection + fallback

---

## Data Flow Diagram

```
UPLOAD FLOW:
  User uploads .docx
    → Backend: file_type = "application/vnd.openxmlformats...document"
    → Backend: Store in document.pdf_file (polymorphic)
    → Celery chain:
        1. extract_thumbnail → DocxThumbnailGenerator
               Try embedded thumbnail from DOCX ZIP
               Fall back to text-based thumbnail
        2. ingest_doc → DocxodusServiceParser
               Read DOCX bytes from document.pdf_file
               Base64-encode, POST to Docxodus .NET microservice
               Microservice calls OpenContractExporter.Export()
               Returns OpenContractDocExport JSON:
                 - content (full text)
                 - pawlsFileContent (tokens with estimated bounding boxes)
                 - labelledText (structural annotations with {start, end})
                 - relationships (parent-child hierarchy)
                 - textLabels (label definitions)
               Normalize camelCase → snake_case
               save_parsed_data() creates:
                 - txt_extract_file (full text)
                 - SpanAnnotations with {start, end} offsets
                 - AnnotationLabels (HEADING_1, PARAGRAPH, TABLE, etc.)
                 - Relationships (heading→paragraphs, table→rows→cells)
        3. set_doc_lock_state → unlock

RENDER FLOW:
  User opens DOCX document
    → Frontend: isDocxFileType() → true
    → Fetch DOCX file URL (same storage path as PDF)
    → Fetch raw text (for search)
    → Load DOCX bytes in browser
    → Docxodus WASM converts DOCX → HTML (Web Worker, non-blocking)
    → Fetch annotations from GraphQL (SpanAnnotations)
    → Convert to ExternalAnnotationSet (Docxodus TextSpan format)
    → Project annotations via convertDocxToHtmlWithExternalAnnotations()
    → Render annotated HTML in react-docxodus-viewer
       Full DOCX formatting preserved: tables, styles, headers, lists

ANNOTATION CREATION FLOW:
  User selects text in DOCX viewer
    → Get selected text string
    → Call searchTextOffsets(docxBytes, selectedText) for exact offsets
    → Disambiguate if multiple occurrences via DOM position
    → GraphQL mutation creates SpanAnnotation with {start, end}
    → Re-fetch annotations → re-project onto HTML
```

---

## Risk Assessment & Mitigations

### Risk 1: Docxodus microservice availability
- **Impact**: DOCX parsing fails if .NET service is down
- **Mitigation**: `DocumentParsingError(is_transient=True)` → auto-retry with backoff (3x, 60s→300s, same as DoclingParser). Health check endpoint for Docker Compose. Document stays in PROCESSING state until retry succeeds.

### Risk 2: WASM bundle size
- **Impact**: Slow initial load
- **Mitigation**: Lazy-load WASM only when DOCX document is opened. Web Worker prevents UI blocking. Progressive loading with page placeholders. SkiaSharp disabled in WASM build (~15MB savings).

### Risk 3: Browser compatibility (WebAssembly SIMD required)
- **Impact**: Won't work on older browsers
- **Mitigation**: Feature detection → fall back to TXT annotator if WASM SIMD unsupported. Chrome 89+, Firefox 89+, Safari 15+, Edge 89+ all support it (covers ~97% of browsers).

### Risk 4: Annotation creation accuracy in rich HTML
- **Impact**: User selects text but offset calculation is wrong
- **Mitigation**: Never compute offsets from DOM walking. Always use Docxodus's `searchTextOffsets()` WASM API as ground truth. Validate selected text matches expected text before creating annotation.

### Risk 5: Large DOCX files
- **Impact**: Slow parsing, memory pressure on .NET microservice
- **Mitigation**: Set reasonable `request_timeout` (120s default). DOCX files are typically much smaller than PDFs. Monitor microservice memory usage. Add chunking by sections later if needed.

---

## Implementation Order

1. **Phase 1**: Docxodus microservice + `DocxodusServiceParser` — enables DOCX ingestion
2. **Phase 2**: DocxThumbnailGenerator — needed for document cards
3. **Phase 4.1**: `isDocxFileType()` utility
4. **Phase 3.1**: Install docxodus + react-docxodus-viewer deps
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
| `opencontractserver/pipeline/parsers/docxodus_parser.py` | DocxodusServiceParser (REST microservice client) |
| `opencontractserver/pipeline/thumbnailers/docx_thumbnailer.py` | Thumbnail generation |
| `frontend/src/components/annotator/renderers/docx/DocxAnnotator.tsx` | Main DOCX renderer |
| `frontend/src/components/annotator/renderers/docx/index.ts` | Barrel export |
| `frontend/src/components/annotator/components/wrappers/DocxAnnotatorWrapper.tsx` | State wrapper |
| `opencontractserver/tests/test_docxodus_parser.py` | Backend parser tests |
| `frontend/tests/docx-annotator.ct.tsx` | Frontend component tests |
| `docxodus-service/` (or separate repo) | .NET microservice source |

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/utils/files.ts` | Add `isDocxFileType()` utility |
| `frontend/src/components/knowledge_base/document/DocumentKnowledgeBase.tsx` | Add DOCX branch to renderer dispatch + loading flow |
| `frontend/src/atoms/DocumentAtom.tsx` | Add DOCX-specific atoms |
| `frontend/package.json` | Add docxodus + react-docxodus-viewer deps |
| `local.yml` | Add `docxodus-parser` service + depends_on |
| `production.yml` | Add `docxodus-parser` service |
| `.envs/.local/.django` | Add `DOCXODUS_PARSER_SERVICE_URL` |
| `CHANGELOG.md` | Document the new feature |

## Existing Files That Need No Changes (Already Support DOCX)

| File | What's already there |
|------|---------------------|
| `opencontractserver/pipeline/base/file_types.py` | `FileTypeEnum.DOCX` + MIME mapping |
| `frontend/src/assets/configurations/constants.ts` | DOCX in `SUPPORTED_MIME_TYPES` |
| `config/graphql/pipeline_types.py` | DOCX in GraphQL FileTypeEnum |
| `opencontractserver/documents/models.py` | `file_type` field, `pdf_file` polymorphic storage |
| `opencontractserver/documents/versioning.py` | `.docx` extension mapping |
