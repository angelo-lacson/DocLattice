"""
Multimodal embedders for text and image embeddings via microservices.

This module provides embedders that support both text and image embeddings,
producing vectors in a shared embedding space for cross-modal similarity search.

Available embedders:
- CLIPMicroserviceEmbedder: CLIP ViT-L-14 model (768 dimensions)
- QwenMicroserviceEmbedder: Qwen embedding model (1024 dimensions)

Configuration is via environment variables specific to each embedder.
"""

import base64
import logging
from abc import abstractmethod
from typing import ClassVar, Optional

import numpy as np
import requests
from django.conf import settings

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.types.enums import ContentModality
from opencontractserver.utils.cloud import maybe_add_cloud_run_auth

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class EmbeddingClientError(Exception):
    """
    Raised for 4xx client errors from the embedding service.

    These errors indicate invalid input (malformed request, bad data) and
    should NOT be retried by Celery tasks.
    """

    pass


class EmbeddingServerError(Exception):
    """
    Raised for 5xx server errors from the embedding service.

    These errors indicate transient service issues and SHOULD be retried
    by Celery tasks with exponential backoff.
    """

    pass


class BaseMultimodalMicroserviceEmbedder(BaseEmbedder):
    """
    Abstract base class for multimodal embedders using microservices.

    Supports both text and image embeddings in a shared vector space, enabling
    cross-modal similarity search (e.g., find images similar to text queries).

    Subclasses must define:
        - url_setting_name: Django setting name for service URL
        - api_key_setting_name: Django setting name for API key
        - vector_size: Embedding dimension for this model
        - title, description: Human-readable metadata

    API Endpoints (expected by all implementations):
        - POST /embeddings: Text embeddings ({"text": "..."})
        - POST /embeddings/image: Image embeddings ({"image": "<base64>"})
        - POST /embeddings/batch: Batch text ({"texts": [...]} max 100)
        - POST /embeddings/image/batch: Batch images ({"images": [...]} max 20)
    """

    # Subclasses must override these
    url_setting_name: ClassVar[str] = ""
    api_key_setting_name: ClassVar[str] = ""

    dependencies = ["numpy", "requests"]
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
    ]

    # Multimodal support - text and images in same vector space
    supported_modalities = {ContentModality.TEXT, ContentModality.IMAGE}

    def __init__(self, **kwargs):
        """Initialize the multimodal embedder."""
        super().__init__(**kwargs)
        logger.info(
            f"{self.__class__.__name__} initialized (vector_size={self.vector_size})."
        )

    @property
    @abstractmethod
    def _default_url(self) -> str:
        """Default URL if setting is not configured."""
        pass

    def _get_service_config(self, all_kwargs: dict) -> tuple[str, str, dict]:
        """
        Get service URL, API key, and headers for the microservice.

        Configuration precedence:
        1. Direct keyword arguments passed to embed_* methods
        2. Settings from PIPELINE_SETTINGS for this component
        3. Global Django settings as final fallback

        Returns:
            Tuple of (service_url, api_key, headers)
        """
        component_settings = self.get_component_settings()

        # Service URL - use the setting name defined by subclass
        url_key = self.url_setting_name.lower()
        service_url_fallback = component_settings.get(
            url_key,
            getattr(settings, self.url_setting_name, self._default_url),
        )
        service_url = all_kwargs.get(url_key, service_url_fallback)

        # API Key - use the setting name defined by subclass
        api_key_key = self.api_key_setting_name.lower()
        api_key_fallback = component_settings.get(
            api_key_key,
            getattr(settings, self.api_key_setting_name, ""),
        )
        api_key = all_kwargs.get(api_key_key, api_key_fallback)

        # Cloud Run IAM auth flag
        use_cloud_run_iam_auth = bool(
            all_kwargs.get(
                "use_cloud_run_iam_auth",
                component_settings.get("use_cloud_run_iam_auth", False),
            )
        )

        # Build headers
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["X-API-Key"] = api_key

        # Add Cloud Run IAM auth if applicable
        headers = maybe_add_cloud_run_auth(
            service_url, headers, force=use_cloud_run_iam_auth
        )

        return service_url, api_key, headers

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generate text embeddings via POST /embeddings.

        Args:
            text: The text content to embed.
            **all_kwargs: All keyword arguments including PIPELINE_SETTINGS
                         and direct call-time arguments.

        Returns:
            Embedding vector as list of floats, or None on error.
        """
        logger.debug(
            f"{self.__class__.__name__} generating text embedding. "
            f"Text length: {len(text)}"
        )

        try:
            service_url, _, headers = self._get_service_config(all_kwargs)

            if not service_url:
                logger.error(
                    f"{self.__class__.__name__}: No service URL configured. "
                    f"Set {self.url_setting_name} in environment or PIPELINE_SETTINGS."
                )
                return None

            response = requests.post(
                f"{service_url}/embeddings",
                json={"text": text},
                headers=headers,
                timeout=30,
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                if np.isnan(embeddings_array).any():
                    logger.error(
                        f"Text embedding contains NaN values. "
                        f"Input text length: {len(text)}, "
                        f"first 100 chars: {text[:100]!r}"
                    )
                    return None
                # Handle both 1D (single embedding) and 2D (batch) response formats
                if embeddings_array.ndim == 1:
                    # Service returns 1D array directly: [0.1, 0.2, ...]
                    return embeddings_array.tolist()
                else:
                    # Service returns 2D batch array: [[0.1, 0.2, ...]]
                    return embeddings_array[0].tolist()
            elif 400 <= response.status_code < 500:
                # Client errors (4xx) - don't retry, likely invalid input
                logger.error(
                    f"{self.__class__.__name__} text embedding service returned client error "
                    f"{response.status_code}. Input text length: {len(text)}"
                )
                return None  # Non-retriable error
            else:
                # Server errors (5xx) or unexpected status - worth retrying
                error_msg = (
                    f"{self.__class__.__name__} text embedding service returned status "
                    f"{response.status_code}. This may be a transient error."
                )
                logger.error(error_msg)
                raise EmbeddingServerError(error_msg)  # Retriable error

        except requests.exceptions.Timeout:
            logger.error(
                f"{self.__class__.__name__} service request timed out for text embedding"
            )
            return None
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Failed to connect to {self.__class__.__name__} service: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to generate text embedding: {e}")
            return None

    def _embed_image_impl(
        self, image_base64: str, image_format: str = "jpeg", **all_kwargs
    ) -> Optional[list[float]]:
        """
        Generate image embeddings via POST /embeddings/image.

        Args:
            image_base64: Base64-encoded image data.
            image_format: Image format (jpeg, png, etc.). Currently unused by API.
            **all_kwargs: All keyword arguments including PIPELINE_SETTINGS
                         and direct call-time arguments.

        Returns:
            Embedding vector as list of floats, or None on error.
        """
        logger.debug(
            f"{self.__class__.__name__} generating image embedding. "
            f"Format: {image_format}, Data length: {len(image_base64)}"
        )

        # Validate base64 format before sending to microservice
        try:
            base64.b64decode(image_base64, validate=True)
        except Exception as e:
            logger.error(f"Invalid base64 image data: {e}")
            return None

        try:
            service_url, _, headers = self._get_service_config(all_kwargs)

            if not service_url:
                logger.error(
                    f"{self.__class__.__name__}: No service URL configured. "
                    f"Set {self.url_setting_name} in environment or PIPELINE_SETTINGS."
                )
                return None

            response = requests.post(
                f"{service_url}/embeddings/image",
                json={"image": image_base64},
                headers=headers,
                timeout=30,
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                if np.isnan(embeddings_array).any():
                    logger.error(
                        f"Image embedding contains NaN values. "
                        f"Image format: {image_format}, "
                        f"base64 data length: {len(image_base64)}"
                    )
                    return None
                # Handle both 1D (single embedding) and 2D (batch) response formats
                if embeddings_array.ndim == 1:
                    # Service returns 1D array directly: [0.1, 0.2, ...]
                    return embeddings_array.tolist()
                else:
                    # Service returns 2D batch array: [[0.1, 0.2, ...]]
                    return embeddings_array[0].tolist()
            elif 400 <= response.status_code < 500:
                # Client errors (4xx) - don't retry, likely invalid input
                logger.error(
                    f"{self.__class__.__name__} image embedding service returned client error "
                    f"{response.status_code}. Image format: {image_format}, "
                    f"base64 length: {len(image_base64)}"
                )
                return None  # Non-retriable error
            else:
                # Server errors (5xx) or unexpected status - worth retrying
                error_msg = (
                    f"{self.__class__.__name__} image embedding service returned status "
                    f"{response.status_code}. This may be a transient error."
                )
                logger.error(error_msg)
                raise EmbeddingServerError(error_msg)  # Retriable error

        except requests.exceptions.Timeout:
            logger.error(
                f"{self.__class__.__name__} service request timed out for image embedding"
            )
            return None
        except requests.exceptions.ConnectionError as e:
            logger.error(
                f"Failed to connect to {self.__class__.__name__} service for image: {e}"
            )
            return None
        except Exception as e:
            logger.error(f"Failed to generate image embedding: {e}")
            return None

    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[list[float]]]:
        """
        Generate embeddings for multiple texts in one request.

        Args:
            texts: List of text strings to embed (max 100).
            **direct_kwargs: Additional keyword arguments.

        Returns:
            List of embedding vectors, or None on error.
        """
        if len(texts) > 100:
            logger.warning(f"Batch size {len(texts)} exceeds max 100. Truncating.")
            texts = texts[:100]

        merged_kwargs = {**self.get_component_settings(), **direct_kwargs}

        try:
            service_url, _, headers = self._get_service_config(merged_kwargs)

            if not service_url:
                logger.error("No service URL configured for batch text embedding")
                return None

            response = requests.post(
                f"{service_url}/embeddings/batch",
                json={"texts": texts},
                headers=headers,
                timeout=60,
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                # Squeeze to 2D if service returns 3D array (each embedding wrapped)
                if embeddings_array.ndim == 3:
                    embeddings_array = embeddings_array.squeeze(axis=1)
                if np.isnan(embeddings_array).any():
                    nan_indices = np.where(np.isnan(embeddings_array).any(axis=1))[0]
                    logger.error(
                        f"Batch text embeddings contain NaN values at indices: {nan_indices.tolist()}. "
                        f"Batch size: {len(texts)}"
                    )
                    return None
                return embeddings_array.tolist()
            elif 400 <= response.status_code < 500:
                logger.error(
                    f"Batch text embedding service returned client error "
                    f"{response.status_code}. Batch size: {len(texts)}"
                )
                return None
            else:
                logger.error(
                    f"Batch text embedding service returned status {response.status_code}. "
                    f"This may be a transient error."
                )
                return None

        except Exception as e:
            logger.error(f"Failed to generate batch text embeddings: {e}")
            return None

    def embed_images_batch(
        self, images_base64: list[str], **direct_kwargs
    ) -> Optional[list[list[float]]]:
        """
        Generate embeddings for multiple images in one request.

        Args:
            images_base64: List of base64-encoded images (max 20).
            **direct_kwargs: Additional keyword arguments.

        Returns:
            List of embedding vectors, or None on error.
        """
        if len(images_base64) > 20:
            logger.warning(
                f"Batch size {len(images_base64)} exceeds max 20. Truncating."
            )
            images_base64 = images_base64[:20]

        merged_kwargs = {**self.get_component_settings(), **direct_kwargs}

        try:
            service_url, _, headers = self._get_service_config(merged_kwargs)

            if not service_url:
                logger.error("No service URL configured for batch image embedding")
                return None

            response = requests.post(
                f"{service_url}/embeddings/image/batch",
                json={"images": images_base64},
                headers=headers,
                timeout=120,
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                # Squeeze to 2D if service returns 3D array (each embedding wrapped)
                if embeddings_array.ndim == 3:
                    embeddings_array = embeddings_array.squeeze(axis=1)
                if np.isnan(embeddings_array).any():
                    nan_indices = np.where(np.isnan(embeddings_array).any(axis=1))[0]
                    logger.error(
                        f"Batch image embeddings contain NaN values at indices: {nan_indices.tolist()}. "
                        f"Batch size: {len(images_base64)}"
                    )
                    return None
                return embeddings_array.tolist()
            elif 400 <= response.status_code < 500:
                logger.error(
                    f"Batch image embedding service returned client error "
                    f"{response.status_code}. Batch size: {len(images_base64)}"
                )
                return None
            else:
                logger.error(
                    f"Batch image embedding service returned status {response.status_code}. "
                    f"This may be a transient error."
                )
                return None

        except Exception as e:
            logger.error(f"Failed to generate batch image embeddings: {e}")
            return None


class CLIPMicroserviceEmbedder(BaseMultimodalMicroserviceEmbedder):
    """
    Multimodal embedder using CLIP ViT-L-14 via microservice.

    Produces 768-dimensional vectors in a shared text-image embedding space.

    Configuration (via environment variables):
        - CLIP_EMBEDDER_URL: Full URL to the CLIP embedding service
        - CLIP_EMBEDDER_API_KEY: Optional API key for authentication

    For backwards compatibility, also supports legacy settings:
        - MULTIMODAL_EMBEDDER_URL (deprecated, use CLIP_EMBEDDER_URL)
        - MULTIMODAL_EMBEDDER_API_KEY (deprecated, use CLIP_EMBEDDER_API_KEY)
    """

    title = "CLIP Microservice Embedder"
    description = (
        "Generates embeddings for text and images using CLIP ViT-L-14. "
        "Produces 768-dimensional vectors in a shared embedding space for cross-modal search."
    )
    author = "OpenContracts"

    url_setting_name = "CLIP_EMBEDDER_URL"
    api_key_setting_name = "CLIP_EMBEDDER_API_KEY"
    vector_size = 768

    # Legacy setting names for backwards compatibility
    _legacy_url_setting = "MULTIMODAL_EMBEDDER_URL"
    _legacy_api_key_setting = "MULTIMODAL_EMBEDDER_API_KEY"

    @property
    def _default_url(self) -> str:
        return "http://vector-embedder:8000"

    def _get_service_config(self, all_kwargs: dict) -> tuple[str, str, dict]:
        """
        Get service URL, API key, and headers for the microservice.

        Extends base implementation to support legacy multimodal_embedder_url
        and multimodal_embedder_api_key kwargs for backwards compatibility.

        Priority order (first non-empty value wins):
        1. Direct kwargs (new key, then legacy key)
        2. Component settings (new key, then legacy key)
        3. Django settings - LEGACY key first for backwards compatibility
        4. Django settings - new key
        5. Default URL
        """
        component_settings = self.get_component_settings()

        # Service URL - check new key, then legacy key in kwargs
        url_key = self.url_setting_name.lower()
        legacy_url_key = self._legacy_url_setting.lower()

        # Check kwargs: new key first, then legacy key
        if url_key in all_kwargs:
            service_url = all_kwargs[url_key]
        elif legacy_url_key in all_kwargs:
            service_url = all_kwargs[legacy_url_key]
        else:
            # Check component settings
            if url_key in component_settings:
                service_url = component_settings[url_key]
            elif legacy_url_key in component_settings:
                service_url = component_settings[legacy_url_key]
            else:
                # Fall back to Django settings - check LEGACY first for backwards compat
                legacy_url = getattr(settings, self._legacy_url_setting, "")
                new_url = getattr(settings, self.url_setting_name, "")
                # Use legacy if set, otherwise new, otherwise default
                service_url = legacy_url or new_url or self._default_url

        # API Key - check new key, then legacy key
        api_key_key = self.api_key_setting_name.lower()
        legacy_api_key_key = self._legacy_api_key_setting.lower()

        if api_key_key in all_kwargs:
            api_key = all_kwargs[api_key_key]
        elif legacy_api_key_key in all_kwargs:
            api_key = all_kwargs[legacy_api_key_key]
        else:
            # Check component settings
            if api_key_key in component_settings:
                api_key = component_settings[api_key_key]
            elif legacy_api_key_key in component_settings:
                api_key = component_settings[legacy_api_key_key]
            else:
                # Fall back to Django settings - check LEGACY first for backwards compat
                legacy_key = getattr(settings, self._legacy_api_key_setting, "")
                new_key = getattr(settings, self.api_key_setting_name, "")
                api_key = legacy_key or new_key or ""

        # Cloud Run IAM auth flag
        use_cloud_run_iam_auth = bool(
            all_kwargs.get(
                "use_cloud_run_iam_auth",
                component_settings.get("use_cloud_run_iam_auth", False),
            )
        )

        # Build headers
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["X-API-Key"] = api_key

        # Add Cloud Run IAM auth if applicable
        headers = maybe_add_cloud_run_auth(
            service_url, headers, force=use_cloud_run_iam_auth
        )

        return service_url, api_key, headers


class QwenMicroserviceEmbedder(BaseMultimodalMicroserviceEmbedder):
    """
    Multimodal embedder using Qwen embedding model via microservice.

    Produces 1024-dimensional vectors in a shared text-image embedding space.

    Configuration (via environment variables):
        - QWEN_EMBEDDER_URL: Full URL to the Qwen embedding service
        - QWEN_EMBEDDER_API_KEY: Optional API key for authentication
    """

    title = "Qwen Microservice Embedder"
    description = (
        "Generates embeddings for text and images using Qwen embedding model. "
        "Produces 1024-dimensional vectors in a shared embedding space for cross-modal search."
    )
    author = "OpenContracts"

    url_setting_name = "QWEN_EMBEDDER_URL"
    api_key_setting_name = "QWEN_EMBEDDER_API_KEY"
    vector_size = 1024

    @property
    def _default_url(self) -> str:
        return "http://qwen-embedder:8000"


# Backwards compatibility alias - points to CLIP embedder as that was the original
# implementation. New code should use the specific embedder class directly.
MultimodalMicroserviceEmbedder = CLIPMicroserviceEmbedder
