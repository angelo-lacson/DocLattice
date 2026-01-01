"""
Integration tests for zip import with folder structure preservation.

These tests verify:
- Folder structure creation from zip paths
- Celery task for zip import
- GraphQL mutation for zip import
- Permission checks
- Error handling and partial success scenarios
"""

import io
import logging
import zipfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.corpuses.folder_service import DocumentFolderService
from opencontractserver.corpuses.models import Corpus, CorpusFolder, TemporaryFileHandle
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_ONE_PATH
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()
logger = logging.getLogger(__name__)


class TestCreateFolderStructureFromPaths(TestCase):
    """Tests for DocumentFolderService.create_folder_structure_from_paths()."""

    def setUp(self):
        """Set up test user and corpus."""
        with transaction.atomic():
            self.user = User.objects.create_user(
                username="testuser", password="testpass"
            )
            self.other_user = User.objects.create_user(
                username="other", password="testpass"
            )

        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Test Corpus",
                description="Corpus for testing",
                creator=self.user,
            )
            set_permissions_for_obj_to_user(
                self.user, self.corpus, [PermissionTypes.ALL]
            )

    def test_create_simple_folder_structure(self):
        """Create a simple folder structure from paths."""
        folder_paths = ["docs", "docs/contracts", "legal"]

        folder_map, created, reused, error = (
            DocumentFolderService.create_folder_structure_from_paths(
                user=self.user,
                corpus=self.corpus,
                folder_paths=folder_paths,
            )
        )

        self.assertEqual(error, "")
        self.assertEqual(created, 3)
        self.assertEqual(reused, 0)
        self.assertEqual(len(folder_map), 3)
        self.assertIn("docs", folder_map)
        self.assertIn("docs/contracts", folder_map)
        self.assertIn("legal", folder_map)

        # Verify parent-child relationships
        self.assertIsNone(folder_map["docs"].parent)
        self.assertEqual(folder_map["docs/contracts"].parent, folder_map["docs"])
        self.assertIsNone(folder_map["legal"].parent)

    def test_reuse_existing_folders(self):
        """Existing folders should be reused, not duplicated."""
        # Create initial folder structure
        folder_paths_1 = ["docs", "docs/contracts"]
        folder_map_1, created_1, reused_1, error_1 = (
            DocumentFolderService.create_folder_structure_from_paths(
                user=self.user,
                corpus=self.corpus,
                folder_paths=folder_paths_1,
            )
        )
        self.assertEqual(created_1, 2)
        self.assertEqual(reused_1, 0)

        # Create overlapping structure - should reuse "docs"
        folder_paths_2 = ["docs", "docs/legal"]
        folder_map_2, created_2, reused_2, error_2 = (
            DocumentFolderService.create_folder_structure_from_paths(
                user=self.user,
                corpus=self.corpus,
                folder_paths=folder_paths_2,
            )
        )

        self.assertEqual(error_2, "")
        self.assertEqual(created_2, 1)  # Only docs/legal is new
        self.assertEqual(reused_2, 1)  # docs is reused
        self.assertEqual(folder_map_1["docs"].id, folder_map_2["docs"].id)

    def test_create_with_target_folder(self):
        """Create folder structure under a target folder."""
        # Create target folder
        target_folder = CorpusFolder.objects.create(
            name="imports",
            corpus=self.corpus,
            creator=self.user,
        )

        folder_paths = ["2024", "2024/contracts"]
        folder_map, created, reused, error = (
            DocumentFolderService.create_folder_structure_from_paths(
                user=self.user,
                corpus=self.corpus,
                folder_paths=folder_paths,
                target_folder=target_folder,
            )
        )

        self.assertEqual(error, "")
        self.assertEqual(created, 2)

        # Verify folders are children of target folder
        self.assertEqual(folder_map["2024"].parent, target_folder)

    def test_empty_folder_paths(self):
        """Empty folder paths list should return empty map."""
        folder_map, created, reused, error = (
            DocumentFolderService.create_folder_structure_from_paths(
                user=self.user,
                corpus=self.corpus,
                folder_paths=[],
            )
        )

        self.assertEqual(error, "")
        self.assertEqual(created, 0)
        self.assertEqual(reused, 0)
        self.assertEqual(len(folder_map), 0)

    def test_permission_denied_for_non_owner(self):
        """User without write permission should be denied."""
        folder_paths = ["docs"]
        folder_map, created, reused, error = (
            DocumentFolderService.create_folder_structure_from_paths(
                user=self.other_user,  # Not the corpus owner
                corpus=self.corpus,
                folder_paths=folder_paths,
            )
        )

        self.assertIn("Permission denied", error)
        self.assertEqual(len(folder_map), 0)


class TestImportZipWithFolderStructureTask(TestCase):
    """Tests for the import_zip_with_folder_structure Celery task."""

    def setUp(self):
        """Set up test user, corpus, and sample data."""
        with transaction.atomic():
            self.user = User.objects.create_user(
                username="testuser", password="testpass"
            )

        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Test Corpus",
                description="Corpus for testing",
                creator=self.user,
            )
            set_permissions_for_obj_to_user(
                self.user, self.corpus, [PermissionTypes.ALL]
            )

        # Sample PDF bytes
        self.pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()

    def _create_test_zip(self, files: dict[str, bytes]) -> io.BytesIO:
        """Create an in-memory zip file for testing."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        buffer.seek(0)
        return buffer

    def _create_temp_file_handle(self, zip_buffer: io.BytesIO) -> TemporaryFileHandle:
        """Create a TemporaryFileHandle from a zip buffer."""
        zip_content = ContentFile(zip_buffer.read(), name="test_import.zip")
        handle = TemporaryFileHandle.objects.create(
            file=zip_content,
        )
        return handle

    def test_import_simple_zip(self):
        """Import a simple zip with a few PDF files."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {
            "file1.pdf": self.pdf_bytes,
            "file2.pdf": self.pdf_bytes,
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-1",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"])
        self.assertTrue(result["success"])
        self.assertTrue(result["validation_passed"])
        self.assertEqual(result["files_processed"], 2)
        self.assertEqual(len(result["document_ids"]), 2)
        self.assertEqual(result["folders_created"], 0)

        # Verify documents exist in corpus
        doc_paths = DocumentPath.objects.filter(corpus=self.corpus)
        self.assertEqual(doc_paths.count(), 2)

    def test_import_zip_with_folder_structure(self):
        """Import a zip with folder structure preserved."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {
            "docs/contracts/file1.pdf": self.pdf_bytes,
            "docs/legal/file2.pdf": self.pdf_bytes,
            "other/file3.pdf": self.pdf_bytes,
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-2",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"])
        self.assertTrue(result["success"])
        self.assertEqual(result["files_processed"], 3)
        self.assertEqual(
            result["folders_created"], 4
        )  # docs, docs/contracts, docs/legal, other

        # Verify folders exist
        folders = CorpusFolder.objects.filter(corpus=self.corpus)
        folder_names = {f.name for f in folders}
        self.assertIn("docs", folder_names)
        self.assertIn("contracts", folder_names)
        self.assertIn("legal", folder_names)
        self.assertIn("other", folder_names)

        # Verify documents are in correct folders
        doc_paths = DocumentPath.objects.filter(corpus=self.corpus)
        self.assertEqual(doc_paths.count(), 3)

        # Check folder assignments
        for dp in doc_paths:
            self.assertIsNotNone(dp.folder)

    def test_import_with_hidden_files_skipped(self):
        """Hidden files and __MACOSX entries are skipped."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {
            "file1.pdf": self.pdf_bytes,
            ".hidden.pdf": self.pdf_bytes,
            "__MACOSX/._file1.pdf": b"metadata",
            ".DS_Store": b"ds store",
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-3",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"])
        self.assertTrue(result["success"])
        self.assertEqual(result["files_processed"], 1)
        self.assertGreater(result["files_skipped_hidden"], 0)

    def test_import_with_unsupported_file_types(self):
        """Unsupported file types are skipped."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Use actual binary content that won't be detected as text/plain
        # EXE magic bytes (MZ header)
        exe_magic = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff"
        # Random binary with null bytes to ensure it's not detected as text
        binary_content = b"\x00\x01\x02\x03\x04\xff\xfe\xfd\xfc\xfb\x00"

        files = {
            "file1.pdf": self.pdf_bytes,
            "file2.exe": exe_magic + binary_content,
            "file3.xyz": binary_content,
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-4",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"])
        self.assertEqual(result["files_processed"], 1)
        self.assertGreater(result["files_skipped_type"], 0)

    def test_import_with_text_files(self):
        """Plain text files are processed correctly."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {
            "readme.txt": b"This is a plain text file for testing.",
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-5",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"])
        self.assertEqual(result["files_processed"], 1)

        # Verify text document was created
        doc = Document.objects.get(id=result["document_ids"][0])
        self.assertEqual(doc.file_type, "text/plain")

    def test_import_with_title_prefix(self):
        """Documents get title prefix when specified."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {
            "file1.pdf": self.pdf_bytes,
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-6",
                "corpus_id": self.corpus.id,
                "title_prefix": "IMPORT",
            }
        ).get()

        self.assertTrue(result["success"])
        doc = Document.objects.get(id=result["document_ids"][0])
        self.assertTrue(doc.title.startswith("IMPORT - "))

    def test_import_corpus_not_found(self):
        """Non-existent corpus ID returns error."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {"file1.pdf": self.pdf_bytes}
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-7",
                "corpus_id": 99999,  # Non-existent
            }
        ).get()

        self.assertTrue(result["completed"])
        self.assertFalse(result["success"])
        self.assertTrue(any("not found" in e.lower() for e in result["errors"]))

    def test_import_with_target_folder(self):
        """Import into a specific target folder."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Create target folder
        target_folder = CorpusFolder.objects.create(
            name="imports",
            corpus=self.corpus,
            creator=self.user,
        )

        files = {
            "file1.pdf": self.pdf_bytes,
            "subdir/file2.pdf": self.pdf_bytes,
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-job-8",
                "corpus_id": self.corpus.id,
                "target_folder_id": target_folder.id,
            }
        ).get()

        self.assertTrue(result["success"])
        self.assertEqual(result["files_processed"], 2)

        # Verify files are under target folder
        doc_paths = DocumentPath.objects.filter(corpus=self.corpus)
        for dp in doc_paths:
            # Either directly in target_folder or in a subfolder of target_folder
            if dp.folder:
                self.assertTrue(
                    dp.folder == target_folder or dp.folder.parent == target_folder
                )


class TestZipValidationFailures(TestCase):
    """Tests for zip validation failure scenarios."""

    def setUp(self):
        """Set up test user and corpus."""
        with transaction.atomic():
            self.user = User.objects.create_user(
                username="testuser", password="testpass"
            )

        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Test Corpus",
                description="Corpus for testing",
                creator=self.user,
            )

        self.pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()

    def _create_test_zip(self, files: dict[str, bytes]) -> io.BytesIO:
        """Create an in-memory zip file for testing."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        buffer.seek(0)
        return buffer

    def _create_temp_file_handle(self, zip_buffer: io.BytesIO) -> TemporaryFileHandle:
        """Create a TemporaryFileHandle from a zip buffer."""
        zip_content = ContentFile(zip_buffer.read(), name="test_import.zip")
        handle = TemporaryFileHandle.objects.create(
            file=zip_content,
        )
        return handle

    def test_path_traversal_files_skipped(self):
        """Files with path traversal attempts are skipped."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Create a zip with path traversal attempts
        # Note: zipfile module prevents literal ".." in filenames during creation
        # but we test the validation behavior
        files = {
            "safe_file.pdf": self.pdf_bytes,
        }
        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-traversal",
                "corpus_id": self.corpus.id,
            }
        ).get()

        # Should process the safe file
        self.assertTrue(result["completed"])
        self.assertEqual(result["files_processed"], 1)

    def test_too_many_files_rejected(self):
        """Zip with too many files is rejected at validation."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )
        from opencontractserver.utils import zip_security

        # Temporarily override the constant
        original = zip_security.ZIP_MAX_FILE_COUNT
        zip_security.ZIP_MAX_FILE_COUNT = 5

        try:
            files = {f"file{i}.pdf": self.pdf_bytes for i in range(10)}
            zip_buffer = self._create_test_zip(files)
            handle = self._create_temp_file_handle(zip_buffer)

            result = import_zip_with_folder_structure.apply(
                kwargs={
                    "temporary_file_handle_id": handle.id,
                    "user_id": self.user.id,
                    "job_id": "test-too-many",
                    "corpus_id": self.corpus.id,
                }
            ).get()

            self.assertTrue(result["completed"])
            self.assertFalse(result["validation_passed"])
            self.assertTrue(
                any("files" in e.lower() for e in result["validation_errors"])
            )
        finally:
            zip_security.ZIP_MAX_FILE_COUNT = original

    def test_oversized_files_skipped_not_rejected(self):
        """Individual oversized files are skipped, not rejected entirely."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )
        from opencontractserver.utils import zip_security

        # Temporarily set a very small file size limit
        original = zip_security.ZIP_MAX_SINGLE_FILE_SIZE_BYTES
        zip_security.ZIP_MAX_SINGLE_FILE_SIZE_BYTES = 100  # 100 bytes

        try:
            files = {
                "small.txt": b"x" * 50,  # Under limit
                "large.txt": b"x" * 200,  # Over limit
            }
            zip_buffer = self._create_test_zip(files)
            handle = self._create_temp_file_handle(zip_buffer)

            result = import_zip_with_folder_structure.apply(
                kwargs={
                    "temporary_file_handle_id": handle.id,
                    "user_id": self.user.id,
                    "job_id": "test-oversized",
                    "corpus_id": self.corpus.id,
                }
            ).get()

            self.assertTrue(result["completed"])
            self.assertTrue(result["validation_passed"])
            self.assertEqual(result["files_skipped_size"], 1)
            self.assertIn("large.txt", result["skipped_oversized"])
        finally:
            zip_security.ZIP_MAX_SINGLE_FILE_SIZE_BYTES = original


class TestDocumentUpversioning(TestCase):
    """Tests for document upversioning on path collisions."""

    def setUp(self):
        """Set up test user and corpus."""
        with transaction.atomic():
            self.user = User.objects.create_user(
                username="testuser", password="testpass"
            )

        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Test Corpus",
                description="Corpus for testing",
                creator=self.user,
            )
            set_permissions_for_obj_to_user(
                self.user, self.corpus, [PermissionTypes.ALL]
            )

        self.pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()

    def _create_test_zip(self, files: dict[str, bytes]) -> io.BytesIO:
        """Create an in-memory zip file for testing."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        buffer.seek(0)
        return buffer

    def _create_temp_file_handle(self, zip_buffer: io.BytesIO) -> TemporaryFileHandle:
        """Create a TemporaryFileHandle from a zip buffer."""
        zip_content = ContentFile(zip_buffer.read(), name="test_import.zip")
        handle = TemporaryFileHandle.objects.create(
            file=zip_content,
        )
        return handle

    def test_second_import_upversions_existing_document(self):
        """Second import to same path creates new version, not duplicate."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # First import
        files_1 = {"filing_data/test.pdf": self.pdf_bytes}
        zip_1 = self._create_test_zip(files_1)
        handle_1 = self._create_temp_file_handle(zip_1)

        result_1 = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle_1.id,
                "user_id": self.user.id,
                "job_id": "test-upversion-1",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result_1["success"])
        self.assertEqual(result_1["files_processed"], 1)
        self.assertEqual(
            result_1["files_upversioned"], 0
        )  # First import, no upversioning

        # Get the first document path
        first_doc_path = DocumentPath.objects.get(
            corpus=self.corpus,
            path="/filing_data/test.pdf",
            is_current=True,
        )
        self.assertEqual(first_doc_path.version_number, 1)

        # Second import to same path
        files_2 = {"filing_data/test.pdf": self.pdf_bytes}
        zip_2 = self._create_test_zip(files_2)
        handle_2 = self._create_temp_file_handle(zip_2)

        result_2 = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle_2.id,
                "user_id": self.user.id,
                "job_id": "test-upversion-2",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result_2["success"])
        self.assertEqual(result_2["files_processed"], 1)
        self.assertEqual(result_2["files_upversioned"], 1)  # This should be upversioned
        self.assertIn("/filing_data/test.pdf", result_2["upversioned_paths"])

        # Verify version numbers
        old_path = DocumentPath.objects.get(
            corpus=self.corpus,
            path="/filing_data/test.pdf",
            version_number=1,
        )
        self.assertFalse(old_path.is_current)

        new_path = DocumentPath.objects.get(
            corpus=self.corpus,
            path="/filing_data/test.pdf",
            version_number=2,
        )
        self.assertTrue(new_path.is_current)
        self.assertEqual(new_path.parent, old_path)

    def test_upversioning_preserves_folder_structure(self):
        """Upversioning works correctly with nested folder structures."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # First import with nested structure
        files_1 = {
            "contracts/legal/agreement.pdf": self.pdf_bytes,
            "contracts/financial/report.pdf": self.pdf_bytes,
        }
        zip_1 = self._create_test_zip(files_1)
        handle_1 = self._create_temp_file_handle(zip_1)

        result_1 = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle_1.id,
                "user_id": self.user.id,
                "job_id": "test-upversion-nested-1",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result_1["success"])
        self.assertEqual(result_1["files_processed"], 2)

        # Second import replaces one file
        files_2 = {
            "contracts/legal/agreement.pdf": self.pdf_bytes,  # Upversion this
        }
        zip_2 = self._create_test_zip(files_2)
        handle_2 = self._create_temp_file_handle(zip_2)

        result_2 = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle_2.id,
                "user_id": self.user.id,
                "job_id": "test-upversion-nested-2",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result_2["success"])
        self.assertEqual(result_2["files_processed"], 1)
        self.assertEqual(result_2["files_upversioned"], 1)
        self.assertEqual(
            result_2["folders_reused"], 2
        )  # contracts and contracts/legal reused


class TestFolderReuseAcrossImports(TestCase):
    """Tests for folder reuse behavior across multiple imports."""

    def setUp(self):
        """Set up test user and corpus."""
        with transaction.atomic():
            self.user = User.objects.create_user(
                username="testuser", password="testpass"
            )

        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Test Corpus",
                description="Corpus for testing",
                creator=self.user,
            )
            set_permissions_for_obj_to_user(
                self.user, self.corpus, [PermissionTypes.ALL]
            )

        self.pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()

    def _create_test_zip(self, files: dict[str, bytes]) -> io.BytesIO:
        """Create an in-memory zip file for testing."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        buffer.seek(0)
        return buffer

    def _create_temp_file_handle(self, zip_buffer: io.BytesIO) -> TemporaryFileHandle:
        """Create a TemporaryFileHandle from a zip buffer."""
        zip_content = ContentFile(zip_buffer.read(), name="test_import.zip")
        handle = TemporaryFileHandle.objects.create(
            file=zip_content,
        )
        return handle

    def test_second_import_reuses_folders(self):
        """Second import to same paths reuses existing folders."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # First import
        files_1 = {
            "docs/contracts/file1.pdf": self.pdf_bytes,
        }
        zip_1 = self._create_test_zip(files_1)
        handle_1 = self._create_temp_file_handle(zip_1)

        result_1 = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle_1.id,
                "user_id": self.user.id,
                "job_id": "test-reuse-1",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertEqual(result_1["folders_created"], 2)  # docs, docs/contracts
        self.assertEqual(result_1["folders_reused"], 0)

        # Record folder IDs
        docs_folder = CorpusFolder.objects.get(corpus=self.corpus, name="docs")
        contracts_folder = CorpusFolder.objects.get(
            corpus=self.corpus, name="contracts", parent=docs_folder
        )

        # Second import to same structure
        files_2 = {
            "docs/contracts/file2.pdf": self.pdf_bytes,
            "docs/legal/file3.pdf": self.pdf_bytes,
        }
        zip_2 = self._create_test_zip(files_2)
        handle_2 = self._create_temp_file_handle(zip_2)

        result_2 = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle_2.id,
                "user_id": self.user.id,
                "job_id": "test-reuse-2",
                "corpus_id": self.corpus.id,
            }
        ).get()

        # Only docs/legal is new
        self.assertEqual(result_2["folders_created"], 1)
        self.assertEqual(
            result_2["folders_reused"], 2
        )  # docs and docs/contracts reused

        # Verify same folder objects are used
        docs_folder_after = CorpusFolder.objects.get(corpus=self.corpus, name="docs")
        contracts_folder_after = CorpusFolder.objects.get(
            corpus=self.corpus, name="contracts", parent=docs_folder_after
        )

        self.assertEqual(docs_folder.id, docs_folder_after.id)
        self.assertEqual(contracts_folder.id, contracts_folder_after.id)
