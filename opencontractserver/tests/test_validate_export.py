"""
Tests for the standalone export validation utility.

These tests do NOT require Django — they exercise the pure-Python validator
against in-memory data.json structures.
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
import zipfile

from opencontractserver.utils.validate_export import (
    ValidationResult,
    main,
    validate_data_json,
    validate_export,
)

# ---------------------------------------------------------------------------
# Helpers to build minimal valid exports
# ---------------------------------------------------------------------------


def _minimal_v1_data() -> dict:
    """Return a minimal valid V1 data.json."""
    return {
        "annotated_docs": {
            "sample.pdf": {
                "title": "Sample",
                "content": "Hello world",
                "description": "A test document",
                "page_count": 1,
                "pawls_file_content": [
                    {
                        "page": {"width": 612.0, "height": 792.0, "index": 0},
                        "tokens": [
                            {
                                "x": 100,
                                "y": 100,
                                "width": 50,
                                "height": 12,
                                "text": "Hello",
                            },
                            {
                                "x": 160,
                                "y": 100,
                                "width": 50,
                                "height": 12,
                                "text": "world",
                            },
                        ],
                    }
                ],
                "doc_labels": ["Contract"],
                "labelled_text": [
                    {
                        "id": "annot_1",
                        "annotationLabel": "Clause",
                        "rawText": "Hello",
                        "page": 0,
                        "annotation_json": {
                            "0": {
                                "bounds": {
                                    "top": 100,
                                    "bottom": 112,
                                    "left": 100,
                                    "right": 150,
                                },
                                "tokensJsons": [{"pageIndex": 0, "tokenIndex": 0}],
                                "rawText": "Hello",
                            }
                        },
                        "parent_id": None,
                        "annotation_type": "TOKEN_LABEL",
                        "structural": False,
                    }
                ],
            }
        },
        "doc_labels": {
            "Contract": {
                "id": "1",
                "text": "Contract",
                "label_type": "DOC_TYPE_LABEL",
                "color": "#FF0000",
                "description": "A contract",
                "icon": "document",
            }
        },
        "text_labels": {
            "Clause": {
                "id": "2",
                "text": "Clause",
                "label_type": "TOKEN_LABEL",
                "color": "#0000FF",
                "description": "A clause",
                "icon": "tag",
            },
            "RelatesTo": {
                "id": "3",
                "text": "RelatesTo",
                "label_type": "RELATIONSHIP_LABEL",
                "color": "#00FF00",
                "description": "A relationship",
                "icon": "link",
            },
        },
        "corpus": {
            "id": 1,
            "title": "Test Corpus",
            "description": "Test",
            "icon_name": "icon.png",
            "icon_data": "",
            "creator": "test@example.com",
            "label_set": "1",
        },
        "label_set": {
            "id": "1",
            "title": "Test Labels",
            "description": "Test label set",
            "icon_name": "labels.png",
            "icon_data": "",
            "creator": "test@example.com",
        },
    }


def _minimal_v2_data() -> dict:
    """Return a minimal valid V2 data.json."""
    data = _minimal_v1_data()
    data["version"] = "2.0"
    data["structural_annotation_sets"] = {}
    data["folders"] = []
    data["document_paths"] = []
    data["relationships"] = []
    data["agent_config"] = {
        "corpus_agent_instructions": None,
        "document_agent_instructions": None,
    }
    data["md_description"] = None
    data["md_description_revisions"] = []
    data["post_processors"] = []
    return data


def _make_zip(data: dict, files: dict[str, bytes] | None = None) -> bytes:
    """
    Create an in-memory ZIP with data.json and optional extra files.

    Args:
        data: The data.json dict.
        files: Optional map of filename -> bytes to include in the ZIP.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", json.dumps(data))
        if files:
            for name, content in files.items():
                zf.writestr(name, content)
    return buf.getvalue()


def _write_and_validate(
    data: dict, files: dict[str, bytes] | None = None
) -> ValidationResult:
    """Write a ZIP to a temp file, validate it, clean up, and return result."""
    zip_bytes = _make_zip(data, files)
    fd, path = tempfile.mkstemp(suffix=".zip")
    try:
        os.write(fd, zip_bytes)
        os.close(fd)
        return validate_export(path)
    finally:
        os.unlink(path)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestValidationResult(unittest.TestCase):
    def test_empty_is_ok(self):
        r = ValidationResult()
        assert r.ok is True

    def test_warning_still_ok(self):
        r = ValidationResult()
        r.warn("something")
        assert r.ok is True

    def test_error_not_ok(self):
        r = ValidationResult()
        r.error("something")
        assert r.ok is False

    def test_summary(self):
        r = ValidationResult()
        r.warn("w1")
        r.error("e1")
        s = r.summary()
        assert "WARN" in s
        assert "ERROR" in s
        assert "INVALID" in s


class TestMinimalValidExport(unittest.TestCase):
    def test_v1_valid(self):
        data = _minimal_v1_data()
        result = _write_and_validate(data, {"sample.pdf": b"%PDF-fake"})
        assert result.ok, result.summary()

    def test_v2_valid(self):
        data = _minimal_v2_data()
        result = _write_and_validate(data, {"sample.pdf": b"%PDF-fake"})
        assert result.ok, result.summary()

    def test_validate_data_json_v1(self):
        data = _minimal_v1_data()
        result = validate_data_json(data)
        assert result.ok, result.summary()

    def test_validate_data_json_v2(self):
        data = _minimal_v2_data()
        result = validate_data_json(data)
        assert result.ok, result.summary()


class TestZipStructure(unittest.TestCase):
    def test_missing_file_in_zip(self):
        data = _minimal_v1_data()
        # Don't include sample.pdf in the ZIP
        result = _write_and_validate(data, {})
        assert not result.ok
        assert any("sample.pdf" in e for e in result.errors)

    def test_extra_file_warns(self):
        data = _minimal_v1_data()
        result = _write_and_validate(
            data, {"sample.pdf": b"pdf", "bonus.txt": b"extra"}
        )
        assert result.ok  # extra files are warnings, not errors
        assert any("unreferenced" in w for w in result.warnings)

    def test_directory_entries_not_flagged_as_unreferenced(self):
        """ZIP directory entries (e.g. 'documents/') should not warn."""
        data = _minimal_v1_data()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("data.json", json.dumps(data))
            zf.writestr("sample.pdf", b"pdf")
            zf.mkdir("documents")
        fd, path = tempfile.mkstemp(suffix=".zip")
        try:
            os.write(fd, buf.getvalue())
            os.close(fd)
            result = validate_export(path)
        finally:
            os.unlink(path)
        assert result.ok, result.summary()
        assert not any("documents/" in w for w in result.warnings)


class TestLabelValidation(unittest.TestCase):
    def test_missing_label_fields(self):
        data = _minimal_v1_data()
        del data["doc_labels"]["Contract"]["color"]
        result = validate_data_json(data)
        assert not result.ok
        assert any("color" in e for e in result.errors)

    def test_wrong_label_type_in_doc_labels(self):
        data = _minimal_v1_data()
        data["doc_labels"]["Contract"]["label_type"] = "TOKEN_LABEL"
        result = validate_data_json(data)
        assert not result.ok
        assert any("DOC_TYPE_LABEL" in e for e in result.errors)

    def test_invalid_label_type(self):
        data = _minimal_v1_data()
        data["text_labels"]["Clause"]["label_type"] = "BOGUS"
        result = validate_data_json(data)
        assert not result.ok
        assert any("BOGUS" in e for e in result.errors)

    def test_doc_type_label_in_text_labels_is_error(self):
        """DOC_TYPE_LABEL is not allowed in text_labels."""
        data = _minimal_v1_data()
        data["text_labels"]["BadLabel"] = {
            "id": "99",
            "text": "BadLabel",
            "label_type": "DOC_TYPE_LABEL",
            "color": "#FF0000",
            "description": "Wrong type",
            "icon": "x",
        }
        result = validate_data_json(data)
        assert not result.ok
        assert any("DOC_TYPE_LABEL" in e and "text_labels" in e for e in result.errors)


class TestDocumentValidation(unittest.TestCase):
    def test_missing_required_doc_field(self):
        data = _minimal_v1_data()
        del data["annotated_docs"]["sample.pdf"]["title"]
        result = validate_data_json(data)
        assert not result.ok
        assert any("title" in e for e in result.errors)

    def test_page_count_mismatch_warns(self):
        data = _minimal_v1_data()
        data["annotated_docs"]["sample.pdf"]["page_count"] = 3
        result = validate_data_json(data)
        assert any("page_count" in w for w in result.warnings)

    def test_bad_doc_label_reference(self):
        data = _minimal_v1_data()
        data["annotated_docs"]["sample.pdf"]["doc_labels"] = ["Nonexistent"]
        result = validate_data_json(data)
        assert not result.ok
        assert any("Nonexistent" in e for e in result.errors)


class TestAnnotationValidation(unittest.TestCase):
    def test_null_annotation_id_not_treated_as_valid(self):
        """An annotation with id=None should not add 'None' to the ID set."""
        data = _minimal_v1_data()
        data["annotated_docs"]["sample.pdf"]["labelled_text"].append(
            {
                "id": None,
                "annotationLabel": "Clause",
                "rawText": "world",
                "page": 0,
                "annotation_json": {},
                "parent_id": None,
                "annotation_type": "TOKEN_LABEL",
                "structural": False,
            }
        )
        # Add a relationship referencing "None" — should be unresolvable
        data["annotated_docs"]["sample.pdf"]["relationships"] = [
            {
                "id": "r1",
                "relationshipLabel": "RelatesTo",
                "source_annotation_ids": ["None"],
                "target_annotation_ids": ["annot_1"],
                "structural": False,
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("None" in e and "not found" in e for e in result.errors)

    def test_bad_text_label_reference(self):
        data = _minimal_v1_data()
        data["annotated_docs"]["sample.pdf"]["labelled_text"][0][
            "annotationLabel"
        ] = "NoSuchLabel"
        result = validate_data_json(data)
        assert not result.ok
        assert any("NoSuchLabel" in e for e in result.errors)

    def test_invalid_token_index(self):
        data = _minimal_v1_data()
        annot = data["annotated_docs"]["sample.pdf"]["labelled_text"][0]
        annot["annotation_json"]["0"]["tokensJsons"] = [
            {"pageIndex": 0, "tokenIndex": 999}
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("tokenIndex" in e for e in result.errors)

    def test_invalid_page_index(self):
        data = _minimal_v1_data()
        annot = data["annotated_docs"]["sample.pdf"]["labelled_text"][0]
        annot["annotation_json"]["0"]["tokensJsons"] = [
            {"pageIndex": 5, "tokenIndex": 0}
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("pageIndex" in e for e in result.errors)

    def test_invalid_content_modality(self):
        data = _minimal_v1_data()
        annot = data["annotated_docs"]["sample.pdf"]["labelled_text"][0]
        annot["content_modalities"] = ["BANANA"]
        result = validate_data_json(data)
        assert not result.ok
        assert any("BANANA" in e for e in result.errors)

    def test_negative_bounds_error(self):
        data = _minimal_v1_data()
        annot = data["annotated_docs"]["sample.pdf"]["labelled_text"][0]
        annot["annotation_json"]["0"]["bounds"]["top"] = -10
        result = validate_data_json(data)
        assert not result.ok
        assert any("negative" in e for e in result.errors)

    def test_empty_pawls_page_index_error(self):
        """Annotation referencing into empty PAWLs gives clear error."""
        data = _minimal_v1_data()
        data["annotated_docs"]["sample.pdf"]["pawls_file_content"] = []
        data["annotated_docs"]["sample.pdf"]["page_count"] = 0
        result = validate_data_json(data)
        assert not result.ok
        assert any("empty PAWLs" in e for e in result.errors)


class TestPawlsValidation(unittest.TestCase):
    def test_nonsequential_page_index_is_error(self):
        data = _minimal_v1_data()
        # Set page.index to 5 instead of 0
        data["annotated_docs"]["sample.pdf"]["pawls_file_content"][0]["page"][
            "index"
        ] = 5
        result = validate_data_json(data)
        assert not result.ok
        assert any("sequential" in e for e in result.errors)


class TestStructuralSetValidation(unittest.TestCase):
    def test_missing_structural_set_reference(self):
        data = _minimal_v2_data()
        data["annotated_docs"]["sample.pdf"]["structural_set_hash"] = "missing_hash"
        result = validate_data_json(data)
        assert not result.ok
        assert any("missing_hash" in e for e in result.errors)

    def test_content_hash_mismatch(self):
        data = _minimal_v2_data()
        data["structural_annotation_sets"]["hash_a"] = {
            "content_hash": "hash_b",  # Mismatch
            "pawls_file_content": [],
            "txt_content": "",
            "structural_annotations": [],
            "structural_relationships": [],
        }
        result = validate_data_json(data)
        assert not result.ok
        assert any("does not match" in e for e in result.errors)

    def test_structural_relationship_wrong_label_type(self):
        """Structural relationship labels must have RELATIONSHIP_LABEL type."""
        data = _minimal_v2_data()
        data["structural_annotation_sets"]["hash_a"] = {
            "content_hash": "hash_a",
            "pawls_file_content": [
                {
                    "page": {"width": 612, "height": 792, "index": 0},
                    "tokens": [
                        {"x": 0, "y": 0, "width": 10, "height": 10, "text": "A"}
                    ],
                }
            ],
            "txt_content": "A",
            "structural_annotations": [
                {
                    "id": "sa1",
                    "annotationLabel": "Clause",
                    "rawText": "A",
                    "page": 0,
                    "annotation_json": {},
                    "structural": True,
                },
                {
                    "id": "sa2",
                    "annotationLabel": "Clause",
                    "rawText": "A",
                    "page": 0,
                    "annotation_json": {},
                    "structural": True,
                },
            ],
            "structural_relationships": [
                {
                    "id": "sr1",
                    # "Clause" is TOKEN_LABEL, not RELATIONSHIP_LABEL
                    "relationshipLabel": "Clause",
                    "source_annotation_ids": ["sa1"],
                    "target_annotation_ids": ["sa2"],
                    "structural": True,
                }
            ],
        }
        result = validate_data_json(data)
        assert not result.ok
        assert any("RELATIONSHIP_LABEL" in e for e in result.errors)


class TestFolderValidation(unittest.TestCase):
    def test_folder_missing_parent(self):
        data = _minimal_v2_data()
        data["folders"] = [
            {
                "id": "f1",
                "name": "Child",
                "description": "",
                "color": "#000",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": "nonexistent",
                "path": "Child",
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("nonexistent" in e for e in result.errors)

    def test_folder_name_with_slash(self):
        data = _minimal_v2_data()
        data["folders"] = [
            {
                "id": "f1",
                "name": "Bad/Name",
                "description": "",
                "color": "#000",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": None,
                "path": "Bad/Name",
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("/" in e for e in result.errors)

    def test_valid_folder_hierarchy(self):
        data = _minimal_v2_data()
        data["folders"] = [
            {
                "id": "f1",
                "name": "Parent",
                "description": "",
                "color": "#000",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": None,
                "path": "Parent",
            },
            {
                "id": "f2",
                "name": "Child",
                "description": "",
                "color": "#000",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": "f1",
                "path": "Parent/Child",
            },
        ]
        result = validate_data_json(data)
        assert result.ok, result.summary()

    def test_circular_reference_single_error(self):
        """A circular folder reference should produce exactly one error."""
        data = _minimal_v2_data()
        data["folders"] = [
            {
                "id": "a",
                "name": "A",
                "description": "",
                "color": "#000",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": "b",
                "path": "A",
            },
            {
                "id": "b",
                "name": "B",
                "description": "",
                "color": "#000",
                "icon": "folder",
                "tags": [],
                "is_public": False,
                "parent_id": "a",
                "path": "B",
            },
        ]
        result = validate_data_json(data)
        cycle_errors = [e for e in result.errors if "circular" in e]
        assert len(cycle_errors) == 1


class TestDocumentPathValidation(unittest.TestCase):
    def test_bad_folder_path_reference(self):
        data = _minimal_v2_data()
        data["document_paths"] = [
            {
                "document_ref": "sample.pdf",
                "folder_path": "NoSuchFolder",
                "path": "/docs/sample.pdf",
                "version_number": 1,
                "parent_version_number": None,
                "is_current": True,
                "is_deleted": False,
                "created": "2025-01-01T00:00:00+00:00",
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("NoSuchFolder" in e for e in result.errors)


class TestRelationshipValidation(unittest.TestCase):
    def test_corpus_level_relationship_label_missing(self):
        data = _minimal_v2_data()
        data["relationships"] = [
            {
                "id": "r1",
                "relationshipLabel": "NoSuchRelation",
                "source_annotation_ids": ["annot_1"],
                "target_annotation_ids": ["annot_1"],
                "structural": False,
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("NoSuchRelation" in e for e in result.errors)

    def test_relationship_wrong_label_type(self):
        data = _minimal_v2_data()
        # Use a TOKEN_LABEL as a relationship label — should error
        data["relationships"] = [
            {
                "id": "r1",
                "relationshipLabel": "Clause",
                "source_annotation_ids": ["annot_1"],
                "target_annotation_ids": ["annot_1"],
                "structural": False,
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("RELATIONSHIP_LABEL" in e for e in result.errors)

    def test_unresolvable_annotation_ref_is_error(self):
        """Missing annotation ID in a relationship should be an error."""
        data = _minimal_v2_data()
        data["relationships"] = [
            {
                "id": "r1",
                "relationshipLabel": "RelatesTo",
                "source_annotation_ids": ["nonexistent_annot"],
                "target_annotation_ids": ["annot_1"],
                "structural": False,
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("nonexistent_annot" in e for e in result.errors)
        # Should NOT also produce a label-type error
        assert not any("RELATIONSHIP_LABEL" in e for e in result.errors)

    def test_doc_level_relationship_wrong_label_type(self):
        """Document-level relationship with wrong label type should error."""
        data = _minimal_v1_data()
        data["annotated_docs"]["sample.pdf"]["labelled_text"].append(
            {
                "id": "annot_2",
                "annotationLabel": "Clause",
                "rawText": "world",
                "page": 0,
                "annotation_json": {},
                "parent_id": None,
                "annotation_type": "TOKEN_LABEL",
                "structural": False,
            }
        )
        data["annotated_docs"]["sample.pdf"]["relationships"] = [
            {
                "id": "r1",
                "relationshipLabel": "Clause",
                "source_annotation_ids": ["annot_1"],
                "target_annotation_ids": ["annot_2"],
                "structural": False,
            }
        ]
        result = validate_data_json(data)
        assert not result.ok
        assert any("RELATIONSHIP_LABEL" in e for e in result.errors)


class TestVersionValidation(unittest.TestCase):
    def test_unknown_version_warns(self):
        data = _minimal_v1_data()
        data["version"] = "banana"
        result = validate_data_json(data)
        # Should warn but still validate as V1
        assert any("banana" in w for w in result.warnings)

    def test_future_version_warns(self):
        data = _minimal_v1_data()
        data["version"] = "3.0"
        result = validate_data_json(data)
        assert any("3.0" in w for w in result.warnings)


class TestV2RequiredFields(unittest.TestCase):
    def test_missing_v2_required_field(self):
        data = _minimal_v2_data()
        del data["folders"]
        result = validate_data_json(data)
        assert not result.ok
        assert any("folders" in e for e in result.errors)

    def test_missing_multiple_v2_fields(self):
        data = _minimal_v2_data()
        del data["structural_annotation_sets"]
        del data["relationships"]
        result = validate_data_json(data)
        assert not result.ok
        assert any("structural_annotation_sets" in e for e in result.errors)
        assert any("relationships" in e for e in result.errors)


class TestConversationValidation(unittest.TestCase):
    def test_message_bad_conversation_ref(self):
        data = _minimal_v2_data()
        data["conversations"] = [
            {
                "id": "c1",
                "title": "Chat",
                "conversation_type": "chat",
                "is_public": False,
                "creator_email": "test@example.com",
                "created": "2025-01-01T00:00:00+00:00",
                "modified": "2025-01-01T00:00:00+00:00",
                "chat_with_corpus": True,
            }
        ]
        data["messages"] = [
            {
                "id": "m1",
                "conversation_id": "nonexistent_conv",
                "content": "Hello",
                "msg_type": "HUMAN",
                "state": "completed",
                "creator_email": "test@example.com",
                "created": "2025-01-01T00:00:00+00:00",
            }
        ]
        data["message_votes"] = []
        result = validate_data_json(data)
        assert not result.ok
        assert any("nonexistent_conv" in e for e in result.errors)

    def test_valid_conversation(self):
        data = _minimal_v2_data()
        data["conversations"] = [
            {
                "id": "c1",
                "title": "Chat",
                "conversation_type": "chat",
                "is_public": False,
                "creator_email": "test@example.com",
                "created": "2025-01-01T00:00:00+00:00",
                "modified": "2025-01-01T00:00:00+00:00",
                "chat_with_corpus": True,
            }
        ]
        data["messages"] = [
            {
                "id": "m1",
                "conversation_id": "c1",
                "content": "Hello",
                "msg_type": "HUMAN",
                "state": "completed",
                "creator_email": "test@example.com",
                "created": "2025-01-01T00:00:00+00:00",
            }
        ]
        data["message_votes"] = [
            {
                "message_id": "m1",
                "vote_type": "upvote",
                "creator_email": "test@example.com",
                "created": "2025-01-01T00:00:00+00:00",
            }
        ]
        result = validate_data_json(data)
        assert result.ok, result.summary()


class TestBadZipInput(unittest.TestCase):
    def test_not_a_zip(self):
        fd, path = tempfile.mkstemp(suffix=".zip")
        try:
            os.write(fd, b"this is not a zip file")
            os.close(fd)
            result = validate_export(path)
        finally:
            os.unlink(path)
        assert not result.ok
        assert any("Not a valid ZIP" in e for e in result.errors)

    def test_missing_file(self):
        result = validate_export("/nonexistent/path.zip")
        assert not result.ok
        assert any("File not found" in e for e in result.errors)

    def test_zip_without_data_json(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("other.txt", "hello")

        fd, path = tempfile.mkstemp(suffix=".zip")
        try:
            os.write(fd, buf.getvalue())
            os.close(fd)
            result = validate_export(path)
        finally:
            os.unlink(path)
        assert not result.ok
        assert any("data.json" in e for e in result.errors)


class TestCLI(unittest.TestCase):
    def test_help_returns_zero(self):
        assert main(["--help"]) == 0

    def test_no_args_returns_zero(self):
        assert main([]) == 0

    def test_valid_zip_returns_zero(self):
        data = _minimal_v1_data()
        zip_bytes = _make_zip(data, {"sample.pdf": b"%PDF-fake"})
        fd, path = tempfile.mkstemp(suffix=".zip")
        try:
            os.write(fd, zip_bytes)
            os.close(fd)
            assert main([path]) == 0
        finally:
            os.unlink(path)

    def test_invalid_zip_returns_one(self):
        data = _minimal_v1_data()
        # Missing sample.pdf in zip -> error
        zip_bytes = _make_zip(data, {})
        fd, path = tempfile.mkstemp(suffix=".zip")
        try:
            os.write(fd, zip_bytes)
            os.close(fd)
            assert main([path]) == 1
        finally:
            os.unlink(path)

    def test_nonexistent_file_returns_one(self):
        assert main(["/nonexistent/path.zip"]) == 1
