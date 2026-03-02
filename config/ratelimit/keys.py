"""
Unified identity resolution for rate limiting.

Provides IP extraction from three context types (Django ``HttpRequest``,
ASGI scope for WebSocket, ASGI scope for MCP) and a unified key builder
that maps user/IP into a cache key string.
"""

from __future__ import annotations

import logging
from typing import Any

from config.ratelimit.engine import UNKNOWN_IP

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  IP extraction — one function per request context type
# ---------------------------------------------------------------------------


def _pick_xff_ip(xff_value: str) -> str:
    """Select the trusted IP from an ``X-Forwarded-For`` header value.

    When ``RATELIMIT_PROXIES_COUNT`` is set to *N* (> 0), the entry at
    position ``-N`` from the right is returned (the IP appended by the
    Nth trusted proxy).  The default is ``1`` (rightmost entry = single
    proxy).  Set to ``0`` only for backwards compatibility when the app
    receives connections directly without a reverse proxy.

    Args:
        xff_value: The raw ``X-Forwarded-For`` header value (comma-separated IPs).

    Returns:
        The selected IP string, or :data:`UNKNOWN_IP` if the header is empty.
    """
    from django.conf import settings

    parts = [p.strip() for p in xff_value.split(",") if p.strip()]
    if not parts:
        return UNKNOWN_IP

    proxies_count = getattr(settings, "RATELIMIT_PROXIES_COUNT", 1)
    if proxies_count > 0:
        # Trust the Nth entry from the right (1 = rightmost = single proxy)
        index = -proxies_count
        try:
            return parts[index]
        except IndexError:
            # Fewer entries than proxies_count — use leftmost as safe fallback
            return parts[0]

    # Default: leftmost (client-set, backwards-compatible)
    return parts[0]


def get_client_ip_from_http(request) -> str:
    """Extract client IP from a Django ``HttpRequest``.

    Checks ``HTTP_X_FORWARDED_FOR`` first (for reverse-proxy setups like
    Traefik/nginx), then falls back to ``REMOTE_ADDR``.

    .. note::
        ``RATELIMIT_PROXIES_COUNT`` controls which ``X-Forwarded-For``
        entry is used.  The default is ``1`` (rightmost entry = single
        proxy such as Traefik/nginx).  ``2`` = second from right (two
        proxies, e.g. CDN + load balancer).  Set to ``0`` only as a
        backwards-compatible escape hatch when the app has no reverse
        proxy — that mode uses the **leftmost** entry which is
        **client-spoofable**.

    Args:
        request: A Django ``HttpRequest`` (or any object with a ``META`` dict).

    Returns:
        Client IP address string, or ``"unknown"`` if unavailable.
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return _pick_xff_ip(x_forwarded_for)
    return request.META.get("REMOTE_ADDR", UNKNOWN_IP)


def get_client_ip_from_scope(scope: dict[str, Any]) -> str:
    """Extract client IP from an ASGI scope dict.

    Uses the same ``RATELIMIT_PROXIES_COUNT`` setting as
    :func:`get_client_ip_from_http` to select the trusted entry from
    ``X-Forwarded-For``.

    Args:
        scope: ASGI scope dictionary.

    Returns:
        Client IP address string, or ``"unknown"`` if unavailable.
    """
    headers = dict(scope.get("headers", []))

    # X-Forwarded-For (bytes in ASGI)
    xff = headers.get(b"x-forwarded-for")
    if xff:
        return _pick_xff_ip(xff.decode())

    # X-Real-IP (common in nginx setups)
    x_real_ip = headers.get(b"x-real-ip")
    if x_real_ip:
        return x_real_ip.decode().strip()

    # Direct client connection
    client = scope.get("client")
    if client and len(client) >= 1:
        return client[0]

    return UNKNOWN_IP


# ---------------------------------------------------------------------------
#  Unified rate limit key builder
# ---------------------------------------------------------------------------


def get_rate_limit_key(
    *,
    user: Any = None,
    ip: str = UNKNOWN_IP,
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
    """Check if a user object is authenticated, handling both property and method forms.

    The callable guard exists because ``is_authenticated`` was a method
    (``CallableBool``) prior to Django 1.10 and some third-party user
    models or test mocks may still use the legacy callable form.
    """
    is_auth = getattr(user, "is_authenticated", False)
    if callable(is_auth):
        return is_auth()
    return bool(is_auth)
