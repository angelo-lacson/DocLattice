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

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TransactionTestCase

from opencontractserver.agents.memory import (
    get_or_create_memory_document,
    update_memory_content,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document, DocumentPath

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


class MemoryDocumentBlobRetentionTestCase(TransactionTestCase):
    """Regression for issue #1464: ``update_memory_content`` must not
    clobber a ``txt_extract_file`` blob that is still referenced by a
    sibling Document (e.g. a corpus-isolated copy of the memory doc).

    With ``FileSystemStorage`` (used in tests), deleting a blob and then
    saving a new file with the same requested name reuses the same path
    on disk. This means the *name* stays the same but the *content* is
    replaced. The regression is therefore detectable via content, not
    via the blob path.

    The guard (issue #1464 fix) changes the write strategy for a shared
    blob: instead of delete-then-save (which clobbers the shared file),
    it clears the field to ``None`` and lets Django's storage generate a
    new unique path for the updated content (because the original file
    still exists on disk). The sibling's field keeps pointing at the old
    path, which now still contains the original content.
    """

    def setUp(self) -> None:
        self.user = User.objects.create_user(username="memory-blob-user", password="x")
        self.corpus_a = Corpus.objects.create(
            title="Memory Source Corpus", creator=self.user
        )
        self.corpus_b = Corpus.objects.create(
            title="Memory Sibling Corpus", creator=self.user
        )

    def test_update_keeps_blob_when_shared_with_sibling(self) -> None:
        """Updating memory in corpus A must not clobber the blob content
        that sibling in corpus B still references.

        Failure mode (before fix): delete-then-save reuses the same storage
        path, overwriting the shared file. The sibling's field still points
        at the path, but now reads back the NEW content instead of its own.

        Fix behaviour: the old blob is preserved (field is cleared to None
        so storage generates a fresh path for the new content). The sibling
        continues to read the original content.
        """
        new_content = "## New section\nFoo bar baz"

        # Create the memory document in corpus A
        memory_doc = async_to_sync(get_or_create_memory_document)(
            self.corpus_a, self.user
        )
        original_blob_name = memory_doc.txt_extract_file.name
        assert original_blob_name is not None
        self.assertTrue(default_storage.exists(original_blob_name))

        # Record the original content so we can verify sibling is unchanged.
        with memory_doc.txt_extract_file.open("rb") as fh:
            original_content = fh.read()

        # Create a corpus-isolated copy in corpus B that shares the same
        # txt_extract_file blob (this is what Corpus.add_document does).
        sibling, _, _ = self.corpus_b.add_document(document=memory_doc, user=self.user)
        self.assertEqual(
            sibling.txt_extract_file.name,
            original_blob_name,
            "Pre-condition: corpus copy must share blob with source",
        )

        # Update memory content on corpus A.  The OLD blob is still
        # referenced by sibling in corpus B and must not be clobbered.
        async_to_sync(update_memory_content)(self.corpus_a, new_content, self.user)

        # Assert: sibling's blob still holds the ORIGINAL content.
        sibling.refresh_from_db()
        self.assertTrue(
            default_storage.exists(sibling.txt_extract_file.name),
            f"Sibling blob {sibling.txt_extract_file.name!r} was deleted",
        )
        with sibling.txt_extract_file.open("rb") as fh:
            sibling_content = fh.read()
        self.assertEqual(
            sibling_content,
            original_content,
            "Sibling blob was clobbered: it now contains the memory-doc's "
            "updated content instead of its own original content",
        )

        # Memory doc A must reflect the new content.
        memory_doc.refresh_from_db()
        with memory_doc.txt_extract_file.open("rb") as fh:
            updated_content = fh.read()
        self.assertEqual(updated_content, new_content.encode("utf-8"))

    def test_update_deletes_blob_when_unshared(self) -> None:
        """When no sibling references the old blob, the update SHOULD
        write the new content to the memory document.

        (Whether the old path is physically deleted and a new path
        allocated, or the same path is reused, depends on the storage
        backend. What matters is that the memory document's file
        contains the new content after the call.)
        """
        new_content = "## Updated\nSome new text"

        memory_doc = async_to_sync(get_or_create_memory_document)(
            self.corpus_a, self.user
        )

        async_to_sync(update_memory_content)(self.corpus_a, new_content, self.user)

        memory_doc.refresh_from_db()
        with memory_doc.txt_extract_file.open("rb") as fh:
            stored = fh.read()
        self.assertEqual(
            stored,
            new_content.encode("utf-8"),
            "Memory document should contain the updated content after update",
        )


class DocumentDeleteBlobRetentionTestCase(TransactionTestCase):
    """Issue #1464 spec regression: deleting a Document must not destroy
    file blobs that are still referenced by sibling Documents (corpus-
    isolated copies). Currently default ``Model.delete()`` does not
    touch blobs, so this test passes today; it exists to fail loudly
    if someone adds ``django-cleanup``, a ``post_delete`` blob handler,
    or a custom ``Document.delete()`` that doesn't honour the invariant.
    """

    def setUp(self) -> None:
        self.user = User.objects.create_user(username="delete-blob-user", password="x")
        self.corpus_a = Corpus.objects.create(title="Origin", creator=self.user)

        # UUID-prefix the filename so storage paths don't collide between
        # test runs (FileSystemStorage appends suffixes on collision).
        uid = uuid.uuid4().hex
        self.source = Document.objects.create(
            title="Shared Doc", creator=self.user, file_type="application/pdf"
        )
        self.source.pdf_file.save(
            f"shared_{uid}.pdf", ContentFile(b"%PDF-1.4 dummy"), save=True
        )
        blob_name = self.source.pdf_file.name
        assert blob_name is not None
        self.shared_blob_name: str = blob_name

        # Make a corpus-isolated copy that shares the pdf_file blob.
        self.copy, _status, _path = self.corpus_a.add_document(
            document=self.source, user=self.user
        )
        self.assertEqual(self.copy.pdf_file.name, self.shared_blob_name)

    def test_deleting_copy_preserves_blob_for_source(self) -> None:
        """Deleting one Document must not destroy a blob still referenced
        by another live Document."""
        # DocumentPath.document uses on_delete=PROTECT; remove paths first.
        DocumentPath.objects.filter(document=self.copy).delete()
        self.copy.delete()

        self.assertEqual(self.source.pdf_file.name, self.shared_blob_name)
        self.assertTrue(
            default_storage.exists(self.shared_blob_name),
            "Deleting a corpus copy destroyed the blob that the source "
            "Document still references — issue #1464 regression.",
        )
        with self.source.pdf_file.open("rb") as fh:
            self.assertEqual(fh.read(), b"%PDF-1.4 dummy")

    def test_deleting_source_preserves_blob_for_copy(self) -> None:
        """Symmetry: deleting the source must not destroy a blob still
        referenced by a copy. (``source_document`` FK uses SET_NULL, so
        the copy's row survives the source delete.)"""
        # DocumentPath.document uses on_delete=PROTECT; remove source paths.
        DocumentPath.objects.filter(document=self.source).delete()
        self.source.delete()

        self.copy.refresh_from_db()
        self.assertEqual(self.copy.pdf_file.name, self.shared_blob_name)
        self.assertTrue(
            default_storage.exists(self.shared_blob_name),
            "Deleting the source destroyed the blob that the copy still "
            "references — issue #1464 regression.",
        )
        with self.copy.pdf_file.open("rb") as fh:
            self.assertEqual(fh.read(), b"%PDF-1.4 dummy")
