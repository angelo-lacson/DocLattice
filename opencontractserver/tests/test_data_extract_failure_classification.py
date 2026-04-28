"""Tests for the structured-extraction None-result classifier.

When ``doc_extract_query_task`` gets ``None`` back from pydantic-ai's
structured agent, it now classifies *why* by inspecting the captured
message log. See issue #1381.
"""

from __future__ import annotations

from typing import Any

from django.test import SimpleTestCase

from opencontractserver.llms.agents.pydantic_ai_agents import _is_anthropic_model
from opencontractserver.tasks.data_extract_tasks import (
    NONE_RESULT_AGENT_COMMITTED,
    NONE_RESULT_NO_FINAL,
    NONE_RESULT_TOOL_LOOP,
    NONE_RESULT_UNKNOWN,
    _classify_none_result,
    _failure_message_for_classification,
)


def _make_response(*parts: Any) -> Any:
    """Construct a pydantic-ai ``ModelResponse`` from raw parts."""
    from pydantic_ai.messages import ModelResponse

    return ModelResponse(parts=list(parts))


def _tool_call(name: str, args: Any = None) -> Any:
    from pydantic_ai.messages import ToolCallPart

    return ToolCallPart(tool_name=name, args=args, tool_call_id="test")


def _text(content: str) -> Any:
    from pydantic_ai.messages import TextPart

    return TextPart(content=content)


class ClassifyNoneResultTests(SimpleTestCase):
    """Unit tests for :func:`_classify_none_result`."""

    def test_empty_messages_is_unknown(self) -> None:
        self.assertEqual(_classify_none_result(None), NONE_RESULT_UNKNOWN)
        self.assertEqual(_classify_none_result([]), NONE_RESULT_UNKNOWN)

    def test_final_result_call_classifies_as_committed(self) -> None:
        """A ``final_result`` ToolCallPart means the agent committed."""
        messages = [
            _make_response(_tool_call("similarity_search", {"query": "x"})),
            _make_response(_tool_call("final_result", {"value": None})),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_AGENT_COMMITTED)

    def test_final_result_with_suffix_still_committed(self) -> None:
        """Pydantic-ai uses ``final_result_<TypeName>`` for non-string outputs."""
        messages = [
            _make_response(_tool_call("final_result_MyType", {"value": None})),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_AGENT_COMMITTED)

    def test_no_tool_calls_at_all_is_no_final(self) -> None:
        """Pure-text responses with no final_result indicate the loop bailed."""
        messages = [_make_response(_text("Let me search the document..."))]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_NO_FINAL)

    def test_tool_calls_without_final_is_no_final(self) -> None:
        """Tool calls but no final_result and no loop ⇒ no_final_response."""
        messages = [
            _make_response(_tool_call("similarity_search", {"query": "alpha"})),
            _make_response(_tool_call("similarity_search", {"query": "beta"})),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_NO_FINAL)

    def test_repeated_tool_call_classifies_as_tool_loop(self) -> None:
        """Same tool call repeated >= threshold without final ⇒ tool_loop."""
        repeated = _tool_call("similarity_search", {"query": "the same thing"})
        messages = [
            _make_response(repeated),
            _make_response(repeated),
            _make_response(repeated),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_TOOL_LOOP)

    def test_repeats_below_threshold_are_not_tool_loop(self) -> None:
        """Two repeats (threshold - 1) ⇒ no_final_response, not tool_loop.

        Pins the boundary so a future tweak of ``_TOOL_LOOP_THRESHOLD``
        forces this test to be updated explicitly.
        """
        repeated = _tool_call("similarity_search", {"query": "same"})
        messages = [
            _make_response(repeated),
            _make_response(repeated),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_NO_FINAL)

    def test_loop_then_final_is_committed_not_loop(self) -> None:
        """If the agent eventually commits, that wins over loop detection."""
        repeated = _tool_call("similarity_search", {"query": "loop"})
        messages = [
            _make_response(repeated),
            _make_response(repeated),
            _make_response(repeated),
            _make_response(_tool_call("final_result", {"value": None})),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_AGENT_COMMITTED)

    def test_text_and_single_tool_calls_are_no_final(self) -> None:
        """Mix of narration + tool calls (under threshold) ⇒ no_final_response.

        This is the canonical Anthropic failure mode from issue #1381.
        """
        messages = [
            _make_response(
                _text("Let me search the document for password protection."),
                _tool_call("similarity_search", {"query": "password"}),
            ),
            _make_response(_text("Let me check access controls.")),
        ]
        self.assertEqual(_classify_none_result(messages), NONE_RESULT_NO_FINAL)


class FailureMessageTests(SimpleTestCase):
    """Smoke tests for :func:`_failure_message_for_classification`."""

    def test_messages_are_distinct_per_classification(self) -> None:
        """Each classification produces a distinct human-readable message."""
        messages = {
            classification: _failure_message_for_classification(classification)
            for classification in (
                NONE_RESULT_AGENT_COMMITTED,
                NONE_RESULT_NO_FINAL,
                NONE_RESULT_TOOL_LOOP,
                NONE_RESULT_UNKNOWN,
            )
        }
        self.assertEqual(len(set(messages.values())), 4)
        self.assertIn("not found", messages[NONE_RESULT_AGENT_COMMITTED].lower())
        self.assertIn("integration failure", messages[NONE_RESULT_NO_FINAL])
        self.assertIn("looped", messages[NONE_RESULT_TOOL_LOOP])

    def test_integration_failure_messages_reference_log(self) -> None:
        """Operators need a pointer to the raw conversation in the cell stacktrace."""
        for classification in (NONE_RESULT_NO_FINAL, NONE_RESULT_TOOL_LOOP):
            with self.subTest(classification=classification):
                self.assertIn(
                    "llm_call_log",
                    _failure_message_for_classification(classification),
                )


class IsAnthropicModelTests(SimpleTestCase):
    """Tests for the Anthropic model-name detector used for structured runs."""

    def test_anthropic_prefix_is_detected(self) -> None:
        self.assertTrue(_is_anthropic_model("anthropic:claude-sonnet-4-6"))
        self.assertTrue(_is_anthropic_model("ANTHROPIC:claude-3-haiku"))

    def test_bare_claude_name_is_detected(self) -> None:
        self.assertTrue(_is_anthropic_model("claude-3-opus-20240229"))
        self.assertTrue(_is_anthropic_model("Claude-Sonnet-4-6"))

    def test_openai_models_are_not_detected(self) -> None:
        self.assertFalse(_is_anthropic_model("openai:gpt-4o-mini"))
        self.assertFalse(_is_anthropic_model("gpt-4"))
        self.assertFalse(_is_anthropic_model("o1-preview"))

    def test_empty_or_none_is_not_detected(self) -> None:
        self.assertFalse(_is_anthropic_model(None))
        self.assertFalse(_is_anthropic_model(""))
