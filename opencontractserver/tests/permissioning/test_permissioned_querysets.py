from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ComprehensivePermissionTestCase(TestCase):
    def setUp(self):
        # Create users
        self.owner = User.objects.create_user(username="owner", password="password")
        self.collaborator = User.objects.create_user(
            username="collaborator", password="password"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="password"
        )
        self.anonymous_user = None

        # Create GraphQL clients
        self.owner_client = Client(schema, context_value=TestContext(self.owner))
        self.collaborator_client = Client(
            schema, context_value=TestContext(self.collaborator)
        )
        self.regular_client = Client(
            schema, context_value=TestContext(self.regular_user)
        )
        self.anonymous_client = Client(
            schema, context_value=TestContext(AnonymousUser())
        )

        # Create Corpuses
        self.public_corpus = Corpus.objects.create(
            title="Public Corpus", creator=self.owner, is_public=True
        )
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )
        self.shared_corpus = Corpus.objects.create(
            title="Shared Corpus", creator=self.owner, is_public=False
        )

        # Set permissions for shared corpus
        set_permissions_for_obj_to_user(
            self.collaborator, self.shared_corpus, [PermissionTypes.READ]
        )

        # Create Documents
        self.public_doc = Document.objects.create(
            title="Public Doc", creator=self.owner, is_public=True
        )
        self.private_doc = Document.objects.create(
            title="Private Doc", creator=self.owner, is_public=False
        )
        # Store the versioned documents returned by add_document()
        self.public_doc, _, _ = self.public_corpus.add_document(
            document=self.public_doc, user=self.owner
        )
        self.private_doc, _, _ = self.public_corpus.add_document(
            document=self.private_doc, user=self.owner
        )

        # Create Annotations
        # Mark as structural since they're in a corpus (per new permission model)
        # Include corpus field for proper permission inheritance
        self.public_annotation = Annotation.objects.create(
            document=self.public_doc,
            corpus=self.public_corpus,
            creator=self.owner,
            is_public=True,
            structural=True,
        )
        self.private_annotation = Annotation.objects.create(
            document=self.public_doc,
            corpus=self.public_corpus,
            creator=self.owner,
            is_public=False,
            structural=True,
        )

    def test_corpus_visibility(self):
        query = """
        query {
          corpuses {
            edges {
              node {
                id
                title
                isPublic
              }
            }
          }
        }
        """

        # Test for owner: 3 test corpuses + 1 personal corpus = 4
        result = self.owner_client.execute(query)
        self.assertEqual(len(result["data"]["corpuses"]["edges"]), 4)

        # Collaborator: public corpus + shared corpus + 1 personal corpus = 3
        result = self.collaborator_client.execute(query)
        self.assertEqual(len(result["data"]["corpuses"]["edges"]), 3)

        # Regular user: public corpus + 1 personal corpus = 2
        result = self.regular_client.execute(query)
        self.assertEqual(len(result["data"]["corpuses"]["edges"]), 2)

        # Anonymous user: only the public corpus (no personal corpus)
        result = self.anonymous_client.execute(query)
        self.assertEqual(len(result["data"]["corpuses"]["edges"]), 1)

    def test_nested_document_visibility(self):
        query = """
        query($id: ID!) {
          corpus(id: $id) {
            documents {
              edges {
                node {
                  id
                  title
                  isPublic
                }
              }
            }
          }
        }
        """
        variables = {"id": to_global_id("CorpusType", self.public_corpus.id)}

        # Test for owner
        result = self.owner_client.execute(query, variable_values=variables)
        self.assertEqual(len(result["data"]["corpus"]["documents"]["edges"]), 2)

        # Test for regular user — all docs in a public corpus inherit
        # is_public=True, so the regular user sees both documents.
        result = self.regular_client.execute(query, variable_values=variables)
        self.assertEqual(len(result["data"]["corpus"]["documents"]["edges"]), 2)

    def test_nested_annotation_visibility(self):
        query = """
        query($id: ID!) {
          document(id: $id) {
            docAnnotations {
              edges {
                node {
                  id
                  isPublic
                }
              }
            }
          }
        }
        """
        variables = {"id": to_global_id("DocumentType", self.public_doc.id)}

        # Test for owner
        result = self.owner_client.execute(query, variable_values=variables)
        self.assertEqual(len(result["data"]["document"]["docAnnotations"]["edges"]), 2)

        # Test for regular user
        # With new permission model, structural annotations are visible to anyone who can read the document
        result = self.regular_client.execute(query, variable_values=variables)
        self.assertEqual(len(result["data"]["document"]["docAnnotations"]["edges"]), 2)

    def test_mutation_permissions(self):
        mutation = """
        mutation($id: String!) {
          deleteCorpus(id: $id) {
            ok
            message
          }
        }
        """
        corpus_to_delete = Corpus.objects.create(
            title="Corpus to Delete", creator=self.owner, is_public=True
        )

        # Deletions ARE tied to per instance permissions.
        set_permissions_for_obj_to_user(
            self.owner.id, corpus_to_delete, [PermissionTypes.CRUD]
        )
        variables = {"id": to_global_id("CorpusType", corpus_to_delete.id)}

        # Test for regular user (should fail)
        result = self.regular_client.execute(mutation, variable_values=variables)
        self.assertIsNone(result["data"]["deleteCorpus"])
        self.assertIn("errors", result)

        # Verify corpus still exists in database
        self.assertTrue(Corpus.objects.filter(id=corpus_to_delete.id).exists())

        # Test for owner (should succeed)
        result = self.owner_client.execute(mutation, variable_values=variables)

        # Verify corpus is actually deleted from database
        self.assertFalse(Corpus.objects.filter(id=corpus_to_delete.id).exists())

    def test_mutation_permissions_on_private_object(self):
        mutation = """
        mutation($id: String!) {
          deleteCorpus(id: $id) {
            ok
            message
          }
        }
        """
        private_corpus = Corpus.objects.create(
            title="Private Corpus to Delete", creator=self.owner, is_public=False
        )
        # Deletions ARE tied to per instance permissions.
        set_permissions_for_obj_to_user(
            self.owner.id, private_corpus, [PermissionTypes.CRUD]
        )
        variables = {"id": to_global_id("CorpusType", private_corpus.id)}

        # Test for collaborator (should fail)
        result = self.collaborator_client.execute(mutation, variable_values=variables)
        self.assertIsNone(result["data"]["deleteCorpus"])
        self.assertIn("errors", result)

        # Verify corpus still exists in database
        self.assertTrue(Corpus.objects.filter(id=private_corpus.id).exists())

        # Test for owner (should succeed)
        result = self.owner_client.execute(mutation, variable_values=variables)
        self.assertTrue(result["data"]["deleteCorpus"]["ok"])

        # Verify corpus is actually deleted from database
        self.assertFalse(Corpus.objects.filter(id=private_corpus.id).exists())

    def test_permission_change_effect(self):
        query = """
        query($id: ID!) {
          corpus(id: $id) {
            id
            title
          }
        }
        """
        variables = {"id": to_global_id("CorpusType", self.private_corpus.id)}

        # Before granting permission
        result = self.collaborator_client.execute(query, variable_values=variables)
        self.assertIsNone(result["data"]["corpus"])

        # Grant permission
        set_permissions_for_obj_to_user(
            self.collaborator, self.private_corpus, [PermissionTypes.READ]
        )

        # After granting permission
        result = self.collaborator_client.execute(query, variable_values=variables)
        self.assertIsNotNone(result["data"]["corpus"])
        self.assertEqual(result["data"]["corpus"]["title"], "Private Corpus")

    def test_public_flag_change_effect(self):
        query = """
        query($id: ID!) {
          corpus(id: $id) {
            id
            title
          }
        }
        """
        variables = {"id": to_global_id("CorpusType", self.private_corpus.id)}

        # Before making public
        result = self.regular_client.execute(query, variable_values=variables)
        self.assertIsNone(result["data"]["corpus"])

        # Make corpus public
        self.private_corpus.is_public = True
        self.private_corpus.save()

        # After making public
        result = self.regular_client.execute(query, variable_values=variables)
        self.assertIsNotNone(result["data"]["corpus"])
        self.assertEqual(result["data"]["corpus"]["title"], "Private Corpus")


class PublicCorpusDocumentVisibilityTest(TestCase):
    """Tests for public-corpus → document is_public propagation.

    Documents in public corpora automatically inherit is_public=True,
    preserving the permissioning guide rule: both document AND corpus
    must be is_public=True for anonymous access.  Propagation happens
    at three points:
      1. Corpus.add_document() / import_document() — on creation
      2. Corpus.save() — when is_public changes
    """

    def setUp(self):
        from opencontractserver.constants.document_processing import (
            MARKDOWN_MIME_TYPE,
        )

        self.owner = User.objects.create_user(username="pc_owner", password="password")
        self.viewer = User.objects.create_user(
            username="pc_viewer", password="password"
        )

        # Public corpus — documents added here inherit is_public=True
        self.public_corpus = Corpus.objects.create(
            title="Public Corpus", creator=self.owner, is_public=True
        )

        # Source docs are created with is_public=False, but the corpus
        # copies produced by add_document() inherit from the public corpus.
        source_pdf = Document.objects.create(
            title="PDF Doc", creator=self.owner, is_public=False
        )
        self.pdf_in_public, _, _ = self.public_corpus.add_document(
            document=source_pdf, user=self.owner
        )

        source_caml = Document.objects.create(
            title="Readme.CAML",
            creator=self.owner,
            is_public=False,
            file_type=MARKDOWN_MIME_TYPE,
        )
        self.caml_in_public, _, _ = self.public_corpus.add_document(
            document=source_caml, user=self.owner
        )

        # Private corpus — documents added here stay private
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )
        source_public = Document.objects.create(
            title="Public Doc Private Corpus", creator=self.owner, is_public=True
        )
        self.public_doc_in_private, _, _ = self.private_corpus.add_document(
            document=source_public, user=self.owner
        )

    # -- Propagation on add_document --

    def test_add_document_to_public_corpus_sets_is_public(self):
        """Documents added to a public corpus get is_public=True."""
        self.assertTrue(self.pdf_in_public.is_public)
        self.assertTrue(self.caml_in_public.is_public)

    def test_add_document_to_private_corpus_preserves_source_public(self):
        """Public source doc keeps is_public=True when added to private corpus."""
        self.assertTrue(self.public_doc_in_private.is_public)

    def test_add_document_to_private_corpus_stays_private(self):
        """Private source doc stays is_public=False in private corpus."""
        source = Document.objects.create(
            title="Hidden", creator=self.owner, is_public=False
        )
        copy, _, _ = self.private_corpus.add_document(document=source, user=self.owner)
        self.assertFalse(copy.is_public)

    # -- Anonymous visibility (via standard is_public filter) --

    def test_anonymous_sees_all_docs_in_public_corpus(self):
        """Anonymous user sees all docs in public corpus (both inherited public)."""
        anon = AnonymousUser()
        visible_pks = set(
            Document.objects.visible_to_user(anon, lightweight=True).values_list(
                "pk", flat=True
            )
        )
        self.assertIn(self.pdf_in_public.pk, visible_pks)
        self.assertIn(self.caml_in_public.pk, visible_pks)

    def test_anonymous_sees_public_doc_in_private_corpus(self):
        """A public doc in a private corpus is visible via its own is_public."""
        anon = AnonymousUser()
        visible_pks = set(
            Document.objects.visible_to_user(anon, lightweight=True).values_list(
                "pk", flat=True
            )
        )
        self.assertIn(self.public_doc_in_private.pk, visible_pks)

    def test_anonymous_cannot_see_private_doc_in_private_corpus(self):
        """Private doc in private corpus is hidden from anonymous users."""
        source = Document.objects.create(
            title="Hidden", creator=self.owner, is_public=False
        )
        copy, _, _ = self.private_corpus.add_document(document=source, user=self.owner)

        anon = AnonymousUser()
        visible_pks = set(
            Document.objects.visible_to_user(anon, lightweight=True).values_list(
                "pk", flat=True
            )
        )
        self.assertNotIn(copy.pk, visible_pks)

    # -- Authenticated user without explicit permissions --

    def test_authenticated_sees_all_docs_in_public_corpus(self):
        """Authenticated user without permissions sees public-corpus docs."""
        visible_pks = set(
            Document.objects.visible_to_user(self.viewer, lightweight=True).values_list(
                "pk", flat=True
            )
        )
        self.assertIn(self.pdf_in_public.pk, visible_pks)
        self.assertIn(self.caml_in_public.pk, visible_pks)

    # -- Corpus is_public change propagation --

    def test_corpus_becomes_public_propagates_to_documents(self):
        """When a corpus becomes public, all its documents become public."""
        source = Document.objects.create(
            title="Initially Private", creator=self.owner, is_public=False
        )
        copy, _, _ = self.private_corpus.add_document(document=source, user=self.owner)
        self.assertFalse(copy.is_public)

        self.private_corpus.is_public = True
        self.private_corpus.save()

        copy.refresh_from_db()
        self.assertTrue(copy.is_public)

    def test_corpus_becomes_private_revokes_public(self):
        """When a corpus becomes private, docs not in another public corpus
        lose is_public=True."""
        # caml_in_public is only in self.public_corpus
        self.assertTrue(self.caml_in_public.is_public)

        self.public_corpus.is_public = False
        self.public_corpus.save()

        self.caml_in_public.refresh_from_db()
        self.assertFalse(self.caml_in_public.is_public)

    def test_corpus_becomes_private_preserves_multi_corpus_doc(self):
        """When a corpus becomes private, docs still in another public corpus
        keep is_public=True."""
        # Create a second public corpus and add the same source doc
        other_public = Corpus.objects.create(
            title="Other Public", creator=self.owner, is_public=True
        )
        source = Document.objects.create(
            title="Shared Doc", creator=self.owner, is_public=False
        )
        copy_in_first, _, _ = self.public_corpus.add_document(
            document=source, user=self.owner
        )
        # Add the SAME corpus copy to the other public corpus by creating
        # a DocumentPath pointing to it
        from opencontractserver.documents.models import DocumentPath

        DocumentPath.objects.create(
            document=copy_in_first,
            corpus=other_public,
            path="/docs/shared",
            version_number=1,
            is_current=True,
            is_deleted=False,
            creator=self.owner,
        )

        self.assertTrue(copy_in_first.is_public)

        # Now make the first public corpus private
        self.public_corpus.is_public = False
        self.public_corpus.save()

        copy_in_first.refresh_from_db()
        # Still public because it's in other_public
        self.assertTrue(copy_in_first.is_public)
