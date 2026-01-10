import logging
from abc import ABC, abstractmethod
from collections.abc import Mapping
from typing import Optional

from opencontractserver.pipeline.base.file_types import FileTypeEnum

from .base_component import PipelineComponentBase

logger = logging.getLogger(__name__)


class BaseEmbedder(PipelineComponentBase, ABC):
    """
    Abstract base class for embedders. Embedders should inherit from this class.
    Handles automatic loading of settings from Django settings.PIPELINE_SETTINGS.

    Embedders can support different modalities:
    - Text-only (default): Only supports text embedding via embed_text()
    - Multimodal: Supports both text and image embedding

    To create a multimodal embedder:
    1. Set `is_multimodal = True` and `supports_images = True`
    2. Implement `_embed_image_impl()` in addition to `_embed_text_impl()`
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    vector_size: int = 0  # Provide the data shape of the returned embeddings.
    supported_file_types: list[FileTypeEnum] = []
    input_schema: Mapping = (
        {}
    )  # If you want user to provide inputs, define a jsonschema here

    # Multimodal support flags
    is_multimodal: bool = False  # Whether this embedder supports multiple modalities
    supports_text: bool = True  # Whether this embedder supports text input
    supports_images: bool = False  # Whether this embedder supports image input

    def __init__(self, **kwargs):
        """
        Initializes the Embedder.
        Kwargs are passed to the superclass constructor (PipelineComponentBase).
        """
        super().__init__(**kwargs)

    @abstractmethod
    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Abstract internal method to generate embeddings from text.
        Concrete subclasses must implement this method.

        Args:
            text (str): The text content to embed.
            **all_kwargs: All keyword arguments, including those from
                          PIPELINE_SETTINGS and direct call-time arguments.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if an error occurs.
        """
        pass

    def _embed_image_impl(
        self, image_base64: str, image_format: str = "jpeg", **all_kwargs
    ) -> Optional[list[float]]:
        """
        Internal method to generate embeddings from an image.
        Override this method in multimodal embedders that support image input.

        Args:
            image_base64 (str): Base64-encoded image data.
            image_format (str): Image format (e.g., "jpeg", "png", "webp").
            **all_kwargs: All keyword arguments, including those from
                          PIPELINE_SETTINGS and direct call-time arguments.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if
                                   an error occurs or images are not supported.
        """
        if not self.supports_images:
            logger.warning(
                f"{self.__class__.__name__} does not support image embeddings. "
                "Override _embed_image_impl() and set supports_images=True."
            )
            return None
        raise NotImplementedError(
            f"{self.__class__.__name__} claims to support images but "
            "_embed_image_impl() is not implemented."
        )

    def embed_text(self, text: str, **direct_kwargs) -> Optional[list[float]]:
        """
        Generates embeddings from text, automatically injecting settings from PIPELINE_SETTINGS.

        Args:
            text (str): The text content to embed.
            **direct_kwargs: Arbitrary keyword arguments that may be provided
                             for specific embedder functionalities at call time.
                             These will override settings from PIPELINE_SETTINGS.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if an error occurs.
        """
        if not self.supports_text:
            logger.warning(
                f"{self.__class__.__name__} does not support text embeddings."
            )
            return None
        merged_kwargs = {**self.get_component_settings(), **direct_kwargs}
        logger.info(f"Calling _embed_text_impl with merged kwargs: {merged_kwargs}")
        return self._embed_text_impl(text, **merged_kwargs)

    def embed_image(
        self, image_base64: str, image_format: str = "jpeg", **direct_kwargs
    ) -> Optional[list[float]]:
        """
        Generates embeddings from an image, automatically injecting settings from PIPELINE_SETTINGS.

        Args:
            image_base64 (str): Base64-encoded image data.
            image_format (str): Image format (e.g., "jpeg", "png", "webp").
            **direct_kwargs: Arbitrary keyword arguments that may be provided
                             for specific embedder functionalities at call time.
                             These will override settings from PIPELINE_SETTINGS.

        Returns:
            Optional[List[float]]: The embeddings as a list of floats, or None if
                                   an error occurs or images are not supported.
        """
        if not self.supports_images:
            logger.warning(
                f"{self.__class__.__name__} does not support image embeddings. "
                f"is_multimodal={self.is_multimodal}, supports_images={self.supports_images}"
            )
            return None
        merged_kwargs = {**self.get_component_settings(), **direct_kwargs}
        logger.info(f"Calling _embed_image_impl with merged kwargs: {merged_kwargs}")
        return self._embed_image_impl(image_base64, image_format, **merged_kwargs)

    def embed_text_and_image(
        self,
        text: str,
        image_base64: str,
        image_format: str = "jpeg",
        **direct_kwargs,
    ) -> Optional[list[float]]:
        """
        Generates embeddings from both text and image combined.
        This is useful for multimodal models that can jointly encode text and images.

        Default implementation returns None. Override in multimodal embedders
        that support joint text-image encoding.

        Args:
            text (str): The text content to embed.
            image_base64 (str): Base64-encoded image data.
            image_format (str): Image format (e.g., "jpeg", "png", "webp").
            **direct_kwargs: Arbitrary keyword arguments.

        Returns:
            Optional[List[float]]: The joint embeddings, or None if not supported.
        """
        if not self.is_multimodal:
            logger.warning(
                f"{self.__class__.__name__} is not a multimodal embedder. "
                "Cannot generate joint text-image embeddings."
            )
            return None
        # Default: not implemented, subclasses can override
        logger.warning(
            f"{self.__class__.__name__} does not implement joint text-image embedding. "
            "Consider embedding text and image separately."
        )
        return None
