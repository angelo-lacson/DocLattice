"""
GraphQL mutations for IngestionSource CRUD operations.
"""

import logging

import graphene
from graphene.types.generic import GenericScalar
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.document_types import IngestionSourceType, IngestionSourceTypeEnum
from opencontractserver.documents.models import IngestionSource
from opencontractserver.utils.permissioning import (
    PermissionTypes,
    set_permissions_for_obj_to_user,
)

logger = logging.getLogger(__name__)


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

        # Check for duplicate name
        if IngestionSource.objects.filter(creator=user, name=name).exists():
            return CreateIngestionSourceMutation(
                ok=False,
                message=f"An ingestion source named '{name}' already exists",
                ingestion_source=None,
            )

        source = IngestionSource.objects.create(
            name=name,
            source_type=source_type or "manual",
            config=config or {},
            creator=user,
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
        _, pk = from_global_id(id)

        try:
            source = IngestionSource.objects.get(pk=pk, creator=user)
        except IngestionSource.DoesNotExist:
            return UpdateIngestionSourceMutation(
                ok=False,
                message="Ingestion source not found",
                ingestion_source=None,
            )

        # Check name uniqueness if being changed
        new_name = kwargs.get("name")
        if new_name and new_name != source.name:
            if IngestionSource.objects.filter(creator=user, name=new_name).exists():
                return UpdateIngestionSourceMutation(
                    ok=False,
                    message=f"An ingestion source named '{new_name}' already exists",
                    ingestion_source=None,
                )

        update_fields = []
        for field in ("name", "source_type", "config", "active"):
            if field in kwargs and kwargs[field] is not None:
                setattr(source, field, kwargs[field])
                update_fields.append(field)

        if update_fields:
            source.save(update_fields=update_fields)

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
        _, pk = from_global_id(id)

        try:
            source = IngestionSource.objects.get(pk=pk, creator=user)
        except IngestionSource.DoesNotExist:
            return DeleteIngestionSourceMutation(
                ok=False,
                message="Ingestion source not found",
            )

        source.delete()
        return DeleteIngestionSourceMutation(ok=True, message="Success")
