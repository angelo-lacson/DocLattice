# Image Token Architecture for PDF Processing

## Overview

This document describes the architecture for extracting, storing, and serving image tokens from PDF documents in OpenContracts. The system enables:

1. **Image Annotation**: Images embedded in PDFs can be annotated like text tokens
2. **LLM Image Analysis**: Images can be retrieved and provided to multimodal LLMs for analysis
3. **Multimodal Embeddings**: Embedders can generate embeddings from both text and images

## Architecture Components

### 1. PAWLs Data Structure Extensions

The PAWLs (Portable Anchored Words and Lines) format has been extended to support image tokens alongside text tokens.

#### PawlsImageTokenPythonType

```python
class PawlsImageTokenPythonType(TypedDict):
    # Position in PDF coordinates (same as text tokens)
    x: float
    y: float
    width: float
    height: float

    # Storage reference (PRIMARY - preferred)
    image_path: NotRequired[str]  # e.g., "documents/123/images/page_0_img_1.jpeg"

    # Inline data (SECONDARY - small thumbnails only)
    base64_data: NotRequired[str]

    # Metadata
    format: str  # "jpeg", "png", "webp"
    original_width: NotRequired[int]
    original_height: NotRequired[int]
    alt_text: NotRequired[str]
    image_type: NotRequired[str]  # "embedded", "cropped", "figure", etc.
    content_hash: NotRequired[str]  # SHA-256 for deduplication
```

#### ImageIdPythonType

```python
class ImageIdPythonType(TypedDict):
    pageIndex: int
    imageIndex: int
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
                               │  │ tokens: [ text tokens... ]      │ │
                               │  │ images: [ image tokens... ]     │ │
                               │  └─────────────────────────────────┘ │
                               └──────────────────────────────────────┘
```

#### Extraction Methods

1. **Embedded Images**: Extracted directly from PDF using pdfplumber's image detection
2. **Cropped Regions**: For figure/chart annotations without embedded images, the region is rendered and cropped using pdf2image

### 4. Parser Integration

Both Docling and LlamaParse parsers have been updated to:

1. Extract images during document parsing
2. Store images to Django storage with appropriate paths
3. Create image references in PAWLs pages
4. Link figure/image annotations to their corresponding image tokens

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

The `BaseEmbedder` class has been extended to support multimodal embedding:

```python
class BaseEmbedder(PipelineComponentBase, ABC):
    # Multimodal flags
    is_multimodal: bool = False
    supports_text: bool = True
    supports_images: bool = False

    def embed_text(self, text: str, **kwargs) -> Optional[list[float]]:
        """Embed text content."""

    def embed_image(self, image_base64: str, image_format: str = "jpeg", **kwargs) -> Optional[list[float]]:
        """Embed image content."""

    def embed_text_and_image(self, text: str, image_base64: str, ...) -> Optional[list[float]]:
        """Joint text-image embedding for multimodal models."""
```

The pipeline registry exposes these flags via GraphQL:

```graphql
type PipelineComponentType {
    name: String!
    # ... other fields ...
    is_multimodal: Boolean
    supports_text: Boolean
    supports_images: Boolean
}
```

### 7. Annotation Integration

Image references are linked to annotations via the `imagesJsons` field:

```python
class OpenContractsSinglePageAnnotationType(TypedDict):
    bounds: BoundingBoxPythonType
    tokensJsons: list[TokenIdPythonType]
    rawText: str
    imagesJsons: NotRequired[list[ImageIdPythonType]]  # Image references
```

For figure/image annotations, the parser:
1. Checks if any embedded images overlap with the annotation bounds
2. If not, crops the bounding box region as an image
3. Adds the image reference to `imagesJsons`

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

## Security Considerations

1. **Storage Access**: Images are stored within document-specific paths, inheriting document permissions
2. **Size Limits**: Minimum dimension filters prevent extraction of tiny/decorative images
3. **Content Hashing**: SHA-256 hashes enable deduplication and integrity verification

## Future Enhancements

1. **Image Annotation UI**: Frontend support for selecting and annotating images
2. **Image Search**: Vector similarity search across document images
3. **OCR on Images**: Extract text from images for full-text search
4. **Thumbnail Generation**: Auto-generate thumbnails for faster preview
5. **Image Deduplication**: Use content hashes to avoid storing duplicate images

## File Locations

| Component | Path |
|-----------|------|
| Type definitions | `opencontractserver/types/dicts.py` |
| Extraction utilities | `opencontractserver/utils/pdf_token_extraction.py` |
| Docling parser | `opencontractserver/pipeline/parsers/docling_parser_rest.py` |
| LlamaParse parser | `opencontractserver/pipeline/parsers/llamaparse_parser.py` |
| Base embedder | `opencontractserver/pipeline/base/embedder.py` |
| Pipeline registry | `opencontractserver/pipeline/registry.py` |
| Tests | `opencontractserver/tests/test_pdf_token_extraction.py` |
