"""
Tests for the standalone export validation utility.

These tests do NOT require Django — they exercise the pure-Python validator
against in-memory data.json structures.
"""

from __future__ import annotations

import io
import json
import zipfile

from opencontractserver.utils.validate_export import (
    ValidationResult,
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
            }
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


def _write_and_validate(data: dict, files: dict[str, bytes] | None = None):
    """Write a ZIP to a temp file and validate it, returning the result."""
    import tempfile

    zip_bytes = _make_zip(data, files)
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp.write(zip_bytes)
        tmp.flush()
        return validate_export(tmp.name)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestValidationResult:
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


class TestMinimalValidExport:
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


class TestZipStructure:
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


class TestLabelValidation:
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


class TestDocumentValidation:
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


class TestAnnotationValidation:
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


class TestStructuralSetValidation:
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


class TestFolderValidation:
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


class TestDocumentPathValidation:
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


class TestRelationshipValidation:
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


class TestConversationValidation:
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


class TestBadZipInput:
    def test_not_a_zip(self):
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(b"this is not a zip file")
            tmp.flush()
            result = validate_export(tmp.name)
        assert not result.ok
        assert any(
            "not a valid ZIP" in e.lower() or "Not a valid ZIP" in e
            for e in result.errors
        )

    def test_missing_file(self):
        result = validate_export("/nonexistent/path.zip")
        assert not result.ok
        assert any("not found" in e.lower() or "Not found" in e for e in result.errors)

    def test_zip_without_data_json(self):
        import tempfile

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("other.txt", "hello")

        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
            tmp.write(buf.getvalue())
            tmp.flush()
            result = validate_export(tmp.name)
        assert not result.ok
        assert any("data.json" in e for e in result.errors)
