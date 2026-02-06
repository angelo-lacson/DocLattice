from django.test import TestCase

from opencontractserver.documents.models import PipelineSettings
from opencontractserver.pipeline.base.base_component import PipelineComponentBase

# Helper to get the logger from the module being tested
BASE_COMPONENT_LOGGER = "opencontractserver.pipeline.base.base_component"


class DummyComponent(PipelineComponentBase):
    """A simple component for testing settings loading."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class TestPipelineComponentBaseSettings(TestCase):
    """
    Tests the settings loading mechanism of PipelineComponentBase.

    Settings are loaded exclusively from the PipelineSettings database
    singleton (DB-only, no Django settings fallback).
    """

    def setUp(self):
        """Ensure clean PipelineSettings state."""
        PipelineSettings.objects.all().delete()
        self.pipeline_settings = PipelineSettings.objects.create(id=1)

    def get_dummy_component_full_path(self) -> str:
        """Returns the full Python path to the DummyComponent class."""
        return f"{DummyComponent.__module__}.{DummyComponent.__name__}"

    def test_load_settings_from_db(self):
        """Settings are loaded from PipelineSettings DB by full class path."""
        expected_settings = {"api_key": "test-key", "timeout": 30}
        full_path = self.get_dummy_component_full_path()

        self.pipeline_settings.component_settings = {full_path: expected_settings}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponent()
        result = component.get_component_settings()
        self.assertEqual(result["api_key"], expected_settings["api_key"])
        self.assertEqual(result["timeout"], expected_settings["timeout"])

    def test_no_settings_found_for_component(self):
        """Returns empty dict when no DB settings exist for the component."""
        self.pipeline_settings.component_settings = {
            "some.other.Component": {"key": "value"}
        }
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponent()
        self.assertEqual(component.get_component_settings(), {})

    def test_empty_component_settings_returns_empty(self):
        """Returns empty dict when component_settings is empty."""
        self.pipeline_settings.component_settings = {}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponent()
        self.assertEqual(component.get_component_settings(), {})

    def test_no_django_settings_fallback(self):
        """Django settings PIPELINE_SETTINGS is NOT used as fallback."""
        full_path = self.get_dummy_component_full_path()

        # Set Django settings but keep DB empty
        pipeline_settings_override = {
            "DummyComponent": {"key_simple": "should_not_load"},
            full_path: {"key_full": "should_not_load_either"},
        }
        self.pipeline_settings.component_settings = {}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        with self.settings(PIPELINE_SETTINGS=pipeline_settings_override):
            component = DummyComponent()
            result = component.get_component_settings()
            # Should be empty - Django settings are NOT consulted
            self.assertEqual(result, {})

    def test_db_settings_take_precedence(self):
        """DB settings are used even when Django settings differ."""
        full_path = self.get_dummy_component_full_path()
        db_settings = {"source": "database", "api_key": "db-key"}

        self.pipeline_settings.component_settings = {full_path: db_settings}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        django_settings_override = {
            full_path: {"source": "django", "api_key": "django-key"},
        }
        with self.settings(PIPELINE_SETTINGS=django_settings_override):
            component = DummyComponent()
            result = component.get_component_settings()
            self.assertEqual(result["source"], "database")
            self.assertEqual(result["api_key"], "db-key")

    def test_pipeline_settings_globally_missing(self):
        """Returns empty dict when no settings exist anywhere."""
        with self.settings(PIPELINE_SETTINGS={}):
            component = DummyComponent()
            self.assertEqual(
                component.get_component_settings(),
                {},
                "Should be empty if no DB settings exist.",
            )

    def test_component_settings_not_a_dict_returns_empty(self):
        """Returns empty dict when component_settings DB value is not a dict."""
        self.pipeline_settings.component_settings = {}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponent()
        self.assertEqual(component.get_component_settings(), {})

    def test_full_class_path_used_for_lookup(self):
        """Verifies the full Python path is used for DB lookup."""
        full_path = self.get_dummy_component_full_path()

        # Only store settings under the full path
        self.pipeline_settings.component_settings = {full_path: {"found": True}}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponent()
        result = component.get_component_settings()
        self.assertTrue(result.get("found"))

        # Simple class name should NOT match
        self.pipeline_settings.component_settings = {
            "DummyComponent": {"found_simple": True}
        }
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        result = component.get_component_settings()
        self.assertEqual(result, {})
