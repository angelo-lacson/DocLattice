"""
Comprehensive tests for Issue #654: DocumentPath as single source of truth.

This test file covers:
1. DocumentPathContext utility class
2. New Corpus methods (add_document, remove_document, get_documents, document_count)
3. Migration command (sync_m2m_to_documentpath)

Note: Backward compatibility layer has been removed. All corpus-document
relationships must now use DocumentPath-based methods.
"""

import io

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, TransactionTestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.managers import DocumentPathContext
from opencontractserver.documents.models import Document, DocumentPath

User = get_user_model()


class TestDocumentPathContext(TestCase):
    """Test the DocumentPathContext context manager utility."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )
        self.document = Document.objects.create(
            title="Test Document",
            description="A test document",
            creator=self.user,
        )

    def test_context_manager_sets_and_clears_context(self):
        """Test that context manager properly sets and clears thread-local context."""
        # Context should be None initially
        self.assertIsNone(DocumentPathContext.get_current())

        # Context should be set within the manager
        with DocumentPathContext(user=self.user) as ctx:
            self.assertEqual(DocumentPathContext.get_current(), ctx)
            self.assertEqual(ctx.user, self.user)

        # Context should be cleared after exiting
        self.assertIsNone(DocumentPathContext.get_current())

    def test_context_with_custom_settings(self):
        """Test context with custom folder and path prefix."""
        from opencontractserver.corpuses.models import Corpus, CorpusFolder

        corpus = Corpus.objects.create(
            title="Test Corpus", description="Test", creator=self.user
        )
        folder = CorpusFolder.objects.create(
            name="Test Folder", corpus=corpus, creator=self.user
        )

        with DocumentPathContext(
            user=self.user,
            default_folder=folder,
            default_path_prefix="/custom",
            auto_generate_paths=False,
        ) as ctx:
            self.assertEqual(ctx.default_folder, folder)
            self.assertEqual(ctx.default_path_prefix, "/custom")
            self.assertFalse(ctx.auto_generate_paths)

    def test_path_generation_with_title(self):
        """Test automatic path generation from document title."""
        with DocumentPathContext(user=self.user) as ctx:
            path = ctx.generate_path_for_document(self.document)
            self.assertEqual(path, "/legacy/Test_Document")

    def test_path_generation_without_title(self):
        """Test path generation for document without title."""
        doc_no_title = Document.objects.create(
            description="No title", creator=self.user
        )

        with DocumentPathContext(user=self.user) as ctx:
            path = ctx.generate_path_for_document(doc_no_title)
            self.assertEqual(path, f"/legacy/doc_{doc_no_title.pk}")

    def test_path_generation_sanitizes_special_characters(self):
        """Test that special characters are sanitized in paths."""
        doc_special = Document.objects.create(
            title="Test@Document#With$Special%Chars!", creator=self.user
        )

        with DocumentPathContext(user=self.user) as ctx:
            path = ctx.generate_path_for_document(doc_special)
            self.assertEqual(path, "/legacy/Test_Document_With_Special_Chars_")

    def test_nested_contexts(self):
        """Test that nested contexts work correctly."""
        user2 = User.objects.create_user(username="user2", email="user2@example.com")

        with DocumentPathContext(user=self.user):
            self.assertEqual(DocumentPathContext.get_current().user, self.user)

            with DocumentPathContext(user=user2):
                self.assertEqual(DocumentPathContext.get_current().user, user2)

            # Should restore to outer context after inner context exits
            self.assertEqual(DocumentPathContext.get_current().user, self.user)

        self.assertIsNone(DocumentPathContext.get_current())


class TestCorpusDocumentMethods(TransactionTestCase):
    """Test the new explicit Corpus methods for document management."""

    def setUp(self):
        """Set up test data."""
        # Clean up any existing DocumentPath records from previous tests
        DocumentPath.objects.all().delete()

        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus", description="Test corpus", creator=self.user
        )

        self.document = Document.objects.create(
            title="Test Document",
            description="A test document",
            creator=self.user,
            pdf_file_hash="testhash",
        )
        self.document.pdf_file.save("test.pdf", ContentFile(b"Test PDF content"))

    def test_add_document_creates_path(self):
        """Test that add_document creates DocumentPath record."""
        doc, status, path = self.corpus.add_document(
            document=self.document, user=self.user
        )

        # Status should be 'added' for new link
        self.assertEqual(status, "added")
        # Document identity is preserved - same object returned
        self.assertEqual(doc.id, self.document.id)
        self.assertIsInstance(path, DocumentPath)
        self.assertEqual(path.corpus, self.corpus)
        self.assertEqual(path.document, self.document)
        self.assertTrue(path.is_current)
        self.assertFalse(path.is_deleted)

    def test_add_document_with_custom_path(self):
        """Test add_document with custom path."""
        doc, status, path = self.corpus.add_document(
            document=self.document, path="/custom/path/document.pdf", user=self.user
        )

        self.assertEqual(path.path, "/custom/path/document.pdf")

    def test_add_document_auto_generates_path(self):
        """Test that add_document auto-generates path from title."""
        doc, status, path = self.corpus.add_document(
            document=self.document, user=self.user
        )

        self.assertIn("Test_Document", path.path)

    def test_add_document_requires_user(self):
        """Test that add_document requires user for audit trail."""
        with self.assertRaises(ValueError) as cm:
            self.corpus.add_document(document=self.document, user=None)

        self.assertIn("User is required", str(cm.exception))

    def test_remove_document_by_document(self):
        """Test removing document by document object."""
        # First add the document
        doc, status, path = self.corpus.add_document(
            document=self.document, user=self.user
        )

        # Verify it was added
        self.assertIsNotNone(path)
        active_paths = DocumentPath.objects.filter(
            corpus=self.corpus, is_current=True, is_deleted=False
        )
        self.assertGreater(
            active_paths.count(), 0, "No active paths found after add_document"
        )

        # Then remove it - use the actual document that was added (might be versioned)
        deleted_paths = self.corpus.remove_document(document=doc, user=self.user)

        self.assertGreater(len(deleted_paths), 0, "No paths were deleted")
        self.assertTrue(deleted_paths[0].is_deleted)

        # Document should no longer be in corpus
        self.assertEqual(self.corpus.get_documents().count(), 0)

    def test_remove_document_by_path(self):
        """Test removing document by path."""
        # Add document with known path
        doc, status, path_record = self.corpus.add_document(
            document=self.document, path="/test/document.pdf", user=self.user
        )

        # Remove by path
        deleted_paths = self.corpus.remove_document(
            path="/test/document.pdf", user=self.user
        )

        self.assertEqual(len(deleted_paths), 1)
        self.assertTrue(deleted_paths[0].is_deleted)

    def test_remove_document_requires_user(self):
        """Test that remove_document requires user."""
        with self.assertRaises(ValueError) as cm:
            self.corpus.remove_document(document=self.document, user=None)

        self.assertIn("User is required", str(cm.exception))

    def test_remove_document_requires_document_or_path(self):
        """Test that remove_document requires either document or path."""
        with self.assertRaises(ValueError) as cm:
            self.corpus.remove_document(user=self.user)

        self.assertIn("Either document or path must be provided", str(cm.exception))

    def test_get_documents_returns_active_documents(self):
        """Test that get_documents returns only active documents."""
        # Add two documents
        doc2 = Document.objects.create(
            title="Document 2", creator=self.user, pdf_file_hash="hash2"
        )
        doc2.pdf_file.save("doc2.pdf", ContentFile(b"Content 2"))

        doc1_added, _, _ = self.corpus.add_document(
            document=self.document, user=self.user
        )
        doc2_added, _, _ = self.corpus.add_document(document=doc2, user=self.user)

        # Should have 2 documents (or more if there are leftovers)
        docs_before = self.corpus.get_documents()
        initial_count = docs_before.count()
        self.assertGreaterEqual(initial_count, 2)

        # Remove one - use the actual document returned from add_document
        removed = self.corpus.remove_document(document=doc1_added, user=self.user)
        self.assertGreater(len(removed), 0, "Should have removed at least one path")

        # Should have one less document
        docs_after = self.corpus.get_documents()
        self.assertEqual(docs_after.count(), initial_count - 1)

    def test_document_count(self):
        """Test document_count method."""
        # Initial count should be 0 (we clean up in setUp)
        initial_count = self.corpus.document_count()

        self.corpus.add_document(document=self.document, user=self.user)
        self.assertEqual(self.corpus.document_count(), initial_count + 1)

        # Add same document again (should not increase count)
        self.corpus.add_document(document=self.document, user=self.user)
        self.assertEqual(self.corpus.document_count(), initial_count + 1)

        # Remove document
        self.corpus.remove_document(document=self.document, user=self.user)
        self.assertEqual(self.corpus.document_count(), initial_count)

    def test_add_document_with_folder(self):
        """Test adding document to a specific folder."""
        from opencontractserver.corpuses.models import CorpusFolder

        folder = CorpusFolder.objects.create(
            name="Test Folder", corpus=self.corpus, creator=self.user
        )

        doc, status, path = self.corpus.add_document(
            document=self.document, user=self.user, folder=folder
        )

        self.assertEqual(path.folder, folder)

    def test_get_documents_excludes_deleted(self):
        """Test that get_documents excludes soft-deleted documents."""
        # Add document
        doc, status, path = self.corpus.add_document(
            document=self.document, user=self.user
        )

        # Should be visible
        self.assertIn(doc, self.corpus.get_documents())

        # Soft-delete via remove_document
        self.corpus.remove_document(document=doc, user=self.user)

        # Should not be visible
        self.assertNotIn(doc, self.corpus.get_documents())

        # But DocumentPath should still exist (soft-deleted)
        deleted_path = DocumentPath.objects.filter(
            corpus=self.corpus, document=doc, is_deleted=True
        )
        self.assertTrue(deleted_path.exists())

    def test_get_documents_filtering(self):
        """Test that get_documents returns a filterable queryset."""
        # Add multiple documents
        doc2 = Document.objects.create(
            title="Another Document", creator=self.user, pdf_file_hash="hash2"
        )
        doc2.pdf_file.save("doc2.pdf", ContentFile(b"Content 2"))

        self.corpus.add_document(document=self.document, user=self.user)
        self.corpus.add_document(document=doc2, user=self.user)

        # Filter by title
        filtered = self.corpus.get_documents().filter(title="Test Document")
        self.assertEqual(filtered.count(), 1)

        # Exclude by title
        excluded = self.corpus.get_documents().exclude(title="Test Document")
        self.assertEqual(excluded.count(), 1)

    def test_document_identity_preserved(self):
        """Test that add_document preserves document identity (same ID)."""
        original_id = self.document.id
        original_title = self.document.title

        returned_doc, status, path = self.corpus.add_document(
            document=self.document, user=self.user
        )

        # Same exact object should be returned
        self.assertEqual(returned_doc.id, original_id)
        self.assertEqual(returned_doc.title, original_title)
        self.assertIs(returned_doc, self.document)  # Same object in memory

    def test_same_document_multiple_paths(self):
        """Test that same document can exist at multiple paths in same corpus."""
        # Add at first path
        doc1, status1, path1 = self.corpus.add_document(
            document=self.document, path="/path/one.pdf", user=self.user
        )
        self.assertEqual(status1, "added")

        # Add at second path - same document, different path
        doc2, status2, path2 = self.corpus.add_document(
            document=self.document, path="/path/two.pdf", user=self.user
        )
        self.assertEqual(status2, "added")

        # Both should return the same document
        self.assertEqual(doc1.id, doc2.id)
        self.assertEqual(doc1.id, self.document.id)

        # But different DocumentPath records
        self.assertNotEqual(path1.id, path2.id)
        self.assertEqual(path1.path, "/path/one.pdf")
        self.assertEqual(path2.path, "/path/two.pdf")

        # Document appears once in get_documents() (distinct)
        docs = list(self.corpus.get_documents())
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0].id, self.document.id)

    def test_add_document_already_exists_at_same_path(self):
        """Test adding same document at same path returns 'already_exists'."""
        # First add
        doc1, status1, path1 = self.corpus.add_document(
            document=self.document, path="/same/path.pdf", user=self.user
        )
        self.assertEqual(status1, "added")

        # Second add at same path
        doc2, status2, path2 = self.corpus.add_document(
            document=self.document, path="/same/path.pdf", user=self.user
        )
        self.assertEqual(status2, "already_exists")

        # Same document and path returned
        self.assertEqual(doc1.id, doc2.id)
        self.assertEqual(path1.id, path2.id)

    def test_add_document_replaces_at_occupied_path(self):
        """Test that adding document at occupied path replaces the old one."""
        doc2 = Document.objects.create(
            title="Another Document", creator=self.user, pdf_file_hash="hash2"
        )
        doc2.pdf_file.save("doc2.pdf", ContentFile(b"Content 2"))

        # Add first document at path
        doc1_ret, status1, path1 = self.corpus.add_document(
            document=self.document, path="/shared/path.pdf", user=self.user
        )
        self.assertEqual(status1, "added")
        self.assertEqual(path1.version_number, 1)

        # Add second document at same path
        doc2_ret, status2, path2 = self.corpus.add_document(
            document=doc2, path="/shared/path.pdf", user=self.user
        )
        self.assertEqual(status2, "added")
        self.assertEqual(path2.version_number, 2)
        self.assertEqual(path2.parent, path1)

        # Old path should no longer be current
        path1.refresh_from_db()
        self.assertFalse(path1.is_current)

        # New path should be current
        self.assertTrue(path2.is_current)

        # get_documents should return only doc2 at that path
        docs = list(self.corpus.get_documents())
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0].id, doc2.id)

    def test_import_content_creates_new_document(self):
        """Test import_content creates new document with content deduplication."""
        content = b"Brand new PDF content"

        doc, status, path = self.corpus.import_content(
            content=content, path="/imported/doc.pdf", user=self.user, title="Imported"
        )

        self.assertEqual(status, "created")
        self.assertIsNotNone(doc.id)
        self.assertEqual(doc.title, "Imported")
        self.assertEqual(path.path, "/imported/doc.pdf")

    def test_import_content_deduplicates(self):
        """Test import_content reuses document with same content hash."""
        content = b"Same content for deduplication test"

        # Import to first corpus
        doc1, status1, path1 = self.corpus.import_content(
            content=content, path="/first.pdf", user=self.user, title="First"
        )
        self.assertEqual(status1, "created")

        # Create second corpus
        corpus2 = Corpus.objects.create(title="Second Corpus", creator=self.user)

        # Import same content to second corpus
        doc2, status2, path2 = corpus2.import_content(
            content=content, path="/second.pdf", user=self.user, title="Second"
        )

        # Should reuse the same document (cross-corpus deduplication)
        self.assertEqual(status2, "cross_corpus_import")
        self.assertEqual(doc1.id, doc2.id)

    def test_add_document_requires_document_object(self):
        """Test that add_document requires a document object."""
        with self.assertRaises(ValueError) as cm:
            self.corpus.add_document(document=None, user=self.user)

        self.assertIn("Document is required", str(cm.exception))

    def test_import_content_requires_content(self):
        """Test that import_content requires content bytes."""
        with self.assertRaises(ValueError) as cm:
            self.corpus.import_content(content=None, user=self.user)

        self.assertIn("Content is required", str(cm.exception))


class TestMigrationCommand(TransactionTestCase):
    """Test the sync_m2m_to_documentpath management command."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

        # Create corpus with documents using OLD M2M method
        # (bypassing DocumentPath for legacy data simulation)
        self.corpus = Corpus.objects.create(
            title="Test Corpus", description="Test", creator=self.user
        )

        # Create documents
        self.doc1 = Document.objects.create(
            title="Document One", description="First document", creator=self.user
        )

        self.doc2 = Document.objects.create(
            title="Document Two", description="Second document", creator=self.user
        )

        # Add documents using direct M2M (simulating legacy data)
        # This is the old way that doesn't create DocumentPath records
        self.corpus.documents.add(self.doc1, self.doc2)

    def test_dry_run_mode(self):
        """Test that dry-run mode doesn't make changes."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        # Verify no DocumentPath records exist
        self.assertEqual(DocumentPath.objects.count(), 0)

        # Run command in dry-run mode
        out = io.StringIO()
        call_command(
            "sync_m2m_to_documentpath",
            "--dry-run",
            "--system-user-id",
            system_user.id,
            stdout=out,
        )

        output = out.getvalue()
        self.assertIn("DRY-RUN mode", output)
        self.assertIn("Would create 2 DocumentPath records", output)

        # Verify no DocumentPath records were created
        self.assertEqual(DocumentPath.objects.count(), 0)

    def test_actual_migration(self):
        """Test actual migration creates DocumentPath records."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        # Verify no DocumentPath records exist
        self.assertEqual(DocumentPath.objects.count(), 0)

        # Run command
        out = io.StringIO()
        call_command(
            "sync_m2m_to_documentpath", "--system-user-id", system_user.id, stdout=out
        )

        output = out.getvalue()
        self.assertIn("Successfully created 2 DocumentPath records", output)

        # Verify DocumentPath records were created
        paths = DocumentPath.objects.filter(
            corpus=self.corpus, is_current=True, is_deleted=False
        )
        self.assertEqual(paths.count(), 2)

        # Verify documents are linked correctly
        doc_ids = set(paths.values_list("document_id", flat=True))
        self.assertEqual(doc_ids, {self.doc1.id, self.doc2.id})

    def test_migration_with_specific_corpus(self):
        """Test migration of specific corpus only."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        # Create another corpus
        corpus2 = Corpus.objects.create(
            title="Corpus 2", description="Second corpus", creator=self.user
        )
        corpus2.documents.add(self.doc1)

        # Migrate only corpus2
        out = io.StringIO()
        call_command(
            "sync_m2m_to_documentpath",
            "--corpus-id",
            corpus2.id,
            "--system-user-id",
            system_user.id,
            stdout=out,
        )

        # Only corpus2 should have DocumentPath records
        self.assertEqual(DocumentPath.objects.filter(corpus=corpus2).count(), 1)
        self.assertEqual(DocumentPath.objects.filter(corpus=self.corpus).count(), 0)

    def test_migration_idempotent(self):
        """Test that running migration twice is safe."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        # Run migration once
        call_command("sync_m2m_to_documentpath", "--system-user-id", system_user.id)
        initial_count = DocumentPath.objects.count()

        # Run migration again
        out = io.StringIO()
        call_command(
            "sync_m2m_to_documentpath", "--system-user-id", system_user.id, stdout=out
        )

        output = out.getvalue()
        self.assertIn("All documents already have DocumentPath records", output)

        # Count should not change
        self.assertEqual(DocumentPath.objects.count(), initial_count)

    def test_migration_with_custom_path_prefix(self):
        """Test migration with custom path prefix."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        out = io.StringIO()
        call_command(
            "sync_m2m_to_documentpath",
            "--path-prefix",
            "/imported",
            "--system-user-id",
            system_user.id,
            stdout=out,
        )

        # Check that paths use the custom prefix
        paths = DocumentPath.objects.filter(corpus=self.corpus)
        for path in paths:
            self.assertTrue(path.path.startswith("/imported/"))

    def test_migration_handles_missing_user(self):
        """Test that migration fails gracefully with invalid user ID."""
        with self.assertRaises(Exception) as cm:
            call_command("sync_m2m_to_documentpath", "--system-user-id", 99999)

        self.assertIn("User with ID 99999 not found", str(cm.exception))

    def test_migration_verbose_mode(self):
        """Test verbose mode provides detailed output."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        out = io.StringIO()
        call_command(
            "sync_m2m_to_documentpath",
            "--verbose",
            "--system-user-id",
            system_user.id,
            stdout=out,
        )

        output = out.getvalue()
        # Should show individual document processing
        self.assertIn("Creating DocumentPath for document", output)
        self.assertIn("Created DocumentPath:", output)

    def test_migration_handles_duplicate_paths(self):
        """Test that migration handles path conflicts."""
        # Ensure system user exists
        system_user, _ = User.objects.get_or_create(
            id=1, defaults={"username": "system", "email": "system@example.com"}
        )

        # Create two documents with same title
        doc3 = Document.objects.create(
            title="Document One",  # Same as doc1
            description="Duplicate title",
            creator=self.user,
        )
        self.corpus.documents.add(doc3)

        # Run migration
        call_command("sync_m2m_to_documentpath", "--system-user-id", system_user.id)

        # Should create unique paths
        paths = DocumentPath.objects.filter(corpus=self.corpus)
        path_values = list(paths.values_list("path", flat=True))

        # All paths should be unique
        self.assertEqual(len(path_values), len(set(path_values)))
