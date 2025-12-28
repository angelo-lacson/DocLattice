"""Tests for the AgentActionResult model."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.agents.models import AgentActionResult, AgentConfiguration
from opencontractserver.conversations.models import Conversation
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusActionTrigger
from opencontractserver.documents.models import Document

User = get_user_model()


class AgentActionResultModelTestCase(TestCase):
    """Test cases for the AgentActionResult model."""

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
            name="Test Agent Config",
            description="Test agent configuration",
            system_instructions="You are a helpful assistant",
            is_active=True,
            creator=self.user,
        )
        self.corpus_action = CorpusAction.objects.create(
            corpus=self.corpus,
            agent_config=self.agent_config,
            agent_prompt="Summarize this document",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        self.conversation = Conversation.objects.create(
            title="Test Conversation",
            creator=self.user,
        )

    def test_create_agent_action_result(self):
        """Test creating an AgentActionResult."""
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.PENDING,
            creator=self.user,
        )
        self.assertIsNotNone(result.id)
        self.assertEqual(result.corpus_action, self.corpus_action)
        self.assertEqual(result.document, self.document)
        self.assertEqual(result.conversation, self.conversation)
        self.assertEqual(result.status, AgentActionResult.Status.PENDING)

    def test_agent_action_result_status_transitions(self):
        """Test status transitions for AgentActionResult."""
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.PENDING,
            creator=self.user,
        )

        # Transition to running
        result.status = AgentActionResult.Status.RUNNING
        result.save()
        result.refresh_from_db()
        self.assertEqual(result.status, AgentActionResult.Status.RUNNING)

        # Transition to completed
        result.status = AgentActionResult.Status.COMPLETED
        result.agent_response = "Document summarized successfully."
        result.save()
        result.refresh_from_db()
        self.assertEqual(result.status, AgentActionResult.Status.COMPLETED)
        self.assertEqual(result.agent_response, "Document summarized successfully.")

    def test_agent_action_result_with_tools_executed(self):
        """Test AgentActionResult with tools_executed."""
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.COMPLETED,
            agent_response="Document description updated.",
            tools_executed=[
                {"tool": "search_annotations", "args": {"query": "summary"}},
                {
                    "tool": "update_document_description",
                    "args": {"description": "New desc"},
                },
            ],
            creator=self.user,
        )
        self.assertEqual(len(result.tools_executed), 2)
        self.assertEqual(result.tools_executed[0]["tool"], "search_annotations")

    def test_agent_action_result_with_error(self):
        """Test AgentActionResult with an error."""
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.FAILED,
            error_message="LLM API rate limit exceeded",
            creator=self.user,
        )
        self.assertEqual(result.status, AgentActionResult.Status.FAILED)
        self.assertEqual(result.error_message, "LLM API rate limit exceeded")

    def test_agent_action_result_str(self):
        """Test the string representation of AgentActionResult."""
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.COMPLETED,
            creator=self.user,
        )
        expected_str = f"AgentActionResult({self.corpus_action.name} on doc:{self.document.id}: completed)"
        self.assertEqual(str(result), expected_str)

    def test_agent_action_result_visible_to_user(self):
        """Test the visible_to_user manager method."""
        # Create result with proper permissions
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.COMPLETED,
            creator=self.user,
        )

        # Creator should see their own results
        visible = AgentActionResult.objects.visible_to_user(self.user)
        self.assertIn(result, visible)

        # Another user should not see it (without permissions)
        other_user = User.objects.create_user(username="other", password="testpass")
        visible_to_other = AgentActionResult.objects.visible_to_user(other_user)
        self.assertNotIn(result, visible_to_other)

    def test_agent_action_result_execution_metadata(self):
        """Test AgentActionResult with execution metadata."""
        result = AgentActionResult.objects.create(
            corpus_action=self.corpus_action,
            document=self.document,
            conversation=self.conversation,
            status=AgentActionResult.Status.COMPLETED,
            execution_metadata={
                "model_used": "gpt-4o-mini",
                "total_tokens": 1500,
                "prompt_tokens": 1000,
                "completion_tokens": 500,
            },
            creator=self.user,
        )
        self.assertEqual(result.execution_metadata["model_used"], "gpt-4o-mini")
        self.assertEqual(result.execution_metadata["total_tokens"], 1500)
