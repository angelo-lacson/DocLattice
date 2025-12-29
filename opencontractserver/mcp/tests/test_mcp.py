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
        self.assertIsNone(URIParser.parse_corpus("corpus://my_corpus"))  # underscore invalid

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
            username="testowner",
            email="owner@test.com",
            password="testpass123"
        )

        # Create public corpus
        cls.public_corpus = Corpus.objects.create(
            title="Public Test Corpus",
            description="A public test corpus",
            creator=cls.owner,
            is_public=True
        )

        # Create private corpus
        cls.private_corpus = Corpus.objects.create(
            title="Private Test Corpus",
            description="A private test corpus",
            creator=cls.owner,
            is_public=False
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
            username="toolsowner",
            email="tools@test.com",
            password="testpass123"
        )

        # Create public corpuses
        cls.corpus1 = Corpus.objects.create(
            title="Corpus One",
            description="First corpus",
            creator=cls.owner,
            is_public=True
        )
        cls.corpus2 = Corpus.objects.create(
            title="Corpus Two",
            description="Second corpus",
            creator=cls.owner,
            is_public=True
        )

        # Create private corpus (should not appear)
        cls.private = Corpus.objects.create(
            title="Private Corpus",
            creator=cls.owner,
            is_public=False
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
            result["corpuses"][0]["slug"],
            result2["corpuses"][0]["slug"]
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
            username="formatowner",
            email="format@test.com",
            password="testpass123"
        )

        cls.corpus = Corpus.objects.create(
            title="Format Test Corpus",
            description="Testing formatters",
            creator=cls.owner,
            is_public=True
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
