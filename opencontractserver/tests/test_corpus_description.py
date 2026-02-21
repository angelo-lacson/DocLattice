"""
Tests for Corpus._markdown_to_plain_text and update_description sync behaviour.

Validates that:
- _markdown_to_plain_text strips common markdown syntax correctly.
- update_description() keeps the plain-text ``description`` field in sync
  with the versioned ``md_description`` content.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus

User = get_user_model()


class MarkdownToPlainTextTest(TestCase):
    """Unit tests for Corpus._markdown_to_plain_text static method."""

    def test_strips_headings(self):
        result = Corpus._markdown_to_plain_text("# Title\n\nSome text")
        self.assertEqual(result, "Title\n\nSome text")

    def test_strips_multiple_heading_levels(self):
        md = "## H2\n### H3\n#### H4"
        result = Corpus._markdown_to_plain_text(md)
        self.assertEqual(result, "H2\nH3\nH4")

    def test_strips_bold_and_italic(self):
        result = Corpus._markdown_to_plain_text("Some **bold** and *italic* text")
        self.assertEqual(result, "Some bold and italic text")

    def test_strips_underscore_bold_italic(self):
        result = Corpus._markdown_to_plain_text("__bold__ and _italic_")
        self.assertEqual(result, "bold and italic")

    def test_strips_multiline_bold(self):
        md = "Start **bold\nacross lines** end"
        result = Corpus._markdown_to_plain_text(md)
        self.assertEqual(result, "Start bold\nacross lines end")

    def test_strips_strikethrough(self):
        result = Corpus._markdown_to_plain_text("some ~~deleted~~ text")
        self.assertEqual(result, "some deleted text")

    def test_strips_links(self):
        result = Corpus._markdown_to_plain_text("Click [here](https://example.com) now")
        self.assertEqual(result, "Click here now")

    def test_strips_images(self):
        result = Corpus._markdown_to_plain_text("![alt text](image.png)")
        self.assertEqual(result, "alt text")

    def test_strips_inline_code(self):
        result = Corpus._markdown_to_plain_text("Run `pip install` now")
        self.assertEqual(result, "Run pip install now")

    def test_strips_fenced_code_blocks(self):
        md = "Before\n```python\nprint('hello')\n```\nAfter"
        result = Corpus._markdown_to_plain_text(md)
        self.assertIn("print('hello')", result)
        self.assertNotIn("```", result)

    def test_strips_html_tags(self):
        result = Corpus._markdown_to_plain_text("Text <em>emphasis</em> here")
        self.assertEqual(result, "Text emphasis here")

    def test_strips_blockquotes(self):
        result = Corpus._markdown_to_plain_text("> quoted text")
        self.assertEqual(result, "quoted text")

    def test_strips_horizontal_rules(self):
        md = "Above\n---\nBelow"
        result = Corpus._markdown_to_plain_text(md)
        self.assertIn("Above", result)
        self.assertIn("Below", result)
        self.assertNotIn("---", result)

    def test_strips_unordered_list_markers(self):
        md = "- item one\n- item two"
        result = Corpus._markdown_to_plain_text(md)
        self.assertEqual(result, "item one\nitem two")

    def test_strips_ordered_list_markers(self):
        md = "1. first\n2. second"
        result = Corpus._markdown_to_plain_text(md)
        self.assertEqual(result, "first\nsecond")

    def test_collapses_blank_lines(self):
        md = "A\n\n\n\nB"
        result = Corpus._markdown_to_plain_text(md)
        self.assertEqual(result, "A\n\nB")

    def test_plain_text_passthrough(self):
        text = "Just plain text, no markdown."
        result = Corpus._markdown_to_plain_text(text)
        self.assertEqual(result, text)

    def test_empty_string(self):
        self.assertEqual(Corpus._markdown_to_plain_text(""), "")


class UpdateDescriptionSyncTest(TestCase):
    """Tests that update_description() syncs the plain-text description field."""

    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="test123")
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user,
            description="old description",
        )

    def test_syncs_plain_text_on_update(self):
        md = "# New Title\n\nSome **bold** content"
        self.corpus.update_description(new_content=md, author=self.user)
        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.description, "New Title\n\nSome bold content")

    def test_creates_revision(self):
        from opencontractserver.corpuses.models import CorpusDescriptionRevision

        self.corpus.update_description(new_content="v1 content", author=self.user)
        revisions = CorpusDescriptionRevision.objects.filter(corpus=self.corpus)
        self.assertEqual(revisions.count(), 1)
        self.assertEqual(revisions.first().version, 1)

    def test_no_op_when_content_unchanged(self):
        self.corpus.update_description(new_content="initial", author=self.user)
        result = self.corpus.update_description(new_content="initial", author=self.user)
        self.assertIsNone(result)

    def test_accepts_author_as_int(self):
        self.corpus.update_description(
            new_content="from int author", author=self.user.pk
        )
        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.description, "from int author")
