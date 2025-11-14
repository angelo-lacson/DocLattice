"""
Tests for mention parsing utility.

Tests the HTML parsing and resource linking functionality for @ mentions
in discussion threads.

Part of Issue #623 - @ Mentions Feature (Extended)
"""

import pytest
from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import Annotation
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.utils.mention_parser import (
    extract_mentioned_user_ids,
    link_message_to_resources,
    parse_mentions_from_content,
)

User = get_user_model()


class MentionParserTestCase(TestCase):
    """Test mention parsing from HTML content."""

    def test_parse_empty_content(self):
        """Empty content should return empty sets."""
        result = parse_mentions_from_content("")
        self.assertEqual(result["documents"], set())
        self.assertEqual(result["annotations"], set())
        self.assertEqual(result["users"], set())
        self.assertEqual(result["corpuses"], set())

    def test_parse_content_without_mentions(self):
        """Content without mentions should return empty sets."""
        html = "<p>This is a regular message without mentions.</p>"
        result = parse_mentions_from_content(html)
        self.assertEqual(result["documents"], set())
        self.assertEqual(result["annotations"], set())
        self.assertEqual(result["users"], set())
        self.assertEqual(result["corpuses"], set())

    def test_parse_document_mention(self):
        """Should extract document mention from link."""
        html = """
        <p>Check out this
        <a href="/d/user/doc-slug"
           class="mention mention-link"
           data-mention-type="document"
           data-mention-id="123">@document:doc-slug</a>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["documents"], {"123"})
        self.assertEqual(result["annotations"], set())
        self.assertEqual(result["users"], set())

    def test_parse_annotation_mention(self):
        """Should extract annotation mention from link."""
        html = """
        <p>See annotation
        <a href="/d/user/doc?ann=456&structural=true"
           class="mention mention-link"
           data-mention-type="annotation"
           data-mention-id="456">@annotation:456</a>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["documents"], set())
        self.assertEqual(result["annotations"], {"456"})
        self.assertEqual(result["users"], set())

    def test_parse_user_mention(self):
        """Should extract user mention from span (no href)."""
        html = """
        <p>Hey
        <span class="mention"
              data-mention-type="user"
              data-mention-id="789">@john</span>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["documents"], set())
        self.assertEqual(result["annotations"], set())
        self.assertEqual(result["users"], {"789"})

    def test_parse_corpus_mention(self):
        """Should extract corpus mention from link."""
        html = """
        <p>Check
        <a href="/c/user/my-corpus"
           class="mention mention-link"
           data-mention-type="corpus"
           data-mention-id="101">@corpus:my-corpus</a>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["corpuses"], {"101"})
        self.assertEqual(result["documents"], set())
        self.assertEqual(result["annotations"], set())
        self.assertEqual(result["users"], set())

    def test_parse_multiple_mentions(self):
        """Should extract all mention types from mixed content."""
        html = """
        <p>Hey
        <span data-mention-type="user" data-mention-id="1">@john</span>,
        check out
        <a href="/d/user/doc" data-mention-type="document" data-mention-id="2">@document:doc</a>
        and especially
        <a href="/d/user/doc?ann=3" data-mention-type="annotation" data-mention-id="3">@annotation:3</a>
        in
        <a href="/c/user/corpus" data-mention-type="corpus" data-mention-id="4">@corpus:corpus</a>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["users"], {"1"})
        self.assertEqual(result["documents"], {"2"})
        self.assertEqual(result["annotations"], {"3"})
        self.assertEqual(result["corpuses"], {"4"})

    def test_parse_duplicate_mentions(self):
        """Should deduplicate multiple mentions of same resource."""
        html = """
        <p>
        <a data-mention-type="document" data-mention-id="123">@doc</a>
        some text
        <a data-mention-type="document" data-mention-id="123">@doc</a>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["documents"], {"123"})  # Only one ID

    def test_parse_mention_without_id(self):
        """Should skip mentions without data-mention-id attribute."""
        html = """
        <p>
        <a href="/d/user/doc"
           data-mention-type="document">@document:no-id</a>
        </p>
        """
        result = parse_mentions_from_content(html)
        self.assertEqual(result["documents"], set())  # Skipped

    def test_parse_mention_with_unknown_type(self):
        """Should log warning but not crash on unknown mention type."""
        html = """
        <p>
        <a data-mention-type="unknown-type" data-mention-id="999">@unknown</a>
        </p>
        """
        # Should not raise exception
        result = parse_mentions_from_content(html)
        # Unknown type not added to any set
        self.assertEqual(result["documents"], set())
        self.assertEqual(result["annotations"], set())
        self.assertEqual(result["users"], set())
        self.assertEqual(result["corpuses"], set())

    def test_extract_mentioned_user_ids_convenience(self):
        """Should extract only user IDs for notifications."""
        html = """
        <p>
        <span data-mention-type="user" data-mention-id="1">@alice</span>
        <span data-mention-type="user" data-mention-id="2">@bob</span>
        <a data-mention-type="document" data-mention-id="3">@doc</a>
        </p>
        """
        user_ids = extract_mentioned_user_ids(html)
        self.assertEqual(user_ids, {"1", "2"})  # Only users


@pytest.mark.django_db
class MentionLinkingTestCase(TestCase):
    """Test linking mentions to ChatMessage instances."""

    def setUp(self):
        """Create test data."""
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user,
        )
        self.conversation = Conversation.objects.create(
            title="Test Thread",
            conversation_type="thread",
            chat_with_corpus=self.corpus,
            creator=self.user,
        )
        # Create document without adding to corpus to avoid signal issues in tests
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
            description="Test doc",
        )

        # Create annotation (requires document with PDF file)
        # For simplicity, we'll create without PDF and handle DoesNotExist
        self.annotation = Annotation.objects.create(
            annotation_label=None,  # Simplified for test
            document=self.document,
            corpus=self.corpus,
            creator=self.user,
            raw_text="Test annotation text",
            page=1,
        )

    def test_link_no_mentions(self):
        """Should handle message with no mentions gracefully."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Regular message</p>",
            creator=self.user,
        )

        mentioned_ids = {"documents": set(), "annotations": set(), "users": set()}
        result = link_message_to_resources(message, mentioned_ids)

        self.assertEqual(result["documents_linked"], 0)
        self.assertEqual(result["annotations_linked"], 0)
        self.assertIsNone(message.source_document)
        self.assertEqual(message.source_annotations.count(), 0)

    def test_link_single_document(self):
        """Should link first mentioned document as source_document."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": {str(self.document.pk)},
            "annotations": set(),
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        message.refresh_from_db()
        self.assertEqual(result["documents_linked"], 1)
        self.assertEqual(message.source_document, self.document)

    def test_link_multiple_documents_takes_first(self):
        """Should link only first document when multiple mentioned."""
        doc2 = Document.objects.create(
            title="Second Document", creator=self.user, description="Test"
        )

        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": {str(self.document.pk), str(doc2.pk)},
            "annotations": set(),
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        message.refresh_from_db()
        self.assertEqual(result["documents_linked"], 1)
        # Should link to first one in set (order may vary but should be one of them)
        self.assertIn(message.source_document, [self.document, doc2])

    def test_link_single_annotation(self):
        """Should link annotation via ManyToMany."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": set(),
            "annotations": {str(self.annotation.pk)},
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        self.assertEqual(result["annotations_linked"], 1)
        self.assertEqual(message.source_annotations.count(), 1)
        self.assertIn(self.annotation, message.source_annotations.all())

    def test_link_multiple_annotations(self):
        """Should link all mentioned annotations via ManyToMany."""
        ann2 = Annotation.objects.create(
            annotation_label=None,
            document=self.document,
            corpus=self.corpus,
            creator=self.user,
            raw_text="Second annotation",
            page=2,
        )

        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": set(),
            "annotations": {str(self.annotation.pk), str(ann2.pk)},
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        self.assertEqual(result["annotations_linked"], 2)
        self.assertEqual(message.source_annotations.count(), 2)
        self.assertIn(self.annotation, message.source_annotations.all())
        self.assertIn(ann2, message.source_annotations.all())

    def test_link_nonexistent_document(self):
        """Should handle gracefully when document doesn't exist."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": {"99999"},  # Non-existent ID
            "annotations": set(),
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        message.refresh_from_db()
        self.assertEqual(result["documents_linked"], 0)
        self.assertIsNone(message.source_document)

    def test_link_nonexistent_annotations(self):
        """Should handle gracefully when annotations don't exist."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": set(),
            "annotations": {"99999", "88888"},  # Non-existent IDs
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        self.assertEqual(result["annotations_linked"], 0)
        self.assertEqual(message.source_annotations.count(), 0)

    def test_link_mixed_resources(self):
        """Should link both documents and annotations together."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": {str(self.document.pk)},
            "annotations": {str(self.annotation.pk)},
            "users": set(),
        }
        result = link_message_to_resources(message, mentioned_ids)

        message.refresh_from_db()
        self.assertEqual(result["documents_linked"], 1)
        self.assertEqual(result["annotations_linked"], 1)
        self.assertEqual(message.source_document, self.document)
        self.assertIn(self.annotation, message.source_annotations.all())

    def test_link_counts_users_and_corpuses(self):
        """Should count (but not link) users and corpuses."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="<p>Test message</p>",
            creator=self.user,
        )

        mentioned_ids = {
            "documents": set(),
            "annotations": set(),
            "users": {"1", "2", "3"},
            "corpuses": {"101", "102"},
        }
        result = link_message_to_resources(message, mentioned_ids)

        self.assertEqual(result["users_mentioned"], 3)
        self.assertEqual(result["corpuses_mentioned"], 2)
        # No actual linking for these types yet
        self.assertEqual(result["documents_linked"], 0)
        self.assertEqual(result["annotations_linked"], 0)
