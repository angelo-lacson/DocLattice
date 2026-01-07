"""
MCP Telemetry module.

Provides telemetry tracking for MCP (Model Context Protocol) tool and resource usage.
Tracks usage statistics without capturing query content or outputs for privacy.
"""

from __future__ import annotations

import hashlib
import logging
from contextvars import ContextVar
from typing import Any

from config.telemetry import record_event

logger = logging.getLogger(__name__)

# Context variable to store request metadata (client IP, transport type)
# This allows the telemetry functions to access request context without
# needing to pass it through all function calls
_mcp_request_context: ContextVar[dict[str, Any]] = ContextVar(
    "mcp_request_context", default={}
)


def set_request_context(
    client_ip: str | None = None,
    transport: str = "unknown",
) -> None:
    """
    Set the request context for MCP telemetry.

    Should be called at the start of each MCP request handler to capture
    request metadata that will be included in telemetry events.

    Args:
        client_ip: The client's IP address (will be hashed for privacy,
                   raw IP passed to PostHog for geolocation only)
        transport: The transport type (e.g., 'streamable_http', 'sse', 'stdio')
    """
    _mcp_request_context.set({
        "client_ip": client_ip,  # Raw IP for PostHog geolocation ($ip property)
        "client_ip_hash": _hash_ip(client_ip) if client_ip else None,
        "transport": transport,
    })


def clear_request_context() -> None:
    """Clear the request context after handling a request."""
    _mcp_request_context.set({})


def _hash_ip(ip: str) -> str:
    """
    Hash an IP address for privacy.

    Uses SHA-256 to create a one-way hash that allows tracking unique clients
    without storing actual IP addresses.

    Args:
        ip: The IP address to hash

    Returns:
        First 16 characters of the hex-encoded SHA-256 hash
    """
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _get_request_context() -> dict[str, Any]:
    """Get the current request context."""
    return _mcp_request_context.get()


def record_mcp_tool_call(
    tool_name: str,
    success: bool = True,
    error_type: str | None = None,
) -> bool:
    """
    Record a telemetry event for an MCP tool call.

    Args:
        tool_name: Name of the tool that was called
        success: Whether the tool call succeeded
        error_type: Type of error if the call failed (e.g., 'ValueError', 'PermissionError')

    Returns:
        True if event was successfully queued, False otherwise
    """
    context = _get_request_context()

    properties = {
        "tool_name": tool_name,
        "success": success,
        "transport": context.get("transport", "unknown"),
    }

    # Include hashed client IP if available
    if context.get("client_ip_hash"):
        properties["client_ip_hash"] = context["client_ip_hash"]

    # Include raw IP for PostHog geolocation ($ip is a special PostHog property)
    # PostHog will resolve this to country/region and discard the raw IP
    if context.get("client_ip"):
        properties["$ip"] = context["client_ip"]

    # Include error type if call failed
    if not success and error_type:
        properties["error_type"] = error_type

    return record_event("mcp_tool_call", properties)


def record_mcp_resource_read(
    resource_type: str,
    success: bool = True,
    error_type: str | None = None,
) -> bool:
    """
    Record a telemetry event for an MCP resource read.

    Args:
        resource_type: Type of resource that was read (e.g., 'corpus', 'document')
        success: Whether the resource read succeeded
        error_type: Type of error if the read failed

    Returns:
        True if event was successfully queued, False otherwise
    """
    context = _get_request_context()

    properties = {
        "resource_type": resource_type,
        "success": success,
        "transport": context.get("transport", "unknown"),
    }

    # Include hashed client IP if available
    if context.get("client_ip_hash"):
        properties["client_ip_hash"] = context["client_ip_hash"]

    # Include raw IP for PostHog geolocation ($ip is a special PostHog property)
    if context.get("client_ip"):
        properties["$ip"] = context["client_ip"]

    # Include error type if read failed
    if not success and error_type:
        properties["error_type"] = error_type

    return record_event("mcp_resource_read", properties)


def record_mcp_request(
    endpoint: str,
    method: str = "POST",
) -> bool:
    """
    Record a telemetry event for an MCP endpoint request.

    This tracks overall MCP traffic without tool/resource specifics.

    Args:
        endpoint: The MCP endpoint path (e.g., '/mcp', '/sse')
        method: HTTP method used

    Returns:
        True if event was successfully queued, False otherwise
    """
    context = _get_request_context()

    properties = {
        "endpoint": endpoint,
        "method": method,
        "transport": context.get("transport", "unknown"),
    }

    # Include hashed client IP if available
    if context.get("client_ip_hash"):
        properties["client_ip_hash"] = context["client_ip_hash"]

    # Include raw IP for PostHog geolocation ($ip is a special PostHog property)
    if context.get("client_ip"):
        properties["$ip"] = context["client_ip"]

    return record_event("mcp_request", properties)


def get_client_ip_from_scope(scope: dict) -> str | None:
    """
    Extract client IP address from an ASGI scope.

    Checks X-Forwarded-For header first (for reverse proxy setups),
    then falls back to the direct client connection.

    Args:
        scope: ASGI scope dictionary

    Returns:
        Client IP address string, or None if not available
    """
    # Check headers for X-Forwarded-For (reverse proxy)
    headers = dict(scope.get("headers", []))

    # Headers are bytes in ASGI
    xff = headers.get(b"x-forwarded-for")
    if xff:
        # X-Forwarded-For can contain multiple IPs, take the first (original client)
        return xff.decode().split(",")[0].strip()

    # Check X-Real-IP header (common in nginx setups)
    x_real_ip = headers.get(b"x-real-ip")
    if x_real_ip:
        return x_real_ip.decode().strip()

    # Fall back to direct client connection
    client = scope.get("client")
    if client and len(client) >= 1:
        return client[0]

    return None
