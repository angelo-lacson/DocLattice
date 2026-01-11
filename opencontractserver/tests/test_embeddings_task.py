import unittest
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model

from opencontractserver.pipeline.base.embedder import BaseEmbedder
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.utils.embeddings import get_embedder

User = get_user_model()


class TestEmbedder(BaseEmbedder):
    """
    A test embedder for unit testing.
    """

    title = "Test Embedder"
    description = "A test embedder for unit testing."
    author = "Test Author"
    dependencies = []
    vector_size = 128
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder384(BaseEmbedder):
    """
    A test embedder with 384-dimensional vectors.
    """

    title = "Test Embedder 384"
    description = "A test embedder with 384-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 384
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder768(BaseEmbedder):
    """
    A test embedder with 768-dimensional vectors.
    """

    title = "Test Embedder 768"
    description = "A test embedder with 768-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 768
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder1536(BaseEmbedder):
    """
    A test embedder with 1536-dimensional vectors.
    """

    title = "Test Embedder 1536"
    description = "A test embedder with 1536-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 1536
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbedder3072(BaseEmbedder):
    """
    A test embedder with 3072-dimensional vectors.
    """

    title = "Test Embedder 3072"
    description = "A test embedder with 3072-dimensional vectors."
    author = "Test Author"
    dependencies = []
    vector_size = 3072
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.TXT]

    def embed_text(self, text: str, **kwargs) -> list[float]:
        # Return a dummy embedding vector
        return [0.0] * self.vector_size


class TestEmbeddingsTask(unittest.TestCase):
    """
    Tests for the embeddings task functions.
    """

    @patch("opencontractserver.corpuses.models.Corpus")
    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    @patch("opencontractserver.pipeline.utils.find_embedder_for_filetype")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embedder_for_corpus_with_preferred_embedder(
        self,
        mock_get_default,
        mock_find_embedder,
        mock_get_component,
        mock_corpus_model,
    ):
        """
        Test get_embedder when the corpus has a preferred embedder.
        """
        # Set up the mock corpus object with a preferred embedder
        mock_corpus = MagicMock()
        mock_corpus.preferred_embedder = "path.to.TestEmbedder"
        mock_corpus_model.objects.get.return_value = mock_corpus

        # Mock the component lookup to return our test embedder class
        mock_get_component.return_value = TestEmbedder

        # Call the function
        embedder_class, embedder_path = get_embedder(corpus_id=1)

        # Verify the corpus was looked up by ID
        mock_corpus_model.objects.get.assert_called_with(id=1)

        # Verify the embedder class was loaded by path
        mock_get_component.assert_called_with("path.to.TestEmbedder")

        # Verify the fallback methods were not called
        mock_find_embedder.assert_not_called()
        mock_get_default.assert_not_called()

        # Verify the correct results were returned
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(embedder_path, "path.to.TestEmbedder")

    @patch("opencontractserver.corpuses.models.Corpus")
    @patch("opencontractserver.pipeline.utils.find_embedder_for_filetype")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embedder_for_corpus_with_mimetype(
        self, mock_get_default, mock_find_embedder, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when no preferred embedder but mimetype is provided.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = None
        mock_corpus.objects.get.return_value = mock_corpus_obj

        # Mock the embedder lookup
        mock_find_embedder.return_value = TestEmbedder

        # Call the function
        embedder_class, embedder_path = get_embedder(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_not_called()

    @patch("opencontractserver.corpuses.models.Corpus")
    @patch("opencontractserver.pipeline.utils.get_component_by_name")
    @patch("opencontractserver.pipeline.utils.find_embedder_for_filetype")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embedder_for_corpus_with_error_loading_preferred(
        self, mock_get_default, mock_find_embedder, mock_get_component, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when there's an error loading the preferred embedder.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = "path.to.NonExistentEmbedder"
        mock_corpus.objects.get.return_value = mock_corpus_obj

        # Mock the component lookup to raise an exception
        mock_get_component.side_effect = Exception("Component not found")

        # Mock the embedder lookup
        mock_find_embedder.return_value = TestEmbedder

        # Call the function
        embedder_class, embedder_path = get_embedder(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_get_component.assert_called_with("path.to.NonExistentEmbedder")
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_not_called()

    @patch("opencontractserver.corpuses.models.Corpus")
    @patch("opencontractserver.pipeline.utils.find_embedder_for_filetype")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embedder_for_corpus_with_corpus_not_found(
        self, mock_get_default, mock_find_embedder, mock_corpus
    ):
        """
        Test get_embedder_for_corpus when the corpus is not found.
        """
        # Set up mocks
        mock_corpus.objects.get.side_effect = Exception("Corpus not found")

        # Mock the embedder lookup
        mock_find_embedder.return_value = TestEmbedder

        # Call the function
        embedder_class, embedder_path = get_embedder(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_not_called()

    @patch("opencontractserver.corpuses.models.Corpus")
    @patch("opencontractserver.pipeline.utils.find_embedder_for_filetype")
    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_get_embedder_for_corpus_fallback_to_default(
        self, mock_get_default, mock_find_embedder, mock_corpus
    ):
        """
        Test get_embedder_for_corpus fallback to default embedder.
        """
        # Set up mocks
        mock_corpus_obj = MagicMock()
        mock_corpus_obj.preferred_embedder = None
        mock_corpus.objects.get.return_value = mock_corpus_obj

        # Mock the embedder lookup to return None
        mock_find_embedder.return_value = None

        # Mock the default embedder
        mock_get_default.return_value = TestEmbedder

        # Call the function
        embedder_class, embedder_path = get_embedder(
            corpus_id=1, mimetype_or_enum="application/pdf"
        )

        # Verify the results
        self.assertEqual(embedder_class, TestEmbedder)
        self.assertEqual(
            embedder_path, f"{TestEmbedder.__module__}.{TestEmbedder.__name__}"
        )
        mock_corpus.objects.get.assert_called_with(id=1)
        mock_find_embedder.assert_called_with("application/pdf")
        mock_get_default.assert_called_once()


class TestAnnotationSignals(unittest.TestCase):
    """
    Tests for the annotation signal handlers that process embeddings for structural annotations
    when they're created or when documents are added to corpuses.
    """

    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text.delay"
    )
    @patch("opencontractserver.annotations.signals.transaction")
    @patch("opencontractserver.annotations.signals.apps.get_model")
    def test_process_structural_annotation_for_corpuses(
        self, mock_get_model, mock_transaction, mock_calc_embedding_delay
    ):
        """
        Test that process_structural_annotation_for_corpuses correctly identifies corpuses
        and schedules embedding tasks for annotations.
        """
        from opencontractserver.annotations.signals import (
            process_structural_annotation_for_corpuses,
        )

        # Create mock classes with their objects managers
        mock_corpus_class = MagicMock()
        mock_corpus_objects = MagicMock()
        mock_corpus_class.objects = mock_corpus_objects

        mock_annotation_class = MagicMock()
        mock_annotation_objects = MagicMock()
        mock_annotation_class.objects = mock_annotation_objects

        # Set up mock for apps.get_model to return our mock classes
        def get_model_side_effect(app_label, model_name):
            if app_label == "corpuses" and model_name == "Corpus":
                return mock_corpus_class
            elif app_label == "annotations" and model_name == "Annotation":
                return mock_annotation_class
            return MagicMock()

        mock_get_model.side_effect = get_model_side_effect

        # Create mock annotation
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.document_id = 100
        mock_annot.document = MagicMock()
        mock_annot.structural = True

        # Set up corpus query results - simulate two corpuses
        mock_corpus_objects.filter.return_value.values_list.return_value = [
            (201, "path.to.Embedder1"),  # corpus_id, preferred_embedder
            (202, None),  # corpus with no preferred embedder
        ]

        # Mock the annotation filter to indicate no embeddings exist
        mock_annotation_objects.filter.return_value.exists.return_value = False

        # Mock settings.DEFAULT_EMBEDDER
        with patch("opencontractserver.annotations.signals.settings") as mock_settings:
            mock_settings.DEFAULT_EMBEDDER = "path.to.DefaultEmbedder"

            # Call the function
            process_structural_annotation_for_corpuses(mock_annot)

            # Verify corpus was queried correctly
            mock_corpus_objects.filter.assert_called_with(
                document_paths__document=mock_annot.document
            )

            # Verify annotation embedding check
            self.assertEqual(
                mock_annotation_objects.filter.call_count, 2
            )  # Once per corpus

            # Should have called transaction.on_commit twice (once per corpus)
            self.assertEqual(mock_transaction.on_commit.call_count, 2)

            # Simulate the transaction commit by invoking each lambda and verify that the
            # scheduled task uses the expected embedder path
            for idx, commit_call in enumerate(
                mock_transaction.on_commit.call_args_list
            ):
                lambda_func = commit_call[0][0]
                mock_calc_embedding_delay.reset_mock()
                lambda_func()
                expected_path = (
                    "path.to.Embedder1" if idx == 0 else "path.to.DefaultEmbedder"
                )
                mock_calc_embedding_delay.assert_called_once_with(
                    annotation_id=1, embedder_path=expected_path
                )

    @patch(
        "opencontractserver.annotations.signals.process_structural_annotation_for_corpuses"
    )
    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text"
    )
    def test_process_annot_on_create_structural(
        self, mock_calc_embedding, mock_process_structural
    ):
        """
        Test that process_annot_on_create_atomic correctly processes structural annotations.
        """
        from opencontractserver.annotations.signals import (
            process_annot_on_create_atomic,
        )

        # Create mock annotation that's structural
        mock_annotation = MagicMock()
        mock_annotation.id = 1
        mock_annotation.document_id = 1
        mock_annotation.embedding = None
        mock_annotation.structural = True

        # Call the signal handler
        process_annot_on_create_atomic(
            sender=None, instance=mock_annotation, created=True
        )

        # Verify embedding calculation was scheduled
        mock_calc_embedding.si.assert_called_with(annotation_id=1)
        mock_calc_embedding.si.return_value.apply_async.assert_called_once()

        # Verify process_structural_annotation_for_corpuses was called
        mock_process_structural.assert_called_with(mock_annotation)

    @patch(
        "opencontractserver.annotations.signals.process_structural_annotation_for_corpuses"
    )
    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text"
    )
    def test_process_annot_on_create_non_structural(
        self,
        mock_calc_embedding,
        mock_process_structural,
    ):
        """
        Test that process_annot_on_create_atomic correctly handles non-structural annotations.
        """
        from opencontractserver.annotations.signals import (
            process_annot_on_create_atomic,
        )

        # Create mock annotation that's NOT structural
        mock_annotation = MagicMock()
        mock_annotation.id = 1
        mock_annotation.document_id = 1
        mock_annotation.embedding = None
        mock_annotation.structural = False

        # Call the signal handler
        process_annot_on_create_atomic(
            sender=None, instance=mock_annotation, created=True
        )

        # Verify embedding calculation was scheduled
        mock_calc_embedding.si.assert_called_with(annotation_id=1)
        mock_calc_embedding.si.return_value.apply_async.assert_called_once()

        # Verify process_structural_annotation_for_corpuses was NOT called
        mock_process_structural.assert_not_called()

    @patch(
        "opencontractserver.annotations.signals.process_structural_annotation_for_corpuses"
    )
    @patch(
        "opencontractserver.annotations.signals.calculate_embedding_for_annotation_text"
    )
    def test_process_annot_on_create_existing_embedding(
        self, mock_calc_embedding, mock_process_structural
    ):
        """
        Test that process_annot_on_create_atomic skips annotations with existing embeddings.
        """
        from opencontractserver.annotations.signals import (
            process_annot_on_create_atomic,
        )

        # Create mock annotation with an existing embedding
        mock_annotation = MagicMock()
        mock_annotation.id = 1
        mock_annotation.document_id = 1
        mock_annotation.embedding = [0.1, 0.2, 0.3]  # Non-None embedding
        mock_annotation.structural = True

        # Call the signal handler
        process_annot_on_create_atomic(
            sender=None, instance=mock_annotation, created=True
        )

        # Verify embedding calculation was NOT scheduled
        mock_calc_embedding.si.assert_not_called()

        # Verify process_structural_annotation_for_corpuses was NOT called
        mock_process_structural.assert_not_called()

    @patch("opencontractserver.annotations.signals.calculate_embedding_for_note_text")
    def test_process_note_on_create(self, mock_calc_embedding):
        """
        Test that process_note_on_create_atomic correctly schedules note embedding tasks.
        """
        from opencontractserver.annotations.signals import process_note_on_create_atomic

        # Create mock note
        mock_note = MagicMock()
        mock_note.id = 1
        mock_note.embedding = None

        # Call the signal handler
        process_note_on_create_atomic(sender=None, instance=mock_note, created=True)

        # Verify embedding calculation was scheduled
        mock_calc_embedding.si.assert_called_with(note_id=1)
        mock_calc_embedding.si.return_value.apply_async.assert_called_once()


class TestEmbeddingTask(unittest.TestCase):
    """
    Tests for the embedding task functions that calculate embeddings for annotations.
    """

    @patch("opencontractserver.utils.embeddings.get_embedder")
    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    def test_calculate_embedding_for_annotation_text_with_explicit_embedder(
        self, mock_annotation_model, mock_get_embedder
    ):
        """
        Test that calculate_embedding_for_annotation_text uses an explicitly provided embedder_path.
        """
        from opencontractserver.tasks.embeddings_task import (
            calculate_embedding_for_annotation_text,
        )

        # Create mock annotation with a corpus_id
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.pk = 1
        mock_annot.raw_text = "This is test text"
        mock_annot.corpus_id = 123
        mock_annot.content_modalities = ["TEXT"]  # Text-only annotation
        mock_annotation_model.objects.select_related.return_value.get.return_value = (
            mock_annot
        )

        # Create mock embedder class and instance
        mock_embedder_instance = MagicMock()
        mock_embedder_instance.is_multimodal = False
        mock_embedder_instance.supports_images = False
        test_vector = [0.1, 0.2, 0.3]
        mock_embedder_instance.embed_text.return_value = test_vector

        mock_embedder_class = MagicMock(return_value=mock_embedder_instance)

        # Mock get_embedder to return our mock class
        returned_path = "returned.embedder.path"
        mock_get_embedder.return_value = (mock_embedder_class, returned_path)

        # Define the explicit embedder path we'll provide
        explicit_embedder_path = "path.to.TestEmbedder"

        # Call the function with explicit embedder_path
        calculate_embedding_for_annotation_text(
            annotation_id=1, embedder_path=explicit_embedder_path
        )

        # Verify annotation was retrieved correctly
        mock_annotation_model.objects.select_related.assert_called_with("document")
        mock_annotation_model.objects.select_related.return_value.get.assert_called_with(
            pk=1
        )

        # Verify get_embedder was called with correct parameters
        mock_get_embedder.assert_called_with(
            corpus_id=123, embedder_path=explicit_embedder_path
        )

        # Verify embed_text was called
        mock_embedder_instance.embed_text.assert_called_with("This is test text")

        # The key test: verify that the explicit embedder_path was used
        mock_annot.add_embedding.assert_called_with(explicit_embedder_path, test_vector)

    @patch("opencontractserver.utils.embeddings.get_embedder")
    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    def test_calculate_embedding_for_annotation_text_fallback_to_annotation_corpus(
        self, mock_annotation_model, mock_get_embedder
    ):
        """
        Test that calculate_embedding_for_annotation_text falls back to the annotation's corpus embedder
        when no explicit embedder_path is provided.
        """
        from opencontractserver.tasks.embeddings_task import (
            calculate_embedding_for_annotation_text,
        )

        # Create mock annotation with corpus reference
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.pk = 1
        mock_annot.raw_text = "This is test text"
        mock_annot.corpus_id = 123
        mock_annot.content_modalities = ["TEXT"]  # Text-only annotation
        mock_annotation_model.objects.select_related.return_value.get.return_value = (
            mock_annot
        )

        # Create mock embedder class and instance
        mock_embedder_instance = MagicMock()
        mock_embedder_instance.is_multimodal = False
        mock_embedder_instance.supports_images = False
        test_vector = [0.4, 0.5, 0.6]
        mock_embedder_instance.embed_text.return_value = test_vector

        mock_embedder_class = MagicMock(return_value=mock_embedder_instance)

        # Mock get_embedder to return our mock class with corpus embedder path
        corpus_embedder_path = "corpus.embedder.path"
        mock_get_embedder.return_value = (mock_embedder_class, corpus_embedder_path)

        # Call the function without embedder_path
        calculate_embedding_for_annotation_text(annotation_id=1)

        # Verify annotation was retrieved correctly
        mock_annotation_model.objects.select_related.return_value.get.assert_called_with(
            pk=1
        )

        # Verify get_embedder was called with corpus_id but no embedder_path
        mock_get_embedder.assert_called_with(corpus_id=123, embedder_path=None)

        # Verify embedding was stored with the corpus embedder path
        mock_annot.add_embedding.assert_called_with(corpus_embedder_path, test_vector)

    @patch("opencontractserver.utils.embeddings.get_embedder")
    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    def test_calculate_embedding_for_annotation_text_fallback_to_default(
        self, mock_annotation_model, mock_get_embedder
    ):
        """
        Test that calculate_embedding_for_annotation_text falls back to the default embedder
        when no explicit embedder_path is provided and the annotation has no corpus.
        """
        from opencontractserver.tasks.embeddings_task import (
            calculate_embedding_for_annotation_text,
        )

        # Create mock annotation with no corpus
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.pk = 1
        mock_annot.raw_text = "This is test text"
        mock_annot.corpus_id = None  # No corpus
        mock_annot.content_modalities = ["TEXT"]  # Text-only annotation
        mock_annotation_model.objects.select_related.return_value.get.return_value = (
            mock_annot
        )

        # Create mock embedder class and instance
        mock_embedder_instance = MagicMock()
        mock_embedder_instance.is_multimodal = False
        mock_embedder_instance.supports_images = False
        test_vector = [0.7, 0.8, 0.9]
        mock_embedder_instance.embed_text.return_value = test_vector

        mock_embedder_class = MagicMock(return_value=mock_embedder_instance)

        # Mock get_embedder to return the default embedder path
        default_path = "default.embedder.path"
        mock_get_embedder.return_value = (mock_embedder_class, default_path)

        # Call the function without embedder_path
        calculate_embedding_for_annotation_text(annotation_id=1)

        # Verify annotation was retrieved correctly
        mock_annotation_model.objects.select_related.return_value.get.assert_called_with(
            pk=1
        )

        # Verify get_embedder was called with corpus_id=None
        mock_get_embedder.assert_called_with(corpus_id=None, embedder_path=None)

        # Verify embedding was stored with the default path
        mock_annot.add_embedding.assert_called_with(default_path, test_vector)


class TestMultimodalEmbeddingTask(unittest.TestCase):
    """Tests for multimodal embedding paths in embedding tasks."""

    @patch(
        "opencontractserver.utils.multimodal_embeddings.generate_multimodal_embedding"
    )
    def test_annotation_with_images_uses_multimodal_embedding(
        self, mock_multimodal_embed
    ):
        """Test that annotations with IMAGE modality use multimodal embedding."""
        from opencontractserver.tasks.embeddings_task import (
            _create_embedding_for_annotation,
        )

        # Create mock annotation with IMAGE modality
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "Figure 1 caption"
        mock_annot.content_modalities = ["TEXT", "IMAGE"]

        # Create mock multimodal embedder
        mock_embedder = MagicMock()
        mock_embedder.is_multimodal = True
        mock_embedder.supports_images = True

        test_vector = [0.5] * 768
        mock_multimodal_embed.return_value = test_vector

        result = _create_embedding_for_annotation(
            mock_annot, mock_embedder, "multimodal.embedder.path"
        )

        # Should have called multimodal embedding
        mock_multimodal_embed.assert_called_once_with(mock_annot, mock_embedder)

        # Should have stored embedding
        mock_annot.add_embedding.assert_called_once_with(
            "multimodal.embedder.path", test_vector
        )

        self.assertTrue(result)

    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    def test_annotation_with_images_non_multimodal_embedder_falls_back_to_text(
        self, mock_annotation_model
    ):
        """Test that text-only embedder falls back to text even for IMAGE annotations."""
        from opencontractserver.tasks.embeddings_task import (
            _create_embedding_for_annotation,
        )

        # Create mock annotation with IMAGE modality
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "Figure 1 caption"
        mock_annot.content_modalities = ["TEXT", "IMAGE"]

        # Create mock text-only embedder
        mock_embedder = MagicMock()
        mock_embedder.is_multimodal = False
        mock_embedder.supports_images = False

        test_vector = [0.1] * 768
        mock_embedder.embed_text.return_value = test_vector

        result = _create_embedding_for_annotation(
            mock_annot, mock_embedder, "text.only.embedder"
        )

        # Should have called text embedding (fallback)
        mock_embedder.embed_text.assert_called_once_with("Figure 1 caption")

        # Should have stored embedding
        mock_annot.add_embedding.assert_called_once_with(
            "text.only.embedder", test_vector
        )

        self.assertTrue(result)

    @patch(
        "opencontractserver.utils.multimodal_embeddings.generate_multimodal_embedding"
    )
    def test_annotation_multimodal_failure_falls_back_to_text(
        self, mock_multimodal_embed
    ):
        """Test graceful degradation: multimodal failure falls back to text."""
        from opencontractserver.tasks.embeddings_task import (
            _create_embedding_for_annotation,
        )

        # Create mock annotation with IMAGE modality
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "Figure with error"
        mock_annot.content_modalities = ["TEXT", "IMAGE"]

        # Create mock multimodal embedder
        mock_embedder = MagicMock()
        mock_embedder.is_multimodal = True
        mock_embedder.supports_images = True

        test_vector = [0.2] * 768
        mock_embedder.embed_text.return_value = test_vector

        # Make multimodal embedding fail
        mock_multimodal_embed.side_effect = Exception("Multimodal failed")

        result = _create_embedding_for_annotation(
            mock_annot, mock_embedder, "multimodal.embedder.path"
        )

        # Should have fallen back to text embedding
        mock_embedder.embed_text.assert_called_once_with("Figure with error")

        # Should have stored embedding
        mock_annot.add_embedding.assert_called_once_with(
            "multimodal.embedder.path", test_vector
        )

        self.assertTrue(result)

    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    def test_annotation_text_only_modality_uses_text_embedding(
        self, mock_annotation_model
    ):
        """Test that text-only annotations use text embedding even with multimodal embedder."""
        from opencontractserver.tasks.embeddings_task import (
            _create_embedding_for_annotation,
        )

        # Create mock annotation with TEXT only modality
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "Just plain text"
        mock_annot.content_modalities = ["TEXT"]

        # Create mock multimodal embedder
        mock_embedder = MagicMock()
        mock_embedder.is_multimodal = True
        mock_embedder.supports_images = True

        test_vector = [0.3] * 768
        mock_embedder.embed_text.return_value = test_vector

        result = _create_embedding_for_annotation(
            mock_annot, mock_embedder, "multimodal.embedder.path"
        )

        # Should have called text embedding (no images to embed)
        mock_embedder.embed_text.assert_called_once_with("Just plain text")

        self.assertTrue(result)

    @patch("opencontractserver.tasks.embeddings_task.Annotation")
    def test_annotation_no_modalities_defaults_to_text(self, mock_annotation_model):
        """Test that annotations with no content_modalities default to TEXT."""
        from opencontractserver.tasks.embeddings_task import (
            _create_embedding_for_annotation,
        )

        # Create mock annotation with no modalities
        mock_annot = MagicMock()
        mock_annot.id = 1
        mock_annot.raw_text = "No modalities set"
        mock_annot.content_modalities = None

        mock_embedder = MagicMock()
        mock_embedder.is_multimodal = True
        mock_embedder.supports_images = True

        test_vector = [0.4] * 768
        mock_embedder.embed_text.return_value = test_vector

        result = _create_embedding_for_annotation(
            mock_annot, mock_embedder, "multimodal.embedder.path"
        )

        # Should default to text embedding
        mock_embedder.embed_text.assert_called_once_with("No modalities set")

        self.assertTrue(result)

    def test_create_text_embedding_empty_text(self):
        """Test that empty text returns False and doesn't embed."""
        from opencontractserver.tasks.embeddings_task import _create_text_embedding

        mock_obj = MagicMock()
        mock_embedder = MagicMock()

        result = _create_text_embedding(
            mock_obj, mock_embedder, "embedder.path", "", "test", 1
        )

        self.assertFalse(result)
        mock_embedder.embed_text.assert_not_called()
        mock_obj.add_embedding.assert_not_called()

    def test_create_text_embedding_embed_returns_none(self):
        """Test that embedding failure returns False."""
        from opencontractserver.tasks.embeddings_task import _create_text_embedding

        mock_obj = MagicMock()
        mock_embedder = MagicMock()
        mock_embedder.embed_text.return_value = None

        result = _create_text_embedding(
            mock_obj, mock_embedder, "embedder.path", "test text", "test", 1
        )

        self.assertFalse(result)
        mock_obj.add_embedding.assert_not_called()


if __name__ == "__main__":
    unittest.main()
