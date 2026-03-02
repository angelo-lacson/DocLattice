"""
Protocol-specific rate limiting adapters.

Thin wrappers around the shared engine for each protocol:
- ``graphql_ratelimit`` / ``graphql_ratelimit_dynamic`` — GraphQL resolvers
- ``check_ws_rate_limit`` — WebSocket consumers
- ``check_mcp_rate_limit`` — MCP ASGI application
- ``view_ratelimit`` — Standard Django views
"""

from __future__ import annotations

import functools
import json
import logging
from typing import Any, Callable

from django.conf import settings
from graphql import GraphQLError

from config.ratelimit.engine import (
    PERIOD_NAMES,
    ais_rate_limited,
    is_rate_limited,
    parse_rate,
)
from config.ratelimit.keys import (
    get_client_ip_from_http,
    get_client_ip_from_scope,
    get_rate_limit_key,
)
from config.ratelimit.rates import RateLimits, get_tier_adjusted_rate

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  GraphQL error class (kept here as it's protocol-specific)
# ---------------------------------------------------------------------------


class RateLimitExceeded(GraphQLError):
    """Custom exception for rate limit exceeded errors in GraphQL."""

    def __init__(self, message: str = "Rate limit exceeded. Please try again later."):
        super().__init__(message)


# ---------------------------------------------------------------------------
#  Error message formatting
# ---------------------------------------------------------------------------


def _format_exceeded_message(rate: str) -> str:
    """Build a human-readable rate limit exceeded message."""
    try:
        count, _ = parse_rate(rate)
        period_key = rate.split("/")[1]
        period_name = PERIOD_NAMES.get(period_key, "period")
        return (
            f"Limit exceeded: Max {count} requests per {period_name}. "
            f"Please try again later."
        )
    except (ValueError, IndexError):
        return "Rate limit exceeded. Please try again later."


# ---------------------------------------------------------------------------
#  GraphQL decorators
# ---------------------------------------------------------------------------


def graphql_ratelimit(
    key: str | Callable | None = None,
    rate: str = "10/m",
    block: bool = True,
    group: str | None = None,
):
    """Rate limit decorator for GraphQL resolvers.

    Args:
        key: Key strategy — ``None``/``"user_or_ip"`` (default), ``"ip"``,
             ``"user"``, or a custom callable ``(root, info, **kwargs) -> str``.
        rate: Rate limit string (e.g. ``"10/m"``).
        block: Whether to raise ``RateLimitExceeded`` when the limit is hit.
        group: Cache group name (defaults to the decorated function's name).
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(root, info, *args, **kwargs):
            if not info or not hasattr(info, "context"):
                if not getattr(settings, "TESTING", False):
                    logger.warning(
                        "Rate limiting skipped for %s: "
                        "info object is None or missing context.",
                        func.__name__,
                    )
                return func(root, info, *args, **kwargs)

            request = info.context

            if not request or not hasattr(request, "META"):
                if not getattr(settings, "TESTING", False):
                    logger.warning(
                        "Rate limiting skipped for %s: "
                        "context is not a Django request object (type=%s).",
                        func.__name__,
                        type(request).__name__,
                    )
                return func(root, info, *args, **kwargs)

            if getattr(settings, "RATELIMIT_DISABLE", False):
                return func(root, info, *args, **kwargs)

            # Resolve the rate limit key
            limit_key = _resolve_graphql_key(key, root, info, request, block, **kwargs)
            if limit_key is None:
                # user key strategy with anonymous user and block=False
                return func(root, info, *args, **kwargs)

            grp = group or func.__name__

            is_limited = is_rate_limited(grp, limit_key, rate)

            if is_limited and block:
                logger.warning(
                    "Rate limit exceeded for %s — Key: %s, Rate: %s",
                    func.__name__,
                    limit_key,
                    rate,
                )
                raise RateLimitExceeded(_format_exceeded_message(rate))

            return func(root, info, *args, **kwargs)

        return wrapper

    return decorator


def graphql_ratelimit_dynamic(
    get_rate: Callable[[Any, Any], str],
    key: str | Callable | None = None,
    block: bool = True,
    group: str | None = None,
):
    """Dynamic rate limit decorator that determines the rate from the user tier.

    Args:
        get_rate: Callable taking ``(root, info)`` and returning a rate string.
        key: Key strategy (same options as ``graphql_ratelimit``).
        block: Whether to raise on limit exceeded.
        group: Cache group name.
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(root, info, *args, **kwargs):
            if not info or not hasattr(info, "context"):
                if not getattr(settings, "TESTING", False):
                    logger.warning(
                        "Dynamic rate limiting skipped for %s: "
                        "info object is None or missing context.",
                        func.__name__,
                    )
                return func(root, info, *args, **kwargs)

            request = info.context

            if not request or not hasattr(request, "META"):
                if not getattr(settings, "TESTING", False):
                    logger.warning(
                        "Dynamic rate limiting skipped for %s: "
                        "context is not a Django request object (type=%s).",
                        func.__name__,
                        type(request).__name__,
                    )
                return func(root, info, *args, **kwargs)

            if getattr(settings, "RATELIMIT_DISABLE", False):
                return func(root, info, *args, **kwargs)

            rate = get_rate(root, info)

            limit_key = _resolve_graphql_key(key, root, info, request, block, **kwargs)
            if limit_key is None:
                return func(root, info, *args, **kwargs)

            grp = group or func.__name__

            is_limited = is_rate_limited(grp, limit_key, rate)

            if is_limited and block:
                logger.warning(
                    "Rate limit exceeded for %s — Key: %s, Rate: %s",
                    func.__name__,
                    limit_key,
                    rate,
                )
                raise RateLimitExceeded(_format_exceeded_message(rate))

            return func(root, info, *args, **kwargs)

        return wrapper

    return decorator


def _resolve_graphql_key(key, root, info, request, block: bool, **kwargs) -> str | None:
    """Resolve the rate limit key for a GraphQL request.

    Returns ``None`` when the ``"user"`` strategy is used with an anonymous
    user and ``block=False`` (indicating the request should be let through).
    """
    if key is None or key == "user_or_ip":
        ip = get_client_ip_from_http(request)
        return get_rate_limit_key(user=request.user, ip=ip)

    if key == "ip":
        ip = get_client_ip_from_http(request)
        return get_rate_limit_key(ip=ip, strategy="ip")

    if key == "user":
        if not request.user or not getattr(request.user, "is_authenticated", False):
            if block:
                raise GraphQLError("Authentication required for this operation")
            return None
        return get_rate_limit_key(user=request.user, strategy="user")

    if callable(key):
        return key(root, info, **kwargs)

    # Static key string
    return str(key)


# ---------------------------------------------------------------------------
#  WebSocket adapter
# ---------------------------------------------------------------------------


async def check_ws_rate_limit(
    consumer: Any,
    operation_type: str,
    group_suffix: str | None = None,
) -> bool:
    """Check rate limit for a WebSocket consumer.

    Sends a ``RATE_LIMITED`` error message to the client if the limit is
    exceeded but does **not** close the connection (per design decision).

    Args:
        consumer: A Django Channels ``AsyncWebsocketConsumer`` instance.
        operation_type: ``RateLimits`` attribute name (e.g. ``"AI_QUERY"``).
        group_suffix: Optional override for the cache group suffix.
                      Defaults to ``operation_type``.

    Returns:
        ``True`` if rate limited (caller should abort processing),
        ``False`` if the request is allowed.
    """
    user = consumer.scope.get("user")
    ip = get_client_ip_from_scope(consumer.scope)
    limit_key = get_rate_limit_key(user=user, ip=ip)

    base_rate = getattr(RateLimits, operation_type, RateLimits.READ_MEDIUM)
    rate = get_tier_adjusted_rate(user, base_rate)

    grp = f"ws:{group_suffix or operation_type}"

    is_limited = await ais_rate_limited(grp, limit_key, rate)

    if is_limited:
        try:
            count, period_seconds = parse_rate(rate)
            period_key = rate.split("/")[1]
            period_name = PERIOD_NAMES.get(period_key, "period")
        except (ValueError, IndexError):
            count, period_seconds, period_name = "?", 60, "period"

        await consumer.send(
            text_data=json.dumps(
                {
                    "type": "RATE_LIMITED",
                    "error": (
                        f"Rate limit exceeded. "
                        f"Max {count} requests per {period_name}."
                    ),
                    "retry_after": period_seconds,
                }
            )
        )
        logger.warning(
            "WS rate limit exceeded: %s for key=%s, rate=%s",
            operation_type,
            limit_key,
            rate,
        )
        return True

    return False


# ---------------------------------------------------------------------------
#  MCP adapter
# ---------------------------------------------------------------------------


# Maps MCP tool names to existing rate limit categories
MCP_TOOL_RATE_MAP: dict[str, str] = {
    "list_public_corpuses": "READ_LIGHT",
    "list_documents": "READ_MEDIUM",
    "get_document_text": "READ_MEDIUM",
    "list_annotations": "READ_MEDIUM",
    "search_corpus": "READ_HEAVY",
    "list_threads": "READ_MEDIUM",
    "get_thread_messages": "READ_MEDIUM",
    "get_corpus_info": "READ_LIGHT",
}


async def check_mcp_rate_limit(
    scope: dict[str, Any],
    tool_name: str | None = None,
) -> tuple[bool, str]:
    """Check MCP rate limits: global cap + optional per-tool limit.

    MCP is always anonymous, so no tier adjustment is applied.

    Args:
        scope: ASGI scope dictionary (used for IP extraction).
        tool_name: Optional MCP tool name for per-tool rate limiting.

    Returns:
        Tuple of ``(is_limited, error_message)``.  When ``is_limited`` is
        ``False``, ``error_message`` is an empty string.
    """
    ip = get_client_ip_from_scope(scope)
    limit_key = f"ip:{ip}"

    # 1. Global cap
    global_rate = getattr(RateLimits, "MCP_GLOBAL", "100/m")
    if await ais_rate_limited("mcp:global", limit_key, global_rate):
        return True, "Rate limit exceeded. Please wait before making more requests."

    # 2. Per-tool limit
    if tool_name and tool_name in MCP_TOOL_RATE_MAP:
        category = MCP_TOOL_RATE_MAP[tool_name]
        tool_rate = getattr(RateLimits, category)
        if await ais_rate_limited(f"mcp:tool:{tool_name}", limit_key, tool_rate):
            return True, f"Rate limit exceeded for {tool_name}."

    return False, ""


# ---------------------------------------------------------------------------
#  Django view decorator
# ---------------------------------------------------------------------------


def view_ratelimit(
    key: str | Callable | None = None,
    rate: str = "10/m",
    block: bool = False,
    group: str | None = None,
):
    """Rate limit decorator for standard Django views.

    Drop-in replacement for ``django_ratelimit.decorators.ratelimit``.
    Sets ``request.limited = True`` when the limit is exceeded (compatible
    with ``block=False`` usage pattern in admin auth views).

    Args:
        key: Key function ``(group, request) -> str``, or ``None`` for
             IP-based keying.
        rate: Rate limit string (e.g. ``"5/m"``).
        block: If ``True``, return an HTTP 429 response automatically.
        group: Cache group name (defaults to the decorated function's name).
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(request_or_self, *args, **kwargs):
            # Support both function views and method views (e.g. View.get)
            if hasattr(request_or_self, "META"):
                request = request_or_self
            elif args and hasattr(args[0], "META"):
                request = args[0]
            else:
                # Can't determine request — skip rate limiting
                return func(request_or_self, *args, **kwargs)

            if getattr(settings, "RATELIMIT_DISABLE", False):
                request.limited = False
                return func(request_or_self, *args, **kwargs)

            # Resolve key
            grp = group or func.__name__
            if callable(key):
                limit_key = key(grp, request)
            else:
                limit_key = f"ip:{get_client_ip_from_http(request)}"

            is_limited = is_rate_limited(grp, limit_key, rate)
            request.limited = is_limited

            if is_limited and block:
                from django.http import HttpResponse

                return HttpResponse(
                    "Too many requests. Please try again later.",
                    status=429,
                    content_type="text/plain",
                )

            return func(request_or_self, *args, **kwargs)

        return wrapper

    return decorator
