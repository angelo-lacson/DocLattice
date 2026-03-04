"""Tests for discovery endpoint views (robots.txt, llms.txt, sitemap.xml, etc.)."""

import json
from xml.etree.ElementTree import fromstring

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from opencontractserver.corpuses.models import Corpus

User = get_user_model()


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
)
class RobotsTxtTest(TestCase):
    """Tests for the dynamic robots.txt endpoint."""

    def test_returns_text_plain(self):
        response = self.client.get("/robots.txt")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/plain", response["Content-Type"])

    def test_allows_all_crawlers(self):
        response = self.client.get("/robots.txt")
        content = response.content.decode()
        self.assertIn("User-agent: *", content)
        self.assertIn("Disallow:", content)
        # Ensure Disallow is empty (allows everything)
        for line in content.splitlines():
            if line.strip().startswith("Disallow:"):
                self.assertEqual(line.strip(), "Disallow:")

    def test_includes_ai_crawler_user_agents(self):
        response = self.client.get("/robots.txt")
        content = response.content.decode()
        for bot in [
            "GPTBot",
            "ClaudeBot",
            "anthropic-ai",
            "Google-Extended",
            "PerplexityBot",
        ]:
            self.assertIn(f"User-agent: {bot}", content)
            self.assertIn("Allow: /", content)

    def test_includes_sitemap_reference(self):
        response = self.client.get("/robots.txt")
        content = response.content.decode()
        self.assertIn("Sitemap:", content)
        self.assertIn("/sitemap.xml", content)

    def test_includes_llms_txt_references(self):
        response = self.client.get("/robots.txt")
        content = response.content.decode()
        self.assertIn("/llms.txt", content)
        self.assertIn("/llms-full.txt", content)

    def test_only_get_allowed(self):
        response = self.client.post("/robots.txt")
        self.assertEqual(response.status_code, 405)


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
)
class LlmsTxtTest(TestCase):
    """Tests for the dynamic llms.txt endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username="llms_test_user",
            password="testpass123",
        )
        cls.public_corpus = Corpus.objects.create(
            title="Public Legal Corpus",
            description="A corpus of legal documents for testing",
            creator=cls.owner,
            is_public=True,
        )
        cls.private_corpus = Corpus.objects.create(
            title="Private Corpus",
            description="Should not appear",
            creator=cls.owner,
            is_public=False,
        )

    def test_returns_text_plain(self):
        response = self.client.get("/llms.txt")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/plain", response["Content-Type"])

    def test_follows_llmstxt_spec_format(self):
        """Verify H1 title, blockquote, and H2 sections per llmstxt.org spec."""
        response = self.client.get("/llms.txt")
        content = response.content.decode()
        # H1 title
        self.assertIn("# OpenContracts", content)
        # Blockquote summary
        self.assertIn("> OpenContracts is an open-source", content)
        # H2 sections
        self.assertIn("## MCP Server", content)
        self.assertIn("## Available Collections", content)
        self.assertIn("## Links", content)

    def test_includes_mcp_connection_info(self):
        response = self.client.get("/llms.txt")
        content = response.content.decode()
        self.assertIn("/mcp/", content)
        self.assertIn("JSON-RPC 2.0", content)
        self.assertIn("list_public_corpuses", content)
        self.assertIn("get_document_text", content)

    def test_includes_public_corpuses(self):
        response = self.client.get("/llms.txt")
        content = response.content.decode()
        self.assertIn("Public Legal Corpus", content)
        self.assertIn(self.public_corpus.slug, content)

    def test_excludes_private_corpuses(self):
        response = self.client.get("/llms.txt")
        content = response.content.decode()
        self.assertNotIn("Private Corpus", content)
        self.assertNotIn("Should not appear", content)

    def test_resolves_hostname(self):
        """Ensure no THIS_HOST placeholders remain."""
        response = self.client.get("/llms.txt")
        content = response.content.decode()
        self.assertNotIn("THIS_HOST", content)
        # MCP endpoint should use actual host
        self.assertIn("http://testserver/mcp/", content)

    def test_uses_inline_markdown_links(self):
        """Verify links use inline [text](url) format, not reference style."""
        response = self.client.get("/llms.txt")
        content = response.content.decode()
        self.assertIn("[Full MCP documentation](", content)
        self.assertIn("[Source code](", content)

    def test_only_get_allowed(self):
        response = self.client.post("/llms.txt")
        self.assertEqual(response.status_code, 405)


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
)
class LlmsFullTxtTest(TestCase):
    """Tests for the dynamic llms-full.txt endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username="llms_full_test_user",
            password="testpass123",
        )
        cls.corpus = Corpus.objects.create(
            title="Full Test Corpus",
            description="Corpus for full docs test",
            creator=cls.owner,
            is_public=True,
        )

    def test_returns_text_plain(self):
        response = self.client.get("/llms-full.txt")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/plain", response["Content-Type"])

    def test_includes_full_tool_reference(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        # Check all tool sections exist
        for tool in [
            "list_public_corpuses",
            "list_documents",
            "get_document_text",
            "list_annotations",
            "search_corpus",
            "list_threads",
            "get_thread_messages",
        ]:
            self.assertIn(f"### {tool}", content)

    def test_includes_parameter_details(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        self.assertIn("Parameters:", content)
        self.assertIn("Returns:", content)
        self.assertIn("corpus_slug (string, required)", content)

    def test_includes_resource_reference(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        self.assertIn("## Resources Reference", content)
        self.assertIn("corpus://{corpus_slug}", content)
        self.assertIn("document://{corpus_slug}/{document_slug}", content)

    def test_includes_example_request(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        self.assertIn('"jsonrpc": "2.0"', content)
        self.assertIn('"method": "tools/call"', content)

    def test_includes_architecture_diagram(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        self.assertIn("## Architecture", content)
        self.assertIn("MCP Client", content)

    def test_includes_corpus_listing_with_scoped_url(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        self.assertIn("## Available Collections", content)
        self.assertIn("Full Test Corpus", content)
        self.assertIn(f"/mcp/corpus/{self.corpus.slug}/", content)

    def test_resolves_hostname(self):
        response = self.client.get("/llms-full.txt")
        content = response.content.decode()
        self.assertNotIn("THIS_HOST", content)
        self.assertIn("http://testserver/mcp/", content)

    def test_only_get_allowed(self):
        response = self.client.post("/llms-full.txt")
        self.assertEqual(response.status_code, 405)


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
)
class SitemapXmlTest(TestCase):
    """Tests for the dynamic sitemap.xml endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username="sitemap_test_user",
            password="testpass123",
        )
        cls.public_corpus = Corpus.objects.create(
            title="Sitemap Corpus",
            description="Public corpus for sitemap",
            creator=cls.owner,
            is_public=True,
        )
        cls.private_corpus = Corpus.objects.create(
            title="Private Sitemap Corpus",
            creator=cls.owner,
            is_public=False,
        )

    def test_returns_xml(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/xml", response["Content-Type"])

    def test_valid_xml(self):
        response = self.client.get("/sitemap.xml")
        content = response.content.decode()
        # Should parse without error
        root = fromstring(content)
        self.assertEqual(
            root.tag, "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset"
        )

    def test_includes_homepage(self):
        response = self.client.get("/sitemap.xml")
        content = response.content.decode()
        self.assertIn("http://testserver/", content)

    def test_includes_public_corpus(self):
        response = self.client.get("/sitemap.xml")
        content = response.content.decode()
        self.assertIn(f"/c/{self.public_corpus.slug}", content)

    def test_excludes_private_corpus(self):
        response = self.client.get("/sitemap.xml")
        content = response.content.decode()
        if self.private_corpus.slug:
            self.assertNotIn(f"/c/{self.private_corpus.slug}", content)

    def test_includes_discovery_endpoints(self):
        response = self.client.get("/sitemap.xml")
        content = response.content.decode()
        self.assertIn("/llms.txt", content)
        self.assertIn("/llms-full.txt", content)

    def test_only_get_allowed(self):
        response = self.client.post("/sitemap.xml")
        self.assertEqual(response.status_code, 405)


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
)
class WellKnownMcpTest(TestCase):
    """Tests for the .well-known/mcp.json endpoint."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username="mcp_json_test_user",
            password="testpass123",
        )
        cls.corpus = Corpus.objects.create(
            title="MCP Discovery Corpus",
            description="For MCP JSON testing",
            creator=cls.owner,
            is_public=True,
        )

    def test_returns_json(self):
        response = self.client.get("/.well-known/mcp.json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("application/json", response["Content-Type"])

    def test_valid_json_structure(self):
        response = self.client.get("/.well-known/mcp.json")
        data = json.loads(response.content)
        self.assertIn("mcpServers", data)
        self.assertIn("opencontracts", data["mcpServers"])

    def test_global_server_entry(self):
        response = self.client.get("/.well-known/mcp.json")
        data = json.loads(response.content)
        server = data["mcpServers"]["opencontracts"]
        self.assertIn("/mcp/", server["url"])
        self.assertEqual(server["transport"], "streamable-http")
        self.assertIsNone(server["authentication"])

    def test_includes_corpus_scoped_servers(self):
        response = self.client.get("/.well-known/mcp.json")
        data = json.loads(response.content)
        slug = self.corpus.slug
        key = f"opencontracts-{slug}"
        self.assertIn(key, data["mcpServers"])
        self.assertIn(f"/mcp/corpus/{slug}/", data["mcpServers"][key]["url"])

    def test_resolves_hostname(self):
        response = self.client.get("/.well-known/mcp.json")
        data = json.loads(response.content)
        server = data["mcpServers"]["opencontracts"]
        self.assertIn("http://testserver", server["url"])
        self.assertNotIn("THIS_HOST", server["url"])

    def test_only_get_allowed(self):
        response = self.client.post("/.well-known/mcp.json")
        self.assertEqual(response.status_code, 405)


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
)
class DiscoveryNoCorpusesTest(TestCase):
    """Tests for discovery endpoints when no public corpuses exist."""

    def test_llms_txt_without_corpuses(self):
        response = self.client.get("/llms.txt")
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        # Should still have the core sections
        self.assertIn("# OpenContracts", content)
        self.assertIn("## MCP Server", content)
        # But no Available Collections section
        self.assertNotIn("## Available Collections", content)

    def test_llms_full_txt_without_corpuses(self):
        response = self.client.get("/llms-full.txt")
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertNotIn("## Available Collections", content)

    def test_sitemap_without_corpuses(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        # Should still have homepage
        self.assertIn("http://testserver/", content)

    def test_mcp_json_without_corpuses(self):
        response = self.client.get("/.well-known/mcp.json")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        # Should still have global server
        self.assertIn("opencontracts", data["mcpServers"])
        # But no corpus-scoped servers beyond the global one
        self.assertEqual(len(data["mcpServers"]), 1)
