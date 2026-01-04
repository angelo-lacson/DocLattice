"""
Test DocumentRelationship permission model.

NOTE: DocumentRelationship objects have their OWN permissions via django-guardian.
This is different from annotation Relationships which inherit permissions from
document/corpus. DocumentRelationship follows the pattern of other top-level
objects with direct permission control.

The mutations check:
1. CREATE: User needs CREATE permission on source AND target documents
2. UPDATE: User needs UPDATE permission on the DocumentRelationship itself
3. DELETE: User needs DELETE permission on the DocumentRelationship itself
"""

import logging

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from opencontractserver.annotations.models import AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document, DocumentRelationship
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import (
    set_permissions_for_obj_to_user,
    user_has_permission_for_obj,
)

User = get_user_model()
logger = logging.getLogger(__name__)


class DocumentRelationshipPermissionTestCase(TestCase):
    """Test that DocumentRelationship permissions work correctly."""

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

        # Create document relationship
        self.relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="RELATIONSHIP",
            annotation_label=self.annotation_label,
            creator=self.owner,
            corpus=self.corpus,
        )

        # Set up permissions
        # Owner gets full access to everything
        set_permissions_for_obj_to_user(
            self.owner, self.source_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.target_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])
        set_permissions_for_obj_to_user(
            self.owner, self.relationship, [PermissionTypes.CRUD]
        )

        # Collaborator gets READ on relationship only
        set_permissions_for_obj_to_user(
            self.collaborator, self.relationship, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.collaborator, self.source_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.collaborator, self.target_doc, [PermissionTypes.READ]
        )

        # Outsider gets nothing

    def test_owner_has_all_permissions(self):
        """Test that owner has full CRUD permissions on relationship."""
        self.assertTrue(
            user_has_permission_for_obj(
                self.owner,
                self.relationship,
                PermissionTypes.READ,
                include_group_permissions=True,
            )
        )
        self.assertTrue(
            user_has_permission_for_obj(
                self.owner,
                self.relationship,
                PermissionTypes.UPDATE,
                include_group_permissions=True,
            )
        )
        self.assertTrue(
            user_has_permission_for_obj(
                self.owner,
                self.relationship,
                PermissionTypes.DELETE,
                include_group_permissions=True,
            )
        )

    def test_collaborator_can_read_but_not_modify(self):
        """Test that collaborator with READ permission cannot update or delete."""
        # Can READ
        self.assertTrue(
            user_has_permission_for_obj(
                self.collaborator,
                self.relationship,
                PermissionTypes.READ,
                include_group_permissions=True,
            )
        )
        # Cannot UPDATE
        self.assertFalse(
            user_has_permission_for_obj(
                self.collaborator,
                self.relationship,
                PermissionTypes.UPDATE,
                include_group_permissions=True,
            )
        )
        # Cannot DELETE
        self.assertFalse(
            user_has_permission_for_obj(
                self.collaborator,
                self.relationship,
                PermissionTypes.DELETE,
                include_group_permissions=True,
            )
        )

    def test_outsider_has_no_permissions(self):
        """Test that outsider has no permissions on relationship."""
        self.assertFalse(
            user_has_permission_for_obj(
                self.outsider,
                self.relationship,
                PermissionTypes.READ,
                include_group_permissions=True,
            )
        )
        self.assertFalse(
            user_has_permission_for_obj(
                self.outsider,
                self.relationship,
                PermissionTypes.UPDATE,
                include_group_permissions=True,
            )
        )
        self.assertFalse(
            user_has_permission_for_obj(
                self.outsider,
                self.relationship,
                PermissionTypes.DELETE,
                include_group_permissions=True,
            )
        )


class DocumentRelationshipVisibilityTestCase(TestCase):
    """Test that DocumentRelationship visibility queries work correctly."""

    def setUp(self):
        """Set up test data."""
        self.owner = User.objects.create_user(username="owner", password="test")
        self.other_user = User.objects.create_user(username="other", password="test")

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

        # Create private relationship
        self.private_relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"note": "Private note"},
            creator=self.owner,
            is_public=False,
        )

        # Create public relationship
        self.public_relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"note": "Public note"},
            creator=self.owner,
            is_public=True,
        )

        # Set permissions - owner gets CRUD on private relationship
        set_permissions_for_obj_to_user(
            self.owner, self.private_relationship, [PermissionTypes.CRUD]
        )

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
        """Test that explicitly shared relationships are visible."""
        # Share private relationship with other_user
        set_permissions_for_obj_to_user(
            self.other_user, self.private_relationship, [PermissionTypes.READ]
        )

        visible = DocumentRelationship.objects.visible_to_user(self.other_user)
        self.assertEqual(visible.count(), 2)
        self.assertIn(self.private_relationship, visible)
        self.assertIn(self.public_relationship, visible)


class DocumentRelationshipPermissionEscalationTestCase(TestCase):
    """Test that permission escalation is prevented."""

    def setUp(self):
        """Set up test data."""
        self.owner = User.objects.create_user(username="owner", password="test")
        self.attacker = User.objects.create_user(username="attacker", password="test")

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

        # Create relationship owned by owner
        self.relationship = DocumentRelationship.objects.create(
            source_document=self.source_doc,
            target_document=self.target_doc,
            relationship_type="NOTES",
            data={"sensitive": "data"},
            creator=self.owner,
            is_public=False,  # Private relationship
        )

        # Owner gets full permissions
        set_permissions_for_obj_to_user(
            self.owner, self.relationship, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.source_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.target_doc, [PermissionTypes.CRUD]
        )

        # Attacker only gets READ on documents (they're public), nothing on relationship
        set_permissions_for_obj_to_user(
            self.attacker, self.source_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.attacker, self.target_doc, [PermissionTypes.READ]
        )

    def test_attacker_cannot_see_private_relationship(self):
        """Test that attacker cannot see private relationship."""
        visible = DocumentRelationship.objects.visible_to_user(self.attacker)
        self.assertNotIn(self.relationship, visible)

    def test_attacker_cannot_update_relationship(self):
        """Test that attacker cannot update relationship they don't have permission for."""
        self.assertFalse(
            user_has_permission_for_obj(
                self.attacker,
                self.relationship,
                PermissionTypes.UPDATE,
                include_group_permissions=True,
            )
        )

    def test_attacker_cannot_delete_relationship(self):
        """Test that attacker cannot delete relationship they don't have permission for."""
        self.assertFalse(
            user_has_permission_for_obj(
                self.attacker,
                self.relationship,
                PermissionTypes.DELETE,
                include_group_permissions=True,
            )
        )
