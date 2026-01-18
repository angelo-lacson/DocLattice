# Image Token Implementation Plan

## Overview

This plan completes the image token support for PDF processing, addressing gaps identified in PR #797 review. The implementation is organized into phases with clear dependencies.

**Goals:**
1. Complete parsing pipeline image capture
2. Enable multimodal embedding capabilities
3. Provide agent/LLM image access tools
4. Add frontend image annotation display
5. Address bug fixes and security concerns

---

## Phase 1: Bug Fixes & Defensive Improvements (Day 1)

### 1.1 Fix Index Out of Bounds Risk
**File:** `opencontractserver/pipeline/parsers/docling_parser_rest.py:386`

```python
# Current (risky):
current_img_count = len(pawls_pages[page_idx].get("images", [])) if page_idx < len(pawls_pages) else 0

# Fixed (defensive):
current_img_count = 0
if page_idx < len(pawls_pages) and isinstance(pawls_pages[page_idx], dict):
    current_img_count = len(pawls_pages[page_idx].get("images", []))
```

Apply same fix in `llamaparse_parser.py:463` and `llamaparse_parser.py:547`.

### 1.2 Add Image Size Limits
**File:** `opencontractserver/utils/pdf_token_extraction.py`

Add constants and validation:
```python
# At top of file
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB per image
MAX_TOTAL_IMAGES_SIZE_BYTES = 100 * 1024 * 1024  # 100MB total per document

def extract_images_from_pdf(...):
    # Add size tracking
    total_size = 0

    # In image processing loop, add:
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        logger.warning(f"Skipping oversized image ({len(image_bytes)} bytes)")
        continue
    total_size += len(image_bytes)
    if total_size > MAX_TOTAL_IMAGES_SIZE_BYTES:
        logger.warning("Total image size limit reached, stopping extraction")
        break
```

### 1.3 Add Missing Docstrings
**File:** `opencontractserver/utils/pdf_token_extraction.py:385`

```python
def _save_image_to_storage(
    image_bytes: bytes,
    storage_path: str,
    page_idx: int,
    img_idx: int,
    image_format: str,
) -> Optional[str]:
    """
    Save image bytes to Django storage (S3, GCS, local filesystem).

    Args:
        image_bytes: The raw image bytes to save.
        storage_path: Base path for storing images (e.g., "documents/123/images").
        page_idx: 0-based page index.
        img_idx: 0-based image index within the page.
        image_format: Image format ("jpeg" or "png").

    Returns:
        The full storage path where the image was saved (e.g.,
        "documents/123/images/page_0_img_1.jpg"), or None on failure.
    """
```

---

## Phase 2: Agent Image Tools (Day 1-2)

### 2.1 Create Image Retrieval Tool
**File:** `opencontractserver/llms/tools/image_tools.py` (NEW)

```python
"""
Image retrieval tools for LLM agents.

Provides tools to access document images for multimodal analysis.
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field

from opencontractserver.annotations.models import Annotation
from opencontractserver.documents.models import Document
from opencontractserver.utils.pdf_token_extraction import (
    get_image_as_base64,
    get_image_data_url,
)
from opencontractserver.types.dicts import PawlsImageTokenPythonType

logger = logging.getLogger(__name__)


class ImageReference(BaseModel):
    """Reference to an image in a document."""
    page_index: int = Field(description="0-based page index")
    image_index: int = Field(description="0-based image index on the page")
    width: float = Field(description="Image width in PDF points")
    height: float = Field(description="Image height in PDF points")
    image_type: Optional[str] = Field(None, description="Type: embedded, cropped, figure")
    alt_text: Optional[str] = Field(None, description="Alt text if available")


class ImageData(BaseModel):
    """Image data ready for LLM consumption."""
    base64_data: str = Field(description="Base64-encoded image data")
    format: str = Field(description="Image format (jpeg, png)")
    data_url: str = Field(description="Data URL for embedding")
    page_index: int
    image_index: int


def list_document_images(
    document_id: int,
    page_index: Optional[int] = None,
) -> list[ImageReference]:
    """
    List all images in a document, optionally filtered by page.

    Args:
        document_id: The document ID.
        page_index: Optional page filter (0-based).

    Returns:
        List of ImageReference objects.
    """
    try:
        document = Document.objects.get(pk=document_id)
        pawls_content = document.pawls_parse_file

        if not pawls_content:
            return []

        # Parse PAWLS content if it's a file reference
        if hasattr(pawls_content, 'read'):
            import json
            pawls_data = json.load(pawls_content)
        else:
            pawls_data = pawls_content

        images = []
        for page_idx, page in enumerate(pawls_data):
            if page_index is not None and page_idx != page_index:
                continue

            page_images = page.get("images", [])
            for img_idx, img_token in enumerate(page_images):
                images.append(ImageReference(
                    page_index=page_idx,
                    image_index=img_idx,
                    width=img_token.get("width", 0),
                    height=img_token.get("height", 0),
                    image_type=img_token.get("image_type"),
                    alt_text=img_token.get("alt_text"),
                ))

        return images
    except Document.DoesNotExist:
        logger.warning(f"Document {document_id} not found")
        return []
    except Exception as e:
        logger.error(f"Error listing images for document {document_id}: {e}")
        return []


def get_document_image(
    document_id: int,
    page_index: int,
    image_index: int,
) -> Optional[ImageData]:
    """
    Get image data for a specific image in a document.

    Args:
        document_id: The document ID.
        page_index: 0-based page index.
        image_index: 0-based image index on the page.

    Returns:
        ImageData with base64 content, or None if not found.
    """
    try:
        document = Document.objects.get(pk=document_id)
        pawls_content = document.pawls_parse_file

        if not pawls_content:
            return None

        # Parse PAWLS content
        if hasattr(pawls_content, 'read'):
            import json
            pawls_data = json.load(pawls_content)
        else:
            pawls_data = pawls_content

        if page_index >= len(pawls_data):
            return None

        page = pawls_data[page_index]
        page_images = page.get("images", [])

        if image_index >= len(page_images):
            return None

        img_token: PawlsImageTokenPythonType = page_images[image_index]

        base64_data = get_image_as_base64(img_token)
        if not base64_data:
            return None

        data_url = get_image_data_url(img_token)

        return ImageData(
            base64_data=base64_data,
            format=img_token.get("format", "jpeg"),
            data_url=data_url or f"data:image/{img_token.get('format', 'jpeg')};base64,{base64_data}",
            page_index=page_index,
            image_index=image_index,
        )
    except Document.DoesNotExist:
        logger.warning(f"Document {document_id} not found")
        return None
    except Exception as e:
        logger.error(f"Error getting image from document {document_id}: {e}")
        return None


def get_annotation_images(annotation_id: int) -> list[ImageData]:
    """
    Get all images referenced by an annotation.

    Args:
        annotation_id: The annotation ID.

    Returns:
        List of ImageData for images in this annotation's bounds.
    """
    try:
        annotation = Annotation.objects.select_related('document').get(pk=annotation_id)
        document = annotation.document

        # Get imagesJsons from annotation_json
        annotation_json = annotation.json or {}

        images = []
        for page_key, page_data in annotation_json.items():
            if not isinstance(page_data, dict):
                continue

            image_refs = page_data.get("imagesJsons", [])
            for ref in image_refs:
                page_idx = ref.get("pageIndex")
                img_idx = ref.get("imageIndex")
                if page_idx is not None and img_idx is not None:
                    img_data = get_document_image(document.pk, page_idx, img_idx)
                    if img_data:
                        images.append(img_data)

        return images
    except Annotation.DoesNotExist:
        logger.warning(f"Annotation {annotation_id} not found")
        return []
    except Exception as e:
        logger.error(f"Error getting annotation images: {e}")
        return []
```

### 2.2 Register Image Tools in Tool Factory
**File:** `opencontractserver/llms/tools/tool_factory.py`

Add imports and tool definitions:
```python
from opencontractserver.llms.tools.image_tools import (
    list_document_images,
    get_document_image,
    get_annotation_images,
    ImageReference,
    ImageData,
)

# Add to TOOL_DEFINITIONS dict
"list_document_images": ToolDefinition(
    name="list_document_images",
    description="List all images in a document. Use page_index to filter to a specific page.",
    function=list_document_images,
    parameters_schema={
        "type": "object",
        "properties": {
            "document_id": {"type": "integer", "description": "Document ID"},
            "page_index": {"type": "integer", "description": "Optional page filter (0-based)"},
        },
        "required": ["document_id"],
    },
),
"get_document_image": ToolDefinition(
    name="get_document_image",
    description="Get image data (base64) for a specific image. Returns data URL for LLM vision input.",
    function=get_document_image,
    parameters_schema={
        "type": "object",
        "properties": {
            "document_id": {"type": "integer"},
            "page_index": {"type": "integer"},
            "image_index": {"type": "integer"},
        },
        "required": ["document_id", "page_index", "image_index"],
    },
),
"get_annotation_images": ToolDefinition(
    name="get_annotation_images",
    description="Get all images within an annotation's bounds. Use for figure/chart annotations.",
    function=get_annotation_images,
    parameters_schema={
        "type": "object",
        "properties": {
            "annotation_id": {"type": "integer"},
        },
        "required": ["annotation_id"],
    },
),
```

### 2.3 Add Permission Checks to Image Tools
**File:** `opencontractserver/llms/tools/image_tools.py`

Add permission wrapper:
```python
from opencontractserver.utils.permissioning import user_has_permission_for_obj
from opencontractserver.types.enums import PermissionTypes

def get_document_image_with_permission(
    user,
    document_id: int,
    page_index: int,
    image_index: int,
) -> Optional[ImageData]:
    """Permission-checked image retrieval."""
    try:
        document = Document.objects.get(pk=document_id)
        if not user_has_permission_for_obj(
            user, document, PermissionTypes.READ, include_group_permissions=True
        ):
            logger.warning(f"User {user} lacks permission for document {document_id}")
            return None
        return get_document_image(document_id, page_index, image_index)
    except Document.DoesNotExist:
        return None  # Same response for missing or unauthorized (IDOR protection)
```

---

## Phase 3: GraphQL Image Access (Day 2)

### 3.1 Add Image Fields to DocumentType
**File:** `config/graphql/graphene_types.py`

```python
class ImageTokenType(graphene.ObjectType):
    """Image token from PAWLs data."""
    page_index = graphene.Int(required=True)
    image_index = graphene.Int(required=True)
    x = graphene.Float(required=True)
    y = graphene.Float(required=True)
    width = graphene.Float(required=True)
    height = graphene.Float(required=True)
    format = graphene.String(required=True)
    image_type = graphene.String()
    alt_text = graphene.String()
    # Note: base64_data intentionally NOT exposed here for performance
    # Use getDocumentImage query for actual image data


class DocumentType(...):
    # Add new field
    images = graphene.List(
        ImageTokenType,
        page_index=graphene.Int(description="Filter to specific page"),
        description="Images extracted from document (metadata only, use getDocumentImage for data)"
    )

    def resolve_images(self, info, page_index=None):
        """Resolve document images with permission check."""
        user = info.context.user
        if not user_has_permission_for_obj(
            user, self, PermissionTypes.READ, include_group_permissions=True
        ):
            return []

        pawls_content = self.pawls_parse_file
        if not pawls_content:
            return []

        # ... parse and return images
```

### 3.2 Add getDocumentImage Query
**File:** `config/graphql/queries.py`

```python
class Query(graphene.ObjectType):
    # Add new query
    document_image = graphene.Field(
        graphene.String,  # Returns base64 data URL
        document_id=graphene.ID(required=True),
        page_index=graphene.Int(required=True),
        image_index=graphene.Int(required=True),
        description="Get base64 data URL for a specific document image"
    )

    def resolve_document_image(self, info, document_id, page_index, image_index):
        from opencontractserver.llms.tools.image_tools import get_document_image_with_permission

        user = info.context.user
        doc_pk = from_global_id(document_id)[1]

        result = get_document_image_with_permission(user, int(doc_pk), page_index, image_index)
        if result:
            return result.data_url
        return None
```

---

## Phase 4: Frontend Image Display (Day 2-3)

### 4.1 Add Image Token Types
**File:** `frontend/src/types/annotations.ts`

```typescript
export interface ImageToken {
  pageIndex: number;
  imageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  format: string;
  imageType?: string;
  altText?: string;
}

export interface ImageReference {
  pageIndex: number;
  imageIndex: number;
}

// Extend existing SinglePageAnnotation
export interface SinglePageAnnotation {
  bounds: BoundingBox;
  tokensJsons: TokenReference[];
  rawText: string;
  imagesJsons?: ImageReference[];  // Add this
}
```

### 4.2 Add Image Display Component
**File:** `frontend/src/components/annotator/renderers/pdf/ImageAnnotationOverlay.tsx` (NEW)

```typescript
import React, { useMemo } from "react";
import { useQuery, gql } from "@apollo/client";

interface ImageAnnotationOverlayProps {
  pageIndex: number;
  images: ImageToken[];
  scale: number;
  showImages: boolean;
}

const GET_DOCUMENT_IMAGE = gql`
  query GetDocumentImage($documentId: ID!, $pageIndex: Int!, $imageIndex: Int!) {
    documentImage(documentId: $documentId, pageIndex: $pageIndex, imageIndex: $imageIndex)
  }
`;

export const ImageAnnotationOverlay: React.FC<ImageAnnotationOverlayProps> = ({
  pageIndex,
  images,
  scale,
  showImages,
}) => {
  if (!showImages || !images.length) return null;

  return (
    <div className="image-annotation-layer">
      {images.map((img, idx) => (
        <ImageBoundingBox
          key={`${pageIndex}-${idx}`}
          image={img}
          scale={scale}
        />
      ))}
    </div>
  );
};

// Shows bounding box for image with hover preview
const ImageBoundingBox: React.FC<{ image: ImageToken; scale: number }> = ({
  image,
  scale,
}) => {
  const style = useMemo(() => ({
    position: "absolute" as const,
    left: image.x * scale,
    top: image.y * scale,
    width: image.width * scale,
    height: image.height * scale,
    border: "2px dashed rgba(59, 130, 246, 0.5)",
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    cursor: "pointer",
  }), [image, scale]);

  return (
    <div style={style} title={image.altText || `Image ${image.imageIndex}`}>
      <span className="image-badge">📷</span>
    </div>
  );
};
```

### 4.3 Add Toggle for Image Visibility
**File:** `frontend/src/components/widgets/popups/ViewSettingsPopup.tsx`

Add toggle for showing/hiding image annotations:
```typescript
// Add to ViewSettingsPopup
<Toggle
  label="Show Image Regions"
  checked={showImageAnnotations}
  onChange={setShowImageAnnotations}
/>
```

### 4.4 Update PDFPage to Render Images
**File:** `frontend/src/components/annotator/renderers/pdf/PDFPage.tsx`

```typescript
// Import new component
import { ImageAnnotationOverlay } from "./ImageAnnotationOverlay";

// In render, add after annotation layer:
{pageData?.images && (
  <ImageAnnotationOverlay
    pageIndex={pageIndex}
    images={pageData.images}
    scale={scale}
    showImages={showImageAnnotations}
  />
)}
```

---

## Phase 5: Image Cleanup on Document Delete (Day 3)

### 5.1 Add Signal Handler for Cleanup
**File:** `opencontractserver/documents/signals.py`

```python
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from django.core.files.storage import default_storage

from opencontractserver.documents.models import Document

import logging

logger = logging.getLogger(__name__)


@receiver(pre_delete, sender=Document)
def cleanup_document_images(sender, instance, **kwargs):
    """
    Delete extracted images when a document is deleted.

    Images are stored at: documents/{doc_id}/images/
    """
    if getattr(instance, '_skip_signals', False):
        return

    try:
        image_path = f"documents/{instance.pk}/images/"

        # List and delete all files in the directory
        try:
            dirs, files = default_storage.listdir(image_path)
            for filename in files:
                file_path = f"{image_path}{filename}"
                try:
                    default_storage.delete(file_path)
                    logger.debug(f"Deleted image: {file_path}")
                except Exception as e:
                    logger.warning(f"Failed to delete image {file_path}: {e}")

            # Try to remove the directory (may fail if not empty or not supported)
            # This is optional - empty directories are harmless
        except FileNotFoundError:
            pass  # No images directory exists
        except Exception as e:
            logger.warning(f"Error listing images for document {instance.pk}: {e}")
    except Exception as e:
        logger.error(f"Error in cleanup_document_images: {e}")
```

### 5.2 Register Signal in App Config
**File:** `opencontractserver/documents/apps.py`

```python
def ready(self):
    import opencontractserver.documents.signals  # noqa
```

---

## Phase 6: Tests (Day 3-4)

### 6.1 Integration Test with Real PDF
**File:** `opencontractserver/tests/test_pdf_image_extraction_integration.py` (NEW)

```python
"""
Integration tests for image extraction with real PDFs.

Uses fixture PDF files to test end-to-end image extraction pipeline.
"""

import json
from pathlib import Path

from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.parsers.docling_parser_rest import DoclingParser
from opencontractserver.utils.pdf_token_extraction import extract_images_from_pdf


class TestImageExtractionIntegration(TestCase):
    """Integration tests with real PDF fixtures."""

    fixtures_path = Path(__file__).parent / "fixtures"

    def test_extract_images_from_pdf_with_embedded_images(self):
        """Test extraction from a PDF with embedded images."""
        # Use a fixture PDF with known images
        pdf_path = self.fixtures_path / "pdf_with_images.pdf"
        if not pdf_path.exists():
            self.skipTest("Fixture pdf_with_images.pdf not found")

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        images_by_page = extract_images_from_pdf(
            pdf_bytes,
            min_width=20,
            min_height=20,
        )

        # Verify images were extracted
        total_images = sum(len(imgs) for imgs in images_by_page.values())
        self.assertGreater(total_images, 0, "Expected at least one image")

        # Verify image token structure
        for page_idx, images in images_by_page.items():
            for img in images:
                self.assertIn("x", img)
                self.assertIn("y", img)
                self.assertIn("width", img)
                self.assertIn("height", img)
                self.assertIn("format", img)
                # Should have either base64_data or image_path
                self.assertTrue(
                    "base64_data" in img or "image_path" in img,
                    "Image must have base64_data or image_path"
                )


class TestImageToolsPermissions(TestCase):
    """Test permission enforcement for image tools."""

    def test_get_document_image_requires_read_permission(self):
        """Verify that image access respects document permissions."""
        from opencontractserver.llms.tools.image_tools import get_document_image_with_permission
        from opencontractserver.tests.factories import UserFactory, DocumentFactory

        owner = UserFactory()
        other_user = UserFactory()
        doc = DocumentFactory(creator=owner, is_public=False)

        # Owner should have access (via creator)
        # Note: Would need pawls data for actual test

        # Other user should not have access
        result = get_document_image_with_permission(other_user, doc.pk, 0, 0)
        self.assertIsNone(result)
```

### 6.2 GraphQL Query Tests
**File:** `opencontractserver/tests/test_document_image_queries.py` (NEW)

```python
"""Tests for document image GraphQL queries."""

from django.test import TestCase
from graphene_django.utils.testing import GraphQLTestCase

from opencontractserver.tests.factories import UserFactory, DocumentFactory


class TestDocumentImageQueries(GraphQLTestCase):
    """Test GraphQL image queries with permission checks."""

    def test_document_images_query_returns_metadata(self):
        """Test that images query returns image metadata."""
        user = UserFactory()
        doc = DocumentFactory(creator=user)

        # ... test implementation

    def test_document_image_query_returns_base64(self):
        """Test that documentImage query returns base64 data URL."""
        pass

    def test_unauthorized_user_cannot_access_images(self):
        """Test IDOR protection for image access."""
        pass
```

### 6.3 BaseEmbedder Multimodal Tests
**File:** `opencontractserver/tests/test_embedder_multimodal.py` (NEW)

```python
"""Tests for BaseEmbedder multimodal capabilities."""

from django.test import TestCase
from opencontractserver.pipeline.base.embedder import BaseEmbedder


class MockMultimodalEmbedder(BaseEmbedder):
    """Test embedder with multimodal support."""
    is_multimodal = True
    supports_text = True
    supports_images = True
    vector_size = 768

    def _embed_text_impl(self, text, **kwargs):
        return [0.1] * self.vector_size

    def _embed_image_impl(self, image_base64, image_format="jpeg", **kwargs):
        return [0.2] * self.vector_size


class TestBaseEmbedderMultimodal(TestCase):
    """Test multimodal embedder interface."""

    def test_text_only_embedder_rejects_images(self):
        """Text-only embedder should return None for image embedding."""
        class TextOnlyEmbedder(BaseEmbedder):
            def _embed_text_impl(self, text, **kwargs):
                return [0.1] * 384

        embedder = TextOnlyEmbedder()
        result = embedder.embed_image("base64data")
        self.assertIsNone(result)

    def test_multimodal_embedder_accepts_images(self):
        """Multimodal embedder should embed images."""
        embedder = MockMultimodalEmbedder()
        result = embedder.embed_image("base64data")
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 768)

    def test_multimodal_flags_exposed(self):
        """Test that multimodal flags are accessible."""
        embedder = MockMultimodalEmbedder()
        self.assertTrue(embedder.is_multimodal)
        self.assertTrue(embedder.supports_images)
        self.assertTrue(embedder.supports_text)
```

---

## Phase 7: Documentation Updates (Day 4)

### 7.1 Update Architecture Doc
**File:** `docs/plans/image-token-architecture.md`

Add sections for:
- Agent tool usage examples
- GraphQL query examples
- Frontend integration guide
- Permission model for images

### 7.2 Add API Documentation
Document new GraphQL queries and tool functions.

---

## Implementation Order & Dependencies

```
Phase 1 (Bug Fixes) ──────────────────────────────────────────┐
                                                               │
Phase 2 (Agent Tools) ─────────────────────────────────────────┤
                         │                                     │
                         └──> Phase 3 (GraphQL) ───────────────┤
                                      │                        │
                                      └──> Phase 4 (Frontend) ─┤
                                                               │
Phase 5 (Cleanup) ─────────────────────────────────────────────┤
                                                               │
Phase 6 (Tests) <──────────────────────────────────────────────┘
                                                               │
Phase 7 (Docs) <───────────────────────────────────────────────┘
```

---

## Estimated Effort

| Phase | Effort | Complexity |
|-------|--------|------------|
| Phase 1: Bug Fixes | 2-3 hours | Low |
| Phase 2: Agent Tools | 4-6 hours | Medium |
| Phase 3: GraphQL | 3-4 hours | Medium |
| Phase 4: Frontend | 6-8 hours | Medium-High |
| Phase 5: Cleanup | 2-3 hours | Low |
| Phase 6: Tests | 4-6 hours | Medium |
| Phase 7: Docs | 2-3 hours | Low |
| **Total** | **23-33 hours** | |

---

## Future Enhancements (Out of Scope)

These are documented but not included in this plan:

1. **Multimodal Embedder Implementation** - Add CLIP or OpenAI vision embedder
2. **Image Vector Search** - Enable similarity search across images
3. **OCR on Images** - Extract text from images
4. **Image Deduplication** - Use content hashes to avoid duplicates
5. **Thumbnail Generation** - Generate previews for faster loading
6. **Virus Scanning** - Scan PDFs before image extraction

---

## Acceptance Criteria

### MVP Complete When:
- [ ] Parsers extract images without errors (defensive checks in place)
- [ ] Agents can list and retrieve images from documents
- [ ] Frontend shows image regions on PDF pages
- [ ] Images are cleaned up when documents are deleted
- [ ] All new code has test coverage
- [ ] Documentation is updated

### Quality Gates:
- [ ] All existing tests pass
- [ ] New tests pass
- [ ] TypeScript compiles without errors
- [ ] Pre-commit hooks pass
- [ ] No security vulnerabilities in new code
