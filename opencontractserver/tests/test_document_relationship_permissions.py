"""
Test DocumentRelationship permission model.

NOTE: DocumentRelationship uses INHERITED permissions from source_document,
target_document, and corpus. This is different from objects with direct
django-guardian permissions.

Formula: Effective Permission = MIN(source_doc_perm, target_doc_perm, corpus_perm)

The tests verify:
1. Owner with CRUD on docs/corpus can fully manage relationships
2. Collaborator with READ-only has limited access
3. Outsider with no permissions cannot access private relationships
"""

import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from opencontractserver.annotations.models import AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import (
    Document,
    DocumentPath,
    DocumentRelationship,
)
from opencontractserver.documents.query_optimizer import (
    DocumentRelationshipQueryOptimizer,
)
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()
logger = logging.getLogger(__name__)


class DocumentRelationshipPermissionTestCase(TestCase):
    """Test that DocumentRelationship permissions work correctly.

    Uses inherited permission model where effective permission is
    MIN(source_doc_perm, target_doc_perm, corpus_perm).
    """

    def setUp(self):
        """Set up test data."""
        # Create users
        self.owner = User.objects.create_user(username="owner", password="test")
        self.collaborator = User.objects.create_user(
            username="collaborator", password="test"
        )
        self.outsider = User.objects.create_user(username="outsider", password="test")

        # Create test corpus
        self.corpus = Corpus.objects.create(
            title="TestCorpus",
            creator=self.owner,
            is_public=False,
        )

        # Create test documents
        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        self.source_doc = Document.objects.create(
            creator=self.owner,
            title="Source Doc",
            description="Source document",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
            is_public=False,
        )

        self.target_doc = Document.objects.create(
            creator=self.owner,
            title="Target Doc",
            description="Target document",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
            is_public=False,
        )

        # Create test annotation label
        self.annotation_label = AnnotationLabel.objects.create(
            text="Test Relationship Label",
            label_type="RELATIONSHIP_LABEL",
            creator=self.owner,
        )

        # Add documents to corpus via DocumentPath (required for DocumentRelationship)
        DocumentPath.objects.create(
            document=self.source_doc,
            corpus=self.corpus,
            creator=self.owner,
            path="/source_doc",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )
        DocumentPath.objects.create(
            document=self.target_doc,
            corpus=self.corpus,
            creator=self.owner,
            path="/target_doc",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

        # Create document relationship
        self.relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="RELATIONSHIP",
            annotation_label=self.annotation_label,
            creator=self.owner,
            corpus=self.corpus,
        )

        # Set up permissions on documents and corpus
        # (DocumentRelationship inherits permissions from these)
        # Owner gets full access to everything
        set_permissions_for_obj_to_user(
            self.owner, self.source_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.target_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        # Collaborator gets READ on documents and corpus
        # (inherited permission will be MIN of all = READ)
        set_permissions_for_obj_to_user(
            self.collaborator, self.source_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.collaborator, self.target_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.collaborator, self.corpus, [PermissionTypes.READ]
        )

        # Outsider gets nothing

    def test_owner_has_all_permissions(self):
        """Test that owner has full CRUD permissions on underlying documents."""
        # Owner has CRUD on source document
        self.assertTrue(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.owner,
                self.relationship,
                "READ",
            )
        )
        self.assertTrue(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.owner,
                self.relationship,
                "UPDATE",
            )
        )
        self.assertTrue(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.owner,
                self.relationship,
                "DELETE",
            )
        )

    def test_collaborator_can_read_but_not_modify(self):
        """Test that collaborator with READ permission cannot update or delete."""
        # Can READ (inherited from docs/corpus)
        self.assertTrue(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.collaborator,
                self.relationship,
                "READ",
            )
        )
        # Cannot UPDATE (inherited permission is READ only)
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.collaborator,
                self.relationship,
                "UPDATE",
            )
        )
        # Cannot DELETE (inherited permission is READ only)
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.collaborator,
                self.relationship,
                "DELETE",
            )
        )

    def test_outsider_has_no_permissions(self):
        """Test that outsider has no permissions on relationship."""
        # Outsider has no permissions on source/target docs or corpus
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.outsider,
                self.relationship,
                "READ",
            )
        )
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.outsider,
                self.relationship,
                "UPDATE",
            )
        )
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.outsider,
                self.relationship,
                "DELETE",
            )
        )


class DocumentRelationshipVisibilityTestCase(TestCase):
    """Test that DocumentRelationship visibility queries work correctly."""

    def setUp(self):
        """Set up test data."""
        self.owner = User.objects.create_user(username="owner", password="test")
        self.other_user = User.objects.create_user(username="other", password="test")

        # Create test corpus
        self.corpus = Corpus.objects.create(
            title="TestCorpus",
            creator=self.owner,
            is_public=False,
        )

        # Create documents
        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        self.source_doc = Document.objects.create(
            creator=self.owner,
            title="Source Doc",
            pdf_file=pdf_file,
            backend_lock=True,
            is_public=False,
        )

        self.target_doc = Document.objects.create(
            creator=self.owner,
            title="Target Doc",
            pdf_file=pdf_file,
            backend_lock=True,
            is_public=False,
        )

        # Add documents to corpus via DocumentPath (required for DocumentRelationship)
        DocumentPath.objects.create(
            document=self.source_doc,
            corpus=self.corpus,
            creator=self.owner,
            path="/source_doc",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )
        DocumentPath.objects.create(
            document=self.target_doc,
            corpus=self.corpus,
            creator=self.owner,
            path="/target_doc",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

        # Create private relationship
        self.private_relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"note": "Private note"},
            creator=self.owner,
            corpus=self.corpus,
            is_public=False,
        )

        # Create public relationship
        self.public_relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"note": "Public note"},
            creator=self.owner,
            corpus=self.corpus,
            is_public=True,
        )

        # Set permissions on documents and corpus (inherited by relationships)
        set_permissions_for_obj_to_user(
            self.owner, self.source_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.target_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

    def test_owner_sees_all_own_relationships(self):
        """Test that owner can see both private and public relationships."""
        visible = DocumentRelationship.objects.visible_to_user(self.owner)
        self.assertEqual(visible.count(), 2)
        self.assertIn(self.private_relationship, visible)
        self.assertIn(self.public_relationship, visible)

    def test_other_user_sees_only_public_relationships(self):
        """Test that other user can only see public relationships."""
        visible = DocumentRelationship.objects.visible_to_user(self.other_user)
        self.assertEqual(visible.count(), 1)
        self.assertNotIn(self.private_relationship, visible)
        self.assertIn(self.public_relationship, visible)

    def test_shared_relationship_visible_to_collaborator(self):
        """Test that collaborator can check permissions via the optimizer.

        NOTE: The base visible_to_user() falls back to creator/public check when
        no permission table exists for DocumentRelationship. For full inherited
        permission support in visible_to_user(), a custom manager implementation
        would be needed. This test verifies the current behavior where only public
        relationships are visible via visible_to_user(), but individual permission
        checks via DocumentRelationshipQueryOptimizer work correctly.
        """
        # Share with other_user via documents and corpus (inherited permission model)
        set_permissions_for_obj_to_user(
            self.other_user, self.source_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.other_user, self.target_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.other_user, self.corpus, [PermissionTypes.READ]
        )

        # visible_to_user() uses creator/public fallback, so only public is visible
        visible = DocumentRelationship.objects.visible_to_user(self.other_user)
        self.assertEqual(visible.count(), 1)
        self.assertIn(self.public_relationship, visible)

        # However, individual permission check via QueryOptimizer uses inherited model
        self.assertTrue(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.other_user,
                self.private_relationship,
                "READ",
            )
        )


class DocumentRelationshipPermissionEscalationTestCase(TestCase):
    """Test that permission escalation is prevented."""

    def setUp(self):
        """Set up test data."""
        self.owner = User.objects.create_user(username="owner", password="test")
        self.attacker = User.objects.create_user(username="attacker", password="test")

        # Create test corpus
        self.corpus = Corpus.objects.create(
            title="TestCorpus",
            creator=self.owner,
            is_public=True,  # Public so attacker can see it
        )

        # Create documents - attacker can see but not modify
        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        self.source_doc = Document.objects.create(
            creator=self.owner,
            title="Source Doc",
            pdf_file=pdf_file,
            backend_lock=True,
            is_public=True,  # Public so attacker can see it
        )

        self.target_doc = Document.objects.create(
            creator=self.owner,
            title="Target Doc",
            pdf_file=pdf_file,
            backend_lock=True,
            is_public=True,  # Public so attacker can see it
        )

        # Add documents to corpus via DocumentPath (required for DocumentRelationship)
        DocumentPath.objects.create(
            document=self.source_doc,
            corpus=self.corpus,
            creator=self.owner,
            path="/source_doc",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )
        DocumentPath.objects.create(
            document=self.target_doc,
            corpus=self.corpus,
            creator=self.owner,
            path="/target_doc",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

        # Create relationship owned by owner
        self.relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"sensitive": "data"},
            creator=self.owner,
            corpus=self.corpus,
            is_public=False,  # Private relationship
        )

        # Owner gets full permissions on documents and corpus (inherited by relationship)
        set_permissions_for_obj_to_user(
            self.owner, self.source_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.target_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        # Attacker only gets READ on documents (they're public), no corpus permission
        # Since attacker lacks corpus permission, they cannot modify the relationship
        set_permissions_for_obj_to_user(
            self.attacker, self.source_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.attacker, self.target_doc, [PermissionTypes.READ]
        )

    def test_attacker_cannot_see_private_relationship(self):
        """Test that attacker cannot see private relationship (not creator, not public)."""
        visible = DocumentRelationship.objects.visible_to_user(self.attacker)
        self.assertNotIn(self.relationship, visible)

    def test_attacker_cannot_update_relationship(self):
        """Test that attacker cannot update relationship they don't have permission for."""
        # Attacker has READ on docs but no corpus permission, so inherited UPDATE = False
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.attacker,
                self.relationship,
                "UPDATE",
            )
        )

    def test_attacker_cannot_delete_relationship(self):
        """Test that attacker cannot delete relationship they don't have permission for."""
        # Attacker has READ on docs but no corpus permission, so inherited DELETE = False
        self.assertFalse(
            DocumentRelationshipQueryOptimizer.user_has_permission(
                self.attacker,
                self.relationship,
                "DELETE",
            )
        )
