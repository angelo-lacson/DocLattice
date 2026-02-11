from __future__ import annotations

"""Tests for nested approval gates (corpus → document sub-agent propagation).

These tests verify:
1. Sub-agent approval events propagate through ask_document_tool to the corpus
   agent level as ToolConfirmationRequired exceptions.
2. Metadata (_sub_tool_name / _sub_tool_arguments) is preserved for the UI
   and stripped before tool execution.
3. The config._approval_bypass_allowed flag is set only during post-approval
   tool execution and cannot be manipulated by the LLM.
4. Malformed approval events are handled gracefully.
5. The resume_with_approval flow correctly bypasses sub-agent approval gates.

Uses TransactionTestCase and @pytest.mark.serial because async Django ORM
calls require fresh database connections that do not work well with
TestCase's transaction-based isolation.
"""

import types
from dataclasses import dataclass, field
from typing import Any, Literal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.agents.core_agents import (
    MessageState,
    UnifiedStreamEvent,
)
from opencontractserver.llms.exceptions import ToolConfirmationRequired
from opencontractserver.llms.tools.tool_factory import CoreTool

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers – lightweight stubs for PydanticAI internals
# ---------------------------------------------------------------------------


@dataclass
class _FakeApprovalEvent:
    """Mimics the UnifiedStreamEvent emitted by a sub-agent when a tool
    requires approval."""

    type: Literal["approval_needed"] = "approval_needed"
    pending_tool_call: dict[str, Any] = field(default_factory=dict)


@dataclass
class _FakeContentEvent:
    type: Literal["content"] = "content"
    content: str = "Some document content."


@dataclass
class _FakeFinalEvent:
    type: Literal["final"] = "final"
    content: str = "Done."
    sources: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class _RunRes:
    """Stub returned by the agent's iter context manager after approval."""

    def __init__(self, text: str = "ok") -> None:
        self.output = text

    def usage(self):
        return None

    @property
    def result(self):
        return types.SimpleNamespace(output=self.output, usage=self.usage)

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


class _IterCtx:
    """Async context manager mimicking a successful agent.iter() call."""

    async def __aenter__(self):
        return _RunRes()

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _make_gate_tool(name: str) -> CoreTool:
    """Return a CoreTool whose execution is veto-gated by default."""

    def _inner(x: int) -> int:
        return x * 2

    return CoreTool.from_function(_inner, name=name, requires_approval=True)


GATE_TOOL = _make_gate_tool("approved_tool")


# ---------------------------------------------------------------------------
# Mock sub-agent that yields an approval_needed event
# ---------------------------------------------------------------------------


class _MockSubAgent:
    """A mock document agent whose stream() yields configurable events."""

    def __init__(self, events: list):
        self._events = events

    async def stream(self, question: str):
        for ev in self._events:
            yield ev


# ---------------------------------------------------------------------------
# Test suite
# ---------------------------------------------------------------------------


@pytest.mark.serial
@override_settings(DATABASES={"default": {"CONN_MAX_AGE": 0}})
class TestNestedApprovalGates(TransactionTestCase):
    """Tests for nested sub-agent approval propagation.

    Uses TransactionTestCase because async test methods with Django ORM calls
    don't work well with TestCase's transaction-based isolation.
    """

    def setUp(self):
        super().setUp()
        self.user: User = User.objects.create_user("nested-approval-user")
        self.corpus: Corpus = Corpus.objects.create(
            title="Nested Test Corpus",
            description="",
            creator=self.user,
            is_public=False,
        )
        self.document: Document = Document.objects.create(
            title="Nested Test Doc",
            description="",
            creator=self.user,
            is_public=False,
        )
        self.document, _, _ = self.corpus.add_document(
            document=self.document, user=self.user
        )

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    async def _create_corpus_agent(self, sub_agent_events=None):
        """Create a corpus agent with mocked PydanticAIAgent and sub-agent factory."""
        from opencontractserver.llms.agents.agent_factory import (
            UnifiedAgentFactory,
        )
        from opencontractserver.llms.types import AgentFramework

        # Default sub-agent events: yield an approval_needed event
        if sub_agent_events is None:
            sub_agent_events = [
                _FakeApprovalEvent(
                    pending_tool_call={
                        "name": "update_document_summary",
                        "arguments": {"new_content": "test summary"},
                        "tool_call_id": "sub-tc-1",
                    },
                ),
            ]

        # Patch sub-agent factory to return our mock
        mock_sub_agent = _MockSubAgent(sub_agent_events)

        # We need to patch the agents API used inside ask_document_tool
        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent"
        ) as mock_agent_cls:
            # Set up the mocked PydanticAI agent instance
            inst = MagicMock()
            inst.iter = MagicMock(return_value=_IterCtx())
            inst._function_tools = {}

            # Make agent.run raise ToolConfirmationRequired to simulate
            # the approval flow being triggered
            async def _run_side_effect(*_a, **_kw):
                raise ToolConfirmationRequired(
                    tool_name="ask_document",
                    tool_args={
                        "document_id": self.document.id,
                        "question": "test question",
                    },
                    tool_call_id="tc-corpus-1",
                )

            inst.run = AsyncMock(side_effect=_run_side_effect)
            mock_agent_cls.return_value = inst

            agent = await UnifiedAgentFactory.create_corpus_agent(
                corpus=self.corpus.id,
                framework=AgentFramework.PYDANTIC_AI,
                user_id=self.user.id,
            )

        # Store refs for test access
        agent._mock_sub_agent = mock_sub_agent
        return agent

    async def _collect(self, gen):
        items: list[UnifiedStreamEvent] = []
        async for ev in gen:
            items.append(ev)
        return items

    # ------------------------------------------------------------------
    # Tests: ask_document_tool approval propagation
    # ------------------------------------------------------------------

    async def test_ask_document_tool_propagates_approval(self):
        """ask_document_tool should raise ToolConfirmationRequired when
        a sub-agent emits an approval_needed event."""
        agent = await self._create_corpus_agent()

        # Get the ask_document tool from the agent's tools list
        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        self.assertIsNotNone(ask_doc_fn, "ask_document tool not found in config.tools")

        # Mock the _agents_api.for_document to return our mock sub-agent
        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=agent._mock_sub_agent)

            # Create a minimal context to call the tool
            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            with self.assertRaises(ToolConfirmationRequired) as cm:
                await ask_doc_fn(
                    _Ctx(),
                    document_id=self.document.id,
                    question="What is this document about?",
                )

            exc = cm.exception
            self.assertEqual(exc.tool_name, "ask_document")
            self.assertEqual(exc.tool_args["document_id"], self.document.id)
            self.assertEqual(exc.tool_args["question"], "What is this document about?")
            self.assertEqual(exc.tool_args["_sub_tool_name"], "update_document_summary")
            self.assertEqual(
                exc.tool_args["_sub_tool_arguments"],
                {"new_content": "test summary"},
            )
            self.assertEqual(exc.tool_call_id, "sub-tc-1")

    async def test_ask_document_tool_normal_flow_without_approval(self):
        """When sub-agent completes without approval events, the tool should
        return normally."""
        normal_events = [
            _FakeContentEvent(content="The document is about testing."),
            _FakeFinalEvent(
                content="Done.",
                sources=[],
                metadata={},
            ),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=normal_events)

        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        self.assertIsNotNone(ask_doc_fn)

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=agent._mock_sub_agent)

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            result = await ask_doc_fn(
                _Ctx(),
                document_id=self.document.id,
                question="What is this document about?",
            )

            self.assertIn("answer", result)
            self.assertEqual(result["answer"], "The document is about testing.")

    # ------------------------------------------------------------------
    # Tests: malformed approval events
    # ------------------------------------------------------------------

    async def test_malformed_approval_event_missing_name(self):
        """An approval_needed event with missing 'name' in pending_tool_call
        should be skipped gracefully."""
        events = [
            _FakeApprovalEvent(
                pending_tool_call={
                    # Missing "name" key
                    "arguments": {"x": 1},
                    "tool_call_id": "tc-bad",
                },
            ),
            _FakeContentEvent(content="Continuing after bad event."),
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=events)

        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        self.assertIsNotNone(ask_doc_fn)

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=agent._mock_sub_agent)

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            # Should not raise ToolConfirmationRequired – the bad event
            # is skipped and the tool runs to completion.
            result = await ask_doc_fn(
                _Ctx(),
                document_id=self.document.id,
                question="Test",
            )
            self.assertIn("answer", result)
            self.assertEqual(result["answer"], "Continuing after bad event.")

    async def test_malformed_approval_event_empty_name(self):
        """An approval event with empty string name should be skipped."""
        events = [
            _FakeApprovalEvent(
                pending_tool_call={
                    "name": "",
                    "arguments": {},
                    "tool_call_id": "tc-empty",
                },
            ),
            _FakeContentEvent(content="After empty name event."),
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=events)

        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=agent._mock_sub_agent)

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            result = await ask_doc_fn(
                _Ctx(),
                document_id=self.document.id,
                question="Test",
            )
            self.assertEqual(result["answer"], "After empty name event.")

    async def test_malformed_approval_event_non_dict(self):
        """An approval event with non-dict pending_tool_call should be skipped."""
        events = [
            _FakeApprovalEvent(pending_tool_call="not-a-dict"),
            _FakeContentEvent(content="After non-dict event."),
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=events)

        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=agent._mock_sub_agent)

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            result = await ask_doc_fn(
                _Ctx(),
                document_id=self.document.id,
                question="Test",
            )
            self.assertEqual(result["answer"], "After non-dict event.")

    # ------------------------------------------------------------------
    # Tests: metadata stripping in resume_with_approval
    # ------------------------------------------------------------------

    async def test_metadata_keys_stripped_before_tool_execution(self):
        """_-prefixed keys in tool_args should be stripped before the tool
        function is called in resume_with_approval."""
        from opencontractserver.conversations.models import Conversation
        from opencontractserver.llms.agents.agent_factory import (
            UnifiedAgentFactory,
        )
        from opencontractserver.llms.types import AgentFramework

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent"
        ) as mock_agent_cls:
            inst = MagicMock()

            # Never raise – just return a result
            inst.run = AsyncMock(
                return_value=types.SimpleNamespace(
                    data="ok", sources=[], usage=lambda: None
                )
            )
            inst.iter = MagicMock(return_value=_IterCtx())

            # Capture the args that the tool receives
            captured_args = {}

            async def _spy_tool(ctx, **kwargs):
                captured_args.update(kwargs)
                return {"result": "success"}

            inst._function_tools = {
                "ask_document": types.SimpleNamespace(function=_spy_tool),
            }
            mock_agent_cls.return_value = inst

            agent = await UnifiedAgentFactory.create_corpus_agent(
                corpus=self.corpus.id,
                framework=AgentFramework.PYDANTIC_AI,
                user_id=self.user.id,
            )

        # Create a paused message with _-prefixed metadata
        from opencontractserver.conversations.models import ChatMessage

        conversation = await Conversation.objects.acreate(
            creator=self.user,
            chat_type="CORPUS",
        )
        agent.conversation_manager.conversation = conversation

        paused_msg = await ChatMessage.objects.acreate(
            conversation=conversation,
            content="Awaiting approval",
            msg_type="LLM",
            creator=self.user,
            data={
                "state": str(MessageState.AWAITING_APPROVAL),
                "pending_tool_call": {
                    "name": "ask_document",
                    "arguments": {
                        "document_id": self.document.id,
                        "question": "test question",
                        "_sub_tool_name": "update_document_summary",
                        "_sub_tool_arguments": {"new_content": "test"},
                    },
                    "tool_call_id": "call-nested-1",
                },
            },
        )

        events = []
        async for ev in agent.resume_with_approval(paused_msg.id, approved=True):
            events.append(ev)

        # Verify that _-prefixed keys were NOT passed to the tool
        self.assertNotIn("_sub_tool_name", captured_args)
        self.assertNotIn("_sub_tool_arguments", captured_args)
        # But the actual args should be present
        self.assertIn("document_id", captured_args)
        self.assertIn("question", captured_args)

    # ------------------------------------------------------------------
    # Tests: config._approval_bypass_allowed lifecycle
    # ------------------------------------------------------------------

    async def test_bypass_flag_set_during_resume_and_reset_after(self):
        """config._approval_bypass_allowed should be True during tool execution
        in resume_with_approval and reset to False afterwards."""
        from opencontractserver.conversations.models import ChatMessage, Conversation
        from opencontractserver.llms.agents.agent_factory import (
            UnifiedAgentFactory,
        )
        from opencontractserver.llms.types import AgentFramework

        bypass_values_during_execution = []

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent"
        ) as mock_agent_cls:
            inst = MagicMock()
            inst.run = AsyncMock(
                return_value=types.SimpleNamespace(
                    data="ok", sources=[], usage=lambda: None
                )
            )
            inst.iter = MagicMock(return_value=_IterCtx())

            async def _capture_bypass_tool(ctx, **kwargs):
                # Capture the bypass flag value AT EXECUTION TIME
                # by reading it from the agent's config via the closure
                bypass_values_during_execution.append(
                    getattr(agent.config, "_approval_bypass_allowed", "MISSING")
                )
                return {"result": "done"}

            inst._function_tools = {
                "test_tool": types.SimpleNamespace(function=_capture_bypass_tool),
            }
            mock_agent_cls.return_value = inst

            agent = await UnifiedAgentFactory.create_corpus_agent(
                corpus=self.corpus.id,
                framework=AgentFramework.PYDANTIC_AI,
                user_id=self.user.id,
            )

        conversation = await Conversation.objects.acreate(
            creator=self.user,
            chat_type="CORPUS",
        )
        agent.conversation_manager.conversation = conversation

        paused_msg = await ChatMessage.objects.acreate(
            conversation=conversation,
            content="Awaiting approval",
            msg_type="LLM",
            creator=self.user,
            data={
                "state": str(MessageState.AWAITING_APPROVAL),
                "pending_tool_call": {
                    "name": "test_tool",
                    "arguments": {"x": 1},
                    "tool_call_id": "call-bypass-1",
                },
            },
        )

        # Verify bypass is False before
        self.assertFalse(getattr(agent.config, "_approval_bypass_allowed", False))

        events = []
        async for ev in agent.resume_with_approval(paused_msg.id, approved=True):
            events.append(ev)

        # Verify bypass was True during tool execution
        self.assertEqual(len(bypass_values_during_execution), 1)
        self.assertTrue(bypass_values_during_execution[0])

        # Verify bypass is False after
        self.assertFalse(getattr(agent.config, "_approval_bypass_allowed", False))

    async def test_bypass_flag_reset_on_tool_error(self):
        """config._approval_bypass_allowed should be reset to False even
        if the tool raises an exception."""
        from opencontractserver.conversations.models import ChatMessage, Conversation
        from opencontractserver.llms.agents.agent_factory import (
            UnifiedAgentFactory,
        )
        from opencontractserver.llms.types import AgentFramework

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent"
        ) as mock_agent_cls:
            inst = MagicMock()
            inst.run = AsyncMock(
                return_value=types.SimpleNamespace(
                    data="ok", sources=[], usage=lambda: None
                )
            )
            inst.iter = MagicMock(return_value=_IterCtx())

            async def _failing_tool(ctx, **kwargs):
                raise RuntimeError("Tool exploded")

            inst._function_tools = {
                "exploding_tool": types.SimpleNamespace(function=_failing_tool),
            }
            mock_agent_cls.return_value = inst

            agent = await UnifiedAgentFactory.create_corpus_agent(
                corpus=self.corpus.id,
                framework=AgentFramework.PYDANTIC_AI,
                user_id=self.user.id,
            )

        conversation = await Conversation.objects.acreate(
            creator=self.user,
            chat_type="CORPUS",
        )
        agent.conversation_manager.conversation = conversation

        paused_msg = await ChatMessage.objects.acreate(
            conversation=conversation,
            content="Awaiting approval",
            msg_type="LLM",
            creator=self.user,
            data={
                "state": str(MessageState.AWAITING_APPROVAL),
                "pending_tool_call": {
                    "name": "exploding_tool",
                    "arguments": {"x": 1},
                    "tool_call_id": "call-explode-1",
                },
            },
        )

        # The error should propagate but bypass flag should still be reset
        with self.assertRaises(RuntimeError):
            async for _ev in agent.resume_with_approval(paused_msg.id, approved=True):
                pass

        self.assertFalse(getattr(agent.config, "_approval_bypass_allowed", False))

    # ------------------------------------------------------------------
    # Tests: skip_approval parameter removed from LLM-visible schema
    # ------------------------------------------------------------------

    async def test_skip_approval_not_in_tool_parameters(self):
        """The ask_document tool should NOT expose skip_approval in its
        parameter schema visible to the LLM."""
        import inspect

        from opencontractserver.llms.agents.agent_factory import (
            UnifiedAgentFactory,
        )
        from opencontractserver.llms.types import AgentFramework

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent"
        ) as mock_agent_cls:
            inst = MagicMock()
            inst.run = AsyncMock()
            inst.iter = MagicMock(return_value=_IterCtx())
            inst._function_tools = {}
            mock_agent_cls.return_value = inst

            agent = await UnifiedAgentFactory.create_corpus_agent(
                corpus=self.corpus.id,
                framework=AgentFramework.PYDANTIC_AI,
                user_id=self.user.id,
            )

        # Find the ask_document tool
        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        self.assertIsNotNone(ask_doc_fn)

        # Inspect the function signature – skip_approval should NOT be there
        sig = inspect.signature(ask_doc_fn)
        param_names = list(sig.parameters.keys())

        # The wrapper adds 'ctx' as first param; the rest should be
        # document_id and question only
        self.assertNotIn("skip_approval", param_names)
        # Sanity check the expected params are present
        self.assertIn("document_id", param_names)
        self.assertIn("question", param_names)

    # ------------------------------------------------------------------
    # Tests: approval_bypass_allowed controls sub-agent skip
    # ------------------------------------------------------------------

    async def test_bypass_flag_passes_to_sub_agent_factory(self):
        """When config._approval_bypass_allowed is True (during resume),
        the sub-agent should be created with skip_approval_gate=True."""
        agent = await self._create_corpus_agent()

        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        self.assertIsNotNone(ask_doc_fn)

        # Normal events (no approval needed) so the tool completes
        normal_sub = _MockSubAgent(
            [
                _FakeContentEvent(content="Answer."),
                _FakeFinalEvent(content="Done.", sources=[], metadata={}),
            ]
        )

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=normal_sub)

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            # Simulate post-approval context
            agent.config._approval_bypass_allowed = True
            try:
                await ask_doc_fn(
                    _Ctx(),
                    document_id=self.document.id,
                    question="Test",
                )
            finally:
                agent.config._approval_bypass_allowed = False

            # Verify for_document was called with skip_approval_gate=True
            mock_api.for_document.assert_called_once()
            call_kwargs = mock_api.for_document.call_args
            self.assertTrue(
                call_kwargs.kwargs.get("skip_approval_gate", False),
                "Sub-agent should be created with skip_approval_gate=True "
                "when config._approval_bypass_allowed is True",
            )

    async def test_normal_call_does_not_bypass(self):
        """When config._approval_bypass_allowed is False (normal execution),
        the sub-agent should be created with skip_approval_gate=False."""
        # Use events that don't trigger approval
        normal_sub = _MockSubAgent(
            [
                _FakeContentEvent(content="Answer."),
                _FakeFinalEvent(content="Done.", sources=[], metadata={}),
            ]
        )
        agent = await self._create_corpus_agent(
            sub_agent_events=[
                _FakeContentEvent(content="Answer."),
                _FakeFinalEvent(content="Done.", sources=[], metadata={}),
            ]
        )

        ask_doc_fn = None
        for tool in agent.config.tools or []:
            if getattr(tool, "__name__", None) == "ask_document":
                ask_doc_fn = tool
                break

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents._agents_api"
        ) as mock_api:
            mock_api.for_document = AsyncMock(return_value=normal_sub)

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            # Ensure bypass is False (default)
            self.assertFalse(getattr(agent.config, "_approval_bypass_allowed", False))

            await ask_doc_fn(
                _Ctx(),
                document_id=self.document.id,
                question="Test",
            )

            # Verify for_document was called with skip_approval_gate=False
            mock_api.for_document.assert_called_once()
            call_kwargs = mock_api.for_document.call_args
            self.assertFalse(
                call_kwargs.kwargs.get("skip_approval_gate", True),
                "Sub-agent should be created with skip_approval_gate=False "
                "when config._approval_bypass_allowed is not set",
            )
