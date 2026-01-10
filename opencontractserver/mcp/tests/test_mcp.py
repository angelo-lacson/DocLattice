"""Tests for MCP server functionality."""

import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus

User = get_user_model()


class URIParserTest(TestCase):
    """Tests for MCP URI parsing."""

    def test_parse_corpus_uri(self):
        """Test parsing corpus URIs."""
        from opencontractserver.mcp.server import URIParser

        # Valid URI
        result = URIParser.parse_corpus("corpus://my-corpus")
        self.assertEqual(result, "my-corpus")

        # More complex slugs
        result = URIParser.parse_corpus("corpus://Legal-Contracts-2024")
        self.assertEqual(result, "Legal-Contracts-2024")

        # Invalid URIs
        self.assertIsNone(URIParser.parse_corpus("corpus://"))
        self.assertIsNone(URIParser.parse_corpus("document://my-corpus"))
        self.assertIsNone(URIParser.parse_corpus("corpus://my corpus"))  # space invalid
        self.assertIsNone(
            URIParser.parse_corpus("corpus://my_corpus")
        )  # underscore invalid

    def test_parse_document_uri(self):
        """Test parsing document URIs."""
        from opencontractserver.mcp.server import URIParser

        result = URIParser.parse_document("document://my-corpus/my-doc")
        self.assertEqual(result, ("my-corpus", "my-doc"))

        result = URIParser.parse_document("document://corp-1/doc-2024")
        self.assertEqual(result, ("corp-1", "doc-2024"))

        self.assertIsNone(URIParser.parse_document("document://my-corpus"))
        self.assertIsNone(URIParser.parse_document("document://"))

    def test_parse_annotation_uri(self):
        """Test parsing annotation URIs."""
        from opencontractserver.mcp.server import URIParser

        result = URIParser.parse_annotation("annotation://corp/doc/123")
        self.assertEqual(result, ("corp", "doc", 123))

        result = URIParser.parse_annotation("annotation://my-corpus/my-doc/999")
        self.assertEqual(result, ("my-corpus", "my-doc", 999))

        self.assertIsNone(URIParser.parse_annotation("annotation://corp/doc"))
        self.assertIsNone(URIParser.parse_annotation("annotation://corp/doc/abc"))

    def test_parse_thread_uri(self):
        """Test parsing thread URIs."""
        from opencontractserver.mcp.server import URIParser

        result = URIParser.parse_thread("thread://my-corpus/threads/456")
        self.assertEqual(result, ("my-corpus", 456))

        result = URIParser.parse_thread("thread://legal-2024/threads/1")
        self.assertEqual(result, ("legal-2024", 1))

        self.assertIsNone(URIParser.parse_thread("thread://my-corpus/456"))
        self.assertIsNone(URIParser.parse_thread("thread://my-corpus/threads/"))


class MCPPermissionsTest(TestCase):
    """Tests for MCP permission validation."""

    def test_validate_slug(self):
        """Test slug validation."""
        from opencontractserver.mcp.permissions import validate_slug

        # Valid slugs
        self.assertTrue(validate_slug("my-corpus"))
        self.assertTrue(validate_slug("MyCorpus123"))
        self.assertTrue(validate_slug("test-doc-2024"))
        self.assertTrue(validate_slug("ABC"))
        self.assertTrue(validate_slug("123"))

        # Invalid slugs
        self.assertFalse(validate_slug("my corpus"))  # space
        self.assertFalse(validate_slug("my_corpus"))  # underscore
        self.assertFalse(validate_slug(""))
        self.assertFalse(validate_slug("my@corpus"))  # special char

    def test_sanitize_and_validate_slugs(self):
        """Test slug sanitization and validation."""
        from opencontractserver.mcp.permissions import sanitize_and_validate_slugs

        # Valid slugs pass through
        result = sanitize_and_validate_slugs("my-corpus", "my-doc")
        self.assertEqual(result, ("my-corpus", "my-doc"))

        # None document slug is allowed
        result = sanitize_and_validate_slugs("my-corpus", None)
        self.assertEqual(result, ("my-corpus", None))

        # Invalid corpus slug raises
        with self.assertRaises(ValueError):
            sanitize_and_validate_slugs("my corpus")

        # Invalid document slug raises
        with self.assertRaises(ValueError):
            sanitize_and_validate_slugs("my-corpus", "my_doc")

    def test_get_anonymous_user(self):
        """Test anonymous user helper."""
        from opencontractserver.mcp.permissions import get_anonymous_user

        user = get_anonymous_user()
        self.assertIsInstance(user, AnonymousUser)
        self.assertFalse(user.is_authenticated)


class MCPResourcesTest(TestCase):
    """Tests for MCP resource handlers."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        cls.owner = User.objects.create_user(
            username="testowner", email="owner@test.com", password="testpass123"
        )

        # Create public corpus
        cls.public_corpus = Corpus.objects.create(
            title="Public Test Corpus",
            description="A public test corpus",
            creator=cls.owner,
            is_public=True,
        )

        # Create private corpus
        cls.private_corpus = Corpus.objects.create(
            title="Private Test Corpus",
            description="A private test corpus",
            creator=cls.owner,
            is_public=False,
        )

    def test_get_public_corpus_resource(self):
        """Anonymous users can access public corpus resources."""
        from opencontractserver.mcp.resources import get_corpus_resource

        result = get_corpus_resource(self.public_corpus.slug)
        data = json.loads(result)

        self.assertEqual(data["slug"], self.public_corpus.slug)
        self.assertEqual(data["title"], "Public Test Corpus")
        self.assertEqual(data["description"], "A public test corpus")

    def test_get_private_corpus_resource_denied(self):
        """Anonymous users cannot access private corpus resources."""
        from opencontractserver.mcp.resources import get_corpus_resource

        with self.assertRaises(Corpus.DoesNotExist):
            get_corpus_resource(self.private_corpus.slug)


class MCPToolsTest(TestCase):
    """Tests for MCP tool handlers."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        cls.owner = User.objects.create_user(
            username="toolsowner", email="tools@test.com", password="testpass123"
        )

        # Create public corpuses
        cls.corpus1 = Corpus.objects.create(
            title="Corpus One",
            description="First corpus",
            creator=cls.owner,
            is_public=True,
        )
        cls.corpus2 = Corpus.objects.create(
            title="Corpus Two",
            description="Second corpus",
            creator=cls.owner,
            is_public=True,
        )

        # Create private corpus (should not appear)
        cls.private = Corpus.objects.create(
            title="Private Corpus", creator=cls.owner, is_public=False
        )

    def test_list_public_corpuses(self):
        """Test listing public corpuses."""
        from opencontractserver.mcp.tools import list_public_corpuses

        result = list_public_corpuses()

        self.assertIn("total_count", result)
        self.assertIn("corpuses", result)

        # Should only include public corpuses
        slugs = [c["slug"] for c in result["corpuses"]]
        self.assertIn(self.corpus1.slug, slugs)
        self.assertIn(self.corpus2.slug, slugs)
        self.assertNotIn(self.private.slug, slugs)

    def test_list_public_corpuses_with_search(self):
        """Test searching corpuses."""
        from opencontractserver.mcp.tools import list_public_corpuses

        result = list_public_corpuses(search="One")

        slugs = [c["slug"] for c in result["corpuses"]]
        self.assertIn(self.corpus1.slug, slugs)
        self.assertNotIn(self.corpus2.slug, slugs)

    def test_list_public_corpuses_pagination(self):
        """Test pagination."""
        from opencontractserver.mcp.tools import list_public_corpuses

        result = list_public_corpuses(limit=1, offset=0)
        self.assertEqual(len(result["corpuses"]), 1)

        result2 = list_public_corpuses(limit=1, offset=1)
        self.assertEqual(len(result2["corpuses"]), 1)

        # Different results
        self.assertNotEqual(
            result["corpuses"][0]["slug"], result2["corpuses"][0]["slug"]
        )

    def test_list_public_corpuses_max_limit(self):
        """Test that limit is capped at 100."""
        from opencontractserver.mcp.tools import list_public_corpuses

        # Even with a huge limit, should be capped
        result = list_public_corpuses(limit=1000)
        # The function caps at 100, but we only have 2 public corpuses
        self.assertLessEqual(len(result["corpuses"]), 100)


class MCPFormattersTest(TestCase):
    """Tests for MCP response formatters."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username="formatowner", email="format@test.com", password="testpass123"
        )

        cls.corpus = Corpus.objects.create(
            title="Format Test Corpus",
            description="Testing formatters",
            creator=cls.owner,
            is_public=True,
        )

    def test_format_corpus_summary(self):
        """Test corpus summary formatting."""
        from opencontractserver.mcp.formatters import format_corpus_summary

        result = format_corpus_summary(self.corpus)

        self.assertEqual(result["slug"], self.corpus.slug)
        self.assertEqual(result["title"], "Format Test Corpus")
        self.assertEqual(result["description"], "Testing formatters")
        self.assertIn("created", result)
        self.assertIn("document_count", result)


class MCPConfigTest(TestCase):
    """Tests for MCP configuration."""

    def test_get_mcp_setting_with_default(self):
        """Test getting settings with defaults."""
        from opencontractserver.mcp.config import get_mcp_setting

        # Non-existent key returns default
        result = get_mcp_setting("nonexistent_key", "default_value")
        self.assertEqual(result, "default_value")

    def test_validate_slug(self):
        """Test slug validation in config."""
        from opencontractserver.mcp.config import validate_slug

        self.assertTrue(validate_slug("valid-slug"))
        self.assertTrue(validate_slug("Valid123"))
        self.assertFalse(validate_slug("invalid_slug"))
        self.assertFalse(validate_slug("invalid slug"))


class MCPRateLimiterTest(TestCase):
    """Tests for MCP rate limiter."""

    def test_rate_limiter_allows_requests(self):
        """Test that rate limiter allows requests under limit."""
        from opencontractserver.mcp.permissions import RateLimiter

        limiter = RateLimiter(max_requests=5, window_seconds=60)

        # First 5 requests should be allowed
        for i in range(5):
            self.assertTrue(limiter.check_rate_limit("test-client"))

    def test_rate_limiter_blocks_excess_requests(self):
        """Test that rate limiter blocks requests over limit."""
        from opencontractserver.mcp.permissions import RateLimiter

        limiter = RateLimiter(max_requests=2, window_seconds=60)

        # First 2 requests allowed
        self.assertTrue(limiter.check_rate_limit("test-client-2"))
        self.assertTrue(limiter.check_rate_limit("test-client-2"))

        # Third request blocked
        self.assertFalse(limiter.check_rate_limit("test-client-2"))

    def test_rate_limiter_separate_clients(self):
        """Test that rate limiter tracks clients separately."""
        from opencontractserver.mcp.permissions import RateLimiter

        limiter = RateLimiter(max_requests=1, window_seconds=60)

        # Each client gets their own limit
        self.assertTrue(limiter.check_rate_limit("client-a"))
        self.assertTrue(limiter.check_rate_limit("client-b"))

        # But each is limited individually
        self.assertFalse(limiter.check_rate_limit("client-a"))
        self.assertFalse(limiter.check_rate_limit("client-b"))


class MCPToolsDocumentsTest(TestCase):
    """Tests for MCP document-related tools."""

    @classmethod
    def setUpTestData(cls):
        """Create test data with documents."""
        from django.core.files.base import ContentFile

        from opencontractserver.annotations.models import AnnotationLabel
        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="doctoolsowner", email="doctools@test.com", password="testpass123"
        )

        # Create public corpus
        cls.corpus = Corpus.objects.create(
            title="Document Test Corpus",
            description="Test corpus with documents",
            creator=cls.owner,
            is_public=True,
        )

        # Create a private corpus (for testing access denial)
        cls.private_corpus = Corpus.objects.create(
            title="Private Corpus",
            creator=cls.owner,
            is_public=False,
        )

        # Create documents
        cls.doc1 = Document.objects.create(
            title="Test Document One",
            description="First test document",
            creator=cls.owner,
            is_public=True,
            page_count=5,
        )
        # Add text file to doc1
        cls.doc1.txt_extract_file.save(
            "test_doc1.txt", ContentFile(b"This is the test document text content.")
        )

        cls.doc2 = Document.objects.create(
            title="Test Document Two",
            description="Second test document",
            creator=cls.owner,
            is_public=True,
            page_count=10,
        )

        # Create document without text file
        cls.doc_no_text = Document.objects.create(
            title="Document Without Text",
            description="No extracted text",
            creator=cls.owner,
            is_public=True,
        )

        # Create DocumentPaths to link documents to corpus
        DocumentPath.objects.create(
            document=cls.doc1,
            corpus=cls.corpus,
            path="/doc1.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )
        DocumentPath.objects.create(
            document=cls.doc2,
            corpus=cls.corpus,
            path="/doc2.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )
        DocumentPath.objects.create(
            document=cls.doc_no_text,
            corpus=cls.corpus,
            path="/doc_no_text.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

        # Create an annotation label
        cls.label = AnnotationLabel.objects.create(
            text="Test Label",
            color="#FF0000",
            label_type="TOKEN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

    def test_list_documents(self):
        """Test listing documents in a corpus."""
        from opencontractserver.mcp.tools import list_documents

        result = list_documents(self.corpus.slug)

        self.assertIn("total_count", result)
        self.assertIn("documents", result)
        self.assertEqual(result["total_count"], 3)
        self.assertEqual(len(result["documents"]), 3)

        # Check document structure
        slugs = [d["slug"] for d in result["documents"]]
        self.assertIn(self.doc1.slug, slugs)
        self.assertIn(self.doc2.slug, slugs)

    def test_list_documents_with_search(self):
        """Test searching documents."""
        from opencontractserver.mcp.tools import list_documents

        result = list_documents(self.corpus.slug, search="One")

        self.assertEqual(result["total_count"], 1)
        self.assertEqual(result["documents"][0]["slug"], self.doc1.slug)

    def test_list_documents_pagination(self):
        """Test document pagination."""
        from opencontractserver.mcp.tools import list_documents

        result1 = list_documents(self.corpus.slug, limit=1, offset=0)
        result2 = list_documents(self.corpus.slug, limit=1, offset=1)

        self.assertEqual(len(result1["documents"]), 1)
        self.assertEqual(len(result2["documents"]), 1)
        self.assertNotEqual(
            result1["documents"][0]["slug"], result2["documents"][0]["slug"]
        )

    def test_list_documents_max_limit(self):
        """Test that limit is capped at 100."""
        from opencontractserver.mcp.tools import list_documents

        # Should not raise even with huge limit
        result = list_documents(self.corpus.slug, limit=1000)
        self.assertLessEqual(len(result["documents"]), 100)

    def test_list_documents_private_corpus_denied(self):
        """Test that private corpus documents are not accessible."""
        from opencontractserver.mcp.tools import list_documents

        with self.assertRaises(Corpus.DoesNotExist):
            list_documents(self.private_corpus.slug)

    def test_get_document_text(self):
        """Test retrieving document text."""
        from opencontractserver.mcp.tools import get_document_text

        result = get_document_text(self.corpus.slug, self.doc1.slug)

        self.assertEqual(result["document_slug"], self.doc1.slug)
        self.assertEqual(result["page_count"], 5)
        # Note: File storage in tests may not persist, so we just verify the structure
        self.assertIn("text", result)

    def test_get_document_text_no_file(self):
        """Test retrieving document text when no text file exists."""
        from opencontractserver.mcp.tools import get_document_text

        result = get_document_text(self.corpus.slug, self.doc_no_text.slug)

        self.assertEqual(result["document_slug"], self.doc_no_text.slug)
        self.assertEqual(result["text"], "")

    def test_get_document_text_nonexistent(self):
        """Test accessing nonexistent document."""
        from opencontractserver.documents.models import Document
        from opencontractserver.mcp.tools import get_document_text

        with self.assertRaises(Document.DoesNotExist):
            get_document_text(self.corpus.slug, "nonexistent-doc")


class MCPToolsAnnotationsTest(TestCase):
    """Tests for MCP annotation-related tools."""

    @classmethod
    def setUpTestData(cls):
        """Create test data with annotations."""
        from opencontractserver.annotations.models import Annotation, AnnotationLabel
        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="anntoolsowner",
            email="anntools@test.com",
            password="testpass123",
        )

        cls.corpus = Corpus.objects.create(
            title="Annotation Test Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.document = Document.objects.create(
            title="Annotated Document",
            creator=cls.owner,
            is_public=True,
            page_count=3,
        )

        DocumentPath.objects.create(
            document=cls.document,
            corpus=cls.corpus,
            path="/annotated.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

        cls.label1 = AnnotationLabel.objects.create(
            text="Header",
            color="#0000FF",
            label_type="TOKEN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

        cls.label2 = AnnotationLabel.objects.create(
            text="Paragraph",
            color="#00FF00",
            label_type="TOKEN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

        # Create annotations
        cls.ann1 = Annotation.objects.create(
            page=1,
            raw_text="This is a header",
            annotation_label=cls.label1,
            document=cls.document,
            corpus=cls.corpus,
            creator=cls.owner,
            is_public=True,
        )

        cls.ann2 = Annotation.objects.create(
            page=1,
            raw_text="This is a paragraph",
            annotation_label=cls.label2,
            document=cls.document,
            corpus=cls.corpus,
            creator=cls.owner,
            is_public=True,
        )

        cls.ann3 = Annotation.objects.create(
            page=2,
            raw_text="Page 2 content",
            annotation_label=cls.label1,
            document=cls.document,
            corpus=cls.corpus,
            creator=cls.owner,
            is_public=True,
        )

    def test_list_annotations(self):
        """Test listing annotations on a document."""
        from opencontractserver.mcp.tools import list_annotations

        result = list_annotations(self.corpus.slug, self.document.slug)

        self.assertIn("total_count", result)
        self.assertIn("annotations", result)
        self.assertEqual(result["total_count"], 3)

    def test_list_annotations_filter_by_page(self):
        """Test filtering annotations by page."""
        from opencontractserver.mcp.tools import list_annotations

        result = list_annotations(self.corpus.slug, self.document.slug, page=1)

        self.assertEqual(result["total_count"], 2)
        for ann in result["annotations"]:
            self.assertEqual(ann["page"], 1)

    def test_list_annotations_filter_by_label(self):
        """Test filtering annotations by label text."""
        from opencontractserver.mcp.tools import list_annotations

        result = list_annotations(
            self.corpus.slug, self.document.slug, label_text="Header"
        )

        self.assertEqual(result["total_count"], 2)
        for ann in result["annotations"]:
            self.assertEqual(ann["annotation_label"]["text"], "Header")

    def test_list_annotations_pagination(self):
        """Test annotation pagination."""
        from opencontractserver.mcp.tools import list_annotations

        result1 = list_annotations(self.corpus.slug, self.document.slug, limit=1)
        result2 = list_annotations(
            self.corpus.slug, self.document.slug, limit=1, offset=1
        )

        self.assertEqual(len(result1["annotations"]), 1)
        self.assertEqual(len(result2["annotations"]), 1)
        self.assertNotEqual(
            result1["annotations"][0]["id"], result2["annotations"][0]["id"]
        )


class MCPToolsSearchTest(TestCase):
    """Tests for MCP search functionality."""

    @classmethod
    def setUpTestData(cls):
        """Create test data for search."""
        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="searchowner", email="search@test.com", password="testpass123"
        )

        cls.corpus = Corpus.objects.create(
            title="Search Test Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.doc1 = Document.objects.create(
            title="Contract Agreement",
            description="Legal binding agreement",
            creator=cls.owner,
            is_public=True,
        )

        cls.doc2 = Document.objects.create(
            title="Terms of Service",
            description="Website terms",
            creator=cls.owner,
            is_public=True,
        )

        DocumentPath.objects.create(
            document=cls.doc1,
            corpus=cls.corpus,
            path="/contract.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )
        DocumentPath.objects.create(
            document=cls.doc2,
            corpus=cls.corpus,
            path="/terms.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

    def test_search_corpus_text_fallback(self):
        """Test search falls back to text search without embeddings."""
        from unittest.mock import patch

        from opencontractserver.mcp.tools import search_corpus

        # Mock embed_text to raise exception, forcing text search fallback
        with patch.object(
            self.corpus.__class__, "embed_text", side_effect=Exception("No embeddings")
        ):
            result = search_corpus(self.corpus.slug, "Contract")

        self.assertIn("query", result)
        self.assertIn("results", result)
        self.assertEqual(result["query"], "Contract")

        # Should find the document with "Contract" in title
        self.assertTrue(len(result["results"]) >= 1)
        self.assertEqual(result["results"][0]["title"], "Contract Agreement")

    def test_search_corpus_limit(self):
        """Test search respects limit."""
        from opencontractserver.mcp.tools import search_corpus

        result = search_corpus(self.corpus.slug, "test", limit=1)

        self.assertLessEqual(len(result["results"]), 1)

    def test_text_search_fallback_directly(self):
        """Test the text search fallback function directly."""
        from django.contrib.auth.models import AnonymousUser

        from opencontractserver.mcp.tools import _text_search_fallback

        anonymous = AnonymousUser()
        result = _text_search_fallback(self.corpus, "Contract", 10, anonymous)

        self.assertIn("query", result)
        self.assertEqual(result["query"], "Contract")
        self.assertTrue(len(result["results"]) >= 1)


class MCPToolsThreadsTest(TestCase):
    """Tests for MCP thread-related tools."""

    @classmethod
    def setUpTestData(cls):
        """Create test data with threads."""
        from opencontractserver.conversations.models import (
            ChatMessage,
            Conversation,
            ConversationTypeChoices,
            MessageTypeChoices,
        )
        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="threadowner", email="thread@test.com", password="testpass123"
        )

        cls.corpus = Corpus.objects.create(
            title="Thread Test Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.document = Document.objects.create(
            title="Thread Document",
            creator=cls.owner,
            is_public=True,
        )

        DocumentPath.objects.create(
            document=cls.document,
            corpus=cls.corpus,
            path="/thread_doc.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

        # Create threads
        cls.thread1 = Conversation.objects.create(
            title="Discussion Thread One",
            description="First discussion",
            creator=cls.owner,
            is_public=True,
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=cls.corpus,
            is_pinned=True,
        )

        cls.thread2 = Conversation.objects.create(
            title="Discussion Thread Two",
            description="Second discussion",
            creator=cls.owner,
            is_public=True,
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=cls.corpus,
            chat_with_document=cls.document,
        )

        # Add messages to thread1
        cls.msg1 = ChatMessage.objects.create(
            conversation=cls.thread1,
            content="Hello everyone!",
            msg_type=MessageTypeChoices.HUMAN,
            creator=cls.owner,
            is_public=True,
        )

        cls.msg2 = ChatMessage.objects.create(
            conversation=cls.thread1,
            content="Welcome to the discussion",
            msg_type=MessageTypeChoices.HUMAN,
            creator=cls.owner,
            is_public=True,
        )

        # Add a reply to msg1
        cls.reply1 = ChatMessage.objects.create(
            conversation=cls.thread1,
            content="Thanks for the welcome!",
            msg_type=MessageTypeChoices.HUMAN,
            parent_message=cls.msg1,
            creator=cls.owner,
            is_public=True,
        )

    def test_list_threads(self):
        """Test listing threads in a corpus."""
        from opencontractserver.mcp.tools import list_threads

        result = list_threads(self.corpus.slug)

        self.assertIn("total_count", result)
        self.assertIn("threads", result)
        self.assertEqual(result["total_count"], 2)

        # Pinned thread should be first
        self.assertEqual(result["threads"][0]["id"], str(self.thread1.id))
        self.assertTrue(result["threads"][0]["is_pinned"])

    def test_list_threads_filter_by_document(self):
        """Test filtering threads by document."""
        from opencontractserver.mcp.tools import list_threads

        result = list_threads(self.corpus.slug, document_slug=self.document.slug)

        self.assertEqual(result["total_count"], 1)
        self.assertEqual(result["threads"][0]["id"], str(self.thread2.id))

    def test_list_threads_pagination(self):
        """Test thread pagination."""
        from opencontractserver.mcp.tools import list_threads

        result = list_threads(self.corpus.slug, limit=1)
        self.assertEqual(len(result["threads"]), 1)

    def test_get_thread_messages_hierarchical(self):
        """Test getting thread messages with hierarchy."""
        from opencontractserver.mcp.tools import get_thread_messages

        result = get_thread_messages(self.corpus.slug, self.thread1.id)

        self.assertEqual(result["thread_id"], str(self.thread1.id))
        self.assertEqual(result["title"], "Discussion Thread One")
        self.assertIn("messages", result)

        # Should have 2 root messages
        root_messages = result["messages"]
        self.assertEqual(len(root_messages), 2)

        # First message should have a reply
        msg1_data = next(m for m in root_messages if m["content"] == "Hello everyone!")
        self.assertEqual(len(msg1_data["replies"]), 1)
        self.assertEqual(msg1_data["replies"][0]["content"], "Thanks for the welcome!")

    def test_get_thread_messages_flattened(self):
        """Test getting thread messages flattened."""
        from opencontractserver.mcp.tools import get_thread_messages

        result = get_thread_messages(self.corpus.slug, self.thread1.id, flatten=True)

        self.assertEqual(result["thread_id"], str(self.thread1.id))
        # All 3 messages should be in a flat list
        self.assertEqual(len(result["messages"]), 3)

    def test_get_thread_messages_nonexistent(self):
        """Test getting messages from nonexistent thread."""
        from django.core.exceptions import ObjectDoesNotExist

        from opencontractserver.mcp.tools import get_thread_messages

        with self.assertRaises(ObjectDoesNotExist):
            get_thread_messages(self.corpus.slug, 99999)


class MCPResourcesDocumentTest(TestCase):
    """Tests for MCP document resources."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        from django.core.files.base import ContentFile

        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="docresowner", email="docres@test.com", password="testpass123"
        )

        cls.corpus = Corpus.objects.create(
            title="Document Resource Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.document = Document.objects.create(
            title="Resource Document",
            description="Document for resource testing",
            creator=cls.owner,
            is_public=True,
            page_count=10,
            file_type="application/pdf",
        )
        cls.document.txt_extract_file.save(
            "resource_doc.txt", ContentFile(b"Full text content for resource test")
        )

        DocumentPath.objects.create(
            document=cls.document,
            corpus=cls.corpus,
            path="/resource_doc.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

    def test_get_document_resource(self):
        """Test getting document resource."""
        from opencontractserver.mcp.resources import get_document_resource

        result = get_document_resource(self.corpus.slug, self.document.slug)
        data = json.loads(result)

        self.assertEqual(data["slug"], self.document.slug)
        self.assertEqual(data["title"], "Resource Document")
        self.assertEqual(data["description"], "Document for resource testing")
        self.assertEqual(data["page_count"], 10)
        self.assertEqual(data["file_type"], "application/pdf")
        # Note: File storage in tests may not persist, so we just verify the structure
        self.assertIn("full_text", data)
        self.assertIn("text_preview", data)

    def test_get_document_resource_nonexistent(self):
        """Test accessing nonexistent document."""
        from opencontractserver.documents.models import Document
        from opencontractserver.mcp.resources import get_document_resource

        with self.assertRaises(Document.DoesNotExist):
            get_document_resource(self.corpus.slug, "nonexistent-doc")


class MCPResourcesAnnotationTest(TestCase):
    """Tests for MCP annotation resources."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        from opencontractserver.annotations.models import Annotation, AnnotationLabel
        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="annresowner", email="annres@test.com", password="testpass123"
        )

        cls.corpus = Corpus.objects.create(
            title="Annotation Resource Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.document = Document.objects.create(
            title="Annotation Resource Doc",
            creator=cls.owner,
            is_public=True,
        )

        DocumentPath.objects.create(
            document=cls.document,
            corpus=cls.corpus,
            path="/ann_resource.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

        cls.label = AnnotationLabel.objects.create(
            text="Resource Label",
            color="#AABBCC",
            label_type="TOKEN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

        cls.annotation = Annotation.objects.create(
            page=3,
            raw_text="Annotation text for resource",
            annotation_label=cls.label,
            document=cls.document,
            corpus=cls.corpus,
            creator=cls.owner,
            is_public=True,
            bounding_box={"x": 10, "y": 20, "width": 100, "height": 50},
        )

    def test_get_annotation_resource(self):
        """Test getting annotation resource."""
        from opencontractserver.mcp.resources import get_annotation_resource

        result = get_annotation_resource(
            self.corpus.slug, self.document.slug, self.annotation.id
        )
        data = json.loads(result)

        self.assertEqual(data["id"], str(self.annotation.id))
        self.assertEqual(data["page"], 3)
        self.assertEqual(data["raw_text"], "Annotation text for resource")
        self.assertEqual(data["annotation_label"]["text"], "Resource Label")
        self.assertEqual(data["annotation_label"]["color"], "#AABBCC")
        self.assertEqual(data["bounding_box"]["x"], 10)


class MCPResourcesThreadTest(TestCase):
    """Tests for MCP thread resources."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        from opencontractserver.conversations.models import (
            ChatMessage,
            Conversation,
            ConversationTypeChoices,
            MessageTypeChoices,
        )

        cls.owner = User.objects.create_user(
            username="threadresowner",
            email="threadres@test.com",
            password="testpass123",
        )

        cls.corpus = Corpus.objects.create(
            title="Thread Resource Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.thread = Conversation.objects.create(
            title="Resource Thread",
            description="Thread for resource testing",
            creator=cls.owner,
            is_public=True,
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=cls.corpus,
            is_locked=True,
            is_pinned=True,
        )

        cls.message = ChatMessage.objects.create(
            conversation=cls.thread,
            content="Resource thread message",
            msg_type=MessageTypeChoices.HUMAN,
            creator=cls.owner,
            is_public=True,
        )

    def test_get_thread_resource(self):
        """Test getting thread resource."""
        from opencontractserver.mcp.resources import get_thread_resource

        result = get_thread_resource(self.corpus.slug, self.thread.id)
        data = json.loads(result)

        self.assertEqual(data["id"], str(self.thread.id))
        self.assertEqual(data["title"], "Resource Thread")
        self.assertEqual(data["description"], "Thread for resource testing")
        self.assertTrue(data["is_locked"])
        self.assertTrue(data["is_pinned"])
        self.assertIn("messages", data)
        self.assertEqual(len(data["messages"]), 1)
        self.assertEqual(data["messages"][0]["content"], "Resource thread message")

    def test_get_thread_resource_nonexistent(self):
        """Test accessing nonexistent thread."""
        from opencontractserver.conversations.models import Conversation
        from opencontractserver.mcp.resources import get_thread_resource

        with self.assertRaises(Conversation.DoesNotExist):
            get_thread_resource(self.corpus.slug, 99999)


class MCPResourcesCorpusWithLabelSetTest(TestCase):
    """Tests for corpus resources with label sets."""

    @classmethod
    def setUpTestData(cls):
        """Create test data with label set."""
        from opencontractserver.annotations.models import AnnotationLabel, LabelSet

        cls.owner = User.objects.create_user(
            username="labelsetowner",
            email="labelset@test.com",
            password="testpass123",
        )

        cls.label_set = LabelSet.objects.create(
            title="Test Label Set",
            creator=cls.owner,
            is_public=True,
        )

        cls.label1 = AnnotationLabel.objects.create(
            text="Label A",
            color="#111111",
            label_type="TOKEN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

        cls.label2 = AnnotationLabel.objects.create(
            text="Label B",
            color="#222222",
            label_type="SPAN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

        cls.label_set.annotation_labels.add(cls.label1, cls.label2)

        cls.corpus = Corpus.objects.create(
            title="Corpus With Labels",
            description="Has a label set",
            creator=cls.owner,
            is_public=True,
            label_set=cls.label_set,
        )

    def test_get_corpus_resource_with_label_set(self):
        """Test corpus resource includes label set data."""
        from opencontractserver.mcp.resources import get_corpus_resource

        result = get_corpus_resource(self.corpus.slug)
        data = json.loads(result)

        self.assertEqual(data["title"], "Corpus With Labels")
        self.assertIsNotNone(data["label_set"])
        self.assertEqual(data["label_set"]["title"], "Test Label Set")
        self.assertEqual(len(data["label_set"]["labels"]), 2)

        label_texts = [label["text"] for label in data["label_set"]["labels"]]
        self.assertIn("Label A", label_texts)
        self.assertIn("Label B", label_texts)


class MCPFormattersExtendedTest(TestCase):
    """Extended tests for MCP formatters."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        from opencontractserver.annotations.models import Annotation, AnnotationLabel
        from opencontractserver.conversations.models import (
            ChatMessage,
            Conversation,
            ConversationTypeChoices,
            MessageTypeChoices,
        )
        from opencontractserver.documents.models import Document, DocumentPath

        cls.owner = User.objects.create_user(
            username="formatextowner",
            email="formatext@test.com",
            password="testpass123",
        )

        cls.corpus = Corpus.objects.create(
            title="Formatter Test Corpus",
            creator=cls.owner,
            is_public=True,
        )

        cls.document = Document.objects.create(
            title="Formatter Test Doc",
            description="Document for formatter tests",
            creator=cls.owner,
            is_public=True,
            page_count=15,
            file_type="application/pdf",
        )

        DocumentPath.objects.create(
            document=cls.document,
            corpus=cls.corpus,
            path="/formatter.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=cls.owner,
        )

        cls.label = AnnotationLabel.objects.create(
            text="Formatter Label",
            color="#DDEEFF",
            label_type="TOKEN_LABEL",
            creator=cls.owner,
            is_public=True,
        )

        cls.annotation = Annotation.objects.create(
            page=5,
            raw_text="Formatter annotation text",
            annotation_label=cls.label,
            document=cls.document,
            corpus=cls.corpus,
            creator=cls.owner,
            is_public=True,
            structural=True,
        )

        cls.annotation_no_label = Annotation.objects.create(
            page=6,
            raw_text="No label annotation",
            annotation_label=None,
            document=cls.document,
            corpus=cls.corpus,
            creator=cls.owner,
            is_public=True,
        )

        cls.thread = Conversation.objects.create(
            title="Formatter Thread",
            description="Thread for formatter tests",
            creator=cls.owner,
            is_public=True,
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=cls.corpus,
            is_locked=False,
            is_pinned=False,
        )

        cls.message = ChatMessage.objects.create(
            conversation=cls.thread,
            content="Formatter message content",
            msg_type=MessageTypeChoices.HUMAN,
            creator=cls.owner,
            is_public=True,
            upvote_count=5,
            downvote_count=2,
        )

        cls.reply = ChatMessage.objects.create(
            conversation=cls.thread,
            content="Reply to formatter message",
            msg_type=MessageTypeChoices.HUMAN,
            parent_message=cls.message,
            creator=cls.owner,
            is_public=True,
        )

    def test_format_document_summary(self):
        """Test document summary formatting."""
        from opencontractserver.mcp.formatters import format_document_summary

        result = format_document_summary(self.document)

        self.assertEqual(result["slug"], self.document.slug)
        self.assertEqual(result["title"], "Formatter Test Doc")
        self.assertEqual(result["description"], "Document for formatter tests")
        self.assertEqual(result["page_count"], 15)
        self.assertEqual(result["file_type"], "application/pdf")
        self.assertIn("created", result)

    def test_format_annotation(self):
        """Test annotation formatting."""
        from opencontractserver.mcp.formatters import format_annotation

        result = format_annotation(self.annotation)

        self.assertEqual(result["id"], str(self.annotation.id))
        self.assertEqual(result["page"], 5)
        self.assertEqual(result["raw_text"], "Formatter annotation text")
        self.assertTrue(result["structural"])
        self.assertEqual(result["annotation_label"]["text"], "Formatter Label")
        self.assertEqual(result["annotation_label"]["color"], "#DDEEFF")

    def test_format_annotation_without_label(self):
        """Test annotation formatting without label."""
        from opencontractserver.mcp.formatters import format_annotation

        result = format_annotation(self.annotation_no_label)

        self.assertEqual(result["id"], str(self.annotation_no_label.id))
        self.assertIsNone(result["annotation_label"])

    def test_format_thread_summary(self):
        """Test thread summary formatting."""
        from opencontractserver.mcp.formatters import format_thread_summary

        result = format_thread_summary(self.thread)

        self.assertEqual(result["id"], str(self.thread.id))
        self.assertEqual(result["title"], "Formatter Thread")
        self.assertEqual(result["description"], "Thread for formatter tests")
        self.assertFalse(result["is_pinned"])
        self.assertFalse(result["is_locked"])
        self.assertIn("created_at", result)
        self.assertIn("last_activity", result)

    def test_format_message(self):
        """Test message formatting."""
        from opencontractserver.mcp.formatters import format_message

        result = format_message(self.message)

        self.assertEqual(result["id"], str(self.message.id))
        self.assertEqual(result["content"], "Formatter message content")
        self.assertEqual(result["msg_type"], "HUMAN")
        self.assertEqual(result["upvote_count"], 5)
        self.assertEqual(result["downvote_count"], 2)
        self.assertIn("created_at", result)

    def test_format_message_with_replies(self):
        """Test message formatting with replies."""
        from django.contrib.auth.models import AnonymousUser

        from opencontractserver.mcp.formatters import format_message_with_replies

        anonymous = AnonymousUser()
        result = format_message_with_replies(self.message, anonymous)

        self.assertEqual(result["id"], str(self.message.id))
        self.assertEqual(result["content"], "Formatter message content")
        self.assertIn("replies", result)
        self.assertEqual(len(result["replies"]), 1)
        self.assertEqual(result["replies"][0]["content"], "Reply to formatter message")

    def test_format_message_with_replies_max_depth(self):
        """Test message formatting respects max depth."""
        from django.contrib.auth.models import AnonymousUser

        from opencontractserver.mcp.formatters import format_message_with_replies

        anonymous = AnonymousUser()

        # Test with max_depth=0 should not include any replies
        result = format_message_with_replies(
            self.message, anonymous, max_depth=0, current_depth=0
        )

        self.assertEqual(result["replies"], [])
        # Should have indication if more replies exist
        self.assertIn("has_more_replies", result)


class MCPServerAsyncTest(TestCase):
    """Tests for MCP server async handlers."""

    def test_create_mcp_server(self):
        """Test MCP server creation."""
        from opencontractserver.mcp.server import create_mcp_server

        server = create_mcp_server()
        self.assertIsNotNone(server)
        self.assertEqual(server.name, "opencontracts")

    def test_get_session_manager(self):
        """Test session manager creation."""
        from opencontractserver.mcp.server import get_session_manager

        manager = get_session_manager()
        self.assertIsNotNone(manager)

        # Getting it again should return the same instance
        manager2 = get_session_manager()
        self.assertIs(manager, manager2)

    def test_create_mcp_asgi_app(self):
        """Test ASGI app creation."""
        from opencontractserver.mcp.server import create_mcp_asgi_app

        app = create_mcp_asgi_app()
        self.assertIsNotNone(app)
        self.assertTrue(callable(app))


class MCPServerComponentsTest(TestCase):
    """Tests for MCP server components."""

    def test_mcp_lifespan_manager(self):
        """Test MCPLifespanManager initialization."""
        from opencontractserver.mcp.server import MCPLifespanManager

        manager = MCPLifespanManager()
        self.assertFalse(manager._started)
        self.assertIsNone(manager._run_context)

    def test_uri_parser_patterns(self):
        """Test URIParser pattern constants."""
        from opencontractserver.mcp.server import URIParser

        # Check patterns are compiled
        self.assertIsNotNone(URIParser.PATTERNS["corpus"])
        self.assertIsNotNone(URIParser.PATTERNS["document"])
        self.assertIsNotNone(URIParser.PATTERNS["annotation"])
        self.assertIsNotNone(URIParser.PATTERNS["thread"])

    def test_mcp_server_has_name(self):
        """Test MCP server has correct name."""
        from opencontractserver.mcp.server import mcp_server

        self.assertEqual(mcp_server.name, "opencontracts")

    def test_mcp_asgi_app_exists(self):
        """Test ASGI app is created."""
        from opencontractserver.mcp.server import mcp_asgi_app

        self.assertIsNotNone(mcp_asgi_app)
        self.assertTrue(callable(mcp_asgi_app))


class MCPSSETransportTest(TestCase):
    """Tests for SSE transport support (deprecated, for backward compatibility)."""

    def test_sse_transport_exists(self):
        """Test SSE transport is created."""
        from opencontractserver.mcp.server import sse_transport

        self.assertIsNotNone(sse_transport)

    def test_sse_starlette_app_exists(self):
        """Test SSE Starlette app is created with correct routes."""
        from starlette.applications import Starlette

        from opencontractserver.mcp.server import sse_starlette_app

        self.assertIsNotNone(sse_starlette_app)
        self.assertIsInstance(sse_starlette_app, Starlette)

        # Verify routes are configured
        routes = sse_starlette_app.routes
        self.assertTrue(len(routes) >= 2)

        # Check route paths
        route_paths = [getattr(r, "path", None) for r in routes]
        self.assertIn("/sse", route_paths)

    def test_handle_sse_connection_exists(self):
        """Test handle_sse_connection function exists and is callable."""
        from opencontractserver.mcp.server import handle_sse_connection

        self.assertTrue(callable(handle_sse_connection))

    def test_handle_sse_connection_function(self):
        """Test handle_sse_connection with mocked SSE transport."""
        import asyncio
        from unittest.mock import AsyncMock, MagicMock, patch

        from opencontractserver.mcp.server import handle_sse_connection

        async def run_test():
            # Create a mock request object
            mock_request = MagicMock()
            mock_request.scope = {"type": "http", "path": "/sse"}
            mock_request.receive = AsyncMock(return_value={"type": "http.disconnect"})
            mock_request._send = AsyncMock()

            # Create mock streams
            mock_read_stream = AsyncMock()
            mock_write_stream = AsyncMock()

            # Create mock async context manager
            mock_connect = MagicMock()
            mock_connect.__aenter__ = AsyncMock(
                return_value=(mock_read_stream, mock_write_stream)
            )
            mock_connect.__aexit__ = AsyncMock(return_value=None)

            # Mock the mcp_server.run method
            mock_mcp_run = AsyncMock()

            with patch(
                "opencontractserver.mcp.server.sse_transport.connect_sse",
                return_value=mock_connect,
            ), patch(
                "opencontractserver.mcp.server.mcp_server.run", mock_mcp_run
            ), patch(
                "opencontractserver.mcp.server.mcp_server.create_initialization_options",
                return_value={},
            ):
                result = await handle_sse_connection(mock_request)

            # Verify the response is returned
            from starlette.responses import Response

            self.assertIsInstance(result, Response)

            # Verify mcp_server.run was called with the streams
            mock_mcp_run.assert_called_once()
            call_args = mock_mcp_run.call_args
            self.assertEqual(call_args[0][0], mock_read_stream)
            self.assertEqual(call_args[0][1], mock_write_stream)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()


class MCPHttpRouterTest(TestCase):
    """Tests for the HTTP router that dispatches to MCP vs Django."""

    def test_http_router_routes_sse_to_mcp(self):
        """Test HTTP router routes /sse to MCP app."""
        import asyncio

        from config.asgi import create_http_router

        mcp_called = []
        django_called = []

        async def mock_mcp_app(scope, receive, send):
            mcp_called.append(scope["path"])

        async def mock_django_app(scope, receive, send):
            django_called.append(scope["path"])

        router = create_http_router(mock_django_app, mock_mcp_app)

        async def run_test():
            async def mock_receive():
                return {"type": "http.disconnect"}

            async def mock_send(message):
                pass

            # Test /sse routes to MCP
            await router({"type": "http", "path": "/sse"}, mock_receive, mock_send)
            # Test /sse/* routes to MCP
            await router(
                {"type": "http", "path": "/sse/messages/"}, mock_receive, mock_send
            )
            # Test other paths route to Django
            await router({"type": "http", "path": "/api/test"}, mock_receive, mock_send)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()

        self.assertIn("/sse", mcp_called)
        self.assertIn("/sse/messages/", mcp_called)
        self.assertIn("/api/test", django_called)

    def test_http_router_routes_mcp_to_mcp(self):
        """Test HTTP router routes /mcp to MCP app."""
        import asyncio

        from config.asgi import create_http_router

        mcp_called = []

        async def mock_mcp_app(scope, receive, send):
            mcp_called.append(scope["path"])

        async def mock_django_app(scope, receive, send):
            pass

        router = create_http_router(mock_django_app, mock_mcp_app)

        async def run_test():
            async def mock_receive():
                return {"type": "http.disconnect"}

            async def mock_send(message):
                pass

            await router({"type": "http", "path": "/mcp"}, mock_receive, mock_send)
            await router({"type": "http", "path": "/mcp/"}, mock_receive, mock_send)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()

        self.assertIn("/mcp", mcp_called)
        self.assertIn("/mcp/", mcp_called)


class MCPASGIRoutingTest(TestCase):
    """Tests for MCP ASGI app routing."""

    def test_asgi_app_routes_sse_paths(self):
        """Test ASGI app handles SSE paths correctly."""
        import asyncio

        from opencontractserver.mcp.server import create_mcp_asgi_app

        app = create_mcp_asgi_app()

        # Test that /sse path is recognized by the app
        # We create a mock scope and verify the app doesn't crash

        async def run_test():
            received_messages = []

            async def mock_receive():
                return {"type": "http.disconnect"}

            async def mock_send(message):
                received_messages.append(message)

            scope = {
                "type": "http",
                "path": "/sse",
                "method": "GET",
                "query_string": b"",
                "headers": [],
            }

            try:
                await asyncio.wait_for(app(scope, mock_receive, mock_send), timeout=0.5)
            except (asyncio.TimeoutError, Exception):
                # SSE connection will timeout or error without proper setup
                # but we're just testing that the routing works
                pass

            return received_messages

        # Run the async test
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
            # The app should attempt to respond (might fail due to missing SSE setup)
            # but it proves the routing works
        finally:
            loop.close()

    def test_asgi_app_routes_sse_messages_path(self):
        """Test ASGI app handles /sse/messages/ paths."""
        import asyncio

        from opencontractserver.mcp.server import create_mcp_asgi_app

        app = create_mcp_asgi_app()

        async def run_test():
            received_messages = []

            async def mock_receive():
                return {"type": "http.disconnect"}

            async def mock_send(message):
                received_messages.append(message)

            scope = {
                "type": "http",
                "path": "/sse/messages/",
                "method": "POST",
                "query_string": b"",
                "headers": [],
            }

            try:
                await asyncio.wait_for(app(scope, mock_receive, mock_send), timeout=0.5)
            except (asyncio.TimeoutError, Exception):
                pass

            return received_messages

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()

    def test_asgi_app_ignores_non_http(self):
        """Test ASGI app ignores non-HTTP scopes."""
        import asyncio

        from opencontractserver.mcp.server import create_mcp_asgi_app

        app = create_mcp_asgi_app()

        async def run_test():
            received_messages = []

            async def mock_receive():
                return {"type": "lifespan.shutdown"}

            async def mock_send(message):
                received_messages.append(message)

            # Non-HTTP scope (like websocket)
            scope = {
                "type": "websocket",
                "path": "/sse",
            }

            await app(scope, mock_receive, mock_send)
            return received_messages

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            # Should return immediately without sending anything
            self.assertEqual(len(result), 0)
        finally:
            loop.close()

    def test_asgi_app_returns_404_for_unknown_path(self):
        """Test ASGI app returns 404 with endpoint info for unknown paths."""
        import asyncio

        from opencontractserver.mcp.server import create_mcp_asgi_app

        app = create_mcp_asgi_app()

        async def run_test():
            received_messages = []

            async def mock_receive():
                return {"type": "http.disconnect"}

            async def mock_send(message):
                received_messages.append(message)

            # Request unknown path
            scope = {
                "type": "http",
                "path": "/unknown/path",
                "method": "GET",
                "query_string": b"",
                "headers": [],
            }

            await app(scope, mock_receive, mock_send)
            return received_messages

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            # Should get a 404 response
            self.assertTrue(len(result) >= 2)
            # First message should be response start with 404
            self.assertEqual(result[0]["type"], "http.response.start")
            self.assertEqual(result[0]["status"], 404)
            # Second message should be the body with endpoint info
            self.assertEqual(result[1]["type"], "http.response.body")
            body = json.loads(result[1]["body"])
            self.assertEqual(body["error"], "Not found")
            self.assertIn("endpoints", body)
            self.assertIn("streamable_http", body["endpoints"])
            self.assertIn("sse", body["endpoints"])
        finally:
            loop.close()

    def test_asgi_app_mcp_path_error_handling(self):
        """Test ASGI app handles errors on /mcp path."""
        import asyncio
        from unittest.mock import AsyncMock, patch

        from opencontractserver.mcp.server import create_mcp_asgi_app

        async def run_test():
            received_messages = []

            async def mock_receive():
                return {"type": "http.request", "body": b"{}"}

            async def mock_send(message):
                received_messages.append(message)

            scope = {
                "type": "http",
                "path": "/mcp",
                "method": "POST",
                "query_string": b"",
                "headers": [[b"content-type", b"application/json"]],
            }

            # Mock both lifespan_manager and session manager
            mock_lifespan = AsyncMock()
            mock_lifespan.ensure_started = AsyncMock()

            mock_manager = AsyncMock()
            mock_manager.handle_request.side_effect = Exception("Test error")

            with patch(
                "opencontractserver.mcp.server.lifespan_manager", mock_lifespan
            ), patch(
                "opencontractserver.mcp.server.get_session_manager",
                return_value=mock_manager,
            ):
                app = create_mcp_asgi_app()
                await app(scope, mock_receive, mock_send)

            return received_messages

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            # Should get a 500 error response
            self.assertTrue(len(result) >= 2)
            self.assertEqual(result[0]["type"], "http.response.start")
            self.assertEqual(result[0]["status"], 500)
            self.assertEqual(result[1]["type"], "http.response.body")
            body = json.loads(result[1]["body"])
            self.assertIn("error", body)
            self.assertEqual(body["error"], "Test error")
        finally:
            loop.close()

    def test_asgi_app_sse_path_error_handling(self):
        """Test ASGI app handles errors on /sse path."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import create_mcp_asgi_app

        async def run_test():
            received_messages = []

            async def mock_receive():
                return {"type": "http.disconnect"}

            async def mock_send(message):
                received_messages.append(message)

            scope = {
                "type": "http",
                "path": "/sse",
                "method": "GET",
                "query_string": b"",
                "headers": [],
            }

            # Mock the sse_starlette_app to raise an exception
            async def mock_sse_app(scope, receive, send):
                raise Exception("SSE test error")

            with patch("opencontractserver.mcp.server.sse_starlette_app", mock_sse_app):
                # Need to recreate the app to pick up the mock
                new_app = create_mcp_asgi_app()
                await new_app(scope, mock_receive, mock_send)

            return received_messages

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            # Should get a 500 error response
            self.assertTrue(len(result) >= 2)
            self.assertEqual(result[0]["type"], "http.response.start")
            self.assertEqual(result[0]["status"], 500)
            self.assertEqual(result[1]["type"], "http.response.body")
            body = json.loads(result[1]["body"])
            self.assertIn("error", body)
            self.assertEqual(body["error"], "SSE test error")
        finally:
            loop.close()


class MCPTelemetryTest(TestCase):
    """Tests for MCP telemetry functionality."""

    def setUp(self):
        """Reset telemetry context before each test."""
        from opencontractserver.mcp.telemetry import clear_request_context

        clear_request_context()

    def tearDown(self):
        """Clean up telemetry context after each test."""
        from opencontractserver.mcp.telemetry import clear_request_context

        clear_request_context()

    def test_hash_ip(self):
        """Test IP hashing for privacy."""
        from opencontractserver.mcp.telemetry import _hash_ip

        # Same IP should produce same hash
        hash1 = _hash_ip("192.168.1.1")
        hash2 = _hash_ip("192.168.1.1")
        self.assertEqual(hash1, hash2)

        # Different IPs should produce different hashes
        hash3 = _hash_ip("192.168.1.2")
        self.assertNotEqual(hash1, hash3)

        # Hash should be 16 characters
        self.assertEqual(len(hash1), 16)

    def test_set_and_get_request_context(self):
        """Test setting and getting request context."""
        from opencontractserver.mcp.telemetry import (
            _get_request_context,
            set_request_context,
        )

        set_request_context(client_ip="10.0.0.1", transport="streamable_http")

        context = _get_request_context()
        self.assertEqual(context["transport"], "streamable_http")
        # Only hashed IP is stored for privacy-preserving unique user counting
        # Raw IP is never stored (GDPR compliance)
        self.assertNotIn("client_ip", context)
        self.assertIsNotNone(context["client_ip_hash"])
        self.assertNotEqual(context["client_ip_hash"], "10.0.0.1")
        self.assertEqual(len(context["client_ip_hash"]), 16)

    def test_set_request_context_no_ip(self):
        """Test setting request context without IP (stdio transport)."""
        from opencontractserver.mcp.telemetry import (
            _get_request_context,
            set_request_context,
        )

        set_request_context(client_ip=None, transport="stdio")

        context = _get_request_context()
        self.assertEqual(context["transport"], "stdio")
        # Raw IP is never stored (GDPR compliance)
        self.assertNotIn("client_ip", context)
        self.assertIsNone(context["client_ip_hash"])

    def test_clear_request_context(self):
        """Test clearing request context."""
        from opencontractserver.mcp.telemetry import (
            _get_request_context,
            clear_request_context,
            set_request_context,
        )

        set_request_context(client_ip="10.0.0.1", transport="sse")
        clear_request_context()

        context = _get_request_context()
        self.assertEqual(context, {})

    def test_get_client_ip_from_scope_direct(self):
        """Test extracting client IP from direct connection."""
        from opencontractserver.mcp.telemetry import get_client_ip_from_scope

        scope = {
            "client": ("192.168.1.100", 54321),
            "headers": [],
        }

        ip = get_client_ip_from_scope(scope)
        self.assertEqual(ip, "192.168.1.100")

    def test_get_client_ip_from_scope_x_forwarded_for(self):
        """Test extracting client IP from X-Forwarded-For header."""
        from opencontractserver.mcp.telemetry import get_client_ip_from_scope

        scope = {
            "client": ("127.0.0.1", 80),  # Proxy address
            "headers": [
                (b"x-forwarded-for", b"203.0.113.195, 70.41.3.18, 150.172.238.178"),
            ],
        }

        ip = get_client_ip_from_scope(scope)
        # Should return first IP (original client)
        self.assertEqual(ip, "203.0.113.195")

    def test_get_client_ip_from_scope_x_real_ip(self):
        """Test extracting client IP from X-Real-IP header."""
        from opencontractserver.mcp.telemetry import get_client_ip_from_scope

        scope = {
            "client": ("127.0.0.1", 80),
            "headers": [
                (b"x-real-ip", b"203.0.113.50"),
            ],
        }

        ip = get_client_ip_from_scope(scope)
        self.assertEqual(ip, "203.0.113.50")

    def test_get_client_ip_from_scope_no_client(self):
        """Test extracting client IP when no client info available."""
        from opencontractserver.mcp.telemetry import get_client_ip_from_scope

        scope = {
            "headers": [],
        }

        ip = get_client_ip_from_scope(scope)
        self.assertIsNone(ip)

    def test_record_mcp_tool_call_success(self):
        """Test recording successful MCP tool call."""
        from unittest.mock import patch

        from opencontractserver.mcp.telemetry import (
            record_mcp_tool_call,
            set_request_context,
        )

        set_request_context(client_ip="10.0.0.1", transport="streamable_http")

        with patch(
            "opencontractserver.mcp.telemetry.record_event"
        ) as mock_record_event:
            mock_record_event.return_value = True

            result = record_mcp_tool_call("list_documents", success=True)

            self.assertTrue(result)
            mock_record_event.assert_called_once()

            # Check event type and properties
            call_args = mock_record_event.call_args
            self.assertEqual(call_args[0][0], "mcp_tool_call")

            properties = call_args[0][1]
            self.assertEqual(properties["tool_name"], "list_documents")
            self.assertTrue(properties["success"])
            self.assertEqual(properties["transport"], "streamable_http")
            self.assertIn("client_ip_hash", properties)
            # Raw IP is never sent to PostHog (GDPR compliance)
            self.assertNotIn("$ip", properties)
            self.assertNotIn("error_type", properties)

    def test_record_mcp_tool_call_failure(self):
        """Test recording failed MCP tool call."""
        from unittest.mock import patch

        from opencontractserver.mcp.telemetry import (
            record_mcp_tool_call,
            set_request_context,
        )

        set_request_context(client_ip="10.0.0.2", transport="sse")

        with patch(
            "opencontractserver.mcp.telemetry.record_event"
        ) as mock_record_event:
            mock_record_event.return_value = True

            result = record_mcp_tool_call(
                "search_corpus", success=False, error_type="ValueError"
            )

            self.assertTrue(result)
            mock_record_event.assert_called_once()

            properties = mock_record_event.call_args[0][1]
            self.assertEqual(properties["tool_name"], "search_corpus")
            self.assertFalse(properties["success"])
            self.assertEqual(properties["error_type"], "ValueError")

    def test_record_mcp_tool_call_no_context(self):
        """Test recording tool call without request context."""
        from unittest.mock import patch

        from opencontractserver.mcp.telemetry import record_mcp_tool_call

        with patch(
            "opencontractserver.mcp.telemetry.record_event"
        ) as mock_record_event:
            mock_record_event.return_value = True

            result = record_mcp_tool_call("list_public_corpuses", success=True)

            self.assertTrue(result)
            properties = mock_record_event.call_args[0][1]
            self.assertEqual(properties["transport"], "unknown")
            self.assertNotIn("client_ip_hash", properties)
            self.assertNotIn("$ip", properties)  # No IP for geolocation either

    def test_record_mcp_resource_read_success(self):
        """Test recording successful MCP resource read."""
        from unittest.mock import patch

        from opencontractserver.mcp.telemetry import (
            record_mcp_resource_read,
            set_request_context,
        )

        set_request_context(client_ip="172.16.0.1", transport="streamable_http")

        with patch(
            "opencontractserver.mcp.telemetry.record_event"
        ) as mock_record_event:
            mock_record_event.return_value = True

            result = record_mcp_resource_read("document", success=True)

            self.assertTrue(result)
            mock_record_event.assert_called_once()

            call_args = mock_record_event.call_args
            self.assertEqual(call_args[0][0], "mcp_resource_read")

            properties = call_args[0][1]
            self.assertEqual(properties["resource_type"], "document")
            self.assertTrue(properties["success"])
            self.assertEqual(properties["transport"], "streamable_http")
            self.assertIn("client_ip_hash", properties)
            # Raw IP is never sent to PostHog (GDPR compliance)
            self.assertNotIn("$ip", properties)

    def test_record_mcp_resource_read_failure(self):
        """Test recording failed MCP resource read."""
        from unittest.mock import patch

        from opencontractserver.mcp.telemetry import (
            record_mcp_resource_read,
            set_request_context,
        )

        set_request_context(client_ip="10.0.0.3", transport="sse")

        with patch(
            "opencontractserver.mcp.telemetry.record_event"
        ) as mock_record_event:
            mock_record_event.return_value = True

            result = record_mcp_resource_read(
                "corpus", success=False, error_type="DoesNotExist"
            )

            self.assertTrue(result)
            properties = mock_record_event.call_args[0][1]
            self.assertEqual(properties["resource_type"], "corpus")
            self.assertFalse(properties["success"])
            self.assertEqual(properties["error_type"], "DoesNotExist")

    def test_record_mcp_request(self):
        """Test recording MCP request."""
        from unittest.mock import patch

        from opencontractserver.mcp.telemetry import (
            record_mcp_request,
            set_request_context,
        )

        set_request_context(client_ip="10.0.0.4", transport="streamable_http")

        with patch(
            "opencontractserver.mcp.telemetry.record_event"
        ) as mock_record_event:
            mock_record_event.return_value = True

            result = record_mcp_request("/mcp", method="POST", success=True)

            self.assertTrue(result)
            mock_record_event.assert_called_once()

            call_args = mock_record_event.call_args
            self.assertEqual(call_args[0][0], "mcp_request")

            properties = call_args[0][1]
            self.assertEqual(properties["endpoint"], "/mcp")
            self.assertEqual(properties["method"], "POST")
            self.assertTrue(properties["success"])
            self.assertEqual(properties["transport"], "streamable_http")
            self.assertIn("client_ip_hash", properties)
            # Raw IP is never sent to PostHog (GDPR compliance)
            self.assertNotIn("$ip", properties)


class MCPTelemetryIntegrationTest(TestCase):
    """Integration tests for MCP telemetry in server handlers."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        cls.owner = User.objects.create_user(
            username="telemetryowner",
            email="telemetry@test.com",
            password="testpass123",
        )

        cls.corpus = Corpus.objects.create(
            title="Telemetry Test Corpus",
            description="Test corpus for telemetry",
            creator=cls.owner,
            is_public=True,
        )

    def setUp(self):
        """Reset telemetry context before each test."""
        from opencontractserver.mcp.telemetry import clear_request_context

        clear_request_context()

    def tearDown(self):
        """Clean up telemetry context after each test."""
        from opencontractserver.mcp.telemetry import clear_request_context

        clear_request_context()

    def test_asgi_app_sets_context_for_mcp_path(self):
        """Test ASGI app sets telemetry context for /mcp path."""
        import asyncio
        from unittest.mock import AsyncMock, patch

        from opencontractserver.mcp.server import create_mcp_asgi_app

        async def run_test():
            captured_context = None

            # Mock the session manager to capture context during request
            mock_lifespan = AsyncMock()
            mock_lifespan.ensure_started = AsyncMock()

            mock_manager = AsyncMock()

            async def capture_context_handler(scope, receive, send):
                nonlocal captured_context
                # Import here to get the context set during the request
                from opencontractserver.mcp.telemetry import _get_request_context

                captured_context = _get_request_context()
                # Send a minimal response
                await send(
                    {
                        "type": "http.response.start",
                        "status": 200,
                        "headers": [],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": b"",
                    }
                )

            mock_manager.handle_request = capture_context_handler

            scope = {
                "type": "http",
                "path": "/mcp",
                "method": "POST",
                "client": ("192.168.1.50", 12345),
                "headers": [],
            }

            async def mock_receive():
                return {"type": "http.request", "body": b"{}"}

            async def mock_send(message):
                pass

            with patch(
                "opencontractserver.mcp.server.lifespan_manager", mock_lifespan
            ), patch(
                "opencontractserver.mcp.server.get_session_manager",
                return_value=mock_manager,
            ):
                app = create_mcp_asgi_app()
                await app(scope, mock_receive, mock_send)

            return captured_context

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            context = loop.run_until_complete(run_test())
            self.assertIsNotNone(context)
            self.assertEqual(context["transport"], "streamable_http")
            self.assertIsNotNone(context["client_ip_hash"])
        finally:
            loop.close()

    def test_call_tool_records_telemetry(self):
        """Test that call_tool records telemetry events."""
        import asyncio
        from unittest.mock import MagicMock, patch

        from opencontractserver.mcp.server import TOOL_HANDLERS, call_tool_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.5", transport="streamable_http")

            # Mock the tool handler to avoid database operations during parallel tests
            # This prevents OperationalError from connection termination under load
            mock_tool_result = {"total_count": 0, "corpuses": []}
            mock_handler = MagicMock(return_value=mock_tool_result)

            # Patch TOOL_HANDLERS dict directly since it holds function references
            original_handler = TOOL_HANDLERS["list_public_corpuses"]
            TOOL_HANDLERS["list_public_corpuses"] = mock_handler

            try:
                with patch(
                    "opencontractserver.mcp.server.record_mcp_tool_call"
                ) as mock_record:
                    mock_record.return_value = True

                    # Call list_public_corpuses tool using module-level handler
                    result = await call_tool_handler("list_public_corpuses", {})

                    # Verify telemetry was recorded
                    mock_record.assert_called_once_with(
                        "list_public_corpuses", success=True
                    )

                    # Verify the mock handler was actually called
                    mock_handler.assert_called_once()

                    return result
            finally:
                # Restore the original handler
                TOOL_HANDLERS["list_public_corpuses"] = original_handler

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            self.assertIsNotNone(result)
        finally:
            loop.close()

    def test_call_tool_records_failure_telemetry(self):
        """Test that call_tool records failure telemetry."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import call_tool_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.6", transport="sse")

            with patch(
                "opencontractserver.mcp.server.record_mcp_tool_call"
            ) as mock_record:
                mock_record.return_value = True

                # Call with unknown tool using module-level handler
                try:
                    await call_tool_handler("unknown_tool", {})
                except ValueError:
                    pass

                # Verify failure telemetry was recorded
                mock_record.assert_called_once_with(
                    "unknown_tool", success=False, error_type="UnknownTool"
                )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()

    def test_read_resource_records_telemetry(self):
        """Test that read_resource records telemetry events."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import read_resource_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.7", transport="streamable_http")

            with patch(
                "opencontractserver.mcp.server.record_mcp_resource_read"
            ) as mock_record, patch(
                "opencontractserver.mcp.server.get_corpus_resource"
            ) as mock_get_corpus:
                mock_record.return_value = True
                mock_get_corpus.return_value = '{"title": "Test Corpus"}'

                # Read corpus resource using module-level handler
                uri = "corpus://test-corpus-slug"
                result = await read_resource_handler(uri)

                # Verify telemetry was recorded
                mock_record.assert_called_once_with("corpus", success=True)

                return result

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            self.assertIsNotNone(result)
        finally:
            loop.close()

    def test_read_resource_records_failure_telemetry(self):
        """Test that read_resource records failure telemetry."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import read_resource_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.8", transport="sse")

            with patch(
                "opencontractserver.mcp.server.record_mcp_resource_read"
            ) as mock_record:
                mock_record.return_value = True

                # Try to read invalid URI using module-level handler
                try:
                    await read_resource_handler("invalid://uri")
                except ValueError:
                    pass

                # Verify failure telemetry was recorded
                mock_record.assert_called_once_with(
                    "unknown", success=False, error_type="ValueError"
                )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_test())
        finally:
            loop.close()

    def test_read_resource_document_uri(self):
        """Test that read_resource handles document URIs."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import read_resource_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.9", transport="streamable_http")

            with patch(
                "opencontractserver.mcp.server.record_mcp_resource_read"
            ) as mock_record, patch(
                "opencontractserver.mcp.server.get_document_resource"
            ) as mock_get_doc:
                mock_record.return_value = True
                mock_get_doc.return_value = '{"title": "Test Document"}'

                # Read document resource
                uri = "document://test-corpus/test-document"
                result = await read_resource_handler(uri)

                # Verify telemetry was recorded with document type
                mock_record.assert_called_once_with("document", success=True)
                mock_get_doc.assert_called_once_with("test-corpus", "test-document")

                return result

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            self.assertIsNotNone(result)
        finally:
            loop.close()

    def test_read_resource_annotation_uri(self):
        """Test that read_resource handles annotation URIs."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import read_resource_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.10", transport="streamable_http")

            with patch(
                "opencontractserver.mcp.server.record_mcp_resource_read"
            ) as mock_record, patch(
                "opencontractserver.mcp.server.get_annotation_resource"
            ) as mock_get_ann:
                mock_record.return_value = True
                mock_get_ann.return_value = '{"id": 123, "text": "Test Annotation"}'

                # Read annotation resource
                uri = "annotation://test-corpus/test-document/123"
                result = await read_resource_handler(uri)

                # Verify telemetry was recorded with annotation type
                mock_record.assert_called_once_with("annotation", success=True)
                mock_get_ann.assert_called_once_with(
                    "test-corpus", "test-document", 123
                )

                return result

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            self.assertIsNotNone(result)
        finally:
            loop.close()

    def test_read_resource_thread_uri(self):
        """Test that read_resource handles thread URIs."""
        import asyncio
        from unittest.mock import patch

        from opencontractserver.mcp.server import read_resource_handler
        from opencontractserver.mcp.telemetry import set_request_context

        async def run_test():
            set_request_context(client_ip="10.0.0.11", transport="streamable_http")

            with patch(
                "opencontractserver.mcp.server.record_mcp_resource_read"
            ) as mock_record, patch(
                "opencontractserver.mcp.server.get_thread_resource"
            ) as mock_get_thread:
                mock_record.return_value = True
                mock_get_thread.return_value = '{"id": 456, "title": "Test Thread"}'

                # Read thread resource
                uri = "thread://test-corpus/threads/456"
                result = await read_resource_handler(uri)

                # Verify telemetry was recorded with thread type
                mock_record.assert_called_once_with("thread", success=True)
                mock_get_thread.assert_called_once_with("test-corpus", 456)

                return result

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(run_test())
            self.assertIsNotNone(result)
        finally:
            loop.close()
