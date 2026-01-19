"""
Round-trip tests for corpus forking functionality.

These tests validate that forking is lossless (or intentionally lossy with documented
exclusions) by creating corpuses with known data, forking them through multiple
generations, and comparing data integrity at each step.

Test Philosophy:
    1. Create a corpus with comprehensive test data
    2. Fork it (generation 1)
    3. Compare fork to original
    4. Fork the fork (generation 2)
    5. Compare generation 2 to generation 1
    6. Repeat for N generations and detect degradation

Run with:
    docker compose -f test.yml run django pytest opencontractserver/tests/test_corpus_fork_round_trip.py -v
"""

import logging
from dataclasses import dataclass
from typing import Optional

from django.contrib.auth import get_user_model
from django.test import TransactionTestCase

from opencontractserver.annotations.models import (
    RELATIONSHIP_LABEL,
    TOKEN_LABEL,
    Annotation,
    AnnotationLabel,
    LabelSet,
    Note,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.tasks.fork_tasks import fork_corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()
logger = logging.getLogger(__name__)


@dataclass
class CorpusSnapshot:
    """Captures the state of a corpus for comparison."""

    corpus_id: int
    title: str
    document_count: int
    annotation_count: int
    relationship_count: int
    label_count: int
    folder_count: int
    note_count: int

    # Detailed data for integrity checks
    document_titles: set[str]
    annotation_texts: set[str]
    label_texts: set[str]
    folder_names: set[str]
    note_titles: set[str]
    relationship_label_texts: set[str]

    # Metadata fields
    has_description: bool
    has_icon: bool
    has_label_set: bool

    @classmethod
    def from_corpus(cls, corpus: Corpus) -> "CorpusSnapshot":
        """Create a snapshot from a corpus."""
        # Get documents via get_documents() to respect DocumentPath
        documents = corpus.get_documents()

        # Get user annotations (not analysis-generated)
        annotations = Annotation.objects.filter(
            corpus_id=corpus.pk,
            analysis__isnull=True,
        )

        # Get relationships (not analysis-generated)
        relationships = Relationship.objects.filter(
            corpus_id=corpus.pk,
            analysis__isnull=True,
        )

        # Get folders
        folders = CorpusFolder.objects.filter(corpus_id=corpus.pk)

        # Get notes for documents in corpus
        doc_ids = documents.values_list("id", flat=True)
        notes = Note.objects.filter(document_id__in=doc_ids)

        # Get labels if label set exists
        labels = []
        if corpus.label_set:
            labels = corpus.label_set.annotation_labels.all()

        return cls(
            corpus_id=corpus.pk,
            title=corpus.title,
            document_count=documents.count(),
            annotation_count=annotations.count(),
            relationship_count=relationships.count(),
            label_count=len(labels),
            folder_count=folders.count(),
            note_count=notes.count(),
            document_titles=set(documents.values_list("title", flat=True)),
            annotation_texts=set(
                annotations.values_list("raw_text", flat=True)
            ),
            label_texts=set(label.text for label in labels),
            folder_names=set(folders.values_list("name", flat=True)),
            note_titles=set(notes.values_list("title", flat=True)),
            relationship_label_texts=set(
                relationships.exclude(relationship_label__isnull=True)
                .values_list("relationship_label__text", flat=True)
            ),
            has_description=bool(corpus.description),
            has_icon=bool(corpus.icon and corpus.icon.name),
            has_label_set=corpus.label_set is not None,
        )

    def compare_to(
        self,
        other: "CorpusSnapshot",
        ignore_title_prefix: bool = True,
    ) -> list[str]:
        """
        Compare this snapshot to another and return list of differences.

        Args:
            other: The snapshot to compare against
            ignore_title_prefix: If True, ignore [FORK] prefix when comparing titles

        Returns:
            List of difference descriptions (empty if identical)
        """
        differences = []

        # Document count
        if self.document_count != other.document_count:
            differences.append(
                f"Document count: {self.document_count} vs {other.document_count}"
            )

        # Annotation count
        if self.annotation_count != other.annotation_count:
            differences.append(
                f"Annotation count: {self.annotation_count} vs {other.annotation_count}"
            )

        # Label count
        if self.label_count != other.label_count:
            differences.append(
                f"Label count: {self.label_count} vs {other.label_count}"
            )

        # Document titles (ignoring [FORK] prefix)
        def normalize_title(t: str) -> str:
            if ignore_title_prefix:
                return t.replace("[FORK] ", "")
            return t

        self_doc_titles = {normalize_title(t) for t in self.document_titles}
        other_doc_titles = {normalize_title(t) for t in other.document_titles}
        if self_doc_titles != other_doc_titles:
            missing = self_doc_titles - other_doc_titles
            extra = other_doc_titles - self_doc_titles
            if missing:
                differences.append(f"Missing document titles: {missing}")
            if extra:
                differences.append(f"Extra document titles: {extra}")

        # Annotation texts
        if self.annotation_texts != other.annotation_texts:
            missing = self.annotation_texts - other.annotation_texts
            extra = other.annotation_texts - self.annotation_texts
            if missing:
                differences.append(f"Missing annotation texts: {missing}")
            if extra:
                differences.append(f"Extra annotation texts: {extra}")

        # Label texts
        if self.label_texts != other.label_texts:
            missing = self.label_texts - other.label_texts
            extra = other.label_texts - self.label_texts
            if missing:
                differences.append(f"Missing label texts: {missing}")
            if extra:
                differences.append(f"Extra label texts: {extra}")

        return differences


class CorpusForkRoundTripTestCase(TransactionTestCase):
    """
    Round-trip tests for corpus forking.

    Tests validate that forking preserves data integrity across multiple generations.
    """

    def setUp(self):
        """Create test user."""
        self.user = User.objects.create_user(
            username="fork_test_user",
            password="testpass123",
        )

    def _create_test_corpus(
        self,
        title: str = "Test Corpus",
        num_documents: int = 3,
        num_annotations_per_doc: int = 2,
        num_relationships: int = 2,
        num_folders: int = 2,
        num_notes_per_doc: int = 1,
    ) -> Corpus:
        """
        Create a corpus with comprehensive test data.

        This creates a corpus with known data that can be validated after forking.
        """
        # Create label set with labels
        label_set = LabelSet.objects.create(
            title=f"{title} Labels",
            description="Test label set for fork testing",
            creator=self.user,
        )

        # Create token labels
        token_labels = []
        for i in range(3):
            label = AnnotationLabel.objects.create(
                text=f"Token Label {i}",
                label_type=TOKEN_LABEL,
                color=f"#{'0' * i}{'F' * (6-i)}",
                description=f"Test token label {i}",
                creator=self.user,
            )
            label_set.annotation_labels.add(label)
            token_labels.append(label)

        # Create relationship label
        rel_label = AnnotationLabel.objects.create(
            text="Related To",
            label_type=RELATIONSHIP_LABEL,
            color="#FF0000",
            description="Test relationship label",
            creator=self.user,
        )
        label_set.annotation_labels.add(rel_label)

        # Create corpus
        corpus = Corpus.objects.create(
            title=title,
            description=f"Test corpus for fork round-trip testing: {title}",
            label_set=label_set,
            creator=self.user,
            is_public=False,
        )
        set_permissions_for_obj_to_user(self.user, corpus, [PermissionTypes.ALL])

        # Create folders
        folders = []
        root_folder = None
        for i in range(num_folders):
            folder = CorpusFolder.objects.create(
                name=f"Folder {i}",
                corpus=corpus,
                description=f"Test folder {i}",
                parent=root_folder if i > 0 else None,
                creator=self.user,
            )
            set_permissions_for_obj_to_user(self.user, folder, [PermissionTypes.ALL])
            folders.append(folder)
            if i == 0:
                root_folder = folder

        # Create documents
        documents = []
        for i in range(num_documents):
            doc = Document.objects.create(
                title=f"Document {i}",
                description=f"Test document {i} for fork testing",
                creator=self.user,
                is_public=False,
                backend_lock=False,
                processing_started=None,
            )
            set_permissions_for_obj_to_user(self.user, doc, [PermissionTypes.ALL])

            # Add to corpus with folder assignment
            folder = folders[i % len(folders)] if folders else None

            # Create DocumentPath manually (since add_document has complex logic)
            path = f"/documents/doc_{doc.pk}"
            DocumentPath.objects.create(
                document=doc,
                corpus=corpus,
                folder=folder,
                path=path,
                version_number=1,
                is_current=True,
                is_deleted=False,
                creator=self.user,
            )
            corpus.documents.add(doc)

            documents.append(doc)

            # Create annotations for this document
            annotations = []
            for j in range(num_annotations_per_doc):
                annotation = Annotation.objects.create(
                    page=1,
                    raw_text=f"Annotation text {i}-{j}",
                    tokens_jsons=[{"text": f"token_{i}_{j}"}],
                    json={"test": f"data_{i}_{j}"},
                    annotation_label=token_labels[j % len(token_labels)],
                    document=doc,
                    corpus=corpus,
                    creator=self.user,
                )
                set_permissions_for_obj_to_user(
                    self.user, annotation, [PermissionTypes.ALL]
                )
                annotations.append(annotation)

            # Create notes for this document
            for k in range(num_notes_per_doc):
                note = Note.objects.create(
                    title=f"Note {i}-{k}",
                    content=f"Note content for document {i}, note {k}",
                    document=doc,
                    corpus=corpus,
                    page=1,
                    creator=self.user,
                )
                set_permissions_for_obj_to_user(self.user, note, [PermissionTypes.ALL])

        # Create relationships between annotations
        all_annotations = list(
            Annotation.objects.filter(corpus=corpus, analysis__isnull=True)
        )
        for i in range(min(num_relationships, len(all_annotations) - 1)):
            source_ann = all_annotations[i]
            target_ann = all_annotations[i + 1]

            relationship = Relationship.objects.create(
                relationship_label=rel_label,
                corpus=corpus,
                document=source_ann.document,
                creator=self.user,
            )
            relationship.source_annotations.add(source_ann)
            relationship.target_annotations.add(target_ann)
            set_permissions_for_obj_to_user(
                self.user, relationship, [PermissionTypes.ALL]
            )

        return corpus

    def _execute_fork(self, corpus: Corpus) -> Optional[Corpus]:
        """
        Execute a fork of the given corpus.

        Returns the forked corpus or None if fork failed.
        """
        # Collect fork data (mimicking the mutation logic)
        doc_ids = list(corpus.get_documents().values_list("id", flat=True))

        annotation_ids = list(
            Annotation.objects.filter(
                corpus_id=corpus.pk,
                analysis__isnull=True,
            ).values_list("id", flat=True)
        )

        label_set_id = corpus.label_set_id

        # Collect folder IDs (in tree order for proper parent mapping)
        folder_ids = list(
            CorpusFolder.objects.filter(corpus_id=corpus.pk)
            .order_by("tree_depth", "pk")
            .values_list("id", flat=True)
        )

        # Collect relationship IDs (user relationships only)
        relationship_ids = list(
            Relationship.objects.filter(
                corpus_id=corpus.pk,
                analysis__isnull=True,
            ).values_list("id", flat=True)
        )

        # Create the forked corpus shell
        forked_corpus = Corpus.objects.create(
            title=f"[FORK] {corpus.title}",
            description=corpus.description,
            backend_lock=True,
            creator=self.user,
            parent_id=corpus.pk,
        )
        set_permissions_for_obj_to_user(
            self.user, forked_corpus, [PermissionTypes.ALL]
        )

        # Execute the fork task synchronously
        result = fork_corpus(
            new_corpus_id=forked_corpus.pk,
            doc_ids=doc_ids,
            label_set_id=label_set_id,
            annotation_ids=annotation_ids,
            folder_ids=folder_ids,
            relationship_ids=relationship_ids,
            user_id=self.user.pk,
        )

        if result is None:
            return None

        # Refresh from database
        forked_corpus.refresh_from_db()
        return forked_corpus

    def test_single_fork_preserves_documents(self):
        """Test that a single fork preserves all documents."""
        original = self._create_test_corpus(
            title="Doc Preservation Test",
            num_documents=5,
            num_annotations_per_doc=0,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )
        original_snapshot = CorpusSnapshot.from_corpus(original)

        forked = self._execute_fork(original)
        self.assertIsNotNone(forked, "Fork should succeed")

        forked_snapshot = CorpusSnapshot.from_corpus(forked)

        self.assertEqual(
            original_snapshot.document_count,
            forked_snapshot.document_count,
            "Document count should match",
        )

        differences = original_snapshot.compare_to(forked_snapshot)
        # Filter out expected differences (folders, notes, relationships not copied yet)
        doc_related_diffs = [d for d in differences if "document" in d.lower()]
        self.assertEqual(
            doc_related_diffs,
            [],
            f"Document-related differences found: {doc_related_diffs}",
        )

    def test_single_fork_preserves_annotations(self):
        """Test that a single fork preserves all user annotations."""
        original = self._create_test_corpus(
            title="Annotation Preservation Test",
            num_documents=3,
            num_annotations_per_doc=4,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )
        original_snapshot = CorpusSnapshot.from_corpus(original)

        forked = self._execute_fork(original)
        self.assertIsNotNone(forked, "Fork should succeed")

        forked_snapshot = CorpusSnapshot.from_corpus(forked)

        self.assertEqual(
            original_snapshot.annotation_count,
            forked_snapshot.annotation_count,
            "Annotation count should match",
        )
        self.assertEqual(
            original_snapshot.annotation_texts,
            forked_snapshot.annotation_texts,
            "Annotation texts should match",
        )

    def test_single_fork_preserves_labels(self):
        """Test that a single fork preserves all labels in the label set."""
        original = self._create_test_corpus(
            title="Label Preservation Test",
            num_documents=1,
            num_annotations_per_doc=1,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )
        original_snapshot = CorpusSnapshot.from_corpus(original)

        forked = self._execute_fork(original)
        self.assertIsNotNone(forked, "Fork should succeed")

        forked_snapshot = CorpusSnapshot.from_corpus(forked)

        self.assertEqual(
            original_snapshot.label_count,
            forked_snapshot.label_count,
            "Label count should match",
        )
        self.assertEqual(
            original_snapshot.label_texts,
            forked_snapshot.label_texts,
            "Label texts should match",
        )

    def test_fork_establishes_parent_relationship(self):
        """Test that forked corpus has correct parent relationship."""
        original = self._create_test_corpus(
            title="Parent Relationship Test",
            num_documents=1,
            num_annotations_per_doc=0,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )

        forked = self._execute_fork(original)
        self.assertIsNotNone(forked, "Fork should succeed")

        self.assertEqual(
            forked.parent_id,
            original.pk,
            "Forked corpus should have original as parent",
        )
        self.assertEqual(
            forked.parent,
            original,
            "Forked corpus parent should be the original corpus",
        )

    def test_multi_generation_fork_no_degradation(self):
        """
        Test that forking through multiple generations doesn't degrade data.

        This is the core round-trip test: fork a corpus multiple times and
        ensure no data loss occurs.
        """
        num_generations = 3

        # Create original corpus with comprehensive data
        original = self._create_test_corpus(
            title="Multi-Gen Test",
            num_documents=3,
            num_annotations_per_doc=3,
            num_relationships=2,  # Now implemented in fork
            num_folders=2,  # Now implemented in fork
            num_notes_per_doc=0,  # Not yet implemented in fork
        )
        original_snapshot = CorpusSnapshot.from_corpus(original)

        # Track all generations
        generations = [original]
        snapshots = [original_snapshot]

        # Fork through multiple generations
        current = original
        for gen in range(num_generations):
            forked = self._execute_fork(current)
            self.assertIsNotNone(
                forked,
                f"Fork should succeed at generation {gen + 1}",
            )

            snapshot = CorpusSnapshot.from_corpus(forked)
            generations.append(forked)
            snapshots.append(snapshot)
            current = forked

        # Verify no degradation between generations
        for i in range(len(snapshots) - 1):
            current_snapshot = snapshots[i]
            next_snapshot = snapshots[i + 1]

            # Document count should be stable
            self.assertEqual(
                current_snapshot.document_count,
                next_snapshot.document_count,
                f"Document count degraded at generation {i + 1}: "
                f"{current_snapshot.document_count} -> {next_snapshot.document_count}",
            )

            # Annotation count should be stable
            self.assertEqual(
                current_snapshot.annotation_count,
                next_snapshot.annotation_count,
                f"Annotation count degraded at generation {i + 1}: "
                f"{current_snapshot.annotation_count} -> {next_snapshot.annotation_count}",
            )

            # Label count should be stable
            self.assertEqual(
                current_snapshot.label_count,
                next_snapshot.label_count,
                f"Label count degraded at generation {i + 1}: "
                f"{current_snapshot.label_count} -> {next_snapshot.label_count}",
            )

            # Folder count should be stable
            self.assertEqual(
                current_snapshot.folder_count,
                next_snapshot.folder_count,
                f"Folder count degraded at generation {i + 1}: "
                f"{current_snapshot.folder_count} -> {next_snapshot.folder_count}",
            )

            # Relationship count should be stable
            self.assertEqual(
                current_snapshot.relationship_count,
                next_snapshot.relationship_count,
                f"Relationship count degraded at generation {i + 1}: "
                f"{current_snapshot.relationship_count} -> {next_snapshot.relationship_count}",
            )

        # Verify final generation matches original (for copied data)
        final_snapshot = snapshots[-1]

        self.assertEqual(
            original_snapshot.document_count,
            final_snapshot.document_count,
            f"After {num_generations} generations, document count should match original",
        )
        self.assertEqual(
            original_snapshot.annotation_count,
            final_snapshot.annotation_count,
            f"After {num_generations} generations, annotation count should match original",
        )
        self.assertEqual(
            original_snapshot.label_count,
            final_snapshot.label_count,
            f"After {num_generations} generations, label count should match original",
        )
        self.assertEqual(
            original_snapshot.folder_count,
            final_snapshot.folder_count,
            f"After {num_generations} generations, folder count should match original",
        )
        self.assertEqual(
            original_snapshot.relationship_count,
            final_snapshot.relationship_count,
            f"After {num_generations} generations, relationship count should match original",
        )

    def test_fork_chain_maintains_ancestry(self):
        """Test that fork chain maintains correct parent relationships."""
        num_generations = 4

        original = self._create_test_corpus(
            title="Ancestry Test",
            num_documents=1,
            num_annotations_per_doc=1,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )

        generations = [original]
        current = original

        for _ in range(num_generations):
            forked = self._execute_fork(current)
            self.assertIsNotNone(forked)
            generations.append(forked)
            current = forked

        # Verify ancestry chain
        for i in range(1, len(generations)):
            child = generations[i]
            expected_parent = generations[i - 1]

            self.assertEqual(
                child.parent_id,
                expected_parent.pk,
                f"Generation {i} should have generation {i-1} as parent",
            )

        # Verify we can traverse back to original
        current = generations[-1]
        ancestors = []
        while current.parent_id:
            ancestors.append(current.parent_id)
            current = Corpus.objects.get(pk=current.parent_id)

        self.assertEqual(
            len(ancestors),
            num_generations,
            f"Should have {num_generations} ancestors",
        )
        self.assertEqual(
            ancestors[-1],
            original.pk,
            "Oldest ancestor should be original corpus",
        )

    def test_annotation_text_integrity_across_generations(self):
        """Test that annotation text content is preserved exactly through forks."""
        # Create corpus with specific annotation texts
        original = self._create_test_corpus(
            title="Text Integrity Test",
            num_documents=2,
            num_annotations_per_doc=3,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )

        # Get original annotation texts
        original_texts = set(
            Annotation.objects.filter(
                corpus=original,
                analysis__isnull=True,
            ).values_list("raw_text", flat=True)
        )

        # Fork through 3 generations
        current = original
        for gen in range(3):
            forked = self._execute_fork(current)
            self.assertIsNotNone(forked)

            forked_texts = set(
                Annotation.objects.filter(
                    corpus=forked,
                    analysis__isnull=True,
                ).values_list("raw_text", flat=True)
            )

            self.assertEqual(
                original_texts,
                forked_texts,
                f"Annotation texts should be preserved at generation {gen + 1}",
            )

            current = forked

    def test_empty_corpus_fork(self):
        """Test that forking an empty corpus works correctly."""
        empty_corpus = Corpus.objects.create(
            title="Empty Corpus",
            description="A corpus with no documents",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, empty_corpus, [PermissionTypes.ALL]
        )

        forked = self._execute_fork(empty_corpus)
        self.assertIsNotNone(forked, "Fork of empty corpus should succeed")

        forked_snapshot = CorpusSnapshot.from_corpus(forked)

        self.assertEqual(forked_snapshot.document_count, 0)
        self.assertEqual(forked_snapshot.annotation_count, 0)
        self.assertEqual(forked.parent_id, empty_corpus.pk)

    def test_fork_does_not_copy_analysis_annotations(self):
        """Test that analysis-generated annotations are NOT copied during fork."""
        from opencontractserver.analyzer.models import Analysis, Analyzer

        original = self._create_test_corpus(
            title="Analysis Exclusion Test",
            num_documents=2,
            num_annotations_per_doc=2,
            num_relationships=0,
            num_folders=0,
            num_notes_per_doc=0,
        )

        # Create an analyzer and analysis
        analyzer = Analyzer.objects.create(
            id="test-analyzer",
            description="Test analyzer",
            creator=self.user,
        )

        analysis = Analysis.objects.create(
            analyzer=analyzer,
            corpus=original,
            creator=self.user,
        )

        # Create analysis-generated annotation
        doc = original.get_documents().first()
        analysis_annotation = Annotation.objects.create(
            page=1,
            raw_text="Analysis generated annotation",
            document=doc,
            corpus=original,
            analysis=analysis,  # This marks it as analysis-generated
            creator=self.user,
        )

        # Count annotations before fork
        original_user_annotations = Annotation.objects.filter(
            corpus=original,
            analysis__isnull=True,
        ).count()
        original_all_annotations = Annotation.objects.filter(
            corpus=original,
        ).count()

        self.assertEqual(
            original_all_annotations,
            original_user_annotations + 1,
            "Should have user annotations plus one analysis annotation",
        )

        # Fork
        forked = self._execute_fork(original)
        self.assertIsNotNone(forked)

        # Verify analysis annotation was NOT copied
        forked_annotations = Annotation.objects.filter(corpus=forked)
        self.assertEqual(
            forked_annotations.count(),
            original_user_annotations,
            "Forked corpus should only have user annotations, not analysis annotations",
        )

        # Verify none of the forked annotations are analysis-generated
        forked_analysis_annotations = forked_annotations.filter(
            analysis__isnull=False
        ).count()
        self.assertEqual(
            forked_analysis_annotations,
            0,
            "No forked annotations should be analysis-generated",
        )


class CorpusForkPreservationTest(TransactionTestCase):
    """
    Tests that verify folders and relationships ARE copied during fork.

    These tests validate that the fork implementation correctly preserves
    folder structure and annotation relationships.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="preservation_test_user",
            password="testpass123",
        )

    def test_relationships_are_copied(self):
        """
        Test that relationships are correctly copied during fork.

        Verifies that relationship count, labels, and annotation connections
        are preserved in the forked corpus.
        """
        # Create corpus with relationships
        corpus = Corpus.objects.create(
            title="Relationship Test",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, corpus, [PermissionTypes.ALL])

        # Create document and annotations
        doc = Document.objects.create(
            title="Test Doc",
            creator=self.user,
        )
        DocumentPath.objects.create(
            document=doc,
            corpus=corpus,
            path="/documents/test",
            version_number=1,
            is_current=True,
            creator=self.user,
        )
        corpus.documents.add(doc)

        label_set = LabelSet.objects.create(
            title="Test Labels",
            creator=self.user,
        )
        token_label = AnnotationLabel.objects.create(
            text="Token",
            label_type=TOKEN_LABEL,
            creator=self.user,
        )
        rel_label = AnnotationLabel.objects.create(
            text="Related",
            label_type=RELATIONSHIP_LABEL,
            creator=self.user,
        )
        label_set.annotation_labels.add(token_label, rel_label)
        corpus.label_set = label_set
        corpus.save()

        ann1 = Annotation.objects.create(
            page=1,
            raw_text="First",
            document=doc,
            corpus=corpus,
            annotation_label=token_label,
            creator=self.user,
        )
        ann2 = Annotation.objects.create(
            page=1,
            raw_text="Second",
            document=doc,
            corpus=corpus,
            annotation_label=token_label,
            creator=self.user,
        )

        # Create relationship
        relationship = Relationship.objects.create(
            relationship_label=rel_label,
            corpus=corpus,
            document=doc,
            creator=self.user,
        )
        relationship.source_annotations.add(ann1)
        relationship.target_annotations.add(ann2)

        original_rel_count = Relationship.objects.filter(corpus=corpus).count()
        self.assertEqual(original_rel_count, 1)

        # Fork - include relationship_ids
        doc_ids = [doc.pk]
        annotation_ids = [ann1.pk, ann2.pk]
        folder_ids = []
        relationship_ids = [relationship.pk]

        forked = Corpus.objects.create(
            title="[FORK] Relationship Test",
            creator=self.user,
            parent_id=corpus.pk,
            backend_lock=True,
        )
        set_permissions_for_obj_to_user(self.user, forked, [PermissionTypes.ALL])

        fork_corpus(
            new_corpus_id=forked.pk,
            doc_ids=doc_ids,
            label_set_id=label_set.pk,
            annotation_ids=annotation_ids,
            folder_ids=folder_ids,
            relationship_ids=relationship_ids,
            user_id=self.user.pk,
        )

        forked.refresh_from_db()

        # Verify relationships ARE copied
        forked_rel_count = Relationship.objects.filter(corpus=forked).count()
        self.assertEqual(
            forked_rel_count,
            1,
            "Relationships should be copied during fork",
        )

        # Verify the relationship has correct annotations
        forked_rel = Relationship.objects.filter(corpus=forked).first()
        self.assertEqual(
            forked_rel.source_annotations.count(),
            1,
            "Forked relationship should have source annotation",
        )
        self.assertEqual(
            forked_rel.target_annotations.count(),
            1,
            "Forked relationship should have target annotation",
        )

        # Verify relationship label was mapped correctly
        self.assertIsNotNone(
            forked_rel.relationship_label,
            "Forked relationship should have a label",
        )
        self.assertEqual(
            forked_rel.relationship_label.text,
            "Related",
            "Forked relationship label text should match original",
        )

    def test_folders_are_copied(self):
        """
        Test that folder structure is correctly copied during fork.

        Verifies that folder count, names, and hierarchy are preserved
        in the forked corpus.
        """
        corpus = Corpus.objects.create(
            title="Folder Test",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, corpus, [PermissionTypes.ALL])

        # Create folder structure
        root = CorpusFolder.objects.create(
            name="Root Folder",
            corpus=corpus,
            creator=self.user,
        )
        child = CorpusFolder.objects.create(
            name="Child Folder",
            corpus=corpus,
            parent=root,
            creator=self.user,
        )

        original_folder_count = CorpusFolder.objects.filter(corpus=corpus).count()
        self.assertEqual(original_folder_count, 2)

        # Fork - include folder_ids
        folder_ids = list(
            CorpusFolder.objects.filter(corpus=corpus)
            .order_by("tree_depth", "pk")
            .values_list("id", flat=True)
        )

        forked = Corpus.objects.create(
            title="[FORK] Folder Test",
            creator=self.user,
            parent_id=corpus.pk,
            backend_lock=True,
        )
        set_permissions_for_obj_to_user(self.user, forked, [PermissionTypes.ALL])

        fork_corpus(
            new_corpus_id=forked.pk,
            doc_ids=[],
            label_set_id=None,
            annotation_ids=[],
            folder_ids=folder_ids,
            relationship_ids=[],
            user_id=self.user.pk,
        )

        forked.refresh_from_db()

        # Verify folders ARE copied
        forked_folder_count = CorpusFolder.objects.filter(corpus=forked).count()
        self.assertEqual(
            forked_folder_count,
            2,
            "Folders should be copied during fork",
        )

        # Verify folder names are preserved
        forked_folder_names = set(
            CorpusFolder.objects.filter(corpus=forked).values_list("name", flat=True)
        )
        self.assertEqual(
            forked_folder_names,
            {"Root Folder", "Child Folder"},
            "Folder names should be preserved",
        )

        # Verify hierarchy is preserved
        forked_child = CorpusFolder.objects.get(corpus=forked, name="Child Folder")
        self.assertIsNotNone(
            forked_child.parent,
            "Child folder should have a parent",
        )
        self.assertEqual(
            forked_child.parent.name,
            "Root Folder",
            "Child folder's parent should be Root Folder",
        )

    def test_document_folder_assignment_preserved(self):
        """
        Test that documents maintain their folder assignments after fork.
        """
        corpus = Corpus.objects.create(
            title="Doc Folder Test",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, corpus, [PermissionTypes.ALL])

        # Create folder
        folder = CorpusFolder.objects.create(
            name="My Folder",
            corpus=corpus,
            creator=self.user,
        )

        # Create document in folder
        doc = Document.objects.create(
            title="Test Doc",
            creator=self.user,
        )
        DocumentPath.objects.create(
            document=doc,
            corpus=corpus,
            folder=folder,
            path="/documents/test",
            version_number=1,
            is_current=True,
            creator=self.user,
        )
        corpus.documents.add(doc)

        # Verify original setup
        original_path = DocumentPath.objects.get(
            corpus=corpus, document=doc, is_current=True
        )
        self.assertEqual(original_path.folder, folder)

        # Fork
        folder_ids = [folder.pk]

        forked = Corpus.objects.create(
            title="[FORK] Doc Folder Test",
            creator=self.user,
            parent_id=corpus.pk,
            backend_lock=True,
        )
        set_permissions_for_obj_to_user(self.user, forked, [PermissionTypes.ALL])

        fork_corpus(
            new_corpus_id=forked.pk,
            doc_ids=[doc.pk],
            label_set_id=None,
            annotation_ids=[],
            folder_ids=folder_ids,
            relationship_ids=[],
            user_id=self.user.pk,
        )

        forked.refresh_from_db()

        # Verify folder was copied
        forked_folder = CorpusFolder.objects.filter(corpus=forked).first()
        self.assertIsNotNone(forked_folder)
        self.assertEqual(forked_folder.name, "My Folder")

        # Verify document is in the forked folder
        forked_doc = forked.get_documents().first()
        self.assertIsNotNone(forked_doc)

        forked_path = DocumentPath.objects.filter(
            corpus=forked, document=forked_doc, is_current=True, is_deleted=False
        ).first()
        self.assertIsNotNone(forked_path)
        self.assertEqual(
            forked_path.folder,
            forked_folder,
            "Document should be in the forked folder",
        )

    def test_notes_not_copied_limitation(self):
        """
        LIMITATION: Notes are not currently copied during fork.

        This test documents the current behavior. Once note copying is
        implemented, this test should be updated to verify notes ARE copied.
        """
        corpus = Corpus.objects.create(
            title="Notes Test",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, corpus, [PermissionTypes.ALL])

        doc = Document.objects.create(
            title="Test Doc",
            creator=self.user,
        )
        DocumentPath.objects.create(
            document=doc,
            corpus=corpus,
            path="/documents/test",
            version_number=1,
            is_current=True,
            creator=self.user,
        )
        corpus.documents.add(doc)

        # Create note
        note = Note.objects.create(
            title="Test Note",
            content="Note content",
            document=doc,
            corpus=corpus,
            creator=self.user,
        )

        original_note_count = Note.objects.filter(corpus=corpus).count()
        self.assertEqual(original_note_count, 1)

        # Fork
        forked = Corpus.objects.create(
            title="[FORK] Notes Test",
            creator=self.user,
            parent_id=corpus.pk,
            backend_lock=True,
        )
        set_permissions_for_obj_to_user(self.user, forked, [PermissionTypes.ALL])

        fork_corpus(
            new_corpus_id=forked.pk,
            doc_ids=[doc.pk],
            label_set_id=None,
            annotation_ids=[],
            folder_ids=[],
            relationship_ids=[],
            user_id=self.user.pk,
        )

        forked.refresh_from_db()

        # CURRENT LIMITATION: Notes are NOT copied
        forked_note_count = Note.objects.filter(corpus=forked).count()
        self.assertEqual(
            forked_note_count,
            0,
            "LIMITATION: Notes are not currently copied during fork. "
            "If this test fails, the limitation may have been fixed - update accordingly!",
        )
