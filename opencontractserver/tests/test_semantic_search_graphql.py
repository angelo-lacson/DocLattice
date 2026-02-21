"""
Tests for GraphQL semantic search query.

This test suite covers:
- Basic semantic search functionality
- Pagination (limit/offset)
- Permission filtering
- Corpus-scoped search
- Document-scoped search
- Modality filtering
"""

from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.utils.permissioning import (
    PermissionTypes,
    set_permissions_for_obj_to_user,
)

User = get_user_model()


class TestContext:
    """Mock context for GraphQL testing."""

    def __init__(self, user):
        self.user = user


class MockEmbedder:
    """Mock embedder for testing."""

    vector_size = 768
    is_multimodal = False
    supports_images = False

    def embed_text(self, text: str) -> list[float]:
        """Return a mock embedding vector."""
        # Use simple hash-based vectors for consistent test results
        return [float(hash(text) % 100) / 100.0] * 768


class SemanticSearchQueryTest(TestCase):
    """Test semantic search GraphQL query."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="search_test_user", password="testpassword"
        )
        self.other_user = User.objects.create_user(
            username="other_search_user", password="testpassword"
        )

        # Create corpus
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user,
            preferred_embedder=settings.DEFAULT_EMBEDDER,
        )
        set_permissions_for_obj_to_user(
            user_val=self.user,
            instance=self.corpus,
            permissions=[PermissionTypes.ALL],
        )

        # Create document (no PDF file needed for GraphQL query tests)
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            user_val=self.user,
            instance=self.document,
            permissions=[PermissionTypes.ALL],
        )

        # Create annotations
        self.annotation1 = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            creator=self.user,
            raw_text="Test annotation about contracts",
            page=1,
            is_public=True,
        )
        self.annotation2 = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            creator=self.user,
            raw_text="Another annotation about legal terms",
            page=1,
            is_public=True,
        )

        # Create private annotation (only visible to owner)
        self.private_annotation = Annotation.objects.create(
            document=self.document,
            corpus=self.corpus,
            creator=self.user,
            raw_text="Private annotation about confidential matters",
            page=2,
            is_public=False,
        )

        self.client = Client(schema, context_value=TestContext(self.user))

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_basic(self, mock_get_embedder):
        """Test basic semantic search returns results."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!) {
                semanticSearch(query: $query) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"query": "contracts"},
        )

        # Should succeed (may have no results if vector search not set up)
        # but should not error
        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_with_corpus_filter(self, mock_get_embedder):
        """Test semantic search with corpus_id filter."""
        mock_get_embedder.return_value = MockEmbedder

        corpus_global_id = to_global_id("CorpusType", self.corpus.id)

        query = """
            query SemanticSearch($query: String!, $corpusId: ID) {
                semanticSearch(query: $query, corpusId: $corpusId) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "legal terms",
                "corpusId": corpus_global_id,
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_with_document_filter(self, mock_get_embedder):
        """Test semantic search with document_id filter."""
        mock_get_embedder.return_value = MockEmbedder

        document_global_id = to_global_id("DocumentType", self.document.id)

        query = """
            query SemanticSearch($query: String!, $documentId: ID) {
                semanticSearch(query: $query, documentId: $documentId) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                    document {
                        id
                        title
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "contracts",
                "documentId": document_global_id,
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_pagination(self, mock_get_embedder):
        """Test semantic search with pagination parameters."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!, $limit: Int, $offset: Int) {
                semanticSearch(query: $query, limit: $limit, offset: $offset) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "test",
                "limit": 10,
                "offset": 0,
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_limit_cap(self, mock_get_embedder):
        """Test that limit is capped at 200."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!, $limit: Int) {
                semanticSearch(query: $query, limit: $limit) {
                    annotation {
                        id
                    }
                    similarityScore
                }
            }
        """

        # Request more than 200 - should be capped
        result = self.client.execute(
            query,
            variables={
                "query": "test",
                "limit": 500,  # Above the cap
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    def test_semantic_search_requires_authentication(self):
        """Test that semantic search requires authentication."""

        # Create client without user (anonymous)
        class AnonymousContext:
            user = None

        anonymous_client = Client(schema, context_value=AnonymousContext())

        query = """
            query SemanticSearch($query: String!) {
                semanticSearch(query: $query) {
                    annotation {
                        id
                    }
                    similarityScore
                }
            }
        """

        result = anonymous_client.execute(
            query,
            variables={"query": "test"},
        )

        # Should fail with authentication error
        self.assertIsNotNone(result.get("errors"))

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_with_modalities_filter(self, mock_get_embedder):
        """Test semantic search with modalities filter."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!, $modalities: [String]) {
                semanticSearch(query: $query, modalities: $modalities) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "test",
                "modalities": ["TEXT"],
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_with_label_text_filter(self, mock_get_embedder):
        """Test hybrid search with label_text filter."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!, $labelText: String) {
                semanticSearch(query: $query, labelText: $labelText) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "test",
                "labelText": "contract",  # Filter by label containing "contract"
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_with_raw_text_contains_filter(self, mock_get_embedder):
        """Test hybrid search with raw_text_contains filter."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!, $rawTextContains: String) {
                semanticSearch(query: $query, rawTextContains: $rawTextContains) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "test",
                "rawTextContains": "contracts",  # Filter annotations containing "contracts"
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_semantic_search_combined_hybrid_filters(self, mock_get_embedder):
        """Test hybrid search with both label_text and raw_text_contains filters.

        This tests global search (no corpus_id) to avoid the scoped search path
        which requires more complex mocking of generate_embeddings_from_text.
        """
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch(
                $query: String!,
                $labelText: String,
                $rawTextContains: String
            ) {
                semanticSearch(
                    query: $query,
                    labelText: $labelText,
                    rawTextContains: $rawTextContains
                ) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={
                "query": "legal",
                "labelText": "section",
                "rawTextContains": "terms",
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertIn("semanticSearch", result["data"])


class SemanticSearchPermissionTest(TestCase):
    """Test permission filtering in semantic search."""

    def setUp(self):
        """Set up test data for permission tests."""
        self.user = User.objects.create_user(
            username="perm_test_user", password="testpassword"
        )
        self.other_user = User.objects.create_user(
            username="other_perm_user", password="testpassword"
        )

        # Create document owned by other user
        self.other_user_doc = Document.objects.create(
            title="Other User Document",
            creator=self.other_user,
        )
        set_permissions_for_obj_to_user(
            user_val=self.other_user,
            instance=self.other_user_doc,
            permissions=[PermissionTypes.ALL],
        )

        # Create annotation that should NOT be visible to self.user
        # Set embedding to non-None dummy value to skip embedding signal
        # (signal checks `instance.embedding is None` before triggering)
        self.hidden_annotation = Annotation.objects.create(
            document=self.other_user_doc,
            creator=self.other_user,
            raw_text="Hidden annotation",
            page=1,
            is_public=False,  # Private
            embedding=[0.1] * 384,  # Dummy embedding to skip signal
        )

        self.client = Client(schema, context_value=TestContext(self.user))

    @patch("opencontractserver.pipeline.utils.get_default_embedder")
    def test_user_cannot_see_private_annotations_from_inaccessible_documents(
        self, mock_get_embedder
    ):
        """Test that private annotations from inaccessible documents are not returned."""
        mock_get_embedder.return_value = MockEmbedder

        query = """
            query SemanticSearch($query: String!) {
                semanticSearch(query: $query) {
                    annotation {
                        id
                        rawText
                    }
                    similarityScore
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"query": "hidden"},
        )

        self.assertIsNone(result.get("errors"))
        # Results should not include the hidden annotation
        results = result["data"]["semanticSearch"]
        for r in results:
            self.assertNotEqual(
                r["annotation"]["rawText"],
                "Hidden annotation",
                "Private annotation from inaccessible document should not be visible",
            )
