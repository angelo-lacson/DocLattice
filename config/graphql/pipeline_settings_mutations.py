"""
GraphQL mutations for the pipeline settings system.

Superuser-only mutations to configure document processing pipeline at runtime.
"""

import logging

import graphene
from graphene.types.generic import GenericScalar
from graphql_jwt.decorators import login_required

from config.graphql.graphene_types import PipelineSettingsType
from config.graphql.ratelimits import RateLimits, graphql_ratelimit

logger = logging.getLogger(__name__)


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

            # Validate preferred_parsers if provided
            if preferred_parsers is not None:
                if not isinstance(preferred_parsers, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="preferred_parsers must be a dictionary.",
                        pipeline_settings=None,
                    )
                # Validate parser class paths exist in registry
                for mimetype, parser_path in preferred_parsers.items():
                    if not registry.get_by_class_name(parser_path):
                        return UpdatePipelineSettingsMutation(
                            ok=False,
                            message=f"Parser '{parser_path}' not found in registry.",
                            pipeline_settings=None,
                        )
                settings_instance.preferred_parsers = preferred_parsers

            # Validate preferred_embedders if provided
            if preferred_embedders is not None:
                if not isinstance(preferred_embedders, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="preferred_embedders must be a dictionary.",
                        pipeline_settings=None,
                    )
                # Validate embedder class paths exist in registry
                for mimetype, embedder_path in preferred_embedders.items():
                    if not registry.get_by_class_name(embedder_path):
                        return UpdatePipelineSettingsMutation(
                            ok=False,
                            message=f"Embedder '{embedder_path}' not found in registry.",
                            pipeline_settings=None,
                        )
                settings_instance.preferred_embedders = preferred_embedders

            # Validate preferred_thumbnailers if provided
            if preferred_thumbnailers is not None:
                if not isinstance(preferred_thumbnailers, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="preferred_thumbnailers must be a dictionary.",
                        pipeline_settings=None,
                    )
                # Validate thumbnailer class paths exist in registry
                for mimetype, thumbnailer_path in preferred_thumbnailers.items():
                    if not registry.get_by_class_name(thumbnailer_path):
                        return UpdatePipelineSettingsMutation(
                            ok=False,
                            message=f"Thumbnailer '{thumbnailer_path}' not found in registry.",
                            pipeline_settings=None,
                        )
                settings_instance.preferred_thumbnailers = preferred_thumbnailers

            # Validate parser_kwargs if provided
            if parser_kwargs is not None:
                if not isinstance(parser_kwargs, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="parser_kwargs must be a dictionary.",
                        pipeline_settings=None,
                    )
                settings_instance.parser_kwargs = parser_kwargs

            # Validate component_settings if provided
            if component_settings is not None:
                if not isinstance(component_settings, dict):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message="component_settings must be a dictionary.",
                        pipeline_settings=None,
                    )
                settings_instance.component_settings = component_settings

            # Validate default_embedder if provided
            if default_embedder is not None:
                if default_embedder and not registry.get_by_class_name(default_embedder):
                    return UpdatePipelineSettingsMutation(
                        ok=False,
                        message=f"Default embedder '{default_embedder}' not found in registry.",
                        pipeline_settings=None,
                    )
                settings_instance.default_embedder = default_embedder

            # Record who made the change
            settings_instance.modified_by = user
            settings_instance.save()

            logger.info(
                f"Pipeline settings updated by {user.username} (superuser={user.is_superuser})"
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
                    modified=settings_instance.modified,
                    modified_by=settings_instance.modified_by,
                ),
            )

        except Exception as e:
            logger.exception("Error updating pipeline settings")
            return UpdatePipelineSettingsMutation(
                ok=False,
                message=f"Failed to update pipeline settings: {str(e)}",
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
                    modified=settings_instance.modified,
                    modified_by=settings_instance.modified_by,
                ),
            )

        except Exception as e:
            logger.exception("Error resetting pipeline settings")
            return ResetPipelineSettingsMutation(
                ok=False,
                message=f"Failed to reset pipeline settings: {str(e)}",
                pipeline_settings=None,
            )
