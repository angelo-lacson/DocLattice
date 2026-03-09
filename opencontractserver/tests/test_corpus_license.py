"""
Tests for corpus license field validation and GraphQL mutations.

Covers:
- Create corpus with a standard CC license
- Create corpus with CUSTOM license + URL
- Create corpus with CUSTOM license without URL (should fail)
- Update corpus license fields
- URL scheme restriction (only http/https)
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client as GrapheneClient
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


CREATE_MUTATION = """
    mutation CreateCorpus(
        $title: String!,
        $description: String,
        $license: String,
        $licenseLink: String
    ) {
        createCorpus(
            title: $title,
            description: $description,
            license: $license,
            licenseLink: $licenseLink
        ) {
            ok
            message
            objId
        }
    }
"""

UPDATE_MUTATION = """
    mutation UpdateCorpus(
        $id: String!,
        $license: String,
        $licenseLink: String
    ) {
        updateCorpus(
            id: $id,
            license: $license,
            licenseLink: $licenseLink
        ) {
            ok
            message
        }
    }
"""


class TestCorpusLicenseCreate(TestCase):
    """Test license handling during corpus creation."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="licensetest", password="testpass"
        )
        self.client = GrapheneClient(schema, context_value=TestContext(self.user))

    def test_create_with_cc_license(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variable_values={
                "title": "CC Licensed Corpus",
                "description": "A test corpus",
                "license": "CC-BY-4.0",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpus"]["ok"])

        corpus = Corpus.objects.get(creator=self.user, title="CC Licensed Corpus")
        self.assertEqual(corpus.license, "CC-BY-4.0")

    def test_create_with_custom_license_and_url(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variable_values={
                "title": "Custom Licensed Corpus",
                "description": "A test corpus",
                "license": "CUSTOM",
                "licenseLink": "https://example.com/my-license",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpus"]["ok"])

        corpus = Corpus.objects.get(
            creator=self.user, title="Custom Licensed Corpus"
        )
        self.assertEqual(corpus.license, "CUSTOM")
        self.assertEqual(corpus.license_link, "https://example.com/my-license")

    def test_create_custom_without_url_fails(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variable_values={
                "title": "Missing URL Corpus",
                "description": "A test corpus",
                "license": "CUSTOM",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["createCorpus"]["ok"])
        self.assertIn(
            "license_link", result["data"]["createCorpus"]["message"]
        )

    def test_create_with_no_license(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variable_values={
                "title": "No License Corpus",
                "description": "A test corpus",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpus"]["ok"])

        corpus = Corpus.objects.get(creator=self.user, title="No License Corpus")
        self.assertEqual(corpus.license, "")


class TestCorpusLicenseUpdate(TestCase):
    """Test license handling during corpus updates."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="licenseupdatetest", password="testpass"
        )
        self.corpus = Corpus.objects.create(
            title="Update Test Corpus",
            description="A test corpus",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user,
            self.corpus,
            [PermissionTypes.CRUD, PermissionTypes.PUBLISH, PermissionTypes.PERMISSION],
        )
        self.client = GrapheneClient(schema, context_value=TestContext(self.user))
        self.global_id = to_global_id("CorpusType", self.corpus.id)

    def test_update_to_cc_license(self):
        result = self.client.execute(
            UPDATE_MUTATION,
            variable_values={
                "id": self.global_id,
                "license": "CC-BY-SA-4.0",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["updateCorpus"]["ok"])

        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.license, "CC-BY-SA-4.0")

    def test_update_to_custom_with_url(self):
        result = self.client.execute(
            UPDATE_MUTATION,
            variable_values={
                "id": self.global_id,
                "license": "CUSTOM",
                "licenseLink": "https://example.com/custom",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["updateCorpus"]["ok"])

        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.license, "CUSTOM")
        self.assertEqual(self.corpus.license_link, "https://example.com/custom")

    def test_update_to_custom_without_url_fails(self):
        result = self.client.execute(
            UPDATE_MUTATION,
            variable_values={
                "id": self.global_id,
                "license": "CUSTOM",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["updateCorpus"]["ok"])
        self.assertIn(
            "license_link", result["data"]["updateCorpus"]["message"]
        )

    def test_clear_license(self):
        self.corpus.license = "CC-BY-4.0"
        self.corpus.save()

        result = self.client.execute(
            UPDATE_MUTATION,
            variable_values={
                "id": self.global_id,
                "license": "",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["updateCorpus"]["ok"])

        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.license, "")


class TestCorpusLicenseLinkScheme(TestCase):
    """Test that license_link only accepts http/https URLs."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="schemetest", password="testpass"
        )
        self.client = GrapheneClient(schema, context_value=TestContext(self.user))

    def test_ftp_url_rejected(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variable_values={
                "title": "FTP License Corpus",
                "description": "A test corpus",
                "license": "CUSTOM",
                "licenseLink": "ftp://example.com/license",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["createCorpus"]["ok"])

    def test_https_url_accepted(self):
        result = self.client.execute(
            CREATE_MUTATION,
            variable_values={
                "title": "HTTPS License Corpus",
                "description": "A test corpus",
                "license": "CUSTOM",
                "licenseLink": "https://example.com/license",
            },
        )
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpus"]["ok"])
