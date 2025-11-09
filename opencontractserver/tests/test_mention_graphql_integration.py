"""
GraphQL integration tests for mention search queries.

Tests the full GraphQL stack including schema, resolvers, and permission filtering.
These tests use actual GraphQL queries instead of calling resolver methods directly.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class MockRequest:
    """Mock request object for GraphQL context."""

    def __init__(self, user):
        self.user = user


class MentionSearchGraphQLIntegrationTestCase(TestCase):
    """Integration tests for mention search GraphQL queries."""

    def setUp(self):
        """Create test data and GraphQL client."""
        # Create users
        self.owner = User.objects.create_user(username="owner", password="test")
        self.contributor = User.objects.create_user(
            username="contributor", password="test"
        )
        self.viewer = User.objects.create_user(username="viewer", password="test")
        self.outsider = User.objects.create_user(username="outsider", password="test")

        # Create corpuses
        self.private_corpus = Corpus.objects.create(
            title="Private Legal Corpus", creator=self.owner, is_public=False
        )
        self.public_corpus = Corpus.objects.create(
            title="Public Legal Corpus", creator=self.owner, is_public=True
        )

        # Create documents
        self.private_doc = Document.objects.create(
            title="Private Contract",
            description="Confidential contract",
            creator=self.owner,
            is_public=False,
        )
        self.private_corpus.documents.add(self.private_doc)

        self.public_doc = Document.objects.create(
            title="Public Template",
            description="Open template",
            creator=self.owner,
            is_public=True,
        )
        self.public_corpus.documents.add(self.public_doc)

        # Set permissions
        set_permissions_for_obj_to_user(
            self.contributor, self.private_corpus, [PermissionTypes.UPDATE]
        )
        set_permissions_for_obj_to_user(
            self.viewer, self.private_corpus, [PermissionTypes.READ]
        )

    def test_search_corpuses_query_with_write_permission(self):
        """GraphQL query returns corpuses user has write permission to."""
        query = """
            query SearchCorpuses($textSearch: String) {
                searchCorpusesForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            title
                            slug
                            creator {
                                slug
                            }
                        }
                    }
                }
            }
        """

        # Execute query with contributor context
        context = MockRequest(self.contributor)
        result = schema.execute(
            query, variables={"textSearch": "Legal"}, context_value=context
        )

        # Check no errors
        self.assertIsNone(result.errors, f"GraphQL errors: {result.errors}")

        # Extract corpus titles
        edges = result.data["searchCorpusesForMention"]["edges"]
        titles = [edge["node"]["title"] for edge in edges]

        # Contributor should see private corpus (has UPDATE) and public corpus
        self.assertIn(self.private_corpus.title, titles)
        self.assertIn(self.public_corpus.title, titles)

    def test_search_corpuses_query_read_only_blocked(self):
        """GraphQL query excludes corpuses where user has only read permission."""
        query = """
            query SearchCorpuses($textSearch: String) {
                searchCorpusesForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }
        """

        context = MockRequest(self.viewer)
        result = schema.execute(
            query, variables={"textSearch": "Legal"}, context_value=context
        )

        edges = result.data["searchCorpusesForMention"]["edges"]
        titles = [edge["node"]["title"] for edge in edges]

        # Viewer should NOT see private corpus (only has READ, needs write permission)
        self.assertNotIn(self.private_corpus.title, titles)
        # Viewer SHOULD see public corpus
        self.assertIn(self.public_corpus.title, titles)

    def test_search_documents_query_with_corpus_write_permission(self):
        """GraphQL query returns documents in corpuses user has write permission to."""
        query = """
            query SearchDocuments($textSearch: String) {
                searchDocumentsForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            title
                            slug
                            creator {
                                slug
                            }
                        }
                    }
                }
            }
        """

        context = MockRequest(self.contributor)
        result = schema.execute(
            query, variables={"textSearch": ""}, context_value=context
        )

        edges = result.data["searchDocumentsForMention"]["edges"]
        titles = [edge["node"]["title"] for edge in edges]

        # Contributor should see private doc (corpus has UPDATE permission)
        self.assertIn(
            self.private_doc.title,
            titles,
            "Contributor should see document in writable corpus",
        )

    def test_search_documents_query_read_only_blocked(self):
        """GraphQL query excludes documents where user has only read permission."""
        query = """
            query SearchDocuments($textSearch: String) {
                searchDocumentsForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }
        """

        context = MockRequest(self.viewer)
        result = schema.execute(
            query, variables={"textSearch": ""}, context_value=context
        )

        edges = result.data["searchDocumentsForMention"]["edges"]
        titles = [edge["node"]["title"] for edge in edges]

        # Viewer should NOT see private doc (only has READ on corpus)
        self.assertNotIn(
            self.private_doc.title,
            titles,
            "Viewer should NOT see document from read-only corpus",
        )
        # Viewer SHOULD see public doc
        self.assertIn(self.public_doc.title, titles)

    def test_mentioned_resources_field_on_message(self):
        """GraphQL query resolves mentionedResources field on messages."""
        from opencontractserver.conversations.models import ChatMessage, Conversation

        # Create conversation and message with mentions
        conversation = Conversation.objects.create(
            title="Test Conversation",
            creator=self.owner,
            conversation_type="THREAD",
            is_public=True,
        )

        message = ChatMessage.objects.create(
            conversation=conversation,
            creator=self.owner,
            msg_type="HUMAN",
            content=f"Check out @corpus:{self.public_corpus.slug} and @document:{self.public_doc.slug}",
        )

        query = """
            query GetMessage($id: ID!) {
                node(id: $id) {
                    ... on MessageType {
                        content
                        mentionedResources {
                            type
                            slug
                            title
                            url
                        }
                    }
                }
            }
        """

        from graphene import Node

        context = MockRequest(
            self.outsider
        )  # Use outsider who can only see public resources
        result = schema.execute(
            query,
            variables={"id": Node.to_global_id("MessageType", message.id)},
            context_value=context,
        )

        # Check mentioned resources
        node = result.data["node"]
        resources = node["mentionedResources"]

        # Should have 2 mentions
        self.assertEqual(len(resources), 2)

        # Check corpus mention
        corpus_mention = next((r for r in resources if r["type"] == "CORPUS"), None)
        self.assertIsNotNone(corpus_mention)
        self.assertEqual(corpus_mention["slug"], self.public_corpus.slug)
        self.assertEqual(corpus_mention["title"], self.public_corpus.title)

        # Check document mention
        doc_mention = next((r for r in resources if r["type"] == "DOCUMENT"), None)
        self.assertIsNotNone(doc_mention)
        self.assertEqual(doc_mention["slug"], self.public_doc.slug)
        self.assertEqual(doc_mention["title"], self.public_doc.title)

    def test_mentioned_resources_filters_inaccessible_mentions(self):
        """mentionedResources field silently filters out resources user cannot access."""
        from opencontractserver.conversations.models import ChatMessage, Conversation

        # Create public conversation but reference private corpus
        conversation = Conversation.objects.create(
            title="Test Conversation",
            creator=self.owner,
            conversation_type="THREAD",
            is_public=True,
        )

        message = ChatMessage.objects.create(
            conversation=conversation,
            creator=self.owner,
            msg_type="HUMAN",
            content=f"Secret: @corpus:{self.private_corpus.slug} and @document:{self.private_doc.slug}",
        )

        query = """
            query GetMessage($id: ID!) {
                node(id: $id) {
                    ... on MessageType {
                        content
                        mentionedResources {
                            type
                            slug
                            title
                        }
                    }
                }
            }
        """

        from graphene import Node

        context = MockRequest(self.outsider)  # Cannot see private resources
        result = schema.execute(
            query,
            variables={"id": Node.to_global_id("MessageType", message.id)},
            context_value=context,
        )

        # Check mentioned resources - should be empty (filtered)
        node = result.data["node"]
        resources = node["mentionedResources"]

        # Should have 0 mentions visible to outsider
        self.assertEqual(
            len(resources),
            0,
            "Outsider should not see mentions to private resources",
        )

    def test_anonymous_user_search_blocked(self):
        """Anonymous users cannot search for mentions."""
        from django.contrib.auth.models import AnonymousUser

        query = """
            query SearchCorpuses($textSearch: String) {
                searchCorpusesForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }
        """

        context = MockRequest(AnonymousUser())
        result = schema.execute(
            query, variables={"textSearch": "Legal"}, context_value=context
        )

        # Should return empty results (not error - silent filtering)
        edges = result.data["searchCorpusesForMention"]["edges"]
        self.assertEqual(len(edges), 0, "Anonymous users should get empty results")
