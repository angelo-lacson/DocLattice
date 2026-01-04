from datetime import datetime
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from config.telemetry import _reset_posthog_client, record_event
from opencontractserver.tasks.telemetry_tasks import send_usage_heartbeat
from opencontractserver.users.models import Installation, User


class TelemetryTestCase(TestCase):
    def setUp(self):
        # Reset the singleton client before each test to ensure clean state
        _reset_posthog_client()

        # Mock Installation instance
        self.mock_installation = Installation.get()
        self.installation_id = self.mock_installation.id

        # Set up PostHog mock - patches the class so _get_posthog_client()
        # creates our mock when initializing the singleton
        self.posthog_patcher = patch("config.telemetry.Posthog")
        self.mock_posthog_class = self.posthog_patcher.start()
        self.mock_posthog = MagicMock()
        self.mock_posthog_class.return_value = self.mock_posthog

    def tearDown(self):
        self.posthog_patcher.stop()
        # Reset singleton after each test to clean up
        _reset_posthog_client()

    def test_record_event_success(self):
        """Test successful event recording with all conditions met"""

        with override_settings(
            MODE="DEV",
            TELEMETRY_ENABLED=True,
            POSTHOG_API_KEY="test-key",
            POSTHOG_HOST="https://test.host",
        ):
            result = record_event("test_event", {"test_prop": "value"})

        self.assertTrue(result)
        self.mock_posthog.capture.assert_called_once()

        # Verify the capture call arguments
        call_args = self.mock_posthog.capture.call_args[1]
        self.assertEqual(call_args["distinct_id"], str(self.installation_id))
        self.assertEqual(call_args["event"], "opencontracts.test_event")
        self.assertEqual(call_args["properties"]["package"], "opencontracts")
        self.assertEqual(
            call_args["properties"]["installation_id"], str(self.installation_id)
        )
        self.assertEqual(call_args["properties"]["test_prop"], "value")
        self.assertIn("timestamp", call_args["properties"])

        # Verify timestamp format
        timestamp = datetime.fromisoformat(call_args["properties"]["timestamp"])
        self.assertIsNotNone(timestamp.tzinfo)

    def test_record_event_telemetry_disabled(self):
        """Test when telemetry is disabled"""

        with override_settings(TELEMETRY_ENABLED=False):
            result = record_event("test_event")

        self.assertFalse(result)
        self.mock_posthog.capture.assert_not_called()

    def test_record_event_installation_inactive(self):
        """Test when installation exists but is inactive"""

        with override_settings(TELEMETRY_ENABLED=False):
            result = record_event("test_event")

        self.assertFalse(result)
        self.mock_posthog.capture.assert_not_called()

    def test_record_event_posthog_error(self):
        """Test when PostHog client raises an error"""
        self.mock_posthog.capture.side_effect = Exception("PostHog Error")

        with override_settings(MODE="DEV", TELEMETRY_ENABLED=True):
            result = record_event("test_event")

        self.assertFalse(result)

    def test_record_event_without_properties(self):
        """Test event recording without additional properties"""

        with override_settings(MODE="DEV", TELEMETRY_ENABLED=True):
            result = record_event("test_event")

        self.assertTrue(result)
        self.mock_posthog.capture.assert_called_once()

        # Verify only default properties are present
        properties = self.mock_posthog.capture.call_args[1]["properties"]
        self.assertEqual(
            set(properties.keys()), {"package", "timestamp", "installation_id"}
        )


class UsageHeartbeatTestCase(TestCase):
    """Tests for the send_usage_heartbeat Celery task."""

    def setUp(self):
        # Ensure Installation exists
        self.installation = Installation.get()

        # Create a test user
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def tearDown(self):
        _reset_posthog_client()

    @patch("opencontractserver.tasks.telemetry_tasks.record_event")
    def test_heartbeat_collects_correct_stats(self, mock_record_event):
        """Test that heartbeat collects and sends correct statistics."""
        mock_record_event.return_value = True

        with override_settings(MODE="DEV", TELEMETRY_ENABLED=True):
            result = send_usage_heartbeat()

        # Verify record_event was called
        mock_record_event.assert_called_once()
        call_args = mock_record_event.call_args

        # Check event type
        self.assertEqual(call_args[0][0], "usage_heartbeat")

        # Check stats structure
        stats = call_args[0][1]
        self.assertIn("user_count", stats)
        self.assertIn("document_count", stats)
        self.assertIn("corpus_count", stats)
        self.assertIn("annotation_count", stats)
        self.assertIn("conversation_count", stats)
        self.assertIn("message_count", stats)
        self.assertIn("version", stats)
        self.assertIn("installation_age_days", stats)

        # Verify user count includes our test user
        self.assertGreaterEqual(stats["user_count"], 1)

        # Verify installation age is non-negative
        self.assertGreaterEqual(stats["installation_age_days"], 0)

        # Verify result matches stats
        self.assertEqual(result, stats)

    @patch("opencontractserver.tasks.telemetry_tasks.record_event")
    def test_heartbeat_disabled_in_test_mode(self, mock_record_event):
        """Test that heartbeat doesn't send in TEST mode."""
        with override_settings(MODE="TEST", TELEMETRY_ENABLED=True):
            result = send_usage_heartbeat()

        mock_record_event.assert_not_called()
        self.assertIsNone(result)

    @patch("opencontractserver.tasks.telemetry_tasks.record_event")
    def test_heartbeat_disabled_when_telemetry_off(self, mock_record_event):
        """Test that heartbeat doesn't send when telemetry is disabled."""
        with override_settings(MODE="DEV", TELEMETRY_ENABLED=False):
            result = send_usage_heartbeat()

        mock_record_event.assert_not_called()
        self.assertIsNone(result)

    @patch("opencontractserver.tasks.telemetry_tasks.record_event")
    def test_heartbeat_handles_errors_gracefully(self, mock_record_event):
        """Test that heartbeat handles errors without crashing."""
        mock_record_event.side_effect = Exception("Network error")

        with override_settings(MODE="DEV", TELEMETRY_ENABLED=True):
            # Should not raise, just return None
            result = send_usage_heartbeat()

        self.assertIsNone(result)
