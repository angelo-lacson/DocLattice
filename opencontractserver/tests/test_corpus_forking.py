import base64
import pathlib
import uuid

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TransactionTestCase

from opencontractserver.annotations.models import Annotation, Relationship
from opencontractserver.corpuses.models import Corpus, TemporaryFileHandle
from opencontractserver.tasks import import_corpus
from opencontractserver.tasks.utils import package_zip_into_base64
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.corpus_forking import build_fork_corpus_task
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class CorpusForkTestCase(TransactionTestCase):
    """Test suite for corpus forking data integrity.

    Each test method runs an independent import+fork cycle via
    ``_import_and_fork_corpus()``.  This is intentional:
    ``TransactionTestCase`` truncates all tables between tests, so sharing
    state across methods would require ``setUpClass`` plus manual cleanup
    and would make test isolation harder to reason about.  The trade-off is
    extra wall-clock time (~8 cycles) in exchange for clean, self-contained
    assertions per test method.
    """

    fixtures_path = pathlib.Path(__file__).parent / "fixtures"

    def setUp(self):
        self.user = User.objects.create_user(username="bob", password="12345678")

    def _import_and_fork_corpus(self):
        """Import a test corpus and fork it. Returns (original_corpus, forked_corpus)."""
        export_zip_base64_file_string = package_zip_into_base64(
            self.fixtures_path / "Test_Corpus_EXPORT.zip"
        )
        original_corpus = Corpus.objects.create(
            title="New Import", creator=self.user, backend_lock=False
        )
        set_permissions_for_obj_to_user(
            self.user, original_corpus, [PermissionTypes.ALL]
        )

        base64_img_bytes = export_zip_base64_file_string.encode("utf-8")
        decoded_file_data = base64.decodebytes(base64_img_bytes)

        with transaction.atomic():
            temporary_file = TemporaryFileHandle.objects.create()
            temporary_file.file.save(
                f"corpus_import_{uuid.uuid4()}.pdf", ContentFile(decoded_file_data)
            )

        import_task = import_corpus.s(
            temporary_file.id, self.user.id, original_corpus.id
        )
        import_task.apply().get()
        original_corpus.refresh_from_db()

        fork_task = build_fork_corpus_task(
            corpus_pk_to_fork=original_corpus.id, user=self.user
        )
        task_results = fork_task.apply().get()
        forked_corpus = Corpus.objects.get(id=task_results)
        forked_corpus.refresh_from_db()

        return original_corpus, forked_corpus

    def test_corpus_forking(self):
        """Test that forking preserves object counts."""
        original_corpus_obj, forked_corpus = self._import_and_fork_corpus()

        self.assertIsInstance(forked_corpus, Corpus)
        self.assertIsInstance(forked_corpus.parent, Corpus)
        self.assertEqual(forked_corpus.parent_id, original_corpus_obj.id)

        # Annotation count
        forked_annotation_count = Annotation.objects.filter(
            corpus=forked_corpus, analysis__isnull=True
        ).count()
        original_annotation_count = Annotation.objects.filter(
            corpus=original_corpus_obj, analysis__isnull=True
        ).count()
        self.assertEqual(forked_annotation_count, original_annotation_count)

        # Document count
        self.assertEqual(
            forked_corpus.get_documents().count(),
            original_corpus_obj.get_documents().count(),
        )

        # Label count
        original_labelset_labels = original_corpus_obj.label_set.annotation_labels.all()
        forked_labelset_labels = forked_corpus.label_set.annotation_labels.all()
        self.assertEqual(
            forked_labelset_labels.count(), original_labelset_labels.count()
        )

    def _build_label_map(self, original_corpus, forked_corpus):
        """Build a mapping from original label IDs to forked label IDs by
        matching on label text.

        Note: if multiple labels share the same ``text``, only the last one
        wins in the dict comprehension (silently dropped).  The assertions
        below guard against this in the test fixture.
        """
        original_labels = list(original_corpus.label_set.annotation_labels.all())
        forked_labels = list(forked_corpus.label_set.annotation_labels.all())

        original_label_by_text = {lbl.text: lbl.id for lbl in original_labels}
        self.assertEqual(
            len(original_label_by_text),
            len(original_labels),
            "Original corpus has duplicate label texts -- label_map would silently drop entries",
        )

        forked_label_by_text = {lbl.text: lbl.id for lbl in forked_labels}
        self.assertEqual(
            len(forked_label_by_text),
            len(forked_labels),
            "Forked corpus has duplicate label texts -- label_map would silently drop entries",
        )

        label_map = {}
        for text, orig_id in original_label_by_text.items():
            if text in forked_label_by_text:
                label_map[orig_id] = forked_label_by_text[text]
        return label_map

    def test_forked_label_properties(self):
        """Verify that label properties (color, description, icon, text, label_type)
        transfer correctly during cloning."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        original_labels = list(
            original_corpus.label_set.annotation_labels.order_by("text").values(
                "text", "color", "description", "icon", "label_type"
            )
        )
        forked_labels = list(
            forked_corpus.label_set.annotation_labels.order_by("text").values(
                "text", "color", "description", "icon", "label_type"
            )
        )

        self.assertTrue(len(original_labels) > 0, "Fixture should contain labels")
        self.assertEqual(len(forked_labels), len(original_labels))

        for orig, forked in zip(original_labels, forked_labels):
            self.assertEqual(forked["text"], orig["text"])
            self.assertEqual(forked["color"], orig["color"])
            self.assertEqual(forked["description"], orig["description"])
            self.assertEqual(forked["icon"], orig["icon"])
            self.assertEqual(forked["label_type"], orig["label_type"])

    def test_forked_labels_are_independent_copies(self):
        """Forked labels must be new DB rows, not references to the originals."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        original_label_ids = set(
            original_corpus.label_set.annotation_labels.values_list("id", flat=True)
        )
        forked_label_ids = set(
            forked_corpus.label_set.annotation_labels.values_list("id", flat=True)
        )

        self.assertTrue(len(original_label_ids) > 0)
        self.assertTrue(
            original_label_ids.isdisjoint(forked_label_ids),
            "Forked labels should be new rows with different PKs",
        )

    def test_forked_labelset_metadata(self):
        """Verify the forked LabelSet has the [FORK] title prefix and preserves description."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        original_ls = original_corpus.label_set
        forked_ls = forked_corpus.label_set

        self.assertNotEqual(original_ls.id, forked_ls.id)
        self.assertEqual(forked_ls.title, f"[FORK] {original_ls.title}")
        self.assertEqual(forked_ls.description, original_ls.description)

    def test_forked_document_field_integrity(self):
        """Verify that forked documents have correct titles, provenance, and
        share the same underlying file blobs as the originals."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        original_docs = list(original_corpus.get_documents().order_by("title"))
        forked_docs = list(forked_corpus.get_documents().order_by("title"))

        self.assertTrue(len(original_docs) > 0, "Fixture should contain documents")
        self.assertEqual(len(forked_docs), len(original_docs))

        for orig_doc, forked_doc in zip(original_docs, forked_docs):
            # Title should have [FORK] prefix
            self.assertEqual(forked_doc.title, f"[FORK] {orig_doc.title}")

            # Forked doc should reference original as source_document
            self.assertEqual(forked_doc.source_document_id, orig_doc.id)

            # Forked doc must have a new PK
            self.assertNotEqual(forked_doc.id, orig_doc.id)

            # File blobs should be shared (same underlying file path)
            if orig_doc.pdf_file:
                self.assertEqual(
                    forked_doc.pdf_file.name,
                    orig_doc.pdf_file.name,
                    "Forked doc should share the same PDF file blob",
                )
            if orig_doc.txt_extract_file:
                self.assertEqual(
                    forked_doc.txt_extract_file.name,
                    orig_doc.txt_extract_file.name,
                    "Forked doc should share the same text extract file blob",
                )
            if orig_doc.pawls_parse_file:
                self.assertEqual(
                    forked_doc.pawls_parse_file.name,
                    orig_doc.pawls_parse_file.name,
                    "Forked doc should share the same PAWLs parse file blob",
                )

    def test_forked_annotation_field_integrity(self):
        """Verify that forked annotations preserve page, raw_text, tokens_jsons,
        bounding_box, json payload, and annotation_type."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        original_annots = list(
            Annotation.objects.filter(
                corpus=original_corpus, analysis__isnull=True
            ).order_by("raw_text", "page")
        )
        forked_annots = list(
            Annotation.objects.filter(
                corpus=forked_corpus, analysis__isnull=True
            ).order_by("raw_text", "page")
        )

        self.assertTrue(len(original_annots) > 0, "Fixture should contain annotations")
        self.assertEqual(len(forked_annots), len(original_annots))

        # Guard: ensure (raw_text, page) is unambiguous for zip-based matching
        keys = [(a.raw_text, a.page) for a in original_annots]
        self.assertEqual(
            len(keys),
            len(set(keys)),
            "Fixture has duplicate (raw_text, page) pairs -- sort key is ambiguous",
        )

        label_map = self._build_label_map(original_corpus, forked_corpus)

        for orig, forked in zip(original_annots, forked_annots):
            # Must be different DB rows
            self.assertNotEqual(forked.id, orig.id)

            # Core data fields must match
            self.assertEqual(forked.page, orig.page)
            self.assertEqual(forked.raw_text, orig.raw_text)
            self.assertEqual(forked.tokens_jsons, orig.tokens_jsons)
            self.assertEqual(forked.bounding_box, orig.bounding_box)
            self.assertEqual(forked.json, orig.json)
            self.assertEqual(forked.annotation_type, orig.annotation_type)

            # Label should be remapped to the forked copy
            if orig.annotation_label_id:
                expected_label_id = label_map.get(orig.annotation_label_id)
                self.assertEqual(
                    forked.annotation_label_id,
                    expected_label_id,
                    f"Annotation label not correctly remapped for annotation "
                    f"with raw_text='{orig.raw_text}'",
                )

            # Corpus reference should point to the forked corpus
            self.assertEqual(forked.corpus_id, forked_corpus.id)

    def test_forked_relationship_integrity(self):
        """Verify forked relationships maintain correct source/target annotation
        references and preserve label mappings."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        original_rels = list(
            Relationship.objects.filter(
                corpus=original_corpus, analysis__isnull=True
            ).prefetch_related("source_annotations", "target_annotations")
        )
        forked_rels = list(
            Relationship.objects.filter(
                corpus=forked_corpus, analysis__isnull=True
            ).prefetch_related("source_annotations", "target_annotations")
        )

        # Count check
        self.assertEqual(len(forked_rels), len(original_rels))

        # Fixture must contain relationships for this test to be meaningful
        if len(original_rels) == 0:
            self.skipTest("Fixture has no relationships -- nothing to verify")

        # Build annotation id -> content key maps for both corpuses.
        original_annots = list(
            Annotation.objects.filter(corpus=original_corpus, analysis__isnull=True)
        )
        original_annot_key_to_id = {(a.raw_text, a.page): a.id for a in original_annots}

        # Guard: ensure (raw_text, page) is unambiguous for originals
        self.assertEqual(
            len(original_annot_key_to_id),
            len(original_annots),
            "Fixture has duplicate (raw_text, page) pairs -- annotation key is ambiguous",
        )

        # Reverse map: original annotation id -> content key
        orig_id_to_key = {v: k for k, v in original_annot_key_to_id.items()}

        # Build forked annotation id -> content key in a single query.
        forked_annots = list(
            Annotation.objects.filter(corpus=forked_corpus, analysis__isnull=True)
        )
        forked_annot_by_id = {a.id: (a.raw_text, a.page) for a in forked_annots}

        # Guard: ensure forked annotations also have unambiguous keys
        self.assertEqual(
            len(forked_annot_by_id),
            len(forked_annots),
            "Forked corpus has duplicate (raw_text, page) pairs -- annotation key is ambiguous",
        )

        # Pre-compute source/target id sets per relationship from the
        # prefetch cache (iterating .all() hits the cache; .values_list()
        # bypasses it and issues a new query each time).
        orig_rel_annot_ids = {}
        for rel in original_rels:
            orig_rel_annot_ids[rel.id] = (
                {a.id for a in rel.source_annotations.all()},
                {a.id for a in rel.target_annotations.all()},
            )

        forked_rel_annot_ids = {}
        for rel in forked_rels:
            forked_rel_annot_ids[rel.id] = (
                {a.id for a in rel.source_annotations.all()},
                {a.id for a in rel.target_annotations.all()},
            )

        # Pre-compute content-key sets for each forked relationship so the
        # inner matching loop is pure dict lookups (no DB queries).
        forked_rel_keys = {}
        for rel_id, (src_ids, tgt_ids) in forked_rel_annot_ids.items():
            forked_rel_keys[rel_id] = (
                {
                    forked_annot_by_id[aid]
                    for aid in src_ids
                    if aid in forked_annot_by_id
                },
                {
                    forked_annot_by_id[aid]
                    for aid in tgt_ids
                    if aid in forked_annot_by_id
                },
            )

        label_map = self._build_label_map(original_corpus, forked_corpus)

        for orig_rel in original_rels:
            # Convert original annotation IDs to content keys
            orig_source_ids, orig_target_ids = orig_rel_annot_ids[orig_rel.id]
            orig_source_keys = {
                orig_id_to_key[aid] for aid in orig_source_ids if aid in orig_id_to_key
            }
            orig_target_keys = {
                orig_id_to_key[aid] for aid in orig_target_ids if aid in orig_id_to_key
            }

            # Find matching forked relationship via pre-computed key sets
            matched_forked = None
            for forked_rel in forked_rels:
                f_source_keys, f_target_keys = forked_rel_keys[forked_rel.id]
                if (
                    f_source_keys == orig_source_keys
                    and f_target_keys == orig_target_keys
                ):
                    matched_forked = forked_rel
                    break

            self.assertIsNotNone(
                matched_forked,
                f"No matching forked relationship found for original {orig_rel.id}",
            )

            # Verify the relationship points to the forked corpus
            self.assertEqual(matched_forked.corpus_id, forked_corpus.id)

            # Verify label mapping
            if orig_rel.relationship_label_id:
                expected_label = label_map.get(orig_rel.relationship_label_id)
                self.assertEqual(
                    matched_forked.relationship_label_id,
                    expected_label,
                    "Relationship label not correctly remapped",
                )

            # Verify source/target annotations reference forked corpus annotations
            matched_src_ids, matched_tgt_ids = forked_rel_annot_ids[matched_forked.id]
            for annot_id in matched_src_ids | matched_tgt_ids:
                self.assertIn(
                    annot_id,
                    forked_annot_by_id,
                    f"Forked relationship references annotation {annot_id} "
                    "not in the forked corpus",
                )

    def test_forked_corpus_metadata(self):
        """Verify the forked corpus has correct title prefix, parent reference,
        and is unlocked after fork completes."""
        original_corpus, forked_corpus = self._import_and_fork_corpus()

        self.assertEqual(forked_corpus.title, f"[FORK] {original_corpus.title}")
        self.assertEqual(forked_corpus.parent_id, original_corpus.id)
        self.assertFalse(
            forked_corpus.backend_lock,
            "Forked corpus should be unlocked after fork completes",
        )
        self.assertEqual(forked_corpus.creator_id, self.user.id)
