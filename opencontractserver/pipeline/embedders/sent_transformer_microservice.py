import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import requests

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.settings_schema import (
    PipelineSetting,
    SettingType,
)
from opencontractserver.utils.cloud import maybe_add_cloud_run_auth

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class MicroserviceEmbedder(BaseEmbedder):
    """
    Embedder that generates embeddings by calling an external microservice.

    Settings are loaded from PipelineSettings database. Use the management
    command `migrate_pipeline_settings` to seed initial values from environment.
    """

    title = "Microservice Embedder"
    description = "Generates embeddings using a vector embeddings microservice."
    author = "OpenContracts Team"
    dependencies = ["numpy", "requests"]
    vector_size = 384  # Default embedding size
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
    ]

    @dataclass
    class Settings:
        """Configuration schema for MicroserviceEmbedder."""

        embeddings_microservice_url: str = field(
            default="",
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.REQUIRED,
                    required=True,
                    description="URL of the embeddings microservice",
                    env_var="EMBEDDINGS_MICROSERVICE_URL",
                )
            },
        )
        vector_embedder_api_key: str = field(
            default="",
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.SECRET,
                    required=False,
                    description="API key for the embeddings microservice (optional)",
                    env_var="VECTOR_EMBEDDER_API_KEY",
                )
            },
        )
        use_cloud_run_iam_auth: bool = field(
            default=False,
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description="Force Google Cloud Run IAM authentication",
                )
            },
        )

    def __init__(self, **kwargs):
        """Initialize MicroserviceEmbedder with settings from PipelineSettings."""
        super().__init__(**kwargs)
        logger.info("MicroserviceEmbedder initialized.")

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generate embeddings from text using the microservice.

        Args:
            text: The text content to embed.
            **all_kwargs: Additional kwargs that can override settings.

        Returns:
            Embedding as a list of floats, or None if an error occurs.
        """
        logger.debug(
            f"MicroserviceEmbedder received text for embedding. Effective kwargs: {all_kwargs}"
        )
        try:
            # Use settings from the Settings dataclass (loaded from PipelineSettings DB)
            # Use dataclass defaults if settings not yet loaded from database
            s = self.settings if self.settings is not None else self.Settings()

            service_url = all_kwargs.get(
                "embeddings_microservice_url", s.embeddings_microservice_url
            )
            api_key = all_kwargs.get(
                "vector_embedder_api_key", s.vector_embedder_api_key
            )
            use_cloud_run_iam_auth = bool(
                all_kwargs.get("use_cloud_run_iam_auth", s.use_cloud_run_iam_auth)
            )

            headers: dict[str, str] = {"Content-Type": "application/json"}
            if api_key:
                headers["X-API-Key"] = api_key

            # Attach Cloud Run IAM id_token if applicable/forced
            headers = maybe_add_cloud_run_auth(
                service_url, headers, force=use_cloud_run_iam_auth
            )

            response = requests.post(
                f"{service_url}/embeddings",
                json={"text": text},
                headers=headers,
                timeout=30,
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                if np.isnan(embeddings_array).any():
                    logger.error("Embedding contains NaN values")
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
                    f"Microservice returned client error {response.status_code}. "
                    f"Input text length: {len(text)}"
                )
                return None  # Non-retriable error
            else:
                # Server errors (5xx) or unexpected status - worth logging distinctly
                logger.error(
                    f"Microservice returned server error {response.status_code}. "
                    f"This may be a transient error."
                )
                return None
        except Exception as e:
            logger.error(
                f"MicroserviceEmbedder - failed to generate embeddings due to error: {e}"
            )
            return None
