"""
Comprehensive tests for Issue #654: M2M to DocumentPath migration.

This test file covers:
1. DocumentPathContext functionality
2. DocumentCorpusRelationshipManager operations
3. New Corpus methods (add_document, remove_document)
4. Migration command (sync_m2m_to_documentpath)
5. Backward compatibility
"""

import io

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, TransactionTestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.managers import (
    DocumentCorpusRelationshipManager,
    DocumentPathContext,
    install_custom_manager,
    uninstall_custom_manager,
)
from opencontractserver.documents.models import Document, DocumentPath

User = get_user_model()


class TestDocumentPathContext(TestCase):
    """Test the DocumentPathContext context manager."""

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


class TestDocumentCorpusRelationshipManager(TransactionTestCase):
    """Test the custom M2M manager that uses DocumentPath."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test corpus for manager",
            creator=self.user,
        )

        # Create test documents with PDF content
        self.doc1 = Document.objects.create(
            title="Document 1",
            description="First test document",
            creator=self.user,
            pdf_file_hash="hash1",
        )
        self.doc1.pdf_file.save("doc1.pdf", ContentFile(b"PDF content 1"))

        self.doc2 = Document.objects.create(
            title="Document 2",
            description="Second test document",
            creator=self.user,
            pdf_file_hash="hash2",
        )
        self.doc2.pdf_file.save("doc2.pdf", ContentFile(b"PDF content 2"))

        # Install custom manager
        install_custom_manager()

    def tearDown(self):
        """Clean up after tests."""
        # Restore original manager
        uninstall_custom_manager()
        super().tearDown()

    def test_manager_installation(self):
        """Test that custom manager is properly installed."""
        self.assertTrue(hasattr(Corpus, "_custom_manager_installed"))
        self.assertIsInstance(self.corpus.documents, DocumentCorpusRelationshipManager)

    def test_get_queryset_returns_documentpath_documents(self):
        """Test that get_queryset returns documents based on DocumentPath."""
        # Initially no documents
        self.assertEqual(self.corpus.documents.count(), 0)

        # Create DocumentPath records
        DocumentPath.objects.create(
            document=self.doc1,
            corpus=self.corpus,
            path="/test/doc1",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=self.user,
        )

        # Should now see the document
        self.assertEqual(self.corpus.documents.count(), 1)
        self.assertIn(self.doc1, self.corpus.documents.all())

    def test_add_creates_documentpath_records(self):
        """Test that add() creates DocumentPath records."""
        with DocumentPathContext(user=self.user):
            with self.assertWarns(DeprecationWarning):
                self.corpus.documents.add(self.doc1, self.doc2)

        # Check that DocumentPath records were created
        paths = DocumentPath.objects.filter(
            corpus=self.corpus, is_current=True, is_deleted=False
        )
        self.assertEqual(paths.count(), 2)

        # Check documents are accessible
        self.assertEqual(self.corpus.documents.count(), 2)
        self.assertIn(self.doc1, self.corpus.documents.all())
        self.assertIn(self.doc2, self.corpus.documents.all())

    def test_add_requires_context(self):
        """Test that add() requires DocumentPathContext."""
        with self.assertRaises(RuntimeError) as cm:
            self.corpus.documents.add(self.doc1)

        self.assertIn("DocumentPathContext required", str(cm.exception))

    def test_add_idempotent(self):
        """Test that adding the same document multiple times is safe."""
        with DocumentPathContext(user=self.user):
            self.corpus.documents.add(self.doc1)
            # Adding again should not create duplicate
            self.corpus.documents.add(self.doc1)

        paths = DocumentPath.objects.filter(
            corpus=self.corpus, document=self.doc1, is_current=True, is_deleted=False
        )
        self.assertEqual(paths.count(), 1)

    def test_remove_soft_deletes_documentpath(self):
        """Test that remove() soft-deletes DocumentPath records."""
        # First add documents
        with DocumentPathContext(user=self.user):
            self.corpus.documents.add(self.doc1, self.doc2)

        self.assertEqual(self.corpus.documents.count(), 2)

        # Now remove one
        with DocumentPathContext(user=self.user):
            with self.assertWarns(DeprecationWarning):
                self.corpus.documents.remove(self.doc1)

        # Check that document is no longer visible
        self.assertEqual(self.corpus.documents.count(), 1)
        self.assertNotIn(self.doc1, self.corpus.documents.all())
        self.assertIn(self.doc2, self.corpus.documents.all())

        # Check that DocumentPath was soft-deleted, not removed
        deleted_path = DocumentPath.objects.get(
            corpus=self.corpus, document=self.doc1, is_current=True
        )
        self.assertTrue(deleted_path.is_deleted)

    def test_clear_removes_all_documents(self):
        """Test that clear() removes all documents from corpus."""
        # Add documents
        with DocumentPathContext(user=self.user):
            self.corpus.documents.add(self.doc1, self.doc2)
        self.assertEqual(self.corpus.documents.count(), 2)

        # Clear all
        with DocumentPathContext(user=self.user):
            with self.assertWarns(DeprecationWarning):
                self.corpus.documents.clear()

        # Check all removed
        self.assertEqual(self.corpus.documents.count(), 0)

        # Check all paths are soft-deleted
        deleted_paths = DocumentPath.objects.filter(corpus=self.corpus, is_current=True)
        self.assertTrue(all(p.is_deleted for p in deleted_paths))

    def test_set_replaces_documents(self):
        """Test that set() replaces all documents."""
        doc3 = Document.objects.create(
            title="Document 3", creator=self.user, pdf_file_hash="hash3"
        )
        doc3.pdf_file.save("doc3.pdf", ContentFile(b"PDF content 3"))

        # Start with doc1 and doc2
        with DocumentPathContext(user=self.user):
            self.corpus.documents.add(self.doc1, self.doc2)
        self.assertEqual(self.corpus.documents.count(), 2)

        # Replace with doc2 and doc3
        with DocumentPathContext(user=self.user):
            with self.assertWarns(DeprecationWarning):
                self.corpus.documents.set([self.doc2, doc3])

        # Check results
        docs = list(self.corpus.documents.all())
        self.assertEqual(len(docs), 2)
        self.assertIn(self.doc2, docs)
        self.assertIn(doc3, docs)
        self.assertNotIn(self.doc1, docs)

    def test_filter_and_exclude_work(self):
        """Test that filter() and exclude() work with DocumentPath backend."""
        # Add documents
        with DocumentPathContext(user=self.user):
            self.corpus.documents.add(self.doc1, self.doc2)

        # Test filter
        filtered = self.corpus.documents.filter(title="Document 1")
        self.assertEqual(filtered.count(), 1)
        self.assertEqual(filtered.first(), self.doc1)

        # Test exclude
        excluded = self.corpus.documents.exclude(title="Document 1")
        self.assertEqual(excluded.count(), 1)
        self.assertEqual(excluded.first(), self.doc2)


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

        # Status can be either 'created' or 'cross_corpus_import' depending on whether
        # the document already exists in another corpus
        self.assertIn(status, ["created", "cross_corpus_import"])
        # If it's created, the doc might be a new version, otherwise it's the same
        self.assertIsNotNone(doc)
        self.assertIsInstance(path, DocumentPath)
        self.assertEqual(path.corpus, self.corpus)
        # The document in the path might be different if versioned
        self.assertIsNotNone(path.document)
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


class TestMigrationCommand(TransactionTestCase):
    """Test the sync_m2m_to_documentpath management command."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

        # Create corpus with documents using OLD M2M method
        # (bypassing the custom manager)
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
        # Temporarily uninstall custom manager if installed
        if hasattr(Corpus, "_custom_manager_installed"):
            uninstall_custom_manager()

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


class TestBackwardCompatibility(TransactionTestCase):
    """Test that existing code continues to work with the custom manager."""

    def setUp(self):
        """Set up test environment."""
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com"
        )

        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)

        self.document = Document.objects.create(
            title="Test Doc", creator=self.user, pdf_file_hash="hash1"
        )
        self.document.pdf_file.save("test.pdf", ContentFile(b"content"))

        # Install custom manager
        install_custom_manager()

    def tearDown(self):
        """Clean up."""
        uninstall_custom_manager()
        super().tearDown()

    def test_legacy_add_still_works(self):
        """Test that legacy corpus.documents.add() still works."""
        with DocumentPathContext(user=self.user):
            # Should work but show deprecation warning
            with self.assertWarns(DeprecationWarning):
                self.corpus.documents.add(self.document)

        # Document should be in corpus
        self.assertIn(self.document, self.corpus.documents.all())

    def test_legacy_remove_still_works(self):
        """Test that legacy corpus.documents.remove() still works."""
        # Add document
        with DocumentPathContext(user=self.user):
            self.corpus.documents.add(self.document)

        # Remove document
        with DocumentPathContext(user=self.user):
            with self.assertWarns(DeprecationWarning):
                self.corpus.documents.remove(self.document)

        # Document should not be in corpus
        self.assertNotIn(self.document, self.corpus.documents.all())

    def test_legacy_all_works(self):
        """Test that corpus.documents.all() works."""
        # Add via new method
        self.corpus.add_document(document=self.document, user=self.user)

        # Query via legacy method
        docs = self.corpus.documents.all()
        self.assertEqual(docs.count(), 1)
        self.assertEqual(docs.first(), self.document)

    def test_legacy_filter_works(self):
        """Test that corpus.documents.filter() works."""
        self.corpus.add_document(document=self.document, user=self.user)

        # Filter via legacy method
        filtered = self.corpus.documents.filter(title="Test Doc")
        self.assertEqual(filtered.count(), 1)

    def test_manager_uninstall_restores_original(self):
        """Test that uninstalling manager restores original M2M."""
        # Uninstall custom manager
        uninstall_custom_manager()

        # Should no longer have custom manager flag
        self.assertFalse(hasattr(Corpus, "_custom_manager_installed"))

        # M2M operations should work normally
        self.corpus.documents.add(self.document)
        self.assertIn(self.document, self.corpus.documents.all())
