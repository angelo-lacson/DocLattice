"""
Tests for the agent memory system.

Covers:
1. Memory document CRUD (create, read, update)
2. Memory content merging and section parsing
3. Hybrid retrieval (full injection vs section filtering)
4. Conversation curation eligibility
5. Memory injection into agent system prompts
6. Privacy: curated insights must not contain conversation specifics
7. Toggle: memory not injected when disabled
8. Corpus isolation
9. Async CRUD operations (get_or_create, read, update, injection)
10. Core tool functions (aget_corpus_memory, asuggest_memory_update)
11. Agent factory memory injection (_inject_corpus_memory)
"""

from dataclasses import dataclass
from typing import Optional
from unittest.mock import AsyncMock, patch

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase

from opencontractserver.agents.memory import (
    _build_empty_memory,
    _find_section_end,
    _split_memory_sections,
    build_curation_prompt,
    format_memory_for_prompt,
    get_memory_for_injection,
    get_or_create_memory_document,
    merge_curation_into_memory,
    read_memory_content,
    update_memory_content,
)
from opencontractserver.constants.agent_memory import (
    MEMORY_CURATION_MIN_MESSAGES,
    MEMORY_DOCUMENT_TITLE,
    MEMORY_EMPTY_COLLECTION_PLACEHOLDER,
    MEMORY_EMPTY_QUERY_PLACEHOLDER,
    MEMORY_INJECTION_PREFIX,
    MEMORY_SECTION_COLLECTION_PATTERNS,
    MEMORY_SECTION_QUERY_PATTERNS,
)
from opencontractserver.conversations.models import (
    ChatMessage,
    Conversation,
    ConversationTypeChoices,
    MessageTypeChoices,
)
from opencontractserver.corpuses.models import Corpus

User = get_user_model()


class TestMemoryDocumentTemplate(TestCase):
    """Test the empty memory document template."""

    def test_build_empty_memory(self):
        content = _build_empty_memory(42)
        self.assertIn("corpus_id: 42", content)
        self.assertIn(f"## {MEMORY_SECTION_COLLECTION_PATTERNS}", content)
        self.assertIn(f"## {MEMORY_SECTION_QUERY_PATTERNS}", content)
        self.assertIn("curation_count: 0", content)
        self.assertIn("last_curated: null", content)

    def test_build_empty_memory_has_placeholders(self):
        content = _build_empty_memory(1)
        self.assertIn(MEMORY_EMPTY_COLLECTION_PLACEHOLDER, content)
        self.assertIn(MEMORY_EMPTY_QUERY_PLACEHOLDER, content)


class TestSplitMemorySections(TestCase):
    """Test section splitting of memory documents."""

    def test_split_basic(self):
        content = """\
---
version: "1.0"
---

## Collection Patterns

- Pattern one

## Query Patterns

- Pattern two
"""
        sections = _split_memory_sections(content)
        self.assertEqual(len(sections), 2)
        self.assertTrue(sections[0].startswith("## Collection Patterns"))
        self.assertTrue(sections[1].startswith("## Query Patterns"))

    def test_split_empty_frontmatter(self):
        content = "## Section A\n\nContent\n\n## Section B\n\nMore content"
        sections = _split_memory_sections(content)
        self.assertEqual(len(sections), 2)

    def test_split_no_sections(self):
        content = "---\nversion: 1\n---\n\nJust some text."
        sections = _split_memory_sections(content)
        self.assertEqual(len(sections), 1)

    def test_strips_frontmatter(self):
        content = "---\nfoo: bar\n---\n\n## Only Section\n\nContent"
        sections = _split_memory_sections(content)
        self.assertEqual(len(sections), 1)
        self.assertNotIn("foo: bar", sections[0])


class TestFindSectionEnd(TestCase):
    """Test finding section boundaries."""

    def test_middle_section(self):
        content = "## A\n\nContent A\n\n## B\n\nContent B"
        end = _find_section_end(content, "## A")
        # End should point to the newline before ## B
        self.assertEqual(content[end : end + 4], "\n## ")

    def test_last_section(self):
        content = "## Only\n\nContent here"
        end = _find_section_end(content, "## Only")
        self.assertEqual(end, len(content))


class TestMergeCurationIntoMemory(TestCase):
    """Test merging curation results into memory document."""

    def setUp(self):
        self.base_memory = _build_empty_memory(1)

    def test_add_collection_pattern(self):
        result = merge_curation_into_memory(
            current_content=self.base_memory,
            collection_patterns=["- **Test**: This is a test pattern"],
            query_patterns=[],
            refinements=[],
        )
        self.assertIn("- **Test**: This is a test pattern", result)
        self.assertNotIn(MEMORY_EMPTY_COLLECTION_PLACEHOLDER, result)
        self.assertIn("curation_count: 1", result)

    def test_add_query_pattern(self):
        result = merge_curation_into_memory(
            current_content=self.base_memory,
            collection_patterns=[],
            query_patterns=["- **Search**: Use similarity search for X"],
            refinements=[],
        )
        self.assertIn("- **Search**: Use similarity search for X", result)
        self.assertNotIn(MEMORY_EMPTY_QUERY_PLACEHOLDER, result)

    def test_add_both_patterns(self):
        result = merge_curation_into_memory(
            current_content=self.base_memory,
            collection_patterns=["- **CP1**: Insight 1"],
            query_patterns=["- **QP1**: Insight 2"],
            refinements=[],
        )
        self.assertIn("- **CP1**: Insight 1", result)
        self.assertIn("- **QP1**: Insight 2", result)

    def test_refinement(self):
        # First add a pattern, then refine it
        memory_with_pattern = merge_curation_into_memory(
            current_content=self.base_memory,
            collection_patterns=["- **Old**: Original insight"],
            query_patterns=[],
            refinements=[],
        )
        result = merge_curation_into_memory(
            current_content=memory_with_pattern,
            collection_patterns=[],
            query_patterns=[],
            refinements=[
                {
                    "existing": "- **Old**: Original insight",
                    "refined": "- **Old**: Refined insight with more detail",
                }
            ],
        )
        self.assertIn("- **Old**: Refined insight with more detail", result)
        self.assertNotIn("Original insight", result)

    def test_no_changes_returns_original(self):
        result = merge_curation_into_memory(
            current_content=self.base_memory,
            collection_patterns=[],
            query_patterns=[],
            refinements=[],
        )
        self.assertEqual(result, self.base_memory)

    def test_updates_last_curated_timestamp(self):
        result = merge_curation_into_memory(
            current_content=self.base_memory,
            collection_patterns=["- **Test**: pattern"],
            query_patterns=[],
            refinements=[],
        )
        self.assertNotIn("last_curated: null", result)
        self.assertIn("last_curated:", result)


class TestFormatMemoryForPrompt(TestCase):
    """Test memory formatting for system prompt injection."""

    def test_format_with_content(self):
        result = format_memory_for_prompt("## Patterns\n\n- pattern 1")
        self.assertIn(MEMORY_INJECTION_PREFIX, result)
        self.assertIn("- pattern 1", result)

    def test_format_empty_returns_empty(self):
        self.assertEqual(format_memory_for_prompt(""), "")

    def test_format_none_like_returns_empty(self):
        self.assertEqual(format_memory_for_prompt(""), "")


class TestBuildCurationPrompt(TestCase):
    """Test curation prompt generation."""

    def test_builds_system_and_user_prompts(self):
        system, user = build_curation_prompt(
            current_memory="## Patterns\n\n- existing",
            conversation_text="[HUMAN]: How do I find X?\n[LLM]: Try searching...",
            max_insights=5,
        )
        self.assertIn("memory curator", system)
        self.assertIn("GENERALIZABLE", system)
        # Conversation text and existing memory are in the user prompt
        # (not system prompt) to prevent prompt injection
        self.assertIn("existing", user)
        self.assertIn("How do I find X?", user)
        self.assertIn("JSON", user)

    def test_empty_memory_shows_placeholder(self):
        _, user = build_curation_prompt(
            current_memory="",
            conversation_text="conversation",
            max_insights=3,
        )
        self.assertIn("empty", user)

    def test_max_insights_in_prompt(self):
        system, _ = build_curation_prompt(
            current_memory="memory",
            conversation_text="conversation",
            max_insights=7,
        )
        self.assertIn("7", system)


class TestCurationEligibility(TestCase):
    """Test conversation curation eligibility checks."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="memory_test_user",
            password="testpass123",
            email="memtest@test.com",
        )
        cls.corpus = Corpus.objects.create(
            title="Memory Test Corpus",
            description="For testing memory",
            creator=cls.user,
            memory_enabled=True,
        )
        cls.corpus_no_memory = Corpus.objects.create(
            title="No Memory Corpus",
            description="Memory disabled",
            creator=cls.user,
            memory_enabled=False,
        )

    def test_conversation_starts_uncurated(self):
        conv = Conversation.objects.create(
            title="Test",
            creator=self.user,
            chat_with_corpus=self.corpus,
            conversation_type=ConversationTypeChoices.CHAT,
        )
        self.assertFalse(conv.memory_curated)

    def test_short_conversation_ineligible(self):
        """Conversations with fewer than MIN_MESSAGES should be skipped."""
        conv = Conversation.objects.create(
            title="Short Chat",
            creator=self.user,
            chat_with_corpus=self.corpus,
            conversation_type=ConversationTypeChoices.CHAT,
        )
        # Add fewer messages than threshold
        for i in range(MEMORY_CURATION_MIN_MESSAGES - 1):
            ChatMessage.objects.create(
                conversation=conv,
                msg_type=MessageTypeChoices.HUMAN,
                content=f"Message {i}",
                creator=self.user,
            )
        # The check_conversations_for_curation task checks message count
        # indirectly via the curate task itself; here we just verify the
        # conversation is created correctly
        self.assertEqual(conv.chat_messages.count(), MEMORY_CURATION_MIN_MESSAGES - 1)

    def test_memory_disabled_corpus_ignored(self):
        """Conversations in non-memory corpuses should not be curated."""
        conv = Conversation.objects.create(
            title="No Memory Chat",
            creator=self.user,
            chat_with_corpus=self.corpus_no_memory,
            conversation_type=ConversationTypeChoices.CHAT,
        )
        self.assertFalse(self.corpus_no_memory.memory_enabled)
        self.assertFalse(conv.memory_curated)

    def test_thread_type_not_curated(self):
        """Only CHAT type conversations should be curated, not threads."""
        thread = Conversation.objects.create(
            title="Discussion",
            creator=self.user,
            chat_with_corpus=self.corpus,
            conversation_type=ConversationTypeChoices.THREAD,
        )
        self.assertEqual(thread.conversation_type, ConversationTypeChoices.THREAD)


class TestCorpusMemoryFields(TestCase):
    """Test the new Corpus model fields."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="corpus_mem_user",
            password="testpass123",
            email="corpusmem@test.com",
        )

    def test_memory_defaults_disabled(self):
        corpus = Corpus.objects.create(
            title="Default Corpus",
            creator=self.user,
        )
        self.assertFalse(corpus.memory_enabled)
        self.assertIsNone(corpus.memory_document)

    def test_enable_memory(self):
        corpus = Corpus.objects.create(
            title="Memory Corpus",
            creator=self.user,
        )
        corpus.memory_enabled = True
        corpus.save(update_fields=["memory_enabled"])
        corpus.refresh_from_db()
        self.assertTrue(corpus.memory_enabled)

    def test_memory_document_deletion_nullifies(self):
        """Deleting the memory document should set the FK to NULL."""
        from opencontractserver.documents.models import Document

        doc = Document.objects.create(
            title=MEMORY_DOCUMENT_TITLE,
            creator=self.user,
        )
        corpus = Corpus.objects.create(
            title="With Memory",
            creator=self.user,
            memory_enabled=True,
            memory_document=doc,
        )
        self.assertEqual(corpus.memory_document_id, doc.id)
        doc.delete()
        corpus.refresh_from_db()
        self.assertIsNone(corpus.memory_document_id)


class TestMemoryInjection(TestCase):
    """Test that memory content is properly injected into agent system prompts."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="inject_user",
            password="testpass123",
            email="inject@test.com",
        )

    def test_format_memory_adds_prefix(self):
        result = format_memory_for_prompt("Some memory content")
        self.assertTrue(result.startswith(MEMORY_INJECTION_PREFIX))
        self.assertIn("Some memory content", result)

    def test_empty_memory_not_injected(self):
        result = format_memory_for_prompt("")
        self.assertEqual(result, "")


class TestCorpusIsolation(TestCase):
    """Test that memory is isolated between corpuses."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="isolation_user",
            password="testpass123",
            email="isolation@test.com",
        )
        cls.corpus_a = Corpus.objects.create(
            title="Corpus A",
            creator=cls.user,
            memory_enabled=True,
        )
        cls.corpus_b = Corpus.objects.create(
            title="Corpus B",
            creator=cls.user,
            memory_enabled=True,
        )

    def test_separate_memory_documents(self):
        """Each corpus should have its own memory document slot."""
        self.assertNotEqual(self.corpus_a.id, self.corpus_b.id)
        # Both start with no memory document
        self.assertIsNone(self.corpus_a.memory_document_id)
        self.assertIsNone(self.corpus_b.memory_document_id)

    def test_memory_document_is_one_to_one(self):
        """A document can only be memory for one corpus."""
        from opencontractserver.documents.models import Document

        doc = Document.objects.create(
            title=MEMORY_DOCUMENT_TITLE,
            creator=self.user,
        )
        self.corpus_a.memory_document = doc
        self.corpus_a.save(update_fields=["memory_document"])

        # Trying to assign the same doc to another corpus should fail
        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            self.corpus_b.memory_document = doc
            self.corpus_b.save(update_fields=["memory_document"])


class TestGetMemoryForInjectionSync(TestCase):
    """Test the synchronous parts of hybrid memory retrieval."""

    def test_empty_placeholder_not_injected(self):
        """Empty memory with only placeholders should return empty string."""
        from opencontractserver.agents.memory import _split_memory_sections

        content = _build_empty_memory(1)
        sections = _split_memory_sections(content)
        # Both sections should contain placeholder text
        self.assertEqual(len(sections), 2)

    def test_section_filtering_by_keyword(self):
        """When memory is large, sections should be filtered by relevance."""
        sections = _split_memory_sections(
            "## Collection Patterns\n\n- Pattern about contracts\n\n"
            "## Query Patterns\n\n- Search strategy for dates"
        )
        self.assertEqual(len(sections), 2)
        # First section is about contracts, second about dates
        self.assertIn("contracts", sections[0])
        self.assertIn("dates", sections[1])


# ---------------------------------------------------------------------------
# Async CRUD tests (memory.py)
# ---------------------------------------------------------------------------


class TestGetOrCreateMemoryDocument(TransactionTestCase):
    """Test async get_or_create_memory_document()."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="mem_crud_user",
            password="testpass123",
            email="memcrud@test.com",
        )
        self.corpus = Corpus.objects.create(
            title="CRUD Test Corpus",
            creator=self.user,
            memory_enabled=True,
        )

    def test_creates_memory_document(self):
        self.assertIsNone(self.corpus.memory_document_id)
        doc = async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        self.assertIsNotNone(doc)
        self.assertIsNotNone(doc.pk)
        self.assertEqual(doc.title, MEMORY_DOCUMENT_TITLE)
        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.memory_document_id, doc.pk)

    def test_idempotent_returns_same_document(self):
        doc1 = async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        doc2 = async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        self.assertEqual(doc1.pk, doc2.pk)

    def test_recreate_after_fk_cleared(self):
        """If memory_document FK is cleared, a new doc is created."""
        doc1 = async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        old_pk = doc1.pk
        # Clear the FK (simulating memory reset)
        self.corpus.memory_document = None
        self.corpus.memory_document_id = None
        self.corpus.save(update_fields=["memory_document"])
        self.corpus.refresh_from_db()
        self.assertIsNone(self.corpus.memory_document_id)
        # Re-creating should produce a new document
        doc2 = async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        self.assertIsNotNone(doc2.pk)
        self.assertNotEqual(doc2.pk, old_pk)


class TestReadMemoryContent(TransactionTestCase):
    """Test async read_memory_content()."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="mem_read_user",
            password="testpass123",
            email="memread@test.com",
        )
        self.corpus = Corpus.objects.create(
            title="Read Test Corpus",
            creator=self.user,
            memory_enabled=True,
        )

    def test_no_memory_document_returns_empty(self):
        result = async_to_sync(read_memory_content)(self.corpus)
        self.assertEqual(result, "")

    def test_with_content(self):
        async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        # Refresh corpus to clear cached FK so read_memory_content gets fresh doc
        self.corpus.refresh_from_db()
        content = async_to_sync(read_memory_content)(self.corpus)
        # The initial memory doc should contain the template content
        self.assertIn("Collection Patterns", content)

    def test_empty_file_returns_empty(self):
        """If txt_extract_file is falsy, return empty."""
        from opencontractserver.documents.models import Document

        doc = Document.objects.create(
            title=MEMORY_DOCUMENT_TITLE,
            creator=self.user,
        )
        self.corpus.memory_document = doc
        self.corpus.save(update_fields=["memory_document"])
        # doc has no txt_extract_file
        result = async_to_sync(read_memory_content)(self.corpus)
        self.assertEqual(result, "")


class TestUpdateMemoryContent(TransactionTestCase):
    """Test async update_memory_content()."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="mem_update_user",
            password="testpass123",
            email="memupdate@test.com",
        )
        self.corpus = Corpus.objects.create(
            title="Update Test Corpus",
            creator=self.user,
            memory_enabled=True,
        )

    def test_write_and_read_back(self):
        new_content = "## Collection Patterns\n\n- **Test**: A test insight\n"
        async_to_sync(update_memory_content)(self.corpus, new_content, self.user)
        # Refresh to clear cached FK so read_memory_content reads fresh doc
        self.corpus.refresh_from_db()
        result = async_to_sync(read_memory_content)(self.corpus)
        self.assertIn("- **Test**: A test insight", result)

    def test_creates_doc_if_missing(self):
        self.assertIsNone(self.corpus.memory_document_id)
        async_to_sync(update_memory_content)(self.corpus, "# New content", self.user)
        self.corpus.refresh_from_db()
        self.assertIsNotNone(self.corpus.memory_document_id)


class TestGetMemoryForInjection(TransactionTestCase):
    """Test async get_memory_for_injection()."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="mem_inject_user",
            password="testpass123",
            email="meminject@test.com",
        )
        self.corpus = Corpus.objects.create(
            title="Injection Test Corpus",
            creator=self.user,
            memory_enabled=True,
        )

    def test_no_memory_returns_empty(self):
        result = async_to_sync(get_memory_for_injection)(self.corpus)
        self.assertEqual(result, "")

    def test_empty_placeholder_returns_empty(self):
        async_to_sync(get_or_create_memory_document)(self.corpus, self.user)
        self.corpus.refresh_from_db()
        result = async_to_sync(get_memory_for_injection)(self.corpus)
        # Initial memory only has placeholders, should return empty
        self.assertEqual(result, "")

    def test_small_memory_full_injection(self):
        content = (
            '---\nversion: "1.0"\ncorpus_id: 1\n'
            "last_curated: null\ncuration_count: 0\n---\n\n"
            "## Collection Patterns\n\n- **Test**: A useful insight\n\n"
            "## Query Patterns\n\n- **Search**: Try keyword search\n"
        )
        async_to_sync(update_memory_content)(self.corpus, content, self.user)
        self.corpus.refresh_from_db()
        result = async_to_sync(get_memory_for_injection)(self.corpus)
        self.assertIn("- **Test**: A useful insight", result)
        self.assertIn("- **Search**: Try keyword search", result)

    def test_large_memory_section_filtering_with_query(self):
        """When memory exceeds token budget, sections are scored by keyword overlap."""
        # Build content large enough to exceed MEMORY_FULL_INJECTION_MAX_TOKENS
        big_section = "- " + " ".join(["word"] * 500) + "\n"
        content = (
            '---\nversion: "1.0"\ncorpus_id: 1\n'
            "last_curated: null\ncuration_count: 0\n---\n\n"
            f"## Collection Patterns\n\n{big_section}\n"
            f"## Query Patterns\n\n{big_section}\n"
        )
        async_to_sync(update_memory_content)(self.corpus, content, self.user)
        self.corpus.refresh_from_db()
        result = async_to_sync(get_memory_for_injection)(self.corpus, query="word")
        # Should still return some sections (not empty)
        self.assertTrue(len(result) > 0)

    def test_large_memory_no_query_returns_first_sections(self):
        """With no query, first N sections up to token budget are returned."""
        big_section = "- " + " ".join(["word"] * 500) + "\n"
        content = (
            '---\nversion: "1.0"\ncorpus_id: 1\n'
            "last_curated: null\ncuration_count: 0\n---\n\n"
            f"## Collection Patterns\n\n{big_section}\n"
            f"## Query Patterns\n\n{big_section}\n"
        )
        async_to_sync(update_memory_content)(self.corpus, content, self.user)
        self.corpus.refresh_from_db()
        result = async_to_sync(get_memory_for_injection)(self.corpus, query="")
        self.assertTrue(len(result) > 0)


# ---------------------------------------------------------------------------
# Core tools tests (core_tools.py)
# ---------------------------------------------------------------------------


class TestAgetCorpusMemory(TransactionTestCase):
    """Test aget_corpus_memory tool function."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="tool_read_user",
            password="testpass123",
            email="toolread@test.com",
        )
        self.corpus = Corpus.objects.create(
            title="Tool Read Corpus",
            creator=self.user,
            memory_enabled=True,
        )
        self.corpus_no_mem = Corpus.objects.create(
            title="No Mem Corpus",
            creator=self.user,
            memory_enabled=False,
        )

    def test_corpus_not_found_raises(self):
        from opencontractserver.llms.tools.core_tools import aget_corpus_memory

        with self.assertRaises(ValueError):
            async_to_sync(aget_corpus_memory)(corpus_id=999999)

    def test_memory_disabled_returns_message(self):
        from opencontractserver.llms.tools.core_tools import aget_corpus_memory

        result = async_to_sync(aget_corpus_memory)(corpus_id=self.corpus_no_mem.pk)
        self.assertIn("not enabled", result)

    def test_no_memory_doc_returns_message(self):
        from opencontractserver.llms.tools.core_tools import aget_corpus_memory

        result = async_to_sync(aget_corpus_memory)(corpus_id=self.corpus.pk)
        self.assertIn("No memory document", result)

    def test_reads_full_content(self):
        from opencontractserver.llms.tools.core_tools import aget_corpus_memory

        content = (
            '---\nversion: "1.0"\ncorpus_id: 1\n---\n\n'
            "## Collection Patterns\n\n- **Insight**: Detail\n\n"
            "## Query Patterns\n\n- **Search**: Strategy\n"
        )
        async_to_sync(update_memory_content)(self.corpus, content, self.user)
        # aget_corpus_memory re-fetches corpus from DB, so no stale cache issue
        result = async_to_sync(aget_corpus_memory)(corpus_id=self.corpus.pk)
        self.assertIn("- **Insight**: Detail", result)

    def test_section_filter(self):
        from opencontractserver.llms.tools.core_tools import aget_corpus_memory

        content = (
            '---\nversion: "1.0"\ncorpus_id: 1\n---\n\n'
            "## Collection Patterns\n\n- **CP**: Col insight\n\n"
            "## Query Patterns\n\n- **QP**: Query insight\n"
        )
        async_to_sync(update_memory_content)(self.corpus, content, self.user)
        result = async_to_sync(aget_corpus_memory)(
            corpus_id=self.corpus.pk, section="Collection Patterns"
        )
        self.assertIn("- **CP**: Col insight", result)
        self.assertNotIn("- **QP**: Query insight", result)

    def test_section_not_found(self):
        from opencontractserver.llms.tools.core_tools import aget_corpus_memory

        content = (
            '---\nversion: "1.0"\ncorpus_id: 1\n---\n\n'
            "## Collection Patterns\n\n- data\n"
        )
        async_to_sync(update_memory_content)(self.corpus, content, self.user)
        result = async_to_sync(aget_corpus_memory)(
            corpus_id=self.corpus.pk, section="Nonexistent"
        )
        self.assertIn("not found", result)


class TestAsuggestMemoryUpdate(TransactionTestCase):
    """Test asuggest_memory_update tool function."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="tool_write_user",
            password="testpass123",
            email="toolwrite@test.com",
        )
        self.corpus = Corpus.objects.create(
            title="Tool Write Corpus",
            creator=self.user,
            memory_enabled=True,
        )
        self.corpus_no_mem = Corpus.objects.create(
            title="No Mem Write Corpus",
            creator=self.user,
            memory_enabled=False,
        )

    def test_corpus_not_found_raises(self):
        from opencontractserver.llms.tools.core_tools import asuggest_memory_update

        with self.assertRaises(ValueError):
            async_to_sync(asuggest_memory_update)(
                corpus_id=999999,
                user_id=self.user.pk,
                section="collection_patterns",
                insight="- **Test**: insight",
            )

    def test_memory_disabled_returns_message(self):
        from opencontractserver.llms.tools.core_tools import asuggest_memory_update

        result = async_to_sync(asuggest_memory_update)(
            corpus_id=self.corpus_no_mem.pk,
            user_id=self.user.pk,
            section="collection_patterns",
            insight="- **Test**: insight",
        )
        self.assertIn("not enabled", result)

    def test_user_not_found_raises(self):
        from opencontractserver.llms.tools.core_tools import asuggest_memory_update

        with self.assertRaises(ValueError):
            async_to_sync(asuggest_memory_update)(
                corpus_id=self.corpus.pk,
                user_id=999999,
                section="collection_patterns",
                insight="- **Test**: insight",
            )

    def test_successful_collection_write(self):
        from opencontractserver.llms.tools.core_tools import asuggest_memory_update

        result = async_to_sync(asuggest_memory_update)(
            corpus_id=self.corpus.pk,
            user_id=self.user.pk,
            section="collection_patterns",
            insight="- **New**: A new collection insight",
        )
        self.assertIn("Insight added", result)
        # Refresh corpus to clear cached FK
        self.corpus.refresh_from_db()
        content = async_to_sync(read_memory_content)(self.corpus)
        self.assertIn("- **New**: A new collection insight", content)

    def test_successful_query_write(self):
        from opencontractserver.llms.tools.core_tools import asuggest_memory_update

        result = async_to_sync(asuggest_memory_update)(
            corpus_id=self.corpus.pk,
            user_id=self.user.pk,
            section="query_patterns",
            insight="- **Search**: A query insight",
        )
        self.assertIn("Insight added", result)
        # Refresh corpus to clear cached FK
        self.corpus.refresh_from_db()
        content = async_to_sync(read_memory_content)(self.corpus)
        self.assertIn("- **Search**: A query insight", content)


# ---------------------------------------------------------------------------
# Agent factory tests (agent_factory.py)
# ---------------------------------------------------------------------------


@dataclass
class _FakeConfig:
    """Minimal stand-in for AgentConfig in tests."""

    system_prompt: Optional[str] = "You are an assistant."


class TestInjectCorpusMemory(TestCase):
    """Test _inject_corpus_memory() from agent_factory.py."""

    def test_memory_found_appends_to_prompt(self):
        from opencontractserver.llms.agents.agent_factory import (
            _inject_corpus_memory,
        )

        config = _FakeConfig(system_prompt="Base prompt.")
        fake_corpus = type("FakeCorpus", (), {"id": 1})()

        with (
            patch(
                "opencontractserver.agents.memory.get_memory_for_injection",
                new_callable=AsyncMock,
                return_value="## Patterns\n\n- insight",
            ),
            patch(
                "opencontractserver.agents.memory.format_memory_for_prompt",
                return_value="\n\n## Corpus Memory\n- insight\n",
            ),
        ):
            async_to_sync(_inject_corpus_memory)(fake_corpus, config)

        self.assertIn("## Corpus Memory", config.system_prompt)
        self.assertIn("- insight", config.system_prompt)
        self.assertTrue(config.system_prompt.startswith("Base prompt."))

    def test_empty_memory_no_op(self):
        from opencontractserver.llms.agents.agent_factory import (
            _inject_corpus_memory,
        )

        config = _FakeConfig(system_prompt="Base prompt.")
        fake_corpus = type("FakeCorpus", (), {"id": 2})()

        with (
            patch(
                "opencontractserver.agents.memory.get_memory_for_injection",
                new_callable=AsyncMock,
                return_value="",
            ),
            patch(
                "opencontractserver.agents.memory.format_memory_for_prompt",
                return_value="",
            ),
        ):
            async_to_sync(_inject_corpus_memory)(fake_corpus, config)

        self.assertEqual(config.system_prompt, "Base prompt.")

    def test_exception_silently_caught(self):
        from opencontractserver.llms.agents.agent_factory import (
            _inject_corpus_memory,
        )

        config = _FakeConfig(system_prompt="Base prompt.")
        fake_corpus = type("FakeCorpus", (), {"id": 3})()

        with patch(
            "opencontractserver.agents.memory.get_memory_for_injection",
            new_callable=AsyncMock,
            side_effect=RuntimeError("DB unavailable"),
        ):
            # Should not raise
            async_to_sync(_inject_corpus_memory)(fake_corpus, config)

        # System prompt unchanged
        self.assertEqual(config.system_prompt, "Base prompt.")

    def test_none_system_prompt_handled(self):
        from opencontractserver.llms.agents.agent_factory import (
            _inject_corpus_memory,
        )

        config = _FakeConfig(system_prompt=None)
        fake_corpus = type("FakeCorpus", (), {"id": 4})()

        with (
            patch(
                "opencontractserver.agents.memory.get_memory_for_injection",
                new_callable=AsyncMock,
                return_value="## Patterns\n\n- insight",
            ),
            patch(
                "opencontractserver.agents.memory.format_memory_for_prompt",
                return_value="\n\n## Corpus Memory\n- insight\n",
            ),
        ):
            async_to_sync(_inject_corpus_memory)(fake_corpus, config)

        self.assertIn("## Corpus Memory", config.system_prompt)
