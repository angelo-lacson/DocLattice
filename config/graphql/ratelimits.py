"""
Rate limiting utilities for GraphQL mutations and queries.

This module provides decorators and utilities for rate limiting GraphQL operations
using django-ratelimit. It supports both authenticated and anonymous users with
different rate limits.
"""

import functools
import logging
from typing import Callable, Optional, Union

from django.conf import settings
from django_ratelimit import ALL
from django_ratelimit.core import is_ratelimited
from graphql import GraphQLError

logger = logging.getLogger(__name__)


class RateLimitExceeded(GraphQLError):
    """Custom exception for rate limit exceeded errors in GraphQL."""

    def __init__(self, message: str = "Rate limit exceeded. Please try again later."):
        super().__init__(message)


def get_client_ip(request) -> str:
    """
    Get the client's IP address from the request.
    Handles X-Forwarded-For header for requests behind proxies.
    """
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        # X-Forwarded-For can contain multiple IPs, take the first one
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR", "")
    return ip


def graphql_ratelimit(
    key: Optional[str] = None,
    rate: str = "10/m",
    method: Union[str, list] = ALL,
    block: bool = True,
    group: Optional[str] = None,
):
    """
    Rate limit decorator for GraphQL resolvers.

    Args:
        key: The key to use for rate limiting. Can be:
            - None: Uses user ID for authenticated users, IP for anonymous
            - "ip": Always uses IP address
            - "user": Always uses user ID (fails for anonymous users)
            - "user_or_ip": Uses user ID if authenticated, IP otherwise
            - Custom callable that takes (root, info, **kwargs) and returns a string
        rate: Rate limit string (e.g., "10/m" for 10 per minute, "100/h" for 100 per hour)
        method: HTTP method(s) to apply rate limiting to
        block: Whether to block requests that exceed the limit
        group: Optional group name for shared rate limits

    Examples:
        @graphql_ratelimit(rate="5/m")  # 5 requests per minute per user/IP
        def resolve_expensive_query(root, info, **kwargs):
            ...

        @graphql_ratelimit(key="ip", rate="100/h")  # 100 requests per hour per IP
        def mutate_create_document(root, info, **kwargs):
            ...
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(root, info, *args, **kwargs):
            request = info.context

            # Skip rate limiting in tests if configured
            if getattr(settings, "RATELIMIT_DISABLE", False):
                return func(root, info, *args, **kwargs)

            # Determine the rate limit key
            if key is None or key == "user_or_ip":
                if request.user and request.user.is_authenticated:
                    limit_key = f"user:{request.user.id}"
                else:
                    limit_key = f"ip:{get_client_ip(request)}"
            elif key == "ip":
                limit_key = f"ip:{get_client_ip(request)}"
            elif key == "user":
                if not request.user or not request.user.is_authenticated:
                    if block:
                        raise GraphQLError("Authentication required for this operation")
                    return func(root, info, *args, **kwargs)
                limit_key = f"user:{request.user.id}"
            elif callable(key):
                limit_key = key(root, info, **kwargs)
            else:
                limit_key = str(key)

            # Add group to key if specified
            if group:
                # When using a group, don't include function name so all functions in the group share the limit
                cache_key = f"rl:{group}:{limit_key}"
            else:
                cache_key = f"rl:{limit_key}:{func.__name__}"

            # Check if rate limited
            is_limited = is_ratelimited(
                request=request,
                group=group or func.__name__,
                fn=func,
                key=lambda g, r: cache_key,  # Takes group and request
                rate=rate,
                method=method,
                increment=True,
            )

            if is_limited and block:
                # Log the rate limit hit
                logger.warning(
                    f"Rate limit exceeded for {func.__name__} - Key: {limit_key}, Rate: {rate}"
                )

                # Get more detailed error message
                rate_parts = rate.split("/")
                if len(rate_parts) == 2:
                    limit_count = rate_parts[0]
                    period = {
                        "s": "second",
                        "m": "minute",
                        "h": "hour",
                        "d": "day",
                    }.get(rate_parts[1], "period")
                    message = f"Limit exceeded: Max {limit_count} requests per {period}. Please try again later."
                else:
                    message = "Rate limit exceeded. Please try again later."

                raise RateLimitExceeded(message)

            # Set rate limit headers on response if available
            if hasattr(request, "META"):
                request.META["X-RateLimit-Limit"] = rate
                request.META["X-RateLimit-Remaining"] = (
                    "N/A"  # Would need custom implementation
                )

            return func(root, info, *args, **kwargs)

        return wrapper

    return decorator


def graphql_ratelimit_dynamic(
    get_rate: Callable[[any, any], str],
    key: Optional[str] = None,
    method: Union[str, list] = ALL,
    block: bool = True,
    group: Optional[str] = None,
):
    """
    Dynamic rate limit decorator that determines the rate based on user type.

    Args:
        get_rate: Callable that takes (root, info) and returns a rate string
        Other args same as graphql_ratelimit

    Example:
        def get_user_rate(root, info):
            user = info.context.user
            if user.is_superuser:
                return "1000/h"
            elif user.is_authenticated:
                return "100/h"
            else:
                return "10/h"

        @graphql_ratelimit_dynamic(get_rate=get_user_rate)
        def resolve_documents(root, info, **kwargs):
            ...
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(root, info, *args, **kwargs):
            rate = get_rate(root, info)

            # Apply the rate limit with the dynamic rate
            limited_func = graphql_ratelimit(
                key=key,
                rate=rate,
                method=method,
                block=block,
                group=group,
            )(func)

            return limited_func(root, info, *args, **kwargs)

        return wrapper

    return decorator


# Predefined rate limit configurations
class RateLimits:
    """Common rate limit configurations for different operation types."""

    # Default values
    _defaults = {
        # Authentication operations
        "AUTH_LOGIN": "5/m",  # 5 login attempts per minute
        "AUTH_REGISTER": "3/m",  # 3 registration attempts per minute
        "AUTH_PASSWORD_RESET": "3/h",  # 3 password reset requests per hour
        # Read operations
        "READ_LIGHT": "100/m",  # Light queries (single object fetches)
        "READ_MEDIUM": "30/m",  # Medium queries (filtered lists)
        "READ_HEAVY": "10/m",  # Heavy queries (complex aggregations)
        # Write operations
        "WRITE_LIGHT": "30/m",  # Light mutations (updates, deletes)
        "WRITE_MEDIUM": "10/m",  # Medium mutations (create with validation)
        "WRITE_HEAVY": "5/m",  # Heavy mutations (bulk operations, file uploads)
        # AI/Analysis operations
        "AI_ANALYSIS": "5/m",  # AI analysis requests
        "AI_EXTRACT": "10/m",  # AI extraction requests
        "AI_QUERY": "20/m",  # AI query requests
        # Export/Import operations
        "EXPORT": "5/h",  # Export operations
        "IMPORT": "10/h",  # Import operations
        # Admin operations
        "ADMIN_OPERATION": "100/m",  # Admin operations (higher limit)
    }

    def __init__(self):
        # Apply overrides from settings if available
        overrides = getattr(settings, "RATE_LIMIT_OVERRIDES", {})
        for key, default_value in self._defaults.items():
            # Use override if available, otherwise use default
            setattr(self, key, overrides.get(key, default_value))

    def __getattr__(self, name):
        # Fallback for any attributes not explicitly set
        if name in self._defaults:
            return self._defaults[name]
        raise AttributeError(
            f"'{self.__class__.__name__}' object has no attribute '{name}'"
        )


# Create a singleton instance
RateLimits = RateLimits()


def get_user_tier_rate(operation_type: str) -> Callable:
    """
    Returns a function that determines rate limits based on user tier.

    Args:
        operation_type: Type of operation from RateLimits class

    Returns:
        Function that takes (root, info) and returns appropriate rate string
    """

    def get_rate(root, info):
        user = info.context.user
        base_rate = getattr(RateLimits, operation_type, RateLimits.READ_MEDIUM)

        # Parse base rate
        rate_parts = base_rate.split("/")
        if len(rate_parts) != 2:
            return base_rate

        base_count = int(rate_parts[0])
        period = rate_parts[1]

        # Adjust based on user type
        if user and hasattr(user, "is_superuser") and user.is_superuser:
            # Superusers get 10x the limit
            count = base_count * 10
        elif user and hasattr(user, "is_authenticated"):
            # Check if is_authenticated is a property/method and get its value
            is_auth = getattr(user, "is_authenticated", False)
            if callable(is_auth):
                is_auth = is_auth()
            if is_auth:
                # Authenticated users get 2x the limit
                count = base_count * 2
            else:
                # Anonymous users get the base limit
                count = base_count
        else:
            # Anonymous users get the base limit
            count = base_count

        # Check for usage-capped users (if this attribute exists)
        if user and hasattr(user, "is_usage_capped") and user.is_usage_capped:
            # Usage-capped users get half the limit
            count = max(1, count // 2)

        return f"{count}/{period}"

    return get_rate
