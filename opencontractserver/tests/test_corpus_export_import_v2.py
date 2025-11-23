"""
Comprehensive tests for V2 corpus export/import functionality.

Tests cover:
- Individual export utilities for V2 components
- Individual import utilities for V2 components
- Full V2 round-trip export/import
- V1 backward compatibility
- Edge cases and data integrity
"""

import json
import pathlib
import zipfile

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TransactionTestCase
from django.utils import timezone

from opencontractserver.annotations.models import (
    DOC_TYPE_LABEL,
    RELATIONSHIP_LABEL,
    TOKEN_LABEL,
    Annotation,
    AnnotationLabel,
    LabelSet,
    StructuralAnnotationSet,
)
from opencontractserver.conversations.models import (
    ChatMessage,
    Conversation,
    MessageVote,
)
from opencontractserver.corpuses.models import (
    Corpus,
    CorpusDescriptionRevision,
    CorpusFolder,
    TemporaryFileHandle,
)
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.tasks.export_tasks_v2 import package_corpus_export_v2
from opencontractserver.tasks.import_tasks_v2 import import_corpus_v2
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.users.models import UserExport
from opencontractserver.utils.export_v2 import (
    package_agent_config,
    package_conversations,
    package_corpus_folders,
    package_document_paths,
    package_md_description_revisions,
    package_structural_annotation_set,
)
from opencontractserver.utils.import_v2 import (
    import_agent_config,
    import_corpus_folders,
    import_md_description_revisions,
    import_structural_annotation_set,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()

pytestmark = pytest.mark.django_db


class TestV2ExportUtilities(TransactionTestCase):
    """Test individual V2 export utility functions."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")

        # Create label set
        self.labelset = LabelSet.objects.create(
            title="Test LabelSet", creator=self.user
        )

        # Create labels
        self.text_label = AnnotationLabel.objects.create(
            text="Test Label",
            description="Test label description",
            label_type=TOKEN_LABEL,
            creator=self.user,
        )
        self.doc_label = AnnotationLabel.objects.create(
            text="Doc Label",
            label_type=DOC_TYPE_LABEL,
            creator=self.user,
        )
        self.rel_label = AnnotationLabel.objects.create(
            text="Rel Label",
            label_type=RELATIONSHIP_LABEL,
            creator=self.user,
        )
        self.labelset.annotation_labels.add(
            self.text_label, self.doc_label, self.rel_label
        )

        # Create corpus
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test Description",
            label_set=self.labelset,
            creator=self.user,
            corpus_agent_instructions="Test corpus instructions",
            document_agent_instructions="Test document instructions",
            allow_comments=True,
        )
        set_permissions_for_obj_to_user(self.user, self.corpus, [PermissionTypes.ALL])

    def test_package_structural_annotation_set(self):
        """Test exporting a structural annotation set."""
        # Create structural annotation set
        pawls_content = [
            {"page": {"index": 0, "width": 600, "height": 800}, "tokens": []}
        ]
        txt_content = "Test document content"

        struct_set = StructuralAnnotationSet.objects.create(
            content_hash="test_hash_123",
            parser_name="docling",
            parser_version="1.0",
            page_count=1,
            token_count=10,
            pawls_parse_file=ContentFile(
                json.dumps(pawls_content).encode(), name="pawls.json"
            ),
            txt_extract_file=ContentFile(txt_content.encode(), name="text.txt"),
            creator=self.user,
        )

        # Create structural annotations
        Annotation.objects.create(
            structural_set=struct_set,
            annotation_label=self.text_label,
            raw_text="Test annotation",
            page=0,
            json={"0": {"bounds": {}, "tokensJsons": [], "rawText": "Test"}},
            structural=True,
            creator=self.user,
        )

        # Export
        result = package_structural_annotation_set(struct_set)

        # Verify
        self.assertIsNotNone(result)
        self.assertEqual(result["content_hash"], "test_hash_123")
        self.assertEqual(result["parser_name"], "docling")
        self.assertEqual(result["page_count"], 1)
        self.assertEqual(len(result["structural_annotations"]), 1)
        self.assertEqual(result["txt_content"], txt_content)

    def test_package_corpus_folders(self):
        """Test exporting corpus folder hierarchy."""
        # Create folder hierarchy
        root_folder = CorpusFolder.objects.create(
            corpus=self.corpus,
            name="Root Folder",
            description="Root description",
            creator=self.user,
        )

        CorpusFolder.objects.create(
            corpus=self.corpus,
            name="Child Folder",
            parent=root_folder,
            creator=self.user,
        )

        # Export
        result = package_corpus_folders(self.corpus)

        # Verify
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["name"], "Root Folder")
        self.assertIsNone(result[0]["parent_id"])
        self.assertEqual(result[1]["name"], "Child Folder")
        self.assertIsNotNone(result[1]["parent_id"])

    def test_package_document_paths(self):
        """Test exporting DocumentPath version trees."""
        # Create document
        doc = Document.objects.create(
            title="Test Doc",
            pdf_file_hash="doc_hash_123",
            creator=self.user,
            page_count=1,
        )

        # Create document paths with version history
        path1 = DocumentPath.objects.create(
            document=doc,
            corpus=self.corpus,
            path="/documents/test.pdf",
            version_number=1,
            is_current=False,
            creator=self.user,
        )

        DocumentPath.objects.create(
            document=doc,
            corpus=self.corpus,
            path="/documents/test.pdf",
            version_number=2,
            parent=path1,
            is_current=True,
            creator=self.user,
        )

        # Export
        result = package_document_paths(self.corpus)

        # Verify
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["version_number"], 1)
        self.assertIsNone(result[0]["parent_version_number"])
        self.assertEqual(result[1]["version_number"], 2)
        self.assertEqual(result[1]["parent_version_number"], 1)

    def test_package_agent_config(self):
        """Test exporting agent configuration."""
        result = package_agent_config(self.corpus)

        self.assertEqual(
            result["corpus_agent_instructions"], "Test corpus instructions"
        )
        self.assertEqual(
            result["document_agent_instructions"], "Test document instructions"
        )

    def test_package_md_description_revisions(self):
        """Test exporting markdown description and revisions."""
        # Set markdown description
        md_content = "# Test Corpus\n\nThis is a test."
        self.corpus.md_description.save(
            "description.md", ContentFile(md_content.encode())
        )

        # Create revisions
        CorpusDescriptionRevision.objects.create(
            corpus=self.corpus,
            author=self.user,
            version=1,
            diff="Initial version",
            snapshot=md_content,
            checksum_base="",
            checksum_full="abc123",
        )

        # Export
        current_md, revisions = package_md_description_revisions(self.corpus)

        # Verify
        self.assertEqual(current_md, md_content)
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0]["version"], 1)

    def test_package_conversations(self):
        """Test exporting conversations and messages."""
        # Create conversation
        conv = Conversation.objects.create(
            chat_with_corpus=self.corpus,
            title="Test Thread",
            conversation_type="thread",
            creator=self.user,
        )

        # Create message
        msg = ChatMessage.objects.create(
            conversation=conv,
            content="Test message",
            msg_type="HUMAN",
            creator=self.user,
        )

        # Create vote
        MessageVote.objects.create(message=msg, vote_type="upvote", creator=self.user)

        # Export
        conversations, messages, votes = package_conversations(self.corpus)

        # Verify
        self.assertEqual(len(conversations), 1)
        self.assertEqual(conversations[0]["title"], "Test Thread")
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["content"], "Test message")
        self.assertEqual(len(votes), 1)
        self.assertEqual(votes[0]["vote_type"], "upvote")


class TestV2ImportUtilities(TransactionTestCase):
    """Test individual V2 import utility functions."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")

        # Create label set
        self.labelset = LabelSet.objects.create(
            title="Test LabelSet", creator=self.user
        )

        # Create labels
        self.text_label = AnnotationLabel.objects.create(
            text="Test Label",
            description="Test label description",
            label_type=TOKEN_LABEL,
            creator=self.user,
        )
        self.labelset.annotation_labels.add(self.text_label)

        # Create corpus
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            label_set=self.labelset,
            creator=self.user,
        )

    def test_import_structural_annotation_set(self):
        """Test importing a structural annotation set."""
        struct_data = {
            "content_hash": "import_hash_123",
            "parser_name": "docling",
            "parser_version": "1.0",
            "page_count": 1,
            "token_count": 10,
            "pawls_file_content": [
                {"page": {"index": 0, "width": 600, "height": 800}, "tokens": []}
            ],
            "txt_content": "Test content",
            "structural_annotations": [
                {
                    "id": "1",
                    "annotationLabel": "Test Label",
                    "rawText": "Test",
                    "page": 0,
                    "annotation_json": {},
                    "parent_id": None,
                    "annotation_type": "header",
                    "structural": True,
                }
            ],
            "structural_relationships": [],
        }

        label_lookup = {"Test Label": self.text_label}

        # Import
        result = import_structural_annotation_set(struct_data, label_lookup, self.user)

        # Verify
        self.assertIsNotNone(result)
        self.assertEqual(result.content_hash, "import_hash_123")
        self.assertEqual(result.structural_annotations.count(), 1)

        # Test deduplication - importing same hash should return existing
        result2 = import_structural_annotation_set(struct_data, label_lookup, self.user)
        self.assertEqual(result.id, result2.id)

    def test_import_corpus_folders(self):
        """Test importing corpus folder hierarchy."""
        folders_data = [
            {
                "id": "folder_1",
                "name": "Root",
                "description": "",
                "color": "#05313d",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": None,
                "path": "Root",
            },
            {
                "id": "folder_2",
                "name": "Child",
                "description": "",
                "color": "#05313d",
                "icon": "folder",
                "tags": ["test"],
                "is_public": False,
                "parent_id": "folder_1",
                "path": "Root/Child",
            },
        ]

        # Import
        result = import_corpus_folders(folders_data, self.corpus, self.user)

        # Verify
        self.assertEqual(len(result), 2)
        self.assertIn("folder_1", result)
        self.assertIn("folder_2", result)

        child = result["folder_2"]
        self.assertEqual(child.name, "Child")
        self.assertEqual(child.parent, result["folder_1"])
        self.assertEqual(child.tags, ["test"])

    def test_import_agent_config(self):
        """Test importing agent configuration."""
        config_data = {
            "corpus_agent_instructions": "Imported corpus instructions",
            "document_agent_instructions": "Imported document instructions",
        }

        # Import
        import_agent_config(config_data, self.corpus)

        # Verify
        self.corpus.refresh_from_db()
        self.assertEqual(
            self.corpus.corpus_agent_instructions, "Imported corpus instructions"
        )
        self.assertEqual(
            self.corpus.document_agent_instructions, "Imported document instructions"
        )

    def test_import_md_description_revisions(self):
        """Test importing markdown description and revisions."""
        md_description = "# Imported Corpus\n\nImported content."
        revisions_data = [
            {
                "version": 1,
                "diff": "Initial",
                "snapshot": md_description,
                "checksum_base": "",
                "checksum_full": "def456",
                "created": timezone.now().isoformat(),
                "author_email": self.user.email,
            }
        ]

        # Import
        import_md_description_revisions(
            md_description, revisions_data, self.corpus, self.user
        )

        # Verify
        self.corpus.refresh_from_db()
        self.assertTrue(self.corpus.md_description.name)

        with self.corpus.md_description.open("r") as f:
            content = f.read()
            self.assertEqual(content, md_description)

        revisions = CorpusDescriptionRevision.objects.filter(corpus=self.corpus)
        self.assertEqual(revisions.count(), 1)


class TestV2FullRoundTrip(TransactionTestCase):
    """Test complete V2 export/import round-trip."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")

        # Create comprehensive test corpus
        self.labelset = LabelSet.objects.create(
            title="Test LabelSet", creator=self.user
        )

        self.text_label = AnnotationLabel.objects.create(
            text="Test Label",
            description="Test label description",
            label_type=TOKEN_LABEL,
            creator=self.user,
        )
        self.labelset.annotation_labels.add(self.text_label)

        self.corpus = Corpus.objects.create(
            title="Test Corpus V2",
            description="Test corpus for V2 export/import",
            label_set=self.labelset,
            creator=self.user,
            corpus_agent_instructions="Test instructions",
            post_processors=["test.processor"],
            allow_comments=True,
        )
        set_permissions_for_obj_to_user(self.user, self.corpus, [PermissionTypes.ALL])

        # Create folder
        self.folder = CorpusFolder.objects.create(
            corpus=self.corpus,
            name="Test Folder",
            creator=self.user,
        )

        # Create structural annotation set
        self.struct_set = StructuralAnnotationSet.objects.create(
            content_hash="test_content_hash",
            parser_name="docling",
            page_count=1,
            pawls_parse_file=ContentFile(
                json.dumps([{"page": {"index": 0}, "tokens": []}]).encode(),
                name="pawls.json",
            ),
            txt_extract_file=ContentFile(b"Test content", name="text.txt"),
            creator=self.user,
        )

        # Create structural annotation
        Annotation.objects.create(
            structural_set=self.struct_set,
            annotation_label=self.text_label,
            raw_text="Header",
            structural=True,
            creator=self.user,
        )

        # Create document with structural set
        # Create a minimal valid PDF
        minimal_pdf = (
            b"%PDF-1.4\n"
            b"1 0 obj <</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj <</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
            b"3 0 obj <</Type/Page/Parent 2 0 R/Resources<<>>/MediaBox[0 0 612 792]>>endobj\n"
            b"xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n"
            b"0000000115 00000 n\ntrailer <</Size 4/Root 1 0 R>>\nstartxref\n204\n%%EOF\n"
        )
        self.doc = Document.objects.create(
            title="Test Document",
            pdf_file=ContentFile(minimal_pdf, name="test.pdf"),
            pdf_file_hash="test_content_hash",
            structural_annotation_set=self.struct_set,
            creator=self.user,
            page_count=1,
        )

        # Create document path
        self.doc_path = DocumentPath.objects.create(
            document=self.doc,
            corpus=self.corpus,
            folder=self.folder,
            path="/documents/test.pdf",
            version_number=1,
            creator=self.user,
        )

        # Create user annotation
        self.annot = Annotation.objects.create(
            document=self.doc,
            corpus=self.corpus,
            annotation_label=self.text_label,
            raw_text="Test annotation",
            page=0,
            creator=self.user,
        )

    def test_v2_export_import_round_trip(self):
        """Test full V2 export followed by import."""
        # Create export
        export = UserExport.objects.create(backend_lock=True, creator=self.user)

        # Run export
        package_corpus_export_v2(
            export_id=export.id,
            corpus_pk=self.corpus.id,
            include_conversations=False,
        )

        # Verify export was created
        export.refresh_from_db()
        self.assertIsNotNone(export.file)
        self.assertTrue(export.file.name.endswith("_EXPORT_V2.zip"))

        # Read and verify export content
        with export.file.open("rb") as f:
            with zipfile.ZipFile(f, "r") as zip_ref:
                # Check data.json exists
                self.assertIn("data.json", zip_ref.namelist())

                # Load and verify data.json
                with zip_ref.open("data.json") as data_file:
                    data = json.load(data_file)

                    # Verify version
                    self.assertEqual(data["version"], "2.0")

                    # Verify V2 fields present
                    self.assertIn("structural_annotation_sets", data)
                    self.assertIn("folders", data)
                    self.assertIn("document_paths", data)
                    self.assertIn("agent_config", data)

                    # Verify structural set exported
                    self.assertEqual(len(data["structural_annotation_sets"]), 1)
                    self.assertIn(
                        "test_content_hash", data["structural_annotation_sets"]
                    )

                    # Verify folder exported
                    self.assertEqual(len(data["folders"]), 1)
                    self.assertEqual(data["folders"][0]["name"], "Test Folder")

                    # Verify document path exported
                    self.assertEqual(len(data["document_paths"]), 1)

        # Now test import
        temp_file = TemporaryFileHandle.objects.create()
        export.file.open("rb")
        temp_file.file.save("test_import.zip", export.file)
        export.file.close()

        # Import into new corpus
        imported_corpus_id = import_corpus_v2(
            temporary_file_handle_id=temp_file.id,
            user_id=self.user.id,
            seed_corpus_id=None,
        )

        # Verify import succeeded
        self.assertIsNotNone(imported_corpus_id)

        imported_corpus = Corpus.objects.get(id=imported_corpus_id)
        self.assertEqual(imported_corpus.title, "Test Corpus V2")
        self.assertEqual(imported_corpus.corpus_agent_instructions, "Test instructions")
        self.assertEqual(imported_corpus.post_processors, ["test.processor"])

        # Verify folder imported
        imported_folders = CorpusFolder.objects.filter(corpus=imported_corpus)
        self.assertEqual(imported_folders.count(), 1)
        self.assertEqual(imported_folders.first().name, "Test Folder")

        # Verify structural set reused (not duplicated)
        struct_sets = StructuralAnnotationSet.objects.filter(
            content_hash="test_content_hash"
        )
        self.assertEqual(struct_sets.count(), 1)  # Same one reused

        # Verify document imported
        imported_docs = DocumentPath.objects.filter(
            corpus=imported_corpus, is_current=True, is_deleted=False
        ).values_list("document_id", flat=True)
        self.assertEqual(len(imported_docs), 1)

        # Verify user annotation imported
        imported_annots = Annotation.objects.filter(
            corpus=imported_corpus, structural=False
        )
        self.assertTrue(imported_annots.exists())


class TestV1BackwardCompatibility(TransactionTestCase):
    """Test that V1 exports can still be imported."""

    fixtures_path = pathlib.Path(__file__).parent / "fixtures"

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="12345678")

    def test_v1_export_imports_successfully(self):
        """Test that an old V1 export can be imported with new V2 importer."""
        # Check if V1 test fixture exists
        v1_fixture = self.fixtures_path / "Test_Corpus_EXPORT.zip"
        if not v1_fixture.exists():
            self.skipTest("V1 test fixture not available")

        # Read V1 export
        with open(v1_fixture, "rb") as f:
            zip_content = f.read()

        # Create temporary file
        temp_file = TemporaryFileHandle.objects.create()
        temp_file.file.save("v1_import.zip", ContentFile(zip_content))

        # Import using V2 importer
        imported_corpus_id = import_corpus_v2(
            temporary_file_handle_id=temp_file.id,
            user_id=self.user.id,
            seed_corpus_id=None,
        )

        # Verify import succeeded
        self.assertIsNotNone(imported_corpus_id)

        imported_corpus = Corpus.objects.get(id=imported_corpus_id)
        self.assertIsNotNone(imported_corpus)

        # Verify documents were imported
        docs = Document.objects.filter(
            id__in=DocumentPath.objects.filter(
                corpus=imported_corpus, is_current=True, is_deleted=False
            ).values_list("document_id", flat=True)
        )
        self.assertGreater(docs.count(), 0)

        # Verify annotations were imported
        annots = Annotation.objects.filter(corpus=imported_corpus)
        self.assertGreater(annots.count(), 0)


class TestV2EdgeCases(TransactionTestCase):
    """Test edge cases and error handling."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")

    def test_export_empty_corpus(self):
        """Test exporting an empty corpus."""
        labelset = LabelSet.objects.create(title="Empty Set", creator=self.user)
        corpus = Corpus.objects.create(
            title="Empty Corpus",
            label_set=labelset,
            creator=self.user,
        )

        export = UserExport.objects.create(backend_lock=True, creator=self.user)

        # Should not fail on empty corpus
        package_corpus_export_v2(
            export_id=export.id,
            corpus_pk=corpus.id,
            include_conversations=False,
        )

        # Refresh export to get saved file
        export.refresh_from_db()
        self.assertIsNotNone(export.file)

    def test_export_with_conversations(self):
        """Test exporting corpus with conversations included."""
        labelset = LabelSet.objects.create(title="Test Set", creator=self.user)
        corpus = Corpus.objects.create(
            title="Corpus with Convos",
            label_set=labelset,
            creator=self.user,
        )

        # Create conversation
        Conversation.objects.create(
            chat_with_corpus=corpus,
            title="Test Thread",
            creator=self.user,
        )

        export = UserExport.objects.create(backend_lock=True, creator=self.user)

        # Export with conversations
        package_corpus_export_v2(
            export_id=export.id,
            corpus_pk=corpus.id,
            include_conversations=True,
        )

        # Verify conversations in export
        export.refresh_from_db()
        with export.file.open("rb") as f:
            with zipfile.ZipFile(f, "r") as zip_ref:
                with zip_ref.open("data.json") as data_file:
                    data = json.load(data_file)
                    self.assertIn("conversations", data)
                    self.assertEqual(len(data["conversations"]), 1)

    def test_import_without_optional_fields(self):
        """Test importing V2 export that's missing optional fields."""
        # This tests graceful handling of exports without conversations, etc.
        labelset = LabelSet.objects.create(title="Test Set", creator=self.user)
        corpus = Corpus.objects.create(
            title="Minimal Corpus",
            label_set=labelset,
            creator=self.user,
        )

        export = UserExport.objects.create(backend_lock=True, creator=self.user)

        # Export without conversations
        package_corpus_export_v2(
            export_id=export.id,
            corpus_pk=corpus.id,
            include_conversations=False,
        )

        # Refresh export to get saved file
        export.refresh_from_db()

        # Import
        temp_file = TemporaryFileHandle.objects.create()
        export.file.open("rb")
        temp_file.file.save("minimal.zip", export.file)
        export.file.close()

        imported_id = import_corpus_v2(
            temporary_file_handle_id=temp_file.id,
            user_id=self.user.id,
            seed_corpus_id=None,
        )

        # Should succeed even without optional fields
        self.assertIsNotNone(imported_id)
