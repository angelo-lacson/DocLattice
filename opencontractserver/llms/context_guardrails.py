"""Context guardrails: token estimation, conversation compaction, and output truncation.

Inspired by Claude Code's approach to context management, this module
provides three complementary safeguards against LLM context overflow:

1. **Token estimation** — fast, heuristic token counting that avoids
   importing heavyweight tokeniser libraries at the cost of ~10% accuracy.
2. **Conversation compaction** — when accumulated messages approach the
   context window limit the oldest messages are replaced by a concise
   summary, preserving recent turns verbatim.
3. **Tool output truncation** — hard limits on individual tool return
   values before they enter the conversation history.

All thresholds are sourced from
:mod:`opencontractserver.constants.context_guardrails` so operators can
tune behaviour without touching code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from opencontractserver.constants.context_guardrails import (
    CHARS_PER_TOKEN_ESTIMATE,
    COMPACTION_SUMMARY_PREFIX,
    COMPACTION_SUMMARY_TARGET_TOKENS,
    COMPACTION_THRESHOLD_RATIO,
    DEFAULT_CONTEXT_WINDOW,
    MAX_RECENT_MESSAGES,
    MAX_TOOL_OUTPUT_CHARS,
    MIN_RECENT_MESSAGES,
    MODEL_CONTEXT_WINDOWS,
    TOOL_OUTPUT_TRUNCATION_NOTICE,
)

logger = logging.getLogger(__name__)

__all__ = [
    "estimate_token_count",
    "get_context_window_for_model",
    "truncate_tool_output",
    "CompactionResult",
    "compact_message_history",
    "should_compact",
]


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


def estimate_token_count(text: str) -> int:
    """Return a fast *approximate* token count for *text*.

    The heuristic divides character length by :data:`CHARS_PER_TOKEN_ESTIMATE`
    (default 3.5).  This intentionally **over**-estimates slightly so that
    compaction triggers conservatively rather than risking a hard overflow.

    For callers that need exact counts (e.g. billing) a proper tokeniser
    (``tiktoken`` for OpenAI, ``anthropic`` for Claude) should be used
    instead.
    """
    if not text:
        return 0
    return max(1, int(len(text) / CHARS_PER_TOKEN_ESTIMATE))


# ---------------------------------------------------------------------------
# Model context window lookup
# ---------------------------------------------------------------------------


def get_context_window_for_model(model_name: str) -> int:
    """Return the context window size (in tokens) for *model_name*.

    Performs an exact lookup first, then falls back to longest-prefix
    matching.  Returns :data:`DEFAULT_CONTEXT_WINDOW` if the model is
    completely unknown.
    """
    if not model_name:
        return DEFAULT_CONTEXT_WINDOW

    # Exact match
    if model_name in MODEL_CONTEXT_WINDOWS:
        return MODEL_CONTEXT_WINDOWS[model_name]

    # Prefix match — try longest match first for specificity
    best_match: str | None = None
    for prefix in MODEL_CONTEXT_WINDOWS:
        if model_name.startswith(prefix):
            if best_match is None or len(prefix) > len(best_match):
                best_match = prefix

    if best_match is not None:
        return MODEL_CONTEXT_WINDOWS[best_match]

    return DEFAULT_CONTEXT_WINDOW


# ---------------------------------------------------------------------------
# Tool output truncation
# ---------------------------------------------------------------------------


def truncate_tool_output(
    output: str,
    *,
    max_chars: int = MAX_TOOL_OUTPUT_CHARS,
) -> str:
    """Truncate a tool's return value to at most *max_chars* characters.

    If the output exceeds the limit a notice is appended so the LLM knows
    the content was clipped and can request specific ranges via tool
    parameters (e.g. ``start``/``end`` for document text).
    """
    if len(output) <= max_chars:
        return output

    notice = TOOL_OUTPUT_TRUNCATION_NOTICE.format(limit=max_chars)
    # Leave room for the notice itself
    truncated = output[: max_chars - len(notice)] + notice
    logger.debug(
        "Truncated tool output from %d to %d characters",
        len(output),
        len(truncated),
    )
    return truncated


# ---------------------------------------------------------------------------
# Conversation compaction
# ---------------------------------------------------------------------------


@dataclass
class CompactionResult:
    """Outcome of a compaction attempt.

    Attributes:
        compacted: Whether compaction was actually performed.
        summary: The generated summary text (empty if not compacted).
        preserved_count: Number of recent messages kept verbatim.
        removed_count: Number of older messages replaced by the summary.
        estimated_tokens_before: Estimated total tokens before compaction.
        estimated_tokens_after: Estimated total tokens after compaction.
    """

    compacted: bool = False
    summary: str = ""
    preserved_count: int = 0
    removed_count: int = 0
    estimated_tokens_before: int = 0
    estimated_tokens_after: int = 0


@dataclass
class _MessageProxy:
    """Lightweight stand-in for a ChatMessage during compaction.

    Avoids coupling the compaction logic to Django ORM models so the
    functions can be tested with plain data.
    """

    role: str  # "human", "llm", or "system"
    content: str
    token_estimate: int = 0

    def __post_init__(self) -> None:
        if not self.token_estimate:
            self.token_estimate = estimate_token_count(self.content)


def should_compact(
    messages: list[_MessageProxy],
    model_name: str,
    *,
    system_prompt_tokens: int = 0,
    threshold_ratio: float = COMPACTION_THRESHOLD_RATIO,
) -> bool:
    """Return ``True`` if the conversation should be compacted.

    The decision is based on whether the estimated token total (system
    prompt + all messages) exceeds *threshold_ratio* of the model's
    context window.
    """
    context_window = get_context_window_for_model(model_name)
    total_tokens = system_prompt_tokens + sum(m.token_estimate for m in messages)
    threshold = int(context_window * threshold_ratio)
    return total_tokens > threshold


def _build_summary_prompt(messages: list[_MessageProxy]) -> str:
    """Build the prompt sent to the LLM to generate a compaction summary.

    The prompt asks for a concise, factual summary of the conversation
    history that captures key decisions, facts, and user preferences.
    """
    conversation_text = "\n".join(f"[{m.role.upper()}]: {m.content}" for m in messages)
    return (
        "Summarise the following conversation history into a concise paragraph "
        f"of approximately {COMPACTION_SUMMARY_TARGET_TOKENS} tokens. "
        "Preserve:\n"
        "- Key facts and data points mentioned\n"
        "- Decisions made by the user\n"
        "- Important tool results and findings\n"
        "- Any pending questions or tasks\n\n"
        "Do NOT include greetings, filler, or restate the instructions.\n\n"
        f"--- CONVERSATION ---\n{conversation_text}\n--- END ---"
    )


def compact_message_history(
    messages: list[_MessageProxy],
    model_name: str,
    *,
    system_prompt_tokens: int = 0,
    threshold_ratio: float = COMPACTION_THRESHOLD_RATIO,
    min_recent: int = MIN_RECENT_MESSAGES,
    max_recent: int = MAX_RECENT_MESSAGES,
    summary_fn: object = None,
) -> CompactionResult:
    """Compact a message list by summarising old messages.

    The algorithm:

    1. Estimate total token usage (system prompt + messages).
    2. If under the threshold → return immediately (no compaction).
    3. Determine how many *recent* messages to keep verbatim — at least
       ``min_recent``, at most ``max_recent``.
    4. If a ``summary_fn`` callable is provided, call it with the
       *older* messages and use its return value as the summary text.
       Otherwise, build a deterministic summary from the message content.
    5. Return a :class:`CompactionResult` with the summary and split
       indices.

    Parameters:
        messages: Full conversation history as lightweight proxies.
        model_name: LLM model identifier for context window lookup.
        system_prompt_tokens: Estimated tokens for the system prompt.
        threshold_ratio: Context window fraction that triggers compaction.
        min_recent: Minimum recent messages to keep verbatim.
        max_recent: Maximum recent messages to keep verbatim.
        summary_fn: Optional callable ``(list[_MessageProxy]) -> str``
            that generates a summary of the compacted messages.  When
            ``None`` the module builds a deterministic (non-LLM) summary.

    Returns:
        A :class:`CompactionResult` describing the compaction outcome.
    """
    total_before = system_prompt_tokens + sum(m.token_estimate for m in messages)
    context_window = get_context_window_for_model(model_name)
    threshold = int(context_window * threshold_ratio)

    if total_before <= threshold:
        return CompactionResult(
            compacted=False,
            estimated_tokens_before=total_before,
            estimated_tokens_after=total_before,
            preserved_count=len(messages),
        )

    # Determine how many recent messages to keep.
    # Start with min_recent and expand until we hit max_recent or the
    # recent block alone would bust the threshold.
    recent_count = min(min_recent, len(messages))
    for candidate in range(min_recent, min(max_recent, len(messages)) + 1):
        recent_tokens = sum(m.token_estimate for m in messages[-candidate:])
        if system_prompt_tokens + recent_tokens > threshold:
            break
        recent_count = candidate

    # Edge case: if even min_recent messages exceed the threshold,
    # keep only the very last message to guarantee *some* context.
    if recent_count < 1:
        recent_count = 1

    older_messages = messages[:-recent_count] if recent_count < len(messages) else []
    recent_messages = messages[-recent_count:]

    if not older_messages:
        # Nothing to compact — all messages are "recent"
        return CompactionResult(
            compacted=False,
            estimated_tokens_before=total_before,
            estimated_tokens_after=total_before,
            preserved_count=len(messages),
        )

    # Generate summary
    if callable(summary_fn):
        summary_text = summary_fn(older_messages)
    else:
        summary_text = _deterministic_summary(older_messages)

    summary_with_prefix = COMPACTION_SUMMARY_PREFIX + summary_text
    summary_tokens = estimate_token_count(summary_with_prefix)
    recent_tokens = sum(m.token_estimate for m in recent_messages)
    total_after = system_prompt_tokens + summary_tokens + recent_tokens

    return CompactionResult(
        compacted=True,
        summary=summary_with_prefix,
        preserved_count=len(recent_messages),
        removed_count=len(older_messages),
        estimated_tokens_before=total_before,
        estimated_tokens_after=total_after,
    )


def _deterministic_summary(messages: list[_MessageProxy]) -> str:
    """Build a non-LLM summary by extracting key lines from *messages*.

    This is the fallback used when no ``summary_fn`` is provided (i.e.
    during synchronous/fast-path compaction where calling an LLM is not
    desirable).  The approach:

    - Keeps the first and last human message verbatim (truncated).
    - Extracts the first sentence of each LLM response.
    - Limits total length to ~COMPACTION_SUMMARY_TARGET_TOKENS tokens.
    """
    parts: list[str] = []
    char_budget = int(COMPACTION_SUMMARY_TARGET_TOKENS * CHARS_PER_TOKEN_ESTIMATE)

    human_messages = [m for m in messages if m.role == "human"]
    llm_messages = [m for m in messages if m.role == "llm"]

    if human_messages:
        first_q = human_messages[0].content[:200]
        parts.append(f'User initially asked: "{first_q}"')

    for m in llm_messages:
        # First sentence heuristic
        sentence = m.content.split(".")[0].strip()
        if sentence and len(sentence) > 10:
            parts.append(f'Assistant noted: "{sentence[:150]}"')

    if len(human_messages) > 1:
        last_q = human_messages[-1].content[:200]
        parts.append(f'User later asked: "{last_q}"')

    # Trim to budget
    summary = " | ".join(parts)
    if len(summary) > char_budget:
        summary = summary[:char_budget] + "…"

    return summary


# ---------------------------------------------------------------------------
# Integration helpers (for use by agent adapters)
# ---------------------------------------------------------------------------


def messages_to_proxies(
    messages: list,
) -> list[_MessageProxy]:
    """Convert a list of ChatMessage ORM objects to lightweight proxies.

    Handles the ``msg_type`` field conventions used by OpenContracts:
    ``HUMAN`` → ``human``, ``LLM`` → ``llm``, ``SYSTEM`` → ``system``.
    """
    proxies: list[_MessageProxy] = []
    for msg in messages:
        msg_type = getattr(msg, "msg_type", "").upper()
        if msg_type == "HUMAN":
            role = "human"
        elif msg_type == "LLM":
            role = "llm"
        elif msg_type == "SYSTEM":
            role = "system"
        else:
            role = "llm"  # safe default
        content = getattr(msg, "content", "") or ""
        proxies.append(_MessageProxy(role=role, content=content))
    return proxies


@dataclass
class CompactionConfig:
    """Per-agent compaction configuration.

    Allows callers to override the global defaults defined in
    :mod:`opencontractserver.constants.context_guardrails` on a
    per-conversation basis.
    """

    enabled: bool = True
    threshold_ratio: float = COMPACTION_THRESHOLD_RATIO
    min_recent_messages: int = MIN_RECENT_MESSAGES
    max_recent_messages: int = MAX_RECENT_MESSAGES
    max_tool_output_chars: int = MAX_TOOL_OUTPUT_CHARS
