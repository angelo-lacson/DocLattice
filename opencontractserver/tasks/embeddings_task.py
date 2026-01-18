import logging
from typing import Callable, Optional, Union

from celery import shared_task
from celery.utils.log import get_task_logger
from django.conf import settings
from django.contrib.auth import get_user_model

from opencontractserver.annotations.models import Annotation, Note
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.utils import (
    get_component_by_name,
    get_default_embedder,
)
from opencontractserver.shared.mixins import HasEmbeddingMixin
from opencontractserver.types.enums import ContentModality

User = get_user_model()

logger = get_task_logger(__name__)
logger.setLevel(logging.DEBUG)


def _create_text_embedding(
    obj: HasEmbeddingMixin,
    embedder: BaseEmbedder,
    embedder_path: str,
    text: str,
    obj_type: str,
    obj_id: int,
) -> bool:
    """
    Helper to create a text embedding for any object with HasEmbeddingMixin.

    Args:
        obj: The object to embed (Document, Note, etc.)
        embedder: The embedder instance to use
        embedder_path: Path identifier for the embedder
        text: The text to embed
        obj_type: Type name for logging (e.g., "document", "note")
        obj_id: Object ID for logging

    Returns:
        True if embedding was created successfully, False otherwise
    """
    if not text.strip():
        logger.info(f"{obj_type.capitalize()} {obj_id} has no text to embed.")
        return False

    logger.info(
        f"Generating text embedding for {obj_type} {obj_id} "
        f"with embedder {embedder_path} (text length={len(text)})"
    )

    vector = embedder.embed_text(text)

    if vector is None:
        logger.error(
            f"Embedding could not be generated for {obj_type} {obj_id} "
            f"using embedder {embedder_path}."
        )
        return False

    # Store the embedding - add_embedding handles duplicates via store_embedding
    embedding = obj.add_embedding(embedder_path, vector)

    if embedding:
        logger.info(
            f"Embedding for {obj_type} {obj_id} stored using path: {embedder_path} "
            f"(dimension={len(vector)})"
        )
        return True

    return False


def _create_embedding_for_annotation(
    annotation: Annotation,
    embedder: BaseEmbedder,
    embedder_path: str,
) -> bool:
    """
    Helper to create a single embedding for an annotation.

    Handles both text-only and multimodal embeddings based on annotation
    content and embedder capabilities.

    Args:
        annotation: The annotation to embed
        embedder: The embedder instance to use
        embedder_path: Path identifier for the embedder

    Returns:
        True if embedding was created successfully, False otherwise
    """
    modalities = annotation.content_modalities or [ContentModality.TEXT.value]
    has_images = ContentModality.IMAGE.value in modalities
    can_embed_images = embedder.is_multimodal and embedder.supports_images

    if can_embed_images and has_images:
        # Use multimodal embedding for annotations with images
        from opencontractserver.utils.multimodal_embeddings import (
            generate_multimodal_embedding,
        )

        logger.info(
            f"Using multimodal embedding for annotation {annotation.id} "
            f"with embedder {embedder_path} (modalities={modalities})"
        )
        try:
            vector = generate_multimodal_embedding(annotation, embedder)

            if vector is None:
                logger.error(
                    f"Embedding could not be generated for annotation {annotation.id} "
                    f"using embedder {embedder_path}."
                )
                return False

            logger.info(
                f"Generated multimodal embedding for annotation {annotation.id} "
                f"using {embedder_path} (dimension={len(vector)}, modalities={modalities})"
            )

            # Store the embedding - add_embedding handles duplicates via store_embedding
            embedding = annotation.add_embedding(embedder_path, vector)

            if embedding:
                logger.info(
                    f"Embedding for annotation {annotation.id} stored "
                    f"using path: {embedder_path}"
                )
                return True

            return False

        except Exception as e:
            # Graceful degradation: fall back to text-only if multimodal fails
            logger.warning(
                f"Multimodal embedding failed for annotation {annotation.id}: {e}. "
                f"Falling back to text-only embedding."
            )
            return _create_text_embedding(
                annotation,
                embedder,
                embedder_path,
                annotation.raw_text or "",
                "annotation",
                annotation.id,
            )
    else:
        # Standard text-only embedding
        return _create_text_embedding(
            annotation,
            embedder,
            embedder_path,
            annotation.raw_text or "",
            "annotation",
            annotation.id,
        )


def _apply_dual_embedding_strategy(
    obj: HasEmbeddingMixin,
    text: str,
    corpus_id: Optional[int],
    obj_type: str,
    obj_id: int,
    embed_func: Callable[[HasEmbeddingMixin, BaseEmbedder, str], bool],
) -> None:
    """
    Apply the dual embedding strategy to any embeddable object.

    DUAL EMBEDDING STRATEGY:
    - ALWAYS creates a DEFAULT_EMBEDDER embedding (for global search)
    - ADDITIONALLY creates corpus-specific embedding if corpus uses different embedder

    Args:
        obj: The object to embed (must have HasEmbeddingMixin)
        text: The text to embed (used for early return check)
        corpus_id: Optional corpus ID for corpus-specific embedding
        obj_type: Type name for logging (e.g., "document", "annotation")
        obj_id: Object ID for logging
        embed_func: Function to call for creating embeddings (handles modality specifics)
    """
    if not text.strip():
        logger.info(f"{obj_type.capitalize()} {obj_id} has no text to embed.")
        return

    # 1. Always create DEFAULT_EMBEDDER embedding (for global search)
    default_embedder_path = settings.DEFAULT_EMBEDDER
    logger.info(
        f"Creating default embedding for {obj_type} {obj_id} "
        f"using {default_embedder_path} (for global search)"
    )

    try:
        default_embedder_class = get_default_embedder()
        if default_embedder_class:
            default_embedder = default_embedder_class()
            embed_func(obj, default_embedder, default_embedder_path)
        else:
            logger.error(f"Could not get default embedder for {obj_type} {obj_id}")
    except Exception as e:
        logger.error(f"Failed to create default embedding for {obj_type} {obj_id}: {e}")
        # Don't raise - continue to try corpus embedding if applicable

    # 2. If corpus has different preferred_embedder, also create corpus-specific embedding
    if corpus_id:
        try:
            corpus = Corpus.objects.get(id=corpus_id)
            corpus_embedder_path = corpus.preferred_embedder

            if corpus_embedder_path and corpus_embedder_path != default_embedder_path:
                logger.info(
                    f"Creating corpus-specific embedding for {obj_type} {obj_id} "
                    f"using {corpus_embedder_path} (corpus {corpus.id})"
                )
                try:
                    corpus_embedder_class = get_component_by_name(corpus_embedder_path)
                    corpus_embedder = corpus_embedder_class()
                    embed_func(obj, corpus_embedder, corpus_embedder_path)
                except Exception as e:
                    logger.error(
                        f"Failed to create corpus embedding for {obj_type} {obj_id} "
                        f"with embedder {corpus_embedder_path}: {e}"
                    )
            else:
                logger.debug(
                    f"Corpus {corpus.id} uses default embedder or has no preference, "
                    f"skipping duplicate corpus-specific embedding"
                )
        except Corpus.DoesNotExist:
            logger.warning(f"Corpus {corpus_id} not found")
        except Exception as e:
            logger.error(
                f"Error processing corpus-specific embedding for {obj_type} {obj_id}: {e}"
            )

    logger.info(f"Completed embedding generation for {obj_type} {obj_id}")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_doc_text(
    self, doc_id: Union[str, int], corpus_id: Optional[Union[str, int]] = None
) -> None:
    """
    Calculate embeddings for the text extracted from a document.

    DUAL EMBEDDING STRATEGY:
    - ALWAYS creates a DEFAULT_EMBEDDER embedding (for global search)
    - ADDITIONALLY creates corpus-specific embedding if corpus uses different embedder

    Retries automatically if any exception occurs, up to 3 times with a 60-second delay.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        doc_id (str | int): ID of the document.
        corpus_id (str | int, optional): ID of the corpus for corpus-specific embedding.
    """
    try:
        doc = Document.objects.get(id=doc_id)

        if doc.txt_extract_file.name:
            with doc.txt_extract_file.open("r") as txt_file:
                text = txt_file.read()
        else:
            text = ""

        # Create embed function for documents (text-only)
        def doc_embed_func(obj, embedder, embedder_path):
            return _create_text_embedding(
                obj, embedder, embedder_path, text, "document", doc.id
            )

        _apply_dual_embedding_strategy(
            obj=doc,
            text=text,
            corpus_id=int(corpus_id) if corpus_id else None,
            obj_type="document",
            obj_id=doc.id,
            embed_func=doc_embed_func,
        )

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
    self,
    annotation_id: Union[str, int],
    corpus_id: Optional[Union[str, int]] = None,
    embedder_path: Optional[str] = None,
) -> None:
    """
    Calculate embeddings for an annotation's content (text, images, or both).

    DUAL EMBEDDING STRATEGY:
    - ALWAYS creates a DEFAULT_EMBEDDER embedding (for global search)
    - ADDITIONALLY creates corpus-specific embedding if corpus uses different embedder

    For multimodal embedders (e.g., CLIP ViT-L-14), this will:
    - Embed text content via embed_text()
    - Embed images via embed_image()
    - Combine mixed-modality content via weighted average

    All embeddings are stored in the same vector space, enabling cross-modal
    similarity search.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        annotation_id (str | int): ID of the annotation
        corpus_id (str | int, optional): ID of the corpus for corpus-specific embedding
        embedder_path (str, optional): Optional explicit embedder path to use (overrides all)
    """
    try:
        logger.info(f"Retrieving annotation with ID {annotation_id}")
        # Use select_related to avoid N+1 queries when accessing document/structural_set
        # for multimodal embeddings (structural annotations load PAWLs from structural_set)
        annotation = Annotation.objects.select_related(
            "document", "structural_set"
        ).get(pk=annotation_id)
    except Annotation.DoesNotExist:
        logger.warning(f"Annotation {annotation_id} not found.")
        return

    # If explicit embedder_path is provided, use only that (bypass dual embedding)
    if embedder_path:
        logger.info(
            f"Using explicit embedder_path {embedder_path} for annotation {annotation_id}"
        )
        try:
            embedder_class = get_component_by_name(embedder_path)
            embedder = embedder_class()
            _create_embedding_for_annotation(annotation, embedder, embedder_path)
        except Exception as e:
            logger.error(
                f"Failed to create embedding with explicit path {embedder_path}: {e}"
            )
            raise
        return

    # Use provided corpus_id or fall back to annotation's corpus_id
    effective_corpus_id = corpus_id or annotation.corpus_id

    # Apply dual embedding strategy using annotation-specific embed function
    # that handles multimodal content
    _apply_dual_embedding_strategy(
        obj=annotation,
        text=annotation.raw_text or "",
        corpus_id=int(effective_corpus_id) if effective_corpus_id else None,
        obj_type="annotation",
        obj_id=annotation.id,
        embed_func=_create_embedding_for_annotation,
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def calculate_embedding_for_note_text(
    self, note_id: Union[str, int], corpus_id: Optional[Union[str, int]] = None
) -> None:
    """
    Calculate embeddings for the text in a Note object.

    DUAL EMBEDDING STRATEGY:
    - ALWAYS creates a DEFAULT_EMBEDDER embedding (for global search)
    - ADDITIONALLY creates corpus-specific embedding if corpus uses different embedder

    Retries automatically if any exception occurs, up to 3 times with a 60-second delay.

    Args:
        self: (Celery task instance, passed automatically when bind=True)
        note_id (str | int): ID of the note.
        corpus_id (str | int, optional): ID of the corpus for corpus-specific embedding.
    """
    try:
        note = Note.objects.get(id=note_id)
        text = note.content

        if not isinstance(text, str) or len(text) == 0:
            logger.warning(f"Note with ID {note_id} has no content or is not a string")
            return

        # Use provided corpus_id or fall back to note's corpus_id
        effective_corpus_id = corpus_id or (note.corpus_id if note.corpus else None)

        # Create embed function for notes (text-only)
        def note_embed_func(obj, embedder, embedder_path):
            return _create_text_embedding(
                obj, embedder, embedder_path, text, "note", note.id
            )

        _apply_dual_embedding_strategy(
            obj=note,
            text=text,
            corpus_id=int(effective_corpus_id) if effective_corpus_id else None,
            obj_type="note",
            obj_id=note.id,
            embed_func=note_embed_func,
        )

    except Exception as e:
        logger.error(
            f"calculate_embedding_for_note_text() - failed to generate embeddings due to error: {e}"
        )
        raise
