from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.llms.tools.core_tools import move_document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestMoveDocument(TestCase):
    """Tests for the move_document agent tool (intra-corpus folder move)."""

    def setUp(self):
        self.user = User.objects.create_user(username="mover", password="pw")
        self.other_user = User.objects.create_user(username="other", password="pw")

        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)

        # Create folders
        self.folder_a = CorpusFolder.objects.create(
            title="Folder A", corpus=self.corpus, creator=self.user
        )
        self.folder_b = CorpusFolder.objects.create(
            title="Folder B", corpus=self.corpus, creator=self.user
        )

        # Create a document and add it to the corpus (in folder_a)
        self.original_doc = Document.objects.create(
            title="Test Doc",
            description="A test document",
            creator=self.user,
        )
        self.original_doc.txt_extract_file.save(
            "test.txt", ContentFile(b"Test content")
        )

        self.corpus_doc, _status, _path = self.corpus.add_document(
            document=self.original_doc,
            user=self.user,
            folder=self.folder_a,
        )
        set_permissions_for_obj_to_user(
            self.user, self.corpus_doc, [PermissionTypes.CRUD]
        )

    def test_move_to_folder(self):
        """Moving a document to another folder updates its path."""
        result = move_document(
            document_id=self.corpus_doc.id,
            corpus_id=self.corpus.id,
            author_id=self.user.id,
            target_folder_id=self.folder_b.id,
        )

        self.assertEqual(result["status"], "moved")
        self.assertEqual(result["document_id"], self.corpus_doc.id)
        self.assertEqual(result["target_folder_id"], self.folder_b.id)

        # Verify the path was updated
        path = DocumentPath.objects.get(
            document=self.corpus_doc,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertEqual(path.folder_id, self.folder_b.id)

    def test_move_to_root(self):
        """Moving a document with target_folder_id=None goes to corpus root."""
        result = move_document(
            document_id=self.corpus_doc.id,
            corpus_id=self.corpus.id,
            author_id=self.user.id,
            target_folder_id=None,
        )

        self.assertEqual(result["status"], "moved")
        self.assertIsNone(result["target_folder_id"])

        path = DocumentPath.objects.get(
            document=self.corpus_doc,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        )
        self.assertIsNone(path.folder_id)

    def test_move_nonexistent_document_raises(self):
        """Moving a nonexistent document raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            move_document(
                document_id=999999,
                corpus_id=self.corpus.id,
                author_id=self.user.id,
                target_folder_id=self.folder_b.id,
            )
        self.assertIn("does not exist", str(ctx.exception))

    def test_move_nonexistent_folder_raises(self):
        """Moving to a nonexistent folder raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            move_document(
                document_id=self.corpus_doc.id,
                corpus_id=self.corpus.id,
                author_id=self.user.id,
                target_folder_id=999999,
            )
        self.assertIn("does not exist", str(ctx.exception))

    def test_move_folder_wrong_corpus_raises(self):
        """Moving to a folder in a different corpus raises ValueError."""
        other_corpus = Corpus.objects.create(title="Other Corpus", creator=self.user)
        wrong_folder = CorpusFolder.objects.create(
            title="Wrong Folder", corpus=other_corpus, creator=self.user
        )

        with self.assertRaises(ValueError) as ctx:
            move_document(
                document_id=self.corpus_doc.id,
                corpus_id=self.corpus.id,
                author_id=self.user.id,
                target_folder_id=wrong_folder.id,
            )
        # DocumentFolderService returns error: folder doesn't belong to corpus
        self.assertIn("Move failed", str(ctx.exception))

    def test_move_no_write_permission_raises(self):
        """User without write permission on the corpus gets error."""
        private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.other_user
        )

        with self.assertRaises(ValueError) as ctx:
            move_document(
                document_id=self.corpus_doc.id,
                corpus_id=private_corpus.id,
                author_id=self.user.id,
                target_folder_id=None,
            )
        self.assertIn("Move failed", str(ctx.exception))

    def test_move_document_not_in_corpus_raises(self):
        """Moving a document that isn't in the corpus raises ValueError."""
        other_corpus = Corpus.objects.create(title="Other Corpus", creator=self.user)

        with self.assertRaises(ValueError) as ctx:
            move_document(
                document_id=self.corpus_doc.id,
                corpus_id=other_corpus.id,
                author_id=self.user.id,
                target_folder_id=None,
            )
        self.assertIn("Move failed", str(ctx.exception))
