from __future__ import annotations

import atexit
import logging
from datetime import datetime, timezone

from django.conf import settings
from posthog import Posthog

logger = logging.getLogger(__name__)

# Singleton PostHog client - lazily initialized
_posthog_client: Posthog | None = None
_atexit_registered: bool = False


def _get_posthog_client() -> Posthog | None:
    """
    Get or create the singleton PostHog client.

    The client is lazily initialized on first use and reused for all
    subsequent calls. An atexit handler is registered to ensure events
    are flushed when the process exits.

    Returns:
        Posthog client instance, or None if initialization fails
    """
    global _posthog_client, _atexit_registered

    if _posthog_client is not None:
        return _posthog_client

    try:
        _posthog_client = Posthog(
            project_api_key=settings.POSTHOG_API_KEY,
            host=settings.POSTHOG_HOST,
        )

        # Register shutdown handler to flush events on process exit
        if not _atexit_registered:
            atexit.register(_shutdown_posthog_client)
            _atexit_registered = True

        logger.debug("PostHog client initialized")
        return _posthog_client

    except Exception as e:
        logger.warning(f"Failed to initialize PostHog client: {e}")
        return None


def _shutdown_posthog_client() -> None:
    """Shutdown the PostHog client, flushing any pending events."""
    global _posthog_client
    if _posthog_client is not None:
        try:
            _posthog_client.shutdown()
            logger.debug("PostHog client shut down successfully")
        except Exception as e:
            logger.warning(f"Error shutting down PostHog client: {e}")
        finally:
            _posthog_client = None


def _reset_posthog_client() -> None:
    """
    Reset the singleton client. Used for testing purposes only.

    This shuts down the existing client (if any) and clears the singleton,
    allowing a fresh client to be created on the next call.

    Note: The atexit handler remains registered for the lifetime of the
    process - this is intentional as atexit handlers cannot be unregistered.
    """
    global _posthog_client
    if _posthog_client is not None:
        try:
            _posthog_client.shutdown()
        except Exception:
            pass
        _posthog_client = None


def _get_installation_id() -> str | None:
    """Get the installation ID from the Installation model."""
    from opencontractserver.users.models import Installation

    try:
        installation = Installation.objects.get()
        return str(installation.id)
    except Exception as e:
        logger.warning(f"Failed to get installation ID: {e}")
        return None


def record_event(event_type: str, properties: dict | None = None) -> bool:
    """
    Record a telemetry event.

    Uses a singleton PostHog client for efficient event batching.
    Events are queued and sent asynchronously by a background thread.

    Args:
        event_type: Type of event (e.g., "installation", "error", "usage")
        properties: Optional additional properties to include

    Returns:
        bool: Whether the event was successfully queued
    """
    # Don't collect TEST telemetry...
    if settings.MODE == "TEST":
        logger.debug("Telemetry disabled in TEST mode")
        return False

    if not settings.TELEMETRY_ENABLED:
        return False

    installation_id = _get_installation_id()
    logger.debug(f"Telemetry id: {installation_id}")
    if not installation_id:
        return False

    client = _get_posthog_client()
    if client is None:
        return False

    try:
        client.capture(
            distinct_id=installation_id,
            event=f"opencontracts.{event_type}",
            properties={
                "package": "opencontracts",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "installation_id": installation_id,
                **(properties or {}),
            },
        )
        return True
    except Exception as e:
        logger.warning(f"Failed to send telemetry: {e}")
        return False
