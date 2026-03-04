"""
Dynamic discovery endpoints for crawlers and AI agents.

Serves robots.txt, llms.txt, llms-full.txt, sitemap.xml, and
.well-known/mcp.json with live data from the database.
"""

import json
import logging
from xml.etree.ElementTree import Element, SubElement, tostring

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest, HttpResponse
from django.views.decorators.cache import cache_page
from django.views.decorators.http import require_GET

from opencontractserver.mcp.config import RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW

logger = logging.getLogger(__name__)

# Cache discovery responses for 5 minutes to avoid repeated DB hits
CACHE_SECONDS = 300


def _get_base_url(request: HttpRequest) -> str:
    """Derive the canonical base URL from the request."""
    scheme = "https" if request.is_secure() else "http"
    host = request.get_host()
    return f"{scheme}://{host}"


def _get_public_corpuses() -> list[dict]:
    """Return summary dicts for all public corpuses visible to anonymous users."""
    from opencontractserver.corpuses.models import Corpus

    anonymous = AnonymousUser()
    qs = Corpus.objects.visible_to_user(anonymous).order_by("-created")
    results = []
    for corpus in qs:
        results.append(
            {
                "slug": corpus.slug,
                "title": corpus.title,
                "description": corpus.description or "",
                "document_count": (
                    corpus.document_count() if hasattr(corpus, "document_count") else 0
                ),
            }
        )
    return results


# ---------------------------------------------------------------------------
# robots.txt
# ---------------------------------------------------------------------------
@require_GET
@cache_page(CACHE_SECONDS)
def robots_txt(request: HttpRequest) -> HttpResponse:
    base_url = _get_base_url(request)
    lines = [
        "# https://www.robotstxt.org/robotstxt.html",
        "",
        "# Default: allow all crawlers",
        "User-agent: *",
        "Disallow:",
        "",
        "# AI crawlers — explicitly welcomed",
        "User-agent: GPTBot",
        "Allow: /",
        "",
        "User-agent: ChatGPT-User",
        "Allow: /",
        "",
        "User-agent: ClaudeBot",
        "Allow: /",
        "",
        "User-agent: anthropic-ai",
        "Allow: /",
        "",
        "User-agent: Google-Extended",
        "Allow: /",
        "",
        "User-agent: PerplexityBot",
        "Allow: /",
        "",
        "User-agent: Bytespider",
        "Allow: /",
        "",
        "User-agent: cohere-ai",
        "Allow: /",
        "",
        "# AI agent documentation (see https://llmstxt.org)",
        f"# LLM instructions: {base_url}/llms.txt",
        f"# Full API reference: {base_url}/llms-full.txt",
        "",
        "# Sitemaps",
        f"Sitemap: {base_url}/sitemap.xml",
        "",
    ]
    return HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------------------
# llms.txt
# ---------------------------------------------------------------------------
@require_GET
@cache_page(CACHE_SECONDS)
def llms_txt(request: HttpRequest) -> HttpResponse:
    base_url = _get_base_url(request)
    corpuses = _get_public_corpuses()

    lines = [
        "# OpenContracts",
        "",
        (
            "> OpenContracts is an open-source document analytics platform for "
            "analyzing, annotating, and querying complex documents. It provides a "
            "Model Context Protocol (MCP) server for AI agent access."
        ),
        "",
        "## MCP Server",
        "",
        (
            "This instance exposes a read-only MCP server that AI agents can "
            "connect to for accessing public corpuses, documents, annotations, "
            "and discussion threads."
        ),
        "",
        f"- Endpoint (global): {base_url}/mcp/",
        f"- Endpoint (corpus-scoped): {base_url}/mcp/corpus/{{corpus_slug}}/",
        "- Protocol: JSON-RPC 2.0 (MCP spec 2025-03-26)",
        "- Auth: None required (public data only)",
        f"- Rate limit: {RATE_LIMIT_REQUESTS} requests/{RATE_LIMIT_WINDOW}s per IP",
        "",
        "### Connecting",
        "",
        "Use any MCP-compatible client. For Claude Desktop, add to config:",
        "",
        "```json",
        "{",
        '  "mcpServers": {',
        '    "opencontracts": {',
        '      "command": "npx",',
        f'      "args": ["mcp-remote", "{base_url}/mcp/"]',
        "    }",
        "  }",
        "}",
        "```",
        "",
        "### Available Tools",
        "",
        "- `list_public_corpuses`: List all public corpuses (paginated, searchable)",
        "- `list_documents`: List documents in a corpus",
        "- `get_document_text`: Get full extracted text from a document",
        "- `list_annotations`: List annotations on a document (filter by page or label)",
        "- `search_corpus`: Semantic vector search within a corpus",
        "- `list_threads`: List discussion threads in a corpus",
        "- `get_thread_messages`: Get messages in a thread (flat or hierarchical)",
        "",
        "### Available Resources (URI-based)",
        "",
        "- `corpus://{corpus_slug}` - Corpus metadata",
        "- `document://{corpus_slug}/{document_slug}` - Document with text",
        "- `annotation://{corpus_slug}/{document_slug}/{annotation_id}` - Annotation details",
        "- `thread://{corpus_slug}/threads/{thread_id}` - Discussion thread",
        "",
    ]

    # Dynamic corpus listing
    if corpuses:
        lines.append("## Available Collections")
        lines.append("")
        for c in corpuses:
            slug = c["slug"]
            title = c["title"]
            doc_count = c["document_count"]
            desc = c["description"]
            # Truncate long descriptions to keep llms.txt concise
            if len(desc) > 120:
                desc = desc[:117] + "..."
            entry = f"- **{title}** (slug: `{slug}`, {doc_count} documents)"
            if desc:
                entry += f": {desc}"
            lines.append(entry)
        lines.append("")

    lines.extend(
        [
            "## Links",
            "",
            f"- [Full MCP documentation]({base_url}/llms-full.txt)",
            "- [Source code](https://github.com/Open-Source-Legal/OpenContracts)",
            "- [Project documentation](https://opencontracts.opensource.legal)",
            "",
        ]
    )
    return HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------------------
# llms-full.txt
# ---------------------------------------------------------------------------
@require_GET
@cache_page(CACHE_SECONDS)
def llms_full_txt(request: HttpRequest) -> HttpResponse:
    base_url = _get_base_url(request)
    corpuses = _get_public_corpuses()

    lines = [
        "# OpenContracts - Full MCP Documentation",
        "",
        (
            "> OpenContracts is an open-source document analytics platform for "
            "analyzing, annotating, and querying complex documents. It provides a "
            "Model Context Protocol (MCP) server for AI agent access to public data."
        ),
        "",
        "## MCP Server Overview",
        "",
        (
            "OpenContracts exposes a read-only MCP server so that AI assistants can "
            "access public corpuses, documents, annotations, and discussion threads "
            "without authentication."
        ),
        "",
        f"- Global endpoint: {base_url}/mcp/",
        f"- Corpus-scoped endpoint: {base_url}/mcp/corpus/{{corpus_slug}}/",
        "- Protocol: JSON-RPC 2.0 (MCP specification 2025-03-26)",
        "- Transport: Streamable HTTP (recommended), SSE (deprecated)",
        "- Authentication: None required (public data only)",
        f"- Rate limit: {RATE_LIMIT_REQUESTS} requests/{RATE_LIMIT_WINDOW}s per IP",
        "- Security: Read-only, slug-based identifiers, no internal IDs exposed",
        "",
        "## Connecting",
        "",
        "### Claude Desktop (Global Access)",
        "",
        "Add to `~/.config/Claude/claude_desktop_config.json`:",
        "",
        "```json",
        "{",
        '  "mcpServers": {',
        '    "opencontracts": {',
        '      "command": "npx",',
        f'      "args": ["mcp-remote", "{base_url}/mcp/"]',
        "    }",
        "  }",
        "}",
        "```",
        "",
        "### Claude Desktop (Corpus-Scoped)",
        "",
        "```json",
        "{",
        '  "mcpServers": {',
        '    "my-corpus": {',
        '      "command": "npx",',
        f'      "args": ["mcp-remote", "{base_url}/mcp/corpus/MY_CORPUS_SLUG/"]',
        "    }",
        "  }",
        "}",
        "```",
        "",
        "### Direct HTTP (curl)",
        "",
        "```bash",
        f"curl -X POST {base_url}/mcp/ \\",
        '  -H "Content-Type: application/json" \\',
        '  -H "Accept: application/json, text/event-stream" \\',
        """  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'""",
        "```",
        "",
        "## Tools Reference",
        "",
        "### list_public_corpuses",
        "",
        "List public corpuses visible to anonymous users.",
        "",
        "Parameters:",
        "- limit (int, default 20, max 100): Number of results",
        "- offset (int, default 0): Pagination offset",
        "- search (string, optional): Filter by title or description",
        "",
        (
            "Returns: { total_count, corpuses: [{ slug, title, description, "
            "document_count, created }] }"
        ),
        "",
        "Example request:",
        "```json",
        "{",
        '  "jsonrpc": "2.0",',
        '  "method": "tools/call",',
        '  "params": {',
        '    "name": "list_public_corpuses",',
        '    "arguments": { "limit": 10 }',
        "  },",
        '  "id": 1',
        "}",
        "```",
        "",
        "### list_documents",
        "",
        "List documents in a public corpus.",
        "",
        "Parameters:",
        "- corpus_slug (string, required): Corpus identifier",
        "- limit (int, default 50, max 100): Number of results",
        "- offset (int, default 0): Pagination offset",
        "- search (string, optional): Filter by title or description",
        "",
        (
            "Returns: { total_count, documents: [{ slug, title, description, "
            "file_type, page_count, created }] }"
        ),
        "",
        "### get_document_text",
        "",
        "Retrieve full extracted text from a document.",
        "",
        "Parameters:",
        "- corpus_slug (string, required): Corpus identifier",
        "- document_slug (string, required): Document identifier",
        "",
        "Returns: { document_slug, page_count, text }",
        "",
        "### list_annotations",
        "",
        "List annotations on a document with optional filtering.",
        "",
        "Parameters:",
        "- corpus_slug (string, required): Corpus identifier",
        "- document_slug (string, required): Document identifier",
        "- page (int, optional): Filter by page number",
        "- label_text (string, optional): Filter by label text",
        "- limit (int, default 100, max 100): Number of results",
        "- offset (int, default 0): Pagination offset",
        "",
        (
            "Returns: { total_count, annotations: [{ id, page, raw_text, "
            "annotation_label: { text, color, label_type }, structural, created }] }"
        ),
        "",
        "### search_corpus",
        "",
        (
            "Semantic vector search within a corpus. Falls back to text search "
            "if embeddings are unavailable."
        ),
        "",
        "Parameters:",
        "- corpus_slug (string, required): Corpus identifier",
        "- query (string, required): Search query text",
        "- limit (int, default 10, max 50): Number of results",
        "",
        "Returns: { query, results: [{ type, slug, title, similarity_score }] }",
        "",
        "### list_threads",
        "",
        "List discussion threads in a corpus or document.",
        "",
        "Parameters:",
        "- corpus_slug (string, required): Corpus identifier",
        "- document_slug (string, optional): Filter to a specific document",
        "- limit (int, default 20, max 100): Number of results",
        "- offset (int, default 0): Pagination offset",
        "",
        (
            "Returns: { total_count, threads: [{ id, title, message_count, "
            "is_pinned, is_locked }] }"
        ),
        "",
        "### get_thread_messages",
        "",
        "Retrieve all messages in a thread.",
        "",
        "Parameters:",
        "- corpus_slug (string, required): Corpus identifier",
        "- thread_id (int, required): Thread identifier",
        "- flatten (bool, default false): Return flat list instead of tree",
        "",
        (
            "Returns: { thread_id, title, messages: [{ id, content, author, "
            "created_at, replies? }] }"
        ),
        "",
        "## Resources Reference",
        "",
        (
            "Resources use URI patterns for direct content access via the "
            "`resources/read` method."
        ),
        "",
        "### corpus://{corpus_slug}",
        "",
        (
            "Corpus metadata including title, description, document count, "
            "label set, and timestamps."
        ),
        "",
        "### document://{corpus_slug}/{document_slug}",
        "",
        (
            "Document metadata and full extracted text. Returns JSON with fields: "
            "slug, title, description, file_type, page_count, text_preview "
            "(first 500 characters of extracted text), full_text (complete "
            "extracted text), created (ISO 8601 timestamp), corpus (corpus slug). "
            "The text_preview field is useful for quick inspection without "
            "consuming the full text, which can be large."
        ),
        "",
        "### annotation://{corpus_slug}/{document_slug}/{annotation_id}",
        "",
        (
            "Annotation details including raw text, label, page number, "
            "bounding box coordinates, and created timestamp."
        ),
        "",
        "### thread://{corpus_slug}/threads/{thread_id}",
        "",
        "Discussion thread with hierarchical message tree.",
        "",
        "Example:",
        "```json",
        "{",
        '  "jsonrpc": "2.0",',
        '  "method": "resources/read",',
        '  "params": { "uri": "document://my-corpus/contract-2024" },',
        '  "id": 1',
        "}",
        "```",
        "",
        "## Corpus-Scoped Endpoints",
        "",
        (
            f"When using `{base_url}/mcp/corpus/{{corpus_slug}}/`, the "
            "`corpus_slug` parameter is automatically injected into all tool "
            "calls. The `list_public_corpuses` tool is replaced by "
            "`get_corpus_info` which returns detailed information about the "
            "scoped corpus."
        ),
        "",
        (
            "Scoped endpoints are ideal for sharing - the URL contains the "
            "corpus context, so collaborators do not need to know the corpus slug."
        ),
        "",
    ]

    # Dynamic corpus listing
    if corpuses:
        lines.append("## Available Collections")
        lines.append("")
        lines.append(
            "The following public corpuses are currently available on this instance:"
        )
        lines.append("")
        for c in corpuses:
            slug = c["slug"]
            title = c["title"]
            doc_count = c["document_count"]
            desc = c["description"]
            lines.append(f"### {title}")
            lines.append("")
            lines.append(f"- Slug: `{slug}`")
            lines.append(f"- Documents: {doc_count}")
            if desc:
                lines.append(f"- Description: {desc}")
            lines.append(f"- Corpus-scoped MCP: `{base_url}/mcp/corpus/{slug}/`")
            lines.append("")

    lines.extend(
        [
            "## Architecture",
            "",
            "```",
            "MCP Client  <--JSON-RPC 2.0-->  ASGI Router (/mcp/*)",
            "                                     |",
            "                            +--------+--------+",
            "                            |                 |",
            "                    Global Server     Corpus-Scoped Server",
            "                    (all corpuses)    (single corpus, cached)",
            "                            |                 |",
            "                            +--------+--------+",
            "                                     |",
            "                              Django ORM",
            "                          visible_to_user()",
            "                           (AnonymousUser)",
            "```",
            "",
            "## Links",
            "",
            "- [Source code](https://github.com/Open-Source-Legal/OpenContracts)",
            "- [Project site](https://opencontracts.opensource.legal)",
            "- [MCP specification](https://modelcontextprotocol.io)",
            "",
        ]
    )
    return HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")


# ---------------------------------------------------------------------------
# sitemap.xml
# ---------------------------------------------------------------------------
@require_GET
@cache_page(CACHE_SECONDS)
def sitemap_xml(request: HttpRequest) -> HttpResponse:
    """Generate an XML sitemap listing public corpuses and their documents."""
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import DocumentPath

    base_url = _get_base_url(request)
    anonymous = AnonymousUser()

    urlset = Element("urlset")
    urlset.set("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9")

    # Homepage
    url_el = SubElement(urlset, "url")
    SubElement(url_el, "loc").text = f"{base_url}/"
    SubElement(url_el, "changefreq").text = "weekly"
    SubElement(url_el, "priority").text = "1.0"

    # Public corpuses
    public_corpuses = Corpus.objects.visible_to_user(anonymous).order_by("-created")
    for corpus in public_corpuses:
        if not corpus.slug:
            continue
        url_el = SubElement(urlset, "url")
        SubElement(url_el, "loc").text = f"{base_url}/c/{corpus.slug}"
        if corpus.modified:
            SubElement(url_el, "lastmod").text = corpus.modified.strftime("%Y-%m-%d")
        SubElement(url_el, "changefreq").text = "weekly"
        SubElement(url_el, "priority").text = "0.8"

    # Public documents within those corpuses (via DocumentPath)
    public_corpus_ids = list(public_corpuses.values_list("id", flat=True))
    if public_corpus_ids:
        doc_paths = (
            DocumentPath.objects.filter(
                corpus_id__in=public_corpus_ids,
                is_current=True,
                is_deleted=False,
            )
            .select_related("document", "corpus")
            .order_by("-document__modified")[:1000]
        )
        for dp in doc_paths:
            doc = dp.document
            corpus = dp.corpus
            if not doc.slug or not corpus or not corpus.slug:
                continue
            url_el = SubElement(urlset, "url")
            SubElement(url_el, "loc").text = f"{base_url}/c/{corpus.slug}/d/{doc.slug}"
            if doc.modified:
                SubElement(url_el, "lastmod").text = doc.modified.strftime("%Y-%m-%d")
            SubElement(url_el, "changefreq").text = "monthly"
            SubElement(url_el, "priority").text = "0.6"

    # Discovery endpoints
    for ep_path in ["/llms.txt", "/llms-full.txt"]:
        url_el = SubElement(urlset, "url")
        SubElement(url_el, "loc").text = f"{base_url}{ep_path}"
        SubElement(url_el, "changefreq").text = "weekly"
        SubElement(url_el, "priority").text = "0.5"

    xml_bytes = tostring(urlset, encoding="unicode", xml_declaration=False)
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_bytes

    return HttpResponse(xml_str, content_type="application/xml; charset=utf-8")


# ---------------------------------------------------------------------------
# .well-known/mcp.json
# ---------------------------------------------------------------------------
@require_GET
@cache_page(CACHE_SECONDS)
def well_known_mcp(request: HttpRequest) -> HttpResponse:
    """MCP server discovery endpoint per emerging .well-known convention."""
    base_url = _get_base_url(request)
    corpuses = _get_public_corpuses()

    servers = {
        "opencontracts": {
            "url": f"{base_url}/mcp/",
            "description": (
                "Read-only access to public document corpuses, annotations, "
                "and discussion threads"
            ),
            "transport": "streamable-http",
            "authentication": None,
            "rateLimit": (
                f"{RATE_LIMIT_REQUESTS} requests per "
                f"{RATE_LIMIT_WINDOW} seconds per IP"
            ),
        }
    }

    # Add corpus-scoped servers for each public corpus
    for c in corpuses:
        slug = c["slug"]
        title = c["title"]
        servers[f"opencontracts-{slug}"] = {
            "url": f"{base_url}/mcp/corpus/{slug}/",
            "description": f"Scoped access to: {title}",
            "transport": "streamable-http",
            "authentication": None,
        }

    data = {"mcpServers": servers}

    return HttpResponse(
        json.dumps(data, indent=2),
        content_type="application/json; charset=utf-8",
    )
