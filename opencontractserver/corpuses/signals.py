"""
Corpus signals - DEPRECATED for corpus action triggering.

As of the document versioning architecture update (Issue #654), corpus action
triggering has moved to direct invocation in:

- add_document() in corpuses/models.py - triggers if doc is ready
- import_document() in documents/versioning.py - triggers if doc is ready
- set_doc_lock_state() in tasks/doc_tasks.py - triggers when processing completes

This approach uses DocumentPath as the source of truth for corpus membership,
avoiding the M2M relationship synchronization issues that caused actions to
not fire for documents added via import_document().

The signal handlers below are kept for backwards compatibility but are no longer
the primary mechanism for corpus action triggering.

See docs/architecture/agent_corpus_actions_design.md for the full architecture.
"""

import logging

logger = logging.getLogger(__name__)


# NOTE: The following signal handlers have been removed as corpus action
# triggering is now handled directly in:
#
# 1. add_document() - triggers actions if document is ready (backend_lock=False)
# 2. import_document() - triggers actions if document is ready
# 3. set_doc_lock_state() - triggers actions when document processing completes
#
# This ensures DocumentPath (not M2M) is used as the source of truth for
# determining which corpuses a document belongs to.
#
# Previously removed handlers:
# - handle_document_added_to_corpus (M2M signal)
# - handle_document_processing_complete (document_processing_complete signal)
