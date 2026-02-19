"""
Constants for LLM context window management, conversation compaction, and
tool output guardrails.

These thresholds control when and how the system compacts conversation
history to prevent context overflow when talking to LLMs.
"""

# ---------------------------------------------------------------------------
# Model context window sizes (in tokens)
# ---------------------------------------------------------------------------
# Maps model name prefixes to their maximum context window.  When an exact
# match is not found the lookup falls back to prefix matching (e.g.
# "gpt-4o-mini" matches the "gpt-4o" entry).
MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    # OpenAI
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "gpt-4-turbo": 128_000,
    "gpt-4": 8_192,
    "gpt-3.5-turbo": 16_385,
    "o1": 200_000,
    "o1-mini": 128_000,
    "o3": 200_000,
    "o3-mini": 128_000,
    "o4-mini": 200_000,
    # Anthropic
    "claude-3-5-sonnet": 200_000,
    "claude-3-5-haiku": 200_000,
    "claude-3-opus": 200_000,
    "claude-3-sonnet": 200_000,
    "claude-3-haiku": 200_000,
    "claude-sonnet-4": 200_000,
    "claude-opus-4": 200_000,
    # Google
    "gemini-1.5-pro": 1_000_000,
    "gemini-1.5-flash": 1_000_000,
    "gemini-2.0-flash": 1_000_000,
    "gemini-2.5-pro": 1_000_000,
    "gemini-2.5-flash": 1_000_000,
}

# Fallback context window when the model is unknown.
DEFAULT_CONTEXT_WINDOW: int = 128_000

# ---------------------------------------------------------------------------
# Compaction thresholds
# ---------------------------------------------------------------------------
# Fraction of the model context window at which compaction is triggered.
# E.g. 0.75 means "compact when estimated usage exceeds 75% of the window".
COMPACTION_THRESHOLD_RATIO: float = 0.75

# Minimum number of recent messages to *always* preserve verbatim (never
# summarised), regardless of their token cost.  This ensures the LLM sees
# enough immediate context to maintain conversational coherence.
MIN_RECENT_MESSAGES: int = 4

# Maximum number of recent messages to preserve.  Caps memory usage for
# very chatty sessions where individual messages are small.
MAX_RECENT_MESSAGES: int = 20

# ---------------------------------------------------------------------------
# Tool output guardrails
# ---------------------------------------------------------------------------
# Hard ceiling (in characters) for a single tool return value that gets
# inserted into the conversation history.  Outputs exceeding this limit
# are truncated with an ellipsis marker.
MAX_TOOL_OUTPUT_CHARS: int = 50_000

# Truncation notice appended when a tool output is clipped.
TOOL_OUTPUT_TRUNCATION_NOTICE: str = (
    "\n\n[… output truncated to {limit} characters — "
    "use start/end parameters to load specific sections]"
)

# ---------------------------------------------------------------------------
# Compaction summary budget
# ---------------------------------------------------------------------------
# Target token length for the summary that replaces compacted messages.
# Keeps the summary concise while preserving key facts.
COMPACTION_SUMMARY_TARGET_TOKENS: int = 300

# System-level instruction prepended to the summary so the LLM knows its
# origin.  Must be kept short to avoid eating into the summary budget.
COMPACTION_SUMMARY_PREFIX: str = (
    "[Conversation summary — earlier messages were compacted to save context]\n"
)

# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------
# Average characters per token used for the fast heuristic estimator.
# English text averages ~4 chars/token across common tokenisers.  This is
# intentionally conservative (slightly over-counting) so that the system
# compacts a little earlier rather than risking a hard overflow.
CHARS_PER_TOKEN_ESTIMATE: float = 3.5
