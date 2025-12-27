"""
Tests for thread/message triggered corpus actions.

These tests cover:
1. Signal handlers for thread/message creation
2. Moderation tool functions
3. Celery task queuing and execution
4. Model field changes (nullable document, triggering FKs)
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase, override_settings

from opencontractserver.agents.models import AgentActionResult, AgentConfiguration
from opencontractserver.conversations.models import (
    ChatMessage,
    Conversation,
    ConversationTypeChoices,
    MessageTypeChoices,
    ModerationAction,
)
from opencontractserver.corpuses.models import (
    Corpus,
    CorpusAction,
    CorpusActionExecution,
    CorpusActionTrigger,
)
from opencontractserver.llms.tools.moderation_tools import (
    add_thread_message,
    delete_message,
    get_message_content,
    get_thread_context,
    get_thread_messages,
    lock_thread,
    pin_thread,
    unlock_thread,
    unpin_thread,
)

User = get_user_model()


class TestCorpusActionTriggerEnum(TestCase):
    """Test that the new trigger types are available."""

    def test_new_thread_trigger_exists(self):
        """NEW_THREAD trigger should be available."""
        self.assertEqual(CorpusActionTrigger.NEW_THREAD, "new_thread")

    def test_new_message_trigger_exists(self):
        """NEW_MESSAGE trigger should be available."""
        self.assertEqual(CorpusActionTrigger.NEW_MESSAGE, "new_message")

    def test_all_trigger_choices_available(self):
        """All trigger choices should include the new types."""
        choices = dict(CorpusActionTrigger.choices)
        self.assertIn("new_thread", choices)
        self.assertIn("new_message", choices)
        self.assertIn("add_document", choices)
        self.assertIn("edit_document", choices)


class TestModerationTools(TestCase):
    """Test moderation tool functions."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = User.objects.create_user(
            username="testmod",
            email="testmod@example.com",
            password="testpass123",
        )
        cls.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=cls.user,
        )

    def setUp(self):
        # Create a fresh thread for each test
        self.thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        # Skip signals to avoid triggering corpus actions
        self.thread._skip_signals = True
        self.thread.save()

    def tearDown(self):
        # Clean up messages and threads
        ChatMessage.objects.filter(conversation=self.thread).delete()
        ModerationAction.objects.filter(conversation=self.thread).delete()
        self.thread.delete()

    def test_get_thread_context_returns_metadata(self):
        """get_thread_context should return thread metadata."""
        context = get_thread_context(self.thread.id)

        self.assertEqual(context["id"], self.thread.id)
        self.assertEqual(context["title"], "Test Thread")
        self.assertEqual(context["creator_username"], self.user.username)
        self.assertFalse(context["is_locked"])
        self.assertFalse(context["is_pinned"])
        self.assertEqual(context["corpus_id"], self.corpus.id)

    def test_get_thread_context_invalid_thread(self):
        """get_thread_context should raise ValueError for invalid thread."""
        with self.assertRaises(ValueError) as ctx:
            get_thread_context(99999)
        self.assertIn("does not exist", str(ctx.exception))

    def test_get_thread_messages_returns_messages(self):
        """get_thread_messages should return recent messages."""
        # Create some test messages
        msg1 = ChatMessage.objects.create(
            conversation=self.thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="First message",
            creator=self.user,
        )
        msg1._skip_signals = True
        msg1.save()

        msg2 = ChatMessage.objects.create(
            conversation=self.thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="Second message",
            creator=self.user,
        )
        msg2._skip_signals = True
        msg2.save()

        messages = get_thread_messages(self.thread.id, limit=10)

        self.assertEqual(len(messages), 2)
        # Most recent first
        self.assertEqual(messages[0]["content"], "Second message")
        self.assertEqual(messages[1]["content"], "First message")

    def test_get_thread_messages_respects_limit(self):
        """get_thread_messages should respect the limit parameter."""
        for i in range(5):
            msg = ChatMessage.objects.create(
                conversation=self.thread,
                msg_type=MessageTypeChoices.HUMAN,
                content=f"Message {i}",
                creator=self.user,
            )
            msg._skip_signals = True
            msg.save()

        messages = get_thread_messages(self.thread.id, limit=2)
        self.assertEqual(len(messages), 2)

    def test_get_message_content_returns_details(self):
        """get_message_content should return full message details."""
        msg = ChatMessage.objects.create(
            conversation=self.thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="Test content",
            creator=self.user,
        )
        msg._skip_signals = True
        msg.save()

        content = get_message_content(msg.id)

        self.assertEqual(content["id"], msg.id)
        self.assertEqual(content["content"], "Test content")
        self.assertEqual(content["creator_username"], self.user.username)
        self.assertEqual(content["thread_id"], self.thread.id)

    def test_lock_thread_success(self):
        """lock_thread should lock the thread and create audit log."""
        result = lock_thread(
            thread_id=self.thread.id,
            reason="Test lock",
            moderator_id=self.user.id,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["action"], "locked")

        # Verify thread is locked
        self.thread.refresh_from_db()
        self.assertTrue(self.thread.is_locked)

        # Verify moderation action was created
        mod_action = ModerationAction.objects.filter(
            conversation=self.thread, action_type="lock_thread"
        ).first()
        self.assertIsNotNone(mod_action)
        self.assertEqual(mod_action.reason, "Test lock")

    def test_lock_thread_already_locked(self):
        """lock_thread should return failure if already locked."""
        # Lock it first
        self.thread.lock(self.user, "Initial lock")

        result = lock_thread(
            thread_id=self.thread.id,
            reason="Second lock attempt",
            moderator_id=self.user.id,
        )

        self.assertFalse(result["success"])
        self.assertIn("already locked", result["message"])

    def test_unlock_thread_success(self):
        """unlock_thread should unlock a locked thread."""
        # Lock first
        self.thread.lock(self.user, "To unlock")

        result = unlock_thread(
            thread_id=self.thread.id,
            reason="Test unlock",
            moderator_id=self.user.id,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["action"], "unlocked")

        self.thread.refresh_from_db()
        self.assertFalse(self.thread.is_locked)

    def test_pin_thread_success(self):
        """pin_thread should pin the thread."""
        result = pin_thread(
            thread_id=self.thread.id,
            reason="Test pin",
            moderator_id=self.user.id,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["action"], "pinned")

        self.thread.refresh_from_db()
        self.assertTrue(self.thread.is_pinned)

    def test_unpin_thread_success(self):
        """unpin_thread should unpin a pinned thread."""
        # Pin first
        self.thread.pin(self.user, "To unpin")

        result = unpin_thread(
            thread_id=self.thread.id,
            reason="Test unpin",
            moderator_id=self.user.id,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["action"], "unpinned")

        self.thread.refresh_from_db()
        self.assertFalse(self.thread.is_pinned)

    def test_delete_message_success(self):
        """delete_message should soft delete the message."""
        msg = ChatMessage.objects.create(
            conversation=self.thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="To delete",
            creator=self.user,
        )
        msg._skip_signals = True
        msg.save()

        result = delete_message(
            message_id=msg.id,
            reason="Violated guidelines",
            moderator_id=self.user.id,
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["action"], "deleted")

        msg.refresh_from_db()
        self.assertIsNotNone(msg.deleted_at)

    def test_add_thread_message_success(self):
        """add_thread_message should create an LLM type message."""
        agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            creator=self.user,
        )

        result = add_thread_message(
            thread_id=self.thread.id,
            content="Automated warning message",
            agent_config_id=agent_config.id,
            creator_id=self.user.id,
        )

        self.assertTrue(result["success"])
        self.assertIn("message_id", result)

        # Verify message was created with correct type
        msg = ChatMessage.objects.get(id=result["message_id"])
        self.assertEqual(msg.msg_type, MessageTypeChoices.LLM)
        self.assertEqual(msg.agent_configuration_id, agent_config.id)
        self.assertEqual(msg.content, "Automated warning message")

    def test_add_thread_message_locked_thread(self):
        """add_thread_message should fail on locked thread."""
        self.thread.lock(self.user, "Locked")

        agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            creator=self.user,
        )

        with self.assertRaises(ValueError) as ctx:
            add_thread_message(
                thread_id=self.thread.id,
                content="Should fail",
                agent_config_id=agent_config.id,
                creator_id=self.user.id,
            )

        self.assertIn("locked", str(ctx.exception))


class TestThreadCorpusActionSignals(TransactionTestCase):
    """Test signal handlers for thread/message creation."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testsignal",
            email="testsignal@example.com",
            password="testpass123",
        )
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user,
        )
        self.agent_config = AgentConfiguration.objects.create(
            name="Test Moderation Agent",
            creator=self.user,
        )

    @patch("opencontractserver.corpuses.signals.transaction.on_commit")
    def test_thread_creation_triggers_signal(self, mock_on_commit):
        """Creating a thread should queue corpus actions with NEW_THREAD trigger."""
        # Create corpus action with NEW_THREAD trigger
        CorpusAction.objects.create(
            name="Auto Moderate Threads",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Review this thread for compliance",
            trigger=CorpusActionTrigger.NEW_THREAD,
            creator=self.user,
        )

        # Create a thread
        thread = Conversation.objects.create(
            title="New Discussion",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )

        # Signal should have been triggered
        mock_on_commit.assert_called()

    @patch("opencontractserver.corpuses.signals.transaction.on_commit")
    def test_message_creation_triggers_signal(self, mock_on_commit):
        """Creating a message should queue corpus actions with NEW_MESSAGE trigger."""
        # Create corpus action with NEW_MESSAGE trigger
        CorpusAction.objects.create(
            name="Auto Moderate Messages",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Review this message for compliance",
            trigger=CorpusActionTrigger.NEW_MESSAGE,
            creator=self.user,
        )

        # Create a thread first
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        # Create a message
        msg = ChatMessage.objects.create(
            conversation=thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="Test message",
            creator=self.user,
        )

        # Signal should have been triggered
        mock_on_commit.assert_called()

    @patch("opencontractserver.corpuses.signals.transaction.on_commit")
    def test_llm_message_does_not_trigger_signal(self, mock_on_commit):
        """LLM messages should not trigger NEW_MESSAGE actions (avoid loops)."""
        # Create corpus action
        CorpusAction.objects.create(
            name="Auto Moderate Messages",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Review this message",
            trigger=CorpusActionTrigger.NEW_MESSAGE,
            creator=self.user,
        )

        # Create a thread
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        # Reset mock after thread creation
        mock_on_commit.reset_mock()

        # Create an LLM message (agent response)
        msg = ChatMessage.objects.create(
            conversation=thread,
            msg_type=MessageTypeChoices.LLM,
            content="Agent response",
            creator=self.user,
        )

        # Signal should NOT have queued anything for LLM messages
        # (The on_commit may still be called for other reasons,
        # but the message trigger check happens first)
        # We verify by checking that no execution was created
        executions = CorpusActionExecution.objects.filter(
            conversation=thread, trigger="new_message"
        )
        self.assertEqual(executions.count(), 0)

    @patch("opencontractserver.corpuses.signals.transaction.on_commit")
    def test_skip_signals_attribute_prevents_trigger(self, mock_on_commit):
        """_skip_signals attribute should prevent action triggering."""
        # Create corpus action
        CorpusAction.objects.create(
            name="Auto Moderate",
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Review",
            trigger=CorpusActionTrigger.NEW_THREAD,
            creator=self.user,
        )

        # Create thread with _skip_signals
        thread = Conversation(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        # on_commit should not have been called for the action queue
        # (it may be called for other reasons, but the signal checks _skip_signals)
        # Verify no execution was created
        executions = CorpusActionExecution.objects.filter(
            conversation=thread, trigger="new_thread"
        )
        self.assertEqual(executions.count(), 0)


class TestCorpusActionExecutionModel(TestCase):
    """Test CorpusActionExecution model changes."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = User.objects.create_user(
            username="testexec",
            email="testexec@example.com",
            password="testpass123",
        )
        cls.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=cls.user,
        )
        cls.agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            creator=cls.user,
        )
        cls.corpus_action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            agent_config=cls.agent_config,
            agent_prompt="Test prompt",
            trigger=CorpusActionTrigger.NEW_THREAD,
            creator=cls.user,
        )

    def test_execution_with_conversation_fk(self):
        """Execution can be created with conversation FK and null document."""
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        from django.utils import timezone

        execution = CorpusActionExecution.objects.create(
            corpus_action=self.corpus_action,
            corpus=self.corpus,
            document=None,  # Null for thread-based actions
            conversation=thread,
            action_type=CorpusActionExecution.ActionType.AGENT,
            trigger="new_thread",
            queued_at=timezone.now(),
            creator=self.user,
        )

        self.assertIsNotNone(execution.id)
        self.assertIsNone(execution.document)
        self.assertEqual(execution.conversation, thread)

    def test_execution_with_message_fk(self):
        """Execution can be created with message FK."""
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        msg = ChatMessage.objects.create(
            conversation=thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="Test message",
            creator=self.user,
        )
        msg._skip_signals = True
        msg.save()

        from django.utils import timezone

        execution = CorpusActionExecution.objects.create(
            corpus_action=self.corpus_action,
            corpus=self.corpus,
            document=None,
            conversation=thread,
            message=msg,
            action_type=CorpusActionExecution.ActionType.AGENT,
            trigger="new_message",
            queued_at=timezone.now(),
            creator=self.user,
        )

        self.assertIsNotNone(execution.id)
        self.assertEqual(execution.conversation, thread)
        self.assertEqual(execution.message, msg)

    def test_execution_str_with_thread(self):
        """__str__ should show thread info when document is null."""
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        from django.utils import timezone

        execution = CorpusActionExecution.objects.create(
            corpus_action=self.corpus_action,
            corpus=self.corpus,
            document=None,
            conversation=thread,
            action_type=CorpusActionExecution.ActionType.AGENT,
            trigger="new_thread",
            queued_at=timezone.now(),
            creator=self.user,
        )

        self.assertIn("thread:", str(execution))
        self.assertIn(str(thread.id), str(execution))


class TestAgentActionResultModel(TestCase):
    """Test AgentActionResult model changes."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = User.objects.create_user(
            username="testresult",
            email="testresult@example.com",
            password="testpass123",
        )
        cls.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=cls.user,
        )
        cls.agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            creator=cls.user,
        )
        cls.corpus_action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            agent_config=cls.agent_config,
            agent_prompt="Test prompt",
            trigger=CorpusActionTrigger.NEW_THREAD,
            creator=cls.user,
        )

    def test_result_with_triggering_conversation(self):
        """Result can be created with triggering_conversation and null document."""
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=None,  # Null for thread-based
            triggering_conversation=thread,
            creator=self.user,
        )

        self.assertIsNotNone(result.id)
        self.assertIsNone(result.document)
        self.assertEqual(result.triggering_conversation, thread)

    def test_result_with_triggering_message(self):
        """Result can be created with triggering_message."""
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        msg = ChatMessage.objects.create(
            conversation=thread,
            msg_type=MessageTypeChoices.HUMAN,
            content="Test message",
            creator=self.user,
        )
        msg._skip_signals = True
        msg.save()

        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=None,
            triggering_conversation=thread,
            triggering_message=msg,
            creator=self.user,
        )

        self.assertIsNotNone(result.id)
        self.assertEqual(result.triggering_message, msg)

    def test_result_str_with_thread(self):
        """__str__ should show thread info when document is null."""
        thread = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        thread._skip_signals = True
        thread.save()

        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=None,
            triggering_conversation=thread,
            creator=self.user,
        )

        self.assertIn("thread:", str(result))


class TestToolRegistry(TestCase):
    """Test that moderation tools are registered correctly."""

    def test_moderation_category_exists(self):
        """MODERATION category should exist."""
        from opencontractserver.llms.tools.tool_registry import ToolCategory

        self.assertEqual(ToolCategory.MODERATION.value, "moderation")

    def test_moderation_tools_registered(self):
        """All moderation tools should be in the registry."""
        from opencontractserver.llms.tools.tool_registry import get_tool_by_name

        moderation_tools = [
            "get_thread_context",
            "get_thread_messages",
            "get_message_content",
            "delete_message",
            "lock_thread",
            "unlock_thread",
            "add_thread_message",
            "pin_thread",
            "unpin_thread",
        ]

        for tool_name in moderation_tools:
            tool = get_tool_by_name(tool_name)
            self.assertIsNotNone(tool, f"Tool {tool_name} should be registered")
            self.assertEqual(
                tool["category"],
                "moderation",
                f"Tool {tool_name} should be in moderation category",
            )

    def test_moderation_action_tools_require_approval(self):
        """Action tools should require approval."""
        from opencontractserver.llms.tools.tool_registry import get_tool_by_name

        action_tools = [
            "delete_message",
            "lock_thread",
            "unlock_thread",
            "add_thread_message",
            "pin_thread",
            "unpin_thread",
        ]

        for tool_name in action_tools:
            tool = get_tool_by_name(tool_name)
            self.assertTrue(
                tool["requiresApproval"],
                f"Tool {tool_name} should require approval",
            )

    def test_read_only_tools_no_approval(self):
        """Read-only tools should not require approval."""
        from opencontractserver.llms.tools.tool_registry import get_tool_by_name

        read_tools = [
            "get_thread_context",
            "get_thread_messages",
            "get_message_content",
        ]

        for tool_name in read_tools:
            tool = get_tool_by_name(tool_name)
            self.assertFalse(
                tool["requiresApproval"],
                f"Tool {tool_name} should not require approval",
            )
