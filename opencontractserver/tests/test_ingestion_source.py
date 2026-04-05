"""
Tests for IngestionSource CRUD mutations, query resolvers, UploadDocument
integration, and export/import round-trip.
"""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import (
    Document,
    DocumentPath,
    IngestionSource,
    IngestionSourceCategory,
)
from opencontractserver.tasks.import_tasks_v2 import _import_ingestion_sources
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.export_v2 import package_ingestion_sources
from opencontractserver.utils.files import base_64_encode_bytes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()
pytestmark = pytest.mark.django_db


class TestContext:
    def __init__(self, user):
        self.user = user


class AnonymousContext:
    """Anonymous user context for GraphQL client."""

    class AnonymousUser:
        is_authenticated = False
        is_superuser = False
        id = None

        @property
        def is_anonymous(self):
            return True

    user = AnonymousUser()


# ------------------------------------------------------------------ #
# GraphQL mutation / query strings
# ------------------------------------------------------------------ #

CREATE_MUTATION = """
    mutation CreateIngestionSource(
        $name: String!,
        $sourceType: IngestionSourceTypeEnum,
        $config: GenericScalar
    ) {
        createIngestionSource(
            name: $name,
            sourceType: $sourceType,
            config: $config
        ) {
            ok
            message
            ingestionSource {
                id
                name
                sourceType
                active
            }
        }
    }
"""

UPDATE_MUTATION = """
    mutation UpdateIngestionSource(
        $id: ID!,
        $name: String,
        $sourceType: IngestionSourceTypeEnum,
        $config: GenericScalar,
        $active: Boolean
    ) {
        updateIngestionSource(
            id: $id,
            name: $name,
            sourceType: $sourceType,
            config: $config,
            active: $active
        ) {
            ok
            message
            ingestionSource {
                id
                name
                sourceType
                active
            }
        }
    }
"""

DELETE_MUTATION = """
    mutation DeleteIngestionSource($id: ID!) {
        deleteIngestionSource(id: $id) {
            ok
            message
        }
    }
"""


# ------------------------------------------------------------------ #
# CreateIngestionSourceMutation
# ------------------------------------------------------------------ #


class TestCreateIngestionSourceMutation(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.client = Client(schema, context_value=TestContext(self.user))

    def test_create_happy_path(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variables={"name": "my_crawler", "sourceType": "CRAWLER"},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["createIngestionSource"]
        self.assertTrue(data["ok"])
        self.assertEqual(data["message"], "Success")
        self.assertEqual(data["ingestionSource"]["name"], "my_crawler")
        # graphene-django auto-enum converts choice values to uppercase names
        self.assertEqual(data["ingestionSource"]["sourceType"], "CRAWLER")
        self.assertTrue(data["ingestionSource"]["active"])

        # Verify DB record
        source = IngestionSource.objects.get(name="my_crawler", creator=self.user)
        self.assertEqual(source.source_type, IngestionSourceCategory.CRAWLER)

    def test_create_defaults_to_manual(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variables={"name": "default_source"},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["createIngestionSource"]
        self.assertTrue(data["ok"])

        source = IngestionSource.objects.get(name="default_source", creator=self.user)
        self.assertEqual(source.source_type, IngestionSourceCategory.MANUAL)

    def test_create_duplicate_name(self):
        IngestionSource.objects.create(
            name="dup_name", creator=self.user, source_type="manual"
        )

        result = self.client.execute(
            CREATE_MUTATION,
            variables={"name": "dup_name"},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["createIngestionSource"]
        self.assertFalse(data["ok"])
        self.assertIn("already exists", data["message"])

    def test_create_unauthenticated(self):
        anon_client = Client(schema, context_value=AnonymousContext())
        result = anon_client.execute(
            CREATE_MUTATION,
            variables={"name": "should_fail"},
        )
        # graphql_jwt returns errors for unauthenticated
        self.assertIsNotNone(result.get("errors"))


# ------------------------------------------------------------------ #
# UpdateIngestionSourceMutation
# ------------------------------------------------------------------ #


class TestUpdateIngestionSourceMutation(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.source = IngestionSource.objects.create(
            name="original_name",
            source_type=IngestionSourceCategory.MANUAL,
            creator=self.user,
            config={"key": "value"},
        )
        set_permissions_for_obj_to_user(self.user, self.source, [PermissionTypes.CRUD])
        self.global_id = to_global_id("IngestionSourceType", self.source.pk)
        self.client = Client(schema, context_value=TestContext(self.user))

    def test_update_field_values(self):
        result = self.client.execute(
            UPDATE_MUTATION,
            variables={
                "id": self.global_id,
                "name": "updated_name",
                "sourceType": "API",
            },
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["updateIngestionSource"]
        self.assertTrue(data["ok"])
        self.assertEqual(data["ingestionSource"]["name"], "updated_name")
        self.assertEqual(data["ingestionSource"]["sourceType"], "API")

    def test_update_active_toggle(self):
        result = self.client.execute(
            UPDATE_MUTATION,
            variables={"id": self.global_id, "active": False},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["updateIngestionSource"]
        self.assertTrue(data["ok"])
        self.assertFalse(data["ingestionSource"]["active"])

        self.source.refresh_from_db()
        self.assertFalse(self.source.active)

    def test_update_active_reactivation(self):
        """Deactivate then re-activate a source."""
        # First deactivate
        self.client.execute(
            UPDATE_MUTATION,
            variables={"id": self.global_id, "active": False},
        )
        self.source.refresh_from_db()
        self.assertFalse(self.source.active)

        # Now re-activate
        result = self.client.execute(
            UPDATE_MUTATION,
            variables={"id": self.global_id, "active": True},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["updateIngestionSource"]
        self.assertTrue(data["ok"])
        self.assertTrue(data["ingestionSource"]["active"])

        self.source.refresh_from_db()
        self.assertTrue(self.source.active)

    def test_update_not_found(self):
        bad_id = to_global_id("IngestionSourceType", 999999)
        result = self.client.execute(
            UPDATE_MUTATION,
            variables={"id": bad_id, "name": "x"},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["updateIngestionSource"]
        self.assertFalse(data["ok"])
        self.assertIn("not found", data["message"])

    def test_update_other_users_source(self):
        other_user = User.objects.create_user(username="other", password="otherpass")
        other_source = IngestionSource.objects.create(
            name="other_source", creator=other_user
        )
        other_id = to_global_id("IngestionSourceType", other_source.pk)

        result = self.client.execute(
            UPDATE_MUTATION,
            variables={"id": other_id, "name": "hijack"},
        )
        self.assertIsNone(result.get("errors"))
        data = result["data"]["updateIngestionSource"]
        self.assertFalse(data["ok"])
        self.assertIn("not found", data["message"])


# ------------------------------------------------------------------ #
# DeleteIngestionSourceMutation
# ------------------------------------------------------------------ #


class TestDeleteIngestionSourceMutation(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.client = Client(schema, context_value=TestContext(self.user))

    def test_delete_happy_path(self):
        source = IngestionSource.objects.create(name="to_delete", creator=self.user)
        set_permissions_for_obj_to_user(self.user, source, [PermissionTypes.CRUD])
        global_id = to_global_id("IngestionSourceType", source.pk)

        result = self.client.execute(DELETE_MUTATION, variables={"id": global_id})
        self.assertIsNone(result.get("errors"))
        data = result["data"]["deleteIngestionSource"]
        self.assertTrue(data["ok"])
        self.assertFalse(IngestionSource.objects.filter(pk=source.pk).exists())

    def test_delete_not_found(self):
        bad_id = to_global_id("IngestionSourceType", 999999)
        result = self.client.execute(DELETE_MUTATION, variables={"id": bad_id})
        self.assertIsNone(result.get("errors"))
        data = result["data"]["deleteIngestionSource"]
        self.assertFalse(data["ok"])
        self.assertIn("not found", data["message"])

    def test_delete_sets_null_on_document_path(self):
        """Verify FK SET_NULL: deleting a source nullifies DocumentPath references."""
        source = IngestionSource.objects.create(
            name="source_with_paths", creator=self.user
        )
        set_permissions_for_obj_to_user(self.user, source, [PermissionTypes.CRUD])

        corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        doc = Document.objects.create(
            title="Test Doc", creator=self.user, pdf_file="test.pdf"
        )
        doc_path = DocumentPath.objects.create(
            document=doc,
            corpus=corpus,
            path="/documents/test.pdf",
            version_number=1,
            ingestion_source=source,
            creator=self.user,
        )

        global_id = to_global_id("IngestionSourceType", source.pk)
        result = self.client.execute(DELETE_MUTATION, variables={"id": global_id})
        self.assertTrue(result["data"]["deleteIngestionSource"]["ok"])

        doc_path.refresh_from_db()
        self.assertIsNone(doc_path.ingestion_source)


# ------------------------------------------------------------------ #
# UploadDocument with ingestion_source_id
# ------------------------------------------------------------------ #


class TestUploadDocumentWithIngestionSource(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.client = Client(schema, context_value=TestContext(self.user))
        self.source = IngestionSource.objects.create(
            name="upload_source",
            source_type=IngestionSourceCategory.API,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, self.source, [PermissionTypes.CRUD])

    def _upload_mutation(self):
        return """
            mutation UploadDocument(
                $file: String!,
                $filename: String!,
                $title: String!,
                $description: String!,
                $customMeta: GenericScalar!,
                $makePublic: Boolean!,
                $ingestionSourceId: ID
            ) {
                uploadDocument(
                    base64FileString: $file,
                    filename: $filename,
                    title: $title,
                    description: $description,
                    customMeta: $customMeta,
                    makePublic: $makePublic,
                    ingestionSourceId: $ingestionSourceId
                ) {
                    ok
                    message
                    document { id title }
                }
            }
        """  # noqa

    def test_upload_with_valid_source(self):
        pdf_content = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"
        pdf_base64 = base_64_encode_bytes(pdf_content)
        source_gid = to_global_id("IngestionSourceType", self.source.pk)

        mock_doc = Document(id=1, title="Test PDF", description="desc")
        mock_path = DocumentPath(id=1, path="/documents/test.pdf")

        with patch(
            "opencontractserver.corpuses.models.Corpus.import_content"
        ) as mock_import, patch(
            "config.graphql.document_mutations.set_permissions_for_obj_to_user"
        ):
            mock_import.return_value = (mock_doc, "created", mock_path)
            result = self.client.execute(
                self._upload_mutation(),
                variables={
                    "file": pdf_base64,
                    "filename": "test.pdf",
                    "title": "Test PDF",
                    "description": "desc",
                    "customMeta": {},
                    "makePublic": False,
                    "ingestionSourceId": source_gid,
                },
            )

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["uploadDocument"]["ok"])

    def test_upload_with_other_users_source(self):
        """Source belonging to another user should be rejected."""
        other_user = User.objects.create_user(username="other", password="otherpass")
        other_source = IngestionSource.objects.create(
            name="other_source", creator=other_user
        )
        bad_gid = to_global_id("IngestionSourceType", other_source.pk)

        pdf_content = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"
        pdf_base64 = base_64_encode_bytes(pdf_content)

        result = self.client.execute(
            self._upload_mutation(),
            variables={
                "file": pdf_base64,
                "filename": "test.pdf",
                "title": "Test PDF",
                "description": "desc",
                "customMeta": {},
                "makePublic": False,
                "ingestionSourceId": bad_gid,
            },
        )

        self.assertIsNone(result.get("errors"))
        data = result["data"]["uploadDocument"]
        self.assertFalse(data["ok"])
        self.assertIn("not found", data["message"])


# ------------------------------------------------------------------ #
# Export / import round-trip for ingestion sources
# ------------------------------------------------------------------ #


class TestIngestionSourceExportImport(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(
            title="Export Test Corpus", creator=self.user
        )
        set_permissions_for_obj_to_user(self.user, self.corpus, [PermissionTypes.ALL])

    def test_package_ingestion_sources_strips_config(self):
        """Config must not leak credentials in exports."""
        source = IngestionSource.objects.create(
            name="secret_crawler",
            source_type=IngestionSourceCategory.CRAWLER,
            config={"api_key": "super_secret_123", "endpoint": "https://example.com"},
            creator=self.user,
        )
        doc = Document.objects.create(
            title="Doc", creator=self.user, pdf_file="doc.pdf"
        )
        DocumentPath.objects.create(
            document=doc,
            corpus=self.corpus,
            path="/documents/doc.pdf",
            version_number=1,
            ingestion_source=source,
            creator=self.user,
        )

        exported = package_ingestion_sources(self.corpus)
        self.assertEqual(len(exported), 1)
        self.assertEqual(exported[0]["name"], "secret_crawler")
        self.assertEqual(exported[0]["source_type"], IngestionSourceCategory.CRAWLER)
        # Config must be empty - credentials should NOT leak
        self.assertEqual(exported[0]["config"], {})

    def test_package_returns_empty_for_no_sources(self):
        """Corpus with no ingestion sources should return empty list."""
        exported = package_ingestion_sources(self.corpus)
        self.assertEqual(exported, [])

    def test_round_trip_export_import(self):
        """Export sources -> import on different user -> verify re-creation."""
        source = IngestionSource.objects.create(
            name="roundtrip_source",
            source_type=IngestionSourceCategory.API,
            config={"key": "should_be_stripped"},
            active=True,
            creator=self.user,
        )
        doc = Document.objects.create(
            title="Doc", creator=self.user, pdf_file="doc.pdf"
        )
        DocumentPath.objects.create(
            document=doc,
            corpus=self.corpus,
            path="/documents/doc.pdf",
            version_number=1,
            ingestion_source=source,
            creator=self.user,
        )

        # Export
        exported = package_ingestion_sources(self.corpus)
        self.assertEqual(len(exported), 1)

        # Import as a different user
        importer = User.objects.create_user(username="importer", password="importpass")
        source_map = _import_ingestion_sources(exported, importer)

        self.assertIn("roundtrip_source", source_map)
        imported_source = source_map["roundtrip_source"]
        self.assertEqual(imported_source.creator, importer)
        self.assertEqual(imported_source.source_type, IngestionSourceCategory.API)
        self.assertTrue(imported_source.active)

    def test_import_idempotent(self):
        """Re-importing the same source name reuses existing record."""
        sources_data = [
            {
                "name": "reuse_me",
                "source_type": IngestionSourceCategory.MANUAL,
                "config": {},
                "active": True,
            }
        ]

        first_map = _import_ingestion_sources(sources_data, self.user)
        first_id = first_map["reuse_me"].pk

        second_map = _import_ingestion_sources(sources_data, self.user)
        second_id = second_map["reuse_me"].pk

        self.assertEqual(first_id, second_id)
        self.assertEqual(
            IngestionSource.objects.filter(creator=self.user, name="reuse_me").count(),
            1,
        )


# ------------------------------------------------------------------ #
# resolve_ingestion_source query (single-object resolver)
# ------------------------------------------------------------------ #


SINGLE_SOURCE_QUERY = """
    query GetIngestionSource($id: ID!) {
        ingestionSource(id: $id) {
            id
            name
            sourceType
            active
        }
    }
"""


class TestIngestionSourceQuery(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.client = Client(schema, context_value=TestContext(self.user))
        self.source = IngestionSource.objects.create(
            name="query_source",
            source_type=IngestionSourceCategory.CRAWLER,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, self.source, [PermissionTypes.CRUD])

    def test_resolve_existing_source(self):
        gid = to_global_id("IngestionSourceType", self.source.pk)
        result = self.client.execute(SINGLE_SOURCE_QUERY, variables={"id": gid})
        self.assertIsNone(result.get("errors"))
        data = result["data"]["ingestionSource"]
        self.assertIsNotNone(data)
        self.assertEqual(data["name"], "query_source")
        self.assertEqual(data["sourceType"], "CRAWLER")

    def test_resolve_not_found_returns_none(self):
        """Should return None rather than 500 on missing source."""
        bad_id = to_global_id("IngestionSourceType", 999999)
        result = self.client.execute(SINGLE_SOURCE_QUERY, variables={"id": bad_id})
        # Should not have GraphQL errors (no 500)
        self.assertIsNone(result.get("errors"))
        self.assertIsNone(result["data"]["ingestionSource"])

    def test_resolve_other_users_source_returns_none(self):
        """Source owned by a different user should not be visible."""
        other_user = User.objects.create_user(username="other", password="otherpass")
        other_source = IngestionSource.objects.create(
            name="private_source", creator=other_user
        )
        gid = to_global_id("IngestionSourceType", other_source.pk)
        result = self.client.execute(SINGLE_SOURCE_QUERY, variables={"id": gid})
        self.assertIsNone(result.get("errors"))
        self.assertIsNone(result["data"]["ingestionSource"])


# ------------------------------------------------------------------ #
# ingestionSources list query
# ------------------------------------------------------------------ #

LIST_SOURCES_QUERY = """
    query ListIngestionSources($activeOnly: Boolean) {
        ingestionSources(activeOnly: $activeOnly) {
            id
            name
            sourceType
            active
        }
    }
"""


class TestIngestionSourceListQuery(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.client = Client(schema, context_value=TestContext(self.user))

        self.active_source = IngestionSource.objects.create(
            name="active_crawler",
            source_type=IngestionSourceCategory.CRAWLER,
            active=True,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, self.active_source, [PermissionTypes.CRUD]
        )

        self.inactive_source = IngestionSource.objects.create(
            name="inactive_api",
            source_type=IngestionSourceCategory.API,
            active=False,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, self.inactive_source, [PermissionTypes.CRUD]
        )

    def test_list_all_sources(self):
        """Default query returns both active and inactive sources."""
        result = self.client.execute(LIST_SOURCES_QUERY)
        self.assertIsNone(result.get("errors"))
        sources = result["data"]["ingestionSources"]
        names = [s["name"] for s in sources]
        self.assertIn("active_crawler", names)
        self.assertIn("inactive_api", names)

    def test_list_active_only(self):
        """active_only=True filters out inactive sources."""
        result = self.client.execute(LIST_SOURCES_QUERY, variables={"activeOnly": True})
        self.assertIsNone(result.get("errors"))
        sources = result["data"]["ingestionSources"]
        names = [s["name"] for s in sources]
        self.assertIn("active_crawler", names)
        self.assertNotIn("inactive_api", names)

    def test_list_excludes_other_users_sources(self):
        """Sources from other users should not appear in the list."""
        other_user = User.objects.create_user(username="other", password="otherpass")
        IngestionSource.objects.create(
            name="other_source", creator=other_user, active=True
        )

        result = self.client.execute(LIST_SOURCES_QUERY)
        self.assertIsNone(result.get("errors"))
        sources = result["data"]["ingestionSources"]
        names = [s["name"] for s in sources]
        self.assertNotIn("other_source", names)
