"""
Multimodal embedder using CLIP ViT-L-14 via microservice.

This embedder supports both text and image embeddings using the CLIP model,
which produces 768-dimensional vectors suitable for cross-modal similarity search.
"""

import logging
from typing import Optional

import numpy as np
import requests
from django.conf import settings

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.utils.cloud import maybe_add_cloud_run_auth

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class MultimodalMicroserviceEmbedder(BaseEmbedder):
    """
    Multimodal embedder using CLIP ViT-L-14 via microservice.

    Supports both text and image embeddings with 768-dimensional output.
    Text and image embeddings are in the same vector space, enabling
    cross-modal similarity search (e.g., find images similar to text queries).

    API Endpoints:
        - POST /embeddings: Text embeddings ({"text": "..."})
        - POST /embeddings/image: Image embeddings ({"image": "<base64>"})
        - POST /embeddings/batch: Batch text ({"texts": [...]} max 100)
        - POST /embeddings/image/batch: Batch images ({"images": [...]} max 20)
    """

    title = "Multimodal Microservice Embedder"
    description = (
        "Generates embeddings for text and images using CLIP ViT-L-14. "
        "Produces 768-dimensional vectors in a shared embedding space."
    )
    author = "OpenContracts"
    dependencies = ["numpy", "requests"]
    vector_size = 768  # CLIP ViT-L-14 embedding dimension
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
    ]

    # Multimodal support flags
    is_multimodal = True
    supports_text = True
    supports_images = True

    def __init__(self, **kwargs):
        """Initialize the MultimodalMicroserviceEmbedder."""
        super().__init__(**kwargs)
        logger.info("MultimodalMicroserviceEmbedder initialized.")

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

        # Service URL
        service_url_fallback = component_settings.get(
            "multimodal_embedder_url",
            getattr(settings, "MULTIMODAL_EMBEDDER_URL", ""),
        )
        service_url = all_kwargs.get("multimodal_embedder_url", service_url_fallback)

        # API Key
        api_key_fallback = component_settings.get(
            "multimodal_embedder_api_key",
            getattr(settings, "MULTIMODAL_EMBEDDER_API_KEY", ""),
        )
        api_key = all_kwargs.get("multimodal_embedder_api_key", api_key_fallback)

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
            768-dimensional embedding as list of floats, or None on error.
        """
        logger.debug(
            f"MultimodalMicroserviceEmbedder generating text embedding. "
            f"Text length: {len(text)}"
        )

        try:
            service_url, _, headers = self._get_service_config(all_kwargs)

            if not service_url:
                logger.error(
                    "MultimodalMicroserviceEmbedder: No service URL configured. "
                    "Set MULTIMODAL_EMBEDDER_URL in environment or PIPELINE_SETTINGS."
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
                    logger.error("Text embedding contains NaN values")
                    return None
                return embeddings_array[0].tolist()
            else:
                logger.error(
                    f"Multimodal service returned status {response.status_code}: "
                    f"{response.text[:200]}"
                )
                return None

        except requests.exceptions.Timeout:
            logger.error("Multimodal service request timed out for text embedding")
            return None
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Failed to connect to multimodal service: {e}")
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
            768-dimensional embedding as list of floats, or None on error.
        """
        logger.debug(
            f"MultimodalMicroserviceEmbedder generating image embedding. "
            f"Format: {image_format}, Data length: {len(image_base64)}"
        )

        try:
            service_url, _, headers = self._get_service_config(all_kwargs)

            if not service_url:
                logger.error(
                    "MultimodalMicroserviceEmbedder: No service URL configured. "
                    "Set MULTIMODAL_EMBEDDER_URL in environment or PIPELINE_SETTINGS."
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
                    logger.error("Image embedding contains NaN values")
                    return None
                return embeddings_array[0].tolist()
            else:
                logger.error(
                    f"Multimodal image service returned status {response.status_code}: "
                    f"{response.text[:200]}"
                )
                return None

        except requests.exceptions.Timeout:
            logger.error("Multimodal service request timed out for image embedding")
            return None
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Failed to connect to multimodal service for image: {e}")
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
            List of 768-dimensional embeddings, or None on error.
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
                    logger.error("Batch text embeddings contain NaN values")
                    return None
                return embeddings_array.tolist()
            else:
                logger.error(
                    f"Batch text embedding failed with status {response.status_code}: "
                    f"{response.text[:200]}"
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
            List of 768-dimensional embeddings, or None on error.
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
                    logger.error("Batch image embeddings contain NaN values")
                    return None
                return embeddings_array.tolist()
            else:
                logger.error(
                    f"Batch image embedding failed with status {response.status_code}: "
                    f"{response.text[:200]}"
                )
                return None

        except Exception as e:
            logger.error(f"Failed to generate batch image embeddings: {e}")
            return None
