# Image Token Architecture for PDF Processing

## Overview

This document describes the architecture for extracting, storing, and serving image tokens from PDF documents in OpenContracts. The system enables:

1. **Image Annotation**: Images embedded in PDFs can be annotated like text tokens
2. **LLM Image Analysis**: Images can be retrieved and provided to multimodal LLMs for analysis
3. **Multimodal Embeddings**: Embedders can generate embeddings from both text and images in a unified vector space

## Architecture Components

### 1. Unified PAWLs Token Structure

The PAWLs (Portable Anchored Words and Lines) format uses a **unified token array** where both text and image tokens share the same data structure. Image tokens are identified by `is_image=True`.

#### PawlsTokenPythonType (Unified)

```python
class PawlsTokenPythonType(TypedDict):
    """
    Unified token type for PAWLs data. Represents either a text token or an
    image token within a PDF page.
    """
    # Position and dimensions (in PDF points)
    x: float
    y: float
    width: float
    height: float
    text: str  # Empty string for images

    # Image-specific fields (only present when is_image=True)
    is_image: NotRequired[bool]  # True for image tokens
    image_path: NotRequired[str]  # Storage path to image file
    base64_data: NotRequired[str]  # Fallback if storage fails
    format: NotRequired[str]  # "jpeg" or "png"
    content_hash: NotRequired[str]  # SHA-256 for deduplication
    original_width: NotRequired[int]  # Original pixel dimensions
    original_height: NotRequired[int]
    image_type: NotRequired[str]  # "embedded" or "cropped"
```

#### TokenIdPythonType (Unified Reference)

```python
class TokenIdPythonType(TypedDict):
    """
    Reference to a token (text or image) within the PAWLs data structure.
    Since images are stored as tokens with is_image=True in the unified
    tokens[] array, both text and image tokens use this same type.
    """
    pageIndex: int
    tokenIndex: int
```

### 2. Storage Strategy

To avoid bloating PAWLs JSON files with inline base64 data, images are stored separately in Django's default storage backend (S3, GCS, or local filesystem).

#### Storage Path Convention

```
documents/{doc_id}/images/page_{page_idx}_img_{img_idx}.{format}
```

Example: `documents/123/images/page_0_img_2.jpeg`

#### Fallback Behavior

If storage save fails, the system falls back to inline base64 encoding. This ensures robustness while preferring the more efficient storage-based approach.

### 3. Image Extraction Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   PDF Upload    │────▶│  Parser (Docling │────▶│  Image Extract  │
│                 │     │   or LlamaParse) │     │   & Storage     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                               ┌──────────────────────────────────────┐
                               │           PAWLs JSON                 │
                               │  ┌─────────────────────────────────┐ │
                               │  │ page: { width, height, index }  │ │
                               │  │ tokens: [                       │ │
                               │  │   { text: "Hello", x, y, ... }, │ │
                               │  │   { is_image: true, image_path, │ │
                               │  │     format: "jpeg", ... },      │ │
                               │  │   { text: "World", x, y, ... }  │ │
                               │  │ ]                               │ │
                               │  └─────────────────────────────────┘ │
                               └──────────────────────────────────────┘
```

#### Extraction Methods

1. **Embedded Images**: Extracted directly from PDF using pdfplumber's image detection
2. **Cropped Regions**: For figure/chart annotations without embedded images, the region is rendered and cropped using pdf2image

### 4. Parser Integration

Both Docling and LlamaParse parsers:

1. Extract images during document parsing
2. Store images to Django storage with appropriate paths
3. Create unified image tokens in PAWLs pages (in the `tokens[]` array)
4. Set `content_modalities` on annotations based on token types

#### Docling Parser Flow

```python
def _parse_document_impl(self, user_id, doc_id, **kwargs):
    # ... parse via microservice ...

    if extract_images:
        storage_path = f"documents/{doc_id}/images"
        result = self._add_images_to_result(result, pdf_bytes, storage_path)
```

#### LlamaParse Parser Flow

```python
def _convert_json_to_opencontracts(self, document, json_results, ...):
    storage_path = f"documents/{document.pk}/images"
    images_by_page = extract_images_from_pdf(
        pdf_bytes,
        storage_path=storage_path,
        ...
    )
```

### 5. Image Retrieval for LLMs

When images need to be sent to LLMs, they are loaded on-demand from storage:

```python
from opencontractserver.utils.pdf_token_extraction import get_image_as_base64

# Get base64 data for LLM consumption
base64_data = get_image_as_base64(image_token)

# Or get full data URL
data_url = get_image_data_url(image_token)
# Returns: "data:image/jpeg;base64,..."
```

The `get_image_as_base64()` function:
1. First checks for inline `base64_data` (backwards compatibility)
2. If not present, loads from storage using `image_path`
3. Returns base64-encoded string ready for LLM APIs

### 6. Multimodal Embedder Support

The `BaseEmbedder` class uses a **single source of truth** pattern for modality support via the `supported_modalities` set:

```python
from opencontractserver.types.enums import ContentModality

class BaseEmbedder(PipelineComponentBase, ABC):
    # Single source of truth for modality support
    supported_modalities: set[ContentModality] = {ContentModality.TEXT}

    # Convenience properties derived from supported_modalities
    @property
    def is_multimodal(self) -> bool:
        return len(self.supported_modalities) > 1

    @property
    def supports_text(self) -> bool:
        return ContentModality.TEXT in self.supported_modalities

    @property
    def supports_images(self) -> bool:
        return ContentModality.IMAGE in self.supported_modalities

    def embed_text(self, text: str, **kwargs) -> Optional[list[float]]:
        """Embed text content."""

    def embed_image(self, image_base64: str, image_format: str = "jpeg", **kwargs) -> Optional[list[float]]:
        """Embed image content."""

    def embed_text_and_image(self, text: str, image_base64: str, ...) -> Optional[list[float]]:
        """Joint text-image embedding for multimodal models."""
```

The `CLIPMicroserviceEmbedder` uses CLIP ViT-L-14 which produces 768d vectors in a **unified vector space** - both text and images share the same embedding space, enabling cross-modal similarity search.

### 7. Annotation Integration

Annotations reference tokens via the `tokensJsons` field, which can include both text and image tokens:

```python
class OpenContractsSinglePageAnnotationType(TypedDict):
    bounds: BoundingBoxPythonType
    tokensJsons: list[TokenIdPythonType]  # Can reference text OR image tokens
    rawText: str
```

The `content_modalities` field on annotations tracks what types of content are referenced:

```python
class OpenContractsAnnotationPythonType(TypedDict):
    # ... other fields ...
    content_modalities: NotRequired[list[str]]  # ["TEXT"], ["IMAGE"], or ["TEXT", "IMAGE"]
```

This field is:
- Stored in an ArrayField on the Annotation model
- Indexed with a GIN index for efficient containment queries
- Used by the embedding pipeline to determine modality handling

### 8. Multimodal Embedding Pipeline

When annotations are embedded, the pipeline automatically handles multimodal content:

```
Annotation → Check content_modalities
           ├─ TEXT only → embed_text() → 768d vector
           ├─ IMAGE only → embed_images() → average → 768d vector
           └─ TEXT + IMAGE → weighted_average(text_emb, img_avg, [0.3, 0.7]) → 768d vector
```

**Weighted Averaging Configuration:**

```python
# settings/base.py
MULTIMODAL_EMBEDDING_WEIGHTS = {
    "text_weight": 0.3,   # 30% weight for text
    "image_weight": 0.7,  # 70% weight for images (multimodal annotations tend to be image-heavy)
}
```

**Key Utilities** (`opencontractserver/utils/multimodal_embeddings.py`):
- `get_annotation_image_tokens()` - Extract image tokens from annotation
- `embed_images_average()` - Embed all images and return average
- `generate_multimodal_embedding()` - Main function combining text + images
- `weighted_average_embeddings()` - Combine with configurable weights

## Configuration

### Docling Parser Settings

```python
DOCLING_EXTRACT_IMAGES = True  # Enable image extraction
DOCLING_IMAGE_FORMAT = "jpeg"  # Output format
DOCLING_IMAGE_QUALITY = 85     # JPEG quality (1-100)
DOCLING_IMAGE_DPI = 150        # Render resolution for cropping
DOCLING_MIN_IMAGE_WIDTH = 50   # Skip images smaller than this
DOCLING_MIN_IMAGE_HEIGHT = 50
```

### LlamaParse Parser Settings

```python
LLAMAPARSE_EXTRACT_IMAGES = True
LLAMAPARSE_IMAGE_FORMAT = "jpeg"
LLAMAPARSE_IMAGE_QUALITY = 85
LLAMAPARSE_IMAGE_DPI = 150
LLAMAPARSE_MIN_IMAGE_WIDTH = 50
LLAMAPARSE_MIN_IMAGE_HEIGHT = 50
```

### Multimodal Embedding Settings

```python
MULTIMODAL_EMBEDDER_URL = "http://multimodal-embedder:8000"
MULTIMODAL_EMBEDDING_WEIGHTS = {
    "text_weight": env.float("MULTIMODAL_TEXT_WEIGHT", default=0.3),
    "image_weight": env.float("MULTIMODAL_IMAGE_WEIGHT", default=0.7),
}
```

## Security Considerations

1. **Storage Access**: Images are stored within document-specific paths, inheriting document permissions
2. **Size Limits**: Minimum dimension filters prevent extraction of tiny/decorative images
3. **Content Hashing**: SHA-256 hashes enable deduplication and integrity verification
4. **Permission Checking**: Agent image tools use `_validate_resource_id_params()` to prevent unauthorized access

## Future Enhancements

1. **Image Annotation UI**: Frontend support for selecting and annotating images
2. **Modality Filtering in Search**: Filter similarity search by `content_modalities`
3. **OCR on Images**: Extract text from images for full-text search
4. **Thumbnail Generation**: Auto-generate thumbnails for faster preview
5. **Image Deduplication**: Use content hashes to avoid storing duplicate images

## File Locations

| Component | Path |
|-----------|------|
| Type definitions | `opencontractserver/types/dicts.py` |
| ContentModality enum | `opencontractserver/types/enums.py` |
| Extraction utilities | `opencontractserver/utils/pdf_token_extraction.py` |
| Multimodal embedding utils | `opencontractserver/utils/multimodal_embeddings.py` |
| Docling parser | `opencontractserver/pipeline/parsers/docling_parser_rest.py` |
| LlamaParse parser | `opencontractserver/pipeline/parsers/llamaparse_parser.py` |
| Base embedder | `opencontractserver/pipeline/base/embedder.py` |
| Multimodal embedder | `opencontractserver/pipeline/embedders/multimodal_microservice.py` |
| Embedding task | `opencontractserver/tasks/embeddings_task.py` |
| Image tools for agents | `opencontractserver/llms/tools/image_tools.py` |
| GIN index migration | `opencontractserver/annotations/migrations/0054_add_content_modalities_gin_index.py` |
| Tests | `opencontractserver/tests/test_pdf_token_extraction.py` |
