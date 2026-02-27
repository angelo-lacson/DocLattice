#  Copyright (C) 2022  John Scrudato
import logging
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document, DocumentProcessingStatus
from opencontractserver.tasks.doc_tasks import (
    _create_document_processed_notifications,
    _create_document_processing_failed_notification,
    _mark_document_failed,
    burn_doc_annotations,
    convert_doc_to_funsd,
    extract_thumbnail,
    retry_document_processing,
    set_doc_lock_state,
)
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
)
from opencontractserver.types.enums import LabelType

User = get_user_model()

logger = logging.getLogger(__name__)


class DocParserTestCase(TestCase):
    """
    Test case for document parsing tasks excluding thumbnail-related tests.
    """

    def setUp(self) -> None:
        """
        Set up the test user, documents, and corpus.
        """
        # Setup a test user
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_ONE_PATH.open("rb").read(), name="test.pdf"
        )
        pawls_file = ContentFile(
            SAMPLE_PAWLS_FILE_ONE_PATH.open("rb").read(), name="test.pawls"
        )

        with transaction.atomic():
            self.doc = Document.objects.create(
                creator=self.user,
                title="Test Doc",
                description="USC Title 1 - Chapter 1",
                custom_meta={},
                pdf_file=pdf_file,
                pawls_parse_file=pawls_file,
                backend_lock=True,
            )
            self.corpus = Corpus(
                title="Test", description="Some important stuff!", creator=self.user
            )
            self.corpus.save()

    def test_set_doc_lock_state(self) -> None:
        """
        Test setting the document lock state.
        """
        set_doc_lock_state.apply(kwargs={"locked": True, "doc_id": self.doc.id}).get()

        self.doc.refresh_from_db()
        self.assertTrue(self.doc.backend_lock)

    def test_burn_doc_annotations(self) -> None:
        """
        Test burning annotations into the document.
        """
        label_lookups = {
            "text_labels": {},
            "doc_labels": {
                "test": {
                    "id": "1234",
                    "color": "red",
                    "description": "stuff happening",
                    "icon": "tag",
                    "text": "test",
                    "label_type": LabelType.DOC_TYPE_LABEL,
                }
            },
        }
        result = burn_doc_annotations.apply(
            args=(label_lookups, self.doc.id, self.corpus.id)
        ).get()
        self.assertEqual(len(result), 5)

    def test_convert_doc_to_funsd(self) -> None:
        """
        Test converting a document to the FUNSD format.
        """
        AnnotationLabel.objects.create(
            text="TestLabel", creator=self.user, label_type="TOKEN_LABEL"
        )
        Annotation.objects.create(
            raw_text="Test annotation",
            annotation_label=AnnotationLabel.objects.first(),
            document=self.doc,
            corpus_id=self.corpus.id,
            creator=self.user,
            json={
                "0": {
                    "tokensJsons": [],
                    "rawText": "Test",
                    "bounds": {"x": 0, "y": 0, "width": 10, "height": 10},
                }
            },
        )

        result = convert_doc_to_funsd.apply(args=(self.user.id, self.doc.id, 1)).get()

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0], self.doc.id)
        self.assertIsInstance(result[1], dict)
        self.assertIsInstance(result[2], list)


class MarkDocumentFailedTestCase(TestCase):
    """Tests for _mark_document_failed and related notification functions."""

    def setUp(self):
        self.user = User.objects.create_user(username="failtest", password="12345678")
        self.doc = Document.objects.create(
            creator=self.user,
            title="Test Fail Doc",
            backend_lock=True,
            processing_status=DocumentProcessingStatus.PROCESSING,
        )

    def test_mark_document_failed_sets_status(self):
        """Test that _mark_document_failed sets the correct status and error."""
        _mark_document_failed(
            self.doc, "Test error message", "Traceback here", create_notification=False
        )
        self.doc.refresh_from_db()

        self.assertEqual(self.doc.processing_status, DocumentProcessingStatus.FAILED)
        self.assertEqual(self.doc.processing_error, "Test error message")
        self.assertEqual(self.doc.processing_error_traceback, "Traceback here")
        self.assertIsNotNone(self.doc.processing_finished)

    def test_mark_document_failed_truncates_long_error(self):
        """Test that long error messages are truncated."""
        from opencontractserver.constants import MAX_PROCESSING_ERROR_LENGTH

        long_error = "X" * (MAX_PROCESSING_ERROR_LENGTH + 100)
        _mark_document_failed(self.doc, long_error, "", create_notification=False)
        self.doc.refresh_from_db()

        self.assertEqual(len(self.doc.processing_error), MAX_PROCESSING_ERROR_LENGTH)

    @patch("opencontractserver.tasks.doc_tasks.Notification.objects.create")
    def test_create_failed_notification_exception_handling(self, mock_create):
        """Test that notification creation errors are logged but don't raise."""
        mock_create.side_effect = Exception("DB error")

        # Should not raise - just log the error
        _create_document_processing_failed_notification(self.doc, "Test error")
        mock_create.assert_called_once()

    def test_create_failed_notification_no_creator(self):
        """Test that no notification is created when document has no creator."""
        # Create a mock document with no creator
        mock_doc = MagicMock()
        mock_doc.creator = None

        # Should return early without creating notification
        with patch(
            "opencontractserver.tasks.doc_tasks.Notification.objects.create"
        ) as mock_create:
            _create_document_processing_failed_notification(mock_doc, "Test error")
            mock_create.assert_not_called()

    def test_create_failed_notification_uses_description_fallback(self):
        """Test that description is used as title fallback."""
        # Create a mock document with empty title but with description (longer than 50 chars)
        mock_doc = MagicMock()
        mock_doc.creator = self.user
        mock_doc.title = ""
        # Description longer than 50 chars to test truncation
        mock_doc.description = (
            "A very long description that exceeds the fifty character limit easily"
        )
        mock_doc.id = self.doc.id
        mock_doc.file_type = "application/pdf"

        with patch(
            "opencontractserver.tasks.doc_tasks.Notification.objects.create"
        ) as mock_create:
            mock_create.return_value = MagicMock()
            with patch(
                "opencontractserver.tasks.doc_tasks.broadcast_notification_via_websocket"
            ):
                _create_document_processing_failed_notification(mock_doc, "Test error")

            call_kwargs = mock_create.call_args.kwargs
            # Should use first 50 chars of description
            self.assertEqual(
                call_kwargs["data"]["document_title"],
                "A very long description that exceeds the fifty cha",
            )

    def test_create_failed_notification_uses_untitled_fallback(self):
        """Test that 'Untitled' is used when no title or description."""
        # Create a mock document with no title or description
        mock_doc = MagicMock()
        mock_doc.creator = self.user
        mock_doc.title = ""
        mock_doc.description = ""
        mock_doc.id = self.doc.id
        mock_doc.file_type = "application/pdf"

        with patch(
            "opencontractserver.tasks.doc_tasks.Notification.objects.create"
        ) as mock_create:
            mock_create.return_value = MagicMock()
            with patch(
                "opencontractserver.tasks.doc_tasks.broadcast_notification_via_websocket"
            ):
                _create_document_processing_failed_notification(mock_doc, "Test error")

            call_kwargs = mock_create.call_args.kwargs
            self.assertEqual(call_kwargs["data"]["document_title"], "Untitled")


class CreateDocumentProcessedNotificationsTestCase(TestCase):
    """Tests for _create_document_processed_notifications."""

    def setUp(self):
        self.user = User.objects.create_user(username="notiftest", password="12345678")
        self.corpus_owner = User.objects.create_user(
            username="corpusowner", password="12345678"
        )
        self.doc = Document.objects.create(
            creator=self.user,
            title="Processed Doc",
            backend_lock=False,
            processing_status=DocumentProcessingStatus.COMPLETED,
        )

    @patch("opencontractserver.tasks.doc_tasks.Notification.objects.create")
    @patch("opencontractserver.tasks.doc_tasks.broadcast_notification_via_websocket")
    def test_creates_notifications_for_creator_and_corpus_owners(
        self, mock_broadcast, mock_create
    ):
        """Test notifications are created for both doc creator and corpus owners."""
        mock_create.return_value = MagicMock()

        corpus_data = [
            {"corpus_id": 1, "corpus__creator_id": self.corpus_owner.id},
        ]

        _create_document_processed_notifications(self.doc, corpus_data)

        # Should create notifications for both users
        self.assertEqual(mock_create.call_count, 2)

    @patch("opencontractserver.tasks.doc_tasks.Notification.objects.create")
    def test_handles_notification_creation_error(self, mock_create):
        """Test that notification creation errors don't propagate."""
        mock_create.side_effect = Exception("DB error")

        # Should not raise
        _create_document_processed_notifications(self.doc, [])

    def test_no_creator_still_notifies_corpus_owners(self):
        """Test that corpus owners get notified even if doc has no creator."""
        corpus_data = [
            {"corpus_id": 1, "corpus__creator_id": self.corpus_owner.id},
        ]

        # Create a mock document with no creator
        mock_doc = MagicMock()
        mock_doc.creator = None
        mock_doc.title = "Test Doc"
        mock_doc.description = ""
        mock_doc.id = self.doc.id
        mock_doc.file_type = "application/pdf"

        with patch(
            "opencontractserver.tasks.doc_tasks.Notification.objects.create"
        ) as mock_create:
            mock_create.return_value = MagicMock()
            with patch(
                "opencontractserver.tasks.doc_tasks.broadcast_notification_via_websocket"
            ):
                _create_document_processed_notifications(mock_doc, corpus_data)

            # Should only notify corpus owner
            self.assertEqual(mock_create.call_count, 1)


class SetDocLockStateTestCase(TestCase):
    """Tests for set_doc_lock_state edge cases."""

    def setUp(self):
        self.user = User.objects.create_user(username="locktest", password="12345678")
        self.doc = Document.objects.create(
            creator=self.user,
            title="Lock Test Doc",
            backend_lock=True,
            processing_status=DocumentProcessingStatus.PROCESSING,
        )

    def test_unlock_failed_document_keeps_locked(self):
        """Test that unlocking a FAILED document keeps it locked."""
        self.doc.processing_status = DocumentProcessingStatus.FAILED
        self.doc.save()

        set_doc_lock_state.apply(kwargs={"locked": False, "doc_id": self.doc.id}).get()

        self.doc.refresh_from_db()
        # Document should remain locked since it failed
        self.assertEqual(self.doc.processing_status, DocumentProcessingStatus.FAILED)

    def test_unlock_successful_sets_completed(self):
        """Test that unlocking a processing document sets status to COMPLETED."""
        set_doc_lock_state.apply(kwargs={"locked": False, "doc_id": self.doc.id}).get()

        self.doc.refresh_from_db()
        self.assertEqual(self.doc.processing_status, DocumentProcessingStatus.COMPLETED)
        self.assertFalse(self.doc.backend_lock)


class ExtractThumbnailTestCase(TestCase):
    """Tests for extract_thumbnail task edge cases."""

    def setUp(self):
        self.user = User.objects.create_user(username="thumbtest", password="12345678")
        self.doc = Document.objects.create(
            creator=self.user,
            title="Thumbnail Test Doc",
            file_type="application/pdf",
        )

    def test_extract_thumbnail_nonexistent_document(self):
        """Test extract_thumbnail handles nonexistent document."""
        # Should not raise, just return early
        result = extract_thumbnail.apply(kwargs={"doc_id": 99999}).get()
        self.assertIsNone(result)

    @patch("opencontractserver.tasks.doc_tasks.get_components_by_mimetype")
    def test_extract_thumbnail_no_thumbnailer(self, mock_get_components):
        """Test extract_thumbnail handles missing thumbnailer."""
        mock_get_components.return_value = {"thumbnailers": []}

        # Should not raise, just log error and return
        result = extract_thumbnail.apply(kwargs={"doc_id": self.doc.id}).get()
        self.assertIsNone(result)

    @patch("opencontractserver.tasks.doc_tasks.get_components_by_mimetype")
    def test_extract_thumbnail_generation_failure(self, mock_get_components):
        """Test extract_thumbnail handles failed thumbnail generation."""
        mock_thumbnailer = MagicMock()
        mock_thumbnailer.__name__ = "MockThumbnailer"
        mock_thumbnailer.return_value.generate_thumbnail.return_value = None
        mock_get_components.return_value = {"thumbnailers": [mock_thumbnailer]}

        # Should not raise
        result = extract_thumbnail.apply(kwargs={"doc_id": self.doc.id}).get()
        self.assertIsNone(result)


class RetryDocumentProcessingTestCase(TestCase):
    """Tests for retry_document_processing task."""

    def setUp(self):
        self.user = User.objects.create_user(username="retrytest", password="12345678")
        self.doc = Document.objects.create(
            creator=self.user,
            title="Retry Test Doc",
            processing_status=DocumentProcessingStatus.FAILED,
            processing_error="Previous error",
            backend_lock=True,
        )

    def test_retry_nonexistent_document(self):
        """Test retry_document_processing handles nonexistent document."""
        result = retry_document_processing.apply(args=(self.user.id, 99999)).get()

        self.assertEqual(result["status"], "error")
        self.assertIn("not found", result["message"])

    def test_retry_non_failed_document(self):
        """Test retry_document_processing rejects non-failed documents."""
        self.doc.processing_status = DocumentProcessingStatus.COMPLETED
        self.doc.save()

        result = retry_document_processing.apply(args=(self.user.id, self.doc.id)).get()

        self.assertEqual(result["status"], "error")
        self.assertIn("not in failed state", result["message"])

    @patch("celery.chain")
    def test_retry_failed_document_success(self, mock_chain):
        """Test retry_document_processing queues reprocessing for failed doc."""
        mock_chain.return_value.apply_async = MagicMock()

        result = retry_document_processing.apply(args=(self.user.id, self.doc.id)).get()

        self.assertEqual(result["status"], "queued")
        self.doc.refresh_from_db()
        self.assertEqual(self.doc.processing_status, DocumentProcessingStatus.PENDING)
        self.assertEqual(self.doc.processing_error, "")
        mock_chain.assert_called_once()
