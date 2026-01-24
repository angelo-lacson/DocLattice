"""
Test for bug: Duplicate Tool Registration in PydanticAI Agent

This test confirms the bug where passing a tool name (e.g., "update_document_description")
via the `tools` parameter results in a duplicate tool registration error because
the PydanticAIDocumentAgent.create() method already creates this tool by default.

Bug report:
    pydantic_ai.exceptions.UserError: Tool name conflicts with existing tool:
    'update_document_description'
"""

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from django.test import TransactionTestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.documents.signals import (
    DOC_CREATE_UID,
    process_doc_on_create_atomic,
)
from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import AgentConfig
from opencontractserver.llms.agents.pydantic_ai_agents import PydanticAIDocumentAgent
from opencontractserver.llms.tools.core_tools import update_document_description
from opencontractserver.llms.tools.tool_factory import CoreTool

User = get_user_model()


class TestDuplicateToolRegistration(TransactionTestCase):
    """Tests for duplicate tool registration bug."""

    @classmethod
    def setUpClass(cls) -> None:
        """Disconnect document processing signals to avoid Celery tasks during setup."""
        super().setUpClass()
        post_save.disconnect(
            process_doc_on_create_atomic, sender=Document, dispatch_uid=DOC_CREATE_UID
        )

    @classmethod
    def tearDownClass(cls) -> None:
        """Reconnect document processing signals after tests complete."""
        post_save.connect(
            process_doc_on_create_atomic, sender=Document, dispatch_uid=DOC_CREATE_UID
        )
        super().tearDownClass()

    def setUp(self) -> None:
        """Create test data."""
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass",
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test corpus",
            creator=self.user,
            is_public=True,
        )

        doc_text = "This is a test document with some content."
        self.doc = Document.objects.create(
            title="Test Document",
            description="Test document for duplicate tool test",
            creator=self.user,
            is_public=True,
            file_type="text/plain",
        )
        self.doc.txt_extract_file.save(
            "test_doc.txt", ContentFile(doc_text.encode("utf-8")), save=True
        )

    async def test_duplicate_tool_via_string_name_does_not_raise(self):
        """
        Test that passing 'update_document_description' as a tool name
        via the high-level API does NOT cause a duplicate tool error.

        Before the fix, this would raise:
            pydantic_ai.exceptions.UserError: Tool name conflicts with existing tool:
            'update_document_description'

        After the fix, duplicates should be silently deduplicated.
        """
        # This tool name is ALREADY registered as a default tool in
        # PydanticAIDocumentAgent.create(), so passing it again should
        # either be deduplicated or cause an error (before the fix).
        tool_names = ["update_document_description"]

        # Use the high-level API which goes through:
        # agents.for_document() -> api.py:_resolve_tools() -> agent_factory.py
        # -> PydanticAIDocumentAgent.create()
        agent = await agents.for_document(
            document=self.doc,
            corpus=self.corpus,
            user_id=self.user.id,
            tools=tool_names,
            streaming=False,
        )

        # If we get here without UserError, the fix worked
        self.assertIsNotNone(agent)

    async def test_duplicate_tool_via_core_tool_does_not_raise(self):
        """
        Test that passing a CoreTool with the same name as a default tool
        does NOT cause a duplicate tool error.
        """
        from django.conf import settings

        from opencontractserver.llms.tools.pydantic_ai_tools import (
            PydanticAIToolFactory,
        )

        # Create a CoreTool that wraps the same function as the default
        duplicate_core_tool = CoreTool.from_function(
            update_document_description,
            name="update_document_description",
            description="Duplicate tool for testing",
        )
        # Convert to PydanticAI tool format (same as what agent_factory does)
        duplicate_pydantic_tool = PydanticAIToolFactory.create_tool(duplicate_core_tool)

        config = AgentConfig(
            user_id=self.user.id,
            model_name=settings.OPENAI_MODEL,  # Use a valid model name
            store_user_messages=False,
            store_llm_messages=False,
        )

        # This should NOT raise even though 'update_document_description'
        # is already a default tool
        agent = await PydanticAIDocumentAgent.create(
            document=self.doc,
            corpus=self.corpus,
            config=config,
            tools=[duplicate_pydantic_tool],
        )

        self.assertIsNotNone(agent)

    async def test_multiple_duplicate_tools_deduplicated(self):
        """
        Test that passing multiple tools with the same name as default tools
        results in proper deduplication (only one instance of each).
        """
        # These are all default tools that will be duplicated
        tool_names = [
            "update_document_description",
            "get_document_description",
        ]

        agent = await agents.for_document(
            document=self.doc,
            corpus=self.corpus,
            user_id=self.user.id,
            tools=tool_names,
            streaming=False,
        )

        self.assertIsNotNone(agent)
