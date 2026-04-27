import logging
from dataclasses import dataclass, field
from typing import Optional

import openai

from opencontractserver.constants.embeddings import (
    DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
    DEFAULT_OPENAI_EMBEDDING_MODEL,
    OPENAI_MODEL_DIMENSIONS,
)
from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.settings_schema import (
    PipelineSetting,
    SettingType,
)

logger = logging.getLogger(__name__)


class OpenAIEmbedder(BaseEmbedder):
    """
    Embedder that generates text embeddings using the OpenAI Embeddings API.

    Supports text-embedding-3-small (default), text-embedding-3-large, and
    text-embedding-ada-002. The text-embedding-3-* models support configurable
    output dimensions via the ``dimensions`` setting, which can reduce storage
    costs while preserving quality.

    Settings are loaded from PipelineSettings database. Use the management
    command ``migrate_pipeline_settings`` to seed initial values from environment.
    """

    title = "OpenAI Embedder"
    description = "Generates text embeddings using the OpenAI Embeddings API."
    author = "OpenContracts Team"
    dependencies = ["openai"]
    supported_file_types = [
        FileTypeEnum.PDF,
        FileTypeEnum.TXT,
        FileTypeEnum.DOCX,
    ]

    @property
    def vector_size(self) -> int:
        """Derive vector size from effective settings so it reflects runtime config."""
        s = self._effective_settings
        model = s.openai_embedding_model
        # If custom dimensions are set and the model supports them, use those
        if model.startswith("text-embedding-3"):
            return int(s.openai_embedding_dimensions)
        return OPENAI_MODEL_DIMENSIONS.get(model, DEFAULT_OPENAI_EMBEDDING_DIMENSIONS)

    @dataclass
    class Settings:
        """Configuration schema for OpenAIEmbedder."""

        openai_api_key: str = field(
            default="",
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.SECRET,
                    required=True,
                    description="OpenAI API key for the Embeddings API",
                    env_var="OPENAI_API_KEY",
                )
            },
        )
        openai_embedding_model: str = field(
            default=DEFAULT_OPENAI_EMBEDDING_MODEL,
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description=(
                        "OpenAI embedding model name "
                        "(e.g. text-embedding-3-small, text-embedding-3-large, "
                        "text-embedding-ada-002)"
                    ),
                )
            },
        )
        openai_embedding_dimensions: int = field(
            default=DEFAULT_OPENAI_EMBEDDING_DIMENSIONS,
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description=(
                        "Output dimensionality for text-embedding-3-* models. "
                        "Lower values reduce storage at a small quality cost. "
                        "Ignored for text-embedding-ada-002."
                    ),
                )
            },
        )
        openai_api_base_url: str = field(
            default="",
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description=(
                        "Custom base URL for the OpenAI API "
                        "(e.g. for Azure OpenAI or compatible proxies). "
                        "Leave empty to use the default OpenAI endpoint."
                    ),
                    env_var="OPENAI_API_BASE_URL",
                )
            },
        )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        logger.info("OpenAIEmbedder initialized.")

    @property
    def _effective_settings(self) -> "OpenAIEmbedder.Settings":
        return self.settings if self.settings is not None else self.Settings()

    def _build_client(self, **all_kwargs) -> openai.OpenAI:
        """Build an OpenAI client from settings and runtime overrides."""
        s = self._effective_settings

        api_key = all_kwargs.get("openai_api_key", s.openai_api_key)
        base_url = all_kwargs.get("openai_api_base_url", s.openai_api_base_url) or None

        return openai.OpenAI(api_key=api_key, base_url=base_url)

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        """
        Generate embeddings from text using the OpenAI Embeddings API.

        Args:
            text: The text content to embed.
            **all_kwargs: Additional kwargs that can override settings.

        Returns:
            Embedding as a list of floats, or None if an error occurs.
        """
        if not text or not text.strip():
            logger.warning("OpenAIEmbedder received empty text, returning None")
            return None

        try:
            s = self._effective_settings
            model = all_kwargs.get("openai_embedding_model", s.openai_embedding_model)
            dimensions = int(
                all_kwargs.get(
                    "openai_embedding_dimensions", s.openai_embedding_dimensions
                )
            )

            # OpenAI embeddings API caps input at 8192 tokens; a 400 "maximum
            # context length" is fatal to ingestion pipelines that produce
            # long chunks (e.g. whole-document summaries, un-capped paragraph
            # chunks of legalese). Local embedders like
            # ``sentence-transformers`` silently truncate via the tokenizer,
            # so users expect the same robustness here. Truncate on the char
            # side at ~4x the token budget (English averages ~4 chars/token)
            # to stay well under 8192 tokens for any realistic input.
            max_chars = 30000
            if len(text) > max_chars:
                logger.warning(
                    "OpenAIEmbedder truncating input from %d to %d chars to fit "
                    "the 8192-token context window",
                    len(text),
                    max_chars,
                )
                text = text[:max_chars]

            client = self._build_client(**all_kwargs)

            # text-embedding-ada-002 does not support the dimensions parameter
            create_kwargs: dict = {
                "input": text,
                "model": model,
            }
            if model.startswith("text-embedding-3"):
                create_kwargs["dimensions"] = dimensions

            response = client.embeddings.create(**create_kwargs)
            embedding = response.data[0].embedding

            if len(embedding) != self.vector_size:
                logger.debug(
                    f"OpenAI returned {len(embedding)}-dim vector "
                    f"(expected {self.vector_size})"
                )

            return list(embedding)

        except openai.AuthenticationError:
            logger.error("OpenAI API authentication failed. Check your API key.")
            return None
        except openai.RateLimitError:
            logger.error("OpenAI API rate limit exceeded.")
            return None
        except openai.BadRequestError as e:
            logger.error(f"OpenAI API bad request: {e}")
            return None
        except Exception as e:
            logger.error(
                f"OpenAIEmbedder - failed to generate embeddings due to error: {e}"
            )
            return None

    # ------------------------------------------------------------------ #
    # Native batch path
    # ------------------------------------------------------------------ #
    #
    # OpenAI's /v1/embeddings endpoint accepts ``input`` as a list of strings
    # and returns one embedding per input in a single HTTP call. The base
    # class's default ``embed_texts_batch`` falls back to per-text serial
    # ``embed_text`` calls (one round-trip per text), which on an ingest with
    # ~10K paragraph annotations turns into ~10K serial network round-trips
    # at ~400ms each. Overriding here turns that into ⌈N/batch_size⌉ calls
    # — measured 50-100× speedup on benchmark ingest. Caller is expected to
    # sub-batch via ``EMBEDDING_API_BATCH_SIZE``; we cap the per-call list
    # at OPENAI_EMBEDDING_API_MAX_BATCH (2048 per OpenAI's published limits)
    # as a defensive backstop.

    def embed_texts_batch(  # type: ignore[override]
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[Optional[list[float]]]]:
        """Embed a list of texts in a single OpenAI API call.

        Returns one embedding per input text in input order. Empty/whitespace
        inputs are returned as ``None`` in the corresponding slot — the API
        rejects empty strings, so we filter them out of the wire request and
        re-thread the gaps on the way back.

        Errors:
            * AuthenticationError, RateLimitError, BadRequestError → returns
              ``None`` for the entire batch (matches the per-text method's
              behaviour so the celery task layer can decide whether to retry).
            * Vector-count mismatch from the API → ``None`` for the entire
              batch with a loud log; never silently realigns.
        """
        if not texts:
            return []

        # Map original positions to the texts that survive the empty filter
        kept: list[tuple[int, str]] = []
        max_chars = 30000  # mirror _embed_text_impl's 8192-token guard
        for i, raw in enumerate(texts):
            if not raw or not raw.strip():
                continue
            kept.append((i, raw[:max_chars]))

        # Output skeleton — slots for filtered-out texts stay None forever.
        out: list[Optional[list[float]]] = [None] * len(texts)

        if not kept:
            return out

        s = self._effective_settings
        all_kwargs = {**self.get_component_settings(), **direct_kwargs}
        model = all_kwargs.get("openai_embedding_model", s.openai_embedding_model)
        dimensions = int(
            all_kwargs.get(
                "openai_embedding_dimensions", s.openai_embedding_dimensions
            )
        )

        try:
            client = self._build_client(**all_kwargs)
            create_kwargs: dict = {
                "input": [text for _, text in kept],
                "model": model,
            }
            if model.startswith("text-embedding-3"):
                create_kwargs["dimensions"] = dimensions

            response = client.embeddings.create(**create_kwargs)
            data = list(response.data)
            if len(data) != len(kept):
                logger.error(
                    "OpenAI batch returned %d embeddings for %d inputs; "
                    "failing whole batch to avoid silent realignment",
                    len(data),
                    len(kept),
                )
                return None

            # OpenAI guarantees data[i] corresponds to input[i] but defensively
            # honour the .index field if present (ordering is in spec).
            for (orig_idx, _), datum in zip(kept, data):
                out[orig_idx] = list(datum.embedding)
            return out
        except openai.AuthenticationError:
            logger.error("OpenAI API authentication failed (batch). Check your API key.")
            return None
        except openai.RateLimitError:
            logger.error("OpenAI API rate limit exceeded (batch).")
            return None
        except openai.BadRequestError as e:
            logger.error("OpenAI API bad request (batch): %s", e)
            return None
        except Exception as e:
            logger.error("OpenAIEmbedder batch failed: %s", e)
            return None
