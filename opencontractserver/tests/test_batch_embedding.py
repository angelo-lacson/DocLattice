"""
Tests for batch embedding functionality.

Tests the batch embedding pipeline: BaseEmbedder.embed_texts_batch(),
_batch_embed_text_annotations(), and calculate_embeddings_for_annotation_batch()
with true batch API calls.
"""

import unittest
from typing import Optional
from unittest.mock import MagicMock, patch

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.tasks.embeddings_task import _batch_embed_text_annotations
from opencontractserver.types.enums import ContentModality


class DummyEmbedder384(BaseEmbedder):
    """Minimal test embedder with 384-dim vectors."""

    title = "Dummy 384"
    description = "Test embedder"
    author = "Test"
    dependencies = []
    vector_size = 384
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        if not text or not text.strip():
            return [0.0] * self.vector_size
        return [0.1] * self.vector_size


class FailingBatchEmbedder(BaseEmbedder):
    """Embedder whose batch method raises an exception."""

    title = "Failing Batch"
    description = "Test embedder that fails on batch"
    author = "Test"
    dependencies = []
    vector_size = 384
    supported_file_types = [FileTypeEnum.PDF]

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        return [0.1] * self.vector_size

    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[Optional[list[float]]]]:
        raise ConnectionError("Service unavailable")


class PartialFailBatchEmbedder(BaseEmbedder):
    """Embedder that returns None for some items in the batch."""

    title = "Partial Fail Batch"
    description = "Returns None for even-indexed texts"
    author = "Test"
    dependencies = []
    vector_size = 384
    supported_file_types = [FileTypeEnum.PDF]

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        return [0.1] * self.vector_size

    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[Optional[list[float]]]]:
        results = []
        for i, text in enumerate(texts):
            if i % 2 == 0:
                results.append(None)  # Simulate failure for even indices
            else:
                results.append([0.1] * self.vector_size)
        return results


class NullBatchEmbedder(BaseEmbedder):
    """Embedder whose batch method returns None (total failure)."""

    title = "Null Batch"
    description = "Returns None from embed_texts_batch"
    author = "Test"
    dependencies = []
    vector_size = 384
    supported_file_types = [FileTypeEnum.PDF]

    def _embed_text_impl(self, text: str, **all_kwargs) -> Optional[list[float]]:
        return [0.1] * self.vector_size

    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[Optional[list[float]]]]:
        return None


class TestBaseEmbedderBatchFallback(unittest.TestCase):
    """Test that BaseEmbedder.embed_texts_batch falls back to sequential calls."""

    def test_sequential_fallback(self):
        """Default embed_texts_batch calls embed_text per item."""
        embedder = DummyEmbedder384()
        texts = ["Hello", "World", "Test"]
        results = embedder.embed_texts_batch(texts)

        self.assertIsNotNone(results)
        self.assertEqual(len(results), 3)
        for vec in results:
            self.assertIsNotNone(vec)
            self.assertEqual(len(vec), 384)

    def test_empty_list(self):
        """Empty text list returns empty results."""
        embedder = DummyEmbedder384()
        results = embedder.embed_texts_batch([])
        self.assertIsNotNone(results)
        self.assertEqual(len(results), 0)

    def test_handles_individual_failures(self):
        """If one embed_text call fails, others still proceed."""
        embedder = DummyEmbedder384()

        # Patch embed_text to fail on second call
        original = embedder.embed_text
        call_count = [0]

        def flaky_embed(text, **kwargs):
            call_count[0] += 1
            if call_count[0] == 2:
                raise ValueError("Transient error")
            return original(text, **kwargs)

        embedder.embed_text = flaky_embed
        results = embedder.embed_texts_batch(["a", "b", "c"])

        self.assertEqual(len(results), 3)
        self.assertIsNotNone(results[0])
        self.assertIsNone(results[1])  # Failed
        self.assertIsNotNone(results[2])


def _make_mock_annotation(annot_id, raw_text, content_modalities=None):
    """Create a mock annotation object."""
    annot = MagicMock()
    annot.id = annot_id
    annot.pk = annot_id
    annot.raw_text = raw_text
    annot.content_modalities = content_modalities or [ContentModality.TEXT.value]
    annot.add_embedding = MagicMock(return_value=MagicMock())
    return annot


class TestBatchEmbedTextAnnotations(unittest.TestCase):
    """Test _batch_embed_text_annotations helper function."""

    def _make_result(self):
        return {"succeeded": 0, "failed": 0, "skipped": 0, "errors": []}

    def test_basic_batch(self):
        """All annotations embedded successfully."""
        annots = [
            _make_mock_annotation(1, "Hello world"),
            _make_mock_annotation(2, "Second text"),
            _make_mock_annotation(3, "Third text"),
        ]
        embedder = DummyEmbedder384()
        result = self._make_result()

        _batch_embed_text_annotations(
            annots, embedder, "test.DummyEmbedder384", 50, result
        )

        self.assertEqual(result["succeeded"], 3)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["skipped"], 0)

    def test_empty_text_skipped(self):
        """Annotations with empty/whitespace text are skipped."""
        annots = [
            _make_mock_annotation(1, "Hello"),
            _make_mock_annotation(2, ""),
            _make_mock_annotation(3, "   "),
        ]
        embedder = DummyEmbedder384()
        result = self._make_result()

        _batch_embed_text_annotations(
            annots, embedder, "test.DummyEmbedder384", 50, result
        )

        self.assertEqual(result["succeeded"], 1)
        self.assertEqual(result["skipped"], 2)

    def test_sub_batching(self):
        """Large annotation lists are split into sub-batches."""
        annots = [_make_mock_annotation(i, f"Text {i}") for i in range(10)]
        embedder = DummyEmbedder384()
        result = self._make_result()

        # Use api_batch_size=3 to force multiple sub-batches
        with patch.object(
            embedder, "embed_texts_batch", wraps=embedder.embed_texts_batch
        ) as mock_batch:
            _batch_embed_text_annotations(
                annots, embedder, "test.DummyEmbedder384", 3, result
            )
            # 10 annotations / 3 per batch = 4 calls (3+3+3+1)
            self.assertEqual(mock_batch.call_count, 4)

        self.assertEqual(result["succeeded"], 10)

    def test_batch_api_failure(self):
        """When embed_texts_batch raises, all annotations in that chunk fail."""
        annots = [_make_mock_annotation(i, f"Text {i}") for i in range(3)]
        embedder = FailingBatchEmbedder()
        result = self._make_result()

        _batch_embed_text_annotations(annots, embedder, "test.FailingBatch", 50, result)

        self.assertEqual(result["failed"], 3)
        self.assertEqual(result["succeeded"], 0)

    def test_batch_returns_none(self):
        """When embed_texts_batch returns None, all annotations in chunk fail."""
        annots = [_make_mock_annotation(i, f"Text {i}") for i in range(3)]
        embedder = NullBatchEmbedder()
        result = self._make_result()

        _batch_embed_text_annotations(annots, embedder, "test.NullBatch", 50, result)

        self.assertEqual(result["failed"], 3)

    def test_partial_vector_failures(self):
        """Individual None vectors in batch result are handled per-annotation."""
        annots = [_make_mock_annotation(i, f"Text {i}") for i in range(4)]
        embedder = PartialFailBatchEmbedder()
        result = self._make_result()

        _batch_embed_text_annotations(annots, embedder, "test.PartialFail", 50, result)

        # Even indices (0, 2) return None -> failed; odd (1, 3) succeed
        self.assertEqual(result["succeeded"], 2)
        self.assertEqual(result["failed"], 2)

    def test_add_embedding_failure(self):
        """When add_embedding raises, the annotation is marked as failed."""
        annot = _make_mock_annotation(1, "Some text")
        annot.add_embedding.side_effect = Exception("DB error")

        embedder = DummyEmbedder384()
        result = self._make_result()

        _batch_embed_text_annotations(
            [annot], embedder, "test.DummyEmbedder384", 50, result
        )

        self.assertEqual(result["failed"], 1)
        self.assertEqual(len(result["errors"]), 1)
        self.assertIn("store failed", result["errors"][0])
