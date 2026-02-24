"""
Tests for the worker document upload system.

Covers:
- WorkerAccount and CorpusAccessToken model logic
- WorkerTokenAuthentication backend
- REST upload endpoint (auth, validation, staging, file size limits)
- Batch processor task (SKIP LOCKED drain, document creation, embeddings)
- GraphQL mutations for managing worker accounts and tokens
"""

import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from graphene.test import Client as GraphQLClient
from rest_framework.test import APIClient

from config.graphql.schema import schema
from opencontractserver.annotations.models import (
    Embedding,
    LabelSet,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
from opencontractserver.worker_uploads.models import (
    CorpusAccessToken,
    UploadStatus,
    WorkerAccount,
    WorkerDocumentUpload,
    hash_token,
)

User = get_user_model()

pytestmark = pytest.mark.django_db


def _make_metadata(**overrides):
    """Build a minimal valid metadata payload for worker uploads."""
    base = {
        "title": "Test Document",
        "content": "This is test content for embedding.",
        "page_count": 1,
        "pawls_file_content": [
            {
                "page": {"width": 612.0, "height": 792.0, "index": 0},
                "tokens": [
                    {"x": 10, "y": 10, "width": 50, "height": 12, "text": "Hello"}
                ],
            }
        ],
    }
    base.update(overrides)
    return base


def _make_fake_pdf():
    """Create a minimal PDF-like file for testing.

    Returns a ContentFile (Django File subclass) so that Django's FileField
    descriptor properly wraps it in a FieldFile during model creation.
    For multipart uploads via DRF, this is also accepted.
    """
    return ContentFile(b"%PDF-1.4 fake pdf content for testing", name="test.pdf")


def _make_fake_pdf_upload() -> BytesIO:
    """Create a minimal PDF-like file for multipart upload testing."""
    buf = BytesIO(b"%PDF-1.4 fake pdf content for testing")
    buf.name = "test.pdf"
    return buf


# ============================================================================
# Model Tests
# ============================================================================


class TestWorkerAccountModel(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="admin_worker_test",
            password="testpass",
            email="admin_worker@test.com",
        )

    def test_create_with_user(self):
        account = WorkerAccount.create_with_user(
            name="test-parser-worker",
            description="Parses PDFs",
            creator=self.admin,
        )
        self.assertTrue(account.is_active)
        self.assertEqual(account.name, "test-parser-worker")
        self.assertIsNotNone(account.user)
        self.assertTrue(account.user.username.startswith("worker_"))
        self.assertFalse(account.user.has_usable_password())
        self.assertFalse(account.user.is_staff)

    def test_unique_name_rejected(self):
        """create_with_user raises ValueError for duplicate names."""
        WorkerAccount.create_with_user(name="unique-worker", creator=self.admin)
        with self.assertRaises(ValueError):
            WorkerAccount.create_with_user(name="unique-worker", creator=self.admin)


class TestCorpusAccessTokenModel(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="admin_token_test",
            password="testpass",
            email="admin_token@test.com",
        )
        cls.account = WorkerAccount.create_with_user(
            name="token-test-worker", creator=cls.admin
        )
        cls.label_set = LabelSet.objects.create(
            title="Token Test LS", creator=cls.admin
        )
        cls.corpus = Corpus.objects.create(
            title="Token Test Corpus",
            creator=cls.admin,
            label_set=cls.label_set,
        )

    def test_create_token_returns_plaintext_and_stores_hash(self):
        """create_token() returns plaintext once; only hash is stored."""
        token, plaintext = CorpusAccessToken.create_token(
            worker_account=self.account, corpus=self.corpus
        )
        self.assertEqual(len(plaintext), 64)
        self.assertEqual(token.key, hash_token(plaintext))
        self.assertNotEqual(token.key, plaintext)
        self.assertEqual(token.key_prefix, plaintext[:8])

    def test_is_valid_active(self):
        token, _ = CorpusAccessToken.create_token(
            worker_account=self.account, corpus=self.corpus
        )
        self.assertTrue(token.is_valid)

    def test_is_valid_revoked(self):
        token, _ = CorpusAccessToken.create_token(
            worker_account=self.account, corpus=self.corpus, is_active=False
        )
        self.assertFalse(token.is_valid)

    def test_is_valid_expired(self):
        token, _ = CorpusAccessToken.create_token(
            worker_account=self.account,
            corpus=self.corpus,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(token.is_valid)

    def test_is_valid_inactive_account(self):
        self.account.is_active = False
        self.account.save(update_fields=["is_active"])
        try:
            token, _ = CorpusAccessToken.create_token(
                worker_account=self.account, corpus=self.corpus
            )
            self.assertFalse(token.is_valid)
        finally:
            self.account.is_active = True
            self.account.save(update_fields=["is_active"])


# ============================================================================
# Authentication Tests
# ============================================================================


class TestWorkerTokenAuthentication(TestCase):
    """
    Test the WorkerTokenAuthentication DRF backend.

    Each test creates its own token via setUp to avoid shared mutable state
    (e.g. revoking a class-level token would corrupt subsequent tests if the
    finally block didn't execute).
    """

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="admin_auth_test",
            password="testpass",
            email="admin_auth@test.com",
        )
        cls.account = WorkerAccount.create_with_user(
            name="auth-test-worker", creator=cls.admin
        )
        cls.label_set = LabelSet.objects.create(title="Auth Test LS", creator=cls.admin)
        cls.corpus = Corpus.objects.create(
            title="Auth Test Corpus",
            creator=cls.admin,
            label_set=cls.label_set,
        )

    def setUp(self):
        # Instance-level token avoids shared mutable state across tests
        self.token, self.plaintext_key = CorpusAccessToken.create_token(
            worker_account=self.account, corpus=self.corpus
        )

    def test_valid_auth(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.plaintext_key}")
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 200)

    def test_missing_token(self):
        client = APIClient()
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertIn(response.status_code, [401, 403])

    def test_invalid_token(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="WorkerKey invalidtoken123")
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 401)

    def test_wrong_prefix(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.plaintext_key}")
        response = client.get("/api/worker-uploads/documents/list/")
        # Wrong prefix — WorkerTokenAuthentication returns None, DRF tries
        # other backends and eventually denies.
        self.assertIn(response.status_code, [401, 403])

    def test_revoked_token(self):
        self.token.is_active = False
        self.token.save(update_fields=["is_active"])
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.plaintext_key}")
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 401)

    def test_expired_token(self):
        self.token.expires_at = timezone.now() - timedelta(hours=1)
        self.token.save(update_fields=["expires_at"])
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.plaintext_key}")
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 401)


# ============================================================================
# REST API Upload Tests
# ============================================================================


class TestWorkerUploadEndpoint(TransactionTestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_upload_test",
            password="testpass",
            email="admin_upload@test.com",
        )
        self.account = WorkerAccount.create_with_user(
            name="upload-test-worker", creator=self.admin
        )
        self.label_set = LabelSet.objects.create(
            title="Upload Test LS", creator=self.admin
        )
        self.corpus = Corpus.objects.create(
            title="Upload Test Corpus",
            creator=self.admin,
            label_set=self.label_set,
        )
        set_permissions_for_obj_to_user(self.admin, self.corpus, [PermissionTypes.ALL])
        self.token, self.plaintext_key = CorpusAccessToken.create_token(
            worker_account=self.account, corpus=self.corpus
        )
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.plaintext_key}")

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    def test_upload_stages_document(self, mock_task):
        metadata = _make_metadata()
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf_upload(),
                "metadata": json.dumps(metadata),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data["status"], "PENDING")
        self.assertIn("upload_id", data)

        # Verify staged in database
        upload = WorkerDocumentUpload.objects.get(id=data["upload_id"])
        self.assertEqual(upload.corpus, self.corpus)
        self.assertEqual(upload.status, UploadStatus.PENDING)
        self.assertEqual(upload.metadata["title"], "Test Document")

        # Verify the task nudge was sent
        mock_task.assert_called_once()

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    def test_upload_validates_metadata(self, mock_task):
        # Missing required fields
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf_upload(),
                "metadata": json.dumps({"title": "incomplete"}),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    def test_upload_invalid_json(self, mock_task):
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf_upload(),
                "metadata": "not valid json {{{",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    def test_rate_limiting(self, mock_task):
        """Rate limiter counts uploads created by this token in the last minute."""
        self.token.rate_limit_per_minute = 1
        self.token.save(update_fields=["rate_limit_per_minute"])

        metadata = _make_metadata()

        # First upload should succeed
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf_upload(),
                "metadata": json.dumps(metadata),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 202)

        # Second upload should be rate-limited
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf_upload(),
                "metadata": json.dumps(metadata),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 429)

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    @override_settings(MAX_WORKER_UPLOAD_SIZE_BYTES=10)
    def test_file_size_limit_enforced(self, mock_task):
        """Uploads exceeding MAX_WORKER_UPLOAD_SIZE_BYTES are rejected."""
        metadata = _make_metadata()
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf_upload(),
                "metadata": json.dumps(metadata),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 413)

    def test_status_endpoint(self):
        upload = WorkerDocumentUpload.objects.create(
            corpus_access_token=self.token,
            corpus=self.corpus,
            file=_make_fake_pdf(),
            metadata=_make_metadata(),
            status=UploadStatus.COMPLETED,
        )
        response = self.client.get(f"/api/worker-uploads/documents/{upload.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "COMPLETED")

    def test_list_endpoint_filters_by_token(self):
        WorkerDocumentUpload.objects.create(
            corpus_access_token=self.token,
            corpus=self.corpus,
            file=_make_fake_pdf(),
            metadata=_make_metadata(),
        )
        response = self.client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()), 1)


# ============================================================================
# Batch Processor Task Tests
# ============================================================================


class TestBatchProcessor(TransactionTestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin_batch_test",
            password="testpass",
            email="admin_batch@test.com",
        )
        self.account = WorkerAccount.create_with_user(
            name="batch-test-worker", creator=self.admin
        )
        self.label_set = LabelSet.objects.create(
            title="Batch Test LS", creator=self.admin
        )
        self.corpus = Corpus.objects.create(
            title="Batch Test Corpus",
            creator=self.admin,
            label_set=self.label_set,
        )
        set_permissions_for_obj_to_user(self.admin, self.corpus, [PermissionTypes.ALL])
        self.token, _ = CorpusAccessToken.create_token(
            worker_account=self.account, corpus=self.corpus
        )

    def _create_staged_upload(self, **metadata_overrides):
        """Create a PENDING upload in the staging table."""
        return WorkerDocumentUpload.objects.create(
            corpus_access_token=self.token,
            corpus=self.corpus,
            file=_make_fake_pdf(),
            metadata=_make_metadata(**metadata_overrides),
            status=UploadStatus.PENDING,
        )

    def test_processes_pending_upload(self):
        """A PENDING upload is claimed and processed to COMPLETED."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        upload = self._create_staged_upload()

        result = process_pending_uploads.apply().get()

        self.assertEqual(result["claimed"], 1)
        self.assertEqual(result["succeeded"], 1)
        self.assertEqual(result["failed"], 0)

        upload.refresh_from_db()
        self.assertEqual(upload.status, UploadStatus.COMPLETED)
        self.assertIsNotNone(upload.result_document)
        self.assertIsNotNone(upload.processing_finished)

    def test_created_document_owned_by_corpus_creator(self):
        """Documents created by worker uploads are owned by the corpus creator."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        upload = self._create_staged_upload()

        process_pending_uploads.apply().get()

        upload.refresh_from_db()
        doc = upload.result_document
        self.assertIsNotNone(doc)
        self.assertEqual(doc.creator, self.admin)

    def test_no_pending_uploads(self):
        """Returns immediately when no uploads are pending."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        result = process_pending_uploads.apply().get()
        self.assertEqual(result["claimed"], 0)

    def test_failed_upload_marked(self):
        """An upload with invalid data is marked FAILED with an error message."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        # Create upload with metadata missing required 'content' key
        upload = WorkerDocumentUpload.objects.create(
            corpus_access_token=self.token,
            corpus=self.corpus,
            file=_make_fake_pdf(),
            metadata={"title": "Bad doc", "pawls_file_content": [], "page_count": 0},
            status=UploadStatus.PENDING,
        )

        result = process_pending_uploads.apply().get()

        self.assertEqual(result["failed"], 1)
        upload.refresh_from_db()
        self.assertEqual(upload.status, UploadStatus.FAILED)
        self.assertTrue(len(upload.error_message) > 0)

    def test_null_corpus_creator_raises(self):
        """Processing fails gracefully when corpus.creator is None."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        # Force creator to None in the DB (bypassing NOT NULL for test purposes).
        # Corpus.creator has null=False, but we test the defensive guard in
        # _process_single_upload in case schema changes in the future.
        upload = self._create_staged_upload()

        with patch(
            "opencontractserver.worker_uploads.tasks.WorkerDocumentUpload"
            ".objects.select_related"
        ) as mock_qs:
            # Simulate a corpus whose creator is None
            mock_upload = WorkerDocumentUpload.objects.select_related(
                "corpus",
                "corpus__creator",
                "corpus_access_token",
                "corpus_access_token__worker_account",
            ).get(id=upload.id)
            mock_upload.corpus.creator = None
            mock_qs.return_value.get.return_value = mock_upload

            result = process_pending_uploads.apply().get()

        self.assertEqual(result["failed"], 1)
        upload.refresh_from_db()
        self.assertEqual(upload.status, UploadStatus.FAILED)
        self.assertIn("no creator", upload.error_message)

    def test_filename_sanitized(self):
        """Document filenames are sanitized to remove path traversal characters."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        upload = self._create_staged_upload(title="../../etc/passwd\x00.pdf")

        process_pending_uploads.apply().get()

        upload.refresh_from_db()
        self.assertEqual(upload.status, UploadStatus.COMPLETED)
        doc = upload.result_document
        # The filename stored in the pdf_file field should be sanitized
        self.assertNotIn("..", doc.pdf_file.name)
        self.assertNotIn("\x00", doc.pdf_file.name)

    def test_embeddings_stored(self):
        """Pre-computed embeddings are stored in the Embedding table."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        metadata = _make_metadata(
            text_labels={
                "Important": {
                    "text": "Important",
                    "label_type": "TOKEN_LABEL",
                    "color": "#FF0000",
                    "description": "Important text",
                    "icon": "tag",
                }
            },
            labelled_text=[
                {
                    "id": "annot-1",
                    "annotationLabel": "Important",
                    "rawText": "Hello",
                    "page": 0,
                    "annotation_json": {},
                    "annotation_type": "TOKEN_LABEL",
                    "structural": False,
                }
            ],
            embeddings={
                "embedder_path": "test/embedder-384",
                "document_embedding": [0.1] * 384,
                "annotation_embeddings": {
                    "annot-1": [0.2] * 384,
                },
            },
        )

        upload = WorkerDocumentUpload.objects.create(
            corpus_access_token=self.token,
            corpus=self.corpus,
            file=_make_fake_pdf(),
            metadata=metadata,
            status=UploadStatus.PENDING,
        )

        process_pending_uploads.apply().get()

        upload.refresh_from_db()
        self.assertEqual(upload.status, UploadStatus.COMPLETED)

        # Check document embedding was stored
        doc_embeddings = Embedding.objects.filter(
            document=upload.result_document,
            embedder_path="test/embedder-384",
        )
        self.assertEqual(doc_embeddings.count(), 1)
        self.assertIsNotNone(doc_embeddings.first().vector_384)

        # Check annotation embedding was stored
        annot_embeddings = Embedding.objects.filter(
            annotation__document=upload.result_document,
            embedder_path="test/embedder-384",
        )
        self.assertEqual(annot_embeddings.count(), 1)

    @override_settings(WORKER_UPLOAD_BATCH_SIZE=2)
    def test_batch_size_respected(self):
        """Only WORKER_UPLOAD_BATCH_SIZE uploads are claimed per run."""
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        for _ in range(5):
            self._create_staged_upload()

        result = process_pending_uploads.apply().get()

        self.assertEqual(result["claimed"], 2)


# ============================================================================
# GraphQL Mutation Tests
# ============================================================================


class TestWorkerGraphQLMutations(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser(
            username="admin_gql_test",
            password="testpass",
            email="admin_gql@test.com",
        )
        cls.regular_user = User.objects.create_user(
            username="regular_gql_test",
            password="testpass",
            email="regular_gql@test.com",
        )
        cls.label_set = LabelSet.objects.create(title="GQL Test LS", creator=cls.admin)
        cls.corpus = Corpus.objects.create(
            title="GQL Test Corpus",
            creator=cls.admin,
            label_set=cls.label_set,
        )
        cls.gql_client = GraphQLClient(schema)

    def _execute(self, query, user, variables=None):
        class MockRequest:
            def __init__(self, u):
                self.user = u
                self.META = {}

        return self.gql_client.execute(
            query, variables=variables, context_value=MockRequest(user)
        )

    def test_create_worker_account_as_superuser(self):
        mutation = """
            mutation {
                createWorkerAccount(name: "gql-worker", description: "test") {
                    ok
                    workerAccount { id name isActive }
                }
            }
        """
        result = self._execute(mutation, self.admin)
        self.assertIsNone(result.get("errors"))
        data = result["data"]["createWorkerAccount"]
        self.assertTrue(data["ok"])
        self.assertEqual(data["workerAccount"]["name"], "gql-worker")
        self.assertTrue(data["workerAccount"]["isActive"])

    def test_create_worker_account_denied_for_regular_user(self):
        mutation = """
            mutation {
                createWorkerAccount(name: "denied-worker") {
                    ok
                }
            }
        """
        result = self._execute(mutation, self.regular_user)
        self.assertIsNotNone(result.get("errors"))

    def test_create_corpus_access_token(self):
        """Token creation returns a 64-char plaintext key (shown only once)."""
        account = WorkerAccount.create_with_user(
            name="gql-token-worker", creator=self.admin
        )
        mutation = """
            mutation CreateToken($workerAccountId: Int!, $corpusId: Int!) {
                createCorpusAccessToken(
                    workerAccountId: $workerAccountId,
                    corpusId: $corpusId,
                    rateLimitPerMinute: 100
                ) {
                    ok
                    token { id key corpusId rateLimitPerMinute }
                }
            }
        """
        result = self._execute(
            mutation,
            self.admin,
            variables={
                "workerAccountId": account.id,
                "corpusId": self.corpus.id,
            },
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["createCorpusAccessToken"]
        self.assertTrue(data["ok"])
        # The returned key is the plaintext (shown once)
        plaintext_key = data["token"]["key"]
        self.assertEqual(len(plaintext_key), 64)
        self.assertEqual(data["token"]["rateLimitPerMinute"], 100)

        # Verify the DB stores the hash, not the plaintext
        db_token = CorpusAccessToken.objects.get(id=data["token"]["id"])
        self.assertEqual(db_token.key, hash_token(plaintext_key))
        self.assertNotEqual(db_token.key, plaintext_key)

    def test_revoke_token(self):
        account = WorkerAccount.create_with_user(
            name="gql-revoke-worker", creator=self.admin
        )
        token, _ = CorpusAccessToken.create_token(
            worker_account=account, corpus=self.corpus
        )
        mutation = """
            mutation RevokeToken($tokenId: Int!) {
                revokeCorpusAccessToken(tokenId: $tokenId) { ok }
            }
        """
        result = self._execute(mutation, self.admin, variables={"tokenId": token.id})
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["revokeCorpusAccessToken"]["ok"])

        token.refresh_from_db()
        self.assertFalse(token.is_active)

    def test_deactivate_worker_account(self):
        account = WorkerAccount.create_with_user(
            name="gql-deactivate-worker", creator=self.admin
        )
        mutation = """
            mutation Deactivate($id: Int!) {
                deactivateWorkerAccount(workerAccountId: $id) { ok }
            }
        """
        result = self._execute(mutation, self.admin, variables={"id": account.id})
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["deactivateWorkerAccount"]["ok"])

        account.refresh_from_db()
        self.assertFalse(account.is_active)
