"""
Tests for Auth0 JWKS caching functionality.

This module tests the JWKS cache in config/graphql_auth0_auth/utils.py to ensure:
1. JWKS is fetched from Auth0 on first request
2. Subsequent requests use cached data within TTL
3. Cache expires correctly after TTL
"""

from unittest.mock import MagicMock, patch

from config.graphql_auth0_auth.utils import (
    _JWKS_CACHE_TTL,
    _get_cached_jwks,
)


class TestJWKSCache:
    """Tests for the _get_cached_jwks function."""

    def setup_method(self):
        """Reset cache before each test."""
        # Import and reset the module-level cache
        import config.graphql_auth0_auth.utils as utils_module

        utils_module._jwks_cache = {"data": None, "expires_at": 0}

    @patch("config.graphql_auth0_auth.utils.requests.get")
    def test_first_request_fetches_from_auth0(self, mock_get):
        """First request should fetch JWKS from Auth0."""
        mock_jwks = {"keys": [{"kid": "test-key-id", "kty": "RSA"}]}
        mock_response = MagicMock()
        mock_response.json.return_value = mock_jwks
        mock_get.return_value = mock_response

        result = _get_cached_jwks("test-domain.auth0.com")

        assert result == mock_jwks
        mock_get.assert_called_once_with(
            "https://test-domain.auth0.com/.well-known/jwks.json", timeout=10
        )

    @patch("config.graphql_auth0_auth.utils.requests.get")
    def test_second_request_uses_cache(self, mock_get):
        """Second request within TTL should use cached data."""
        mock_jwks = {"keys": [{"kid": "test-key-id", "kty": "RSA"}]}
        mock_response = MagicMock()
        mock_response.json.return_value = mock_jwks
        mock_get.return_value = mock_response

        # First request
        result1 = _get_cached_jwks("test-domain.auth0.com")
        # Second request (should use cache)
        result2 = _get_cached_jwks("test-domain.auth0.com")

        assert result1 == mock_jwks
        assert result2 == mock_jwks
        # Should only be called once (first request)
        assert mock_get.call_count == 1

    @patch("config.graphql_auth0_auth.utils.requests.get")
    @patch("config.graphql_auth0_auth.utils.time.time")
    def test_cache_expires_after_ttl(self, mock_time, mock_get):
        """Cache should expire after TTL and fetch fresh data."""
        mock_jwks_v1 = {"keys": [{"kid": "key-v1", "kty": "RSA"}]}
        mock_jwks_v2 = {"keys": [{"kid": "key-v2", "kty": "RSA"}]}

        mock_response = MagicMock()
        mock_response.json.side_effect = [mock_jwks_v1, mock_jwks_v2]
        mock_get.return_value = mock_response

        # First request at time 0
        mock_time.return_value = 0
        result1 = _get_cached_jwks("test-domain.auth0.com")

        # Second request after TTL expires
        mock_time.return_value = _JWKS_CACHE_TTL + 1
        result2 = _get_cached_jwks("test-domain.auth0.com")

        assert result1 == mock_jwks_v1
        assert result2 == mock_jwks_v2
        # Should be called twice (cache expired)
        assert mock_get.call_count == 2

    @patch("config.graphql_auth0_auth.utils.requests.get")
    @patch("config.graphql_auth0_auth.utils.time.time")
    def test_cache_valid_just_before_expiry(self, mock_time, mock_get):
        """Cache should still be valid just before TTL expires."""
        mock_jwks = {"keys": [{"kid": "test-key-id", "kty": "RSA"}]}
        mock_response = MagicMock()
        mock_response.json.return_value = mock_jwks
        mock_get.return_value = mock_response

        # First request at time 0
        mock_time.return_value = 0
        _get_cached_jwks("test-domain.auth0.com")

        # Second request just before TTL expires
        mock_time.return_value = _JWKS_CACHE_TTL - 1
        result = _get_cached_jwks("test-domain.auth0.com")

        assert result == mock_jwks
        # Should only be called once (cache still valid)
        assert mock_get.call_count == 1
