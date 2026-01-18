# PAWLs Format Specification

## Overview

PAWLs (Page-Aware Word-Level Segmentation) is OpenContracts' format for representing document structure with precise token positioning. Each page in a document has tokens (text or image) with bounding box coordinates that enable:

- Precise text selection and annotation
- Image region identification and annotation
- Spatial queries for finding tokens in regions
- Frontend rendering with accurate positioning

## Format Structure

A PAWLs file is a JSON array of page objects:

```json
[
  {
    "page": {
      "width": 612.0,
      "height": 792.0,
      "index": 0
    },
    "tokens": [
      {"x": 100, "y": 100, "width": 50, "height": 12, "text": "Hello"},
      {"x": 160, "y": 100, "width": 60, "height": 12, "text": "World"}
    ]
  },
  {
    "page": {"width": 612.0, "height": 792.0, "index": 1},
    "tokens": [...]
  }
]
```

## Page Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| page | object | Yes | Page metadata |
| page.width | float | Yes | Page width in PDF points |
| page.height | float | Yes | Page height in PDF points |
| page.index | int | Yes | 0-based page index |
| tokens | array | Yes | Array of token objects |

## Token Object

Tokens represent either text or images. The `is_image` field distinguishes between them.

### Common Fields (All Tokens)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| x | float | Yes | X coordinate (PDF points, origin top-left) |
| y | float | Yes | Y coordinate (PDF points, origin top-left) |
| width | float | Yes | Token width in PDF points |
| height | float | Yes | Token height in PDF points |
| text | string | Yes | Text content (empty string for images) |

### Image Token Fields

When `is_image` is `true`, the token represents an image:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| is_image | bool | Yes | Must be `true` for image tokens |
| image_path | string | Yes* | Storage path to image file |
| format | string | No | Image format: "jpeg" or "png" |
| content_hash | string | No | SHA-256 hash for deduplication |
| original_width | int | No | Original image width in pixels |
| original_height | int | No | Original image height in pixels |
| image_type | string | No | "embedded" or "cropped" |

*Either `image_path` (preferred) or `base64_data` should be present.

### Text Token Example

```json
{
  "x": 100.5,
  "y": 150.25,
  "width": 45.0,
  "height": 12.0,
  "text": "Revenue"
}
```

### Image Token Example

```json
{
  "x": 50.0,
  "y": 200.0,
  "width": 300.0,
  "height": 200.0,
  "text": "",
  "is_image": true,
  "image_path": "documents/123/images/page_0_img_0.jpg",
  "format": "jpeg",
  "content_hash": "a1b2c3d4e5f6...",
  "original_width": 800,
  "original_height": 533,
  "image_type": "embedded"
}
```

## Coordinate System

- **Origin**: Top-left corner of the page
- **Units**: PDF points (1 point = 1/72 inch)
- **X-axis**: Increases left to right
- **Y-axis**: Increases top to bottom
- **Standard page size**: Letter is 612 x 792 points

## Token References

Annotations reference tokens using `TokenIdPythonType`:

```json
{
  "pageIndex": 0,
  "tokenIndex": 5
}
```

This format works for both text and image tokens since they're in the same array.

## Annotation Integration

### Single Modality Annotation (Text Only)

```json
{
  "tokens_jsons": [
    {"pageIndex": 0, "tokenIndex": 0},
    {"pageIndex": 0, "tokenIndex": 1}
  ],
  "content_modalities": ["TEXT"]
}
```

### Single Modality Annotation (Image Only)

```json
{
  "tokens_jsons": [
    {"pageIndex": 0, "tokenIndex": 15}
  ],
  "content_modalities": ["IMAGE"]
}
```

### Mixed Modality Annotation (Image + Caption)

```json
{
  "tokens_jsons": [
    {"pageIndex": 0, "tokenIndex": 15},
    {"pageIndex": 0, "tokenIndex": 16},
    {"pageIndex": 0, "tokenIndex": 17}
  ],
  "content_modalities": ["IMAGE", "TEXT"]
}
```

## Image Storage

Images are stored separately from the PAWLs file to avoid bloat:

1. **During parsing**: Images are extracted and saved to Django storage (S3, GCS, or filesystem)
2. **In PAWLs**: Only the `image_path` reference is stored
3. **On retrieval**: Image tools load from storage and return base64 data

### Storage Path Convention

```
documents/{document_id}/images/page_{page_idx}_img_{img_idx}.{format}
```

Example: `documents/123/images/page_0_img_0.jpg`

## Content Modalities

The `content_modalities` field on Annotation tracks what types of content are present:

| Value | Description |
|-------|-------------|
| `TEXT` | Contains text tokens |
| `IMAGE` | Contains image tokens |
| `AUDIO` | Contains audio content (future) |
| `TABLE` | Contains table content (future) |
| `VIDEO` | Contains video content (future) |

This enables embedders to efficiently filter annotations they can process.

## Parser Responsibilities

When generating PAWLs data, parsers should:

1. Extract text tokens with accurate bounding boxes
2. Extract images and save to storage
3. Create image tokens in the `tokens[]` array with `is_image: true`
4. For structural annotations (figures, charts):
   - Reference image tokens via `tokens_jsons`
   - Set `content_modalities: ["IMAGE"]`

## Frontend Handling

The frontend should:

1. Check `token.is_image` to identify image tokens
2. Render image tokens with different visual treatment (e.g., border instead of text highlight)
3. Allow selection of both text and image tokens
4. Display mixed annotations spanning both types

## Migration Notes

If processing older documents without image tokens:

- Documents parsed before image support have only text tokens
- `is_image` field will be absent (falsy) for all tokens
- Re-parsing with current parsers will add image tokens

## Related Documentation

- [Image Token Implementation Plan](../plans/phase-3-unified-image-tokens.md)
- [Pipeline Overview](../pipelines/pipeline_overview.md)
