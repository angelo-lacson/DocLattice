from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.llms.tools.core_tools import move_document_to_corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestMoveDocumentToCorpus(TestCase):
    """Tests for the move_document_to_corpus agent tool."""

    def setUp(self):
        self.user = User.objects.create_user(username="mover", password="pw")
        self.other_user = User.objects.create_user(username="other", password="pw")

        # Create source and target corpuses owned by the same user
        self.source_corpus = Corpus.objects.create(
            title="Source Corpus", creator=self.user
        )
        self.target_corpus = Corpus.objects.create(
            title="Target Corpus", creator=self.user
        )

        # Create a document and add it to the source corpus
        self.original_doc = Document.objects.create(
            title="Test Doc",
            description="A test document",
            creator=self.user,
        )
        self.original_doc.txt_extract_file.save(
            "test.txt", ContentFile(b"Test content")
        )

        # Add document to source corpus (creates isolated copy)
        self.corpus_doc, _status, _path = self.source_corpus.add_document(
            document=self.original_doc,
            user=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, self.corpus_doc, [PermissionTypes.CRUD]
        )

    def test_move_document_success(self):
        """Moving a document creates copy in target and removes from source."""
        result = move_document_to_corpus(
            document_id=self.corpus_doc.id,
            corpus_id=self.source_corpus.id,
            target_corpus_id=self.target_corpus.id,
            author_id=self.user.id,
        )

        self.assertEqual(result["status"], "moved")
        self.assertEqual(result["source_corpus_id"], self.source_corpus.id)
        self.assertEqual(result["target_corpus_id"], self.target_corpus.id)
        self.assertEqual(result["original_document_id"], self.corpus_doc.id)
        self.assertIsNotNone(result["new_document_id"])
        self.assertIsNone(result["target_folder_id"])

        # Verify document exists in target corpus
        new_doc_id = result["new_document_id"]
        target_path = DocumentPath.objects.filter(
            document_id=new_doc_id,
            corpus=self.target_corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertTrue(target_path.exists())

        # Verify document is removed from source corpus (soft-deleted)
        source_paths = DocumentPath.objects.filter(
            document=self.corpus_doc,
            corpus=self.source_corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertFalse(source_paths.exists())

    def test_move_document_to_folder(self):
        """Moving a document with a target folder places it correctly."""
        target_folder = CorpusFolder.objects.create(
            title="Target Folder",
            corpus=self.target_corpus,
            creator=self.user,
        )

        result = move_document_to_corpus(
            document_id=self.corpus_doc.id,
            corpus_id=self.source_corpus.id,
            target_corpus_id=self.target_corpus.id,
            author_id=self.user.id,
            target_folder_id=target_folder.id,
        )

        self.assertEqual(result["status"], "moved")
        self.assertEqual(result["target_folder_id"], target_folder.id)

        # Verify the new document is in the target folder
        new_doc_id = result["new_document_id"]
        target_path = DocumentPath.objects.get(
            document_id=new_doc_id,
            corpus=self.target_corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertEqual(target_path.folder_id, target_folder.id)

    def test_move_same_corpus_raises(self):
        """Moving to the same corpus raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            move_document_to_corpus(
                document_id=self.corpus_doc.id,
                corpus_id=self.source_corpus.id,
                target_corpus_id=self.source_corpus.id,
                author_id=self.user.id,
            )
        self.assertIn("same", str(ctx.exception).lower())

    def test_move_nonexistent_document_raises(self):
        """Moving a nonexistent document raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            move_document_to_corpus(
                document_id=999999,
                corpus_id=self.source_corpus.id,
                target_corpus_id=self.target_corpus.id,
                author_id=self.user.id,
            )
        self.assertIn("does not exist", str(ctx.exception))

    def test_move_nonexistent_target_corpus_raises(self):
        """Moving to a nonexistent target corpus raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            move_document_to_corpus(
                document_id=self.corpus_doc.id,
                corpus_id=self.source_corpus.id,
                target_corpus_id=999999,
                author_id=self.user.id,
            )
        self.assertIn("Target corpus", str(ctx.exception))

    def test_move_wrong_folder_corpus_raises(self):
        """Folder belonging to a different corpus raises ValueError."""
        wrong_folder = CorpusFolder.objects.create(
            title="Wrong Folder",
            corpus=self.source_corpus,
            creator=self.user,
        )

        with self.assertRaises(ValueError) as ctx:
            move_document_to_corpus(
                document_id=self.corpus_doc.id,
                corpus_id=self.source_corpus.id,
                target_corpus_id=self.target_corpus.id,
                author_id=self.user.id,
                target_folder_id=wrong_folder.id,
            )
        self.assertIn("does not belong to", str(ctx.exception))

    def test_move_no_write_permission_on_target(self):
        """User without write permission on target corpus gets error."""
        private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.other_user
        )

        with self.assertRaises(ValueError) as ctx:
            move_document_to_corpus(
                document_id=self.corpus_doc.id,
                corpus_id=self.source_corpus.id,
                target_corpus_id=private_corpus.id,
                author_id=self.user.id,
            )
        self.assertIn("Failed to add document", str(ctx.exception))
