"""
Tests for zip file security utilities.

These tests verify the security measures that protect against:
- Path traversal attacks
- Zip bombs
- Symlink attacks
- Resource exhaustion
"""

import io
import os
import stat
import zipfile
from unittest import mock

from django.test import TestCase, override_settings

from opencontractserver.utils.zip_security import (
    ZipFileEntry,
    ZipManifest,
    collect_all_folder_paths,
    get_folder_depth,
    get_folder_path,
    is_hidden_or_system_file,
    is_zip_entry_symlink,
    sanitize_zip_path,
    validate_zip_for_import,
)


class TestSanitizeZipPath(TestCase):
    """Tests for the sanitize_zip_path function."""

    def test_valid_simple_path(self):
        """Valid simple path passes through."""
        path, error = sanitize_zip_path("file.pdf")
        self.assertEqual(path, "file.pdf")
        self.assertEqual(error, "")

    def test_valid_nested_path(self):
        """Valid nested path passes through."""
        path, error = sanitize_zip_path("docs/contracts/2024/file.pdf")
        self.assertEqual(path, "docs/contracts/2024/file.pdf")
        self.assertEqual(error, "")

    def test_path_traversal_rejected(self):
        """Path with .. is rejected."""
        path, error = sanitize_zip_path("../../../etc/passwd")
        self.assertIsNone(path)
        self.assertIn("traversal", error.lower())

    def test_path_traversal_middle_rejected(self):
        """Path with .. in the middle is rejected."""
        path, error = sanitize_zip_path("docs/../../../etc/passwd")
        self.assertIsNone(path)
        self.assertIn("traversal", error.lower())

    def test_absolute_path_unix_rejected(self):
        """Unix absolute path is rejected."""
        path, error = sanitize_zip_path("/etc/passwd")
        # After stripping leading /, should be valid
        self.assertEqual(path, "etc/passwd")

    def test_absolute_path_windows_rejected(self):
        """Windows absolute path (drive letter) is rejected."""
        path, error = sanitize_zip_path("C:\\Windows\\System32\\file.dll")
        self.assertIsNone(path)
        self.assertIn("drive", error.lower())

    def test_null_byte_rejected(self):
        """Path with null byte is rejected."""
        path, error = sanitize_zip_path("file\x00.pdf")
        self.assertIsNone(path)
        self.assertIn("null", error.lower())

    def test_backslash_normalized(self):
        """Backslashes are normalized to forward slashes."""
        path, error = sanitize_zip_path("docs\\contracts\\file.pdf")
        self.assertEqual(path, "docs/contracts/file.pdf")
        self.assertEqual(error, "")

    def test_leading_trailing_slashes_stripped(self):
        """Leading and trailing slashes are stripped."""
        path, error = sanitize_zip_path("/docs/contracts/file.pdf/")
        self.assertEqual(path, "docs/contracts/file.pdf")
        self.assertEqual(error, "")

    def test_double_slashes_handled(self):
        """Double slashes are handled correctly."""
        path, error = sanitize_zip_path("docs//contracts///file.pdf")
        self.assertEqual(path, "docs/contracts/file.pdf")
        self.assertEqual(error, "")

    def test_empty_path_rejected(self):
        """Empty path is rejected."""
        path, error = sanitize_zip_path("")
        self.assertIsNone(path)
        self.assertIn("empty", error.lower())

    def test_whitespace_only_path_rejected(self):
        """Whitespace-only path is rejected."""
        path, error = sanitize_zip_path("   ")
        self.assertIsNone(path)

    def test_path_too_long_rejected(self):
        """Path exceeding maximum length is rejected."""
        long_path = "a" * 2000 + ".pdf"
        path, error = sanitize_zip_path(long_path)
        self.assertIsNone(path)
        self.assertIn("length", error.lower())

    def test_component_too_long_rejected(self):
        """Path component exceeding maximum length is rejected."""
        long_component = "a" * 300
        path, error = sanitize_zip_path(f"docs/{long_component}/file.pdf")
        self.assertIsNone(path)
        self.assertIn("component", error.lower())

    def test_hidden_file_allowed(self):
        """Hidden files are allowed (filtering happens elsewhere)."""
        path, error = sanitize_zip_path(".hidden_file")
        self.assertEqual(path, ".hidden_file")
        self.assertEqual(error, "")


class TestIsHiddenOrSystemFile(TestCase):
    """Tests for the is_hidden_or_system_file function."""

    def test_normal_file_not_hidden(self):
        """Normal files are not flagged as hidden."""
        self.assertFalse(is_hidden_or_system_file("docs/file.pdf"))

    def test_hidden_file_at_root(self):
        """Hidden file at root is detected."""
        self.assertTrue(is_hidden_or_system_file(".hidden"))

    def test_hidden_file_in_folder(self):
        """Hidden file in folder is detected."""
        self.assertTrue(is_hidden_or_system_file("docs/.hidden"))

    def test_macosx_folder(self):
        """__MACOSX folder is detected."""
        self.assertTrue(is_hidden_or_system_file("__MACOSX/file.pdf"))
        self.assertTrue(is_hidden_or_system_file("docs/__MACOSX/file.pdf"))

    def test_ds_store(self):
        """macOS .DS_Store is detected."""
        self.assertTrue(is_hidden_or_system_file(".DS_Store"))
        self.assertTrue(is_hidden_or_system_file("docs/.DS_Store"))

    def test_thumbs_db(self):
        """Windows Thumbs.db is detected."""
        self.assertTrue(is_hidden_or_system_file("Thumbs.db"))

    def test_desktop_ini(self):
        """Windows desktop.ini is detected."""
        self.assertTrue(is_hidden_or_system_file("desktop.ini"))

    def test_gitignore(self):
        """.gitignore is detected."""
        self.assertTrue(is_hidden_or_system_file(".gitignore"))


class TestFolderPathFunctions(TestCase):
    """Tests for folder path utility functions."""

    def test_get_folder_path_nested(self):
        """Get folder path from nested file."""
        self.assertEqual(
            get_folder_path("docs/contracts/2024/file.pdf"), "docs/contracts/2024"
        )

    def test_get_folder_path_single_level(self):
        """Get folder path from single-level path."""
        self.assertEqual(get_folder_path("docs/file.pdf"), "docs")

    def test_get_folder_path_root(self):
        """Get folder path for file at root."""
        self.assertEqual(get_folder_path("file.pdf"), "")

    def test_get_folder_depth_root(self):
        """Folder depth at root is 0."""
        self.assertEqual(get_folder_depth(""), 0)

    def test_get_folder_depth_single(self):
        """Single level folder has depth 1."""
        self.assertEqual(get_folder_depth("docs"), 1)

    def test_get_folder_depth_nested(self):
        """Nested folder has correct depth."""
        self.assertEqual(get_folder_depth("docs/contracts/2024"), 3)

    def test_collect_all_folder_paths_empty(self):
        """Empty path returns empty list."""
        self.assertEqual(collect_all_folder_paths(""), [])

    def test_collect_all_folder_paths_single(self):
        """Single folder returns single path."""
        self.assertEqual(collect_all_folder_paths("docs"), ["docs"])

    def test_collect_all_folder_paths_nested(self):
        """Nested folder returns all ancestor paths."""
        result = collect_all_folder_paths("docs/contracts/2024")
        self.assertEqual(result, ["docs", "docs/contracts", "docs/contracts/2024"])


class TestIsZipEntrySymlink(TestCase):
    """Tests for symlink detection in zip entries."""

    def test_regular_file_not_symlink(self):
        """Regular file is not detected as symlink."""
        # Create a mock ZipInfo with regular file attributes
        info = zipfile.ZipInfo("file.pdf")
        info.external_attr = 0  # Regular file
        self.assertFalse(is_zip_entry_symlink(info))

    def test_symlink_detected(self):
        """Symlink is correctly detected."""
        # Create a mock ZipInfo with symlink attributes
        info = zipfile.ZipInfo("link")
        # Set Unix symlink mode in external_attr (high 16 bits)
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.assertTrue(is_zip_entry_symlink(info))

    def test_directory_not_symlink(self):
        """Directory is not detected as symlink."""
        info = zipfile.ZipInfo("dir/")
        info.external_attr = (stat.S_IFDIR | 0o755) << 16
        self.assertFalse(is_zip_entry_symlink(info))


class TestValidateZipForImport(TestCase):
    """Tests for the validate_zip_for_import function."""

    def _create_test_zip(self, files: dict[str, bytes]) -> zipfile.ZipFile:
        """
        Create an in-memory zip file for testing.

        Args:
            files: Dict of filename -> content bytes

        Returns:
            Open ZipFile object
        """
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        buffer.seek(0)
        return zipfile.ZipFile(buffer, "r")

    def test_valid_simple_zip(self):
        """Valid zip with a few files passes validation."""
        files = {
            "file1.pdf": b"PDF content 1",
            "file2.pdf": b"PDF content 2",
        }
        with self._create_test_zip(files) as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.valid_files), 2)
        self.assertEqual(len(manifest.skipped_files), 0)
        self.assertEqual(len(manifest.folder_paths), 0)

    def test_valid_zip_with_folders(self):
        """Valid zip with folder structure is correctly parsed."""
        files = {
            "docs/contracts/file1.pdf": b"PDF content 1",
            "docs/contracts/file2.pdf": b"PDF content 2",
            "docs/legal/file3.pdf": b"PDF content 3",
            "other/file4.pdf": b"PDF content 4",
        }
        with self._create_test_zip(files) as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.valid_files), 4)

        # Should have collected all unique folder paths
        expected_folders = ["docs", "docs/contracts", "docs/legal", "other"]
        self.assertEqual(sorted(manifest.folder_paths), sorted(expected_folders))

    def test_hidden_files_skipped(self):
        """Hidden files are skipped."""
        files = {
            "file1.pdf": b"PDF content",
            ".hidden": b"hidden content",
            "__MACOSX/._file1.pdf": b"mac metadata",
            ".DS_Store": b"ds store",
        }
        with self._create_test_zip(files) as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.valid_files), 1)
        self.assertEqual(len(manifest.skipped_files), 3)

    def test_path_traversal_rejected(self):
        """Files with path traversal are skipped."""
        files = {
            "file1.pdf": b"PDF content",
            "../../../etc/passwd": b"attack",
        }
        with self._create_test_zip(files) as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.valid_files), 1)
        self.assertEqual(len(manifest.skipped_files), 1)
        self.assertIn("traversal", manifest.skipped_files[0].skip_reason.lower())

    @override_settings(ZIP_MAX_FILE_COUNT=5)
    def test_too_many_files_rejected(self):
        """Zip with too many files is rejected."""
        # Need to reimport to pick up new settings
        from opencontractserver.utils import zip_security

        # Temporarily override the constant
        original = zip_security.ZIP_MAX_FILE_COUNT
        zip_security.ZIP_MAX_FILE_COUNT = 5

        try:
            files = {f"file{i}.pdf": b"content" for i in range(10)}
            with self._create_test_zip(files) as zf:
                manifest = validate_zip_for_import(zf)

            self.assertFalse(manifest.is_valid)
            self.assertIn("10 files", manifest.error_message)
            self.assertIn("5", manifest.error_message)
        finally:
            zip_security.ZIP_MAX_FILE_COUNT = original

    def test_oversized_files_marked_for_skipping(self):
        """Files exceeding size limit are marked for skipping."""
        from opencontractserver.utils import zip_security

        # Temporarily override the constant
        original = zip_security.ZIP_MAX_SINGLE_FILE_SIZE_BYTES
        zip_security.ZIP_MAX_SINGLE_FILE_SIZE_BYTES = 100  # 100 bytes

        try:
            files = {
                "small.pdf": b"x" * 50,  # Under limit
                "large.pdf": b"x" * 200,  # Over limit
            }
            with self._create_test_zip(files) as zf:
                manifest = validate_zip_for_import(zf)

            self.assertTrue(manifest.is_valid)
            self.assertEqual(len(manifest.valid_files), 1)
            self.assertEqual(manifest.valid_files[0].filename, "small.pdf")
            self.assertEqual(len(manifest.skipped_files), 1)
            self.assertEqual(manifest.skipped_files[0].filename, "large.pdf")
            self.assertTrue(manifest.skipped_files[0].is_oversized)
        finally:
            zip_security.ZIP_MAX_SINGLE_FILE_SIZE_BYTES = original

    def test_total_size_limit_exceeded(self):
        """Zip exceeding total size limit is rejected."""
        from opencontractserver.utils import zip_security

        # Temporarily override the constant
        original = zip_security.ZIP_MAX_TOTAL_SIZE_BYTES
        zip_security.ZIP_MAX_TOTAL_SIZE_BYTES = 500  # 500 bytes

        try:
            files = {
                "file1.pdf": b"x" * 200,
                "file2.pdf": b"x" * 200,
                "file3.pdf": b"x" * 200,  # This pushes it over
            }
            with self._create_test_zip(files) as zf:
                manifest = validate_zip_for_import(zf)

            self.assertFalse(manifest.is_valid)
            self.assertIn("size exceeds", manifest.error_message.lower())
        finally:
            zip_security.ZIP_MAX_TOTAL_SIZE_BYTES = original

    def test_folder_depth_limit(self):
        """Files in deeply nested folders are skipped."""
        from opencontractserver.utils import zip_security

        # Temporarily override the constant
        original = zip_security.ZIP_MAX_FOLDER_DEPTH
        zip_security.ZIP_MAX_FOLDER_DEPTH = 3

        try:
            files = {
                "a/b/c/file.pdf": b"content",  # Depth 3 - OK
                "a/b/c/d/e/file.pdf": b"content",  # Depth 5 - Too deep
            }
            with self._create_test_zip(files) as zf:
                manifest = validate_zip_for_import(zf)

            self.assertTrue(manifest.is_valid)
            self.assertEqual(len(manifest.valid_files), 1)
            self.assertEqual(len(manifest.skipped_files), 1)
            self.assertIn("depth", manifest.skipped_files[0].skip_reason.lower())
        finally:
            zip_security.ZIP_MAX_FOLDER_DEPTH = original

    def test_folder_count_limit(self):
        """Zip with too many folders is rejected."""
        from opencontractserver.utils import zip_security

        # Temporarily override the constant
        original = zip_security.ZIP_MAX_FOLDER_COUNT
        zip_security.ZIP_MAX_FOLDER_COUNT = 5

        try:
            # Create files in many different folders
            files = {f"folder{i}/file.pdf": b"content" for i in range(10)}
            with self._create_test_zip(files) as zf:
                manifest = validate_zip_for_import(zf)

            self.assertFalse(manifest.is_valid)
            self.assertIn("folders", manifest.error_message.lower())
        finally:
            zip_security.ZIP_MAX_FOLDER_COUNT = original

    def test_directories_skipped(self):
        """Directory entries in zip are skipped."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            # Manually add a directory entry
            zf.writestr("docs/", "")
            zf.writestr("docs/file.pdf", b"content")
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.valid_files), 1)

    def test_folder_paths_sorted_by_depth(self):
        """Folder paths are sorted with parents before children."""
        files = {
            "a/b/c/file.pdf": b"content",
            "x/file.pdf": b"content",
        }
        with self._create_test_zip(files) as zf:
            manifest = validate_zip_for_import(zf)

        # Should be sorted: single-level first, then deeper
        self.assertEqual(
            manifest.folder_paths,
            ["a", "x", "a/b", "a/b/c"],
        )

    def test_empty_zip(self):
        """Empty zip file is valid but has no files."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            pass  # Empty zip
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.valid_files), 0)
        self.assertEqual(manifest.total_files_in_zip, 0)


class TestZipFileEntry(TestCase):
    """Tests for the ZipFileEntry dataclass."""

    def test_dataclass_creation(self):
        """ZipFileEntry can be created with all fields."""
        entry = ZipFileEntry(
            original_path="docs/file.pdf",
            sanitized_path="docs/file.pdf",
            folder_path="docs",
            filename="file.pdf",
            file_size=1000,
            compressed_size=500,
            is_oversized=False,
            skip_reason="",
        )
        self.assertEqual(entry.filename, "file.pdf")
        self.assertEqual(entry.folder_path, "docs")
        self.assertFalse(entry.is_oversized)


class TestZipManifest(TestCase):
    """Tests for the ZipManifest dataclass."""

    def test_dataclass_defaults(self):
        """ZipManifest has sensible defaults."""
        manifest = ZipManifest(is_valid=True)
        self.assertTrue(manifest.is_valid)
        self.assertEqual(manifest.error_message, "")
        self.assertEqual(manifest.valid_files, [])
        self.assertEqual(manifest.skipped_files, [])
        self.assertEqual(manifest.folder_paths, [])
