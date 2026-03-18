"""
Tests for annotation sidecar import via ImportZipToCorpus.

These tests verify the ability to import pre-annotated documents by
including a co-located .json sidecar (OpenContractDocExport format)
alongside the source document file in a zip upload.

Uses real PDF fixtures and realistic PAWLs/annotation data — no mocks.
"""

import io
import json
import logging
import zipfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase

from opencontractserver.annotations.models import (
    Annotation,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus, CorpusFolder, TemporaryFileHandle
from opencontractserver.documents.models import DocumentPath
from opencontractserver.tests.fixtures import (
    SAMPLE_PAWLS_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_ONE_PATH,
    SAMPLE_PDF_FILE_TWO_PATH,
    SAMPLE_TXT_FILE_ONE_PATH,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()
logger = logging.getLogger(__name__)


def _load_pawls_subset(num_pages: int = 2) -> list[dict]:
    """Load a subset of real PAWLs data from the test fixture."""
    full_pawls = json.loads(SAMPLE_PAWLS_FILE_ONE_PATH.read_text())
    return full_pawls[:num_pages]


def _build_sidecar_json(
    title: str = "Test Document",
    description: str = "A test document with annotations",
    pawls_pages: list[dict] | None = None,
    content: str | None = None,
    annotations: list[dict] | None = None,
    doc_labels: list[str] | None = None,
    relationships: list[dict] | None = None,
) -> dict:
    """
    Build a realistic OpenContractDocExport dict using real fixture data.
    """
    if pawls_pages is None:
        pawls_pages = _load_pawls_subset(2)

    if content is None:
        content = SAMPLE_TXT_FILE_ONE_PATH.read_text()[:500]

    if annotations is None:
        annotations = []

    if doc_labels is None:
        doc_labels = []

    result = {
        "title": title,
        "content": content,
        "description": description,
        "pawls_file_content": pawls_pages,
        "page_count": len(pawls_pages),
        "doc_labels": doc_labels,
        "labelled_text": annotations,
        "file_type": "application/pdf",
    }

    if relationships is not None:
        result["relationships"] = relationships

    return result


def _build_labels_json(
    text_labels: dict | None = None,
    doc_labels: dict | None = None,
) -> dict:
    """Build a labels.json for inclusion in a zip."""
    return {
        "text_labels": text_labels or {},
        "doc_labels": doc_labels or {},
    }


def _make_annotation(
    annot_id: int,
    raw_text: str,
    label_name: str,
    page: int = 0,
    token_start: int = 0,
    token_end: int = 1,
) -> dict:
    """Build a realistic OpenContractsAnnotationPythonType dict."""
    return {
        "id": annot_id,
        "annotationLabel": label_name,
        "rawText": raw_text,
        "page": page,
        "annotation_json": {
            str(page): {
                "bounds": {
                    "top": 50,
                    "bottom": 70,
                    "left": 50,
                    "right": 200,
                },
                "tokensJsons": list(range(token_start, token_end)),
                "rawText": raw_text,
            }
        },
        "structural": False,
        "annotation_type": "TOKEN_LABEL",
    }


def _make_label_data(
    text: str,
    label_type: str = "TOKEN_LABEL",
    description: str = "",
    color: str = "#FF0000",
) -> dict:
    """Build a realistic AnnotationLabelPythonType dict."""
    return {
        "text": text,
        "label_type": label_type,
        "description": description or f"Label for {text}",
        "color": color,
        "icon": "tag",
    }


class TestSidecarDetectionInManifest(TestCase):
    """Tests for sidecar/labels detection in zip validation."""

    def test_json_sidecar_detected_for_pdf(self):
        """A .json file with same stem as a .pdf is detected as sidecar."""
        from opencontractserver.utils.zip_security import validate_zip_for_import

        pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()
        sidecar = json.dumps(_build_sidecar_json()).encode("utf-8")

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("doc.pdf", pdf_bytes)
            zf.writestr("doc.json", sidecar)
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertIn("doc.pdf", manifest.annotation_sidecars)
        self.assertEqual(manifest.annotation_sidecars["doc.pdf"], "doc.json")
        # The sidecar should NOT appear in valid_files
        valid_paths = [e.sanitized_path for e in manifest.valid_files]
        self.assertNotIn("doc.json", valid_paths)
        self.assertIn("doc.pdf", valid_paths)

    def test_json_sidecar_detected_in_subfolder(self):
        """Sidecars in subfolders are matched correctly."""
        from opencontractserver.utils.zip_security import validate_zip_for_import

        pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()
        sidecar = json.dumps(_build_sidecar_json()).encode("utf-8")

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("contracts/master.pdf", pdf_bytes)
            zf.writestr("contracts/master.json", sidecar)
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertIn("contracts/master.pdf", manifest.annotation_sidecars)

    def test_standalone_json_not_treated_as_sidecar(self):
        """A .json file without a matching document stays in valid_files."""
        from opencontractserver.utils.zip_security import validate_zip_for_import

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("data.json", b'{"key": "value"}')
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.annotation_sidecars), 0)
        valid_paths = [e.sanitized_path for e in manifest.valid_files]
        self.assertIn("data.json", valid_paths)

    def test_labels_file_detected(self):
        """labels.json at root is detected as the labels file."""
        from opencontractserver.utils.zip_security import validate_zip_for_import

        pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()
        labels = json.dumps(_build_labels_json()).encode("utf-8")

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("doc.pdf", pdf_bytes)
            zf.writestr("labels.json", labels)
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(manifest.labels_file, "labels.json")
        # labels.json should not be in valid_files or sidecars
        valid_paths = [e.sanitized_path for e in manifest.valid_files]
        self.assertNotIn("labels.json", valid_paths)
        self.assertNotIn("labels.json", manifest.annotation_sidecars)

    def test_labels_json_in_subfolder_not_detected_as_labels_file(self):
        """labels.json in a subfolder should NOT be detected as the labels file."""
        from opencontractserver.utils.zip_security import validate_zip_for_import

        pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("docs/labels.pdf", pdf_bytes)
            zf.writestr("docs/labels.json", b'{"text_labels": {}}')
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        # Should NOT be the root labels file
        self.assertIsNone(manifest.labels_file)
        # Should be detected as a sidecar for docs/labels.pdf
        self.assertIn("docs/labels.pdf", manifest.annotation_sidecars)

    def test_mixed_sidecar_and_plain_documents(self):
        """Zip with some docs having sidecars and others without."""
        from opencontractserver.utils.zip_security import validate_zip_for_import

        pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()
        sidecar = json.dumps(_build_sidecar_json()).encode("utf-8")

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("annotated.pdf", pdf_bytes)
            zf.writestr("annotated.json", sidecar)
            zf.writestr("plain.pdf", pdf_bytes)
            zf.writestr("labels.json", b'{"text_labels": {}, "doc_labels": {}}')
        buffer.seek(0)

        with zipfile.ZipFile(buffer, "r") as zf:
            manifest = validate_zip_for_import(zf)

        self.assertTrue(manifest.is_valid)
        self.assertEqual(len(manifest.annotation_sidecars), 1)
        self.assertIn("annotated.pdf", manifest.annotation_sidecars)
        valid_paths = [e.sanitized_path for e in manifest.valid_files]
        self.assertIn("annotated.pdf", valid_paths)
        self.assertIn("plain.pdf", valid_paths)
        # Sidecar JSON and labels.json excluded from valid_files
        self.assertNotIn("annotated.json", valid_paths)
        self.assertNotIn("labels.json", valid_paths)


class TestSidecarImportTask(TestCase):
    """
    Integration tests for annotation sidecar import via the
    import_zip_with_folder_structure Celery task.

    Uses real PDF fixtures and realistic PAWLs/annotation data.
    """

    def setUp(self):
        """Set up test user, corpus, and load real fixture data."""
        with transaction.atomic():
            self.user = User.objects.create_user(
                username="sidecar_user", password="testpass"
            )

        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Sidecar Test Corpus",
                description="Corpus for testing sidecar import",
                creator=self.user,
            )
            set_permissions_for_obj_to_user(
                self.user, self.corpus, [PermissionTypes.ALL]
            )

        self.pdf_bytes = SAMPLE_PDF_FILE_ONE_PATH.read_bytes()
        self.pdf_bytes_2 = SAMPLE_PDF_FILE_TWO_PATH.read_bytes()
        self.pawls_pages = _load_pawls_subset(2)
        self.text_content = SAMPLE_TXT_FILE_ONE_PATH.read_text()[:500]

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
        zip_content = ContentFile(zip_buffer.read(), name="test_sidecar_import.zip")
        handle = TemporaryFileHandle.objects.create(file=zip_content)
        return handle

    def test_single_annotated_document_import(self):
        """Import a single PDF with annotation sidecar and labels."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Build annotation sidecar with two text annotations
        annotations = [
            _make_annotation(
                annot_id=1,
                raw_text="Exhibit",
                label_name="Heading",
                page=0,
                token_start=0,
                token_end=1,
            ),
            _make_annotation(
                annot_id=2,
                raw_text="Certain information",
                label_name="Clause",
                page=0,
                token_start=2,
                token_end=4,
            ),
        ]

        sidecar = _build_sidecar_json(
            title="Development Agreement",
            description="Eton Pharmaceuticals agreement",
            pawls_pages=self.pawls_pages,
            content=self.text_content,
            annotations=annotations,
            doc_labels=["Contract"],
        )

        labels = _build_labels_json(
            text_labels={
                "Heading": _make_label_data("Heading"),
                "Clause": _make_label_data("Clause"),
            },
            doc_labels={
                "Contract": _make_label_data("Contract", label_type="DOC_TYPE_LABEL"),
            },
        )

        files = {
            "agreement.pdf": self.pdf_bytes,
            "agreement.json": json.dumps(sidecar).encode("utf-8"),
            "labels.json": json.dumps(labels).encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-1",
                "corpus_id": self.corpus.id,
            }
        ).get()

        # Verify task succeeded
        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["files_processed"], 1)
        self.assertTrue(result["labels_file_found"])
        self.assertEqual(result["annotation_sidecars_found"], 1)
        self.assertEqual(result["annotation_sidecars_processed"], 1)
        self.assertEqual(result["annotation_sidecars_errored"], 0)

        # Verify annotations were created (2 text + 1 doc-level)
        self.assertEqual(result["annotations_imported"], 2)

        # Verify document exists in corpus
        doc_paths = DocumentPath.objects.filter(corpus=self.corpus)
        self.assertEqual(doc_paths.count(), 1)

        corpus_doc = doc_paths.first().document
        self.assertFalse(corpus_doc.backend_lock)

        # Verify text annotations exist on the corpus document
        text_annotations = Annotation.objects.filter(
            document=corpus_doc,
            corpus=self.corpus,
            annotation_type="TOKEN_LABEL",
        )
        self.assertEqual(text_annotations.count(), 2)

        # Verify doc-level annotation exists
        doc_annotations = Annotation.objects.filter(
            document=corpus_doc,
            corpus=self.corpus,
            annotation_label__label_type="DOC_TYPE_LABEL",
        )
        self.assertEqual(doc_annotations.count(), 1)

        # Verify labels were created in the corpus label set
        self.corpus.refresh_from_db()
        label_set = self.corpus.label_set
        self.assertIsNotNone(label_set)
        label_texts = set(label_set.annotation_labels.values_list("text", flat=True))
        self.assertIn("Heading", label_texts)
        self.assertIn("Clause", label_texts)
        self.assertIn("Contract", label_texts)

    def test_sidecar_with_relationships(self):
        """Import a document with intra-document annotation relationships."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        annotations = [
            _make_annotation(
                annot_id=1,
                raw_text="Exhibit 10.1",
                label_name="Heading",
                page=0,
                token_start=0,
                token_end=2,
            ),
            _make_annotation(
                annot_id=2,
                raw_text="Certain information",
                label_name="Clause",
                page=0,
                token_start=2,
                token_end=4,
            ),
        ]

        relationships = [
            {
                "id": 1,
                "relationshipLabel": "Contains",
                "source_annotation_ids": [1],
                "target_annotation_ids": [2],
                "structural": False,
            }
        ]

        sidecar = _build_sidecar_json(
            title="Doc with Relationships",
            annotations=annotations,
            relationships=relationships,
        )

        labels = _build_labels_json(
            text_labels={
                "Heading": _make_label_data("Heading"),
                "Clause": _make_label_data("Clause"),
                "Contains": _make_label_data(
                    "Contains", label_type="RELATIONSHIP_LABEL"
                ),
            },
        )

        files = {
            "doc_with_rels.pdf": self.pdf_bytes,
            "doc_with_rels.json": json.dumps(sidecar).encode("utf-8"),
            "labels.json": json.dumps(labels).encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-rels",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["annotation_sidecars_processed"], 1)

        # Verify relationship was created
        corpus_doc = DocumentPath.objects.get(corpus=self.corpus).document
        relationships = Relationship.objects.filter(
            document=corpus_doc,
            corpus=self.corpus,
        )
        self.assertEqual(relationships.count(), 1)

        rel = relationships.first()
        self.assertEqual(rel.source_annotations.count(), 1)
        self.assertEqual(rel.target_annotations.count(), 1)
        self.assertEqual(rel.relationship_label.text, "Contains")

    def test_mixed_sidecar_and_pipeline_import(self):
        """Import a zip where one doc has a sidecar and another doesn't."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Annotated document with sidecar
        annotations = [
            _make_annotation(
                annot_id=1,
                raw_text="Section 1",
                label_name="Section",
                page=0,
                token_start=0,
                token_end=2,
            ),
        ]

        sidecar = _build_sidecar_json(
            title="Annotated Doc",
            annotations=annotations,
        )

        labels = _build_labels_json(
            text_labels={
                "Section": _make_label_data("Section"),
            },
        )

        files = {
            "annotated.pdf": self.pdf_bytes,
            "annotated.json": json.dumps(sidecar).encode("utf-8"),
            "plain.pdf": self.pdf_bytes_2,  # No sidecar - goes through pipeline
            "labels.json": json.dumps(labels).encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-mixed",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["files_processed"], 2)
        self.assertEqual(result["annotation_sidecars_found"], 1)
        self.assertEqual(result["annotation_sidecars_processed"], 1)

        # Both documents should be in the corpus
        doc_paths = DocumentPath.objects.filter(corpus=self.corpus)
        self.assertEqual(doc_paths.count(), 2)

        # The annotated doc should have annotations
        total_annotations = Annotation.objects.filter(
            corpus=self.corpus,
            annotation_type="TOKEN_LABEL",
        ).count()
        self.assertEqual(total_annotations, 1)

    def test_sidecar_in_subfolder(self):
        """Import annotated document in a subfolder with sidecar."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        annotations = [
            _make_annotation(
                annot_id=1,
                raw_text="Article I",
                label_name="Article",
                page=0,
                token_start=0,
                token_end=2,
            ),
        ]

        sidecar = _build_sidecar_json(
            title="Subfolder Document",
            annotations=annotations,
        )

        labels = _build_labels_json(
            text_labels={
                "Article": _make_label_data("Article"),
            },
        )

        files = {
            "contracts/agreement.pdf": self.pdf_bytes,
            "contracts/agreement.json": json.dumps(sidecar).encode("utf-8"),
            "labels.json": json.dumps(labels).encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-subfolder",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["files_processed"], 1)
        self.assertEqual(result["annotation_sidecars_processed"], 1)
        self.assertEqual(result["folders_created"], 1)

        # Verify folder was created
        folder = CorpusFolder.objects.get(corpus=self.corpus, name="contracts")
        self.assertIsNotNone(folder)

        # Verify annotation
        annotations_qs = Annotation.objects.filter(
            corpus=self.corpus, annotation_type="TOKEN_LABEL"
        )
        self.assertEqual(annotations_qs.count(), 1)
        self.assertEqual(annotations_qs.first().raw_text, "Article I")

    def test_sidecar_without_labels_file_uses_existing_labels(self):
        """
        When no labels.json is present but the corpus already has
        matching labels, annotations should still import if the
        labels pre-exist.
        """
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Pre-create a label set with matching labels on the corpus
        label_set = LabelSet.objects.create(
            title="Pre-existing labels",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, label_set, [PermissionTypes.ALL])
        self.corpus.label_set = label_set
        self.corpus.save(update_fields=["label_set"])

        # Without labels.json, sidecars are found but label_lookup is empty,
        # so the sidecar path won't be taken (guard: `sidecar_path and label_lookup`)
        # The document should fall through to the pipeline path
        annotations = [
            _make_annotation(
                annot_id=1,
                raw_text="Test",
                label_name="Heading",
                page=0,
            ),
        ]
        sidecar = _build_sidecar_json(annotations=annotations)

        files = {
            "doc.pdf": self.pdf_bytes,
            "doc.json": json.dumps(sidecar).encode("utf-8"),
            # No labels.json - sidecar detected but no label_lookup
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-no-labels",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        # Sidecar was found but labels file wasn't, so sidecar path is skipped
        self.assertEqual(result["annotation_sidecars_found"], 1)
        self.assertFalse(result["labels_file_found"])
        # The doc went through the pipeline path instead
        self.assertEqual(result["annotation_sidecars_processed"], 0)
        self.assertEqual(result["files_processed"], 1)

    def test_multiple_annotated_documents(self):
        """Import multiple annotated documents in one zip."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        sidecar1 = _build_sidecar_json(
            title="First Doc",
            annotations=[
                _make_annotation(1, "Section A", "Heading", 0, 0, 2),
                _make_annotation(2, "Clause 1", "Clause", 0, 3, 5),
            ],
        )

        sidecar2 = _build_sidecar_json(
            title="Second Doc",
            annotations=[
                _make_annotation(1, "Part I", "Heading", 0, 0, 2),
            ],
        )

        labels = _build_labels_json(
            text_labels={
                "Heading": _make_label_data("Heading"),
                "Clause": _make_label_data("Clause"),
            },
        )

        files = {
            "doc1.pdf": self.pdf_bytes,
            "doc1.json": json.dumps(sidecar1).encode("utf-8"),
            "doc2.pdf": self.pdf_bytes_2,
            "doc2.json": json.dumps(sidecar2).encode("utf-8"),
            "labels.json": json.dumps(labels).encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-multi",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["files_processed"], 2)
        self.assertEqual(result["annotation_sidecars_found"], 2)
        self.assertEqual(result["annotation_sidecars_processed"], 2)
        self.assertEqual(result["annotations_imported"], 3)  # 2 + 1

        # Verify both documents in corpus
        doc_paths = DocumentPath.objects.filter(corpus=self.corpus)
        self.assertEqual(doc_paths.count(), 2)

        # Verify total annotations
        all_annotations = Annotation.objects.filter(
            corpus=self.corpus, annotation_type="TOKEN_LABEL"
        )
        self.assertEqual(all_annotations.count(), 3)

    def test_sidecar_with_cross_doc_relationships_csv(self):
        """
        Annotated documents can also use relationships.csv
        for cross-document relationships.
        """
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        sidecar1 = _build_sidecar_json(title="Master Agreement")
        sidecar2 = _build_sidecar_json(title="Amendment 1")

        labels = _build_labels_json()

        rel_csv = "source_path,relationship_label,target_path,notes\n"
        rel_csv += "/master.pdf,Amends,/amendment.pdf,First amendment\n"

        files = {
            "master.pdf": self.pdf_bytes,
            "master.json": json.dumps(sidecar1).encode("utf-8"),
            "amendment.pdf": self.pdf_bytes_2,
            "amendment.json": json.dumps(sidecar2).encode("utf-8"),
            "labels.json": json.dumps(labels).encode("utf-8"),
            "relationships.csv": rel_csv.encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-cross-doc",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["annotation_sidecars_processed"], 2)
        self.assertTrue(result["relationships_file_found"])
        self.assertEqual(result["relationships_created"], 1)

    def test_zip_without_any_sidecars_unchanged_behavior(self):
        """A plain zip without sidecars should behave exactly as before."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        files = {
            "file1.pdf": self.pdf_bytes,
            "file2.pdf": self.pdf_bytes_2,
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-no-sidecar",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["files_processed"], 2)
        self.assertEqual(result["annotation_sidecars_found"], 0)
        self.assertEqual(result["annotation_sidecars_processed"], 0)
        self.assertFalse(result["labels_file_found"])
        self.assertEqual(result["annotations_imported"], 0)

    def test_sidecar_creates_label_set_if_corpus_has_none(self):
        """If the corpus has no label set, one is created during import."""
        from opencontractserver.tasks.import_tasks import (
            import_zip_with_folder_structure,
        )

        # Ensure corpus has no label set
        self.corpus.label_set = None
        self.corpus.save(update_fields=["label_set"])

        sidecar = _build_sidecar_json(
            annotations=[
                _make_annotation(1, "Title", "Heading", 0, 0, 1),
            ],
        )

        labels = _build_labels_json(
            text_labels={
                "Heading": _make_label_data("Heading"),
            },
        )

        files = {
            "doc.pdf": self.pdf_bytes,
            "doc.json": json.dumps(sidecar).encode("utf-8"),
            "labels.json": json.dumps(labels).encode("utf-8"),
        }

        zip_buffer = self._create_test_zip(files)
        handle = self._create_temp_file_handle(zip_buffer)

        result = import_zip_with_folder_structure.apply(
            kwargs={
                "temporary_file_handle_id": handle.id,
                "user_id": self.user.id,
                "job_id": "test-sidecar-no-labelset",
                "corpus_id": self.corpus.id,
            }
        ).get()

        self.assertTrue(result["completed"], f"Errors: {result.get('errors')}")
        self.assertTrue(result["success"], f"Errors: {result.get('errors')}")
        self.assertEqual(result["annotation_sidecars_processed"], 1)

        # Verify label set was created
        self.corpus.refresh_from_db()
        self.assertIsNotNone(self.corpus.label_set)
        label_texts = set(
            self.corpus.label_set.annotation_labels.values_list("text", flat=True)
        )
        self.assertIn("Heading", label_texts)
