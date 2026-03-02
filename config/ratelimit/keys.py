"""
Unified identity resolution for rate limiting.

Provides IP extraction from three context types (Django ``HttpRequest``,
ASGI scope for WebSocket, ASGI scope for MCP) and a unified key builder
that maps user/IP into a cache key string.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  IP extraction — one function per request context type
# ---------------------------------------------------------------------------


def get_client_ip_from_http(request) -> str:
    """Extract client IP from a Django ``HttpRequest``.

    Checks ``HTTP_X_FORWARDED_FOR`` first (for reverse-proxy setups like
    Traefik/nginx), then falls back to ``REMOTE_ADDR``.

    Args:
        request: A Django ``HttpRequest`` (or any object with a ``META`` dict).

    Returns:
        Client IP address string, or ``"unknown"`` if unavailable.
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def get_client_ip_from_scope(scope: dict[str, Any]) -> str:
    """Extract client IP from an ASGI scope dict.

    Used by both WebSocket consumers (Django Channels) and the MCP ASGI
    application.  Checks ``x-forwarded-for`` and ``x-real-ip`` headers
    before falling back to the direct ``client`` tuple.

    Args:
        scope: ASGI scope dictionary.

    Returns:
        Client IP address string, or ``"unknown"`` if unavailable.
    """
    headers = dict(scope.get("headers", []))

    # X-Forwarded-For (bytes in ASGI)
    xff = headers.get(b"x-forwarded-for")
    if xff:
        return xff.decode().split(",")[0].strip()

    # X-Real-IP (common in nginx setups)
    x_real_ip = headers.get(b"x-real-ip")
    if x_real_ip:
        return x_real_ip.decode().strip()

    # Direct client connection
    client = scope.get("client")
    if client and len(client) >= 1:
        return client[0]

    return "unknown"


# ---------------------------------------------------------------------------
#  Unified rate limit key builder
# ---------------------------------------------------------------------------


def get_rate_limit_key(
    *,
    user: Any = None,
    ip: str = "unknown",
    strategy: str = "user_or_ip",
) -> str:
    """Build a rate limit cache key from user and/or IP.

    Args:
        user: Django user instance (or ``None`` / ``AnonymousUser``).
        ip: Client IP address string.
        strategy: Key strategy:
            - ``"user_or_ip"`` (default): ``user:{id}`` if authenticated,
              else ``ip:{ip}``.
            - ``"ip"``: always ``ip:{ip}``.
            - ``"user"``: always ``user:{id}`` (raises if anonymous).

    Returns:
        A string suitable for use as the ``key`` argument to
        :func:`~config.ratelimit.engine.is_rate_limited`.

    Raises:
        ValueError: If strategy is ``"user"`` and no authenticated user
                    is available.
    """
    if strategy == "ip":
        return f"ip:{ip}"

    if strategy == "user":
        if not user or not _is_authenticated(user):
            raise ValueError("Authenticated user required for 'user' key strategy")
        return f"user:{user.id}"

    # Default: user_or_ip
    if user and _is_authenticated(user):
        return f"user:{user.id}"
    return f"ip:{ip}"


def _is_authenticated(user: Any) -> bool:
    """Check if a user object is authenticated, handling both property and method forms."""
    is_auth = getattr(user, "is_authenticated", False)
    if callable(is_auth):
        return is_auth()
    return bool(is_auth)
