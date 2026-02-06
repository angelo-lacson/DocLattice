from dataclasses import dataclass, field

from django.test import TestCase

from opencontractserver.documents.models import PipelineSettings
from opencontractserver.pipeline.base.base_component import PipelineComponentBase
from opencontractserver.pipeline.base.settings_schema import (
    PipelineSetting,
    SettingType,
)

# Helper to get the logger from the module being tested
BASE_COMPONENT_LOGGER = "opencontractserver.pipeline.base.base_component"


class DummyComponent(PipelineComponentBase):
    """A simple component for testing settings loading (no Settings dataclass)."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class DummyComponentWithSettings(PipelineComponentBase):
    """A component with a Settings dataclass for testing schema-based loading."""

    @dataclass
    class Settings:
        api_key: str = field(
            default="",
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.SECRET,
                    required=True,
                    description="API key for testing",
                    env_var="DUMMY_API_KEY",
                )
            },
        )
        timeout: int = field(
            default=30,
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description="Request timeout in seconds",
                )
            },
        )
        debug: bool = field(
            default=False,
            metadata={
                "pipeline_setting": PipelineSetting(
                    setting_type=SettingType.OPTIONAL,
                    description="Enable debug mode",
                )
            },
        )

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


class TestPipelineComponentWithSettingsDataclass(TestCase):
    """Tests for components with a Settings dataclass."""

    def setUp(self):
        PipelineSettings.objects.all().delete()
        self.pipeline_settings = PipelineSettings.objects.create(id=1)

    def _full_path(self):
        return (
            f"{DummyComponentWithSettings.__module__}"
            f".{DummyComponentWithSettings.__name__}"
        )

    def test_settings_property_returns_dataclass_instance(self):
        """Settings property returns a populated Settings dataclass."""
        full_path = self._full_path()
        self.pipeline_settings.component_settings = {
            full_path: {"timeout": 60, "debug": True}
        }
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponentWithSettings()
        self.assertIsNotNone(component.settings)
        self.assertEqual(component.settings.timeout, 60)
        self.assertTrue(component.settings.debug)

    def test_settings_property_none_without_dataclass(self):
        """Settings property is None for components without a Settings dataclass."""
        component = DummyComponent()
        self.assertIsNone(component.settings)

    def test_settings_defaults_when_no_db_values(self):
        """Settings use defaults from dataclass when no DB values exist."""
        component = DummyComponentWithSettings()
        self.assertIsNotNone(component.settings)
        self.assertEqual(component.settings.api_key, "")
        self.assertEqual(component.settings.timeout, 30)
        self.assertFalse(component.settings.debug)

    def test_reload_settings_refreshes_from_db(self):
        """reload_settings() fetches updated values from DB."""
        full_path = self._full_path()

        component = DummyComponentWithSettings()
        self.assertEqual(component.settings.timeout, 30)

        # Update DB settings
        self.pipeline_settings.component_settings = {full_path: {"timeout": 120}}
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        # Reload
        component.reload_settings()
        self.assertEqual(component.settings.timeout, 120)

    def test_validate_settings_reports_missing_required(self):
        """validate_settings() reports missing required fields."""
        component = DummyComponentWithSettings()
        is_valid, errors = component.validate_settings()
        # api_key is required but empty string, should report missing
        self.assertFalse(is_valid)
        self.assertTrue(any("api_key" in e for e in errors))

    def test_validate_settings_passes_when_configured(self):
        """validate_settings() passes when required settings are present."""
        full_path = self._full_path()
        self.pipeline_settings.component_settings = {
            full_path: {"api_key": "test-key-123"}
        }
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        component = DummyComponentWithSettings()
        is_valid, errors = component.validate_settings()
        self.assertTrue(is_valid)
        self.assertEqual(errors, [])

    def test_get_settings_schema_returns_schema(self):
        """get_settings_schema() returns schema from the Settings dataclass."""
        schema = DummyComponentWithSettings.get_settings_schema()
        self.assertIn("api_key", schema)
        self.assertIn("timeout", schema)
        self.assertIn("debug", schema)
        self.assertEqual(schema["api_key"]["type"], "secret")
        self.assertTrue(schema["api_key"]["required"])

    def test_get_settings_schema_empty_without_dataclass(self):
        """get_settings_schema() returns empty dict without Settings dataclass."""
        schema = DummyComponent.get_settings_schema()
        self.assertEqual(schema, {})
