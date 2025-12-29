"""
OpenContracts MCP Server.

Model Context Protocol server providing read-only access to public OpenContracts resources.
Supports both SSE transport (for HTTP) and stdio transport (for CLI).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

from asgiref.sync import sync_to_async
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.server.stdio import stdio_server
from mcp.types import Resource, TextContent, Tool

from .resources import (
    get_annotation_resource,
    get_corpus_resource,
    get_document_resource,
    get_thread_resource,
)
from .tools import (
    get_document_text,
    get_thread_messages,
    list_annotations,
    list_documents,
    list_public_corpuses,
    list_threads,
    search_corpus,
)

logger = logging.getLogger(__name__)


class URIParser:
    """Parse MCP resource URIs safely using regex patterns."""

    # Slug pattern: alphanumeric and hyphens only
    SLUG_PATTERN = r"[A-Za-z0-9\-]+"

    PATTERNS = {
        "corpus": re.compile(rf"^corpus://({SLUG_PATTERN})$"),
        "document": re.compile(rf"^document://({SLUG_PATTERN})/({SLUG_PATTERN})$"),
        "annotation": re.compile(
            rf"^annotation://({SLUG_PATTERN})/({SLUG_PATTERN})/(\d+)$"
        ),
        "thread": re.compile(rf"^thread://({SLUG_PATTERN})/threads/(\d+)$"),
    }

    @classmethod
    def parse_corpus(cls, uri: str) -> str | None:
        """Parse corpus URI, returns corpus_slug or None."""
        match = cls.PATTERNS["corpus"].match(uri)
        return match.group(1) if match else None

    @classmethod
    def parse_document(cls, uri: str) -> tuple[str, str] | None:
        """Parse document URI, returns (corpus_slug, document_slug) or None."""
        match = cls.PATTERNS["document"].match(uri)
        return (match.group(1), match.group(2)) if match else None

    @classmethod
    def parse_annotation(cls, uri: str) -> tuple[str, str, int] | None:
        """Parse annotation URI, returns (corpus_slug, document_slug, annotation_id) or None."""
        match = cls.PATTERNS["annotation"].match(uri)
        return (match.group(1), match.group(2), int(match.group(3))) if match else None

    @classmethod
    def parse_thread(cls, uri: str) -> tuple[str, int] | None:
        """Parse thread URI, returns (corpus_slug, thread_id) or None."""
        match = cls.PATTERNS["thread"].match(uri)
        return (match.group(1), int(match.group(2))) if match else None


def create_mcp_server() -> Server:
    """Create and configure the MCP server instance."""
    mcp_server = Server("opencontracts")

    @mcp_server.list_resources()
    async def list_resources() -> list[Resource]:
        """List available resource patterns."""
        return [
            Resource(
                uri="corpus://{corpus_slug}",
                name="Public Corpus",
                description="Access public corpus metadata and contents",
                mimeType="application/json",
            ),
            Resource(
                uri="document://{corpus_slug}/{document_slug}",
                name="Public Document",
                description="Access public document with extracted text",
                mimeType="application/json",
            ),
            Resource(
                uri="annotation://{corpus_slug}/{document_slug}/{annotation_id}",
                name="Document Annotation",
                description="Access specific annotation on a document",
                mimeType="application/json",
            ),
            Resource(
                uri="thread://{corpus_slug}/threads/{thread_id}",
                name="Discussion Thread",
                description="Access public discussion thread with messages",
                mimeType="application/json",
            ),
        ]

    @mcp_server.read_resource()
    async def read_resource(uri: str) -> str:
        """Resolve resource URI and return content."""
        # Try corpus URI
        corpus_slug = URIParser.parse_corpus(uri)
        if corpus_slug:
            return await sync_to_async(get_corpus_resource)(corpus_slug)

        # Try document URI
        doc_parts = URIParser.parse_document(uri)
        if doc_parts:
            corpus_slug, document_slug = doc_parts
            return await sync_to_async(get_document_resource)(
                corpus_slug, document_slug
            )

        # Try annotation URI
        ann_parts = URIParser.parse_annotation(uri)
        if ann_parts:
            corpus_slug, document_slug, annotation_id = ann_parts
            return await sync_to_async(get_annotation_resource)(
                corpus_slug, document_slug, annotation_id
            )

        # Try thread URI
        thread_parts = URIParser.parse_thread(uri)
        if thread_parts:
            corpus_slug, thread_id = thread_parts
            return await sync_to_async(get_thread_resource)(corpus_slug, thread_id)

        raise ValueError(f"Invalid or unrecognized resource URI: {uri}")

    @mcp_server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools."""
        return [
            Tool(
                name="list_public_corpuses",
                description="List all publicly accessible corpuses",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "default": 20,
                            "description": "Max results (1-100)",
                        },
                        "offset": {
                            "type": "integer",
                            "default": 0,
                            "description": "Pagination offset",
                        },
                        "search": {
                            "type": "string",
                            "default": "",
                            "description": "Search filter",
                        },
                    },
                },
            ),
            Tool(
                name="list_documents",
                description="List documents in a corpus",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "corpus_slug": {
                            "type": "string",
                            "description": "Corpus identifier",
                        },
                        "limit": {"type": "integer", "default": 50},
                        "offset": {"type": "integer", "default": 0},
                        "search": {"type": "string", "default": ""},
                    },
                    "required": ["corpus_slug"],
                },
            ),
            Tool(
                name="get_document_text",
                description="Get full extracted text from a document",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "corpus_slug": {
                            "type": "string",
                            "description": "Corpus identifier",
                        },
                        "document_slug": {
                            "type": "string",
                            "description": "Document identifier",
                        },
                    },
                    "required": ["corpus_slug", "document_slug"],
                },
            ),
            Tool(
                name="list_annotations",
                description="List annotations on a document",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "corpus_slug": {"type": "string"},
                        "document_slug": {"type": "string"},
                        "page": {
                            "type": "integer",
                            "description": "Filter to page number",
                        },
                        "label_text": {
                            "type": "string",
                            "description": "Filter by label text",
                        },
                        "limit": {"type": "integer", "default": 100},
                        "offset": {"type": "integer", "default": 0},
                    },
                    "required": ["corpus_slug", "document_slug"],
                },
            ),
            Tool(
                name="search_corpus",
                description="Semantic search within a corpus",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "corpus_slug": {"type": "string"},
                        "query": {"type": "string", "description": "Search query"},
                        "limit": {"type": "integer", "default": 10},
                    },
                    "required": ["corpus_slug", "query"],
                },
            ),
            Tool(
                name="list_threads",
                description="List discussion threads in a corpus",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "corpus_slug": {"type": "string"},
                        "document_slug": {
                            "type": "string",
                            "description": "Optional document filter",
                        },
                        "limit": {"type": "integer", "default": 20},
                        "offset": {"type": "integer", "default": 0},
                    },
                    "required": ["corpus_slug"],
                },
            ),
            Tool(
                name="get_thread_messages",
                description="Get messages in a thread",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "corpus_slug": {"type": "string"},
                        "thread_id": {"type": "integer"},
                        "flatten": {
                            "type": "boolean",
                            "default": False,
                            "description": "Return flat list",
                        },
                    },
                    "required": ["corpus_slug", "thread_id"],
                },
            ),
        ]

    # Map tool names to implementations
    TOOL_HANDLERS = {
        "list_public_corpuses": list_public_corpuses,
        "list_documents": list_documents,
        "get_document_text": get_document_text,
        "list_annotations": list_annotations,
        "search_corpus": search_corpus,
        "list_threads": list_threads,
        "get_thread_messages": get_thread_messages,
    }

    @mcp_server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        """Execute tool and return results."""
        handler = TOOL_HANDLERS.get(name)
        if not handler:
            raise ValueError(f"Unknown tool: {name}")

        # Run synchronous Django ORM handlers in thread pool
        result = await sync_to_async(handler)(**arguments)

        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    return mcp_server


# Create the global MCP server instance
mcp_server = create_mcp_server()

# Create SSE transport for HTTP access
# The endpoint is where clients POST messages (relative to the SSE connection)
sse_transport = SseServerTransport("/mcp/messages/")


async def handle_sse(scope, receive, send):
    """
    ASGI handler for SSE connections (GET /mcp/sse/).

    This establishes the SSE stream for server-to-client messages.
    """
    logger.info("MCP SSE connection initiated")
    try:
        async with sse_transport.connect_sse(scope, receive, send) as streams:
            await mcp_server.run(
                streams[0],  # read_stream
                streams[1],  # write_stream
                mcp_server.create_initialization_options(),
            )
    except Exception as e:
        logger.error(f"MCP SSE error: {e}")
        raise


async def handle_messages(scope, receive, send):
    """
    ASGI handler for client messages (POST /mcp/messages/).

    This receives client requests and routes them to the appropriate session.
    """
    logger.debug("MCP message received")
    await sse_transport.handle_post_message(scope, receive, send)


def create_mcp_asgi_app():
    """
    Create an ASGI application that routes MCP requests.

    Routes:
        GET  /mcp/sse/      - Establish SSE connection
        POST /mcp/messages/ - Send messages to server
    """

    async def app(scope, receive, send):
        if scope["type"] != "http":
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET")

        if path == "/mcp/sse/" and method == "GET":
            await handle_sse(scope, receive, send)
        elif path == "/mcp/messages/" and method == "POST":
            await handle_messages(scope, receive, send)
        else:
            # Return 404 for unhandled paths
            await send(
                {
                    "type": "http.response.start",
                    "status": 404,
                    "headers": [[b"content-type", b"application/json"]],
                }
            )
            await send(
                {
                    "type": "http.response.body",
                    "body": json.dumps(
                        {
                            "error": "Not found",
                            "endpoints": {
                                "sse": "GET /mcp/sse/",
                                "messages": "POST /mcp/messages/",
                            },
                        }
                    ).encode(),
                }
            )

    return app


# ASGI application for mounting in Django
mcp_asgi_app = create_mcp_asgi_app()


async def main():
    """Run MCP server with stdio transport (for CLI usage)."""
    async with stdio_server() as streams:
        await mcp_server.run(
            streams[0],  # read_stream
            streams[1],  # write_stream
            mcp_server.create_initialization_options(),
        )


if __name__ == "__main__":
    # Setup Django before running
    import os

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

    import django

    django.setup()

    asyncio.run(main())
