"""Permission utilities for the MCP server.

This module provides input validation, user handling, and rate limiting
for MCP server operations.
"""

import re

from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache

# Slug validation pattern - matches OpenContracts format (A-Z, a-z, 0-9, hyphen)
SLUG_PATTERN = re.compile(r"^[A-Za-z0-9\-]+$")


def validate_slug(slug: str) -> bool:
    """Validate slug format matches OpenContracts pattern (A-Z, a-z, 0-9, hyphen).

    Args:
        slug: The slug string to validate

    Returns:
        True if slug is valid, False otherwise
    """
    return bool(SLUG_PATTERN.match(slug))


def sanitize_and_validate_slugs(
    corpus_slug: str, document_slug: str | None = None
) -> tuple[str, str | None]:
    """Validate and return slugs, raising ValueError if invalid.

    Args:
        corpus_slug: The corpus slug to validate (required)
        document_slug: The document slug to validate (optional)

    Returns:
        Tuple of (corpus_slug, document_slug) if valid

    Raises:
        ValueError: If either slug is invalid
    """
    if not validate_slug(corpus_slug):
        raise ValueError(f"Invalid corpus slug: {corpus_slug}")
    if document_slug and not validate_slug(document_slug):
        raise ValueError(f"Invalid document slug: {document_slug}")
    return corpus_slug, document_slug


def get_anonymous_user() -> AnonymousUser:
    """Get Django's AnonymousUser for permission checks.

    Returns:
        AnonymousUser instance for use in permission checks
    """
    return AnonymousUser()


class RateLimiter:
    """Simple rate limiter for MCP requests using Django cache.

    This limiter uses a sliding window approach stored in Django's cache backend.
    """

    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        """Initialize the rate limiter.

        Args:
            max_requests: Maximum number of requests allowed in the time window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def check_rate_limit(self, client_id: str) -> bool:
        """Check if a request is allowed based on rate limits.

        Args:
            client_id: Unique identifier for the client making the request

        Returns:
            True if request is allowed, False if rate limited
        """
        key = f"mcp:ratelimit:{client_id}"
        current = cache.get(key, 0)
        if current >= self.max_requests:
            return False
        cache.set(key, current + 1, self.window_seconds)
        return True
