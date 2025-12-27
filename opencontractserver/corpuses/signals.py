"""
Corpus signals for corpus action triggering.

## Document-based triggers (DEPRECATED):

As of the document versioning architecture update (Issue #654), document-based
corpus action triggering has moved to direct invocation in:

- add_document() in corpuses/models.py - triggers if doc is ready
- import_document() in documents/versioning.py - triggers if doc is ready
- set_doc_lock_state() in tasks/doc_tasks.py - triggers when processing completes

This approach uses DocumentPath as the source of truth for corpus membership.

## Thread/Message-based triggers (ACTIVE):

This file contains signal handlers for NEW_THREAD and NEW_MESSAGE corpus action
triggers, which fire when:

- A new THREAD conversation is created in a corpus
- A new HUMAN message is posted to a THREAD conversation in a corpus

These handlers use transaction.on_commit to ensure proper persistence before
queuing async tasks.

See docs/corpus_actions/ for the full architecture.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


# NOTE: Document-based signal handlers have been removed as corpus action
# triggering is now handled directly in:
#
# 1. add_document() - triggers actions if document is ready (backend_lock=False)
# 2. import_document() - triggers actions if document is ready
# 3. set_doc_lock_state() - triggers actions when document processing completes
#
# This ensures DocumentPath (not M2M) is used as the source of truth for
# determining which corpuses a document belongs to.


# =============================================================================
# Thread/Message Corpus Action Triggers
# =============================================================================


@receiver(post_save, sender="conversations.Conversation")
def trigger_corpus_actions_on_thread_creation(sender, instance, created, **kwargs):
    """
    Trigger NEW_THREAD corpus actions when a discussion thread is created.

    Only triggers for:
    - Newly created conversations (not updates)
    - THREAD type conversations (not CHAT)
    - Conversations linked to a corpus

    Uses transaction.on_commit to ensure the thread is fully persisted
    before queuing the async task.
    """
    if not created:
        return

    # Import here to avoid circular imports
    from opencontractserver.conversations.models import ConversationTypeChoices

    conversation = instance

    # Only process discussion threads
    if conversation.conversation_type != ConversationTypeChoices.THREAD:
        return

    # Skip if no corpus linkage
    if not conversation.chat_with_corpus_id:
        logger.debug(
            f"Thread {conversation.pk} has no corpus linkage, skipping corpus actions"
        )
        return

    # Skip signal during tests/fixtures
    if hasattr(instance, "_skip_signals"):
        return

    def queue_thread_action():
        from opencontractserver.tasks.corpus_tasks import process_thread_corpus_action

        process_thread_corpus_action.delay(
            corpus_id=conversation.chat_with_corpus_id,
            conversation_id=conversation.pk,
            user_id=conversation.creator_id,
            trigger="new_thread",
        )
        logger.info(
            f"Queued NEW_THREAD corpus actions for thread {conversation.pk} "
            f"in corpus {conversation.chat_with_corpus_id}"
        )

    transaction.on_commit(queue_thread_action)


@receiver(post_save, sender="conversations.ChatMessage")
def trigger_corpus_actions_on_message_creation(sender, instance, created, **kwargs):
    """
    Trigger NEW_MESSAGE corpus actions when a message is posted.

    Only triggers for:
    - Newly created messages (not updates)
    - HUMAN type messages (not system or LLM messages to avoid loops)
    - Messages in THREAD type conversations
    - Threads linked to a corpus

    Uses transaction.on_commit to ensure the message is fully persisted.
    """
    if not created:
        return

    # Import here to avoid circular imports
    from opencontractserver.conversations.models import (
        ConversationTypeChoices,
        MessageTypeChoices,
    )

    message = instance

    # Only process human messages (avoid infinite loops with agent messages)
    if message.msg_type != MessageTypeChoices.HUMAN:
        return

    # Skip signal during tests/fixtures
    if hasattr(instance, "_skip_signals"):
        return

    # Get the conversation - use select_related for efficiency
    conversation = message.conversation

    # Only process messages in discussion threads
    if conversation.conversation_type != ConversationTypeChoices.THREAD:
        return

    # Skip if no corpus linkage
    if not conversation.chat_with_corpus_id:
        logger.debug(
            f"Thread {conversation.pk} has no corpus linkage, skipping corpus actions"
        )
        return

    def queue_message_action():
        from opencontractserver.tasks.corpus_tasks import process_message_corpus_action

        process_message_corpus_action.delay(
            corpus_id=conversation.chat_with_corpus_id,
            conversation_id=conversation.pk,
            message_id=message.pk,
            user_id=message.creator_id,
            trigger="new_message",
        )
        logger.info(
            f"Queued NEW_MESSAGE corpus actions for message {message.pk} "
            f"in thread {conversation.pk}, corpus {conversation.chat_with_corpus_id}"
        )

    transaction.on_commit(queue_message_action)
