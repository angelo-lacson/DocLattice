"""
Constants for corpus action configuration.

Provides default tool sets and prompt templates for agent-based corpus actions.
"""

from opencontractserver.corpuses.models import CorpusActionTrigger

# ---------------------------------------------------------------------------
# Default tool sets by trigger type
# ---------------------------------------------------------------------------
# When a user creates an agent corpus action without specifying tools,
# the system uses these defaults based on the trigger type.

DEFAULT_DOCUMENT_ACTION_TOOLS: list[str] = [
    "load_document_txt_extract",
    "get_document_description",
    "update_document_description",
    "get_document_summary",
    "update_document_summary",
    "add_document_note",
    "search_exact_text_as_sources",
]

DEFAULT_THREAD_ACTION_TOOLS: list[str] = [
    "get_thread_context",
    "get_thread_messages",
    "get_message_content",
    "add_thread_message",
    "lock_thread",
    "unlock_thread",
    "delete_message",
    "pin_thread",
    "unpin_thread",
]

# Map trigger types to their default tool sets.
# Keys use CorpusActionTrigger enum values to prevent typos.
DEFAULT_TOOLS_BY_TRIGGER: dict[str, list[str]] = {
    CorpusActionTrigger.ADD_DOCUMENT: DEFAULT_DOCUMENT_ACTION_TOOLS,
    CorpusActionTrigger.EDIT_DOCUMENT: DEFAULT_DOCUMENT_ACTION_TOOLS,
    CorpusActionTrigger.NEW_THREAD: DEFAULT_THREAD_ACTION_TOOLS,
    CorpusActionTrigger.NEW_MESSAGE: DEFAULT_THREAD_ACTION_TOOLS,
}

# ---------------------------------------------------------------------------
# Trigger descriptions for system prompt context injection
# ---------------------------------------------------------------------------

TRIGGER_DESCRIPTIONS: dict[str, str] = {
    CorpusActionTrigger.ADD_DOCUMENT: "was just added to",
    CorpusActionTrigger.EDIT_DOCUMENT: "was just edited in",
    CorpusActionTrigger.NEW_THREAD: "triggered by new thread in",
    CorpusActionTrigger.NEW_MESSAGE: "triggered by new message in",
}
