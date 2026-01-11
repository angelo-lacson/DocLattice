import logging
from typing import Union

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model

# from config import celery_app
from opencontractserver.annotations.models import Annotation, Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.utils import get_default_embedder

User = get_user_model()

logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_doc_text(
    self, doc_id: Union[str, int], corpus_id: Union[str, int]
) -> None:
    """
    Calculate embeddings for the text extracted from a document, using its associated corpus.
    Retries automatically if any exception occurs, up to 3 times with a 60-second delay.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        doc_id (str | int): ID of the document.
        corpus_id (str | int): ID of the corpus to use for embedding.
    """
    try:
        doc = Document.objects.get(id=doc_id)

        if doc.txt_extract_file.name:
            with doc.txt_extract_file.open("r") as txt_file:
                text = txt_file.read()
        else:
            text = ""

        corpus = Corpus.objects.get(id=corpus_id)
        embedder_path, embeddings = corpus.embed_text(text)
        doc.add_embedding(embedder_path, embeddings)

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_doc_text() - failed to generate embeddings due to error: {e}"
        )
        raise


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_annotation_text(
    self, annotation_id: Union[str, int], embedder_path: str = None
) -> None:
    """
    Calculate embeddings for an annotation's content (text, images, or both).

    For multimodal embedders (e.g., CLIP ViT-L-14), this will:
    - Embed text content via embed_text()
    - Embed images via embed_image()
    - Combine mixed-modality content via weighted average

    All embeddings are stored in the same vector space, enabling cross-modal
    similarity search.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        annotation_id (str | int): ID of the annotation
        embedder_path (str, optional): Optional explicit embedder path to use (highest precedence)
    """
    from opencontractserver.utils.embeddings import get_embedder

    try:
        logger.info(f"Retrieving annotation with ID {annotation_id}")
        # Use select_related to avoid N+1 query when accessing document for multimodal
        annotation = Annotation.objects.select_related("document").get(pk=annotation_id)
    except Annotation.DoesNotExist:
        logger.warning(f"Annotation {annotation_id} not found.")
        return

    corpus_id = annotation.corpus_id
    logger.info(f"Processing annotation {annotation_id} with corpus_id {corpus_id}")

    # Get the embedder for this corpus/path
    embedder_class, returned_path = get_embedder(
        corpus_id=corpus_id, embedder_path=embedder_path
    )

    if not embedder_class:
        logger.error(f"No embedder found for annotation {annotation_id}")
        return

    embedder = embedder_class()
    final_path = embedder_path if embedder_path else returned_path

    # Check if embedder supports multimodal and annotation has image content
    modalities = annotation.content_modalities or ["TEXT"]
    has_images = "IMAGE" in modalities
    # Use the embedder's properties (derived from supported_modalities set)
    can_embed_images = embedder.is_multimodal and embedder.supports_images

    if can_embed_images and has_images:
        # Use multimodal embedding for annotations with images
        from opencontractserver.utils.multimodal_embeddings import (
            generate_multimodal_embedding,
        )

        logger.info(
            f"Using multimodal embedding for annotation {annotation_id} "
            f"(modalities={modalities})"
        )
        try:
            vector = generate_multimodal_embedding(annotation, embedder)
        except Exception as e:
            # Graceful degradation: fall back to text-only if multimodal fails
            logger.warning(
                f"Multimodal embedding failed for annotation {annotation_id}: {e}. "
                f"Falling back to text-only embedding."
            )
            text = annotation.raw_text or ""
            if text.strip():
                vector = embedder.embed_text(text)
            else:
                logger.info(
                    f"Annotation {annotation_id} has no text for fallback embedding."
                )
                return
    else:
        # Standard text-only embedding
        text = annotation.raw_text or ""
        if not text.strip():
            logger.info(f"Annotation {annotation_id} has no raw_text to embed.")
            return

        logger.info(
            f"Generating text embedding for annotation {annotation_id} "
            f"(text length={len(text)})"
        )
        vector = embedder.embed_text(text)

    if vector is None:
        logger.error(
            f"Embedding could not be generated for annotation {annotation_id}."
        )
        return

    logger.info(
        f"Generated embeddings for annotation {annotation_id} using {final_path} "
        f"(dimension={len(vector)}, modalities={modalities})"
    )

    # Store the embedding
    embedding = annotation.add_embedding(final_path or "unknown-embedder", vector)

    # Set the reverse FK so annotation.embeddings points to the embedding
    if embedding:
        annotation.embeddings = embedding
        annotation.save(update_fields=["embeddings"])

    logger.info(
        f"Embedding for Annotation {annotation_id} stored using path: {final_path}, "
        f"dimension={len(vector)}."
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_note_text(self, note_id: Union[str, int]) -> None:
    """
    Calculate embeddings for the text in a Note object, possibly falling back to a default embedder.
    Retries automatically if any exception occurs, up to 3 times with a 60-second delay.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        note_id (str | int): ID of the note.
    """
    try:
        note = Note.objects.get(id=note_id)
        text = note.content

        if not isinstance(text, str) or len(text) == 0:
            logger.warning(f"Note with ID {note_id} has no content or is not a string")
            return

        try:
            embedder_path, embeddings = note.corpus.embed_text(text)
        except Exception as e:
            logger.warning(
                f"Failed to use corpus embedder: {e}. Falling back to default embedder."
            )
            embedder_path = settings.DEFAULT_EMBEDDER
            embedder_class = get_default_embedder()
            embedder = embedder_class()  # Create an instance
            embeddings = embedder.embed_text(text)

        note.add_embedding(embedder_path, embeddings)

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_note_text() - failed to generate embeddings due to error: {e}"
        )
        raise
