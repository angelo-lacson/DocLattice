"""
Image retrieval tools for LLM agents.

Provides tools to access document images for multimodal analysis, with
permission-checked variants for secure access.
"""

import json
import logging
from functools import partial
from typing import Any, Optional

from pydantic import BaseModel, Field

from opencontractserver.annotations.models import Annotation
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.pdf_token_extraction import (
    get_image_as_base64,
    get_image_data_url,
)
from opencontractserver.utils.permissioning import user_has_permission_for_obj

logger = logging.getLogger(__name__)

# Import async database wrapper
try:
    from channels.db import database_sync_to_async as _database_sync_to_async

    _db_sync_to_async = partial(_database_sync_to_async, thread_sensitive=False)
except ModuleNotFoundError:
    from asgiref.sync import sync_to_async as _sync_to_async

    _db_sync_to_async = partial(_sync_to_async, thread_sensitive=False)


class ImageReference(BaseModel):
    """Reference to an image token in a document."""

    page_index: int = Field(description="0-based page index")
    token_index: int = Field(
        description="0-based token index within the page's tokens array"
    )
    width: float = Field(description="Image width in PDF points")
    height: float = Field(description="Image height in PDF points")
    x: float = Field(description="X coordinate of image in PDF points")
    y: float = Field(description="Y coordinate of image in PDF points")
    format: str = Field(default="jpeg", description="Image format (jpeg, png)")
    image_type: Optional[str] = Field(
        None, description="Type: embedded, cropped, figure"
    )
    alt_text: Optional[str] = Field(None, description="Alt text if available")
    content_hash: Optional[str] = Field(None, description="Content hash for dedup")


class ImageData(BaseModel):
    """Image data ready for LLM consumption."""

    base64_data: str = Field(description="Base64-encoded image data")
    format: str = Field(description="Image format (jpeg, png)")
    data_url: str = Field(description="Data URL for embedding in prompts")
    page_index: int = Field(description="0-based page index")
    token_index: int = Field(
        description="0-based token index within the page's tokens array"
    )


def _load_pawls_data(document: Document) -> Optional[list[dict[str, Any]]]:
    """
    Load PAWLs data from a document.

    Args:
        document: The Document instance.

    Returns:
        Parsed PAWLs data as list of page dicts, or None if unavailable.
    """
    pawls_content = document.pawls_parse_file
    if not pawls_content:
        return None

    try:
        if hasattr(pawls_content, "read"):
            pawls_content.open("r")
            try:
                pawls_data = json.load(pawls_content)
            finally:
                pawls_content.close()
        else:
            pawls_data = pawls_content

        return pawls_data
    except Exception as e:
        logger.error(f"Failed to parse PAWLs data for document {document.pk}: {e}")
        return None


def list_document_images(
    document_id: int,
    page_index: Optional[int] = None,
) -> list[ImageReference]:
    """
    List all image tokens in a document, optionally filtered by page.

    This function returns metadata about image tokens without loading the actual
    image data. Use get_document_image to retrieve specific images.

    Images are stored as tokens with is_image=True in the unified tokens[] array.

    Args:
        document_id: The document ID.
        page_index: Optional page filter (0-based). If None, returns all pages.

    Returns:
        List of ImageReference objects with position and metadata.
    """
    try:
        document = Document.objects.get(pk=document_id)
        pawls_data = _load_pawls_data(document)

        if not pawls_data:
            return []

        images: list[ImageReference] = []
        for page_idx, page in enumerate(pawls_data):
            if page_index is not None and page_idx != page_index:
                continue

            if not isinstance(page, dict):
                continue

            # Iterate through tokens and filter for image tokens
            page_tokens = page.get("tokens", [])
            for token_idx, token in enumerate(page_tokens):
                if not isinstance(token, dict):
                    continue

                # Only process image tokens
                if not token.get("is_image"):
                    continue

                images.append(
                    ImageReference(
                        page_index=page_idx,
                        token_index=token_idx,
                        width=float(token.get("width", 0)),
                        height=float(token.get("height", 0)),
                        x=float(token.get("x", 0)),
                        y=float(token.get("y", 0)),
                        format=token.get("format", "jpeg"),
                        image_type=token.get("image_type"),
                        alt_text=token.get("alt_text"),
                        content_hash=token.get("content_hash"),
                    )
                )

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
    token_index: int,
) -> Optional[ImageData]:
    """
    Get image data for a specific image token in a document.

    Retrieves the actual image data (base64 encoded) for the specified image token.
    The returned ImageData includes a data_url suitable for LLM vision input.

    Images are stored as tokens with is_image=True in the unified tokens[] array.

    Args:
        document_id: The document ID.
        page_index: 0-based page index.
        token_index: 0-based token index within the page's tokens array.

    Returns:
        ImageData with base64 content and data URL, or None if not found or not an image token.
    """
    try:
        document = Document.objects.get(pk=document_id)
        pawls_data = _load_pawls_data(document)

        if not pawls_data:
            return None

        if page_index < 0 or page_index >= len(pawls_data):
            logger.warning(
                f"Page index {page_index} out of bounds for document {document_id}"
            )
            return None

        page = pawls_data[page_index]
        if not isinstance(page, dict):
            return None

        page_tokens = page.get("tokens", [])

        if token_index < 0 or token_index >= len(page_tokens):
            logger.warning(
                f"Token index {token_index} out of bounds for page {page_index}"
            )
            return None

        token = page_tokens[token_index]

        # Verify this is an image token
        if not token.get("is_image"):
            logger.warning(
                f"Token at index {token_index} on page {page_index} is not an image token"
            )
            return None

        base64_data = get_image_as_base64(token)
        if not base64_data:
            logger.warning(
                f"Could not get base64 data for image token {token_index} on page {page_index}"
            )
            return None

        data_url = get_image_data_url(token)
        img_format = token.get("format", "jpeg")

        return ImageData(
            base64_data=base64_data,
            format=img_format,
            data_url=data_url or f"data:image/{img_format};base64,{base64_data}",
            page_index=page_index,
            token_index=token_index,
        )
    except Document.DoesNotExist:
        logger.warning(f"Document {document_id} not found")
        return None
    except Exception as e:
        logger.error(f"Error getting image from document {document_id}: {e}")
        return None


def get_annotation_images(annotation_id: int) -> list[ImageData]:
    """
    Get all image tokens referenced by an annotation.

    Annotations reference tokens via tokensJsons in their annotation_json field.
    This function filters for image tokens (is_image=True) and retrieves their
    actual image data.

    Args:
        annotation_id: The annotation ID.

    Returns:
        List of ImageData for image tokens referenced by this annotation.
    """
    try:
        annotation = Annotation.objects.select_related("document").get(pk=annotation_id)
        document = annotation.document

        if not document:
            logger.warning(f"Annotation {annotation_id} has no document")
            return []

        # Get tokensJsons from annotation's json field
        annotation_json = annotation.json or {}

        images: list[ImageData] = []
        for page_key, page_data in annotation_json.items():
            if not isinstance(page_data, dict):
                continue

            # Get token references from the annotation
            token_refs = page_data.get("tokensJsons", [])
            for ref in token_refs:
                if not isinstance(ref, dict):
                    continue

                page_idx = ref.get("pageIndex")
                token_idx = ref.get("tokenIndex")
                if page_idx is not None and token_idx is not None:
                    # get_document_image will verify the token is an image token
                    img_data = get_document_image(document.pk, page_idx, token_idx)
                    if img_data:
                        images.append(img_data)

        return images
    except Annotation.DoesNotExist:
        logger.warning(f"Annotation {annotation_id} not found")
        return []
    except Exception as e:
        logger.error(f"Error getting annotation images: {e}")
        return []


# =============================================================================
# Permission-Checked Versions
# =============================================================================


def list_document_images_with_permission(
    user,
    document_id: int,
    page_index: Optional[int] = None,
) -> list[ImageReference]:
    """
    Permission-checked version of list_document_images.

    Verifies the user has READ permission on the document before listing images.

    Args:
        user: The user requesting access.
        document_id: The document ID.
        page_index: Optional page filter (0-based).

    Returns:
        List of ImageReference objects if permitted, empty list otherwise.
    """
    try:
        document = Document.objects.get(pk=document_id)
        if not user_has_permission_for_obj(
            user, document, PermissionTypes.READ, include_group_permissions=True
        ):
            logger.warning(f"User {user} lacks permission for document {document_id}")
            return []
        return list_document_images(document_id, page_index)
    except Document.DoesNotExist:
        return []  # Same response for missing or unauthorized (IDOR protection)


def get_document_image_with_permission(
    user,
    document_id: int,
    page_index: int,
    token_index: int,
) -> Optional[ImageData]:
    """
    Permission-checked version of get_document_image.

    Verifies the user has READ permission on the document before retrieving
    image data.

    Args:
        user: The user requesting access.
        document_id: The document ID.
        page_index: 0-based page index.
        token_index: 0-based token index within the page's tokens array.

    Returns:
        ImageData if permitted and found, None otherwise.
    """
    try:
        document = Document.objects.get(pk=document_id)
        if not user_has_permission_for_obj(
            user, document, PermissionTypes.READ, include_group_permissions=True
        ):
            logger.warning(f"User {user} lacks permission for document {document_id}")
            return None
        return get_document_image(document_id, page_index, token_index)
    except Document.DoesNotExist:
        return None  # Same response for missing or unauthorized (IDOR protection)


def get_annotation_images_with_permission(
    user,
    annotation_id: int,
) -> list[ImageData]:
    """
    Permission-checked version of get_annotation_images.

    Verifies the user has READ permission on the annotation's document
    before retrieving images.

    Args:
        user: The user requesting access.
        annotation_id: The annotation ID.

    Returns:
        List of ImageData if permitted, empty list otherwise.
    """
    try:
        annotation = Annotation.objects.select_related("document").get(pk=annotation_id)
        document = annotation.document
        if not document:
            return []

        if not user_has_permission_for_obj(
            user, document, PermissionTypes.READ, include_group_permissions=True
        ):
            logger.warning(
                f"User {user} lacks permission for document {document.pk} "
                f"(annotation {annotation_id})"
            )
            return []

        return get_annotation_images(annotation_id)
    except Annotation.DoesNotExist:
        return []  # Same response for missing or unauthorized (IDOR protection)


# =============================================================================
# Async Versions
# =============================================================================


async def alist_document_images(
    document_id: int,
    page_index: Optional[int] = None,
) -> list[ImageReference]:
    """Async version of list_document_images."""
    return await _db_sync_to_async(list_document_images)(
        document_id=document_id,
        page_index=page_index,
    )


async def aget_document_image(
    document_id: int,
    page_index: int,
    token_index: int,
) -> Optional[ImageData]:
    """Async version of get_document_image."""
    return await _db_sync_to_async(get_document_image)(
        document_id=document_id,
        page_index=page_index,
        token_index=token_index,
    )


async def aget_annotation_images(annotation_id: int) -> list[ImageData]:
    """Async version of get_annotation_images."""
    return await _db_sync_to_async(get_annotation_images)(
        annotation_id=annotation_id,
    )


async def alist_document_images_with_permission(
    user,
    document_id: int,
    page_index: Optional[int] = None,
) -> list[ImageReference]:
    """Async version of list_document_images_with_permission."""
    return await _db_sync_to_async(list_document_images_with_permission)(
        user=user,
        document_id=document_id,
        page_index=page_index,
    )


async def aget_document_image_with_permission(
    user,
    document_id: int,
    page_index: int,
    token_index: int,
) -> Optional[ImageData]:
    """Async version of get_document_image_with_permission."""
    return await _db_sync_to_async(get_document_image_with_permission)(
        user=user,
        document_id=document_id,
        page_index=page_index,
        token_index=token_index,
    )


async def aget_annotation_images_with_permission(
    user,
    annotation_id: int,
) -> list[ImageData]:
    """Async version of get_annotation_images_with_permission."""
    return await _db_sync_to_async(get_annotation_images_with_permission)(
        user=user,
        annotation_id=annotation_id,
    )
