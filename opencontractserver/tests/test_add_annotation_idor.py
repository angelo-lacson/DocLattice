"""
Regression tests for the AddAnnotation / AddDocTypeAnnotation IDOR.

Before the fix, both mutations only enforced @login_required and wrote
attacker-supplied corpus_id and document_id to a new Annotation row without
any visibility or permission check. An attacker could plant annotations on
a victim's documents (cross-account write/tamper IDOR).

These tests pin the fix: an authenticated user without visibility or CREATE
permission on the parent corpus must receive a uniform error and no row may
be written.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.annotations.models import (
    TOKEN_LABEL,
    Annotation,
    AnnotationLabel,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


ADD_ANNOTATION_MUTATION = """
    mutation AddAnnotation(
        $corpusId: String!
        $documentId: String!
        $annotationLabelId: String!
        $page: Int!
        $rawText: String!
        $json: GenericScalar!
        $annotationType: LabelType!
    ) {
        addAnnotation(
            corpusId: $corpusId
            documentId: $documentId
            annotationLabelId: $annotationLabelId
            page: $page
            rawText: $rawText
            json: $json
            annotationType: $annotationType
        ) {
            ok
            message
            annotation {
                id
            }
        }
    }
"""


ADD_DOC_TYPE_ANNOTATION_MUTATION = """
    mutation AddDocTypeAnnotation(
        $corpusId: String!
        $documentId: String!
        $annotationLabelId: String!
    ) {
        addDocTypeAnnotation(
            corpusId: $corpusId
            documentId: $documentId
            annotationLabelId: $annotationLabelId
        ) {
            ok
            message
            annotation {
                id
            }
        }
    }
"""


class _MutationContext:
    """Minimal info.context stand-in for graphene.test.Client."""

    def __init__(self, user):
        self.user = user


class AddAnnotationIDORTests(TestCase):
    def setUp(self):
        self.victim = User.objects.create_user(username="victim", password="x")
        self.attacker = User.objects.create_user(username="attacker", password="x")

        self.victim_doc = Document.objects.create(
            title="Victim Doc",
            creator=self.victim,
            is_public=False,
            backend_lock=False,
        )
        self.victim_corpus = Corpus.objects.create(
            title="Victim Corpus", creator=self.victim, is_public=False
        )
        self.victim_corpus.add_document(document=self.victim_doc, user=self.victim)

        # Owner permissions on victim's resources
        set_permissions_for_obj_to_user(
            self.victim, self.victim_doc, [PermissionTypes.CRUD]
        )
        set_permissions_for_obj_to_user(
            self.victim, self.victim_corpus, [PermissionTypes.CRUD]
        )

        self.label = AnnotationLabel.objects.create(
            text="Attacker Label",
            label_type=TOKEN_LABEL,
            creator=self.attacker,
        )

        self.client = Client(schema)

    def _add_annotation(self, user):
        return self.client.execute(
            ADD_ANNOTATION_MUTATION,
            variables={
                "corpusId": to_global_id("CorpusType", self.victim_corpus.pk),
                "documentId": to_global_id("DocumentType", self.victim_doc.pk),
                "annotationLabelId": to_global_id("AnnotationLabelType", self.label.pk),
                "page": 0,
                "rawText": "attacker payload",
                # TOKEN_LABEL annotations require MultipageAnnotationJson (dict).
                "json": {
                    "0": {
                        "bounds": {},
                        "rawText": "attacker payload",
                        "tokensJsons": [],
                    }
                },
                "annotationType": "TOKEN_LABEL",
            },
            context_value=_MutationContext(user),
        )

    def _add_doc_type_annotation(self, user):
        return self.client.execute(
            ADD_DOC_TYPE_ANNOTATION_MUTATION,
            variables={
                "corpusId": to_global_id("CorpusType", self.victim_corpus.pk),
                "documentId": to_global_id("DocumentType", self.victim_doc.pk),
                "annotationLabelId": to_global_id("AnnotationLabelType", self.label.pk),
            },
            context_value=_MutationContext(self.attacker),
        )

    def test_attacker_cannot_add_annotation_to_victim_document(self):
        """Attacker without visibility on the victim's corpus/doc gets uniform error."""
        before = Annotation.objects.filter(document=self.victim_doc).count()
        result = self._add_annotation(self.attacker)
        self.assertNotIn("errors", result, msg=result.get("errors"))
        payload = result["data"]["addAnnotation"]
        self.assertFalse(payload["ok"])
        self.assertIsNone(payload["annotation"])
        self.assertIn("permission", payload["message"].lower())
        # No annotation written.
        self.assertEqual(
            Annotation.objects.filter(document=self.victim_doc).count(), before
        )

    def test_attacker_cannot_add_doc_type_annotation_to_victim_document(self):
        """Same IDOR coverage for AddDocTypeAnnotation."""
        before = Annotation.objects.filter(document=self.victim_doc).count()
        result = self._add_doc_type_annotation(self.attacker)
        self.assertNotIn("errors", result, msg=result.get("errors"))
        payload = result["data"]["addDocTypeAnnotation"]
        self.assertFalse(payload["ok"])
        self.assertIsNone(payload["annotation"])
        self.assertEqual(
            Annotation.objects.filter(document=self.victim_doc).count(), before
        )

    def test_owner_can_add_annotation(self):
        """Sanity: the owner with CRUD on corpus/doc still succeeds."""
        result = self._add_annotation(self.victim)
        self.assertNotIn("errors", result, msg=result.get("errors"))
        payload = result["data"]["addAnnotation"]
        self.assertTrue(payload["ok"], msg=payload.get("message"))
        self.assertIsNotNone(payload["annotation"])

    def test_read_only_collaborator_cannot_add_annotation(self):
        """READ-only access on the parents must not unlock CREATE on the child."""
        set_permissions_for_obj_to_user(
            self.attacker, self.victim_doc, [PermissionTypes.READ]
        )
        set_permissions_for_obj_to_user(
            self.attacker, self.victim_corpus, [PermissionTypes.READ]
        )
        before = Annotation.objects.filter(document=self.victim_doc).count()
        result = self._add_annotation(self.attacker)
        payload = result["data"]["addAnnotation"]
        self.assertFalse(payload["ok"])
        self.assertEqual(
            Annotation.objects.filter(document=self.victim_doc).count(), before
        )
