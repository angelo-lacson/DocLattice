"""
Redis integration tests for django-redis, channels-redis, and Celery.

These tests require a real Redis instance (provided by test.yml) and must be run
with DJANGO_SETTINGS_MODULE=config.settings.test_integration.

Run:
    docker compose -f test.yml run \
      -e DJANGO_SETTINGS_MODULE=config.settings.test_integration \
      django pytest opencontractserver/tests/test_redis_integration.py -v
"""

import asyncio
import time

import pytest
from asgiref.sync import async_to_sync
from celery import shared_task
from celery.contrib.testing.worker import start_worker
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, TransactionTestCase
from django_redis import get_redis_connection

from config.celery_app import app as celery_app

# Skip entire module when running under standard test.py settings (which use
# LocMemCache). These tests require config.settings.test_integration with real
# Redis backends. Without this guard, get_redis_connection() would fail during
# normal pytest discovery.
pytestmark = pytest.mark.skipif(
    "django_redis" not in settings.CACHES.get("default", {}).get("BACKEND", ""),
    reason="Requires DJANGO_SETTINGS_MODULE=config.settings.test_integration",
)


def _flush_redis():
    """Flush the Redis test DB to ensure isolation between tests."""
    conn = get_redis_connection("default")
    conn.flushdb()


class TestDjangoRedisCache(TestCase):
    """Test django-redis cache backend against a real Redis instance.

    Validates that cache operations work correctly with the current redis-py
    version, particularly under RESP3 protocol where return types changed
    (dicts instead of flat lists, sets instead of lists, etc.).
    """

    def setUp(self):
        _flush_redis()

    def tearDown(self):
        _flush_redis()

    def test_cache_set_get_string(self):
        """String round-trip through django-redis."""
        cache.set("test_key", "test_value", timeout=30)
        result = cache.get("test_key")
        assert result == "test_value"

    def test_cache_set_get_dict(self):
        """Dict serialization round-trip — sensitive to RESP3 type changes."""
        data = {"name": "test", "count": 42, "nested": {"a": 1}}
        cache.set("test_dict", data, timeout=30)
        result = cache.get("test_dict")
        assert result == data
        assert isinstance(result, dict)

    def test_cache_set_get_list(self):
        """List serialization round-trip — sensitive to RESP3 type changes."""
        data = [1, "two", 3.0, None, {"nested": True}]
        cache.set("test_list", data, timeout=30)
        result = cache.get("test_list")
        assert result == data
        assert isinstance(result, list)

    def test_cache_delete(self):
        """Key deletion."""
        cache.set("delete_me", "value", timeout=30)
        assert cache.get("delete_me") == "value"
        cache.delete("delete_me")
        assert cache.get("delete_me") is None

    def test_cache_ttl_expiry(self):
        """TTL-based expiration."""
        cache.set("expiring_key", "value", timeout=1)
        assert cache.get("expiring_key") == "value"
        time.sleep(1.5)
        assert cache.get("expiring_key") is None

    def test_cache_incr_decr(self):
        """Atomic increment/decrement — used by rate limiting."""
        cache.set("counter", 10, timeout=30)
        new_val = cache.incr("counter")
        assert new_val == 11
        new_val = cache.decr("counter")
        assert new_val == 10


class TestChannelsRedisLayer(TestCase):
    """Test channels-redis channel layer against a real Redis instance.

    Validates that WebSocket pub/sub operations work correctly with the
    current redis-py version. The notification broadcast path
    (signals.py -> group_send) relies on this layer.
    """

    def setUp(self):
        _flush_redis()
        self.channel_layer = get_channel_layer()

    def tearDown(self):
        _flush_redis()

    def test_send_receive(self):
        """Basic channel send/receive round-trip."""
        channel_name = async_to_sync(self.channel_layer.new_channel)()
        message = {"type": "test.message", "text": "hello"}

        async_to_sync(self.channel_layer.send)(channel_name, message)
        received = async_to_sync(self.channel_layer.receive)(channel_name)

        assert received["type"] == "test.message"
        assert received["text"] == "hello"

    def test_group_send_receive(self):
        """Group send/receive — mirrors the notification broadcast path.

        This is the exact pattern used in notifications/signals.py:
        group_add -> group_send -> receive
        """
        group_name = "test_notification_group"
        channel_name = async_to_sync(self.channel_layer.new_channel)()

        # Join group
        async_to_sync(self.channel_layer.group_add)(group_name, channel_name)

        # Send to group (mirrors broadcast_notification_via_websocket)
        message = {
            "type": "notification.message",
            "notification_type": "test",
            "data": {"id": 1, "text": "Test notification"},
        }
        async_to_sync(self.channel_layer.group_send)(group_name, message)

        # Receive from the channel
        received = async_to_sync(self.channel_layer.receive)(channel_name)
        assert received["type"] == "notification.message"
        assert received["data"]["id"] == 1

        # Cleanup
        async_to_sync(self.channel_layer.group_discard)(group_name, channel_name)

    def test_group_discard(self):
        """After group_discard, messages are no longer received."""
        group_name = "test_discard_group"
        channel_name = async_to_sync(self.channel_layer.new_channel)()

        # Join, then leave
        async_to_sync(self.channel_layer.group_add)(group_name, channel_name)
        async_to_sync(self.channel_layer.group_discard)(group_name, channel_name)

        # Send to group
        async_to_sync(self.channel_layer.group_send)(
            group_name,
            {"type": "test.message", "text": "should not arrive"},
        )

        # Receive should timeout (nothing to receive)
        async def _receive_with_timeout():
            try:
                return await asyncio.wait_for(
                    self.channel_layer.receive(channel_name), timeout=1.0
                )
            except asyncio.TimeoutError:
                return None

        result = async_to_sync(_receive_with_timeout)()
        assert result is None


# Define test tasks at module level (Celery needs to discover them)
@shared_task
def _add_numbers(a, b):
    """Simple task that returns a sum."""
    return a + b


@shared_task
def _return_dict():
    """Task that returns a dict — sensitive to RESP3 deserialization."""
    return {"status": "ok", "count": 42, "items": [1, 2, 3]}


@shared_task
def _failing_task():
    """Task that always raises an exception."""
    raise ValueError("Intentional test failure")


class TestCeleryRedisBackend(TransactionTestCase):
    """Test Celery broker + result backend against a real Redis instance.

    Uses an in-process Celery worker via start_worker so no separate
    celeryworker container is needed. Validates that task dispatch,
    result storage, and result retrieval work correctly with redis-py 7.x.

    Uses TransactionTestCase because the in-process worker runs in a
    separate thread and needs to see committed data.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Start an in-process Celery worker for the duration of the test class
        cls._worker_ctx = start_worker(celery_app, perform_ping_check=False)
        cls._worker = cls._worker_ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls._worker_ctx.__exit__(None, None, None)
        super().tearDownClass()

    def setUp(self):
        _flush_redis()

    def tearDown(self):
        _flush_redis()

    def test_task_roundtrip(self):
        """Send a task via Redis broker, retrieve result from Redis backend."""
        result = _add_numbers.delay(3, 7)
        value = result.get(timeout=10)
        assert value == 10

    def test_task_result_dict(self):
        """Task returning a dict — validates RESP3 result deserialization."""
        result = _return_dict.delay()
        value = result.get(timeout=10)
        assert isinstance(value, dict)
        assert value["status"] == "ok"
        assert value["count"] == 42
        assert value["items"] == [1, 2, 3]

    def test_task_failure_propagation(self):
        """Task exception propagates correctly through Redis result backend."""
        result = _failing_task.delay()
        with pytest.raises(ValueError, match="Intentional test failure"):
            result.get(timeout=10, propagate=True)

    def test_task_status_lifecycle(self):
        """Task status transitions: PENDING -> SUCCESS through Redis backend."""
        result = _add_numbers.delay(1, 1)
        value = result.get(timeout=10)
        assert value == 2
        # After completion, status should be SUCCESS
        assert result.status == "SUCCESS"
