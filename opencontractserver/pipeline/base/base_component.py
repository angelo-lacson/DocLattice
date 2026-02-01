import logging
from abc import ABC

from django.conf import settings

logger = logging.getLogger(__name__)


class PipelineComponentBase(ABC):
    """
    Base class for pipeline components, providing automatic settings injection.

    Pipeline components inheriting from this class will have settings
    automatically loaded from:
    1. The PipelineSettings database singleton (includes encrypted secrets)
    2. Django's `settings.PIPELINE_SETTINGS` as fallback

    Settings are loaded fresh on each call to get_component_settings() to
    ensure runtime changes are reflected without restarting workers.

    The settings dictionary should be structured as follows:
    {
        "full.python.path.to.ComponentClass": {
            "setting_key_1": "value1",
            "setting_key_2": True,
            # ...
        },
        # ...
    }
    """

    def __init__(self, **kwargs):
        """
        Initializes the PipelineComponentBase.
        Any kwargs passed are typically for other base classes in an MRO,
        or can be used by subclasses after calling super().__init__().
        """
        super().__init__()  # Ensures MRO is handled correctly, e.g. if ABC has __init__
        # Cache the class path for efficient lookups
        self._full_class_path = f"{self.__class__.__module__}.{self.__class__.__name__}"

    def get_component_settings(self) -> dict:
        """
        Get settings for this component from PipelineSettings DB or Django settings.

        This method fetches settings fresh on each call to support runtime
        configuration changes. It checks the PipelineSettings database model
        first (which includes encrypted secrets), then falls back to Django
        settings.PIPELINE_SETTINGS.

        Returns:
            Dict of settings for this component, including decrypted secrets.
        """
        # Ensure Django settings are configured
        if not settings.configured:
            logger.warning(
                "Django settings not configured. Component settings unavailable."
            )
            return {}

        # Try to get settings from PipelineSettings DB model (includes secrets)
        try:
            from opencontractserver.documents.models import PipelineSettings

            pipeline_settings = PipelineSettings.get_instance()
            # get_full_component_settings merges component_settings with secrets
            db_settings = pipeline_settings.get_full_component_settings(
                self._full_class_path
            )
            if db_settings:
                logger.debug(f"Loaded settings from DB for '{self._full_class_path}'")
                return db_settings
        except Exception as e:
            # DB not available (e.g., during migrations or early startup)
            logger.debug(
                f"Could not load settings from PipelineSettings DB: {e}. "
                "Falling back to Django settings."
            )

        # Fallback to Django settings.PIPELINE_SETTINGS
        return self._get_django_settings_fallback()

    def _get_django_settings_fallback(self) -> dict:
        """
        Load settings from Django settings.PIPELINE_SETTINGS as fallback.

        Tries the simple class name first (higher precedence), then falls back
        to the full class path. This allows simple configuration keys like
        "MyComponent" to override more specific "mymodule.MyComponent" paths.

        Returns:
            Dict of settings for this component from Django settings.
        """
        pipeline_settings_dict = getattr(settings, "PIPELINE_SETTINGS", {})

        if not isinstance(pipeline_settings_dict, dict):
            logger.warning("PIPELINE_SETTINGS is defined but is not a dictionary.")
            return {}

        simple_class_name = self.__class__.__name__

        # Try simple class name first (higher precedence for user convenience)
        component_settings = pipeline_settings_dict.get(simple_class_name)
        if isinstance(component_settings, dict) and component_settings:
            logger.debug(f"Loaded Django settings for '{simple_class_name}'")
            return component_settings.copy()

        # Fallback to full class path
        component_settings = pipeline_settings_dict.get(self._full_class_path)
        if isinstance(component_settings, dict) and component_settings:
            logger.debug(f"Loaded Django settings for '{self._full_class_path}'")
            return component_settings.copy()

        logger.debug(
            f"No settings found for '{simple_class_name}' or "
            f"'{self._full_class_path}' in PIPELINE_SETTINGS."
        )
        return {}
