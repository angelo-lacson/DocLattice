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

import inspect
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

User = get_user_model()

# The closure inside PydanticAICorpusAgent.create() imports _agents_api as:
#     from opencontractserver.llms import agents as _agents_api
# This resolves to the AgentAPI singleton at opencontractserver.llms.api.agents.
# To intercept ask_document_tool's calls to _agents_api.for_document(), we
# must patch AgentAPI.for_document on that instance — NOT a module-level name.
_AGENTS_API_FOR_DOC_PATCH = "opencontractserver.llms.api.AgentAPI.for_document"


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


class _IterCtx:
    """Async context manager mimicking a successful agent.iter() call."""

    async def __aenter__(self):
        return types.SimpleNamespace(
            output="ok",
            usage=lambda: None,
            result=types.SimpleNamespace(output="ok", usage=lambda: None),
        )

    async def __aexit__(self, exc_type, exc, tb):
        return False


# ---------------------------------------------------------------------------
# Mock sub-agent that yields configurable stream events
# ---------------------------------------------------------------------------


class _MockSubAgent:
    """A mock document agent whose stream() yields configurable events."""

    def __init__(self, events: list):
        self._events = events

    async def stream(self, question: str):
        for ev in self._events:
            yield ev


def _extract_tool(tools_list, name: str):
    """Find a tool callable by __name__ from a list of tool callables."""
    for t in tools_list or []:
        if getattr(t, "__name__", None) == name:
            return t
    return None


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
        """Create a corpus agent with mocked PydanticAIAgent.

        The PydanticAIAgent constructor is mocked so no real LLM is needed.
        The mock captures ``tools=`` passed to the constructor, which lets
        tests retrieve corpus-specific closures (ask_document, etc.) that
        are NOT stored on ``config.tools``.
        """
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

        mock_sub_agent = _MockSubAgent(sub_agent_events)

        with patch(
            "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIAgent"
        ) as mock_agent_cls:
            inst = MagicMock()
            inst.iter = MagicMock(return_value=_IterCtx())
            inst._function_tools = {}
            inst.run = AsyncMock(
                return_value=types.SimpleNamespace(
                    data="ok", sources=[], usage=lambda: None
                )
            )
            mock_agent_cls.return_value = inst

            agent = await UnifiedAgentFactory.create_corpus_agent(
                corpus=self.corpus.id,
                framework=AgentFramework.PYDANTIC_AI,
                user_id=self.user.id,
            )

            # Capture the tools that were passed to PydanticAIAgent(tools=...)
            # These are the corpus-specific closures built inside create().
            call_kwargs = mock_agent_cls.call_args
            effective_tools = (
                call_kwargs.kwargs.get("tools")
                or (call_kwargs.args[1] if len(call_kwargs.args) > 1 else [])
                or []
            )

        agent._effective_tools = effective_tools
        agent._mock_sub_agent = mock_sub_agent
        return agent

    async def _collect(self, gen):
        items: list[UnifiedStreamEvent] = []
        async for ev in gen:
            items.append(ev)
        return items

    def _get_ask_doc(self, agent):
        """Retrieve the ask_document tool callable from the agent."""
        fn = _extract_tool(agent._effective_tools, "ask_document")
        self.assertIsNotNone(fn, "ask_document tool not found in effective_tools")
        return fn

    # ------------------------------------------------------------------
    # Tests: ask_document_tool approval propagation
    # ------------------------------------------------------------------

    async def test_ask_document_tool_propagates_approval(self):
        """ask_document_tool should raise ToolConfirmationRequired when
        a sub-agent emits an approval_needed event."""
        agent = await self._create_corpus_agent()
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=agent._mock_sub_agent,
        ):

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
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=normal_events)
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=agent._mock_sub_agent,
        ):

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
                    "arguments": {"x": 1},
                    "tool_call_id": "tc-bad",
                },
            ),
            _FakeContentEvent(content="Continuing after bad event."),
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=events)
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=agent._mock_sub_agent,
        ):

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
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=agent._mock_sub_agent,
        ):

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
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=agent._mock_sub_agent,
        ):

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
        from opencontractserver.conversations.models import ChatMessage, Conversation
        from opencontractserver.llms.agents.agent_factory import (
            UnifiedAgentFactory,
        )
        from opencontractserver.llms.types import AgentFramework

        # Capture the args that the tool receives
        captured_args = {}

        async def _spy_tool(ctx, **kwargs):
            captured_args.update(kwargs)
            return {"result": "success"}

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
            # resume_with_approval uses pydantic_ai_agent._function_tools
            # as fallback to find the tool callable.
            inst._function_tools = {
                "ask_document": types.SimpleNamespace(function=_spy_tool),
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

            # We need agent ref inside the tool closure, but agent is created
            # inside the patch context.  Use a mutable container.
            agent_ref = [None]

            async def _capture_bypass_tool(ctx, **kwargs):
                bypass_values_during_execution.append(
                    getattr(agent_ref[0].config, "_approval_bypass_allowed", "MISSING")
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
            agent_ref[0] = agent

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
        agent = await self._create_corpus_agent()
        ask_doc_fn = self._get_ask_doc(agent)

        sig = inspect.signature(ask_doc_fn)
        param_names = list(sig.parameters.keys())

        # The wrapper adds 'ctx' as first param; the rest should be
        # document_id and question only
        self.assertNotIn("skip_approval", param_names)
        self.assertIn("document_id", param_names)
        self.assertIn("question", param_names)

    # ------------------------------------------------------------------
    # Tests: approval_bypass_allowed controls sub-agent skip
    # ------------------------------------------------------------------

    async def test_bypass_flag_passes_to_sub_agent_factory(self):
        """When config._approval_bypass_allowed is True (during resume),
        the sub-agent should be created with skip_approval_gate=True."""
        # Use normal events so ask_document completes without raising
        normal_events = [
            _FakeContentEvent(content="Answer."),
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=normal_events)
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=_MockSubAgent(normal_events),
        ) as mock_for_doc:

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

            mock_for_doc.assert_called_once()
            call_kwargs = mock_for_doc.call_args
            self.assertTrue(
                call_kwargs.kwargs.get("skip_approval_gate", False),
                "Sub-agent should be created with skip_approval_gate=True "
                "when config._approval_bypass_allowed is True",
            )

    async def test_normal_call_does_not_bypass(self):
        """When config._approval_bypass_allowed is False (normal execution),
        the sub-agent should be created with skip_approval_gate=False."""
        normal_events = [
            _FakeContentEvent(content="Answer."),
            _FakeFinalEvent(content="Done.", sources=[], metadata={}),
        ]
        agent = await self._create_corpus_agent(sub_agent_events=normal_events)
        ask_doc_fn = self._get_ask_doc(agent)

        with patch(
            _AGENTS_API_FOR_DOC_PATCH,
            new_callable=AsyncMock,
            return_value=_MockSubAgent(normal_events),
        ) as mock_for_doc:

            class _Ctx:
                tool_call_id = "test-call"
                deps = types.SimpleNamespace(
                    skip_approval_gate=False,
                    user_id=self.user.id,
                    document_id=self.document.id,
                    corpus_id=self.corpus.id,
                )

            self.assertFalse(getattr(agent.config, "_approval_bypass_allowed", False))

            await ask_doc_fn(
                _Ctx(),
                document_id=self.document.id,
                question="Test",
            )

            mock_for_doc.assert_called_once()
            call_kwargs = mock_for_doc.call_args
            self.assertFalse(
                call_kwargs.kwargs.get("skip_approval_gate", True),
                "Sub-agent should be created with skip_approval_gate=False "
                "when config._approval_bypass_allowed is not set",
            )
