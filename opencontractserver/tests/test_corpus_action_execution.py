"""
Tests for CorpusActionExecution model, QuerySet, and Manager.

Tests cover:
- Model lifecycle methods (mark_started, mark_completed, mark_failed, mark_skipped)
- Bulk operations (bulk_queue)
- QuerySet methods (for_corpus, for_document, by_type, pending, failed, recent, etc.)
- Computed properties (duration_seconds, wait_time_seconds)
- Permission filtering (visible_to_user)
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from opencontractserver.agents.models import AgentConfiguration
from opencontractserver.analyzer.models import Analyzer
from opencontractserver.corpuses.models import (
    Corpus,
    CorpusAction,
    CorpusActionExecution,
    CorpusActionTrigger,
)
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Fieldset

User = get_user_model()


class CorpusActionExecutionModelTestCase(TestCase):
    """Test model lifecycle methods."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        self.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
        )

    def create_execution(self, **kwargs):
        """Helper to create execution with defaults."""
        defaults = {
            "corpus_action": self.action,
            "document": self.document,
            "corpus": self.corpus,
            "action_type": CorpusActionExecution.ActionType.FIELDSET,
            "trigger": CorpusActionTrigger.ADD_DOCUMENT,
            "queued_at": timezone.now(),
            "creator": self.user,
        }
        defaults.update(kwargs)
        return CorpusActionExecution.objects.create(**defaults)

    # --- mark_started() ---

    def test_mark_started_sets_status_and_timestamp(self):
        """mark_started() transitions to RUNNING with timestamp."""
        execution = self.create_execution()
        self.assertEqual(execution.status, CorpusActionExecution.Status.QUEUED)
        self.assertIsNone(execution.started_at)

        execution.mark_started()

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.RUNNING)
        self.assertIsNotNone(execution.started_at)

    def test_mark_started_with_save_false(self):
        """mark_started(save=False) updates instance without DB write."""
        execution = self.create_execution()

        execution.mark_started(save=False)

        self.assertEqual(execution.status, CorpusActionExecution.Status.RUNNING)
        # Verify NOT saved to DB
        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.QUEUED)

    # --- mark_completed() ---

    def test_mark_completed_sets_status_and_timestamp(self):
        """mark_completed() transitions to COMPLETED with timestamp."""
        execution = self.create_execution()
        execution.mark_started()

        execution.mark_completed()

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.COMPLETED)
        self.assertIsNotNone(execution.completed_at)

    def test_mark_completed_with_affected_objects(self):
        """mark_completed() stores affected objects list."""
        execution = self.create_execution()
        execution.mark_started()

        affected = [
            {"type": "extract", "id": 1},
            {"type": "datacell", "id": 2, "column_name": "parties"},
        ]
        execution.mark_completed(affected_objects=affected)

        execution.refresh_from_db()
        self.assertEqual(len(execution.affected_objects), 2)
        self.assertEqual(execution.affected_objects[0]["type"], "extract")
        self.assertEqual(execution.affected_objects[1]["column_name"], "parties")

    def test_mark_completed_with_metadata(self):
        """mark_completed() merges execution metadata."""
        execution = self.create_execution()
        execution.execution_metadata = {"existing": "value"}
        execution.save()
        execution.mark_started()

        execution.mark_completed(metadata={"model": "gpt-4", "tokens": 1500})

        execution.refresh_from_db()
        self.assertEqual(execution.execution_metadata["existing"], "value")
        self.assertEqual(execution.execution_metadata["model"], "gpt-4")
        self.assertEqual(execution.execution_metadata["tokens"], 1500)

    # --- mark_failed() ---

    def test_mark_failed_sets_status_and_error(self):
        """mark_failed() transitions to FAILED with error details."""
        execution = self.create_execution()
        execution.mark_started()

        execution.mark_failed("Connection timeout", "Traceback: ...")

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.FAILED)
        self.assertIsNotNone(execution.completed_at)
        self.assertEqual(execution.error_message, "Connection timeout")
        self.assertEqual(execution.error_traceback, "Traceback: ...")

    def test_mark_failed_truncates_long_error_message(self):
        """mark_failed() truncates error_message to 5000 chars."""
        execution = self.create_execution()
        execution.mark_started()

        long_error = "x" * 10000
        execution.mark_failed(long_error)

        execution.refresh_from_db()
        self.assertEqual(len(execution.error_message), 5000)

    def test_mark_failed_truncates_long_traceback(self):
        """mark_failed() truncates error_traceback to 10000 chars."""
        execution = self.create_execution()
        execution.mark_started()

        long_traceback = "y" * 20000
        execution.mark_failed("Error", long_traceback)

        execution.refresh_from_db()
        self.assertEqual(len(execution.error_traceback), 10000)

    # --- mark_skipped() ---

    def test_mark_skipped_sets_status(self):
        """mark_skipped() transitions to SKIPPED."""
        execution = self.create_execution()

        execution.mark_skipped()

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.SKIPPED)
        self.assertIsNotNone(execution.completed_at)

    def test_mark_skipped_stores_reason_in_metadata(self):
        """mark_skipped() stores skip reason in execution_metadata."""
        execution = self.create_execution()

        execution.mark_skipped(reason="Already processed in previous run")

        execution.refresh_from_db()
        self.assertEqual(
            execution.execution_metadata["skip_reason"],
            "Already processed in previous run",
        )

    # --- add_affected_object() ---

    def test_add_affected_object_appends_to_list(self):
        """add_affected_object() appends to affected_objects list."""
        execution = self.create_execution()
        execution.affected_objects = []

        execution.add_affected_object("extract", 1)
        execution.add_affected_object("datacell", 2, column_name="parties")

        self.assertEqual(len(execution.affected_objects), 2)
        self.assertEqual(execution.affected_objects[0], {"type": "extract", "id": 1})
        self.assertEqual(
            execution.affected_objects[1],
            {"type": "datacell", "id": 2, "column_name": "parties"},
        )

    def test_add_affected_object_handles_none_list(self):
        """add_affected_object() initializes list if None."""
        execution = self.create_execution()
        execution.affected_objects = None

        execution.add_affected_object("annotation", 5)

        self.assertEqual(execution.affected_objects, [{"type": "annotation", "id": 5}])


class CorpusActionExecutionBulkOpsTestCase(TestCase):
    """Test bulk_queue and bulk update operations."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        self.analyzer = Analyzer.objects.create(
            description="Test Analyzer", creator=self.user, task_name="not.a.real.task"
        )
        self.agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            description="Test agent",
            system_instructions="You are helpful",
            is_active=True,
            creator=self.user,
        )
        self.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        self.documents = [
            Document.objects.create(title=f"Doc {i}", creator=self.user)
            for i in range(5)
        ]

    def test_bulk_queue_creates_records(self):
        """bulk_queue() creates execution records efficiently."""
        doc_ids = [d.id for d in self.documents]

        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=doc_ids,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(len(executions), 5)
        self.assertTrue(
            all(e.status == CorpusActionExecution.Status.QUEUED for e in executions)
        )

    def test_bulk_queue_sets_correct_action_type_fieldset(self):
        """bulk_queue() detects fieldset action type."""
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(
            executions[0].action_type, CorpusActionExecution.ActionType.FIELDSET
        )

    def test_bulk_queue_sets_correct_action_type_analyzer(self):
        """bulk_queue() detects analyzer action type."""
        analyzer_action = CorpusAction.objects.create(
            name="Analyzer Action",
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        executions = CorpusActionExecution.bulk_queue(
            corpus_action=analyzer_action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(
            executions[0].action_type, CorpusActionExecution.ActionType.ANALYZER
        )

    def test_bulk_queue_sets_correct_action_type_agent(self):
        """bulk_queue() detects agent action type."""
        agent_action = CorpusAction.objects.create(
            name="Agent Action",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Summarize this document",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        executions = CorpusActionExecution.bulk_queue(
            corpus_action=agent_action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(
            executions[0].action_type, CorpusActionExecution.ActionType.AGENT
        )

    def test_bulk_queue_sets_denormalized_corpus_id(self):
        """bulk_queue() sets denormalized corpus_id for fast queries."""
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(executions[0].corpus_id, self.corpus.id)

    def test_bulk_queue_sets_creator(self):
        """bulk_queue() sets creator_id from user_id param."""
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(executions[0].creator_id, self.user.id)


class CorpusActionExecutionQuerySetTestCase(TestCase):
    """Test custom QuerySet methods."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus1 = Corpus.objects.create(title="Corpus 1", creator=self.user)
        self.corpus2 = Corpus.objects.create(title="Corpus 2", creator=self.user)
        self.document = Document.objects.create(title="Test Doc", creator=self.user)
        self.fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        self.action1 = CorpusAction.objects.create(
            name="Action 1",
            corpus=self.corpus1,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

    def create_execution(self, corpus, status="queued", action_type=None, **kwargs):
        """Helper to create execution with specified status."""
        action = (
            CorpusAction.objects.filter(corpus=corpus).first()
            if CorpusAction.objects.filter(corpus=corpus).exists()
            else self.action1
        )
        if action_type is None:
            action_type = CorpusActionExecution.ActionType.FIELDSET
        exec_obj = CorpusActionExecution.objects.create(
            corpus_action=action,
            document=self.document,
            corpus=corpus,
            action_type=action_type,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
            **kwargs,
        )
        if status != "queued":
            exec_obj.status = status
            exec_obj.save()
        return exec_obj

    # --- for_corpus() ---

    def test_for_corpus_filters_by_corpus_id(self):
        """for_corpus() returns only executions for that corpus."""
        exec1 = self.create_execution(self.corpus1)
        exec2 = self.create_execution(self.corpus2)

        result = list(CorpusActionExecution.objects.for_corpus(self.corpus1.id))

        self.assertIn(exec1, result)
        self.assertNotIn(exec2, result)

    # --- for_document() ---

    def test_for_document_filters_by_document_id(self):
        """for_document() returns executions for that document."""
        doc2 = Document.objects.create(title="Doc 2", creator=self.user)
        exec1 = self.create_execution(self.corpus1)
        exec2 = CorpusActionExecution.objects.create(
            corpus_action=self.action1,
            document=doc2,
            corpus=self.corpus1,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
        )

        result = list(CorpusActionExecution.objects.for_document(self.document.id))

        self.assertIn(exec1, result)
        self.assertNotIn(exec2, result)

    # --- by_type() ---

    def test_by_type_filters_by_action_type(self):
        """by_type() filters by action type."""
        exec_fieldset = self.create_execution(self.corpus1)
        exec_agent = self.create_execution(
            self.corpus1, action_type=CorpusActionExecution.ActionType.AGENT
        )

        result = list(
            CorpusActionExecution.objects.by_type(
                CorpusActionExecution.ActionType.FIELDSET
            )
        )

        self.assertIn(exec_fieldset, result)
        self.assertNotIn(exec_agent, result)

    # --- pending() ---

    def test_pending_returns_queued_and_running(self):
        """pending() returns QUEUED and RUNNING executions."""
        exec_queued = self.create_execution(self.corpus1, status="queued")
        exec_running = self.create_execution(self.corpus1, status="running")
        exec_completed = self.create_execution(self.corpus1, status="completed")
        exec_failed = self.create_execution(self.corpus1, status="failed")

        result = list(CorpusActionExecution.objects.pending())

        self.assertIn(exec_queued, result)
        self.assertIn(exec_running, result)
        self.assertNotIn(exec_completed, result)
        self.assertNotIn(exec_failed, result)

    # --- failed() ---

    def test_failed_returns_only_failed(self):
        """failed() returns only FAILED executions."""
        exec_failed = self.create_execution(self.corpus1, status="failed")
        exec_completed = self.create_execution(self.corpus1, status="completed")

        result = list(CorpusActionExecution.objects.failed())

        self.assertIn(exec_failed, result)
        self.assertNotIn(exec_completed, result)

    # --- recent() ---

    def test_recent_filters_by_time_window(self):
        """recent() returns executions within time window."""
        now = timezone.now()
        recent_exec = self.create_execution(self.corpus1)

        # Create old execution
        old_exec = self.create_execution(self.corpus1)
        old_exec.queued_at = now - timedelta(hours=48)
        old_exec.save()

        result = list(CorpusActionExecution.objects.recent(hours=24))

        self.assertIn(recent_exec, result)
        self.assertNotIn(old_exec, result)

    # --- with_stats() ---

    def test_with_stats_annotates_duration(self):
        """with_stats() adds duration annotation."""
        exec_obj = self.create_execution(self.corpus1)
        exec_obj.started_at = timezone.now()
        exec_obj.completed_at = exec_obj.started_at + timedelta(seconds=30)
        exec_obj.save()

        result = (
            CorpusActionExecution.objects.filter(id=exec_obj.id).with_stats().first()
        )

        self.assertIsNotNone(result.duration)
        self.assertEqual(result.duration.total_seconds(), 30)

    def test_with_stats_annotates_wait_time(self):
        """with_stats() adds wait_time annotation."""
        exec_obj = self.create_execution(self.corpus1)
        exec_obj.started_at = exec_obj.queued_at + timedelta(seconds=5)
        exec_obj.save()

        result = (
            CorpusActionExecution.objects.filter(id=exec_obj.id).with_stats().first()
        )

        self.assertIsNotNone(result.wait_time)
        self.assertEqual(result.wait_time.total_seconds(), 5)

    # --- summary_by_status() ---

    def test_summary_by_status_returns_counts(self):
        """summary_by_status() returns status counts dict."""
        self.create_execution(self.corpus1, status="queued")
        self.create_execution(self.corpus1, status="queued")
        self.create_execution(self.corpus1, status="completed")
        self.create_execution(self.corpus1, status="failed")

        result = CorpusActionExecution.objects.for_corpus(
            self.corpus1.id
        ).summary_by_status()

        self.assertEqual(result["queued"], 2)
        self.assertEqual(result["completed"], 1)
        self.assertEqual(result["failed"], 1)

    # --- Chaining ---

    def test_queryset_methods_chain(self):
        """QuerySet methods can be chained together."""
        self.create_execution(self.corpus1, status="failed")

        result = (
            CorpusActionExecution.objects.for_corpus(self.corpus1.id)
            .failed()
            .recent(hours=24)
        )

        self.assertEqual(result.count(), 1)


class CorpusActionExecutionPropertiesTestCase(TestCase):
    """Test computed property methods."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(title="Test Doc", creator=self.user)
        self.fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        self.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

    def create_execution(self):
        return CorpusActionExecution.objects.create(
            corpus_action=self.action,
            document=self.document,
            corpus=self.corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
        )

    def test_duration_seconds_when_completed(self):
        """duration_seconds returns seconds between started and completed."""
        exec_obj = self.create_execution()
        exec_obj.started_at = timezone.now()
        exec_obj.completed_at = exec_obj.started_at + timedelta(
            seconds=45, milliseconds=500
        )

        self.assertAlmostEqual(exec_obj.duration_seconds, 45.5, places=1)

    def test_duration_seconds_when_not_completed(self):
        """duration_seconds returns None if not completed."""
        exec_obj = self.create_execution()
        exec_obj.started_at = timezone.now()

        self.assertIsNone(exec_obj.duration_seconds)

    def test_duration_seconds_when_not_started(self):
        """duration_seconds returns None if not started."""
        exec_obj = self.create_execution()

        self.assertIsNone(exec_obj.duration_seconds)

    def test_wait_time_seconds_when_started(self):
        """wait_time_seconds returns seconds in queue."""
        exec_obj = self.create_execution()
        exec_obj.started_at = exec_obj.queued_at + timedelta(seconds=10)

        self.assertAlmostEqual(exec_obj.wait_time_seconds, 10, places=1)

    def test_wait_time_seconds_when_not_started(self):
        """wait_time_seconds returns None if not started."""
        exec_obj = self.create_execution()

        self.assertIsNone(exec_obj.wait_time_seconds)

    def test_str_representation(self):
        """__str__ returns readable format."""
        exec_obj = self.create_execution()

        result = str(exec_obj)

        self.assertIn("fieldset", result)
        self.assertIn(self.action.name, result)
        self.assertIn("queued", result)


class CorpusActionExecutionPermissionsTestCase(TestCase):
    """Test visible_to_user() permission filtering."""

    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="testpass")
        self.other_user = User.objects.create_user(
            username="other", password="testpass"
        )
        self.superuser = User.objects.create_superuser(
            username="admin", password="testpass"
        )

        # Owner's private corpus and execution
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )
        self.fieldset = Fieldset.objects.create(
            name="Test Fieldset", creator=self.owner
        )
        self.private_action = CorpusAction.objects.create(
            name="Private Action",
            corpus=self.private_corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.owner,
        )
        self.document = Document.objects.create(title="Test Doc", creator=self.owner)
        self.private_exec = CorpusActionExecution.objects.create(
            corpus_action=self.private_action,
            document=self.document,
            corpus=self.private_corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.owner,
        )

        # Public corpus and execution
        self.public_corpus = Corpus.objects.create(
            title="Public Corpus", creator=self.owner, is_public=True
        )
        self.public_action = CorpusAction.objects.create(
            name="Public Action",
            corpus=self.public_corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.owner,
        )
        self.public_exec = CorpusActionExecution.objects.create(
            corpus_action=self.public_action,
            document=self.document,
            corpus=self.public_corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.owner,
            is_public=True,
        )

    def test_superuser_sees_all(self):
        """Superuser can see all executions."""
        result = CorpusActionExecution.objects.visible_to_user(self.superuser)

        self.assertIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_owner_sees_own_private(self):
        """Owner can see their own private executions."""
        result = CorpusActionExecution.objects.visible_to_user(self.owner)

        self.assertIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_other_user_sees_only_public(self):
        """Other users can only see public executions."""
        result = list(CorpusActionExecution.objects.visible_to_user(self.other_user))

        # Other user cannot see private exec (they didn't create it)
        self.assertNotIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_anonymous_sees_only_public(self):
        """Anonymous users can only see public executions."""
        result = list(CorpusActionExecution.objects.visible_to_user(None))

        self.assertNotIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_visible_to_user_chains_with_queryset_methods(self):
        """visible_to_user() returns custom QuerySet for chaining."""
        result = (
            CorpusActionExecution.objects.visible_to_user(self.owner)
            .for_corpus(self.private_corpus.id)
            .pending()
        )

        # Should return CorpusActionExecutionQuerySet with custom methods
        self.assertTrue(hasattr(result, "for_corpus"))
        self.assertTrue(hasattr(result, "pending"))
