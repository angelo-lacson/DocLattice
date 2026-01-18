"""
Integration tests for structural annotation portability across corpuses.

These tests verify that structural annotations are properly DUPLICATED per corpus
when documents are added. Each corpus gets its own isolated copy of structural
annotations to enable per-corpus embeddings (different embedders may produce
incompatible vector dimensions).

NEW BEHAVIOR (corpus isolation):
- When a document is added to a corpus, it gets a NEW structural annotation set
- Structural annotation sets are DUPLICATED per corpus, not shared
- Total structural annotation count DOES increase when adding to multiple corpuses
"""

import hashlib

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    Relationship,
    StructuralAnnotationSet,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document

User = get_user_model()


class StructuralAnnotationPortabilityTests(TestCase):
    """Tests for structural annotations being DUPLICATED per corpus (corpus isolation)."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="test")
        self.content_hash = hashlib.sha256(b"test pdf content").hexdigest()

        # Create corpuses
        self.corpus_a = Corpus.objects.create(
            title="Corpus A", creator=self.user, is_public=True
        )
        self.corpus_b = Corpus.objects.create(
            title="Corpus B", creator=self.user, is_public=True
        )
        self.corpus_c = Corpus.objects.create(
            title="Corpus C", creator=self.user, is_public=True
        )

        # Create a structural annotation set for the document
        self.structural_set = StructuralAnnotationSet.objects.create(
            content_hash=self.content_hash,
            creator=self.user,
            parser_name="TestParser",
            parser_version="1.0",
            page_count=5,
            token_count=500,
        )

        # Create labels
        self.header_label = AnnotationLabel.objects.create(
            text="Header", creator=self.user
        )
        self.para_label = AnnotationLabel.objects.create(
            text="Paragraph", creator=self.user
        )
        self.rel_label = AnnotationLabel.objects.create(
            text="Contains", creator=self.user, label_type="RELATIONSHIP_LABEL"
        )

        # Create structural annotations in the set
        self.header_annot = Annotation.objects.create(
            structural_set=self.structural_set,
            annotation_label=self.header_label,
            creator=self.user,
            raw_text="Chapter 1: Introduction",
            structural=True,
        )
        self.para_annot = Annotation.objects.create(
            structural_set=self.structural_set,
            annotation_label=self.para_label,
            creator=self.user,
            raw_text="This document describes the system architecture.",
            structural=True,
        )

        # Create a structural relationship
        self.structural_rel = Relationship.objects.create(
            structural_set=self.structural_set,
            relationship_label=self.rel_label,
            creator=self.user,
            structural=True,
        )
        self.structural_rel.source_annotations.add(self.header_annot)
        self.structural_rel.target_annotations.add(self.para_annot)

        # Create the original document with the structural set
        self.original_doc = Document.objects.create(
            title="Test Document",
            creator=self.user,
            pdf_file_hash=self.content_hash,
            structural_annotation_set=self.structural_set,
        )

    def test_structural_set_duplicated_when_adding_to_corpus(self):
        """When adding a document to corpus, the corpus copy gets a NEW duplicated structural set."""
        corpus_doc, status, path = self.corpus_a.add_document(
            document=self.original_doc, user=self.user
        )

        # Status should be 'added' for new copy
        self.assertEqual(status, "added")

        # Corpus doc should be a different object (corpus isolation)
        self.assertNotEqual(corpus_doc.id, self.original_doc.id)

        # Corpus doc should have a DIFFERENT structural annotation set (duplicated)
        self.assertIsNotNone(corpus_doc.structural_annotation_set)
        self.assertNotEqual(
            corpus_doc.structural_annotation_set_id,
            self.original_doc.structural_annotation_set_id,
        )

        # The new set should have the same content (but be a separate copy)
        new_set = corpus_doc.structural_annotation_set
        self.assertEqual(new_set.parser_name, self.structural_set.parser_name)
        self.assertEqual(new_set.parser_version, self.structural_set.parser_version)
        self.assertEqual(new_set.page_count, self.structural_set.page_count)
        self.assertEqual(new_set.token_count, self.structural_set.token_count)

        # Content hash should include corpus ID suffix
        self.assertTrue(new_set.content_hash.startswith(self.content_hash))
        self.assertIn(f"_{self.corpus_a.pk}", new_set.content_hash)

    def test_structural_annotations_duplicated_per_corpus(self):
        """Each corpus copy has its OWN isolated set of structural annotations."""
        # Add document to three different corpuses
        corpus_a_doc, _, _ = self.corpus_a.add_document(
            document=self.original_doc, user=self.user
        )
        corpus_b_doc, _, _ = self.corpus_b.add_document(
            document=self.original_doc, user=self.user
        )
        corpus_c_doc, _, _ = self.corpus_c.add_document(
            document=self.original_doc, user=self.user
        )

        # All should have DIFFERENT structural sets (corpus isolation)
        self.assertNotEqual(
            corpus_a_doc.structural_annotation_set_id,
            corpus_b_doc.structural_annotation_set_id,
        )
        self.assertNotEqual(
            corpus_b_doc.structural_annotation_set_id,
            corpus_c_doc.structural_annotation_set_id,
        )
        self.assertNotEqual(
            corpus_a_doc.structural_annotation_set_id,
            corpus_c_doc.structural_annotation_set_id,
        )

        # Each should have the same NUMBER of annotations (duplicated)
        annots_a = list(
            corpus_a_doc.structural_annotation_set.structural_annotations.all()
        )
        annots_b = list(
            corpus_b_doc.structural_annotation_set.structural_annotations.all()
        )
        annots_c = list(
            corpus_c_doc.structural_annotation_set.structural_annotations.all()
        )

        self.assertEqual(len(annots_a), 2)  # header and paragraph
        self.assertEqual(len(annots_b), 2)
        self.assertEqual(len(annots_c), 2)

        # But the annotation objects should be DIFFERENT (different IDs)
        ids_a = {a.id for a in annots_a}
        ids_b = {a.id for a in annots_b}
        ids_c = {a.id for a in annots_c}

        self.assertTrue(ids_a.isdisjoint(ids_b))
        self.assertTrue(ids_b.isdisjoint(ids_c))
        self.assertTrue(ids_a.isdisjoint(ids_c))

        # Verify the content is the same (same raw_text values)
        texts_a = {a.raw_text for a in annots_a}
        texts_b = {a.raw_text for a in annots_b}
        texts_c = {a.raw_text for a in annots_c}

        self.assertEqual(texts_a, texts_b)
        self.assertEqual(texts_b, texts_c)

    def test_structural_relationships_not_duplicated(self):
        """Structural relationships are NOT duplicated (only annotations are bulk-copied)."""
        corpus_a_doc, _, _ = self.corpus_a.add_document(
            document=self.original_doc, user=self.user
        )
        corpus_b_doc, _, _ = self.corpus_b.add_document(
            document=self.original_doc, user=self.user
        )

        # Relationships are NOT bulk-copied in duplicate() method
        # (only annotations are copied, relationships would need separate handling)
        rels_a = list(
            corpus_a_doc.structural_annotation_set.structural_relationships.all()
        )
        rels_b = list(
            corpus_b_doc.structural_annotation_set.structural_relationships.all()
        )

        # Each new set has 0 relationships (not copied by duplicate())
        self.assertEqual(len(rels_a), 0)
        self.assertEqual(len(rels_b), 0)

        # Original set still has the relationship
        self.assertEqual(
            self.original_doc.structural_annotation_set.structural_relationships.count(),
            1,
        )

    def test_structural_annotations_count_increases_per_corpus(self):
        """Structural annotations ARE duplicated across corpus copies (count increases)."""
        # Initially we have 2 structural annotations (in original set)
        initial_count = Annotation.objects.filter(structural=True).count()
        self.assertEqual(initial_count, 2)

        # Add document to multiple corpuses
        self.corpus_a.add_document(document=self.original_doc, user=self.user)
        self.corpus_b.add_document(document=self.original_doc, user=self.user)
        self.corpus_c.add_document(document=self.original_doc, user=self.user)

        # Count should INCREASE (2 annotations × 3 corpuses = 6 new annotations)
        # Plus the original 2 = 8 total
        final_count = Annotation.objects.filter(structural=True).count()
        self.assertEqual(final_count, initial_count + (2 * 3))  # 8 total

    def test_structural_set_count_increases_per_corpus(self):
        """Each corpus gets its own StructuralAnnotationSet."""
        # Initially we have 1 structural set
        initial_set_count = StructuralAnnotationSet.objects.count()
        self.assertEqual(initial_set_count, 1)

        # Add document to multiple corpuses
        self.corpus_a.add_document(document=self.original_doc, user=self.user)
        self.corpus_b.add_document(document=self.original_doc, user=self.user)
        self.corpus_c.add_document(document=self.original_doc, user=self.user)

        # Should have 4 sets total (1 original + 3 corpus copies)
        final_set_count = StructuralAnnotationSet.objects.count()
        self.assertEqual(final_set_count, 4)

    def test_corpus_specific_annotations_remain_isolated(self):
        """Corpus-specific (non-structural) annotations remain isolated per corpus."""
        corpus_a_doc, _, _ = self.corpus_a.add_document(
            document=self.original_doc, user=self.user
        )
        corpus_b_doc, _, _ = self.corpus_b.add_document(
            document=self.original_doc, user=self.user
        )

        # Create corpus-specific annotations
        label = AnnotationLabel.objects.create(text="UserNote", creator=self.user)
        _corpus_a_annot = Annotation.objects.create(  # noqa: F841
            document=corpus_a_doc,
            corpus=self.corpus_a,
            annotation_label=label,
            creator=self.user,
            raw_text="Note for Corpus A",
            structural=False,  # NOT structural
        )

        # This annotation should only be accessible via corpus_a_doc
        self.assertEqual(
            corpus_a_doc.doc_annotations.filter(structural=False).count(), 1
        )
        self.assertEqual(
            corpus_b_doc.doc_annotations.filter(structural=False).count(), 0
        )

        # Both should have access to their own structural annotations via their isolated sets
        self.assertEqual(
            corpus_a_doc.structural_annotation_set.structural_annotations.count(), 2
        )
        self.assertEqual(
            corpus_b_doc.structural_annotation_set.structural_annotations.count(), 2
        )

        # But these are DIFFERENT annotation objects (isolated per corpus)
        self.assertNotEqual(
            corpus_a_doc.structural_annotation_set_id,
            corpus_b_doc.structural_annotation_set_id,
        )

    def test_structural_set_duplicated_even_with_no_annotations(self):
        """Document with structural set but no annotations still gets a duplicated set."""
        empty_hash = hashlib.sha256(b"empty content").hexdigest()
        empty_set = StructuralAnnotationSet.objects.create(
            content_hash=empty_hash, creator=self.user
        )

        doc = Document.objects.create(
            title="Empty Doc",
            creator=self.user,
            pdf_file_hash=empty_hash,
            structural_annotation_set=empty_set,
        )

        corpus_doc, _, _ = self.corpus_a.add_document(document=doc, user=self.user)

        # Should get a NEW duplicated set (not the same as empty_set)
        self.assertIsNotNone(corpus_doc.structural_annotation_set)
        self.assertNotEqual(corpus_doc.structural_annotation_set, empty_set)
        self.assertEqual(
            corpus_doc.structural_annotation_set.structural_annotations.count(), 0
        )

        # Content hash should include corpus suffix
        self.assertTrue(
            corpus_doc.structural_annotation_set.content_hash.startswith(empty_hash)
        )


class ImportContentStructuralSetTests(TransactionTestCase):
    """Tests for structural annotation sets with import_content."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="test")
        self.corpus_a = Corpus.objects.create(
            title="Corpus A", creator=self.user, is_public=True
        )
        self.corpus_b = Corpus.objects.create(
            title="Corpus B", creator=self.user, is_public=True
        )

    def test_import_creates_new_document_not_linked_to_global(self):
        """When import_document creates a document, it's a new corpus-isolated document."""
        from opencontractserver.documents.versioning import import_document

        content = b"test pdf content"
        content_hash = hashlib.sha256(content).hexdigest()

        # Create a structural set for this content
        structural_set = StructuralAnnotationSet.objects.create(
            content_hash=content_hash, creator=self.user
        )

        # Create a global document with this content and structural set
        _global_doc = Document.objects.create(  # noqa: F841
            title="Global Doc",
            creator=self.user,
            pdf_file_hash=content_hash,
            structural_annotation_set=structural_set,
        )

        # Now import the same content into a corpus
        doc, status, path = import_document(
            corpus=self.corpus_a,
            path="/documents/test.pdf",
            content=content,
            user=self.user,
        )

        # Status should be 'created' (new document created)
        self.assertEqual(status, "created")

        # Document should NOT have a structural set yet (parser will create it)
        # import_document doesn't copy structural sets from existing docs
        self.assertIsNone(doc.structural_annotation_set)

    def test_version_update_inherits_structural_set_from_previous_version(self):
        """When content is updated, the new version INHERITS the structural set from previous version."""
        from opencontractserver.documents.versioning import import_document

        content_v1 = b"test pdf content v1"
        content_v2 = b"test pdf content v2"
        hash_v1 = hashlib.sha256(content_v1).hexdigest()
        _hash_v2 = hashlib.sha256(content_v2).hexdigest()  # noqa: F841

        # Create structural set for v1
        structural_set_v1 = StructuralAnnotationSet.objects.create(
            content_hash=hash_v1, creator=self.user
        )

        # Import v1
        doc_v1, status_v1, path_v1 = import_document(
            corpus=self.corpus_a,
            path="/documents/test.pdf",
            content=content_v1,
            user=self.user,
        )
        self.assertEqual(status_v1, "created")

        # Manually set the structural set (simulating parser creating it)
        doc_v1.structural_annotation_set = structural_set_v1
        doc_v1.save()

        # Import v2 at same path (version update)
        doc_v2, status_v2, path_v2 = import_document(
            corpus=self.corpus_a,
            path="/documents/test.pdf",
            content=content_v2,
            user=self.user,
        )
        self.assertEqual(status_v2, "updated")

        # v2 INHERITS structural set from v1 (version updates carry forward the set)
        # This is different from add_document() which DUPLICATES the set
        # The parser may later update the set if needed for new content
        self.assertEqual(doc_v2.structural_annotation_set, structural_set_v1)

    def test_brand_new_content_has_no_structural_set(self):
        """Brand new content should have no structural set (parser will create it later)."""
        from opencontractserver.documents.versioning import import_document

        content = b"brand new content"

        doc, status, path = import_document(
            corpus=self.corpus_a,
            path="/documents/new.pdf",
            content=content,
            user=self.user,
        )

        self.assertEqual(status, "created")
        # No structural set yet (parser will create it)
        self.assertIsNone(doc.structural_annotation_set)
