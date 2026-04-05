"""
GraphQL mutations for IngestionSource CRUD operations.
"""

import logging

import graphene
from django.db import IntegrityError
from graphene.types.generic import GenericScalar
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.document_types import IngestionSourceType, IngestionSourceTypeEnum
from opencontractserver.documents.models import (
    IngestionSource,
    IngestionSourceCategory,
)
from opencontractserver.utils.permissioning import (
    PermissionTypes,
    set_permissions_for_obj_to_user,
)

logger = logging.getLogger(__name__)

EXPECTED_GLOBAL_ID_TYPE = "IngestionSourceType"


class CreateIngestionSourceMutation(graphene.Mutation):
    """Create a new ingestion source for document lineage tracking."""

    class Arguments:
        name = graphene.String(
            required=True,
            description="Human-readable name (e.g. 'alpha_site_crawler')",
        )
        source_type = IngestionSourceTypeEnum(
            required=False,
            description="Category of source (default: MANUAL)",
        )
        config = GenericScalar(
            required=False,
            description="Connection details, schedule, etc.",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    ingestion_source = graphene.Field(IngestionSourceType)

    @login_required
    def mutate(root, info, name, source_type=None, config=None):
        user = info.context.user

        # Coerce graphene Enum to its string value so the in-memory object
        # holds a plain string that graphene-django can serialize.
        resolved_type = (
            source_type.value
            if hasattr(source_type, "value")
            else IngestionSourceCategory.MANUAL
        )

        # Use try/except around create() instead of exists() + create()
        # to avoid TOCTOU race condition with the unique constraint.
        try:
            source = IngestionSource.objects.create(
                name=name,
                source_type=resolved_type,
                config=config or {},
                creator=user,
            )
        except IntegrityError:
            return CreateIngestionSourceMutation(
                ok=False,
                message=f"An ingestion source named '{name}' already exists",
                ingestion_source=None,
            )

        set_permissions_for_obj_to_user(user, source, [PermissionTypes.CRUD])

        return CreateIngestionSourceMutation(
            ok=True,
            message="Success",
            ingestion_source=source,
        )


class UpdateIngestionSourceMutation(graphene.Mutation):
    """Update an existing ingestion source."""

    class Arguments:
        id = graphene.ID(required=True)
        name = graphene.String(required=False)
        source_type = IngestionSourceTypeEnum(required=False)
        config = GenericScalar(required=False)
        active = graphene.Boolean(required=False)

    ok = graphene.Boolean()
    message = graphene.String()
    ingestion_source = graphene.Field(IngestionSourceType)

    @login_required
    def mutate(root, info, id, **kwargs):
        user = info.context.user
        type_name, pk = from_global_id(id)

        if type_name != EXPECTED_GLOBAL_ID_TYPE:
            return UpdateIngestionSourceMutation(
                ok=False,
                message="Ingestion source not found",
                ingestion_source=None,
            )

        try:
            source = IngestionSource.objects.get(pk=pk, creator=user)
        except IngestionSource.DoesNotExist:
            return UpdateIngestionSourceMutation(
                ok=False,
                message="Ingestion source not found",
                ingestion_source=None,
            )

        # Coerce graphene Enum to its string value for source_type
        if "source_type" in kwargs and kwargs["source_type"] is not None:
            st = kwargs["source_type"]
            kwargs["source_type"] = st.value if hasattr(st, "value") else st

        # Note: the `is not None` guard means callers cannot set config to
        # None (to clear config, pass config={} instead).  Boolean fields
        # like `active` work correctly because `False is not None` is True.
        update_fields = []
        for field in ("name", "source_type", "config", "active"):
            if field in kwargs and kwargs[field] is not None:
                setattr(source, field, kwargs[field])
                update_fields.append(field)

        if update_fields:
            # Use try/except around save() instead of a pre-flight exists()
            # check to avoid TOCTOU race on the unique (creator, name)
            # constraint — consistent with CreateIngestionSourceMutation.
            try:
                source.save(update_fields=update_fields)
            except IntegrityError:
                new_name = kwargs.get("name", source.name)
                return UpdateIngestionSourceMutation(
                    ok=False,
                    message=f"An ingestion source named '{new_name}' already exists",
                    ingestion_source=None,
                )

        return UpdateIngestionSourceMutation(
            ok=True,
            message="Success",
            ingestion_source=source,
        )


class DeleteIngestionSourceMutation(graphene.Mutation):
    """Delete an ingestion source. Existing DocumentPath references become NULL."""

    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, id):
        user = info.context.user
        type_name, pk = from_global_id(id)

        if type_name != EXPECTED_GLOBAL_ID_TYPE:
            return DeleteIngestionSourceMutation(
                ok=False,
                message="Ingestion source not found",
            )

        try:
            source = IngestionSource.objects.get(pk=pk, creator=user)
        except IngestionSource.DoesNotExist:
            return DeleteIngestionSourceMutation(
                ok=False,
                message="Ingestion source not found",
            )

        source.delete()
        return DeleteIngestionSourceMutation(ok=True, message="Success")
