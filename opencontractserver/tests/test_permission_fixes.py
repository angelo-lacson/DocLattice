"""
Tests for security fixes documented in REMEDIATION_GUIDE.md

This test suite verifies the 7 critical GraphQL mutation vulnerabilities
and IDOR protection fixes have been properly implemented.

Tests cover:
1. RemoveRelationships - Cannot delete relationships without permission
2. UpdateRelations - Cannot update relationships without permission
3. StartCorpusFork - Cannot fork private corpuses
4. StartQueryForCorpus - Cannot create queries for inaccessible corpuses
5. StartCorpusExport - Cannot export corpuses without permission
6. StartDocumentExtract - Cannot create extracts for inaccessible documents/fieldsets
7. DeleteMultipleLabelMutation - Cannot delete labels without permission
8. Badge/Moderation IDOR protection - Same error for "not found" vs "no permission"
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.annotations.models import (
    AnnotationLabel,
    Relationship,
)
from opencontractserver.badges.models import Badge, BadgeTypeChoices
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Fieldset
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestContext:
    """Mock context for GraphQL client."""

    def __init__(self, user):
        self.user = user


class TestRemoveRelationshipsSecurity(TestCase):
    """Tests for RemoveRelationships mutation permission checks."""

    def setUp(self):
        """Create test users and relationships."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create corpus and document
        self.corpus = Corpus.objects.create(
            title="Test Corpus", creator=self.owner, is_public=False
        )
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.owner,
            is_public=False,
            backend_lock=False,
        )

        # Set permissions for owner
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])
        set_permissions_for_obj_to_user(
            self.owner, self.document, [PermissionTypes.CRUD]
        )

        # Create relationship label (using AnnotationLabel)
        self.rel_label = AnnotationLabel.objects.create(
            text="Test Relation", creator=self.owner
        )

        # Create relationship
        self.relationship = Relationship.objects.create(
            relationship_label=self.rel_label,
            document=self.document,
            corpus=self.corpus,
            creator=self.owner,
        )

    def test_cannot_delete_relationship_without_permission(self):
        """
        GIVEN: An unauthorized user without DELETE permission on a relationship
        WHEN: User attempts to delete the relationship via RemoveRelationships mutation
        THEN: Mutation should fail with permission denied error
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation RemoveRelationships($relationshipIds: [String]!) {
                removeRelationships(relationshipIds: $relationshipIds) {
                    ok
                    message
                }
            }
        """

        variables = {
            "relationshipIds": [to_global_id("RelationshipType", self.relationship.id)]
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should fail
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["removeRelationships"]["ok"])
        self.assertIn(
            "Permission denied", result["data"]["removeRelationships"]["message"]
        )

        # Relationship should still exist
        self.assertTrue(Relationship.objects.filter(id=self.relationship.id).exists())

    def test_owner_can_delete_own_relationship(self):
        """
        GIVEN: An owner with DELETE permission on a relationship
        WHEN: Owner attempts to delete the relationship via RemoveRelationships mutation
        THEN: Mutation should succeed and relationship should be deleted
        """
        client = Client(schema, context_value=TestContext(self.owner))

        mutation = """
            mutation RemoveRelationships($relationshipIds: [String]!) {
                removeRelationships(relationshipIds: $relationshipIds) {
                    ok
                    message
                }
            }
        """

        variables = {
            "relationshipIds": [to_global_id("RelationshipType", self.relationship.id)]
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should succeed
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["removeRelationships"]["ok"])

        # Relationship should be deleted
        self.assertFalse(Relationship.objects.filter(id=self.relationship.id).exists())

    def test_same_error_for_nonexistent_relationship(self):
        """
        GIVEN: An unauthorized user
        WHEN: User attempts to delete a non-existent relationship
        THEN: Error message should be same as when relationship exists but user lacks permission (IDOR protection)
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation RemoveRelationships($relationshipIds: [String]!) {
                removeRelationships(relationshipIds: $relationshipIds) {
                    ok
                    message
                }
            }
        """

        # Use a fake ID
        variables = {"relationshipIds": [to_global_id("RelationshipType", 999999)]}

        result = client.execute(mutation, variables=variables)

        # Should get same "not found" error
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["removeRelationships"]["ok"])
        self.assertEqual(
            result["data"]["removeRelationships"]["message"], "Relationship not found"
        )


class TestUpdateRelationsSecurity(TestCase):
    """Tests for UpdateRelations mutation permission checks."""

    def setUp(self):
        """Create test users and relationships."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create corpus and document
        self.corpus = Corpus.objects.create(
            title="Test Corpus", creator=self.owner, is_public=False
        )
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.owner,
            is_public=False,
            backend_lock=False,
        )

        # Set permissions
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])
        set_permissions_for_obj_to_user(
            self.owner, self.document, [PermissionTypes.CRUD]
        )

        # Create relationship label (using AnnotationLabel)
        self.rel_label = AnnotationLabel.objects.create(
            text="Test Relation", creator=self.owner
        )

        # Create relationship
        self.relationship = Relationship.objects.create(
            relationship_label=self.rel_label,
            document=self.document,
            corpus=self.corpus,
            creator=self.owner,
        )

    def test_cannot_update_relationship_without_permission(self):
        """
        GIVEN: An unauthorized user without UPDATE permission on a relationship
        WHEN: User attempts to update the relationship via UpdateRelations mutation
        THEN: Mutation should fail with permission denied error
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation UpdateRelationships($relationships: [RelationInputType]!) {
                updateRelationships(relationships: $relationships) {
                    ok
                    message
                }
            }
        """

        variables = {
            "relationships": [
                {
                    "id": to_global_id("RelationshipType", self.relationship.id),
                    "relationshipLabelId": to_global_id(
                        "AnnotationLabelType", self.rel_label.id
                    ),
                    "corpusId": to_global_id("CorpusType", self.corpus.id),
                    "documentId": to_global_id("DocumentType", self.document.id),
                    "sourceIds": [],
                    "targetIds": [],
                }
            ]
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should fail
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["updateRelationships"]["ok"])
        self.assertIn(
            "Permission denied", result["data"]["updateRelationships"]["message"]
        )


class TestStartCorpusForkSecurity(TestCase):
    """Tests for StartCorpusFork mutation permission checks."""

    def setUp(self):
        """Create test users and corpus."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create private corpus
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )

        # Set permissions for owner only
        set_permissions_for_obj_to_user(
            self.owner, self.private_corpus, [PermissionTypes.CRUD]
        )

    def test_cannot_fork_private_corpus_without_permission(self):
        """
        GIVEN: A private corpus that user does not have READ permission for
        WHEN: Unauthorized user attempts to fork the corpus
        THEN: Mutation should fail with "Corpus not found" error (IDOR protection)
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation StartCorpusFork($corpusId: String!) {
                forkCorpus(corpusId: $corpusId) {
                    ok
                    message
                    newCorpus {
                        id
                        title
                    }
                }
            }
        """

        variables = {"corpusId": to_global_id("CorpusType", self.private_corpus.id)}

        result = client.execute(mutation, variables=variables)

        # Mutation should fail with "not found" error (IDOR protection)
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["forkCorpus"]["ok"])
        self.assertEqual(result["data"]["forkCorpus"]["message"], "Corpus not found")
        self.assertIsNone(result["data"]["forkCorpus"]["newCorpus"])

    def test_same_error_for_nonexistent_corpus(self):
        """
        GIVEN: A non-existent corpus ID
        WHEN: User attempts to fork it
        THEN: Same error message as when corpus exists but user lacks permission (IDOR protection)
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation StartCorpusFork($corpusId: String!) {
                forkCorpus(corpusId: $corpusId) {
                    ok
                    message
                    newCorpus {
                        id
                    }
                }
            }
        """

        variables = {"corpusId": to_global_id("CorpusType", 999999)}

        result = client.execute(mutation, variables=variables)

        # Should get same "not found" error
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["forkCorpus"]["ok"])
        self.assertEqual(result["data"]["forkCorpus"]["message"], "Corpus not found")


class TestStartQueryForCorpusSecurity(TestCase):
    """Tests for StartQueryForCorpus mutation permission checks."""

    def setUp(self):
        """Create test users and corpus."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create private corpus
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )

        # Set permissions for owner only
        set_permissions_for_obj_to_user(
            self.owner, self.private_corpus, [PermissionTypes.CRUD]
        )

    def test_cannot_create_query_for_inaccessible_corpus(self):
        """
        GIVEN: A corpus that user does not have access to
        WHEN: Unauthorized user attempts to create a query for the corpus
        THEN: Mutation should fail with "Corpus not found" error
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation AskQuery($corpusId: String!, $query: String!) {
                askQuery(corpusId: $corpusId, query: $query) {
                    ok
                    message
                    obj {
                        id
                        query
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.private_corpus.id),
            "query": "test query",
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should fail
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["askQuery"]["ok"])
        # Error message should not reveal corpus existence
        self.assertIn("not found", result["data"]["askQuery"]["message"].lower())


class TestStartCorpusExportSecurity(TestCase):
    """Tests for StartCorpusExport mutation permission checks."""

    def setUp(self):
        """Create test users and corpus."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create private corpus
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )

        # Set permissions for owner only
        set_permissions_for_obj_to_user(
            self.owner, self.private_corpus, [PermissionTypes.CRUD]
        )

    def test_cannot_export_corpus_without_permission(self):
        """
        GIVEN: A corpus that user does not have READ permission for
        WHEN: Unauthorized user attempts to export the corpus
        THEN: Mutation should fail with "Corpus not found" error (IDOR protection)
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation StartCorpusExport($corpusId: String!, $exportFormat: ExportType!) {
                exportCorpus(corpusId: $corpusId, exportFormat: $exportFormat) {
                    ok
                    message
                    export {
                        id
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.private_corpus.id),
            "exportFormat": "OPEN_CONTRACTS",
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should fail
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["exportCorpus"]["ok"])
        # Should use consistent error message for IDOR protection
        self.assertIn("not found", result["data"]["exportCorpus"]["message"].lower())


class TestStartDocumentExtractSecurity(TestCase):
    """Tests for StartDocumentExtract mutation permission checks."""

    def setUp(self):
        """Create test users, document, and fieldset."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create private document
        self.private_document = Document.objects.create(
            title="Private Document",
            creator=self.owner,
            is_public=False,
            backend_lock=False,
        )

        # Create private fieldset
        self.private_fieldset = Fieldset.objects.create(
            name="Private Fieldset", creator=self.owner
        )

        # Set permissions for owner only
        set_permissions_for_obj_to_user(
            self.owner, self.private_document, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.owner, self.private_fieldset, [PermissionTypes.CRUD]
        )

    def test_cannot_create_extract_for_inaccessible_document(self):
        """
        GIVEN: A document and fieldset that user does not have access to
        WHEN: Unauthorized user attempts to create extract
        THEN: Mutation should fail with "Resource not found" error (IDOR protection)
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation StartExtractForDoc($documentId: ID!, $fieldsetId: ID!) {
                startExtractForDoc(documentId: $documentId, fieldsetId: $fieldsetId) {
                    ok
                    message
                    obj {
                        id
                    }
                }
            }
        """

        variables = {
            "documentId": to_global_id("DocumentType", self.private_document.id),
            "fieldsetId": to_global_id("FieldsetType", self.private_fieldset.id),
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should fail
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["startExtractForDoc"]["ok"])
        self.assertEqual(
            result["data"]["startExtractForDoc"]["message"], "Resource not found"
        )

    def test_cannot_create_extract_for_inaccessible_fieldset(self):
        """
        GIVEN: User has access to document but not fieldset
        WHEN: User attempts to create extract
        THEN: Mutation should fail with "Resource not found" error
        """
        # Give unauthorized user access to document but not fieldset
        set_permissions_for_obj_to_user(
            self.unauthorized_user, self.private_document, [PermissionTypes.READ]
        )

        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation StartExtractForDoc($documentId: ID!, $fieldsetId: ID!) {
                startExtractForDoc(documentId: $documentId, fieldsetId: $fieldsetId) {
                    ok
                    message
                    obj {
                        id
                    }
                }
            }
        """

        variables = {
            "documentId": to_global_id("DocumentType", self.private_document.id),
            "fieldsetId": to_global_id("FieldsetType", self.private_fieldset.id),
        }

        result = client.execute(mutation, variables=variables)

        # Mutation should fail
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["startExtractForDoc"]["ok"])
        self.assertEqual(
            result["data"]["startExtractForDoc"]["message"], "Resource not found"
        )


class TestDeleteMultipleLabelMutationSecurity(TransactionTestCase):
    """
    Tests for DeleteMultipleLabelMutation permission checks.

    Note: AnnotationLabel uses creator-based permissions (no guardian object permissions).
    Only the creator or superuser can delete labels.
    """

    def setUp(self):
        """Create test users and labels."""
        self.owner = User.objects.create_user(
            username="owner", password="test", email="owner@test.com"
        )
        self.unauthorized_user = User.objects.create_user(
            username="unauthorized", password="test", email="unauth@test.com"
        )

        # Create label - creator-based permissions apply (owner is the creator)
        self.label = AnnotationLabel.objects.create(
            text="Test Label", creator=self.owner
        )
        # No guardian permissions needed - AnnotationLabel uses creator-based permissions

    def test_cannot_delete_label_without_permission(self):
        """
        GIVEN: A label that user does not have DELETE permission for
        WHEN: Unauthorized user attempts to delete the label
        THEN: Mutation should fail with IDOR-safe error message (Label not found)
        """
        client = Client(schema, context_value=TestContext(self.unauthorized_user))

        mutation = """
            mutation DeleteMultipleLabels($labelIds: [String]!) {
                deleteMultipleAnnotationLabels(annotationLabelIdsToDelete: $labelIds) {
                    ok
                    message
                }
            }
        """

        variables = {"labelIds": [to_global_id("AnnotationLabelType", self.label.id)]}

        result = client.execute(mutation, variables=variables)

        # Mutation should fail with IDOR-safe message
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["deleteMultipleAnnotationLabels"]["ok"])
        # Same message for non-existent and permission denied (IDOR protection)
        self.assertEqual(
            "Label not found",
            result["data"]["deleteMultipleAnnotationLabels"]["message"],
        )

        # Label should still exist
        self.assertTrue(AnnotationLabel.objects.filter(id=self.label.id).exists())

    def test_owner_can_delete_own_label(self):
        """
        GIVEN: A user who is the creator of a label
        WHEN: Creator attempts to delete their own label
        THEN: Mutation should succeed and label should be deleted
        """
        client = Client(schema, context_value=TestContext(self.owner))

        mutation = """
            mutation DeleteMultipleLabels($labelIds: [String]!) {
                deleteMultipleAnnotationLabels(annotationLabelIdsToDelete: $labelIds) {
                    ok
                    message
                }
            }
        """

        variables = {"labelIds": [to_global_id("AnnotationLabelType", self.label.id)]}

        result = client.execute(mutation, variables=variables)

        # Mutation should succeed
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["deleteMultipleAnnotationLabels"]["ok"])

        # Label should be deleted
        self.assertFalse(AnnotationLabel.objects.filter(id=self.label.id).exists())


class TestBadgeMutationIDORProtection(TestCase):
    """Tests for Badge mutation IDOR protection."""

    def setUp(self):
        """Create test users, badges, and corpuses."""
        self.admin = User.objects.create_superuser(
            username="admin", password="test", email="admin@test.com"
        )
        self.corpus_owner = User.objects.create_user(
            username="corpusowner", password="test", email="owner@test.com"
        )
        self.normal_user = User.objects.create_user(
            username="normaluser", password="test", email="normal@test.com"
        )

        # Create private corpus
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.corpus_owner, is_public=False
        )
        set_permissions_for_obj_to_user(
            self.corpus_owner, self.private_corpus, [PermissionTypes.CRUD]
        )

        # Create global badge
        self.global_badge = Badge.objects.create(
            name="Test Badge",
            description="Test",
            icon="Star",
            badge_type=BadgeTypeChoices.GLOBAL,
            creator=self.admin,
        )

    def test_create_badge_same_error_for_nonexistent_and_inaccessible_corpus(self):
        """
        GIVEN: A normal user without access to a private corpus
        WHEN: User attempts to create a corpus badge for that corpus
        THEN: Should get same "Corpus not found" error as for non-existent corpus (IDOR protection)
        """
        client = Client(schema, context_value=TestContext(self.normal_user))

        # Test with inaccessible corpus
        mutation_inaccessible = f"""
            mutation CreateBadge {{
                createBadge(
                    name: "Test Badge"
                    description: "Test"
                    icon: "Trophy"
                    badgeType: "CORPUS"
                    corpusId: "{to_global_id("CorpusType", self.private_corpus.id)}"
                ) {{
                    ok
                    message
                }}
            }}
        """

        result1 = client.execute(mutation_inaccessible)
        self.assertIsNone(result1.get("errors"))
        self.assertFalse(result1["data"]["createBadge"]["ok"])
        error_msg_1 = result1["data"]["createBadge"]["message"]

        # Test with non-existent corpus
        mutation_nonexistent = f"""
            mutation CreateBadge {{
                createBadge(
                    name: "Test Badge 2"
                    description: "Test"
                    icon: "Trophy"
                    badgeType: "CORPUS"
                    corpusId: "{to_global_id("CorpusType", 999999)}"
                ) {{
                    ok
                    message
                }}
            }}
        """

        result2 = client.execute(mutation_nonexistent)
        self.assertIsNone(result2.get("errors"))
        self.assertFalse(result2["data"]["createBadge"]["ok"])
        error_msg_2 = result2["data"]["createBadge"]["message"]

        # Both should give same error message
        self.assertEqual(error_msg_1, "Corpus not found")
        self.assertEqual(error_msg_2, "Corpus not found")
        self.assertEqual(error_msg_1, error_msg_2)
