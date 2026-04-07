"""
Constants for the agent memory system.

The memory system allows agents to accumulate per-corpus insights from
conversations, stored as first-class markdown Documents visible to users.
"""

# ---------------------------------------------------------------------------
# Memory document identification
# ---------------------------------------------------------------------------
MEMORY_DOCUMENT_TITLE = "Corpus Memory"
MEMORY_DOCUMENT_SLUG_SUFFIX = "-memory"

# ---------------------------------------------------------------------------
# Token thresholds for hybrid retrieval
# ---------------------------------------------------------------------------
# When the memory document is smaller than this (in estimated tokens), inject
# the full content into the agent system prompt.  Above this threshold, fall
# back to semantic search over individual memory sections.
MEMORY_FULL_INJECTION_MAX_TOKENS: int = 2000

# Number of memory sections to retrieve via semantic search when the document
# exceeds MEMORY_FULL_INJECTION_MAX_TOKENS.
MEMORY_SEMANTIC_SEARCH_TOP_K: int = 5

# ---------------------------------------------------------------------------
# Curation settings
# ---------------------------------------------------------------------------
# Minutes of idle time after the last message before a conversation is
# considered "ended" and eligible for memory curation.
MEMORY_CURATION_IDLE_MINUTES: int = 30

# Minimum number of human+LLM messages required before a conversation is
# worth curating.  Very short exchanges rarely yield useful patterns.
MEMORY_CURATION_MIN_MESSAGES: int = 4

# Maximum estimated tokens of conversation history sent to the curation LLM.
# Longer conversations are truncated (most recent messages preserved).
MEMORY_CURATION_MAX_CONVERSATION_TOKENS: int = 8000

# Maximum number of new insights the curation LLM may propose per run.
MEMORY_MAX_INSIGHTS_PER_CURATION: int = 5

# ---------------------------------------------------------------------------
# Section headers in the memory document
# ---------------------------------------------------------------------------
MEMORY_SECTION_COLLECTION_PATTERNS = "Collection Patterns"
MEMORY_SECTION_QUERY_PATTERNS = "Query Patterns"

# ---------------------------------------------------------------------------
# Celery beat schedule interval (seconds)
# ---------------------------------------------------------------------------
MEMORY_CURATION_CHECK_INTERVAL_SECONDS: float = 600.0  # 10 minutes

# ---------------------------------------------------------------------------
# System prompt injection prefix
# ---------------------------------------------------------------------------
MEMORY_INJECTION_PREFIX = (
    "\n\n## Corpus Memory\n"
    "The following insights were accumulated from previous interactions "
    "with this corpus. Use them to provide better, more informed responses:\n\n"
)
