"""
Logging utilities for OpenContracts.

Provides helper functions for safe logging that avoid exposing sensitive data.
"""

from typing import Any

# Keys that should be redacted in logs (case-insensitive partial match)
SENSITIVE_KEY_PATTERNS = ("key", "secret", "password", "token", "credential")


def redact_sensitive_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    """
    Redact sensitive values from a kwargs dict before logging.

    Matches keys containing common sensitive patterns like 'api_key', 'secret',
    'password', 'token', etc. (case-insensitive).

    Args:
        kwargs: Dictionary of keyword arguments that may contain sensitive values.

    Returns:
        A new dictionary with sensitive values replaced with '***'.

    Example:
        >>> redact_sensitive_kwargs({"api_key": "sk-123", "verbose": True})
        {"api_key": "***", "verbose": True}
    """
    return {
        k: (
            "***"
            if any(pattern in k.lower() for pattern in SENSITIVE_KEY_PATTERNS)
            else v
        )
        for k, v in kwargs.items()
    }
