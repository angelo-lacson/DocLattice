"""
Tests for @ mention functionality in chat messages.

Verifies:
1. Mention parsing with regex patterns
2. Permission enforcement (mentions to inaccessible resources ignored)
3. Three mention formats: @corpus:slug, @document:slug, @corpus:slug/document:slug
4. Search query permission filtering
"""

import datetime
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from graphene.test import Client as GrapheneClient
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class MentionParsingTestCase(TestCase):
    """Test @ mention parsing in chat messages."""

    @mock.patch("opencontractserver.documents.signals.calculate_embedding_for_doc_text")
    def setUp(self, mock_embedding_task):
        """Create test users, corpuses, and documents."""
        # Create users
        self.user1 = User.objects.create_user(
            username="user1", password="test", slug="user1"
        )
        self.user2 = User.objects.create_user(
            username="user2", password="test", slug="user2"
        )

        # Create corpuses
        self.corpus1 = Corpus.objects.create(
            title="Legal Corpus",
            description="Legal documents",
            creator=self.user1,
            slug="legal-corpus",
        )
        self.corpus2 = Corpus.objects.create(
            title="Private Corpus",
            description="Private documents",
            creator=self.user2,
            slug="private-corpus",
        )

        # Create documents and add to corpus (returns corpus-isolated copies)
        original_doc1 = Document.objects.create(
            title="Contract Template",
            description="Standard contract",
            creator=self.user1,
            slug="contract-template-orig",  # Original gets different slug
            backend_lock=True,  # Skip signal handlers
        )
        self.doc1, _, _ = self.corpus1.add_document(
            document=original_doc1, user=self.user1
        )
        # Update the corpus copy to have the slug we expect in tests
        self.doc1.slug = "contract-template"
        self.doc1.save(update_fields=["slug"])

        original_doc2 = Document.objects.create(
            title="Private Doc",
            description="Private document",
            creator=self.user2,
            slug="private-doc-orig",  # Original gets different slug
            backend_lock=True,  # Skip signal handlers
        )
        self.doc2, _, _ = self.corpus2.add_document(
            document=original_doc2, user=self.user2
        )
        # Update the corpus copy to have the slug we expect in tests
        self.doc2.slug = "private-doc"
        self.doc2.save(update_fields=["slug"])

        # Create conversation and message
        self.conversation = Conversation.objects.create(
            title="Test Thread", creator=self.user1, conversation_type="THREAD"
        )

        # Set permissions on corpus and corpus copies (not originals)
        set_permissions_for_obj_to_user(
            self.user1, self.corpus1, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )
        set_permissions_for_obj_to_user(
            self.user1, self.doc1, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )
        set_permissions_for_obj_to_user(
            self.user2, self.corpus2, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )
        set_permissions_for_obj_to_user(
            self.user2, self.doc2, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )

        # Create GraphQL client
        self.client = GrapheneClient(schema)

    def test_corpus_mention_parsing(self):
        """Test parsing @corpus:slug mentions."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content="Check out @corpus:legal-corpus for examples",
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    content
                    mentionedResources {
                        type
                        slug
                        title
                        url
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 1)
        self.assertEqual(mentioned[0]["type"], "corpus")
        self.assertEqual(mentioned[0]["slug"], "legal-corpus")
        self.assertEqual(mentioned[0]["title"], "Legal Corpus")
        self.assertIn("/c/user1/legal-corpus", mentioned[0]["url"])

    def test_document_mention_parsing(self):
        """Test parsing @document:slug mentions."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content="Review @document:contract-template before signing",
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    mentionedResources {
                        type
                        slug
                        title
                        url
                        corpus {
                            slug
                            title
                        }
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 1)
        self.assertEqual(mentioned[0]["type"], "document")
        self.assertEqual(mentioned[0]["slug"], "contract-template")
        self.assertEqual(mentioned[0]["title"], "Contract Template")
        # Should include corpus context
        self.assertIsNotNone(mentioned[0]["corpus"])
        self.assertEqual(mentioned[0]["corpus"]["slug"], "legal-corpus")

    def test_corpus_document_mention_parsing(self):
        """Test parsing @corpus:slug/document:slug mentions."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content="See @corpus:legal-corpus/document:contract-template",
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    mentionedResources {
                        type
                        slug
                        url
                        corpus {
                            slug
                            title
                        }
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 1)
        self.assertEqual(mentioned[0]["type"], "document")
        self.assertEqual(mentioned[0]["slug"], "contract-template")
        self.assertIn("/d/user1/legal-corpus/contract-template", mentioned[0]["url"])
        self.assertEqual(mentioned[0]["corpus"]["slug"], "legal-corpus")

    def test_permission_enforcement_corpus(self):
        """Test that mentions to inaccessible corpuses are ignored."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content="Check @corpus:legal-corpus and @corpus:private-corpus",
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    mentionedResources {
                        type
                        slug
                    }
                }
            }
        """

        # User1 should only see legal-corpus, not private-corpus
        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 1)
        self.assertEqual(mentioned[0]["slug"], "legal-corpus")

        # User2 should only see private-corpus
        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user2})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 1)
        self.assertEqual(mentioned[0]["slug"], "private-corpus")

    def test_permission_enforcement_document(self):
        """Test that mentions to inaccessible documents are ignored."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content="Check @document:contract-template and @document:private-doc",
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    mentionedResources {
                        type
                        slug
                    }
                }
            }
        """

        # User1 should only see contract-template
        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 1)
        self.assertEqual(mentioned[0]["slug"], "contract-template")

    def test_multiple_mentions(self):
        """Test parsing multiple mentions in one message."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content=(
                "Compare @corpus:legal-corpus with "
                "@corpus:legal-corpus/document:contract-template "
                "and review @document:contract-template"
            ),
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    mentionedResources {
                        type
                        slug
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        # Should have: corpus, corpus/doc, doc (3 mentions)
        self.assertEqual(len(mentioned), 3)
        types = [m["type"] for m in mentioned]
        self.assertEqual(types.count("corpus"), 1)
        self.assertEqual(types.count("document"), 2)

    def test_no_mentions(self):
        """Test message with no mentions."""
        message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            creator=self.user1,
            content="Just a regular message with no mentions",
        )

        query = """
            query GetMessage($id: ID!) {
                chatMessage(id: $id) {
                    id
                    mentionedResources {
                        type
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"id": to_global_id("MessageType", message.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        mentioned = result["data"]["chatMessage"]["mentionedResources"]
        self.assertEqual(len(mentioned), 0)


class MentionSearchTestCase(TestCase):
    """Test search queries for mention autocomplete."""

    @mock.patch("opencontractserver.documents.signals.calculate_embedding_for_doc_text")
    def setUp(self, mock_embedding_task):
        """Create test users, corpuses, and documents."""
        self.user1 = User.objects.create_user(
            username="user1", password="test", slug="user1"
        )
        self.user2 = User.objects.create_user(
            username="user2", password="test", slug="user2"
        )

        # Create corpuses
        self.corpus1 = Corpus.objects.create(
            title="Legal Contracts", creator=self.user1, slug="legal-contracts"
        )
        self.corpus2 = Corpus.objects.create(
            title="Private Files", creator=self.user2, slug="private-files"
        )

        # Create documents
        self.doc1 = Document.objects.create(
            title="Employment Contract",
            creator=self.user1,
            slug="employment-contract",
            backend_lock=True,  # Skip signal handlers
        )
        self.doc2 = Document.objects.create(
            title="Private Document",
            creator=self.user2,
            slug="private-document",
            backend_lock=True,  # Skip signal handlers
        )

        # Set permissions
        set_permissions_for_obj_to_user(
            self.user1, self.corpus1, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(self.user1, self.doc1, [PermissionTypes.READ])
        set_permissions_for_obj_to_user(
            self.user2, self.corpus2, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(self.user2, self.doc2, [PermissionTypes.READ])

        self.client = GrapheneClient(schema)

    def test_search_corpuses_for_mention(self):
        """Test searching corpuses for mention autocomplete."""
        query = """
            query SearchCorpuses($textSearch: String!) {
                searchCorpusesForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            slug
                            title
                        }
                    }
                }
            }
        """

        # User1 searches for "legal"
        result = self.client.execute(
            query,
            variables={"textSearch": "legal"},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchCorpusesForMention"]["edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["node"]["slug"], "legal-contracts")

        # User1 should NOT see user2's private corpus
        result = self.client.execute(
            query,
            variables={"textSearch": "private"},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchCorpusesForMention"]["edges"]
        self.assertEqual(len(edges), 0)

    def test_search_documents_for_mention(self):
        """Test searching documents for mention autocomplete."""
        query = """
            query SearchDocuments($textSearch: String!) {
                searchDocumentsForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            slug
                            title
                            creator {
                                slug
                            }
                        }
                    }
                }
            }
        """

        # User1 searches for "contract"
        result = self.client.execute(
            query,
            variables={"textSearch": "contract"},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchDocumentsForMention"]["edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["node"]["slug"], "employment-contract")

        # User1 should NOT see user2's private document
        result = self.client.execute(
            query,
            variables={"textSearch": "private"},
            context_value=type("Request", (), {"user": self.user1})(),
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchDocumentsForMention"]["edges"]
        self.assertEqual(len(edges), 0)

    def test_search_empty_query(self):
        """Test search with no query returns user's recent resources."""
        query = """
            query SearchCorpuses {
                searchCorpusesForMention {
                    edges {
                        node {
                            id
                            slug
                        }
                    }
                }
            }
        """

        result = self.client.execute(
            query, context_value=type("Request", (), {"user": self.user1})()
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchCorpusesForMention"]["edges"]
        # Should return user's accessible corpuses (corpus1 + personal corpus)
        self.assertEqual(len(edges), 2)
        slugs = [edge["node"]["slug"] for edge in edges]
        self.assertIn("legal-contracts", slugs)

    def test_search_notes_for_mention(self):
        """Notes search filters by visibility, title, and content."""
        from opencontractserver.annotations.models import Note

        # user1 owns a note on their own document.
        note_visible = Note.objects.create(
            title="Indemnity drafting tips",
            content="Always cap indemnification obligations.",
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        # user2 owns a private note that user1 must not see.
        note_hidden = Note.objects.create(
            title="Private indemnity musings",
            content="user1 should never see this.",
            document=self.doc2,
            corpus=self.corpus2,
            creator=self.user2,
        )

        query = """
            query SearchNotes($textSearch: String!) {
                searchNotesForMention(textSearch: $textSearch) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            variables={"textSearch": "indemnity"},
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchNotesForMention"]["edges"]
        titles = [edge["node"]["title"] for edge in edges]
        self.assertIn(note_visible.title, titles)
        self.assertNotIn(note_hidden.title, titles)

        # Content match also works.
        result = self.client.execute(
            query,
            variables={"textSearch": "cap indemnification"},
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchNotesForMention"]["edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["node"]["title"], note_visible.title)

        # Corpus scoping returns empty when scoped to a corpus the note isn't in.
        scoped_query = """
            query SearchNotes($textSearch: String!, $corpusId: ID!) {
                searchNotesForMention(textSearch: $textSearch, corpusId: $corpusId) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }
        """
        result = self.client.execute(
            scoped_query,
            variables={
                "textSearch": "indemnity",
                "corpusId": to_global_id("CorpusType", self.corpus2.id),
            },
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchNotesForMention"]["edges"]
        self.assertEqual(len(edges), 0)

    def test_search_notes_for_mention_document_scoping(self):
        """`document_id` filter restricts results to a single document."""
        from opencontractserver.annotations.models import Note

        Note.objects.create(
            title="Doc1 indemnity note",
            content="On doc1.",
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        # Add a second note on a *different* document so we can prove the
        # document filter excludes it.
        from django.core.files.base import ContentFile

        from opencontractserver.documents.models import Document

        other_doc = Document.objects.create(
            title="Other Doc",
            description="another doc owned by user1",
            file_type="text/plain",
            creator=self.user1,
            slug="other-doc",
        )
        other_doc.txt_extract_file.save("other.txt", ContentFile(b"x"))
        Note.objects.create(
            title="OtherDoc indemnity note",
            content="On other doc.",
            document=other_doc,
            corpus=self.corpus1,
            creator=self.user1,
        )

        query = """
            query SearchNotes($textSearch: String!, $documentId: ID!) {
                searchNotesForMention(
                    textSearch: $textSearch
                    documentId: $documentId
                ) {
                    edges { node { id title } }
                }
            }
        """
        result = self.client.execute(
            query,
            variables={
                "textSearch": "indemnity",
                "documentId": to_global_id("DocumentType", self.doc1.id),
            },
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        titles = [
            e["node"]["title"] for e in result["data"]["searchNotesForMention"]["edges"]
        ]
        self.assertIn("Doc1 indemnity note", titles)
        self.assertNotIn("OtherDoc indemnity note", titles)

    def test_search_notes_for_mention_anonymous_visibility(self):
        """Anonymous users only see notes whose document/corpus/note are public."""
        from django.contrib.auth.models import AnonymousUser

        from opencontractserver.annotations.models import Note

        # A private note (default) — should NOT surface for anonymous users.
        Note.objects.create(
            title="Anonymous-blocked indemnity note",
            content="private content",
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        query = """
            query SearchNotes($textSearch: String!) {
                searchNotesForMention(textSearch: $textSearch) {
                    edges { node { id title } }
                }
            }
        """
        result = self.client.execute(
            query,
            variables={"textSearch": "indemnity"},
            context_value=type("Request", (), {"user": AnonymousUser()})(),
        )
        self.assertIsNone(result.get("errors"))
        titles = [
            e["node"]["title"] for e in result["data"]["searchNotesForMention"]["edges"]
        ]
        self.assertNotIn("Anonymous-blocked indemnity note", titles)

    def test_search_notes_for_mention_rejects_wrong_type_global_id(self):
        """Passing a Document global ID as `corpusId` returns an empty queryset
        rather than silently filtering on a non-existent FK."""
        from opencontractserver.annotations.models import Note

        Note.objects.create(
            title="Visible indemnity note",
            content="should not surface when corpusId is wrong type",
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        query = """
            query SearchNotes($textSearch: String!, $corpusId: ID!) {
                searchNotesForMention(textSearch: $textSearch, corpusId: $corpusId) {
                    edges { node { id title } }
                }
            }
        """
        # Pass a DocumentType ID where a CorpusType ID is expected.
        result = self.client.execute(
            query,
            variables={
                "textSearch": "indemnity",
                "corpusId": to_global_id("DocumentType", self.doc1.id),
            },
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchNotesForMention"]["edges"]
        self.assertEqual(len(edges), 0)

    def test_search_notes_for_mention_orders_by_modified_desc(self):
        """Results are returned newest-modified first.

        Guards against an accidental drop of the resolver's
        ``order_by("-modified")`` clause; the page relies on this
        ordering so the most recent activity surfaces at the top.
        """
        from opencontractserver.annotations.models import Note

        older = Note.objects.create(
            title="Older indemnity note",
            content="older",
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )
        newer = Note.objects.create(
            title="Newer indemnity note",
            content="newer",
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        # Force a deterministic gap between the two `modified` timestamps so
        # the assertion does not depend on per-row creation timing.
        Note.objects.filter(pk=older.pk).update(
            modified=timezone.now() - datetime.timedelta(hours=1)
        )

        query = """
            query SearchNotes($textSearch: String!) {
                searchNotesForMention(textSearch: $textSearch) {
                    edges { node { id title } }
                }
            }
        """
        result = self.client.execute(
            query,
            variables={"textSearch": "indemnity"},
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        titles = [
            e["node"]["title"] for e in result["data"]["searchNotesForMention"]["edges"]
        ]
        self.assertEqual(
            titles.index(newer.title),
            0,
            "newest-modified note should be first",
        )
        self.assertLess(
            titles.index(newer.title),
            titles.index(older.title),
            "newer note should sort before older note",
        )

    def test_search_notes_content_preview_truncates_at_400_chars(self):
        """`contentPreview` ships at most 400 characters of the note body.

        Exercises the DB-annotated `Left('content', 400)` path used by the
        resolver. A note with content longer than 400 chars must surface a
        preview clipped to that bound (catches accidental drops of the
        ``annotate(content_preview=...)`` clause).
        """
        from opencontractserver.annotations.models import Note

        body = "x" * 500
        Note.objects.create(
            title="Long indemnity note",
            content=body,
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        query = """
            query SearchNotes($textSearch: String!) {
                searchNotesForMention(textSearch: $textSearch) {
                    edges { node { id title contentPreview } }
                }
            }
        """
        result = self.client.execute(
            query,
            variables={"textSearch": "indemnity"},
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        edges = result["data"]["searchNotesForMention"]["edges"]
        long_edges = [e for e in edges if e["node"]["title"] == "Long indemnity note"]
        self.assertEqual(len(long_edges), 1)
        preview = long_edges[0]["node"]["contentPreview"]
        self.assertEqual(len(preview), 400)
        self.assertTrue(preview.startswith("xxxx"))

    def test_note_content_preview_python_fallback(self):
        """Python fallback path on ``NoteType.resolve_content_preview``.

        When a note is fetched without the ``content_preview`` annotation
        (e.g. via the per-id ``note`` query) the resolver must still slice
        the in-memory ``content`` to 400 chars rather than shipping the
        full body or raising.
        """
        from opencontractserver.annotations.models import Note

        body = "y" * 600
        note = Note.objects.create(
            title="Plain fallback note",
            content=body,
            document=self.doc1,
            corpus=self.corpus1,
            creator=self.user1,
        )

        query = """
            query GetNote($id: ID!) {
                note(id: $id) { id title contentPreview }
            }
        """
        result = self.client.execute(
            query,
            variables={"id": to_global_id("NoteType", note.id)},
            context_value=type("Request", (), {"user": self.user1})(),
        )
        self.assertIsNone(result.get("errors"))
        preview = result["data"]["note"]["contentPreview"]
        self.assertEqual(len(preview), 400)
        self.assertTrue(preview.startswith("yyyy"))
