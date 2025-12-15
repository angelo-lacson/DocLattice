"""
Corpus signals for handling document lifecycle events.

Architecture Overview (see docs/architecture/agent_corpus_actions_design.md):
----------------------------------------------------------------------------
Corpus actions (analyzers, fieldsets, agents) should only run AFTER documents
are fully processed (parsed, thumbnailed). This is achieved through an event-driven
architecture:

1. When a document is ADDED to a corpus (M2M signal):
   - If document is READY (backend_lock=False): trigger actions immediately
   - If document is PROCESSING (backend_lock=True): skip it (will be handled later)

2. When document processing COMPLETES (document_processing_complete signal):
   - Check all corpuses the document belongs to
   - Trigger ADD_DOCUMENT actions for each corpus

This ensures:
- Agent tools like load_document_text have fully parsed content
- No polling/retry overhead - purely event-driven
- Existing processed documents work immediately when added to corpus
- New documents wait until processing completes
"""

import logging

from django.db.models.signals import m2m_changed
from django.dispatch import receiver

from opencontractserver.documents.signals import document_processing_complete
from opencontractserver.tasks.corpus_tasks import process_corpus_action

from .models import Corpus, CorpusActionTrigger

logger = logging.getLogger(__name__)


@receiver(m2m_changed, sender=Corpus.documents.through)
def handle_document_added_to_corpus(sender, instance, action, pk_set, **kwargs):
    """
    Handle documents being added to a corpus via M2M relationship.

    Only triggers corpus actions for documents that are READY (backend_lock=False).
    Documents still being processed (backend_lock=True) are skipped here and will
    be handled by handle_document_processing_complete when they finish.

    Args:
        sender: The through model for the M2M relationship
        instance: The Corpus instance
        action: The M2M action type ('post_add', 'post_remove', etc.)
        pk_set: Set of document primary keys being added
    """
    if action != "post_add" or not pk_set:
        return

    from opencontractserver.documents.models import Document

    # Filter to only documents that are ready (not still processing)
    # Documents with backend_lock=True are still being parsed/thumbnailed
    ready_doc_ids = list(
        Document.objects.filter(
            id__in=pk_set,
            backend_lock=False,
        ).values_list("id", flat=True)
    )

    # Log what we're skipping for debugging
    skipped_ids = set(pk_set) - set(ready_doc_ids)
    if skipped_ids:
        logger.info(
            f"[CorpusSignal] Skipping {len(skipped_ids)} documents still processing "
            f"(ids: {list(skipped_ids)}). Actions will trigger when processing completes."
        )

    # Only trigger actions for ready documents
    if ready_doc_ids:
        logger.info(
            f"[CorpusSignal] Triggering actions for {len(ready_doc_ids)} ready documents "
            f"in corpus {instance.id}"
        )
        process_corpus_action.si(
            corpus_id=instance.id,
            document_ids=ready_doc_ids,
            user_id=instance.creator.id,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
        ).apply_async()


@receiver(document_processing_complete)
def handle_document_processing_complete(sender, document, user_id, **kwargs):
    """
    Handle document processing completion - trigger deferred corpus actions.

    When a document finishes processing (parsing, thumbnailing), this handler
    checks all corpuses the document belongs to and triggers ADD_DOCUMENT actions.
    This handles the case where documents were added to a corpus while still
    being processed.

    Note: This may trigger actions for documents that were in the corpus before
    processing started. Most actions are idempotent (using get_or_create patterns),
    so this is generally safe. If duplicate prevention is needed, actions should
    implement their own idempotency checks.

    Args:
        sender: The Document model class
        document: The Document instance that finished processing
        user_id: The ID of the user who created the document
    """
    # Get all corpuses this document belongs to
    # Use select_related to avoid N+1 queries when accessing creator
    corpuses = Corpus.objects.filter(documents=document).select_related("creator")

    if not corpuses.exists():
        logger.debug(
            f"[CorpusSignal] Document {document.id} not in any corpus, skipping actions"
        )
        return

    for corpus in corpuses:
        logger.info(
            f"[CorpusSignal] Document {document.id} processing complete, "
            f"triggering ADD_DOCUMENT actions for corpus {corpus.id}"
        )
        process_corpus_action.si(
            corpus_id=corpus.id,
            document_ids=[document.id],
            user_id=corpus.creator.id,  # Use corpus creator for consistency
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
        ).apply_async()
