"""
OpenContracts MCP Server.

Model Context Protocol server providing read-only access to public OpenContracts resources.
Supports multiple transports:
- Streamable HTTP transport at /mcp (recommended, stateless mode)
- SSE transport at /sse (deprecated, for backward compatibility)
- stdio transport (for CLI usage)

Uses stateless mode for HTTP - each request is independent, avoiding session
initialization race conditions that plagued the older SSE transport.
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
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.types import Resource, TextContent, Tool
from starlette.applications import Starlette
from starlette.responses import Response
from starlette.routing import Mount, Route

from .resources import (
    get_annotation_resource,
    get_corpus_resource,
    get_document_resource,
    get_thread_resource,
)
from .telemetry import (
    clear_request_context,
    get_client_ip_from_scope,
    record_mcp_request,
    record_mcp_resource_read,
    record_mcp_tool_call,
    set_request_context,
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
        resource_type = "unknown"
        try:
            # Try corpus URI
            corpus_slug = URIParser.parse_corpus(uri)
            if corpus_slug:
                resource_type = "corpus"
                result = await sync_to_async(get_corpus_resource)(corpus_slug)
                record_mcp_resource_read(resource_type, success=True)
                return result

            # Try document URI
            doc_parts = URIParser.parse_document(uri)
            if doc_parts:
                resource_type = "document"
                corpus_slug, document_slug = doc_parts
                result = await sync_to_async(get_document_resource)(
                    corpus_slug, document_slug
                )
                record_mcp_resource_read(resource_type, success=True)
                return result

            # Try annotation URI
            ann_parts = URIParser.parse_annotation(uri)
            if ann_parts:
                resource_type = "annotation"
                corpus_slug, document_slug, annotation_id = ann_parts
                result = await sync_to_async(get_annotation_resource)(
                    corpus_slug, document_slug, annotation_id
                )
                record_mcp_resource_read(resource_type, success=True)
                return result

            # Try thread URI
            thread_parts = URIParser.parse_thread(uri)
            if thread_parts:
                resource_type = "thread"
                corpus_slug, thread_id = thread_parts
                result = await sync_to_async(get_thread_resource)(
                    corpus_slug, thread_id
                )
                record_mcp_resource_read(resource_type, success=True)
                return result

            raise ValueError(f"Invalid or unrecognized resource URI: {uri}")
        except Exception as e:
            record_mcp_resource_read(
                resource_type, success=False, error_type=type(e).__name__
            )
            raise

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
            record_mcp_tool_call(name, success=False, error_type="UnknownTool")
            raise ValueError(f"Unknown tool: {name}")

        try:
            # Run synchronous Django ORM handlers in thread pool
            result = await sync_to_async(handler)(**arguments)
            record_mcp_tool_call(name, success=True)
            return [TextContent(type="text", text=json.dumps(result, indent=2))]
        except Exception as e:
            record_mcp_tool_call(name, success=False, error_type=type(e).__name__)
            raise

    return mcp_server


# Create the global MCP server instance
mcp_server = create_mcp_server()

# Session manager for stateless HTTP transport
# Stateless mode = no session handshake required, each request is independent
# This avoids the "Received request before initialization was complete" bug
# that affected the older SSE transport
session_manager: StreamableHTTPSessionManager | None = None


def get_session_manager() -> StreamableHTTPSessionManager:
    """Get or create the session manager instance."""
    global session_manager
    if session_manager is None:
        session_manager = StreamableHTTPSessionManager(
            app=mcp_server,
            event_store=None,  # No resumability needed for stateless
            json_response=False,  # Use SSE streaming for responses
            stateless=True,  # Key: each request is independent
        )
    return session_manager


class MCPLifespanManager:
    """
    Manages the MCP session manager lifecycle within Django's ASGI context.

    Since Django doesn't have a native lifespan protocol like Starlette,
    we manage the session manager's run() context lazily on first request.
    """

    def __init__(self):
        self._started = False
        self._run_context = None
        self._lock = asyncio.Lock()

    async def ensure_started(self):
        """Ensure the session manager is running."""
        async with self._lock:
            if not self._started:
                manager = get_session_manager()
                self._run_context = manager.run()
                await self._run_context.__aenter__()
                self._started = True
                logger.info("MCP StreamableHTTP session manager started")


# Global lifespan manager for Streamable HTTP
lifespan_manager = MCPLifespanManager()

# SSE transport for backward compatibility with older clients
# The SSE transport is deprecated but some clients still use it
sse_transport = SseServerTransport("/sse/messages/")


async def handle_sse_connection(request):
    """
    Handle SSE connection for deprecated SSE transport.

    This endpoint establishes an SSE stream and runs the MCP server
    to handle client requests sent via POST to /sse/messages/.
    """
    async with sse_transport.connect_sse(
        request.scope, request.receive, request._send
    ) as (read_stream, write_stream):
        await mcp_server.run(
            read_stream,
            write_stream,
            mcp_server.create_initialization_options(),
        )
    # Return empty response after SSE stream closes
    return Response()


# Create Starlette app for SSE transport routes
sse_starlette_app = Starlette(
    routes=[
        Route("/sse", endpoint=handle_sse_connection, methods=["GET"]),
        Mount("/sse/messages/", app=sse_transport.handle_post_message),
    ]
)


def create_mcp_asgi_app():
    """
    Create an ASGI application that handles MCP requests.

    Supports two transports:
    - Streamable HTTP at /mcp (recommended, stateless mode)
    - SSE at /sse (deprecated, for backward compatibility)

    All requests are delegated to the appropriate transport handler.
    Telemetry context is set for each request to track client IP and transport.
    """

    async def app(scope, receive, send):
        if scope["type"] != "http":
            return

        path = scope.get("path", "")

        # Handle Streamable HTTP endpoint (recommended)
        if path == "/mcp/" or path == "/mcp":
            # Set telemetry context for this request
            client_ip = get_client_ip_from_scope(scope)
            set_request_context(client_ip=client_ip, transport="streamable_http")

            # Ensure session manager is running
            await lifespan_manager.ensure_started()

            manager = get_session_manager()
            try:
                await manager.handle_request(scope, receive, send)
            except Exception as e:
                logger.error(f"MCP Streamable HTTP request error: {e}")
                # Record error telemetry before clearing context
                record_mcp_request("/mcp", method=scope.get("method", "POST"))
                # Return error response
                await send(
                    {
                        "type": "http.response.start",
                        "status": 500,
                        "headers": [[b"content-type", b"application/json"]],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": json.dumps({"error": str(e)}).encode(),
                    }
                )
            finally:
                clear_request_context()

        # Handle deprecated SSE transport for backward compatibility
        elif path == "/sse" or path.startswith("/sse/"):
            # Set telemetry context for this request
            client_ip = get_client_ip_from_scope(scope)
            set_request_context(client_ip=client_ip, transport="sse")

            try:
                await sse_starlette_app(scope, receive, send)
            except Exception as e:
                logger.error(f"MCP SSE request error: {e}")
                # Record error telemetry before clearing context
                record_mcp_request("/sse", method=scope.get("method", "GET"))
                # Return error response
                await send(
                    {
                        "type": "http.response.start",
                        "status": 500,
                        "headers": [[b"content-type", b"application/json"]],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": json.dumps({"error": str(e)}).encode(),
                    }
                )
            finally:
                clear_request_context()

        else:
            # Return 404 with helpful information about available endpoints
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
                                "streamable_http": {
                                    "path": "/mcp",
                                    "methods": ["POST", "GET"],
                                    "description": "MCP Streamable HTTP endpoint (recommended)",
                                },
                                "sse": {
                                    "path": "/sse",
                                    "methods": ["GET"],
                                    "description": "MCP SSE endpoint (deprecated, for backward compatibility)",
                                },
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
    # Set telemetry context for stdio transport (no client IP available)
    set_request_context(client_ip=None, transport="stdio")
    try:
        async with stdio_server() as streams:
            await mcp_server.run(
                streams[0],  # read_stream
                streams[1],  # write_stream
                mcp_server.create_initialization_options(),
            )
    finally:
        clear_request_context()


if __name__ == "__main__":
    # Setup Django before running
    import os

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

    import django

    django.setup()

    asyncio.run(main())
