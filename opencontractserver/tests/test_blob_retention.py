"""Regression tests for issue #1464: blob retention across corpus-isolated
Document copies.

The invariant under test: a file blob (pdf_file, txt_extract_file, etc.) is
alive in storage as long as at least one Document references it. Corpus
copies created via Corpus.add_document() intentionally share blobs with
their source, so any code that deletes blobs must consult
``Document.objects.unique_blob_paths()`` first.
"""

from __future__ import annotations

import uuid

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TransactionTestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document

User = get_user_model()


class UniqueBlobPathsTestCase(TransactionTestCase):
    """Tests for ``Document.objects.unique_blob_paths(doc)``."""

    def setUp(self) -> None:
        self.user = User.objects.create_user(username="blob-test-user", password="x")
        self.corpus_a = Corpus.objects.create(title="Corpus A", creator=self.user)

        # Use UUID-prefixed filenames so parallel/sequential test runs never
        # collide on the same storage path (local FileSystemStorage does NOT
        # overwrite; it appends a suffix, which would break name assertions).
        uid = uuid.uuid4().hex

        # Create a source document with real file fields. Use small
        # ContentFile payloads so storage stays fast; assertions check
        # blob NAMES (S3 keys), not content.
        self.source = Document.objects.create(
            title="Source Doc", creator=self.user, file_type="application/pdf"
        )
        self.source.pdf_file.save(
            f"src_{uid}.pdf", ContentFile(b"%PDF-1.4 dummy"), save=True
        )
        self.source.txt_extract_file.save(
            f"src_{uid}.txt", ContentFile(b"hello"), save=True
        )
        self.uid = uid

    def test_solitary_document_all_blobs_unique(self) -> None:
        """A document with no copies owns all of its blobs."""
        unique = Document.objects.unique_blob_paths(self.source)

        self.assertIn(self.source.pdf_file.name, unique)
        self.assertIn(self.source.txt_extract_file.name, unique)

    def test_shared_blob_excluded_for_both(self) -> None:
        """When a corpus copy shares the source blob, neither side
        considers that blob unique to itself."""
        copy, _status, _path = self.corpus_a.add_document(
            document=self.source, user=self.user
        )

        # Sanity: copy and source share the same S3 key
        self.assertEqual(copy.pdf_file.name, self.source.pdf_file.name)

        source_unique = Document.objects.unique_blob_paths(self.source)
        copy_unique = Document.objects.unique_blob_paths(copy)

        self.assertNotIn(self.source.pdf_file.name, source_unique)
        self.assertNotIn(copy.pdf_file.name, copy_unique)

    def test_unshared_field_remains_unique(self) -> None:
        """A field that's NOT shared with the copy is still unique to
        the document that owns it (per-field check, not whole-row)."""
        copy, _status, _path = self.corpus_a.add_document(
            document=self.source, user=self.user
        )

        # Replace the copy's txt_extract_file with a fresh blob so it
        # no longer shares with source.
        copy.txt_extract_file.save(
            f"copy_{self.uid}.txt", ContentFile(b"copy content"), save=True
        )
        # add_document() shares the FieldFile object from source, so saving
        # copy's field mutates the shared FieldFile's .name in memory.
        # Refresh source from DB to get the original path back.
        self.source.refresh_from_db()
        self.assertNotEqual(
            copy.txt_extract_file.name, self.source.txt_extract_file.name
        )

        source_unique = Document.objects.unique_blob_paths(self.source)
        # Source's txt_extract_file is no longer shared, so it IS unique
        self.assertIn(self.source.txt_extract_file.name, source_unique)
        # PDF is still shared, so still NOT unique
        self.assertNotIn(self.source.pdf_file.name, source_unique)

    def test_empty_field_not_in_result(self) -> None:
        """File fields with no blob assigned must not appear in the
        result set (would be an empty string otherwise)."""
        # md_summary_file was never set on self.source
        self.assertFalse(self.source.md_summary_file)

        unique = Document.objects.unique_blob_paths(self.source)

        self.assertNotIn("", unique)
        self.assertFalse(any(p == "" for p in unique))
