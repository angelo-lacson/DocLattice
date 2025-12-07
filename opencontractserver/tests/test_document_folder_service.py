"""
Comprehensive tests for DocumentFolderService.

Tests cover:
- Permission checking (read, write, delete)
- Folder CRUD operations
- Document-in-folder operations
- Dual-system consistency (DocumentPath + CorpusDocumentFolder)
- Edge cases and error handling
"""

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.test import TransactionTestCase

from opencontractserver.corpuses.folder_service import DocumentFolderService
from opencontractserver.corpuses.models import (
    Corpus,
    CorpusDocumentFolder,
    CorpusFolder,
)
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.documents.signals import (
    DOC_CREATE_UID,
    process_doc_on_create_atomic,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class DocumentFolderServiceTestBase(TransactionTestCase):
    """Base test class that disconnects document signals to prevent Celery tasks."""

    @classmethod
    def setUpClass(cls):
        """Disconnect document processing signals to avoid Celery tasks during setup."""
        super().setUpClass()
        post_save.disconnect(
            process_doc_on_create_atomic, sender=Document, dispatch_uid=DOC_CREATE_UID
        )

    @classmethod
    def tearDownClass(cls):
        """Reconnect document processing signals after tests complete."""
        post_save.connect(
            process_doc_on_create_atomic, sender=Document, dispatch_uid=DOC_CREATE_UID
        )
        super().tearDownClass()


class TestDocumentFolderServicePermissions(TransactionTestCase):
    """Test permission checking methods."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@test.com", password="test"
        )
        self.viewer = User.objects.create_user(
            username="viewer", email="viewer@test.com", password="test"
        )
        self.editor = User.objects.create_user(
            username="editor", email="editor@test.com", password="test"
        )
        self.superuser = User.objects.create_superuser(
            username="super", email="super@test.com", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.owner,
            is_public=False,
        )

    def test_creator_has_read_permission(self):
        """Creator should have read access to their corpus."""
        self.assertTrue(
            DocumentFolderService.check_corpus_read_permission(self.owner, self.corpus)
        )

    def test_creator_has_write_permission(self):
        """Creator should have write access to their corpus."""
        self.assertTrue(
            DocumentFolderService.check_corpus_write_permission(self.owner, self.corpus)
        )

    def test_superuser_has_all_permissions(self):
        """Superuser should have all permissions."""
        self.assertTrue(
            DocumentFolderService.check_corpus_read_permission(
                self.superuser, self.corpus
            )
        )
        self.assertTrue(
            DocumentFolderService.check_corpus_write_permission(
                self.superuser, self.corpus
            )
        )
        self.assertTrue(
            DocumentFolderService.check_corpus_delete_permission(
                self.superuser, self.corpus
            )
        )

    def test_public_corpus_grants_read_only(self):
        """Public corpus should grant read but not write access."""
        self.corpus.is_public = True
        self.corpus.save()

        # Viewer can read
        self.assertTrue(
            DocumentFolderService.check_corpus_read_permission(self.viewer, self.corpus)
        )
        # But cannot write (CRITICAL security rule)
        self.assertFalse(
            DocumentFolderService.check_corpus_write_permission(
                self.viewer, self.corpus
            )
        )
        self.assertFalse(
            DocumentFolderService.check_corpus_delete_permission(
                self.viewer, self.corpus
            )
        )

    def test_explicit_read_permission(self):
        """User with explicit READ permission should have read access."""
        set_permissions_for_obj_to_user(
            self.viewer, self.corpus, [PermissionTypes.READ]
        )

        self.assertTrue(
            DocumentFolderService.check_corpus_read_permission(self.viewer, self.corpus)
        )
        self.assertFalse(
            DocumentFolderService.check_corpus_write_permission(
                self.viewer, self.corpus
            )
        )

    def test_explicit_update_permission_grants_write(self):
        """User with UPDATE permission should have write access."""
        set_permissions_for_obj_to_user(
            self.editor, self.corpus, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )

        self.assertTrue(
            DocumentFolderService.check_corpus_read_permission(self.editor, self.corpus)
        )
        self.assertTrue(
            DocumentFolderService.check_corpus_write_permission(
                self.editor, self.corpus
            )
        )

    def test_update_permission_alone_grants_write_but_not_read(self):
        """UPDATE permission alone grants write access but not read (edge case)."""
        set_permissions_for_obj_to_user(
            self.editor, self.corpus, [PermissionTypes.UPDATE]
        )

        # UPDATE without READ is technically possible but unusual
        self.assertFalse(
            DocumentFolderService.check_corpus_read_permission(self.editor, self.corpus)
        )
        self.assertTrue(
            DocumentFolderService.check_corpus_write_permission(
                self.editor, self.corpus
            )
        )

    def test_no_permission_denies_access(self):
        """User without any permission should be denied access."""
        self.assertFalse(
            DocumentFolderService.check_corpus_read_permission(self.viewer, self.corpus)
        )
        self.assertFalse(
            DocumentFolderService.check_corpus_write_permission(
                self.viewer, self.corpus
            )
        )


class TestDocumentFolderServiceFolderCRUD(TransactionTestCase):
    """Test folder CRUD operations."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@test.com", password="test"
        )
        self.viewer = User.objects.create_user(
            username="viewer", email="viewer@test.com", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.owner,
            is_public=False,
        )

    def test_create_folder_success(self):
        """Should create folder with valid inputs."""
        folder, error = DocumentFolderService.create_folder(
            user=self.owner,
            corpus=self.corpus,
            name="Test Folder",
            description="A test folder",
            color="#3B82F6",
        )

        self.assertIsNotNone(folder)
        self.assertEqual(error, "")
        self.assertEqual(folder.name, "Test Folder")
        self.assertEqual(folder.description, "A test folder")
        self.assertEqual(folder.color, "#3B82F6")
        self.assertEqual(folder.corpus, self.corpus)
        self.assertIsNone(folder.parent)

    def test_create_nested_folder(self):
        """Should create folder under parent."""
        parent, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent"
        )
        child, error = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent
        )

        self.assertIsNotNone(child)
        self.assertEqual(error, "")
        self.assertEqual(child.parent, parent)

    def test_create_folder_duplicate_name_fails(self):
        """Should reject duplicate folder names in same parent."""
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder"
        )

        folder, error = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder"
        )

        self.assertIsNone(folder)
        self.assertIn("already exists", error)

    def test_create_folder_same_name_different_parents(self):
        """Should allow same name in different parents."""
        parent1, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent1"
        )
        parent2, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent2"
        )

        child1, error1 = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent1
        )
        child2, error2 = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent2
        )

        self.assertIsNotNone(child1)
        self.assertIsNotNone(child2)
        self.assertEqual(error1, "")
        self.assertEqual(error2, "")

    def test_create_folder_permission_denied(self):
        """Should reject folder creation without write permission."""
        set_permissions_for_obj_to_user(
            self.viewer, self.corpus, [PermissionTypes.READ]
        )

        folder, error = DocumentFolderService.create_folder(
            user=self.viewer, corpus=self.corpus, name="Folder"
        )

        self.assertIsNone(folder)
        self.assertIn("Permission denied", error)

    def test_update_folder_success(self):
        """Should update folder properties."""
        folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Original"
        )

        success, error = DocumentFolderService.update_folder(
            user=self.owner,
            folder=folder,
            name="Updated",
            description="New description",
            color="#EF4444",
        )

        self.assertTrue(success)
        self.assertEqual(error, "")

        folder.refresh_from_db()
        self.assertEqual(folder.name, "Updated")
        self.assertEqual(folder.description, "New description")
        self.assertEqual(folder.color, "#EF4444")

    def test_update_folder_name_conflict(self):
        """Should reject update if name conflicts with sibling."""
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Existing"
        )
        folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="ToUpdate"
        )

        success, error = DocumentFolderService.update_folder(
            user=self.owner, folder=folder, name="Existing"
        )

        self.assertFalse(success)
        self.assertIn("already exists", error)

    def test_move_folder_to_new_parent(self):
        """Should move folder to new parent."""
        parent1, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent1"
        )
        parent2, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent2"
        )
        child, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent1
        )

        success, error = DocumentFolderService.move_folder(
            user=self.owner, folder=child, new_parent=parent2
        )

        self.assertTrue(success)
        self.assertEqual(error, "")

        child.refresh_from_db()
        self.assertEqual(child.parent, parent2)

    def test_move_folder_to_root(self):
        """Should move folder to root."""
        parent, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent"
        )
        child, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent
        )

        success, error = DocumentFolderService.move_folder(
            user=self.owner, folder=child, new_parent=None
        )

        self.assertTrue(success)
        child.refresh_from_db()
        self.assertIsNone(child.parent)

    def test_move_folder_prevents_circular_reference(self):
        """Should prevent moving folder into itself."""
        folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder"
        )

        success, error = DocumentFolderService.move_folder(
            user=self.owner, folder=folder, new_parent=folder
        )

        self.assertFalse(success)
        self.assertIn("itself", error.lower())

    def test_move_folder_prevents_descendant_move(self):
        """Should prevent moving folder into its descendant."""
        parent, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent"
        )
        child, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent
        )
        grandchild, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Grandchild", parent=child
        )

        success, error = DocumentFolderService.move_folder(
            user=self.owner, folder=parent, new_parent=grandchild
        )

        self.assertFalse(success)
        self.assertIn("subfolder", error.lower())

    def test_delete_folder_success(self):
        """Should delete folder."""
        folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder"
        )
        folder_id = folder.id

        success, error = DocumentFolderService.delete_folder(
            user=self.owner, folder=folder
        )

        self.assertTrue(success)
        self.assertEqual(error, "")
        self.assertFalse(CorpusFolder.objects.filter(id=folder_id).exists())

    def test_delete_folder_reparents_children(self):
        """Should reparent children when deleting folder."""
        parent, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent"
        )
        child, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent
        )
        grandchild, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Grandchild", parent=child
        )

        success, error = DocumentFolderService.delete_folder(
            user=self.owner, folder=child, move_children_to_parent=True
        )

        self.assertTrue(success)
        grandchild.refresh_from_db()
        self.assertEqual(grandchild.parent, parent)


class TestDocumentFolderServiceDocumentOps(DocumentFolderServiceTestBase):
    """Test document-in-folder operations."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@test.com", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.owner,
            is_public=False,
        )

        # Signal is disconnected in setUpClass, so we can create directly
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.owner,
            pdf_file="test.pdf",
        )

        # Create DocumentPath to establish document in corpus
        self.document_path = DocumentPath.objects.create(
            document=self.document,
            corpus=self.corpus,
            creator=self.owner,
            folder=None,
            path="/test.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

        self.folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="TestFolder"
        )

    def test_move_document_to_folder_updates_both_systems(self):
        """Should update both DocumentPath and CorpusDocumentFolder."""
        success, error = DocumentFolderService.move_document_to_folder(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
            folder=self.folder,
        )

        self.assertTrue(success)
        self.assertEqual(error, "")

        # Check DocumentPath
        path = DocumentPath.objects.get(
            document=self.document,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertEqual(path.folder, self.folder)

        # Check CorpusDocumentFolder (legacy)
        assignment = CorpusDocumentFolder.objects.get(
            document=self.document,
            corpus=self.corpus,
        )
        self.assertEqual(assignment.folder, self.folder)

    def test_move_document_to_root_clears_folder(self):
        """Should clear folder assignment when moving to root."""
        # First move to folder
        DocumentFolderService.move_document_to_folder(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
            folder=self.folder,
        )

        # Then move to root
        success, error = DocumentFolderService.move_document_to_folder(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
            folder=None,
        )

        self.assertTrue(success)

        # Check DocumentPath
        path = DocumentPath.objects.get(
            document=self.document,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertIsNone(path.folder)

        # Check CorpusDocumentFolder is removed
        self.assertFalse(
            CorpusDocumentFolder.objects.filter(
                document=self.document,
                corpus=self.corpus,
            ).exists()
        )

    def test_bulk_move_documents(self):
        """Should bulk move multiple documents."""
        # Signal is disconnected in setUpClass, so we can create directly
        doc2 = Document.objects.create(
            title="Doc 2", creator=self.owner, pdf_file="test2.pdf"
        )
        doc3 = Document.objects.create(
            title="Doc 3", creator=self.owner, pdf_file="test3.pdf"
        )

        DocumentPath.objects.create(
            document=doc2,
            corpus=self.corpus,
            creator=self.owner,
            folder=None,
            path="/test2.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )
        DocumentPath.objects.create(
            document=doc3,
            corpus=self.corpus,
            creator=self.owner,
            folder=None,
            path="/test3.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

        moved_count, error = DocumentFolderService.move_documents_to_folder(
            user=self.owner,
            document_ids=[self.document.id, doc2.id, doc3.id],
            corpus=self.corpus,
            folder=self.folder,
        )

        self.assertEqual(moved_count, 3)
        self.assertEqual(error, "")

        # Verify all moved
        self.assertEqual(
            DocumentPath.objects.filter(
                corpus=self.corpus,
                folder=self.folder,
                is_current=True,
                is_deleted=False,
            ).count(),
            3,
        )

    def test_get_folder_documents(self):
        """Should return documents in folder."""
        # Move document to folder
        DocumentFolderService.move_document_to_folder(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
            folder=self.folder,
        )

        docs = DocumentFolderService.get_folder_documents(
            user=self.owner,
            corpus_id=self.corpus.id,
            folder_id=self.folder.id,
        )

        self.assertEqual(docs.count(), 1)
        self.assertEqual(docs.first(), self.document)

    def test_get_folder_documents_count_matches_list(self):
        """Folder document count should match document list count."""
        # Move document to folder
        DocumentFolderService.move_document_to_folder(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
            folder=self.folder,
        )

        count = DocumentFolderService.get_folder_document_count(
            user=self.owner, folder=self.folder
        )
        docs = DocumentFolderService.get_folder_documents(
            user=self.owner,
            corpus_id=self.corpus.id,
            folder_id=self.folder.id,
        )

        self.assertEqual(count, docs.count())

    def test_soft_delete_document(self):
        """Should soft-delete document."""
        success, error = DocumentFolderService.soft_delete_document(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        self.assertTrue(success)
        self.assertEqual(error, "")

        # Original path should be non-current
        old_path = DocumentPath.objects.get(id=self.document_path.id)
        self.assertFalse(old_path.is_current)

        # New deleted path should exist
        deleted_path = DocumentPath.objects.get(
            document=self.document,
            corpus=self.corpus,
            is_current=True,
        )
        self.assertTrue(deleted_path.is_deleted)

    def test_get_deleted_documents(self):
        """Should return soft-deleted documents."""
        DocumentFolderService.soft_delete_document(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        deleted = DocumentFolderService.get_deleted_documents(
            user=self.owner,
            corpus_id=self.corpus.id,
        )

        self.assertEqual(deleted.count(), 1)
        self.assertEqual(deleted.first().document, self.document)

    def test_restore_document(self):
        """Should restore soft-deleted document."""
        DocumentFolderService.soft_delete_document(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        deleted_path = DocumentPath.objects.get(
            document=self.document,
            corpus=self.corpus,
            is_current=True,
            is_deleted=True,
        )

        success, error = DocumentFolderService.restore_document(
            user=self.owner,
            document_path=deleted_path,
        )

        self.assertTrue(success)
        self.assertEqual(error, "")

        # Deleted path should be non-current
        deleted_path.refresh_from_db()
        self.assertFalse(deleted_path.is_current)

        # New restored path should exist
        restored_path = DocumentPath.objects.get(
            document=self.document,
            corpus=self.corpus,
            is_current=True,
        )
        self.assertFalse(restored_path.is_deleted)


class TestDocumentFolderServiceReadOps(TransactionTestCase):
    """Test read operations."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@test.com", password="test"
        )
        self.viewer = User.objects.create_user(
            username="viewer", email="viewer@test.com", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.owner,
            is_public=False,
        )

    def test_get_visible_folders_with_permission(self):
        """Should return folders when user has permission."""
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder1"
        )
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder2"
        )

        folders = DocumentFolderService.get_visible_folders(
            user=self.owner,
            corpus_id=self.corpus.id,
        )

        self.assertEqual(folders.count(), 2)

    def test_get_visible_folders_without_permission(self):
        """Should return empty queryset without permission."""
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder"
        )

        folders = DocumentFolderService.get_visible_folders(
            user=self.viewer,
            corpus_id=self.corpus.id,
        )

        self.assertEqual(folders.count(), 0)

    def test_get_folder_by_id_idor_protection(self):
        """Should return None for inaccessible folder (IDOR protection)."""
        folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Folder"
        )

        result = DocumentFolderService.get_folder_by_id(
            user=self.viewer,
            folder_id=folder.id,
        )

        self.assertIsNone(result)

    def test_get_folder_tree(self):
        """Should return nested folder tree structure."""
        parent, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Parent"
        )
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Child", parent=parent
        )

        tree = DocumentFolderService.get_folder_tree(
            user=self.owner,
            corpus_id=self.corpus.id,
        )

        self.assertEqual(len(tree), 1)
        self.assertEqual(tree[0]["name"], "Parent")
        self.assertEqual(len(tree[0]["children"]), 1)
        self.assertEqual(tree[0]["children"][0]["name"], "Child")

    def test_search_folders(self):
        """Should search folders by name."""
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Contracts"
        )
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Legal Documents"
        )
        DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="Other"
        )

        results = DocumentFolderService.search_folders(
            user=self.owner,
            corpus_id=self.corpus.id,
            query="contract",
        )

        self.assertEqual(results.count(), 1)
        self.assertEqual(results.first().name, "Contracts")


class TestDocumentFolderServiceDualSystem(DocumentFolderServiceTestBase):
    """Test dual-system consistency (DocumentPath + CorpusDocumentFolder)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@test.com", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.owner,
            is_public=False,
        )

        # Signal is disconnected in setUpClass, so we can create directly
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.owner,
            pdf_file="test.pdf",
        )

        self.document_path = DocumentPath.objects.create(
            document=self.document,
            corpus=self.corpus,
            creator=self.owner,
            folder=None,
            path="/test.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

        self.folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="TestFolder"
        )

    def test_dual_system_sync_on_move(self):
        """Both systems should be updated on document move."""
        # Move to folder
        DocumentFolderService.move_document_to_folder(
            self.owner, self.document, self.corpus, self.folder
        )

        # Verify DocumentPath
        path = DocumentPath.objects.get(
            document=self.document, corpus=self.corpus, is_current=True
        )
        self.assertEqual(path.folder, self.folder)

        # Verify CorpusDocumentFolder
        cdf = CorpusDocumentFolder.objects.get(
            document=self.document, corpus=self.corpus
        )
        self.assertEqual(cdf.folder, self.folder)

    def test_dual_system_sync_on_delete_folder(self):
        """Both systems should clear folder on folder delete."""
        # Move to folder first
        DocumentFolderService.move_document_to_folder(
            self.owner, self.document, self.corpus, self.folder
        )

        # Delete folder
        DocumentFolderService.delete_folder(self.owner, self.folder)

        # Verify DocumentPath folder is NULL
        path = DocumentPath.objects.get(
            document=self.document, corpus=self.corpus, is_current=True
        )
        self.assertIsNone(path.folder)

        # Verify CorpusDocumentFolder folder is NULL
        cdf = CorpusDocumentFolder.objects.get(
            document=self.document, corpus=self.corpus
        )
        self.assertIsNone(cdf.folder)

    def test_legacy_only_documents_included(self):
        """Documents with only CorpusDocumentFolder should be included."""
        # Signal is disconnected in setUpClass, so we can create directly
        # Create document with only legacy assignment (no DocumentPath)
        legacy_doc = Document.objects.create(
            title="Legacy Doc", creator=self.owner, pdf_file="legacy.pdf"
        )

        CorpusDocumentFolder.objects.create(
            document=legacy_doc, corpus=self.corpus, folder=self.folder
        )

        # Should be found in folder documents
        docs = DocumentFolderService.get_folder_documents(
            self.owner, self.corpus.id, self.folder.id
        )

        self.assertIn(legacy_doc, docs)


class TestDocumentFolderServiceDocumentLifecycle(DocumentFolderServiceTestBase):
    """Test document lifecycle operations (create, add-to-corpus, remove)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@test.com", password="test"
        )
        self.other_user = User.objects.create_user(
            username="other", email="other@test.com", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.owner,
            is_public=False,
        )

        # Create a document for add-to-corpus tests
        self.document = Document.objects.create(
            title="Source Document",
            creator=self.owner,
            pdf_file="source.pdf",
        )

        self.folder, _ = DocumentFolderService.create_folder(
            user=self.owner, corpus=self.corpus, name="TestFolder"
        )

    def test_check_user_upload_quota_not_capped(self):
        """Non-capped user should always pass quota check."""
        self.owner.is_usage_capped = False
        self.owner.save()

        can_upload, error = DocumentFolderService.check_user_upload_quota(self.owner)

        self.assertTrue(can_upload)
        self.assertEqual(error, "")

    def test_add_document_to_corpus_success(self):
        """Should add document to corpus creating isolated copy."""
        corpus_doc, status, error = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        self.assertIsNotNone(corpus_doc)
        self.assertIn(status, ["added", "already_exists"])
        self.assertEqual(error, "")

        # Should be a different document (isolated copy)
        self.assertNotEqual(corpus_doc.id, self.document.id)

        # Should have source_document set for provenance
        self.assertEqual(corpus_doc.source_document, self.document)

        # Should have DocumentPath linking to corpus
        path_exists = DocumentPath.objects.filter(
            document=corpus_doc,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        ).exists()
        self.assertTrue(path_exists)

    def test_add_document_to_corpus_with_folder(self):
        """Should add document to specific folder in corpus."""
        corpus_doc, status, error = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
            folder=self.folder,
        )

        self.assertIsNotNone(corpus_doc)
        self.assertEqual(error, "")

        # Check DocumentPath has folder set
        path = DocumentPath.objects.get(
            document=corpus_doc,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertEqual(path.folder, self.folder)

    def test_add_document_to_corpus_permission_denied(self):
        """Should fail without corpus write permission."""
        corpus_doc, status, error = DocumentFolderService.add_document_to_corpus(
            user=self.other_user,
            document=self.document,
            corpus=self.corpus,
        )

        self.assertIsNone(corpus_doc)
        self.assertIn("Permission denied", error)

    def test_add_document_to_corpus_deduplication_with_hash(self):
        """Adding same document twice should return existing copy when hash is set."""
        # Set a hash on the document to enable deduplication
        self.document.pdf_file_hash = "test_hash_12345"
        self.document.save()

        corpus_doc1, status1, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        corpus_doc2, status2, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        # Second add should find existing (deduplication based on hash)
        self.assertIsNotNone(corpus_doc1)
        self.assertIsNotNone(corpus_doc2)
        self.assertEqual(corpus_doc1.id, corpus_doc2.id)
        self.assertEqual(status2, "already_exists")

    def test_add_documents_to_corpus_bulk(self):
        """Should bulk add multiple documents."""
        doc2 = Document.objects.create(
            title="Doc 2", creator=self.owner, pdf_file="doc2.pdf"
        )
        doc3 = Document.objects.create(
            title="Doc 3", creator=self.owner, pdf_file="doc3.pdf"
        )

        added_count, added_ids, error = DocumentFolderService.add_documents_to_corpus(
            user=self.owner,
            document_ids=[self.document.id, doc2.id, doc3.id],
            corpus=self.corpus,
        )

        self.assertEqual(added_count, 3)
        self.assertEqual(len(added_ids), 3)
        self.assertEqual(error, "")

    def test_remove_document_from_corpus_success(self):
        """Should soft-delete document from corpus."""
        # First add document
        corpus_doc, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        # Then remove
        success, error = DocumentFolderService.remove_document_from_corpus(
            user=self.owner,
            document=corpus_doc,
            corpus=self.corpus,
        )

        self.assertTrue(success)
        self.assertEqual(error, "")

        # Should have deleted DocumentPath
        deleted_path = DocumentPath.objects.get(
            document=corpus_doc,
            corpus=self.corpus,
            is_current=True,
        )
        self.assertTrue(deleted_path.is_deleted)

    def test_remove_document_from_corpus_permission_denied(self):
        """Should fail without corpus write permission."""
        # First add document
        corpus_doc, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        # Try to remove as different user
        success, error = DocumentFolderService.remove_document_from_corpus(
            user=self.other_user,
            document=corpus_doc,
            corpus=self.corpus,
        )

        self.assertFalse(success)
        self.assertIn("Permission denied", error)

    def test_remove_documents_from_corpus_bulk(self):
        """Should bulk remove multiple documents."""
        doc2 = Document.objects.create(
            title="Doc 2", creator=self.owner, pdf_file="doc2.pdf"
        )

        # Add documents
        corpus_doc1, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )
        corpus_doc2, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=doc2,
            corpus=self.corpus,
        )

        # Remove bulk
        removed_count, error = DocumentFolderService.remove_documents_from_corpus(
            user=self.owner,
            document_ids=[corpus_doc1.id, corpus_doc2.id],
            corpus=self.corpus,
        )

        self.assertEqual(removed_count, 2)
        self.assertEqual(error, "")

    def test_get_document_by_id_owner_access(self):
        """Owner should be able to get their document."""
        doc = DocumentFolderService.get_document_by_id(
            user=self.owner,
            document_id=self.document.id,
        )

        self.assertIsNotNone(doc)
        self.assertEqual(doc.id, self.document.id)

    def test_get_document_by_id_no_access(self):
        """Should return None without access (IDOR protection)."""
        doc = DocumentFolderService.get_document_by_id(
            user=self.other_user,
            document_id=self.document.id,
        )

        self.assertIsNone(doc)

    def test_get_document_by_id_public_access(self):
        """Public documents should be accessible to anyone."""
        self.document.is_public = True
        self.document.save()

        doc = DocumentFolderService.get_document_by_id(
            user=self.other_user,
            document_id=self.document.id,
        )

        self.assertIsNotNone(doc)

    def test_get_corpus_documents(self):
        """Should return all documents in corpus."""
        # Add some documents
        corpus_doc1, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        doc2 = Document.objects.create(
            title="Doc 2", creator=self.owner, pdf_file="doc2.pdf"
        )
        corpus_doc2, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=doc2,
            corpus=self.corpus,
        )

        # Get corpus documents
        docs = DocumentFolderService.get_corpus_documents(
            user=self.owner,
            corpus=self.corpus,
        )

        self.assertEqual(docs.count(), 2)
        self.assertIn(corpus_doc1, docs)
        self.assertIn(corpus_doc2, docs)

    def test_get_corpus_documents_excludes_deleted(self):
        """Should exclude soft-deleted documents by default."""
        corpus_doc, _, _ = DocumentFolderService.add_document_to_corpus(
            user=self.owner,
            document=self.document,
            corpus=self.corpus,
        )

        # Remove the document
        DocumentFolderService.remove_document_from_corpus(
            user=self.owner,
            document=corpus_doc,
            corpus=self.corpus,
        )

        # Should not appear in default query
        docs = DocumentFolderService.get_corpus_documents(
            user=self.owner,
            corpus=self.corpus,
            include_deleted=False,
        )

        self.assertNotIn(corpus_doc, docs)
