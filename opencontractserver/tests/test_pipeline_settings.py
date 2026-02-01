"""
Tests for the PipelineSettings singleton model and GraphQL endpoints.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from graphene.test import Client

from config.graphql.schema import schema
from opencontractserver.documents.models import PipelineSettings

User = get_user_model()


class TestContext:
    """Mock context for GraphQL tests."""

    def __init__(self, user):
        self.user = user


class PipelineSettingsModelTestCase(TestCase):
    """Tests for the PipelineSettings model."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="admin", password="admin", email="admin@test.com"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="regular"
        )

    def test_get_instance_creates_singleton(self):
        """Test that get_instance creates a singleton if it doesn't exist."""
        # Ensure no instance exists
        PipelineSettings.objects.all().delete()

        instance = PipelineSettings.get_instance()
        self.assertIsNotNone(instance)
        self.assertEqual(instance.pk, 1)

        # Getting instance again should return the same object
        instance2 = PipelineSettings.get_instance()
        self.assertEqual(instance.pk, instance2.pk)

    def test_cannot_create_second_instance(self):
        """Test that creating a second instance raises ValidationError."""
        # Create the first instance
        PipelineSettings.get_instance()

        # Attempting to create a second instance should fail
        with self.assertRaises(ValidationError):
            PipelineSettings.objects.create(
                preferred_parsers={"test": "test"},
            )

    def test_cannot_delete_singleton(self):
        """Test that deleting the singleton raises ValidationError."""
        instance = PipelineSettings.get_instance()

        with self.assertRaises(ValidationError):
            instance.delete()

    @override_settings(
        PREFERRED_PARSERS={"application/pdf": "test.parser.TestParser"},
        PREFERRED_EMBEDDERS={"application/pdf": "test.embedder.TestEmbedder"},
        PARSER_KWARGS={"test.parser.TestParser": {"option1": True}},
        DEFAULT_EMBEDDER="test.embedder.DefaultEmbedder",
    )
    def test_get_preferred_parser_uses_db_then_fallback(self):
        """Test that get_preferred_parser uses DB first, then Django settings."""
        # Delete existing instance and create new one to pick up test settings
        PipelineSettings.objects.all().delete()
        instance = PipelineSettings.get_instance()

        # Initially should fallback to Django settings
        self.assertEqual(
            instance.get_preferred_parser("application/pdf"),
            "test.parser.TestParser",
        )

        # Set a value in the database
        instance.preferred_parsers = {
            "application/pdf": "db.parser.DBParser",
        }
        instance.save()

        # Now should use the database value
        self.assertEqual(
            instance.get_preferred_parser("application/pdf"),
            "db.parser.DBParser",
        )

        # Unlisted MIME type should fallback to Django settings
        self.assertIsNone(instance.get_preferred_parser("text/plain"))

    @override_settings(
        DEFAULT_EMBEDDER="test.embedder.DefaultEmbedder",
    )
    def test_get_default_embedder_uses_db_then_fallback(self):
        """Test that get_default_embedder uses DB first, then Django settings."""
        # Delete existing instance to test creation with settings
        PipelineSettings.objects.all().delete()
        instance = PipelineSettings.get_instance()

        # Initially should fallback to Django settings
        self.assertEqual(
            instance.get_default_embedder(),
            "test.embedder.DefaultEmbedder",
        )

        # Set a value in the database
        instance.default_embedder = "db.embedder.NewDefault"
        instance.save()

        # Now should use the database value
        self.assertEqual(instance.get_default_embedder(), "db.embedder.NewDefault")

    def test_get_parser_kwargs_uses_db_then_fallback(self):
        """Test that get_parser_kwargs uses DB first, then Django settings."""
        PipelineSettings.objects.all().delete()
        instance = PipelineSettings.get_instance()

        # Set a value in the database
        instance.parser_kwargs = {
            "my.parser.TestParser": {"force_ocr": True, "timeout": 60},
        }
        instance.save()

        # Should use the database value
        kwargs = instance.get_parser_kwargs("my.parser.TestParser")
        self.assertEqual(kwargs["force_ocr"], True)
        self.assertEqual(kwargs["timeout"], 60)

    def test_get_preferred_thumbnailer(self):
        """Test that get_preferred_thumbnailer uses DB only (no fallback)."""
        PipelineSettings.objects.all().delete()
        instance = PipelineSettings.get_instance()

        # Initially should return None (no Django settings fallback)
        self.assertIsNone(instance.get_preferred_thumbnailer("application/pdf"))

        # Set a value in the database
        instance.preferred_thumbnailers = {
            "application/pdf": "my.thumbnailer.PdfThumb",
        }
        instance.save()

        # Now should use the database value
        self.assertEqual(
            instance.get_preferred_thumbnailer("application/pdf"),
            "my.thumbnailer.PdfThumb",
        )

    def test_modified_by_tracks_user(self):
        """Test that modified_by is updated when a user modifies settings."""
        instance = PipelineSettings.get_instance()

        instance.modified_by = self.superuser
        instance.preferred_parsers = {"test/mime": "test.parser.Parser"}
        instance.save()

        instance.refresh_from_db()
        self.assertEqual(instance.modified_by, self.superuser)


class PipelineSettingsGraphQLTestCase(TestCase):
    """Tests for the PipelineSettings GraphQL endpoints."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="admin", password="admin", email="admin@test.com"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="regular"
        )
        self.superuser_client = Client(
            schema, context_value=TestContext(self.superuser)
        )
        self.regular_client = Client(
            schema, context_value=TestContext(self.regular_user)
        )

        # Ensure the singleton exists
        PipelineSettings.get_instance()

    def test_query_pipeline_settings_as_regular_user(self):
        """Test that regular users can read pipeline settings."""
        query = """
            query {
                pipelineSettings {
                    preferredParsers
                    preferredEmbedders
                    preferredThumbnailers
                    parserKwargs
                    componentSettings
                    defaultEmbedder
                    modified
                }
            }
        """

        result = self.regular_client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertIsNotNone(result["data"]["pipelineSettings"])

    def test_update_pipeline_settings_as_superuser(self):
        """Test that superusers can update pipeline settings."""
        mutation = """
            mutation UpdatePipelineSettings(
                $preferredParsers: GenericScalar
            ) {
                updatePipelineSettings(
                    preferredParsers: $preferredParsers
                ) {
                    ok
                    message
                    pipelineSettings {
                        preferredParsers
                    }
                }
            }
        """

        # Use a real parser that exists in the registry
        from opencontractserver.pipeline.registry import get_registry

        registry = get_registry()
        if registry.parsers:
            parser = registry.parsers[0]
            variables = {
                "preferredParsers": {
                    "application/pdf": parser.class_name,
                }
            }

            result = self.superuser_client.execute(mutation, variables=variables)
            self.assertIsNone(result.get("errors"))
            self.assertTrue(result["data"]["updatePipelineSettings"]["ok"])
            self.assertEqual(
                result["data"]["updatePipelineSettings"]["pipelineSettings"][
                    "preferredParsers"
                ]["application/pdf"],
                parser.class_name,
            )

    def test_update_pipeline_settings_as_regular_user_fails(self):
        """Test that regular users cannot update pipeline settings."""
        mutation = """
            mutation UpdatePipelineSettings(
                $preferredParsers: GenericScalar
            ) {
                updatePipelineSettings(
                    preferredParsers: $preferredParsers
                ) {
                    ok
                    message
                }
            }
        """

        variables = {
            "preferredParsers": {
                "application/pdf": "some.parser.TestParser",
            }
        }

        result = self.regular_client.execute(mutation, variables=variables)
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["updatePipelineSettings"]["ok"])
        self.assertIn(
            "superuser",
            result["data"]["updatePipelineSettings"]["message"].lower(),
        )

    def test_update_with_invalid_parser_fails(self):
        """Test that updating with an invalid parser class path fails."""
        mutation = """
            mutation UpdatePipelineSettings(
                $preferredParsers: GenericScalar
            ) {
                updatePipelineSettings(
                    preferredParsers: $preferredParsers
                ) {
                    ok
                    message
                }
            }
        """

        variables = {
            "preferredParsers": {
                "application/pdf": "nonexistent.parser.FakeParser",
            }
        }

        result = self.superuser_client.execute(mutation, variables=variables)
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["updatePipelineSettings"]["ok"])
        self.assertIn(
            "not found",
            result["data"]["updatePipelineSettings"]["message"].lower(),
        )

    def test_reset_pipeline_settings_as_superuser(self):
        """Test that superusers can reset pipeline settings to defaults."""
        mutation = """
            mutation {
                resetPipelineSettings {
                    ok
                    message
                    pipelineSettings {
                        preferredParsers
                    }
                }
            }
        """

        result = self.superuser_client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["resetPipelineSettings"]["ok"])

    def test_reset_pipeline_settings_as_regular_user_fails(self):
        """Test that regular users cannot reset pipeline settings."""
        mutation = """
            mutation {
                resetPipelineSettings {
                    ok
                    message
                }
            }
        """

        result = self.regular_client.execute(mutation)
        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["resetPipelineSettings"]["ok"])
        self.assertIn(
            "superuser",
            result["data"]["resetPipelineSettings"]["message"].lower(),
        )

    def test_update_parser_kwargs(self):
        """Test updating parser kwargs via GraphQL."""
        mutation = """
            mutation UpdatePipelineSettings(
                $parserKwargs: GenericScalar
            ) {
                updatePipelineSettings(
                    parserKwargs: $parserKwargs
                ) {
                    ok
                    message
                    pipelineSettings {
                        parserKwargs
                    }
                }
            }
        """

        variables = {
            "parserKwargs": {
                "some.parser.TestParser": {
                    "force_ocr": True,
                    "timeout": 120,
                }
            }
        }

        result = self.superuser_client.execute(mutation, variables=variables)
        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["updatePipelineSettings"]["ok"])

        returned_kwargs = result["data"]["updatePipelineSettings"]["pipelineSettings"][
            "parserKwargs"
        ]
        self.assertEqual(
            returned_kwargs["some.parser.TestParser"]["force_ocr"], True
        )
        self.assertEqual(
            returned_kwargs["some.parser.TestParser"]["timeout"], 120
        )

    def test_update_default_embedder(self):
        """Test updating default embedder via GraphQL."""
        # Use a real embedder that exists in the registry
        from opencontractserver.pipeline.registry import get_registry

        registry = get_registry()
        if registry.embedders:
            embedder = registry.embedders[0]

            mutation = """
                mutation UpdatePipelineSettings(
                    $defaultEmbedder: String
                ) {
                    updatePipelineSettings(
                        defaultEmbedder: $defaultEmbedder
                    ) {
                        ok
                        message
                        pipelineSettings {
                            defaultEmbedder
                        }
                    }
                }
            """

            variables = {"defaultEmbedder": embedder.class_name}

            result = self.superuser_client.execute(mutation, variables=variables)
            self.assertIsNone(result.get("errors"))
            self.assertTrue(result["data"]["updatePipelineSettings"]["ok"])
            self.assertEqual(
                result["data"]["updatePipelineSettings"]["pipelineSettings"][
                    "defaultEmbedder"
                ],
                embedder.class_name,
            )
