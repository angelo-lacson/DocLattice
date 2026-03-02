"""Tests for the unified rate limiting system (config.ratelimit).

Covers the core engine, identity resolution, rate definitions,
and protocol-specific adapters (WebSocket, MCP, Django views).
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.test import TestCase, override_settings

from config.ratelimit.decorators import (
    MCP_TOOL_RATE_MAP,
    RateLimitExceeded,
    check_mcp_rate_limit,
    check_ws_rate_limit,
    graphql_ratelimit,
    view_ratelimit,
)
from config.ratelimit.engine import is_rate_limited, parse_rate
from config.ratelimit.keys import (
    get_client_ip_from_http,
    get_client_ip_from_scope,
    get_rate_limit_key,
)
from config.ratelimit.rates import (
    RateLimits,
    get_tier_adjusted_rate,
)

User = get_user_model()


# =============================================================================
#  Engine tests
# =============================================================================


class ParseRateTestCase(TestCase):
    """Test rate string parsing."""

    def test_parse_seconds(self):
        self.assertEqual(parse_rate("5/s"), (5, 1))

    def test_parse_minutes(self):
        self.assertEqual(parse_rate("100/m"), (100, 60))

    def test_parse_hours(self):
        self.assertEqual(parse_rate("10/h"), (10, 3600))

    def test_parse_days(self):
        self.assertEqual(parse_rate("1/d"), (1, 86400))

    def test_invalid_rate_raises(self):
        with self.assertRaises(ValueError):
            parse_rate("invalid")

    def test_invalid_period_raises(self):
        with self.assertRaises(ValueError):
            parse_rate("10/x")


@override_settings(RATELIMIT_DISABLE=False)
class IsRateLimitedTestCase(TestCase):
    """Test the core rate limiting engine."""

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("config.ratelimit.engine.time")
    def test_allows_requests_under_limit(self, mock_time):
        mock_time.time.return_value = 1000000.0
        for _ in range(5):
            self.assertFalse(is_rate_limited("test", "key1", "5/m"))

    @patch("config.ratelimit.engine.time")
    def test_blocks_requests_over_limit(self, mock_time):
        mock_time.time.return_value = 1000000.0
        for _ in range(5):
            is_rate_limited("test", "key1", "5/m")
        self.assertTrue(is_rate_limited("test", "key1", "5/m"))

    @patch("config.ratelimit.engine.time")
    def test_different_keys_independent(self, mock_time):
        mock_time.time.return_value = 1000000.0
        for _ in range(5):
            is_rate_limited("test", "key_a", "5/m")
        # key_a is exhausted
        self.assertTrue(is_rate_limited("test", "key_a", "5/m"))
        # key_b is fresh
        self.assertFalse(is_rate_limited("test", "key_b", "5/m"))

    @patch("config.ratelimit.engine.time")
    def test_different_groups_independent(self, mock_time):
        mock_time.time.return_value = 1000000.0
        for _ in range(5):
            is_rate_limited("group_a", "key", "5/m")
        self.assertTrue(is_rate_limited("group_a", "key", "5/m"))
        self.assertFalse(is_rate_limited("group_b", "key", "5/m"))

    @patch("config.ratelimit.engine.time")
    def test_window_rollover_resets_counter(self, mock_time):
        mock_time.time.return_value = 1000000.0
        for _ in range(5):
            is_rate_limited("test", "key", "5/m")
        self.assertTrue(is_rate_limited("test", "key", "5/m"))

        # Advance to next window (60s later)
        mock_time.time.return_value = 1000060.0
        self.assertFalse(is_rate_limited("test", "key", "5/m"))

    @patch("config.ratelimit.engine.time")
    def test_no_increment_flag(self, mock_time):
        mock_time.time.return_value = 1000000.0
        for _ in range(5):
            is_rate_limited("test", "key", "5/m")
        # Check without incrementing — should report limited
        self.assertTrue(is_rate_limited("test", "key", "5/m", increment=False))

    @override_settings(RATELIMIT_DISABLE=True)
    def test_disabled_always_allows(self):
        for _ in range(100):
            self.assertFalse(is_rate_limited("test", "key", "1/m"))


# =============================================================================
#  Key resolution tests
# =============================================================================


class GetClientIpFromHttpTestCase(TestCase):
    """Test IP extraction from Django HttpRequest."""

    def test_forwarded_for(self):
        request = MagicMock()
        request.META = {"HTTP_X_FORWARDED_FOR": "1.2.3.4, 5.6.7.8"}
        self.assertEqual(get_client_ip_from_http(request), "1.2.3.4")

    def test_remote_addr(self):
        request = MagicMock()
        request.META = {"REMOTE_ADDR": "9.8.7.6"}
        self.assertEqual(get_client_ip_from_http(request), "9.8.7.6")

    def test_unknown_fallback(self):
        request = MagicMock()
        request.META = {}
        self.assertEqual(get_client_ip_from_http(request), "unknown")


class GetClientIpFromScopeTestCase(TestCase):
    """Test IP extraction from ASGI scope."""

    def test_forwarded_for(self):
        scope = {"headers": [(b"x-forwarded-for", b"1.2.3.4, 5.6.7.8")]}
        self.assertEqual(get_client_ip_from_scope(scope), "1.2.3.4")

    def test_real_ip(self):
        scope = {"headers": [(b"x-real-ip", b"10.0.0.1")]}
        self.assertEqual(get_client_ip_from_scope(scope), "10.0.0.1")

    def test_client_tuple(self):
        scope = {"headers": [], "client": ("192.168.1.1", 12345)}
        self.assertEqual(get_client_ip_from_scope(scope), "192.168.1.1")

    def test_unknown_fallback(self):
        scope = {}
        self.assertEqual(get_client_ip_from_scope(scope), "unknown")


class GetRateLimitKeyTestCase(TestCase):
    """Test rate limit key building."""

    def test_authenticated_user_or_ip(self):
        user = MagicMock()
        user.is_authenticated = True
        user.id = 42
        self.assertEqual(
            get_rate_limit_key(user=user, ip="1.2.3.4"),
            "user:42",
        )

    def test_anonymous_user_or_ip(self):
        user = AnonymousUser()
        self.assertEqual(
            get_rate_limit_key(user=user, ip="1.2.3.4"),
            "ip:1.2.3.4",
        )

    def test_ip_strategy(self):
        user = MagicMock()
        user.is_authenticated = True
        user.id = 42
        self.assertEqual(
            get_rate_limit_key(user=user, ip="1.2.3.4", strategy="ip"),
            "ip:1.2.3.4",
        )

    def test_user_strategy_with_user(self):
        user = MagicMock()
        user.is_authenticated = True
        user.id = 99
        self.assertEqual(
            get_rate_limit_key(user=user, strategy="user"),
            "user:99",
        )

    def test_user_strategy_no_user_raises(self):
        with self.assertRaises(ValueError):
            get_rate_limit_key(user=AnonymousUser(), strategy="user")

    def test_none_user_falls_to_ip(self):
        self.assertEqual(
            get_rate_limit_key(user=None, ip="5.5.5.5"),
            "ip:5.5.5.5",
        )


# =============================================================================
#  Rate category and tier tests
# =============================================================================


class RateLimitsTestCase(TestCase):
    """Test the RateLimits singleton."""

    def test_ws_connect_category(self):
        self.assertEqual(RateLimits.WS_CONNECT, "10/m")

    def test_ws_heartbeat_category(self):
        self.assertEqual(RateLimits.WS_HEARTBEAT, "120/m")

    def test_mcp_global_category(self):
        self.assertEqual(RateLimits.MCP_GLOBAL, "100/m")

    def test_unknown_attribute_raises(self):
        with self.assertRaises(AttributeError):
            _ = RateLimits.NONEXISTENT_CATEGORY


class GetTierAdjustedRateTestCase(TestCase):
    """Test tier-based rate adjustment."""

    def test_superuser_10x(self):
        user = MagicMock()
        user.is_superuser = True
        user.is_authenticated = True
        user.is_usage_capped = False
        self.assertEqual(get_tier_adjusted_rate(user, "10/m"), "100/m")

    def test_authenticated_2x(self):
        user = MagicMock()
        user.is_superuser = False
        user.is_authenticated = True
        user.is_usage_capped = False
        self.assertEqual(get_tier_adjusted_rate(user, "10/m"), "20/m")

    def test_anonymous_1x(self):
        user = AnonymousUser()
        self.assertEqual(get_tier_adjusted_rate(user, "10/m"), "10/m")

    def test_usage_capped_half(self):
        user = MagicMock()
        user.is_superuser = False
        user.is_authenticated = True
        user.is_usage_capped = True
        self.assertEqual(get_tier_adjusted_rate(user, "10/m"), "10/m")  # 20 * 0.5

    def test_none_user_1x(self):
        self.assertEqual(get_tier_adjusted_rate(None, "10/m"), "10/m")


# =============================================================================
#  GraphQL decorator tests
# =============================================================================


@override_settings(RATELIMIT_DISABLE=False)
class GraphQLRateLimitDecoratorTestCase(TestCase):
    """Test the graphql_ratelimit decorator."""

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("config.ratelimit.engine.time")
    def test_blocks_after_limit(self, mock_time):
        mock_time.time.return_value = 1000000.0

        @graphql_ratelimit(rate="3/m")
        def my_resolver(root, info, **kwargs):
            return "ok"

        user = MagicMock()
        user.is_authenticated = True
        user.id = 1
        request = MagicMock()
        request.META = {"REMOTE_ADDR": "127.0.0.1"}
        request.user = user
        info = MagicMock()
        info.context = request

        for _ in range(3):
            self.assertEqual(my_resolver(None, info), "ok")

        with self.assertRaises(RateLimitExceeded):
            my_resolver(None, info)

    def test_skips_when_no_context(self):
        @graphql_ratelimit(rate="1/m")
        def my_resolver(root, info, **kwargs):
            return "ok"

        self.assertEqual(my_resolver(None, None), "ok")


# =============================================================================
#  WebSocket adapter tests
# =============================================================================


@override_settings(RATELIMIT_DISABLE=False)
class CheckWsRateLimitTestCase(TestCase):
    """Test the WebSocket rate limiting adapter."""

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def _make_consumer(self, user=None, ip="127.0.0.1"):
        consumer = MagicMock()
        consumer.scope = {
            "headers": [],
            "client": (ip, 12345),
            "user": user or AnonymousUser(),
        }
        consumer.send = AsyncMock()
        return consumer

    @patch("config.ratelimit.engine.time")
    def test_allows_under_limit(self, mock_time):
        mock_time.time.return_value = 1000000.0
        consumer = self._make_consumer()
        result = asyncio.get_event_loop().run_until_complete(
            check_ws_rate_limit(consumer, "WS_CONNECT")
        )
        self.assertFalse(result)
        consumer.send.assert_not_called()

    @patch("config.ratelimit.engine.time")
    def test_blocks_over_limit_and_sends_message(self, mock_time):
        mock_time.time.return_value = 1000000.0
        consumer = self._make_consumer()

        # Exhaust the limit (WS_CONNECT = 10/m, anonymous = 1x)
        for _ in range(10):
            asyncio.get_event_loop().run_until_complete(
                check_ws_rate_limit(consumer, "WS_CONNECT")
            )

        # Next request should be limited
        result = asyncio.get_event_loop().run_until_complete(
            check_ws_rate_limit(consumer, "WS_CONNECT")
        )
        self.assertTrue(result)

        # Should have sent a RATE_LIMITED message
        consumer.send.assert_called()
        sent_data = json.loads(consumer.send.call_args[1]["text_data"])
        self.assertEqual(sent_data["type"], "RATE_LIMITED")
        self.assertIn("retry_after", sent_data)

    @patch("config.ratelimit.engine.time")
    def test_per_user_scoping(self, mock_time):
        mock_time.time.return_value = 1000000.0

        user1 = MagicMock()
        user1.is_authenticated = True
        user1.id = 1
        user1.is_superuser = False
        user1.is_usage_capped = False

        user2 = MagicMock()
        user2.is_authenticated = True
        user2.id = 2
        user2.is_superuser = False
        user2.is_usage_capped = False

        consumer1 = self._make_consumer(user=user1)
        consumer2 = self._make_consumer(user=user2)

        # Exhaust user1's limit (WS_CONNECT = 10/m, auth = 2x = 20/m)
        for _ in range(20):
            asyncio.get_event_loop().run_until_complete(
                check_ws_rate_limit(consumer1, "WS_CONNECT")
            )
        # user1 is now limited
        result1 = asyncio.get_event_loop().run_until_complete(
            check_ws_rate_limit(consumer1, "WS_CONNECT")
        )
        self.assertTrue(result1)

        # user2 should still be fine
        result2 = asyncio.get_event_loop().run_until_complete(
            check_ws_rate_limit(consumer2, "WS_CONNECT")
        )
        self.assertFalse(result2)


# =============================================================================
#  MCP adapter tests
# =============================================================================


@override_settings(RATELIMIT_DISABLE=False)
class CheckMcpRateLimitTestCase(TestCase):
    """Test the MCP rate limiting adapter."""

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def _make_scope(self, ip="10.0.0.1"):
        return {"headers": [], "client": (ip, 8080)}

    @patch("config.ratelimit.engine.time")
    def test_global_limit(self, mock_time):
        mock_time.time.return_value = 1000000.0
        scope = self._make_scope()

        # Exhaust global limit (MCP_GLOBAL = 100/m)
        for _ in range(100):
            result = asyncio.get_event_loop().run_until_complete(
                check_mcp_rate_limit(scope)
            )
            self.assertFalse(result[0])

        # Next should be limited
        is_limited, error_msg = asyncio.get_event_loop().run_until_complete(
            check_mcp_rate_limit(scope)
        )
        self.assertTrue(is_limited)
        self.assertIn("Rate limit exceeded", error_msg)

    @patch("config.ratelimit.engine.time")
    def test_per_tool_limit(self, mock_time):
        mock_time.time.return_value = 1000000.0
        scope = self._make_scope()

        # search_corpus maps to READ_HEAVY (10/m)
        for _ in range(10):
            asyncio.get_event_loop().run_until_complete(
                check_mcp_rate_limit(scope, tool_name="search_corpus")
            )

        # Next search_corpus should be per-tool limited
        is_limited, error_msg = asyncio.get_event_loop().run_until_complete(
            check_mcp_rate_limit(scope, tool_name="search_corpus")
        )
        self.assertTrue(is_limited)
        self.assertIn("search_corpus", error_msg)

    @patch("config.ratelimit.engine.time")
    def test_different_ips_independent(self, mock_time):
        mock_time.time.return_value = 1000000.0
        scope1 = self._make_scope(ip="10.0.0.1")
        scope2 = self._make_scope(ip="10.0.0.2")

        # Exhaust ip1
        for _ in range(100):
            asyncio.get_event_loop().run_until_complete(check_mcp_rate_limit(scope1))
        is_limited1, _ = asyncio.get_event_loop().run_until_complete(
            check_mcp_rate_limit(scope1)
        )
        self.assertTrue(is_limited1)

        # ip2 should be fine
        is_limited2, _ = asyncio.get_event_loop().run_until_complete(
            check_mcp_rate_limit(scope2)
        )
        self.assertFalse(is_limited2)

    def test_tool_rate_map_covers_all_tools(self):
        """Verify all standard MCP tools are in the rate map."""
        expected_tools = {
            "list_public_corpuses",
            "list_documents",
            "get_document_text",
            "list_annotations",
            "search_corpus",
            "list_threads",
            "get_thread_messages",
            "get_corpus_info",
        }
        self.assertEqual(set(MCP_TOOL_RATE_MAP.keys()), expected_tools)


# =============================================================================
#  Django view decorator tests
# =============================================================================


@override_settings(RATELIMIT_DISABLE=False)
class ViewRateLimitTestCase(TestCase):
    """Test the view_ratelimit decorator."""

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @patch("config.ratelimit.engine.time")
    def test_sets_limited_attribute(self, mock_time):
        mock_time.time.return_value = 1000000.0

        @view_ratelimit(rate="2/m", block=False)
        def my_view(request):
            return request.limited

        request = MagicMock()
        request.META = {"REMOTE_ADDR": "1.1.1.1"}

        # First two should be fine
        self.assertFalse(my_view(request))
        self.assertFalse(my_view(request))

        # Third should be limited
        self.assertTrue(my_view(request))

    @patch("config.ratelimit.engine.time")
    def test_block_mode_returns_429(self, mock_time):
        mock_time.time.return_value = 1000000.0

        @view_ratelimit(rate="1/m", block=True)
        def my_view(request):
            return "ok"

        request = MagicMock()
        request.META = {"REMOTE_ADDR": "2.2.2.2"}

        self.assertEqual(my_view(request), "ok")
        response = my_view(request)
        self.assertEqual(response.status_code, 429)

    @patch("config.ratelimit.engine.time")
    def test_custom_key_function(self, mock_time):
        mock_time.time.return_value = 1000000.0

        def ip_key(group, request):
            return request.META.get("REMOTE_ADDR", "unknown")

        @view_ratelimit(key=ip_key, rate="2/m", block=False)
        def my_view(request):
            return request.limited

        request = MagicMock()
        request.META = {"REMOTE_ADDR": "3.3.3.3"}

        self.assertFalse(my_view(request))
        self.assertFalse(my_view(request))
        self.assertTrue(my_view(request))
