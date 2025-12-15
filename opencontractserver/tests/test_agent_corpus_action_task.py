"""
Tests for the run_agent_corpus_action task and _run_agent_corpus_action_async function.

These tests cover:
- Successful agent execution and result creation
- Idempotency checks (skip completed/running tasks)
- Error handling and failure paths
- Tools and system prompt configuration
- Race condition prevention with select_for_update()
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from django.utils import timezone

from opencontractserver.agents.models import AgentActionResult, AgentConfiguration
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusActionTrigger
from opencontractserver.documents.models import Document
from opencontractserver.tasks.agent_tasks import (
    _run_agent_corpus_action_async,
    run_agent_corpus_action,
)

User = get_user_model()

# Path to patch the agents module where it's imported
AGENTS_MODULE_PATH = "opencontractserver.llms.agents"


class MockAgentResponse:
    """Mock response from agent.chat()"""

    def __init__(self, content="Test response", sources=None):
        self.content = content
        self.sources = sources or []


class MockAgent:
    """Mock agent for testing"""

    def __init__(
        self, response_content="Test response", should_fail=False, conversation_id=None
    ):
        self.response_content = response_content
        self.should_fail = should_fail
        self._conversation_id = conversation_id

    async def chat(self, prompt):
        if self.should_fail:
            raise Exception("Agent execution failed")
        return MockAgentResponse(content=self.response_content)

    def get_conversation_id(self):
        return self._conversation_id


@pytest.mark.django_db
class TestRunAgentCorpusActionAsync(TransactionTestCase):
    """Tests for _run_agent_corpus_action_async function."""

    def setUp(self):
        """Set up test fixtures."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document",
            description="Test description",
            creator=self.user,
        )
        self.agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            description="Test agent configuration",
            system_instructions="You are a helpful assistant",
            available_tools=["search_annotations", "load_document_text"],
            is_active=True,
            creator=self.user,
        )
        self.corpus_action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Summarize this document",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

    @patch(AGENTS_MODULE_PATH)
    def test_successful_execution_creates_result(self, mock_agents_module):
        """Test that successful execution creates an AgentActionResult with COMPLETED status."""
        mock_agent = MockAgent(response_content="Document summary: This is a test.")
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        self.assertEqual(result["status"], "completed")
        self.assertIn("result_id", result)
        self.assertIsNone(result["conversation_id"])

        # Verify the result was saved correctly
        action_result = AgentActionResult.objects.get(id=result["result_id"])
        self.assertEqual(action_result.status, AgentActionResult.Status.COMPLETED)
        self.assertEqual(
            action_result.agent_response, "Document summary: This is a test."
        )
        self.assertIsNotNone(action_result.completed_at)
        self.assertIsNotNone(action_result.execution_metadata)

    @patch(AGENTS_MODULE_PATH)
    def test_skip_already_completed_result(self, mock_agents_module):
        """Test that execution is skipped if result already exists with COMPLETED status."""
        # Create an existing completed result
        existing_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.COMPLETED,
            agent_response="Already done",
            creator=self.user,
        )

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        self.assertEqual(result["status"], "already_completed")
        self.assertEqual(result["result_id"], existing_result.id)

        # Agent should NOT have been called
        mock_agents_module.for_document.assert_not_called()

    @patch(AGENTS_MODULE_PATH)
    def test_skip_already_running_result(self, mock_agents_module):
        """Test that execution is skipped if result already exists with RUNNING status.

        This is the key race condition prevention test.
        """
        # Create an existing running result (simulating another task in progress)
        existing_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.RUNNING,
            started_at=timezone.now(),
            creator=self.user,
        )

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        self.assertEqual(result["status"], "already_running")
        self.assertEqual(result["result_id"], existing_result.id)

        # Agent should NOT have been called
        mock_agents_module.for_document.assert_not_called()

    @patch(AGENTS_MODULE_PATH)
    def test_retry_failed_result(self, mock_agents_module):
        """Test that a FAILED result can be retried (re-executed)."""
        # Create an existing failed result
        existing_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.FAILED,
            error_message="Previous failure",
            creator=self.user,
        )

        mock_agent = MockAgent(response_content="Retry successful")
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        self.assertEqual(result["status"], "completed")

        # Verify the result was updated
        existing_result.refresh_from_db()
        self.assertEqual(existing_result.status, AgentActionResult.Status.COMPLETED)
        self.assertEqual(existing_result.agent_response, "Retry successful")
        self.assertEqual(existing_result.error_message, "")

    @patch(AGENTS_MODULE_PATH)
    def test_agent_failure_marks_result_failed(self, mock_agents_module):
        """Test that agent failure marks the result as FAILED."""
        mock_agent = MockAgent(should_fail=True)
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        with self.assertRaises(Exception) as context:
            asyncio.run(
                _run_agent_corpus_action_async(
                    corpus_action_id=self.corpus_action.id,
                    document_id=self.document.id,
                    user_id=self.user.id,
                )
            )

        self.assertIn("Agent execution failed", str(context.exception))

        # Verify the result was marked as failed
        action_result = AgentActionResult.objects.get(
            corpus_action=self.corpus_action,
            document=self.document,
        )
        self.assertEqual(action_result.status, AgentActionResult.Status.FAILED)
        self.assertIn("Agent execution failed", action_result.error_message)
        self.assertIsNotNone(action_result.completed_at)

    @patch(AGENTS_MODULE_PATH)
    def test_tools_from_pre_authorized_tools(self, mock_agents_module):
        """Test that pre_authorized_tools from CorpusAction takes precedence."""
        self.corpus_action.pre_authorized_tools = ["custom_tool_1", "custom_tool_2"]
        self.corpus_action.save()

        mock_agent = MockAgent()
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        # Verify for_document was called with custom tools
        call_kwargs = mock_agents_module.for_document.call_args.kwargs
        self.assertEqual(call_kwargs["tools"], ["custom_tool_1", "custom_tool_2"])

    @patch(AGENTS_MODULE_PATH)
    def test_tools_fallback_to_agent_config(self, mock_agents_module):
        """Test that tools fall back to agent_config.available_tools if pre_authorized_tools is empty."""
        self.corpus_action.pre_authorized_tools = []
        self.corpus_action.save()

        mock_agent = MockAgent()
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        # Verify for_document was called with agent_config tools
        call_kwargs = mock_agents_module.for_document.call_args.kwargs
        self.assertEqual(
            call_kwargs["tools"], ["search_annotations", "load_document_text"]
        )

    @patch(AGENTS_MODULE_PATH)
    def test_system_prompt_from_agent_config(self, mock_agents_module):
        """Test that system_prompt is passed from agent_config."""
        mock_agent = MockAgent()
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        call_kwargs = mock_agents_module.for_document.call_args.kwargs
        self.assertEqual(call_kwargs["system_prompt"], "You are a helpful assistant")
        self.assertTrue(call_kwargs["skip_approval_gate"])

    @patch(AGENTS_MODULE_PATH)
    def test_execution_metadata_saved(self, mock_agents_module):
        """Test that execution metadata is properly saved."""
        mock_agent = MockAgent()
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=self.corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        action_result = AgentActionResult.objects.get(id=result["result_id"])
        metadata = action_result.execution_metadata

        self.assertIn("model", metadata)
        self.assertIn("tools_available", metadata)
        self.assertEqual(metadata["agent_config_id"], self.agent_config.id)
        self.assertEqual(metadata["agent_config_name"], "Test Agent")


@pytest.mark.django_db
class TestRunAgentCorpusActionTask(TransactionTestCase):
    """Tests for run_agent_corpus_action Celery task."""

    def setUp(self):
        """Set up test fixtures."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
        )
        self.agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            system_instructions="Test instructions",
            is_active=True,
            creator=self.user,
        )
        self.corpus_action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Test prompt",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

    @patch("opencontractserver.tasks.agent_tasks._run_agent_corpus_action_async")
    def test_task_calls_async_function(self, mock_async_func):
        """Test that the Celery task calls the async function correctly."""
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": 1,
        }

        # Use .apply() to run synchronously in tests
        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        mock_async_func.assert_called_once_with(
            corpus_action_id=self.corpus_action.id,
            document_id=self.document.id,
            user_id=self.user.id,
        )

    @patch("opencontractserver.tasks.agent_tasks._run_agent_corpus_action_async")
    def test_task_handles_exception_and_marks_failed(self, mock_async_func):
        """Test that the task handles exceptions and marks the result as failed."""
        mock_async_func.side_effect = Exception("Test error")

        # The task should retry, which raises Retry exception
        with self.assertRaises(Exception):
            run_agent_corpus_action.apply(
                args=[self.corpus_action.id, self.document.id, self.user.id],
                throw=True,
            )

        # Verify a failed result was created
        action_result = AgentActionResult.objects.get(
            corpus_action=self.corpus_action,
            document=self.document,
        )
        self.assertEqual(action_result.status, AgentActionResult.Status.FAILED)
        self.assertIn("Test error", action_result.error_message)

    @patch(AGENTS_MODULE_PATH)
    def test_full_integration_success(self, mock_agents_module):
        """Integration test: full task execution through to completion."""
        mock_agent = MockAgent(response_content="Full integration test response")
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")

        # Verify the result in the database
        action_result = AgentActionResult.objects.get(id=result.result["result_id"])
        self.assertEqual(action_result.status, AgentActionResult.Status.COMPLETED)
        self.assertEqual(action_result.agent_response, "Full integration test response")
        self.assertEqual(action_result.document, self.document)
        self.assertEqual(action_result.corpus_action, self.corpus_action)


@pytest.mark.django_db
class TestAgentCorpusActionEdgeCases(TransactionTestCase):
    """Edge case tests for agent corpus actions."""

    def setUp(self):
        """Set up test fixtures."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
        )

    @patch(AGENTS_MODULE_PATH)
    def test_action_without_agent_config_tools(self, mock_agents_module):
        """Test action without agent_config still works (empty tools)."""
        # Create action with agent_config that has no tools
        agent_config = AgentConfiguration.objects.create(
            name="Empty Tools Agent",
            system_instructions="",
            available_tools=[],
            is_active=True,
            creator=self.user,
        )
        corpus_action = CorpusAction.objects.create(
            name="No Tools Action",
            corpus=self.corpus,
            agent_config=agent_config,
            agent_prompt="Test prompt",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        mock_agent = MockAgent()
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        self.assertEqual(result["status"], "completed")
        call_kwargs = mock_agents_module.for_document.call_args.kwargs
        self.assertEqual(call_kwargs["tools"], [])

    @patch(AGENTS_MODULE_PATH)
    def test_long_error_message_truncated(self, mock_agents_module):
        """Test that very long error messages are truncated to prevent DB bloat."""
        # Create an agent that fails with a very long error
        long_error = "x" * 2000  # Longer than 1000 char limit

        async def failing_for_document(*args, **kwargs):
            mock = MagicMock()
            mock.chat = AsyncMock(side_effect=Exception(long_error))
            mock.get_conversation_id = MagicMock(return_value=1)
            return mock

        mock_agents_module.for_document = failing_for_document

        agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            system_instructions="Test",
            is_active=True,
            creator=self.user,
        )
        corpus_action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            agent_config=agent_config,
            agent_prompt="Test prompt",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        with self.assertRaises(Exception):
            asyncio.run(
                _run_agent_corpus_action_async(
                    corpus_action_id=corpus_action.id,
                    document_id=self.document.id,
                    user_id=self.user.id,
                )
            )

        # Verify error message was truncated
        action_result = AgentActionResult.objects.get(
            corpus_action=corpus_action,
            document=self.document,
        )
        self.assertLessEqual(len(action_result.error_message), 1000)

    @patch(AGENTS_MODULE_PATH)
    def test_pending_result_gets_executed(self, mock_agents_module):
        """Test that a PENDING result gets executed (not skipped)."""
        # First create the corpus_action (required for foreign key)
        agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            system_instructions="Test",
            is_active=True,
            creator=self.user,
        )
        corpus_action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            agent_config=agent_config,
            agent_prompt="Test prompt",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        # Create an existing pending result
        existing_result = AgentActionResult.objects.create(
            corpus_action=corpus_action,
            document=self.document,
            status=AgentActionResult.Status.PENDING,
            creator=self.user,
        )

        mock_agent = MockAgent(response_content="Executed pending result")
        mock_agents_module.for_document = AsyncMock(return_value=mock_agent)

        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=corpus_action.id,
                document_id=self.document.id,
                user_id=self.user.id,
            )
        )

        self.assertEqual(result["status"], "completed")

        # Verify the result was updated
        existing_result.refresh_from_db()
        self.assertEqual(existing_result.status, AgentActionResult.Status.COMPLETED)
        self.assertEqual(existing_result.agent_response, "Executed pending result")
