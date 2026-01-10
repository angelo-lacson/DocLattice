# ModernBERT Embedder

This document provides information about the ModernBERT embedder, which is based on the `answerdotai/ModernBERT-base` model from Hugging Face.

## Overview

The ModernBERT embedder is a sentence transformer model that generates 768-dimensional embeddings for text. It is based on the `answerdotai/ModernBERT-base` model, which has a maximum sequence length of 8192 tokens, making it suitable for embedding longer documents.

## Features

- 768-dimensional embeddings
- Support for long documents (up to 8192 tokens)
- Optimized for semantic similarity and search
- Supports PDF, TXT, and DOCX file types

## Installation

The ModernBERT embedder requires the `sentence-transformers` library:

```bash
pip install sentence-transformers>=2.2.2
```

## Source Code

The embedder implementation is located at:
- [`opencontractserver/pipeline/embedders/modern_bert_embedder.py`](../../opencontractserver/pipeline/embedders/modern_bert_embedder.py)

The class name is `ModernBERTEmbedder`.

## Usage

### Using the Embedder in Code

```python
from opencontractserver.pipeline.embedders.modern_bert_embedder import ModernBERTEmbedder

# Create an instance of the embedder
embedder = ModernBERTEmbedder()

# Generate embeddings for a text
text = "This is a sample text to embed."
embedding = embedder.embed_text(text)

# The embedding is a list of 768 floating-point values
print(f"Embedding dimension: {len(embedding)}")
```

### Docker Setup

We provide a Docker setup to run the ModernBERT embedder as a service:

1. Build and start the service:

```bash
docker-compose -f docker-compose.modernbert.yml up -d
```

2. The model will be downloaded and cached in a Docker volume.

3. The service includes a healthcheck to ensure the model is loaded correctly.

## Configuration

Embedder configuration is defined in [`config/settings/base.py`](../../config/settings/base.py).

The full module path for the ModernBERT embedder is:
```
opencontractserver.pipeline.embedders.modern_bert_embedder.ModernBERTEmbedder
```

By default, OpenContracts uses the `MicroserviceEmbedder` for production deployments. To use the ModernBERT embedder directly, update the `PREFERRED_EMBEDDERS` or `DEFAULT_EMBEDDERS_BY_FILETYPE` settings.

## Model Details

- **Base Model**: answerdotai/ModernBERT-base
- **Maximum Sequence Length**: 8192 tokens
- **Output Dimensionality**: 768 dimensions
- **Similarity Function**: Cosine Similarity

## Performance Considerations

- The first time the model is used, it will be downloaded from Hugging Face, which may take some time.
- For faster startup, use the Docker setup which preloads the model.
- The model requires approximately 500MB of disk space.
- Using GPU acceleration is recommended for processing large volumes of text.

---
*Last Updated: 2026-01-09*
