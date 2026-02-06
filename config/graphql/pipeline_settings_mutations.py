"""
GraphQL mutations for the pipeline settings system.

Superuser-only mutations to configure document processing pipeline at runtime.
"""

import logging
import re
from typing import Optional

import graphene
from django.core.exceptions import ValidationError
from graphene.types.generic import GenericScalar
from graphql_jwt.decorators import login_required

from config.graphql.graphene_types import PipelineSettingsType
from config.graphql.ratelimits import RateLimits, graphql_ratelimit

# All pipeline mutations use RateLimits.WRITE_LIGHT (30 requests/minute).
# This is appropriate for superuser-only admin operations that are
# infrequent by nature. Secret operations share this limit, which also
# provides brute-force protection for credential storage endpoints.

logger = logging.getLogger(__name__)

# Validation constants
MAX_COMPONENT_PATH_LENGTH = 256
MAX_MIME_TYPE_LENGTH = 128
# Maximum size (bytes) for JSON settings fields (parsers, embedders, kwargs, etc.)
MAX_JSON_FIELD_SIZE_BYTES = 10240  # 10KB
VALID_COMPONENT_PATH_PATTERN = re.compile(
    r"^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$"
)
VALID_MIME_TYPE_PATTERN = re.compile(
    r"^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$"
)


def validate_component_path(path: str) -> Optional[str]:
    """
    Validate a component class path.

    Args:
        path: The component class path to validate

    Returns:
        Error message if invalid, None if valid
    """
    if not path:
        return "Component path cannot be empty"
    if len(path) > MAX_COMPONENT_PATH_LENGTH:
        return f"Component path exceeds maximum length of {MAX_COMPONENT_PATH_LENGTH}"
    if not VALID_COMPONENT_PATH_PATTERN.match(path):
        return f"Invalid component path format: '{path}'. Must be a valid Python module path."
    return None


def validate_mime_type(mime_type: str) -> Optional[str]:
    """
    Validate a MIME type string.

    Args:
        mime_type: The MIME type to validate

    Returns:
        Error message if invalid, None if valid
    """
    if not mime_type:
        return "MIME type cannot be empty"
    if len(mime_type) > MAX_MIME_TYPE_LENGTH:
        return f"MIME type exceeds maximum length of {MAX_MIME_TYPE_LENGTH}"
    if not VALID_MIME_TYPE_PATTERN.match(mime_type):
        return f"Invalid MIME type format: '{mime_type}'"
    return None


def validate_component_mapping(
    mapping: dict, registry, component_type: str
) -> Optional[str]:
    """
    Validate a mapping of MIME types to component paths.

    Args:
        mapping: Dict mapping MIME types to component class paths
        registry: Pipeline component registry for validation
        component_type: Type name for error messages (e.g., "Parser")

    Returns:
        Error message if invalid, None if valid
    """
    if not isinstance(mapping, dict):
        return f"{component_type} mapping must be a dictionary"

    for mime_type, component_path in mapping.items():
        # Validate MIME type
        error = validate_mime_type(mime_type)
        if error:
            return error

        # Validate component path format
        error = validate_component_path(component_path)
        if error:
            return error

        # Validate component exists in registry
        if not registry.get_by_class_name(component_path):
            return f"{component_type} '{component_path}' not found in registry"

    return None


def validate_secrets_input(secrets: dict) -> Optional[str]:
    """
    Validate secrets input structure and size.

    Args:
        secrets: Dict of secret key-value pairs

    Returns:
        Error message if invalid, None if valid
    """
    import json

    if not isinstance(secrets, dict):
        return "Secrets must be a dictionary"

    for key, value in secrets.items():
        if not isinstance(key, str):
            return f"Secret key must be a string, got {type(key).__name__}"
        if len(key) > 256:
            return f"Secret key '{key[:50]}...' exceeds maximum length of 256"
        if not isinstance(value, (str, int, float, bool, type(None))):
            return f"Secret value for '{key}' must be a primitive type (string, number, boolean, null)"

    # Validate payload size before encryption attempt
    from opencontractserver.documents.models import PipelineSettings

    max_size = PipelineSettings._get_max_secret_size()
    payload_size = len(json.dumps(secrets).encode("utf-8"))
    if payload_size > max_size:
        return f"Secrets payload ({payload_size} bytes) exceeds maximum size of {max_size} bytes"

    return None


def validate_json_field_size(value: dict, field_name: str) -> Optional[str]:
    """
    Validate that a JSON field does not exceed the maximum allowed size.

    Args:
        value: The dict to validate
        field_name: Human-readable field name for error messages

    Returns:
        Error message if too large, None if valid
    """
    import json

    payload_size = len(json.dumps(value).encode("utf-8"))
    if payload_size > MAX_JSON_FIELD_SIZE_BYTES:
        return (
            f"{field_name} payload ({payload_size} bytes) exceeds "
            f"maximum size of {MAX_JSON_FIELD_SIZE_BYTES} bytes"
        )
    return None


class UpdatePipelineSettingsMutation(graphene.Mutation):
    """
    Update the singleton pipeline settings.

    Only superusers can modify these settings. Changes take effect immediately
    for all new document processing tasks.

    Arguments:
        preferred_parsers: Dict mapping MIME types to parser class paths
        preferred_embedders: Dict mapping MIME types to embedder class paths
        preferred_thumbnailers: Dict mapping MIME types to thumbnailer class paths
        parser_kwargs: Dict mapping parser class paths to their configuration kwargs
        component_settings: Dict mapping component class paths to settings overrides
        default_embedder: Default embedder class path

    Returns:
        ok: Whether the update succeeded
        message: Status message
        pipeline_settings: The updated settings
    """

    class Arguments:
        preferred_parsers = GenericScalar(
            required=False,
            description="Mapping of MIME types to preferred parser class paths. "
            "Example: {'application/pdf': 'opencontractserver.pipeline.parsers.docling_parser_rest.DoclingParser'}",
        )
        preferred_embedders = GenericScalar(
            required=False,
            description="Mapping of MIME types to preferred embedder class paths.",
        )
        preferred_thumbnailers = GenericScalar(
            required=False,
            description="Mapping of MIME types to preferred thumbnailer class paths.",
        )
        parser_kwargs = GenericScalar(
            required=False,
            description="Mapping of parser class paths to their configuration kwargs. "
            "Example: {'DoclingParser': {'force_ocr': true}}",
        )
        component_settings = GenericScalar(
            required=False,
            description="Mapping of component class paths to settings overrides.",
        )
        default_embedder = graphene.String(
            required=False,
            description="Default embedder class path when no MIME-specific embedder is found.",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    pipeline_settings = graphene.Field(PipelineSettingsType)

    @login_required
    @graphql_ratelimit(rate=RateLimits.WRITE_LIGHT)
    def mutate(
        root,
        info,
        preferred_parsers=None,
        preferred_embedders=None,
        preferred_thumbnailers=None,
        parser_kwargs=None,
        component_settings=None,
        default_embedder=None,
    ):
        """
        Update the pipeline settings.

        Security: Only superusers can update these settings.
        """
        from opencontractserver.documents.models import PipelineSettings
        from opencontractserver.pipeline.registry import get_registry

        user = info.context.user

        # SECURITY: Only superusers can update pipeline settings
        if not user.is_superuser:
            return UpdatePipelineSettingsMutation(
                ok=False,
                message="Only superusers can update pipeline settings.",
                pipeline_settings=None,
            )

        try:
            settings_instance = PipelineSettings.get_instance()
            registry = get_registry()

            # Validate and apply preferred_parsers
            if preferred_parsers is not None:
                error = validate_component_mapping(
                    preferred_parsers, registry, "Parser"
                ) or validate_json_field_size(preferred_parsers, "preferred_parsers")
                if error:
                    return UpdatePipelineSettingsMutation(
                        ok=False, message=error, pipeline_settings=None
                    )
                settings_instance.preferred_parsers = preferred_parsers

            # Validate and apply preferred_embedders
            if preferred_embedders is not None:
                error = validate_component_mapping(
                    preferred_embedders, registry, "Embedder"
                ) or validate_json_field_size(
                    preferred_embedders, "preferred_embedders"
                )
                if error:
                    return UpdatePipelineSettingsMutation(
                        ok=False, message=error, pipeline_settings=None
                    )
                settings_instance.preferred_embedders = preferred_embedders

            # Validate and apply preferred_thumbnailers
            if preferred_thumbnailers is not None:
                error = validate_component_mapping(
                    preferred_thumbnailers, registry, "Thumbnailer"
                ) or validate_json_field_size(
                    preferred_thumbnailers, "preferred_thumbnailers"
                )
                if error:
                    return UpdatePipelineSettingsMutation(
                        ok=False, message=error, pipeline_settings=None
                    )
                settings_instance.preferred_thumbnailers = preferred_thumbnailers

            # Validate parser_kwargs
            if parser_kwargs is not None:
                if not isinstance(parser_kwargs, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="parser_kwargs must be a dictionary.",
                        pipeline_settings=None,
                    )
                error = validate_json_field_size(parser_kwargs, "parser_kwargs")
                if error:
                    return UpdatePipelineSettingsMutation(
                        ok=False, message=error, pipeline_settings=None
                    )
                settings_instance.parser_kwargs = parser_kwargs

            # Validate component_settings
            if component_settings is not None:
                if not isinstance(component_settings, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="component_settings must be a dictionary.",
                        pipeline_settings=None,
                    )
                error = validate_json_field_size(
                    component_settings, "component_settings"
                )
                if error:
                    return UpdatePipelineSettingsMutation(
                        ok=False, message=error, pipeline_settings=None
                    )

                # Validate each component's settings against its schema
                for comp_path, comp_settings in component_settings.items():
                    # Validate component path format
                    error = validate_component_path(comp_path)
                    if error:
                        return UpdatePipelineSettingsMutation(
                            ok=False,
                            message=f"Invalid component path in component_settings: {error}",
                            pipeline_settings=None,
                        )

                    if not isinstance(comp_settings, dict):
                        return UpdatePipelineSettingsMutation(
                            ok=False,
                            message=f"Settings for '{comp_path}' must be a dictionary.",
                            pipeline_settings=None,
                        )

                    # Validate settings values against component schema
                    component_def = registry.get_by_class_name(comp_path)
                    if component_def and component_def.component_class:
                        from opencontractserver.pipeline.base.settings_schema import (
                            get_secret_settings,
                            validate_settings,
                        )

                        # Filter out secrets from validation (they're stored separately)
                        secret_names = get_secret_settings(
                            component_def.component_class
                        )
                        non_secret_settings = {
                            k: v
                            for k, v in comp_settings.items()
                            if k not in secret_names
                        }

                        is_valid, errors = validate_settings(
                            component_def.component_class, non_secret_settings
                        )
                        if not is_valid:
                            return UpdatePipelineSettingsMutation(
                                ok=False,
                                message=f"Invalid settings for '{comp_path}': {'; '.join(errors)}",
                                pipeline_settings=None,
                            )

                settings_instance.component_settings = component_settings

            # Validate default_embedder
            if default_embedder is not None:
                if default_embedder:
                    error = validate_component_path(default_embedder)
                    if error:
                        return UpdatePipelineSettingsMutation(
                            ok=False, message=error, pipeline_settings=None
                        )
                    if not registry.get_by_class_name(default_embedder):
                        return UpdatePipelineSettingsMutation(
                            ok=False,
                            message=f"Default embedder '{default_embedder}' not found in registry.",
                            pipeline_settings=None,
                        )
                settings_instance.default_embedder = default_embedder

            # Record who made the change
            settings_instance.modified_by = user
            settings_instance.save()

            updated_fields = [
                name
                for name, val in [
                    ("preferred_parsers", preferred_parsers),
                    ("preferred_embedders", preferred_embedders),
                    ("preferred_thumbnailers", preferred_thumbnailers),
                    ("parser_kwargs", parser_kwargs),
                    ("component_settings", component_settings),
                    ("default_embedder", default_embedder),
                ]
                if val is not None
            ]
            logger.info(
                "Pipeline settings updated by %s: fields=%s",
                user.username,
                ", ".join(updated_fields),
            )

            return UpdatePipelineSettingsMutation(
                ok=True,
                message="Pipeline settings updated successfully.",
                pipeline_settings=PipelineSettingsType(
                    preferred_parsers=settings_instance.preferred_parsers or {},
                    preferred_embedders=settings_instance.preferred_embedders or {},
                    preferred_thumbnailers=settings_instance.preferred_thumbnailers
                    or {},
                    parser_kwargs=settings_instance.parser_kwargs or {},
                    component_settings=settings_instance.component_settings or {},
                    default_embedder=settings_instance.default_embedder or "",
                    components_with_secrets=list(
                        settings_instance.get_secrets().keys()
                    ),
                    modified=settings_instance.modified,
                    modified_by=settings_instance.modified_by,
                ),
            )

        except (ValidationError, ValueError) as e:
            return UpdatePipelineSettingsMutation(
                ok=False,
                message=f"Failed to update pipeline settings: {e}",
                pipeline_settings=None,
            )
        except Exception:
            logger.exception("Unexpected error updating pipeline settings")
            return UpdatePipelineSettingsMutation(
                ok=False,
                message="An unexpected error occurred while updating pipeline settings.",
                pipeline_settings=None,
            )


class ResetPipelineSettingsMutation(graphene.Mutation):
    """
    Reset pipeline settings to Django settings defaults.

    This mutation resets all pipeline settings to their default values from
    Django settings (PREFERRED_PARSERS, PREFERRED_EMBEDDERS, etc.).

    Only superusers can perform this operation.
    """

    ok = graphene.Boolean()
    message = graphene.String()
    pipeline_settings = graphene.Field(PipelineSettingsType)

    @login_required
    @graphql_ratelimit(rate=RateLimits.WRITE_LIGHT)
    def mutate(root, info):
        """Reset pipeline settings to Django settings defaults."""
        from django.conf import settings as django_settings

        from opencontractserver.documents.models import PipelineSettings

        user = info.context.user

        # SECURITY: Only superusers can reset pipeline settings
        if not user.is_superuser:
            return ResetPipelineSettingsMutation(
                ok=False,
                message="Only superusers can reset pipeline settings.",
                pipeline_settings=None,
            )

        try:
            settings_instance = PipelineSettings.get_instance()

            # Reset to Django settings defaults
            settings_instance.preferred_parsers = getattr(
                django_settings, "PREFERRED_PARSERS", {}
            )
            settings_instance.preferred_embedders = getattr(
                django_settings, "PREFERRED_EMBEDDERS", {}
            )
            settings_instance.preferred_thumbnailers = {}
            settings_instance.parser_kwargs = getattr(
                django_settings, "PARSER_KWARGS", {}
            )
            settings_instance.component_settings = getattr(
                django_settings, "PIPELINE_SETTINGS", {}
            )
            settings_instance.default_embedder = getattr(
                django_settings, "DEFAULT_EMBEDDER", ""
            )
            settings_instance.modified_by = user
            settings_instance.save()

            logger.info(f"Pipeline settings reset to defaults by {user.username}")

            return ResetPipelineSettingsMutation(
                ok=True,
                message="Pipeline settings reset to defaults successfully.",
                pipeline_settings=PipelineSettingsType(
                    preferred_parsers=settings_instance.preferred_parsers or {},
                    preferred_embedders=settings_instance.preferred_embedders or {},
                    preferred_thumbnailers=settings_instance.preferred_thumbnailers
                    or {},
                    parser_kwargs=settings_instance.parser_kwargs or {},
                    component_settings=settings_instance.component_settings or {},
                    default_embedder=settings_instance.default_embedder or "",
                    components_with_secrets=list(
                        settings_instance.get_secrets().keys()
                    ),
                    modified=settings_instance.modified,
                    modified_by=settings_instance.modified_by,
                ),
            )

        except (ValidationError, ValueError) as e:
            return ResetPipelineSettingsMutation(
                ok=False,
                message=f"Failed to reset pipeline settings: {e}",
                pipeline_settings=None,
            )
        except Exception:
            logger.exception("Unexpected error resetting pipeline settings")
            return ResetPipelineSettingsMutation(
                ok=False,
                message="An unexpected error occurred while resetting pipeline settings.",
                pipeline_settings=None,
            )


class UpdateComponentSecretsMutation(graphene.Mutation):
    """
    Update encrypted secrets for a specific pipeline component.

    This mutation allows superusers to securely store API keys, tokens, and
    other credentials for pipeline components. The secrets are encrypted at
    rest using Fernet symmetric encryption.

    Only superusers can perform this operation.

    Arguments:
        component_path: Full class path of the component (e.g.,
            'opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParseParser')
        secrets: Dict of secret key-value pairs to store (e.g., {'api_key': '...'})
        merge: If True, merge with existing secrets. If False, replace all secrets
            for this component. Default: True

    Returns:
        ok: Whether the update succeeded
        message: Status message
        components_with_secrets: List of component paths that have secrets stored
    """

    class Arguments:
        component_path = graphene.String(
            required=True,
            description="Full class path of the component.",
        )
        secrets = GenericScalar(
            required=True,
            description="Dict of secret key-value pairs to store. "
            "Example: {'api_key': 'sk-...', 'secret_token': '...'}",
        )
        merge = graphene.Boolean(
            required=False,
            default_value=True,
            description="If True, merge with existing secrets. "
            "If False, replace all secrets for this component.",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    components_with_secrets = graphene.List(
        graphene.String,
        description="List of component paths that have secrets stored.",
    )

    @login_required
    @graphql_ratelimit(rate=RateLimits.WRITE_LIGHT)
    def mutate(root, info, component_path, secrets, merge=True):
        """Update encrypted secrets for a component."""
        from opencontractserver.documents.models import PipelineSettings

        user = info.context.user

        # SECURITY: Only superusers can update secrets
        if not user.is_superuser:
            return UpdateComponentSecretsMutation(
                ok=False,
                message="Only superusers can update component secrets.",
                components_with_secrets=None,
            )

        # Validate component path
        error = validate_component_path(component_path)
        if error:
            return UpdateComponentSecretsMutation(
                ok=False, message=error, components_with_secrets=None
            )

        # Validate secrets structure
        error = validate_secrets_input(secrets)
        if error:
            return UpdateComponentSecretsMutation(
                ok=False, message=error, components_with_secrets=None
            )

        try:
            settings_instance = PipelineSettings.get_instance()

            if merge:
                # Merge with existing secrets
                settings_instance.update_secrets(component_path, secrets)
            else:
                # Replace all secrets for this component
                all_secrets = settings_instance.get_secrets()
                all_secrets[component_path] = secrets
                settings_instance.set_secrets(all_secrets)

            settings_instance.modified_by = user
            settings_instance.save()

            # Return list of components that have secrets (don't return actual secrets)
            all_secrets = settings_instance.get_secrets()
            components_with_secrets = list(all_secrets.keys())

            logger.info(
                "Secrets updated for component '%s' by %s (keys=%s, merge=%s)",
                component_path,
                user.username,
                ", ".join(secrets.keys()),
                merge,
            )

            return UpdateComponentSecretsMutation(
                ok=True,
                message=f"Secrets updated successfully for '{component_path}'.",
                components_with_secrets=components_with_secrets,
            )

        except ValueError as e:
            return UpdateComponentSecretsMutation(
                ok=False,
                message=f"Failed to update secrets: {e}",
                components_with_secrets=None,
            )
        except Exception:
            logger.exception("Unexpected error updating component secrets")
            return UpdateComponentSecretsMutation(
                ok=False,
                message="An unexpected error occurred while updating secrets.",
                components_with_secrets=None,
            )


class DeleteComponentSecretsMutation(graphene.Mutation):
    """
    Delete all encrypted secrets for a specific pipeline component.

    Only superusers can perform this operation.

    Arguments:
        component_path: Full class path of the component

    Returns:
        ok: Whether the deletion succeeded
        message: Status message
        components_with_secrets: Updated list of component paths that have secrets
    """

    class Arguments:
        component_path = graphene.String(
            required=True,
            description="Full class path of the component.",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    components_with_secrets = graphene.List(graphene.String)

    @login_required
    @graphql_ratelimit(rate=RateLimits.WRITE_LIGHT)
    def mutate(root, info, component_path):
        """Delete all secrets for a component."""
        from opencontractserver.documents.models import PipelineSettings

        user = info.context.user

        # SECURITY: Only superusers can delete secrets
        if not user.is_superuser:
            return DeleteComponentSecretsMutation(
                ok=False,
                message="Only superusers can delete component secrets.",
                components_with_secrets=None,
            )

        try:
            settings_instance = PipelineSettings.get_instance()
            settings_instance.delete_component_secrets(component_path)
            settings_instance.modified_by = user
            settings_instance.save()

            # Return updated list of components with secrets
            all_secrets = settings_instance.get_secrets()
            components_with_secrets = list(all_secrets.keys())

            logger.info(
                f"Secrets deleted for component '{component_path}' by {user.username}"
            )

            return DeleteComponentSecretsMutation(
                ok=True,
                message=f"Secrets deleted for '{component_path}'.",
                components_with_secrets=components_with_secrets,
            )

        except Exception:
            logger.exception("Unexpected error deleting component secrets")
            return DeleteComponentSecretsMutation(
                ok=False,
                message="An unexpected error occurred while deleting secrets.",
                components_with_secrets=None,
            )
