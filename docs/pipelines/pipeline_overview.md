# OpenContracts Pipeline Architecture

The OpenContracts pipeline system is a modular and extensible architecture for processing documents through various stages: parsing, thumbnail generation, and embedding. This document provides an overview of the system architecture and guides you through creating new pipeline components.

## Architecture Overview

The pipeline system consists of three main component types:

1. **Parsers**: Extract text and structure from documents
2. **Thumbnailers**: Generate visual previews of documents
3. **Embedders**: Create vector embeddings for semantic search

Each component type has a base abstract class that defines the interface and common functionality:

```mermaid
graph TD
    A[Document Upload] --> B[Parser]
    B --> C[Thumbnailer]
    B --> D[Embedder]
    B --> PP[Post-Processor]

    subgraph "Pipeline Components"
        B --> B1[DoclingParser REST]
        B --> B2[TxtParser]
        B --> B3[LlamaParseParser]

        C --> C1[PdfThumbnailGenerator]
        C --> C2[TextThumbnailGenerator]

        D --> D1[MicroserviceEmbedder]
        D --> D2[ModernBERTEmbedder]
        D --> D3[MinnModernBERTEmbedder]
        D --> D4[MultimodalMicroserviceEmbedder]

        PP --> PP1[PDFRedactor]
    end

    C1 --> E[Document Preview]
    C2 --> E
    D1 --> F[Vector Database]
    D2 --> F
    D3 --> F
    D4 --> F
    PP1 --> G[Processed Document]
```

### Component Registration

Components are registered in `settings/base.py` through configuration dictionaries:

```python
PREFERRED_PARSERS = {
    "application/pdf": "opencontractserver.pipeline.parsers.docling_parser_rest.DoclingParser",
    "text/plain": "opencontractserver.pipeline.parsers.oc_text_parser.TxtParser",
    # ... other mime types
}

THUMBNAIL_TASKS = {
    "application/pdf": "opencontractserver.tasks.doc_tasks.extract_pdf_thumbnail",
    "text/plain": "opencontractserver.tasks.doc_tasks.extract_txt_thumbnail",
    # ... other mime types
}

PREFERRED_EMBEDDERS = {
    "application/pdf": "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder",
    # ... other mime types
}
```

## Component Types

### Parsers

Parsers inherit from `BaseParser` and implement the `parse_document` method:

```python
class BaseParser(ABC):
    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []

    @abstractmethod
    def parse_document(
        self, user_id: int, doc_id: int, **kwargs
    ) -> Optional[OpenContractDocExport]:
        pass
```

Current implementations:
- **DoclingParser**: Advanced PDF parser using machine learning (REST microservice)
- **LlamaParseParser**: Cloud-based parser using LlamaParse API with layout extraction
- **TxtParser**: Simple text file parser

### Thumbnailers

Thumbnailers inherit from `BaseThumbnailGenerator` and implement the `_generate_thumbnail` method:

```python
class BaseThumbnailGenerator(ABC):
    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []

    @abstractmethod
    def _generate_thumbnail(
        self,
        txt_content: Optional[str],
        pdf_bytes: Optional[bytes],
        height: int = 300,
        width: int = 300,
    ) -> Optional[tuple[bytes, str]]:
        pass
```

Current implementations:
- **PdfThumbnailGenerator**: Generates thumbnails from PDF first pages
- **TextThumbnailGenerator**: Creates text-based preview images

### Embedders

Embedders inherit from `BaseEmbedder` and implement the `_embed_text_impl` method. Embedders can optionally support multiple modalities (text and images) via the `supported_modalities` set.

```python
from opencontractserver.types.enums import ContentModality

class BaseEmbedder(ABC):
    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    vector_size: int = 0
    supported_file_types: list[FileTypeEnum] = []

    # Single source of truth for modality support
    # Override in subclasses to add multimodal support
    supported_modalities: set[ContentModality] = {ContentModality.TEXT}

    # Convenience properties derived from supported_modalities
    @property
    def is_multimodal(self) -> bool:
        """Whether this embedder supports multiple modalities."""
        return len(self.supported_modalities) > 1

    @property
    def supports_text(self) -> bool:
        return ContentModality.TEXT in self.supported_modalities

    @property
    def supports_images(self) -> bool:
        return ContentModality.IMAGE in self.supported_modalities

    @abstractmethod
    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        pass

    def _embed_image_impl(
        self, image_base64: str, image_format: str = "jpeg", **all_kwargs
    ) -> Optional[list[float]]:
        # Override in multimodal embedders
        pass
```

Current implementations:

**Text-only Embedders:**
- **MicroserviceEmbedder**: Generates 384-dim embeddings using a sentence-transformer microservice
- **ModernBERTEmbedder**: Local ModernBERT embeddings generation
- **MinnModernBERTEmbedder**: Minnesota Case Law specialized ModernBERT embedder
- **CloudMinnModernBERTEmbedder**: Cloud-based Minnesota ModernBERT embedder

**Multimodal Embedders:**
- **MultimodalMicroserviceEmbedder**: CLIP ViT-L-14 based embedder (768-dim) supporting both text and images. Text and image embeddings are in the same vector space, enabling cross-modal similarity search.

#### Supported Embedding Dimensions

The OpenContracts database supports the following embedding dimensions via dedicated vector fields:

- **384 dimensions** (`vector_384`): Used by MicroserviceEmbedder (sentence-transformers)
- **768 dimensions** (`vector_768`): Used by MultimodalMicroserviceEmbedder (CLIP ViT-L-14)
- **1024 dimensions** (`vector_1024`): Available for future embedders
- **1536 dimensions** (`vector_1536`): Used by OpenAI text-embedding-3-small and similar models
- **3072 dimensions** (`vector_3072`): Used by OpenAI text-embedding-3-large and large models
- **4096 dimensions** (`vector_4096`): Available for high-dimensional embedders

Each embedding dimension is stored in a separate pgvector field, allowing the system to support multiple embedding models simultaneously without conflicts.

#### Multimodal Embedder Configuration

The multimodal embedder requires the `multimodal-embedder` service to be running:

```yaml
# In docker-compose
multimodal-embedder:
  image: ghcr.io/jsv4/vectorembeddermicroservice-multimodal:latest
  container_name: multimodal-embedder
  environment:
    PORT: 8000
```

Environment variable: `MULTIMODAL_EMBEDDER_URL=http://multimodal-embedder:8000`

**API Endpoints:**
- `POST /embeddings` - Text embeddings: `{"text": "..."}`
- `POST /embeddings/image` - Image embeddings: `{"image": "<base64>"}`
- `POST /embeddings/batch` - Batch text (max 100): `{"texts": [...]}`
- `POST /embeddings/image/batch` - Batch images (max 20): `{"images": [...]}`

### Multimodal Annotation Embedding Pipeline

When annotations are embedded, the pipeline automatically detects and handles multimodal content:

```mermaid
graph TD
    A[Annotation] --> B{Check content_modalities}
    B -->|TEXT only| C[embed_text]
    B -->|IMAGE only| D[embed_images → average]
    B -->|TEXT + IMAGE| E[Weighted Average]

    C --> F[768d Vector]
    D --> F
    E --> F

    E --> G[embed_text → 768d]
    E --> H[embed_images → avg 768d]
    G --> I["weighted_avg(text, images)"]
    H --> I
    I --> F

    F --> J[Store in vector_768 field]
```

**Key Concepts:**

1. **ContentModality Enum**: Type-safe modality tracking (`TEXT`, `IMAGE`)
   - Stored in `Annotation.content_modalities` ArrayField
   - Automatically set during parsing based on token types

2. **Unified Vector Space**: CLIP ViT-L-14 produces 768d vectors where text and images share the same embedding space, enabling cross-modal similarity search

3. **Weighted Averaging**: For mixed-modality annotations (text + images):
   ```python
   # Default weights (configurable in settings)
   MULTIMODAL_EMBEDDING_WEIGHTS = {
       "text_weight": 0.3,   # 30% text
       "image_weight": 0.7,  # 70% image
   }
   ```

4. **Image Token Format** (PAWLs): Images are stored as tokens with `is_image=True`:
   ```json
   {
     "is_image": true,
     "image_path": "documents/{doc_id}/images/page_0_img_1.jpeg",
     "format": "jpeg",
     "x": 100, "y": 200, "width": 300, "height": 400,
     "content_hash": "sha256..."
   }
   ```

5. **Graceful Degradation**: If multimodal embedding fails, falls back to text-only embedding

**Embedding Task Flow** (`calculate_embedding_for_annotation_text`):
1. Load annotation with `select_related("document")` to avoid N+1
2. Get embedder based on corpus preference or explicit path
3. Check if embedder `is_multimodal` and annotation has `IMAGE` modality
4. If multimodal: use `generate_multimodal_embedding()` from `utils/multimodal_embeddings.py`
5. If text-only or fallback: use `embedder.embed_text()`
6. Store embedding via `annotation.add_embedding()`

## Creating New Components

To create a new pipeline component:

1. Choose the appropriate base class (`BaseParser`, `BaseThumbnailGenerator`, or `BaseEmbedder`)
2. Create a new class inheriting from the base class
3. Implement required abstract methods
4. Set component metadata (title, description, author, etc.)
5. Register the component in the appropriate settings dictionary

Example of a new parser:

```python
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.pipeline.base.file_types import FileTypeEnum

class MyCustomParser(BaseParser):
    title = "My Custom Parser"
    description = "Parses documents in a custom way"
    author = "Your Name"
    dependencies = ["custom-lib>=1.0.0"]
    supported_file_types = [FileTypeEnum.PDF]

    def parse_document(
        self, user_id: int, doc_id: int, **kwargs
    ) -> Optional[OpenContractDocExport]:
        # Implementation here
        pass
```

Then register it in settings:

```python
PREFERRED_PARSERS = {
    "application/pdf": "path.to.your.MyCustomParser",
    # ... other parsers
}
```

## Best Practices

1. **Error Handling**: Always handle exceptions gracefully and return None on failure
2. **Dependencies**: List all required dependencies in the component's `dependencies` list
3. **Documentation**: Provide clear docstrings and type hints
4. **Testing**: Create unit tests for your component in the `tests` directory
5. **Metadata**: Fill out all metadata fields (title, description, author)

## Advanced Topics

### Parallel Processing

The pipeline system supports parallel processing through Celery tasks. Each component can be executed asynchronously:

```python
from opencontractserver.tasks.doc_tasks import process_document

# Async document processing
process_document.delay(user_id, doc_id)
```

### Custom File Types

To add support for new file types:

1. Add the MIME type to `ALLOWED_DOCUMENT_MIMETYPES` in settings
2. Update `FileTypeEnum` in `base/file_types.py`
3. Create appropriate parser/thumbnailer/embedder implementations
4. Register the implementations in settings

### Error Handling

Components should implement robust error handling:

```python
def parse_document(self, user_id: int, doc_id: int, **kwargs):
    try:
        # Implementation
        return result
    except Exception as e:
        logger.error(f"Error parsing document {doc_id}: {e}")
        return None
```

## Contributing

When contributing new pipeline components:

1. Follow the project's coding style
2. Add comprehensive tests
3. Update this documentation
4. Submit a pull request with a clear description

For questions or support, please open an issue on the GitHub repository.
