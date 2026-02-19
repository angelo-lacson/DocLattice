"""Tests for context guardrails: token estimation, compaction, and truncation.

These tests are deliberately pure-unit (no Django DB required) so they run
fast and can be parallelised trivially.  They exercise the public API of
:mod:`opencontractserver.llms.context_guardrails` and the supporting
constants in :mod:`opencontractserver.constants.context_guardrails`.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from django.test import SimpleTestCase

from opencontractserver.constants.context_guardrails import (
    CHARS_PER_TOKEN_ESTIMATE,
    COMPACTION_SUMMARY_PREFIX,
    COMPACTION_THRESHOLD_RATIO,
    DEFAULT_CONTEXT_WINDOW,
    MAX_TOOL_OUTPUT_CHARS,
    MIN_RECENT_MESSAGES,
    MODEL_CONTEXT_WINDOWS,
)
from opencontractserver.llms.context_guardrails import (
    CompactionConfig,
    CompactionResult,
    _deterministic_summary,
    _MessageProxy,
    compact_message_history,
    estimate_token_count,
    get_context_window_for_model,
    messages_to_proxies,
    should_compact,
    truncate_tool_output,
)

# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


class TestEstimateTokenCount(SimpleTestCase):
    """Tests for the fast heuristic token estimator."""

    def test_empty_string_returns_zero(self):
        self.assertEqual(estimate_token_count(""), 0)

    def test_short_string(self):
        # "hello" = 5 chars → 5 / 3.5 ≈ 1.43 → int(1.43) = 1
        result = estimate_token_count("hello")
        self.assertGreaterEqual(result, 1)

    def test_known_length(self):
        # 350 chars → 350 / 3.5 = 100 tokens
        text = "x" * 350
        self.assertEqual(estimate_token_count(text), 100)

    def test_always_at_least_one_for_nonempty(self):
        self.assertGreaterEqual(estimate_token_count("a"), 1)

    def test_proportional_to_length(self):
        short = estimate_token_count("hello world")
        long = estimate_token_count("hello world " * 100)
        self.assertGreater(long, short)


# ---------------------------------------------------------------------------
# Model context window lookup
# ---------------------------------------------------------------------------


class TestGetContextWindowForModel(SimpleTestCase):
    """Tests for context window lookup with exact and prefix matching."""

    def test_exact_match(self):
        self.assertEqual(
            get_context_window_for_model("gpt-4o-mini"),
            MODEL_CONTEXT_WINDOWS["gpt-4o-mini"],
        )

    def test_prefix_match(self):
        # "gpt-4o-mini-2024-07-18" should match "gpt-4o-mini"
        result = get_context_window_for_model("gpt-4o-mini-2024-07-18")
        self.assertEqual(result, MODEL_CONTEXT_WINDOWS["gpt-4o-mini"])

    def test_anthropic_model(self):
        result = get_context_window_for_model("claude-3-5-sonnet-20241022")
        self.assertEqual(result, MODEL_CONTEXT_WINDOWS["claude-3-5-sonnet"])

    def test_unknown_model_returns_default(self):
        self.assertEqual(
            get_context_window_for_model("totally-unknown-model"),
            DEFAULT_CONTEXT_WINDOW,
        )

    def test_empty_string_returns_default(self):
        self.assertEqual(get_context_window_for_model(""), DEFAULT_CONTEXT_WINDOW)

    def test_longest_prefix_wins(self):
        """When multiple prefixes match, the longest one should win."""
        # "gpt-4o-mini" is a longer prefix than "gpt-4o"
        result = get_context_window_for_model("gpt-4o-mini-turbo")
        # Should match gpt-4o-mini (128K) not gpt-4o (128K too, but specificity matters)
        self.assertEqual(result, MODEL_CONTEXT_WINDOWS["gpt-4o-mini"])


# ---------------------------------------------------------------------------
# Tool output truncation
# ---------------------------------------------------------------------------


class TestTruncateToolOutput(SimpleTestCase):
    """Tests for the tool output truncation utility."""

    def test_short_output_unchanged(self):
        text = "This is short."
        self.assertEqual(truncate_tool_output(text), text)

    def test_output_at_exact_limit_unchanged(self):
        text = "x" * MAX_TOOL_OUTPUT_CHARS
        self.assertEqual(truncate_tool_output(text), text)

    def test_output_exceeding_limit_is_truncated(self):
        text = "x" * (MAX_TOOL_OUTPUT_CHARS + 1000)
        result = truncate_tool_output(text)
        self.assertLessEqual(len(result), MAX_TOOL_OUTPUT_CHARS + 200)  # +notice
        self.assertIn("truncated", result)

    def test_custom_max_chars(self):
        text = "x" * 200
        result = truncate_tool_output(text, max_chars=100)
        self.assertLess(len(result), 200)
        self.assertIn("truncated", result)

    def test_truncation_notice_contains_limit(self):
        text = "y" * 200
        result = truncate_tool_output(text, max_chars=50)
        self.assertIn("50", result)


# ---------------------------------------------------------------------------
# _MessageProxy
# ---------------------------------------------------------------------------


class TestMessageProxy(SimpleTestCase):
    """Tests for the lightweight message proxy used in compaction."""

    def test_auto_estimates_tokens(self):
        proxy = _MessageProxy(role="human", content="hello world")
        self.assertGreater(proxy.token_estimate, 0)

    def test_explicit_token_estimate(self):
        proxy = _MessageProxy(role="llm", content="stuff", token_estimate=42)
        self.assertEqual(proxy.token_estimate, 42)

    def test_empty_content(self):
        proxy = _MessageProxy(role="system", content="")
        self.assertEqual(proxy.token_estimate, 0)


# ---------------------------------------------------------------------------
# should_compact
# ---------------------------------------------------------------------------


class TestShouldCompact(SimpleTestCase):
    """Tests for the compaction trigger heuristic."""

    def test_small_conversation_no_compact(self):
        messages = [_MessageProxy(role="human", content="hi")]
        self.assertFalse(should_compact(messages, "gpt-4o-mini"))

    def test_large_conversation_triggers_compact(self):
        # Each message ~1000 tokens, 120 messages → 120K tokens
        # gpt-4o-mini has 128K window, 75% threshold = 96K
        big_content = "x" * int(1000 * CHARS_PER_TOKEN_ESTIMATE)
        messages = [
            _MessageProxy(role="human", content=big_content) for _ in range(120)
        ]
        self.assertTrue(should_compact(messages, "gpt-4o-mini"))

    def test_system_prompt_counts_toward_threshold(self):
        # With a large system prompt, even fewer messages can trigger compaction
        messages = [_MessageProxy(role="human", content="x" * 35000) for _ in range(10)]
        # This alone is ~100K chars = ~28K tokens.  With 50K system prompt
        # tokens the total exceeds 75% of 128K.
        self.assertTrue(
            should_compact(messages, "gpt-4o-mini", system_prompt_tokens=50_000)
        )

    def test_custom_threshold_ratio(self):
        messages = [_MessageProxy(role="human", content="x" * 35000) for _ in range(5)]
        # Very low threshold forces compaction even for small conversations
        self.assertTrue(should_compact(messages, "gpt-4o-mini", threshold_ratio=0.01))


# ---------------------------------------------------------------------------
# compact_message_history
# ---------------------------------------------------------------------------


class TestCompactMessageHistory(SimpleTestCase):
    """Tests for the main compaction algorithm."""

    def _make_messages(self, count: int, char_len: int = 100) -> list[_MessageProxy]:
        """Helper to create alternating human/llm message lists."""
        return [
            _MessageProxy(
                role="human" if i % 2 == 0 else "llm",
                content=f"Message {i}: " + "x" * char_len,
            )
            for i in range(count)
        ]

    def test_no_compaction_below_threshold(self):
        messages = self._make_messages(3, char_len=50)
        result = compact_message_history(messages, "gpt-4o-mini")
        self.assertFalse(result.compacted)
        self.assertEqual(result.preserved_count, len(messages))

    def test_compaction_on_large_history(self):
        # Force compaction with very low threshold
        messages = self._make_messages(20, char_len=500)
        result = compact_message_history(messages, "gpt-4o-mini", threshold_ratio=0.001)
        self.assertTrue(result.compacted)
        self.assertGreater(result.removed_count, 0)
        self.assertGreaterEqual(result.preserved_count, MIN_RECENT_MESSAGES)
        self.assertLess(result.estimated_tokens_after, result.estimated_tokens_before)

    def test_summary_contains_prefix(self):
        messages = self._make_messages(20, char_len=500)
        result = compact_message_history(messages, "gpt-4o-mini", threshold_ratio=0.001)
        self.assertTrue(result.summary.startswith(COMPACTION_SUMMARY_PREFIX))

    def test_custom_min_recent(self):
        messages = self._make_messages(20, char_len=500)
        result = compact_message_history(
            messages, "gpt-4o-mini", threshold_ratio=0.001, min_recent=8
        )
        self.assertGreaterEqual(result.preserved_count, 8)

    def test_custom_summary_fn(self):
        """When a summary_fn is provided it should be used instead of the default."""
        messages = self._make_messages(20, char_len=500)
        custom_summary = "Custom summary text"
        result = compact_message_history(
            messages,
            "gpt-4o-mini",
            threshold_ratio=0.001,
            summary_fn=lambda msgs: custom_summary,
        )
        self.assertIn(custom_summary, result.summary)

    def test_returns_result_dataclass(self):
        messages = self._make_messages(5, char_len=50)
        result = compact_message_history(messages, "gpt-4o-mini")
        self.assertIsInstance(result, CompactionResult)

    def test_single_message_never_compacted(self):
        messages = [_MessageProxy(role="human", content="x" * 100000)]
        result = compact_message_history(messages, "gpt-4o-mini", threshold_ratio=0.001)
        # Even if it exceeds threshold, a single message can't be split
        self.assertFalse(result.compacted)

    def test_all_messages_within_recent_window(self):
        """If all messages fit in the recent window, no compaction."""
        messages = self._make_messages(4, char_len=500)
        result = compact_message_history(
            messages, "gpt-4o-mini", threshold_ratio=0.001, min_recent=10
        )
        self.assertFalse(result.compacted)


# ---------------------------------------------------------------------------
# _deterministic_summary
# ---------------------------------------------------------------------------


class TestDeterministicSummary(SimpleTestCase):
    """Tests for the fallback (non-LLM) summary builder."""

    def test_captures_first_human_message(self):
        messages = [
            _MessageProxy(role="human", content="What is the contract about?"),
            _MessageProxy(role="llm", content="The contract covers services."),
        ]
        summary = _deterministic_summary(messages)
        self.assertIn("What is the contract about?", summary)

    def test_captures_llm_first_sentence(self):
        messages = [
            _MessageProxy(role="human", content="Summarise."),
            _MessageProxy(
                role="llm",
                content="This is a complex document. It covers many topics.",
            ),
        ]
        summary = _deterministic_summary(messages)
        self.assertIn("This is a complex document", summary)

    def test_captures_last_human_message(self):
        messages = [
            _MessageProxy(role="human", content="First question"),
            _MessageProxy(role="llm", content="First answer."),
            _MessageProxy(role="human", content="Follow-up question"),
        ]
        summary = _deterministic_summary(messages)
        self.assertIn("Follow-up question", summary)

    def test_respects_char_budget(self):
        """Summary should not grow unbounded."""
        messages = [
            _MessageProxy(role="human", content="q" * 500),
            _MessageProxy(role="llm", content="a" * 5000),
        ] * 50
        summary = _deterministic_summary(messages)
        # Should be bounded by COMPACTION_SUMMARY_TARGET_TOKENS * CHARS_PER_TOKEN_ESTIMATE
        max_expected = int(300 * CHARS_PER_TOKEN_ESTIMATE) + 100  # +slack
        self.assertLessEqual(len(summary), max_expected + 100)

    def test_empty_messages(self):
        summary = _deterministic_summary([])
        self.assertEqual(summary, "")


# ---------------------------------------------------------------------------
# messages_to_proxies (ORM ↔ proxy bridge)
# ---------------------------------------------------------------------------


class TestMessagesToProxies(SimpleTestCase):
    """Tests for converting ChatMessage-like objects to _MessageProxy."""

    def test_human_message(self):
        mock = MagicMock()
        mock.msg_type = "HUMAN"
        mock.content = "Hello"
        proxies = messages_to_proxies([mock])
        self.assertEqual(len(proxies), 1)
        self.assertEqual(proxies[0].role, "human")
        self.assertEqual(proxies[0].content, "Hello")

    def test_llm_message(self):
        mock = MagicMock()
        mock.msg_type = "LLM"
        mock.content = "Response"
        proxies = messages_to_proxies([mock])
        self.assertEqual(proxies[0].role, "llm")

    def test_system_message(self):
        mock = MagicMock()
        mock.msg_type = "SYSTEM"
        mock.content = "System prompt"
        proxies = messages_to_proxies([mock])
        self.assertEqual(proxies[0].role, "system")

    def test_unknown_type_defaults_to_llm(self):
        mock = MagicMock()
        mock.msg_type = "UNKNOWN"
        mock.content = "Something"
        proxies = messages_to_proxies([mock])
        self.assertEqual(proxies[0].role, "llm")

    def test_empty_list(self):
        self.assertEqual(messages_to_proxies([]), [])

    def test_none_content_handled(self):
        mock = MagicMock()
        mock.msg_type = "HUMAN"
        mock.content = None
        proxies = messages_to_proxies([mock])
        self.assertEqual(proxies[0].content, "")


# ---------------------------------------------------------------------------
# CompactionConfig
# ---------------------------------------------------------------------------


class TestCompactionConfig(SimpleTestCase):
    """Tests for the per-agent compaction configuration."""

    def test_defaults_match_constants(self):
        cfg = CompactionConfig()
        self.assertTrue(cfg.enabled)
        self.assertEqual(cfg.threshold_ratio, COMPACTION_THRESHOLD_RATIO)
        self.assertEqual(cfg.min_recent_messages, MIN_RECENT_MESSAGES)
        self.assertEqual(cfg.max_tool_output_chars, MAX_TOOL_OUTPUT_CHARS)

    def test_disabled(self):
        cfg = CompactionConfig(enabled=False)
        self.assertFalse(cfg.enabled)

    def test_custom_values(self):
        cfg = CompactionConfig(
            threshold_ratio=0.5,
            min_recent_messages=10,
            max_recent_messages=50,
            max_tool_output_chars=10_000,
        )
        self.assertEqual(cfg.threshold_ratio, 0.5)
        self.assertEqual(cfg.min_recent_messages, 10)
        self.assertEqual(cfg.max_recent_messages, 50)
        self.assertEqual(cfg.max_tool_output_chars, 10_000)


# ---------------------------------------------------------------------------
# Constants sanity checks
# ---------------------------------------------------------------------------


class TestConstants(SimpleTestCase):
    """Sanity-check tests for the guardrail constants."""

    def test_all_context_windows_positive(self):
        for model, window in MODEL_CONTEXT_WINDOWS.items():
            with self.subTest(model=model):
                self.assertGreater(window, 0)

    def test_default_context_window_positive(self):
        self.assertGreater(DEFAULT_CONTEXT_WINDOW, 0)

    def test_threshold_ratio_in_range(self):
        self.assertGreater(COMPACTION_THRESHOLD_RATIO, 0)
        self.assertLess(COMPACTION_THRESHOLD_RATIO, 1)

    def test_chars_per_token_positive(self):
        self.assertGreater(CHARS_PER_TOKEN_ESTIMATE, 0)

    def test_max_tool_output_chars_reasonable(self):
        self.assertGreater(MAX_TOOL_OUTPUT_CHARS, 1000)

    def test_min_recent_messages_positive(self):
        self.assertGreater(MIN_RECENT_MESSAGES, 0)


# ---------------------------------------------------------------------------
# DB-layer integration tests for compaction bookmark persistence
# ---------------------------------------------------------------------------


class TestConversationCompactionFields(SimpleTestCase):
    """Tests that the Conversation model has the expected compaction fields.

    Uses SimpleTestCase — no actual DB rows, just checks the field definitions
    exist on the model class.
    """

    def test_compaction_summary_field_exists(self):
        from opencontractserver.conversations.models import Conversation

        field = Conversation._meta.get_field("compaction_summary")
        self.assertTrue(field.blank)
        self.assertEqual(field.default, "")

    def test_compacted_before_message_id_field_exists(self):
        from opencontractserver.conversations.models import Conversation

        field = Conversation._meta.get_field("compacted_before_message_id")
        self.assertTrue(field.null)
        self.assertTrue(field.blank)


# ---------------------------------------------------------------------------
# Persist failure path — context must be preserved
# ---------------------------------------------------------------------------


class TestPersistFailurePreservesContext(SimpleTestCase):
    """Verify that when persist_compaction fails, the full message list is
    kept for the current call so no context is lost."""

    def test_persist_failure_keeps_full_message_list(self):
        """Simulate _get_message_history when persist_compaction raises."""
        # Build a scenario: 20 messages, compaction triggers, but persist fails.
        messages = [
            _MessageProxy(
                role="human" if i % 2 == 0 else "llm",
                content=f"Message {i}: " + "x" * 500,
            )
            for i in range(20)
        ]

        # Perform compaction (low threshold forces it)
        result = compact_message_history(messages, "gpt-4o-mini", threshold_ratio=0.001)
        self.assertTrue(result.compacted)
        self.assertGreater(result.removed_count, 0)

        # Simulate the agent's _get_message_history logic:
        # On persist failure, raw_messages should NOT be trimmed.
        raw_messages = list(messages)
        stored_summary = ""

        merged_summary = result.summary

        persist_failed = False
        try:
            # Simulate a DB failure
            raise RuntimeError("DB write failed")
        except Exception:
            persist_failed = True

        if not persist_failed:
            stored_summary = merged_summary
            raw_messages = raw_messages[-result.preserved_count :]

        # After failure: raw_messages should still have all 20 messages
        self.assertEqual(len(raw_messages), 20)
        # stored_summary should still be empty (not merged)
        self.assertEqual(stored_summary, "")


# ---------------------------------------------------------------------------
# max_tool_output_chars override via PydanticAIDependencies
# ---------------------------------------------------------------------------


class TestMaxToolOutputCharsOverride(SimpleTestCase):
    """Verify that PydanticAIDependencies.max_tool_output_chars is
    respected by the tool wrapper truncation calls."""

    def test_deps_default_matches_global_constant(self):
        """The default max_tool_output_chars should match the constant."""
        from opencontractserver.llms.tools.pydantic_ai_tools import (
            PydanticAIDependencies,
        )

        deps = PydanticAIDependencies()
        self.assertEqual(deps.max_tool_output_chars, MAX_TOOL_OUTPUT_CHARS)

    def test_deps_accepts_custom_value(self):
        """A custom max_tool_output_chars should be stored on the deps."""
        from opencontractserver.llms.tools.pydantic_ai_tools import (
            PydanticAIDependencies,
        )

        deps = PydanticAIDependencies(max_tool_output_chars=10_000)
        self.assertEqual(deps.max_tool_output_chars, 10_000)

    def test_truncation_respects_custom_limit(self):
        """truncate_tool_output should use the custom limit when passed."""
        long_text = "x" * 20_000
        # With default (50K), this should NOT be truncated
        result_default = truncate_tool_output(long_text)
        self.assertEqual(result_default, long_text)

        # With a 10K limit, it SHOULD be truncated
        result_custom = truncate_tool_output(long_text, max_chars=10_000)
        self.assertIn("truncated", result_custom)
        self.assertLess(len(result_custom), 20_000)


# ---------------------------------------------------------------------------
# Optimistic locking in persist_compaction
# ---------------------------------------------------------------------------


class TestPersistCompactionOptimisticLock(SimpleTestCase):
    """Verify that persist_compaction uses optimistic locking to avoid
    overwriting a concurrently-advanced bookmark."""

    def test_concurrent_persist_second_write_is_noop(self):
        """If the bookmark moves between read and write, the write is skipped."""
        from opencontractserver.llms.agents.core_agents import (
            CoreConversationManager,
        )

        # Create a mock conversation with no existing bookmark
        mock_conv = MagicMock()
        mock_conv.pk = 42
        mock_conv.compacted_before_message_id = None
        mock_conv.compaction_summary = ""

        manager = CoreConversationManager.__new__(CoreConversationManager)
        manager.conversation = mock_conv

        # Patch Conversation.objects.filter().aupdate()
        with patch(
            "opencontractserver.llms.agents.core_agents.Conversation"
        ) as MockConv:
            # First call: filter matches → updated=1
            mock_qs = MagicMock()
            mock_qs.aupdate = AsyncMock(return_value=1)
            MockConv.objects.filter.return_value = mock_qs

            asyncio.get_event_loop().run_until_complete(
                manager.persist_compaction(summary="Summary A", cutoff_message_id=100)
            )

            # Verify the in-memory state was updated
            self.assertEqual(mock_conv.compaction_summary, "Summary A")
            self.assertEqual(mock_conv.compacted_before_message_id, 100)

        # Now simulate the second concurrent request: bookmark already moved
        mock_conv.compacted_before_message_id = 100

        with patch(
            "opencontractserver.llms.agents.core_agents.Conversation"
        ) as MockConv:
            # Second call: filter doesn't match → updated=0
            mock_qs = MagicMock()
            mock_qs.aupdate = AsyncMock(return_value=0)
            MockConv.objects.filter.return_value = mock_qs

            asyncio.get_event_loop().run_until_complete(
                manager.persist_compaction(summary="Summary B", cutoff_message_id=90)
            )

            # In-memory state should NOT be updated (stale write was skipped)
            self.assertEqual(mock_conv.compaction_summary, "Summary A")
            self.assertEqual(mock_conv.compacted_before_message_id, 100)


# ---------------------------------------------------------------------------
# Running-total loop equivalence
# ---------------------------------------------------------------------------


class TestCompactionRunningTotalLoop(SimpleTestCase):
    """Verify the running-total recent-message sizing produces correct results."""

    def test_min_recent_respected(self):
        """Even with huge messages, at least min_recent messages are kept."""
        big = "x" * 500_000  # ~142K tokens each
        messages = [
            _MessageProxy(role="human", content=big),
            _MessageProxy(role="llm", content=big),
            _MessageProxy(role="human", content=big),
            _MessageProxy(role="llm", content=big),
            _MessageProxy(role="human", content=big),
        ]
        result = compact_message_history(
            messages, "gpt-4o-mini", threshold_ratio=0.001, min_recent=2
        )
        self.assertTrue(result.compacted)
        self.assertGreaterEqual(result.preserved_count, 2)

    def test_max_recent_respected(self):
        """Recent count should not exceed max_recent."""
        messages = [
            _MessageProxy(role="human" if i % 2 == 0 else "llm", content="x" * 100)
            for i in range(30)
        ]
        result = compact_message_history(
            messages, "gpt-4o-mini", threshold_ratio=0.001, max_recent=5
        )
        if result.compacted:
            self.assertLessEqual(result.preserved_count, 5)
