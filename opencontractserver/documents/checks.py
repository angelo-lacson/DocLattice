"""
Django system checks for the documents app.

These checks run during startup (runserver, migrate, check) to warn about
common misconfigurations.
"""

import logging

from django.core.checks import Warning, register

logger = logging.getLogger(__name__)


@register()
def check_pipeline_settings_populated(app_configs, **kwargs):
    """
    Warn if PipelineSettings exists but has empty preferences while
    Django settings define non-empty values.

    This catches the case where a user upgraded but forgot to run:
        python manage.py migrate_pipeline_settings --sync-preferences
    """
    errors = []

    try:
        from django.conf import settings as django_settings

        from opencontractserver.documents.models import PipelineSettings

        # Only check if the table exists and has a row
        if not PipelineSettings.objects.exists():
            return errors

        instance = PipelineSettings.get_instance(use_cache=False)

        # Check if DB preferences are all empty/default
        db_has_parsers = bool(instance.preferred_parsers)
        db_has_embedders = bool(instance.preferred_embedders)
        db_has_default_embedder = bool(instance.default_embedder)

        # Check if Django settings have values
        django_has_parsers = bool(getattr(django_settings, "PREFERRED_PARSERS", None))
        django_has_embedders = bool(
            getattr(django_settings, "PREFERRED_EMBEDDERS", None)
        )
        django_has_default_embedder = bool(
            getattr(django_settings, "DEFAULT_EMBEDDER", None)
        )

        django_configured = (
            django_has_parsers or django_has_embedders or django_has_default_embedder
        )
        db_empty = (
            not db_has_parsers and not db_has_embedders and not db_has_default_embedder
        )

        if django_configured and db_empty:
            errors.append(
                Warning(
                    "PipelineSettings has empty preferences but Django settings "
                    "define pipeline configuration.",
                    hint=(
                        "Run 'python manage.py migrate_pipeline_settings "
                        "--sync-preferences' to populate the database from "
                        "Django settings."
                    ),
                    id="documents.W001",
                )
            )

    except Exception:
        # Don't fail startup if check can't run (e.g., table doesn't exist yet)
        pass

    return errors
