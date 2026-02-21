# Phase 3: Unified Image Token Architecture

## Executive Summary

Clean implementation of unified image token model where images are first-class tokens in the PAWLs `tokens[]` array. This enables:
- Uniform selection/annotation of text and images
- Future multimodal support (audio, tables, etc.)
- Graceful degradation when embedders don't support all modalities
- Clean querying via `content_modalities` field on Annotation model

**Note:** No backward compatibility needed - `imagesJsons` and separate `images[]` array never shipped to production.

---

## Architecture

### PAWLs Format

Single unified format where images are tokens with `is_image: True`:

```python
{
    "page": {"width": 612, "height": 792, "index": 0},
    "tokens": [
        # Text token
        {"x": 100, "y": 100, "width": 50, "height": 12, "text": "Revenue"},

        # Image token - same array, identified by is_image flag
        {
            "x": 50,
            "y": 200,
            "width": 300,
            "height": 200,
            "text": "",  # Empty or alt_text if available
            "is_image": True,
            "image_path": "documents/123/images/page_0_img_0.jpg",
            "format": "jpeg",
            "content_hash": "abc123...",
            "original_width": 800,
            "original_height": 600,
            "image_type": "embedded"  # or "cropped"
        }
    ]
}
```

### Token Field Reference

#### Common Fields (all tokens)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| x | float | Yes | X coordinate (PDF points) |
| y | float | Yes | Y coordinate (PDF points) |
| width | float | Yes | Width (PDF points) |
| height | float | Yes | Height (PDF points) |
| text | string | Yes | Text content (empty for images) |

#### Image Token Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| is_image | bool | Yes | Must be `true` for image tokens |
| image_path | string | Yes* | Storage path to image file |
| format | string | No | Image format: "jpeg" or "png" |
| content_hash | string | No | SHA-256 hash for deduplication |
| original_width | int | No | Original image width in pixels |
| original_height | int | No | Original image height in pixels |
| image_type | string | No | "embedded" or "cropped" |

*`image_path` points to Django storage (S3/GCS/filesystem).

---

### Annotation Model Changes

```python
from django.contrib.postgres.fields import ArrayField

class Annotation(models.Model):
    # Existing field - now references both text and image tokens
    tokens_jsons = ...  # [{"pageIndex": 0, "tokenIndex": 5}, ...]

    # New field - tracks what modalities are in this annotation
    content_modalities = ArrayField(
        models.CharField(max_length=20),
        default=list,
        blank=True,
        db_index=True,
    )
```

**Modality Values:**

| Annotation Type | content_modalities |
|-----------------|-------------------|
| Text only | `["TEXT"]` |
| Image only (structural) | `["IMAGE"]` |
| Mixed (figure + caption) | `["IMAGE", "TEXT"]` |

**Content Modality Enum:**

```python
class ContentModality(str, Enum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"
    AUDIO = "AUDIO"   # Future
    TABLE = "TABLE"   # Future
    VIDEO = "VIDEO"   # Future
```

---

### Embedder Architecture

```python
class BaseEmbedder:
    """Base class for embedders with modality support."""

    # Subclasses declare what they support
    supported_modalities: ClassVar[set[str]] = {ContentModality.TEXT}

    def can_embed(self, annotation: Annotation) -> bool:
        """Check if embedder supports annotation's modalities."""
        modalities = set(annotation.content_modalities or [ContentModality.TEXT])
        return modalities.issubset(self.supported_modalities)

    def get_embeddable_annotations(self, queryset: QuerySet) -> QuerySet:
        """Filter to annotations this embedder can process."""
        supported = list(self.supported_modalities)
        return queryset.filter(content_modalities__contained_by=supported)

    def embed_annotations(self, annotations: QuerySet) -> int:
        """Embed annotations, gracefully skipping unsupported."""
        embeddable = self.get_embeddable_annotations(annotations)

        skipped = annotations.count() - embeddable.count()
        if skipped > 0:
            logger.info(
                f"Skipping {skipped} annotations with unsupported modalities "
                f"(embedder supports: {self.supported_modalities})"
            )

        # Process embeddable annotations...
```

**Future Multimodal Embedder:**

```python
class MultimodalEmbedder(BaseEmbedder):
    supported_modalities = {ContentModality.TEXT, ContentModality.IMAGE}

    def _embed_annotation(self, annotation):
        text_content = self._extract_text(annotation)
        image_data = self._extract_images(annotation)
        # Generate unified embedding...
```

---

### Annotation Creation Flow

When annotations are created (parser or human), compute modalities:

```python
def compute_content_modalities(
    tokens_jsons: list[dict],
    pawls_data: list[dict],
) -> list[str]:
    """Compute modalities from referenced tokens."""
    modalities: set[str] = set()

    for ref in tokens_jsons:
        page_idx = ref["pageIndex"]
        token_idx = ref["tokenIndex"]
        token = pawls_data[page_idx]["tokens"][token_idx]

        if token.get("is_image"):
            modalities.add(ContentModality.IMAGE)
        else:
            modalities.add(ContentModality.TEXT)

    return sorted(modalities) or [ContentModality.TEXT]
```

---

## Implementation Steps

### Step 1: Type Definitions & Constants

**File: `opencontractserver/types/enums.py`**

Add `ContentModality` enum.

**File: `opencontractserver/types/dicts.py`**

Extend `PawlsTokenPythonType` with image fields:
- `is_image: bool`
- `image_path: str`
- `format: str`
- `content_hash: str`
- `original_width: int`
- `original_height: int`
- `image_type: str`

---

### Step 2: Annotation Model Migration

**Migration 1: Add field**

```python
migrations.AddField(
    model_name='annotation',
    name='content_modalities',
    field=ArrayField(
        models.CharField(max_length=20),
        default=list,
        blank=True,
    ),
)
```

**Migration 2: Backfill existing**

```python
def backfill_modalities(apps, schema_editor):
    Annotation = apps.get_model('annotations', 'Annotation')
    Annotation.objects.filter(content_modalities=[]).update(
        content_modalities=["TEXT"]
    )
```

---

### Step 3: Parser Updates

**Files:**
- `opencontractserver/pipeline/parsers/docling_parser_rest.py`
- `opencontractserver/pipeline/parsers/llamaparse_parser.py`

**Changes:**
1. Rewrite `_add_images_to_result()` to add image tokens to `tokens[]`
2. Remove `images[]` array creation
3. Update structural annotation creation:
   - Reference image tokens via `tokens_jsons`
   - Set `content_modalities = ["IMAGE"]`

---

### Step 4: PDF Token Extraction Updates

**File: `opencontractserver/utils/pdf_token_extraction.py`**

**Changes:**
1. `extract_images_from_pdf()` returns image token data (not separate structure)
2. Remove any `images[]` array logic
3. Keep image storage functions (`_save_image_to_storage`, etc.)

---

### Step 5: Image Tools Updates

**File: `opencontractserver/llms/tools/image_tools.py`**

**Changes:**
1. `ImageReference.image_index` → `ImageReference.token_index`
2. `list_document_images()` filters `tokens[]` by `is_image=True`
3. `get_document_image()` uses `token_index` to find image token
4. Remove any `images[]` array handling

---

### Step 6: Embedder Updates

**File: `opencontractserver/pipeline/base/embedder.py`**

**Changes:**
1. Add `supported_modalities` class variable
2. Add `can_embed()` method
3. Add `get_embeddable_annotations()` method
4. Update embedding pipeline to filter by modality

---

### Step 7: Annotation Utilities

**File: `opencontractserver/annotations/utils.py`** (new or existing)

Add `compute_content_modalities()` helper function.

Integrate into:
- Parser annotation creation
- GraphQL annotation mutations

---

### Step 8: Documentation

**File: `docs/architecture/pawls-format.md`**

Document:
- Token structure (text and image)
- Field reference
- Annotation integration
- Modality system

---

### Step 9: Tests

Update existing tests and add new tests for:
- Image tokens in `tokens[]` array
- `content_modalities` field computation
- Embedder modality filtering
- Mixed annotation handling (text + image)
- Image tools with `token_index`

---

## Deletions

Remove from codebase:
- `imagesJsons` handling everywhere
- `images[]` array creation in parsers
- `image_index` references (use `token_index`)
- Separate `PawlsImageTokenPythonType` if exists (merge into `PawlsTokenPythonType`)
- Any backward compatibility code for old image format

---

## File Changes Summary

| File | Changes |
|------|---------|
| `types/enums.py` | Add `ContentModality` enum |
| `types/dicts.py` | Extend `PawlsTokenPythonType` with image fields |
| `annotations/models.py` | Add `content_modalities` ArrayField |
| `annotations/migrations/` | Add field + backfill migrations |
| `annotations/utils.py` | Add `compute_content_modalities()` |
| `pipeline/parsers/docling_parser_rest.py` | Images → tokens, set modalities |
| `pipeline/parsers/llamaparse_parser.py` | Same |
| `utils/pdf_token_extraction.py` | Clean up, return token format |
| `llms/tools/image_tools.py` | Use `token_index`, filter tokens |
| `pipeline/base/embedder.py` | Add modality support |
| `docs/architecture/pawls-format.md` | New documentation |

---

## Annotation Types Summary

### Structural Annotations (Parser-Created)

- **Single token**: 1 annotation = 1 image token
- **content_modalities**: `["IMAGE"]`
- **Example**: Figure detected by Docling/LlamaParse

### Human Annotations

- **May be mixed**: Text tokens + image tokens
- **content_modalities**: `["TEXT"]`, `["IMAGE"]`, or `["IMAGE", "TEXT"]`
- **Example**: User annotates figure with its caption

---

## Frontend Implications (Future Phase)

1. Token renderer checks `is_image` field
2. Different visual treatment for image token selection (border vs background)
3. Mixed annotations display both text and image regions
4. Selection behavior works uniformly across token types
