"""
Multimodal embedding utilities for combining text and image embeddings.

Uses CLIP ViT-L-14 which produces 768-dimensional vectors in a shared
embedding space for both text and images. This enables cross-modal
similarity search (text-to-image, image-to-text).

When an annotation contains both text and image content, embeddings are
combined via weighted average with configurable weights (default: 30% text,
70% image - since image-containing annotations are often image-heavy).
"""

import json
import logging
from typing import TYPE_CHECKING, Optional

import numpy as np
from django.conf import settings

if TYPE_CHECKING:
    from opencontractserver.annotations.models import Annotation
    from opencontractserver.documents.models import Document
    from opencontractserver.pipeline.base.embedder import BaseEmbedder

from opencontractserver.utils.pdf_token_extraction import get_image_as_base64

logger = logging.getLogger(__name__)


def get_multimodal_weights() -> tuple[float, float]:
    """
    Get configured text/image weights for multimodal embedding combination.

    Returns:
        Tuple of (text_weight, image_weight) from settings or defaults.
        Default weights: 0.3 text, 0.7 image (images weighted higher as
        multimodal annotations are often predominantly visual).
    """
    weights = getattr(settings, "MULTIMODAL_EMBEDDING_WEIGHTS", {})
    text_weight = weights.get("text_weight", 0.3)
    image_weight = weights.get("image_weight", 0.7)
    return text_weight, image_weight


def normalize_vector(vector: list[float]) -> list[float]:
    """
    Normalize vector to unit length (L2 normalization).

    Args:
        vector: Input embedding vector.

    Returns:
        Unit-length normalized vector.
    """
    arr = np.array(vector, dtype=np.float64)
    norm = np.linalg.norm(arr)
    if norm > 0:
        arr = arr / norm
    return arr.tolist()


def weighted_average_embeddings(
    vectors: list[list[float]],
    weights: list[float],
) -> list[float]:
    """
    Compute weighted average of embedding vectors, normalized to unit length.

    Args:
        vectors: List of embedding vectors (all same dimension).
        weights: Weights for each vector (will be normalized to sum to 1).

    Returns:
        Weighted average embedding, normalized to unit length.
    """
    if not vectors:
        return []

    arr = np.array(vectors, dtype=np.float64)
    weights_arr = np.array(weights, dtype=np.float64)

    # Normalize weights to sum to 1
    weights_arr = weights_arr / weights_arr.sum()

    combined = np.average(arr, axis=0, weights=weights_arr)
    return normalize_vector(combined.tolist())


def _load_pawls_data(document: "Document") -> Optional[list[dict]]:
    """
    Load PAWLs data from a document.

    Args:
        document: The Document instance.

    Returns:
        Parsed PAWLs data as list of page dicts, or None if unavailable.
    """
    pawls_file = document.pawls_parse_file
    if not pawls_file:
        return None

    try:
        pawls_file.open("r")
        try:
            pawls_data = json.load(pawls_file)
        finally:
            pawls_file.close()
        return pawls_data
    except Exception as e:
        logger.error(f"Failed to load PAWLs data for document {document.pk}: {e}")
        return None


def get_annotation_image_tokens(
    annotation: "Annotation",
    pawls_data: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Extract image tokens referenced by an annotation.

    Iterates through the annotation's json field (tokensJsons) and filters
    for tokens that are images (is_image=True).

    Args:
        annotation: Annotation model instance.
        pawls_data: Optional pre-loaded PAWLs data. If not provided,
                   will be loaded from annotation's document.

    Returns:
        List of image token dicts from the PAWLs data.
    """
    document = annotation.document
    if not document:
        logger.warning(f"Annotation {annotation.pk} has no document")
        return []

    # Load PAWLs data if not provided
    if pawls_data is None:
        pawls_data = _load_pawls_data(document)

    if not pawls_data:
        return []

    # Get token references from annotation json
    annotation_json = annotation.json or {}
    image_tokens = []

    for page_key, page_data in annotation_json.items():
        if not isinstance(page_data, dict):
            continue

        token_refs = page_data.get("tokensJsons", [])
        for ref in token_refs:
            if not isinstance(ref, dict):
                continue

            page_idx = ref.get("pageIndex")
            token_idx = ref.get("tokenIndex")

            if page_idx is None or token_idx is None:
                continue

            # Get actual token from PAWLs data
            if page_idx < len(pawls_data):
                page = pawls_data[page_idx]
                if not isinstance(page, dict):
                    continue

                tokens = page.get("tokens", [])
                if token_idx < len(tokens):
                    token = tokens[token_idx]
                    if isinstance(token, dict) and token.get("is_image"):
                        image_tokens.append(token)

    return image_tokens


def embed_images_average(
    embedder: "BaseEmbedder",
    image_tokens: list[dict],
) -> Optional[list[float]]:
    """
    Embed all image tokens and return their average embedding.

    Args:
        embedder: Multimodal embedder with embed_image() method.
        image_tokens: List of image token dicts from PAWLs data.

    Returns:
        Average 768d embedding of all images, or None if no valid embeddings.
    """
    if not image_tokens:
        return None

    embeddings = []

    for token in image_tokens:
        # Get base64 image data
        base64_data = get_image_as_base64(token)
        if not base64_data:
            logger.debug("Could not get base64 data for image token")
            continue

        img_format = token.get("format", "jpeg")

        # Embed the image
        try:
            embedding = embedder.embed_image(base64_data, image_format=img_format)
            if embedding is not None:
                embeddings.append(embedding)
        except Exception as e:
            logger.error(f"Failed to embed image: {e}")
            continue

    if not embeddings:
        logger.warning("No valid image embeddings generated")
        return None

    # Average all image embeddings
    arr = np.array(embeddings, dtype=np.float64)
    averaged = np.mean(arr, axis=0)
    return normalize_vector(averaged.tolist())


def generate_multimodal_embedding(
    annotation: "Annotation",
    embedder: "BaseEmbedder",
    text_weight: Optional[float] = None,
    image_weight: Optional[float] = None,
) -> Optional[list[float]]:
    """
    Generate unified embedding for annotation containing text, images, or both.

    For multimodal embedders (CLIP), text and image embeddings are in the
    same vector space and can be meaningfully combined via weighted average.

    Logic:
    - TEXT only: embed text via embed_text()
    - IMAGE only: embed all images, average them
    - MIXED: weighted average of text embedding and images average

    Args:
        annotation: Annotation to embed.
        embedder: Multimodal embedder (must have embed_text and embed_image).
        text_weight: Weight for text embedding (default from settings: 0.3).
        image_weight: Weight for image embedding (default from settings: 0.7).

    Returns:
        768d embedding vector in CLIP space, or None on failure.
    """
    # Get weights from settings if not provided
    if text_weight is None or image_weight is None:
        default_text, default_image = get_multimodal_weights()
        text_weight = text_weight if text_weight is not None else default_text
        image_weight = image_weight if image_weight is not None else default_image

    modalities = annotation.content_modalities or ["TEXT"]
    has_text = "TEXT" in modalities
    has_image = "IMAGE" in modalities

    logger.debug(
        f"Generating multimodal embedding for annotation {annotation.pk}: "
        f"modalities={modalities}, has_text={has_text}, has_image={has_image}"
    )

    text_embedding = None
    image_embedding = None

    # Embed text if present
    if has_text:
        raw_text = annotation.raw_text or ""
        if raw_text.strip():
            try:
                text_embedding = embedder.embed_text(raw_text)
                if text_embedding:
                    logger.debug(f"Generated text embedding: dim={len(text_embedding)}")
            except Exception as e:
                logger.error(f"Failed to generate text embedding: {e}")

    # Embed images if present and embedder supports images
    if has_image and embedder.supports_images:
        image_tokens = get_annotation_image_tokens(annotation)
        if image_tokens:
            logger.debug(f"Found {len(image_tokens)} image tokens to embed")
            image_embedding = embed_images_average(embedder, image_tokens)
            if image_embedding:
                logger.debug(f"Generated image embedding: dim={len(image_embedding)}")
        else:
            logger.debug("No image tokens found in annotation")

    # Combine embeddings based on what we have
    if text_embedding and image_embedding:
        # Mixed modality - weighted average
        logger.info(
            f"Combining text ({text_weight}) and image ({image_weight}) embeddings "
            f"for annotation {annotation.pk}"
        )
        return weighted_average_embeddings(
            [text_embedding, image_embedding],
            [text_weight, image_weight],
        )
    elif text_embedding:
        # Text only
        logger.debug(f"Using text-only embedding for annotation {annotation.pk}")
        return text_embedding
    elif image_embedding:
        # Image only
        logger.debug(f"Using image-only embedding for annotation {annotation.pk}")
        return image_embedding
    else:
        # Nothing to embed
        logger.warning(
            f"Annotation {annotation.pk} has no embeddable content "
            f"(modalities={modalities})"
        )
        return None
