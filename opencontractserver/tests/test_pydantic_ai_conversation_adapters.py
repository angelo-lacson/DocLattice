"""
Tests for PydanticAI adapter classes for conversation and message search.

This test suite covers:
- PydanticAIConversationVectorStore adapter
- PydanticAIChatMessageVectorStore adapter
- Pydantic response model conversions
- Tool creation helpers
"""

import pytest
from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import Embedding
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.llms.vector_stores.core_conversation_vector_stores import (
    ConversationSearchResult,
    MessageSearchResult,
)
from opencontractserver.llms.vector_stores.pydantic_ai_conversation_vector_stores import (
    PydanticAIChatMessageVectorStore,
    PydanticAIConversationSearchResponse,
    PydanticAIConversationVectorStore,
    PydanticAIMessageSearchResponse,
    create_conversation_search_tool,
    create_message_search_tool,
)
from opencontractserver.utils.permissioning import (
    PermissionTypes,
    set_permissions_for_obj_to_user,
)

User = get_user_model()


@pytest.mark.django_db
class TestPydanticAIConversationAdapters(TestCase):
    """Test PydanticAI adapter classes for conversation search."""

    def setUp(self):
        """Set up test data."""
        # Create user
        self.user = User.objects.create_user(
            username="pydantic_test_user", password="testpassword"
        )

        # Create corpus
        self.corpus = Corpus.objects.create(
            title="PydanticAI Test Corpus", creator=self.user
        )

        # Create conversation
        self.conversation = Conversation.objects.create(
            title="PydanticAI Test Conversation",
            description="Testing PydanticAI adapters",
            chat_with_corpus=self.corpus,
            creator=self.user,
            conversation_type="thread",
        )
        set_permissions_for_obj_to_user(
            user_val=self.user,
            instance=self.conversation,
            permissions=[PermissionTypes.ALL],
        )

        # Create message
        self.message = ChatMessage.objects.create(
            conversation=self.conversation,
            creator=self.user,
            msg_type="HUMAN",
            content="Test message for PydanticAI adapters",
        )

        # Create embeddings
        Embedding.objects.create(
            conversation=self.conversation,
            embedder_path="test/embedder",
            vector_384=[0.1] * 384,
            creator=self.user,
        )

        Embedding.objects.create(
            message=self.message,
            embedder_path="test/embedder",
            vector_384=[0.2] * 384,
            creator=self.user,
        )

    def test_pydantic_ai_conversation_vector_store_initialization(self):
        """Test PydanticAIConversationVectorStore initialization."""
        store = PydanticAIConversationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            embedder_path="test/embedder",
        )

        # Verify core store was initialized
        self.assertIsNotNone(store.core_store)
        self.assertEqual(store.core_store.user_id, self.user.id)
        self.assertEqual(store.core_store.corpus_id, self.corpus.id)
        self.assertEqual(store.core_store.embedder_path, "test/embedder")

    def test_pydantic_ai_message_vector_store_initialization(self):
        """Test PydanticAIChatMessageVectorStore initialization."""
        store = PydanticAIChatMessageVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            embedder_path="test/embedder",
        )

        # Verify core store was initialized
        self.assertIsNotNone(store.core_store)
        self.assertEqual(store.core_store.user_id, self.user.id)
        self.assertEqual(store.core_store.corpus_id, self.corpus.id)
        self.assertEqual(store.core_store.embedder_path, "test/embedder")

    def test_pydantic_conversation_response_from_core_results(self):
        """Test PydanticAIConversationSearchResponse.async_from_core_results."""
        # Create test results
        results = [
            ConversationSearchResult(
                conversation=self.conversation,
                similarity_score=0.95,
            )
        ]

        # Test async conversion using sync wrapper
        @async_to_sync
        async def run_test():
            response = (
                await PydanticAIConversationSearchResponse.async_from_core_results(
                    results
                )
            )
            return response

        response = run_test()

        # Verify response structure
        self.assertEqual(response.total_results, 1)
        self.assertEqual(len(response.results), 1)

        result = response.results[0]
        self.assertEqual(result["conversation_id"], self.conversation.id)
        self.assertEqual(result["title"], self.conversation.title)
        self.assertEqual(result["description"], self.conversation.description)
        self.assertEqual(
            result["conversation_type"], self.conversation.conversation_type
        )
        self.assertEqual(result["similarity_score"], 0.95)
        self.assertEqual(result["corpus_id"], self.corpus.id)
        self.assertIsNone(result["document_id"])

    def test_pydantic_message_response_from_core_results(self):
        """Test PydanticAIMessageSearchResponse.async_from_core_results."""
        # Create test results
        results = [
            MessageSearchResult(
                message=self.message,
                similarity_score=0.88,
            )
        ]

        # Test async conversion using sync wrapper
        @async_to_sync
        async def run_test():
            response = await PydanticAIMessageSearchResponse.async_from_core_results(
                results
            )
            return response

        response = run_test()

        # Verify response structure
        self.assertEqual(response.total_results, 1)
        self.assertEqual(len(response.results), 1)

        result = response.results[0]
        self.assertEqual(result["message_id"], self.message.id)
        self.assertEqual(result["content"], self.message.content)
        self.assertEqual(result["msg_type"], self.message.msg_type)
        self.assertEqual(result["similarity_score"], 0.88)
        self.assertEqual(result["conversation_id"], self.conversation.id)

    def test_pydantic_conversation_response_empty_results(self):
        """Test response conversion with empty results list."""
        results = []

        @async_to_sync
        async def run_test():
            response = (
                await PydanticAIConversationSearchResponse.async_from_core_results(
                    results
                )
            )
            return response

        response = run_test()

        self.assertEqual(response.total_results, 0)
        self.assertEqual(len(response.results), 0)

    def test_pydantic_message_response_empty_results(self):
        """Test response conversion with empty results list."""
        results = []

        @async_to_sync
        async def run_test():
            response = await PydanticAIMessageSearchResponse.async_from_core_results(
                results
            )
            return response

        response = run_test()

        self.assertEqual(response.total_results, 0)
        self.assertEqual(len(response.results), 0)

    def test_create_conversation_search_tool(self):
        """Test create_conversation_search_tool helper."""

        @async_to_sync
        async def run_test():
            tool = await create_conversation_search_tool(
                user_id=self.user.id,
                corpus_id=self.corpus.id,
            )
            return tool

        tool = run_test()

        # Verify tool is callable
        self.assertTrue(callable(tool))

        # Check function name
        self.assertEqual(tool.__name__, "search_conversations")

    def test_create_message_search_tool(self):
        """Test create_message_search_tool helper."""

        @async_to_sync
        async def run_test():
            tool = await create_message_search_tool(
                user_id=self.user.id,
                corpus_id=self.corpus.id,
            )
            return tool

        tool = run_test()

        # Verify tool is callable
        self.assertTrue(callable(tool))

        # Check function name
        self.assertEqual(tool.__name__, "search_messages")

    def test_conversation_search_tool_with_filters(self):
        """Test conversation search tool with various filters."""

        @async_to_sync
        async def run_test():
            # Test with conversation_type filter
            tool1 = await create_conversation_search_tool(
                user_id=self.user.id,
                corpus_id=self.corpus.id,
                conversation_type="thread",
            )

            # Test with document_id filter
            tool2 = await create_conversation_search_tool(
                user_id=self.user.id,
                corpus_id=self.corpus.id,
                document_id=None,  # No document filter
            )
            return tool1, tool2

        tool1, tool2 = run_test()

        self.assertTrue(callable(tool1))
        self.assertTrue(callable(tool2))

    def test_message_search_tool_with_conversation_filter(self):
        """Test message search tool with conversation filter."""

        @async_to_sync
        async def run_test():
            tool = await create_message_search_tool(
                user_id=self.user.id,
                corpus_id=self.corpus.id,
                conversation_id=self.conversation.id,
            )
            return tool

        tool = run_test()

        self.assertTrue(callable(tool))

    def test_pydantic_conversation_vector_store_with_all_params(self):
        """Test PydanticAIConversationVectorStore with all parameters."""
        store = PydanticAIConversationVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            document_id=None,
            conversation_type="thread",
            embedder_path="test/embedder",
            embed_dim=384,
            exclude_deleted=True,
        )

        self.assertIsNotNone(store.core_store)
        self.assertEqual(store.core_store.conversation_type, "thread")
        self.assertTrue(store.core_store.exclude_deleted)

    def test_pydantic_message_vector_store_with_all_params(self):
        """Test PydanticAIChatMessageVectorStore with all parameters."""
        store = PydanticAIChatMessageVectorStore(
            user_id=self.user.id,
            corpus_id=self.corpus.id,
            conversation_id=self.conversation.id,
            msg_type="HUMAN",
            embedder_path="test/embedder",
            embed_dim=384,
            exclude_deleted=True,
        )

        self.assertIsNotNone(store.core_store)
        self.assertEqual(store.core_store.msg_type, "HUMAN")
        self.assertTrue(store.core_store.exclude_deleted)
