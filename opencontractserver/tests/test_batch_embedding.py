"""
Integration tests for batch embedding aggregation.

Tests that _batch_embed_text_annotations() and the refactored
calculate_embeddings_for_annotation_batch task correctly aggregate
annotations and call embed_texts_batch() in sub-batches.
"""

import uuid
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import Annotation, Embedding
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.embedders.test_embedder import TestEmbedder
from opencontractserver.tasks.embeddings_task import (
    _batch_embed_text_annotations,
    calculate_embeddings_for_annotation_batch,
)
from opencontractserver.types.enums import ContentModality

User = get_user_model()

TEST_EMBEDDER_PATH = "opencontractserver.pipeline.embedders.test_embedder.TestEmbedder"


class TestBatchEmbedTextAnnotationsHelper(TestCase):
    """Tests for the _batch_embed_text_annotations helper function."""

    def setUp(self):
        self.user = User.objects.create_user(
            username=f"batchtest_{uuid.uuid4().hex[:8]}",
            email=f"batch_{uuid.uuid4().hex[:8]}@example.com",
            password="testpass123",
        )
        self.document = Document.objects.create(
            title="Batch Test Document",
            creator=self.user,
            backend_lock=False,
        )
        self.embedder = TestEmbedder()

    def _make_annotation(self, text="Some test text"):
        return Annotation.objects.create(
            raw_text=text,
            document=self.document,
            creator=self.user,
        )

    def _make_result(self):
        return {
            "total": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
        }

    def test_batch_embed_text_annotations_happy_path(self):
        """All annotations with text get Embedding records."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(5)]
        result = self._make_result()

        _batch_embed_text_annotations(
            annotations, self.embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 5)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["skipped"], 0)

        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path=TEST_EMBEDDER_PATH
                ).exists(),
                f"Annotation {ann.id} should have an embedding",
            )

    def test_batch_embed_skips_empty_text(self):
        """Empty-text annotations are skipped, non-empty ones are embedded."""
        ann_with_text = self._make_annotation("Has text")
        ann_empty = self._make_annotation("")
        ann_whitespace = self._make_annotation("   ")
        result = self._make_result()

        _batch_embed_text_annotations(
            [ann_with_text, ann_empty, ann_whitespace],
            self.embedder,
            TEST_EMBEDDER_PATH,
            50,
            result,
        )

        self.assertEqual(result["succeeded"], 1)
        self.assertEqual(result["skipped"], 2)
        self.assertTrue(
            Embedding.objects.filter(
                annotation=ann_with_text, embedder_path=TEST_EMBEDDER_PATH
            ).exists()
        )
        self.assertFalse(
            Embedding.objects.filter(
                annotation=ann_empty, embedder_path=TEST_EMBEDDER_PATH
            ).exists()
        )

    def test_batch_embed_sub_batching(self):
        """Small api_batch_size forces multiple sub-batches; all still succeed."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(5)]
        result = self._make_result()

        # api_batch_size=2 means 3 sub-batches: [2, 2, 1]
        _batch_embed_text_annotations(
            annotations, self.embedder, TEST_EMBEDDER_PATH, 2, result
        )

        self.assertEqual(result["succeeded"], 5)
        self.assertEqual(result["failed"], 0)
        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path=TEST_EMBEDDER_PATH
                ).exists()
            )

    def test_batch_embed_partial_failure(self):
        """When embed_texts_batch returns [valid, None, valid], 2 succeed, 1 fails."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(3)]
        result = self._make_result()

        valid_vector = [0.1] * 384
        mock_embedder = MagicMock()
        mock_embedder.embed_texts_batch.return_value = [
            valid_vector,
            None,
            valid_vector,
        ]

        _batch_embed_text_annotations(
            annotations, mock_embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertTrue(
            any("individual vector was None" in e for e in result["errors"])
        )

    def test_batch_embed_entire_chunk_failure(self):
        """When embed_texts_batch returns None, all annotations in chunk fail."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(3)]
        result = self._make_result()

        mock_embedder = MagicMock()
        mock_embedder.embed_texts_batch.return_value = None

        _batch_embed_text_annotations(
            annotations, mock_embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 0)
        self.assertEqual(result["failed"], 3)
        self.assertTrue(all("batch returned None" in e for e in result["errors"]))

    def test_batch_embed_exception_in_batch_call(self):
        """When embed_texts_batch raises, all annotations in chunk fail."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(3)]
        result = self._make_result()

        mock_embedder = MagicMock()
        mock_embedder.embed_texts_batch.side_effect = ConnectionError(
            "Service unavailable"
        )

        _batch_embed_text_annotations(
            annotations, mock_embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 0)
        self.assertEqual(result["failed"], 3)
        self.assertTrue(all("batch call failed" in e for e in result["errors"]))


class TestBatchTaskIntegration(TestCase):
    """Integration tests for calculate_embeddings_for_annotation_batch with batch path."""

    def setUp(self):
        self.user = User.objects.create_user(
            username=f"tasktest_{uuid.uuid4().hex[:8]}",
            email=f"task_{uuid.uuid4().hex[:8]}@example.com",
            password="testpass123",
        )
        self.document = Document.objects.create(
            title="Task Test Document",
            creator=self.user,
            backend_lock=False,
        )

    def _make_annotation(self, text="Some test text", modalities=None):
        kwargs = {
            "raw_text": text,
            "document": self.document,
            "creator": self.user,
        }
        if modalities is not None:
            kwargs["content_modalities"] = modalities
        return Annotation.objects.create(**kwargs)

    def test_batch_task_uses_batch_path(self):
        """Task with embedder_path creates embeddings via batch path."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(4)]
        annotation_ids = [a.pk for a in annotations]

        result = calculate_embeddings_for_annotation_batch(
            annotation_ids=annotation_ids,
            embedder_path=TEST_EMBEDDER_PATH,
        )

        self.assertEqual(result["succeeded"], 4)
        self.assertEqual(result["failed"], 0)
        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path=TEST_EMBEDDER_PATH
                ).exists()
            )

    @patch("opencontractserver.tasks.embeddings_task._apply_dual_embedding_strategy")
    def test_batch_task_without_embedder_path_uses_dual_strategy(self, mock_dual):
        """Task without embedder_path uses dual embedding (regression guard)."""
        ann = self._make_annotation("Test text")

        result = calculate_embeddings_for_annotation_batch(
            annotation_ids=[ann.pk],
            corpus_id=123,
        )

        self.assertEqual(result["succeeded"], 1)
        mock_dual.assert_called_once()

    def test_batch_task_partitions_multimodal(self):
        """Task sends IMAGE annotations to individual path when embedder is multimodal."""
        text_ann = self._make_annotation("Text only")
        image_ann = self._make_annotation(
            "Has image",
            modalities=[ContentModality.TEXT.value, ContentModality.IMAGE.value],
        )

        multimodal_path = (
            "opencontractserver.pipeline.embedders.test_embedder.TestMultimodalEmbedder"
        )

        with patch(
            "opencontractserver.tasks.embeddings_task._create_embedding_for_annotation"
        ) as mock_individual:
            mock_individual.return_value = True

            with patch(
                "opencontractserver.tasks.embeddings_task._batch_embed_text_annotations"
            ) as mock_batch:
                calculate_embeddings_for_annotation_batch(
                    annotation_ids=[text_ann.pk, image_ann.pk],
                    embedder_path=multimodal_path,
                )

                # text_ann should go to batch helper
                mock_batch.assert_called_once()
                batch_annotations = mock_batch.call_args[0][0]
                self.assertEqual(len(batch_annotations), 1)
                self.assertEqual(batch_annotations[0].pk, text_ann.pk)

                # image_ann should go to individual path
                mock_individual.assert_called_once()
                individual_ann = mock_individual.call_args[0][0]
                self.assertEqual(individual_ann.pk, image_ann.pk)


class TestBaseEmbedderSequentialFallback(TestCase):
    """Test that BaseEmbedder.embed_texts_batch() sequential fallback works."""

    def test_base_embedder_sequential_fallback(self):
        """BaseEmbedder subclass without embed_texts_batch override works through batch path."""
        user = User.objects.create_user(
            username=f"fallback_{uuid.uuid4().hex[:8]}",
            email=f"fallback_{uuid.uuid4().hex[:8]}@example.com",
            password="testpass123",
        )
        document = Document.objects.create(
            title="Fallback Test",
            creator=user,
            backend_lock=False,
        )

        annotations = [
            Annotation.objects.create(
                raw_text=f"Text {i}",
                document=document,
                creator=user,
            )
            for i in range(3)
        ]

        # TestEmbedder overrides embed_texts_batch, so we need a minimal
        # subclass that does NOT override it, using the BaseEmbedder default.
        from opencontractserver.pipeline.base.embedder import BaseEmbedder

        class FallbackEmbedder(BaseEmbedder):
            vector_size = 384
            supported_modalities = {ContentModality.TEXT}

            def _embed_text_impl(self, text, **kwargs):
                # Simple deterministic vector
                return [0.5] * self.vector_size

        embedder = FallbackEmbedder()
        result = {
            "total": 3,
            "succeeded": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
        }

        _batch_embed_text_annotations(
            annotations,
            embedder,
            "test.fallback.embedder",
            2,  # small batch to test chunking
            result,
        )

        self.assertEqual(result["succeeded"], 3)
        self.assertEqual(result["failed"], 0)
        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path="test.fallback.embedder"
                ).exists()
            )

    def test_base_embedder_fallback_handles_per_text_exception(self):
        """Sequential fallback catches per-text exceptions, returns None for that slot."""
        from opencontractserver.pipeline.base.embedder import BaseEmbedder

        call_count = 0

        class FlakeyEmbedder(BaseEmbedder):
            vector_size = 384
            supported_modalities = {ContentModality.TEXT}

            def _embed_text_impl(self, text, **kwargs):
                nonlocal call_count
                call_count += 1
                if call_count == 2:
                    raise ValueError("Simulated failure on second text")
                return [0.5] * self.vector_size

        embedder = FlakeyEmbedder()
        results = embedder.embed_texts_batch(["a", "b", "c"])

        self.assertIsNotNone(results)
        self.assertEqual(len(results), 3)
        self.assertIsNotNone(results[0])
        self.assertIsNone(results[1])  # The one that raised
        self.assertIsNotNone(results[2])
