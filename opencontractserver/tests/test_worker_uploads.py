"""
Tests for the worker document upload system.

Covers:
- WorkerAccount and CorpusAccessToken model logic
- WorkerTokenAuthentication backend
- REST upload endpoint (auth, validation, staging)
- Batch processor task (SKIP LOCKED drain, document creation, embeddings)
- GraphQL mutations for managing worker accounts and tokens
"""

import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
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


def _make_fake_pdf() -> BytesIO:
    """Create a minimal PDF-like file for testing."""
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

    def test_unique_name(self):
        WorkerAccount.create_with_user(name="unique-worker", creator=self.admin)
        with self.assertRaises(Exception):
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

    def test_token_key_generated(self):
        token = CorpusAccessToken.objects.create(
            worker_account=self.account, corpus=self.corpus
        )
        self.assertEqual(len(token.key), 64)

    def test_is_valid_active(self):
        token = CorpusAccessToken.objects.create(
            worker_account=self.account, corpus=self.corpus
        )
        self.assertTrue(token.is_valid)

    def test_is_valid_revoked(self):
        token = CorpusAccessToken.objects.create(
            worker_account=self.account, corpus=self.corpus, is_active=False
        )
        self.assertFalse(token.is_valid)

    def test_is_valid_expired(self):
        token = CorpusAccessToken.objects.create(
            worker_account=self.account,
            corpus=self.corpus,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertFalse(token.is_valid)

    def test_is_valid_inactive_account(self):
        self.account.is_active = False
        self.account.save(update_fields=["is_active"])
        try:
            token = CorpusAccessToken.objects.create(
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
        cls.token = CorpusAccessToken.objects.create(
            worker_account=cls.account, corpus=cls.corpus
        )

    def test_valid_auth(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.token.key}")
        # Hit the list endpoint to test auth
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 200)

    def test_missing_token(self):
        client = APIClient()
        response = client.get("/api/worker-uploads/documents/list/")
        # No auth header — should fail
        self.assertIn(response.status_code, [401, 403])

    def test_invalid_token(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="WorkerKey invalidtoken123")
        response = client.get("/api/worker-uploads/documents/list/")
        self.assertEqual(response.status_code, 401)

    def test_wrong_prefix(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token.key}")
        response = client.get("/api/worker-uploads/documents/list/")
        # Wrong prefix — WorkerTokenAuthentication returns None, DRF tries
        # other backends and eventually denies.
        self.assertIn(response.status_code, [401, 403])

    def test_revoked_token(self):
        self.token.is_active = False
        self.token.save(update_fields=["is_active"])
        try:
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.token.key}")
            response = client.get("/api/worker-uploads/documents/list/")
            self.assertEqual(response.status_code, 401)
        finally:
            self.token.is_active = True
            self.token.save(update_fields=["is_active"])

    def test_expired_token(self):
        self.token.expires_at = timezone.now() - timedelta(hours=1)
        self.token.save(update_fields=["expires_at"])
        try:
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.token.key}")
            response = client.get("/api/worker-uploads/documents/list/")
            self.assertEqual(response.status_code, 401)
        finally:
            self.token.expires_at = None
            self.token.save(update_fields=["expires_at"])


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
        self.token = CorpusAccessToken.objects.create(
            worker_account=self.account, corpus=self.corpus
        )
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"WorkerKey {self.token.key}")

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    def test_upload_stages_document(self, mock_task):
        metadata = _make_metadata()
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf(),
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
                "file": _make_fake_pdf(),
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
                "file": _make_fake_pdf(),
                "metadata": "not valid json {{{",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    @patch(
        "opencontractserver.worker_uploads.views.process_pending_uploads.apply_async"
    )
    def test_rate_limiting(self, mock_task):
        self.token.rate_limit_per_minute = 1
        self.token.save(update_fields=["rate_limit_per_minute"])

        metadata = _make_metadata()

        # First upload should succeed
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf(),
                "metadata": json.dumps(metadata),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 202)

        # Second upload should be rate-limited
        response = self.client.post(
            "/api/worker-uploads/documents/",
            {
                "file": _make_fake_pdf(),
                "metadata": json.dumps(metadata),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 429)

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
        self.token = CorpusAccessToken.objects.create(
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

        # WORKER_UPLOAD_BATCH_SIZE is read at call time via getattr(settings, ...)
        # so @override_settings is sufficient — no patching needed.
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
        self.assertEqual(len(data["token"]["key"]), 64)
        self.assertEqual(data["token"]["rateLimitPerMinute"], 100)

    def test_revoke_token(self):
        account = WorkerAccount.create_with_user(
            name="gql-revoke-worker", creator=self.admin
        )
        token = CorpusAccessToken.objects.create(
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
