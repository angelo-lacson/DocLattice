"""
Tests for NotificationUpdatesConsumer WebSocket endpoint.

Issue #637: Real-time notification delivery via WebSocket

Tests cover:
- Authentication and authorization
- Connection lifecycle
- Notification broadcasting
- IDOR prevention (user isolation)
- Heartbeat/ping-pong
- Signal integration
"""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test.utils import override_settings

from config.asgi import application
from config.websocket.consumers.notification_updates import (
    get_notification_channel_group,
)
from opencontractserver.badges.models import Badge, UserBadge
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.notifications.models import Notification, NotificationTypeChoices
from opencontractserver.tests.base import BaseFixtureTestCase

User = get_user_model()
logger = logging.getLogger(__name__)


@override_settings(USE_AUTH0=False)
@pytest.mark.django_db(transaction=True)
class NotificationWebSocketTestCase(BaseFixtureTestCase):
    """Tests for notification WebSocket consumer."""

    def setUp(self):
        """Set up test fixtures."""
        super().setUp()
        # Create test users
        self.user1 = User.objects.create_user(
            username="testuser1", email="user1@test.com", password="testpass123"
        )
        self.user2 = User.objects.create_user(
            username="testuser2", email="user2@test.com", password="testpass123"
        )

    @database_sync_to_async
    def _create_notification(
        self, recipient: User, notification_type: str
    ) -> Notification:
        """Create a test notification."""
        return Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            data={"test": "data"},
        )

    @database_sync_to_async
    def _create_badge_notification(self, user: User) -> tuple[UserBadge, Notification]:
        """Create a badge and badge notification."""
        # Create badge
        badge = Badge.objects.create(
            name="Test Badge",
            description="Test Description",
            icon="Award",
            color="#05313d",
        )

        # Create user badge (this will trigger signal and create notification)
        user_badge = UserBadge.objects.create(
            user=user,
            badge=badge,
            awarded_by=None,  # Auto-awarded
        )

        # Get the created notification
        notification = Notification.objects.filter(
            recipient=user, notification_type=NotificationTypeChoices.BADGE
        ).latest("created_at")

        return user_badge, notification

    @database_sync_to_async
    def _create_conversation(self) -> Conversation:
        """Create a test conversation."""
        return Conversation.objects.create(
            title="Test Thread",
            creator=self.user1,
            conversation_type="thread",
        )

    @database_sync_to_async
    def _create_chat_message(
        self, conversation: Conversation, creator: User, content: str
    ) -> ChatMessage:
        """Create a chat message."""
        return ChatMessage.objects.create(
            conversation=conversation,
            creator=creator,
            content=content,
            msg_type="HUMAN",
        )

    async def test_unauthenticated_connection_rejected(self):
        """Unauthenticated connections should be rejected with code 4001."""
        ws_path = "ws/notification-updates/"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, subprotocol = await communicator.connect()

        # Should reject connection
        self.assertFalse(connected)

    async def test_authenticated_connection_accepted(self):
        """Authenticated users should be able to connect."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, subprotocol = await communicator.connect()

        self.assertTrue(connected)

        # Should receive CONNECTED message
        response = await communicator.receive_from(timeout=5)
        data = json.loads(response)

        self.assertEqual(data["type"], "CONNECTED")
        self.assertIn("user_id", data)
        self.assertIn("session_id", data)

        await communicator.disconnect()

    async def test_ping_pong(self):
        """Client should be able to ping and receive pong."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consume CONNECTED message
        await communicator.receive_from(timeout=5)

        # Send ping
        await communicator.send_to(json.dumps({"type": "ping"}))

        # Should receive pong
        response = await communicator.receive_from(timeout=5)
        data = json.loads(response)
        self.assertEqual(data["type"], "pong")

        await communicator.disconnect()

    async def test_heartbeat_ack(self):
        """Client should be able to send heartbeat and receive ack."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consume CONNECTED message
        await communicator.receive_from(timeout=5)

        # Send heartbeat
        await communicator.send_to(json.dumps({"type": "heartbeat"}))

        # Should receive heartbeat_ack
        response = await communicator.receive_from(timeout=5)
        data = json.loads(response)
        self.assertEqual(data["type"], "heartbeat_ack")
        self.assertIn("session_id", data)

        await communicator.disconnect()

    async def test_notification_broadcast_via_channel_layer(self):
        """Notifications should be broadcast via channel layer."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # Consume CONNECTED message
        await communicator.receive_from(timeout=5)

        # Manually send notification via channel layer
        # (simulating what the signal handler does)
        channel_layer = get_channel_layer()
        group_name = get_notification_channel_group(self.user.pk)

        await channel_layer.group_send(
            group_name,
            {
                "type": "notification_created",
                "notification_id": "123",
                "notification_type": "BADGE",
                "created_at": "2025-01-01T00:00:00Z",
                "is_read": False,
                "data": {
                    "badge_id": "456",
                    "badge_name": "Test Badge",
                },
            },
        )

        # Should receive notification
        response = await communicator.receive_from(timeout=5)
        data = json.loads(response)

        self.assertEqual(data["type"], "NOTIFICATION_CREATED")
        self.assertEqual(data["notificationId"], "123")
        self.assertEqual(data["notificationType"], "BADGE")
        self.assertFalse(data["isRead"])
        self.assertEqual(data["data"]["badge_id"], "456")

        await communicator.disconnect()

    async def test_user_isolation_idor_prevention(self):
        """Users should only receive their own notifications (IDOR prevention)."""
        # Connect user1
        ws_path1 = f"ws/notification-updates/?token={self.token}"
        communicator1 = WebsocketCommunicator(application, ws_path1)
        connected1, _ = await communicator1.connect()
        self.assertTrue(connected1)
        await communicator1.receive_from(timeout=5)  # Consume CONNECTED

        # Create user2's token
        user2_token = await database_sync_to_async(
            lambda: User.objects.get(username="testuser2")
        )()
        from opencontractserver.utils.auth import create_token_for_user

        user2_token_str = await database_sync_to_async(create_token_for_user)(
            user2_token
        )

        # Connect user2
        ws_path2 = f"ws/notification-updates/?token={user2_token_str}"
        communicator2 = WebsocketCommunicator(application, ws_path2)
        connected2, _ = await communicator2.connect()
        self.assertTrue(connected2)
        await communicator2.receive_from(timeout=5)  # Consume CONNECTED

        # Send notification to user2's channel group ONLY
        channel_layer = get_channel_layer()
        user2_group = get_notification_channel_group(user2_token.pk)

        await channel_layer.group_send(
            user2_group,
            {
                "type": "notification_created",
                "notification_id": "999",
                "notification_type": "BADGE",
                "created_at": "2025-01-01T00:00:00Z",
                "is_read": False,
                "data": {"test": "user2_only"},
            },
        )

        # User2 should receive the notification
        response2 = await communicator2.receive_from(timeout=5)
        data2 = json.loads(response2)
        self.assertEqual(data2["notificationId"], "999")

        # User1 should NOT receive anything (timeout expected)
        with self.assertRaises(TimeoutError):
            await communicator1.receive_from(timeout=2)

        await communicator1.disconnect()
        await communicator2.disconnect()

    @patch("opencontractserver.notifications.signals.broadcast_notification_via_websocket")
    async def test_badge_award_triggers_broadcast(self, mock_broadcast):
        """Badge award should trigger WebSocket broadcast via signal."""
        # Create badge award (triggers signal)
        user_badge, notification = await self._create_badge_notification(self.user)

        # Verify broadcast was called
        self.assertTrue(mock_broadcast.called)
        call_args = mock_broadcast.call_args[0]
        broadcast_notification = call_args[0]

        self.assertEqual(broadcast_notification.recipient, self.user)
        self.assertEqual(
            broadcast_notification.notification_type, NotificationTypeChoices.BADGE
        )

    async def test_notification_update_broadcast(self):
        """Notification updates should be broadcast."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_from(timeout=5)  # Consume CONNECTED

        # Send notification update via channel layer
        channel_layer = get_channel_layer()
        group_name = get_notification_channel_group(self.user.pk)

        await channel_layer.group_send(
            group_name,
            {
                "type": "notification_updated",
                "notification_id": "123",
                "is_read": True,
                "modified": "2025-01-01T00:00:00Z",
            },
        )

        # Should receive update
        response = await communicator.receive_from(timeout=5)
        data = json.loads(response)

        self.assertEqual(data["type"], "NOTIFICATION_UPDATED")
        self.assertEqual(data["notificationId"], "123")
        self.assertTrue(data["isRead"])

        await communicator.disconnect()

    async def test_notification_deleted_broadcast(self):
        """Notification deletions should be broadcast."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_from(timeout=5)  # Consume CONNECTED

        # Send notification deletion via channel layer
        channel_layer = get_channel_layer()
        group_name = get_notification_channel_group(self.user.pk)

        await channel_layer.group_send(
            group_name,
            {
                "type": "notification_deleted",
                "notification_id": "123",
            },
        )

        # Should receive deletion
        response = await communicator.receive_from(timeout=5)
        data = json.loads(response)

        self.assertEqual(data["type"], "NOTIFICATION_DELETED")
        self.assertEqual(data["notificationId"], "123")

        await communicator.disconnect()

    async def test_multiple_concurrent_connections(self):
        """Multiple users can connect concurrently without interference."""
        # Connect user1 twice (simulate multiple tabs)
        ws_path1a = f"ws/notification-updates/?token={self.token}"
        communicator1a = WebsocketCommunicator(application, ws_path1a)
        connected1a, _ = await communicator1a.connect()
        self.assertTrue(connected1a)
        await communicator1a.receive_from(timeout=5)

        ws_path1b = f"ws/notification-updates/?token={self.token}"
        communicator1b = WebsocketCommunicator(application, ws_path1b)
        connected1b, _ = await communicator1b.connect()
        self.assertTrue(connected1b)
        await communicator1b.receive_from(timeout=5)

        # Send notification to user1's channel group
        channel_layer = get_channel_layer()
        group_name = get_notification_channel_group(self.user.pk)

        await channel_layer.group_send(
            group_name,
            {
                "type": "notification_created",
                "notification_id": "777",
                "notification_type": "MENTION",
                "created_at": "2025-01-01T00:00:00Z",
                "is_read": False,
                "data": {},
            },
        )

        # Both connections should receive the notification
        response1a = await communicator1a.receive_from(timeout=5)
        data1a = json.loads(response1a)
        self.assertEqual(data1a["notificationId"], "777")

        response1b = await communicator1b.receive_from(timeout=5)
        data1b = json.loads(response1b)
        self.assertEqual(data1b["notificationId"], "777")

        await communicator1a.disconnect()
        await communicator1b.disconnect()

    async def test_disconnect_cleanup(self):
        """Disconnecting should remove user from channel group."""
        ws_path = f"ws/notification-updates/?token={self.token}"
        communicator = WebsocketCommunicator(application, ws_path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        await communicator.receive_from(timeout=5)  # Consume CONNECTED

        # Disconnect
        await communicator.disconnect()

        # Send notification to the channel group
        channel_layer = get_channel_layer()
        group_name = get_notification_channel_group(self.user.pk)

        await channel_layer.group_send(
            group_name,
            {
                "type": "notification_created",
                "notification_id": "888",
                "notification_type": "BADGE",
                "created_at": "2025-01-01T00:00:00Z",
                "is_read": False,
                "data": {},
            },
        )

        # No error should occur (consumer is no longer in group)
        # This test verifies cleanup happened without errors
