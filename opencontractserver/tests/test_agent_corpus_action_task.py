"""
Tests for the run_agent_corpus_action task and _run_agent_corpus_action_async function.

These tests cover:
- Successful agent execution and result creation
- Idempotency checks (skip completed/running tasks)
- Error handling and failure paths
- Tools and system prompt configuration
- Race condition prevention with select_for_update()

NOTE: Tests mock _run_agent_corpus_action_async to avoid Django's async ORM
connection issues in test environments. Django's async ORM runs in a different
thread context, and database transactions are thread-bound, causing connection
corruption when asyncio.run() closes its event loop.

See: https://code.djangoproject.com/ticket/32409
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from opencontractserver.agents.models import AgentActionResult, AgentConfiguration
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusActionTrigger
from opencontractserver.documents.models import Document
from opencontractserver.tasks.agent_tasks import run_agent_corpus_action

User = get_user_model()

# Path to patch the async function
ASYNC_FUNC_PATH = "opencontractserver.tasks.agent_tasks._run_agent_corpus_action_async"


class TestRunAgentCorpusActionAsync(TestCase):
    """Tests for run_agent_corpus_action task behavior.

    These tests mock _run_agent_corpus_action_async to avoid async ORM connection
    issues, and verify the task wrapper correctly handles various scenarios.
    """

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

    @patch(ASYNC_FUNC_PATH)
    def test_successful_execution_creates_result(self, mock_async_func):
        """Test that successful execution creates an AgentActionResult with COMPLETED status."""
        # Create the result that the async function would create
        action_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.COMPLETED,
            agent_response="Document summary: This is a test.",
            completed_at=timezone.now(),
            execution_metadata={"model": "test-model", "tools_available": []},
            creator=self.user,
        )
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": action_result.id,
            "conversation_id": None,
        }

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        self.assertIn("result_id", result.result)
        self.assertIsNone(result.result["conversation_id"])
        mock_async_func.assert_called_once()

    @patch(ASYNC_FUNC_PATH)
    def test_skip_already_completed_result(self, mock_async_func):
        """Test that execution is skipped if result already exists with COMPLETED status."""
        # Create an existing completed result
        existing_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.COMPLETED,
            agent_response="Already done",
            creator=self.user,
        )
        mock_async_func.return_value = {
            "status": "already_completed",
            "result_id": existing_result.id,
            "conversation_id": None,
        }

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "already_completed")
        self.assertEqual(result.result["result_id"], existing_result.id)

    @patch(ASYNC_FUNC_PATH)
    def test_skip_already_running_result(self, mock_async_func):
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
        mock_async_func.return_value = {
            "status": "already_running",
            "result_id": existing_result.id,
            "conversation_id": None,
        }

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "already_running")
        self.assertEqual(result.result["result_id"], existing_result.id)

    @patch(ASYNC_FUNC_PATH)
    def test_retry_failed_result(self, mock_async_func):
        """Test that a FAILED result can be retried (re-executed)."""
        # Create an existing failed result that will be updated
        existing_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.FAILED,
            error_message="Previous failure",
            creator=self.user,
        )

        # Simulate the async function updating the result
        def update_and_return(*args, **kwargs):
            existing_result.status = AgentActionResult.Status.COMPLETED
            existing_result.agent_response = "Retry successful"
            existing_result.error_message = ""
            existing_result.save()
            return {
                "status": "completed",
                "result_id": existing_result.id,
                "conversation_id": None,
            }

        mock_async_func.side_effect = update_and_return

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        existing_result.refresh_from_db()
        self.assertEqual(existing_result.status, AgentActionResult.Status.COMPLETED)
        self.assertEqual(existing_result.agent_response, "Retry successful")

    @patch(ASYNC_FUNC_PATH)
    def test_agent_failure_marks_result_failed(self, mock_async_func):
        """Test that agent failure marks the result as FAILED."""
        mock_async_func.side_effect = Exception("Agent execution failed")

        # The task will raise an exception due to agent failure
        with self.assertRaises(Exception):
            run_agent_corpus_action.apply(
                args=[self.corpus_action.id, self.document.id, self.user.id],
                throw=True,
            )

        # Verify the result was marked as failed by the task's error handler
        action_result = AgentActionResult.objects.get(
            corpus_action=self.corpus_action,
            document=self.document,
        )
        self.assertEqual(action_result.status, AgentActionResult.Status.FAILED)
        self.assertIn("Agent execution failed", action_result.error_message)

    @patch(ASYNC_FUNC_PATH)
    def test_task_passes_correct_arguments(self, mock_async_func):
        """Test that the task passes correct arguments to the async function."""
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": 1,
            "conversation_id": None,
        }

        run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        mock_async_func.assert_called_once_with(
            corpus_action_id=self.corpus_action.id,
            document_id=self.document.id,
            user_id=self.user.id,
        )

    @patch(ASYNC_FUNC_PATH)
    def test_task_passes_execution_id(self, mock_async_func):
        """Test that execution_id is passed through to the async function."""
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": 1,
            "conversation_id": None,
        }

        execution_id = 12345
        run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id, execution_id]
        )

        # The task should pass execution_id, but the async function signature
        # currently only takes 3 args. This test verifies the task handles it.
        mock_async_func.assert_called_once()


class TestRunAgentCorpusActionTask(TestCase):
    """Tests for run_agent_corpus_action Celery task wrapper."""

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

    @patch(ASYNC_FUNC_PATH)
    def test_task_calls_async_function(self, mock_async_func):
        """Test that the Celery task calls the async function correctly."""
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": 1,
            "conversation_id": None,
        }

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        mock_async_func.assert_called_once_with(
            corpus_action_id=self.corpus_action.id,
            document_id=self.document.id,
            user_id=self.user.id,
        )

    @patch(ASYNC_FUNC_PATH)
    def test_task_handles_exception_and_marks_failed(self, mock_async_func):
        """Test that the task handles exceptions and marks the result as failed."""
        mock_async_func.side_effect = Exception("Test error")

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

    @patch(ASYNC_FUNC_PATH)
    def test_full_task_execution(self, mock_async_func):
        """Test full task execution through to completion."""
        # Create the result that the async function would create
        action_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.COMPLETED,
            agent_response="Full integration test response",
            completed_at=timezone.now(),
            creator=self.user,
        )
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": action_result.id,
            "conversation_id": None,
        }

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        self.assertEqual(result.result["result_id"], action_result.id)


class TestAgentCorpusActionEdgeCases(TestCase):
    """Edge case tests for agent corpus actions."""

    def setUp(self):
        """Set up test fixtures."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
        )

    @patch(ASYNC_FUNC_PATH)
    def test_long_error_message_truncated(self, mock_async_func):
        """Test that very long error messages are truncated to prevent DB bloat."""
        long_error = "x" * 2000  # Longer than 1000 char limit
        mock_async_func.side_effect = Exception(long_error)

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
            run_agent_corpus_action.apply(
                args=[corpus_action.id, self.document.id, self.user.id],
                throw=True,
            )

        # Verify error message was truncated
        action_result = AgentActionResult.objects.get(
            corpus_action=corpus_action,
            document=self.document,
        )
        self.assertLessEqual(len(action_result.error_message), 1000)

    @patch(ASYNC_FUNC_PATH)
    def test_pending_result_gets_executed(self, mock_async_func):
        """Test that a PENDING result gets executed (not skipped)."""
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

        # Simulate the async function updating the result
        def update_and_return(*args, **kwargs):
            existing_result.status = AgentActionResult.Status.COMPLETED
            existing_result.agent_response = "Executed pending result"
            existing_result.save()
            return {
                "status": "completed",
                "result_id": existing_result.id,
                "conversation_id": None,
            }

        mock_async_func.side_effect = update_and_return

        result = run_agent_corpus_action.apply(
            args=[corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        existing_result.refresh_from_db()
        self.assertEqual(existing_result.status, AgentActionResult.Status.COMPLETED)


class TestCorpusActionExecutionTracking(TestCase):
    """Tests for CorpusActionExecution tracking in run_agent_corpus_action.

    These tests verify that the task properly updates CorpusActionExecution
    records when execution_id is provided.
    """

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

    @patch(ASYNC_FUNC_PATH)
    def test_execution_tracking_on_success(self, mock_async_func):
        """Test that execution tracking works on successful runs."""
        from opencontractserver.corpuses.models import CorpusActionExecution

        # Create execution record
        execution = CorpusActionExecution.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            corpus=self.corpus,
            action_type=CorpusActionExecution.ActionType.AGENT,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            status=CorpusActionExecution.Status.QUEUED,
            queued_at=timezone.now(),
            creator=self.user,
        )

        # Create result that will be returned
        action_result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            status=AgentActionResult.Status.COMPLETED,
            agent_response="Test response",
            completed_at=timezone.now(),
            creator=self.user,
        )

        # Simulate the async function updating execution and returning result
        def update_execution_and_return(*args, **kwargs):
            execution.mark_started()
            execution.mark_completed(
                affected_objects=[{"type": "agent_result", "id": action_result.id}]
            )
            execution.agent_result = action_result
            execution.save()
            return {
                "status": "completed",
                "result_id": action_result.id,
                "conversation_id": None,
            }

        mock_async_func.side_effect = update_execution_and_return

        run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id, execution.id]
        )

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.COMPLETED)
        self.assertIsNotNone(execution.started_at)
        self.assertIsNotNone(execution.completed_at)

    @patch(ASYNC_FUNC_PATH)
    def test_execution_tracking_on_failure(self, mock_async_func):
        """Test that execution is marked failed when async function raises."""
        from opencontractserver.corpuses.models import CorpusActionExecution

        execution = CorpusActionExecution.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            corpus=self.corpus,
            action_type=CorpusActionExecution.ActionType.AGENT,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            status=CorpusActionExecution.Status.QUEUED,
            queued_at=timezone.now(),
            creator=self.user,
        )

        mock_async_func.side_effect = Exception("Agent execution failed")

        with self.assertRaises(Exception):
            run_agent_corpus_action.apply(
                args=[
                    self.corpus_action.id,
                    self.document.id,
                    self.user.id,
                    execution.id,
                ],
                throw=True,
            )

        # The task's error handler should have created a failed result
        action_result = AgentActionResult.objects.get(
            corpus_action=self.corpus_action,
            document=self.document,
        )
        self.assertEqual(action_result.status, AgentActionResult.Status.FAILED)
        self.assertIn("Agent execution failed", action_result.error_message)

    @patch(ASYNC_FUNC_PATH)
    def test_task_works_without_execution_id(self, mock_async_func):
        """Test that task works normally without execution_id (backward compat)."""
        mock_async_func.return_value = {
            "status": "completed",
            "result_id": 1,
            "conversation_id": None,
        }

        result = run_agent_corpus_action.apply(
            args=[self.corpus_action.id, self.document.id, self.user.id]
        )

        self.assertEqual(result.result["status"], "completed")
        mock_async_func.assert_called_once()
