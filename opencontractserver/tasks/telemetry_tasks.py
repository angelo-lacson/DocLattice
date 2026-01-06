"""
Telemetry tasks for collecting and sending usage statistics.

These tasks run periodically to send anonymous usage metrics to PostHog,
helping guide development priorities without collecting any personal data.
"""

import logging

from django.conf import settings
from django.utils import timezone

from config import celery_app
from config.telemetry import record_event
from opencontractserver import __version__
from opencontractserver.annotations.models import Annotation
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import DocumentPath
from opencontractserver.users.models import Installation, User

logger = logging.getLogger(__name__)


@celery_app.task()
def send_usage_heartbeat() -> dict | None:
    """
    Send daily usage statistics heartbeat.

    Collects aggregate counts of users, documents, corpuses, annotations,
    and conversations, along with installation metadata.

    Returns:
        dict: The stats that were sent, or None if telemetry is disabled.
    """
    # Respect telemetry settings
    if settings.MODE == "TEST":
        logger.debug("Telemetry disabled in TEST mode")
        return None

    if not settings.TELEMETRY_ENABLED:
        logger.debug("Telemetry disabled via TELEMETRY_ENABLED setting")
        return None

    try:
        # Get installation metadata
        installation = Installation.get()
        age_days = (timezone.now() - installation.created).days

        # Collect usage statistics
        stats = {
            # Usage counts
            "user_count": User.objects.filter(is_active=True).count(),
            "document_count": (
                DocumentPath.objects.filter(is_deleted=False, is_current=True)
                .values("document_id")
                .distinct()
                .count()
            ),
            "corpus_count": Corpus.objects.count(),
            "annotation_count": Annotation.objects.filter(structural=False).count(),
            "conversation_count": Conversation.objects.filter(
                deleted_at__isnull=True
            ).count(),
            "message_count": ChatMessage.objects.filter(
                deleted_at__isnull=True
            ).count(),
            # Installation metadata
            "version": __version__,
            "installation_age_days": age_days,
        }

        record_event("usage_heartbeat", stats)
        logger.info(f"Usage heartbeat sent: {stats}")
        return stats

    except Exception as e:
        logger.warning(f"Failed to send usage heartbeat: {e}")
        return None
