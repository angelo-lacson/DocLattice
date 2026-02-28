"""
GraphQL query mixin for extract, fieldset, column, and datacell queries.

Also contains helper types MetadataCompletionStatusType and DocumentMetadataResultType
which are used by extract/metadata queries.
"""

import inspect
import logging

import graphene
from django.conf import settings
from graphene import relay
from graphene.types.generic import GenericScalar
from graphene_django.filter import DjangoFilterConnectionField
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.filters import (
    AnalysisFilter,
    AnalyzerFilter,
    ColumnFilter,
    DatacellFilter,
    ExtractFilter,
    FieldsetFilter,
    GremlinEngineFilter,
)
from config.graphql.graphene_types import (
    AnalysisType,
    AnalyzerType,
    ColumnType,
    DatacellType,
    ExtractType,
    FieldsetType,
    GremlinEngineType_READ,
)
from config.graphql.ratelimits import get_user_tier_rate, graphql_ratelimit_dynamic
from opencontractserver.analyzer.models import Analyzer, GremlinEngine
from opencontractserver.extracts.models import Column, Datacell, Fieldset

logger = logging.getLogger(__name__)


class MetadataCompletionStatusType(graphene.ObjectType):
    """Type for metadata completion status information."""

    total_fields = graphene.Int()
    filled_fields = graphene.Int()
    missing_fields = graphene.Int()
    percentage = graphene.Float()
    missing_required = graphene.List(graphene.String)


class DocumentMetadataResultType(graphene.ObjectType):
    """Type for batch metadata query results - groups datacells by document."""

    document_id = graphene.ID(description="The document's global ID")
    datacells = graphene.List(
        DatacellType, description="Metadata datacells for this document"
    )


class ExtractQueryMixin:
    """Query fields and resolvers for extract, fieldset, column, datacell, and analyzer queries."""

    fieldset = relay.Node.Field(FieldsetType)

    def resolve_fieldset(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        return Fieldset.objects.visible_to_user(info.context.user).get(id=django_pk)

    fieldsets = DjangoFilterConnectionField(
        FieldsetType, filterset_class=FieldsetFilter
    )

    def resolve_fieldsets(self, info, **kwargs):
        return Fieldset.objects.visible_to_user(info.context.user)

    column = relay.Node.Field(ColumnType)

    def resolve_column(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        return Column.objects.visible_to_user(info.context.user).get(id=django_pk)

    columns = DjangoFilterConnectionField(ColumnType, filterset_class=ColumnFilter)

    def resolve_columns(self, info, **kwargs):
        return Column.objects.visible_to_user(info.context.user)

    extract = relay.Node.Field(ExtractType)

    def resolve_extract(self, info, **kwargs):
        from opencontractserver.annotations.query_optimizer import ExtractQueryOptimizer

        django_pk = from_global_id(kwargs.get("id", None))[1]
        has_perm, extract = ExtractQueryOptimizer.check_extract_permission(
            info.context.user, int(django_pk)
        )
        return extract if has_perm else None

    extracts = DjangoFilterConnectionField(
        ExtractType, filterset_class=ExtractFilter, max_limit=15
    )

    def resolve_extracts(self, info, **kwargs):
        from opencontractserver.annotations.query_optimizer import ExtractQueryOptimizer

        corpus_id = kwargs.get("corpus_id")
        if corpus_id:
            corpus_django_pk = int(from_global_id(corpus_id)[1])
        else:
            corpus_django_pk = None

        return ExtractQueryOptimizer.get_visible_extracts(
            info.context.user, corpus_id=corpus_django_pk
        )

    datacell = relay.Node.Field(DatacellType)

    def resolve_datacell(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        return Datacell.objects.visible_to_user(info.context.user).get(id=django_pk)

    datacells = DjangoFilterConnectionField(
        DatacellType, filterset_class=DatacellFilter
    )

    def resolve_datacells(self, info, **kwargs):
        return Datacell.objects.visible_to_user(info.context.user)

    registered_extract_tasks = graphene.Field(GenericScalar)

    @login_required
    def resolve_registered_extract_tasks(self, info, **kwargs):
        from config import celery_app

        tasks = {}

        # Try to get tasks from the app instance
        # Get tasks from the app instance
        try:
            for task_name, task in celery_app.tasks.items():
                if not task_name.startswith("celery."):
                    docstring = inspect.getdoc(task.run) or "No docstring available"
                    tasks[task_name] = docstring

        except AttributeError as e:
            logger.warning(f"Couldn't get tasks from app instance: {str(e)}")

        # Filter out Celery's internal tasks
        return {
            task: description
            for task, description in tasks.items()
            if task.startswith("opencontractserver.tasks.data_extract_tasks")
        }

    # METADATA QUERIES (Column/Datacell based) ################################
    document_metadata_datacells = graphene.List(
        DatacellType,
        document_id=graphene.ID(required=True),
        corpus_id=graphene.ID(required=True),
        description="Get metadata datacells for a document in a corpus",
    )

    metadata_completion_status_v2 = graphene.Field(
        MetadataCompletionStatusType,
        document_id=graphene.ID(required=True),
        corpus_id=graphene.ID(required=True),
        description="Get metadata completion status for a document using column/datacell system",
    )

    documents_metadata_datacells_batch = graphene.List(
        DocumentMetadataResultType,
        document_ids=graphene.List(graphene.ID, required=True),
        corpus_id=graphene.ID(required=True),
        description="Get metadata datacells for multiple documents in a single query (batch)",
    )

    def resolve_document_metadata_datacells(self, info, document_id, corpus_id):
        """Get metadata datacells for a document using MetadataQueryOptimizer."""
        from opencontractserver.extracts.query_optimizer import MetadataQueryOptimizer

        user = info.context.user
        local_doc_id = int(from_global_id(document_id)[1])
        local_corpus_id = int(from_global_id(corpus_id)[1])

        return MetadataQueryOptimizer.get_document_metadata(
            user, local_doc_id, local_corpus_id, manual_only=True
        )

    def resolve_metadata_completion_status_v2(self, info, document_id, corpus_id):
        """Get metadata completion status using MetadataQueryOptimizer."""
        from opencontractserver.extracts.query_optimizer import MetadataQueryOptimizer

        user = info.context.user
        local_doc_id = int(from_global_id(document_id)[1])
        local_corpus_id = int(from_global_id(corpus_id)[1])

        return MetadataQueryOptimizer.get_metadata_completion_status(
            user, local_doc_id, local_corpus_id
        )

    def resolve_documents_metadata_datacells_batch(self, info, document_ids, corpus_id):
        """
        Get metadata datacells for multiple documents using MetadataQueryOptimizer.

        This batch query solves the N+1 problem when loading metadata for a grid view.
        Uses the centralized MetadataQueryOptimizer which applies proper permission
        filtering: Effective Permission = MIN(document_permission, corpus_permission)
        """
        from opencontractserver.extracts.query_optimizer import MetadataQueryOptimizer

        user = info.context.user
        local_corpus_id = int(from_global_id(corpus_id)[1])

        # Convert global IDs to local IDs (single pass)
        local_doc_ids = []
        local_id_by_global = {}  # global_id -> local_id
        for global_id in document_ids:
            _, local_id = from_global_id(global_id)
            local_id_int = int(local_id)
            local_doc_ids.append(local_id_int)
            local_id_by_global[global_id] = local_id_int

        # Use optimizer to get batch metadata with proper permissions
        datacells_by_doc = MetadataQueryOptimizer.get_documents_metadata_batch(
            user,
            local_doc_ids,
            local_corpus_id,
            manual_only=True,
            context=info.context,
        )

        # Build response - maintain order of requested document_ids
        # The optimizer returns a dict with keys for all readable documents,
        # so we only include documents the user has permission to read
        results = []
        for global_id in document_ids:
            local_id = local_id_by_global[global_id]

            # Only include documents that are in the result (user has permission)
            if local_id in datacells_by_doc:
                results.append(
                    {
                        "document_id": global_id,
                        "datacells": datacells_by_doc[local_id],
                    }
                )

        return results

    # CONDITIONAL ANALYZER FIELDS #####################################
    # These are conditionally defined based on settings.USE_ANALYZER
    if settings.USE_ANALYZER:

        # GREMLIN ENGINE RESOLVERS #####################################
        gremlin_engine = relay.Node.Field(GremlinEngineType_READ)

        def resolve_gremlin_engine(self, info, **kwargs):
            django_pk = from_global_id(kwargs.get("id", None))[1]
            return GremlinEngine.objects.visible_to_user(info.context.user).get(
                id=django_pk
            )

        gremlin_engines = DjangoFilterConnectionField(
            GremlinEngineType_READ, filterset_class=GremlinEngineFilter
        )

        def resolve_gremlin_engines(self, info, **kwargs):
            return GremlinEngine.objects.visible_to_user(info.context.user)

        # ANALYZER RESOLVERS #####################################
        analyzer = relay.Node.Field(AnalyzerType)

        def resolve_analyzer(self, info, **kwargs):

            if kwargs.get("id", None) is not None:
                django_pk = from_global_id(kwargs.get("id", None))[1]
            elif kwargs.get("analyzerId", None) is not None:
                django_pk = kwargs.get("analyzerId", None)
            else:
                return None

            return Analyzer.objects.visible_to_user(info.context.user).get(id=django_pk)

        analyzers = DjangoFilterConnectionField(
            AnalyzerType, filterset_class=AnalyzerFilter
        )

        def resolve_analyzers(self, info, **kwargs):
            return Analyzer.objects.visible_to_user(info.context.user)

        # ANALYSIS RESOLVERS #####################################
        analysis = relay.Node.Field(AnalysisType)

        def resolve_analysis(self, info, **kwargs):
            from opencontractserver.annotations.query_optimizer import (
                AnalysisQueryOptimizer,
            )

            django_pk = from_global_id(kwargs.get("id", None))[1]
            has_perm, analysis = AnalysisQueryOptimizer.check_analysis_permission(
                info.context.user, int(django_pk)
            )
            return analysis if has_perm else None

        analyses = DjangoFilterConnectionField(
            AnalysisType, filterset_class=AnalysisFilter
        )

        @graphql_ratelimit_dynamic(get_rate=get_user_tier_rate("READ_MEDIUM"))
        def resolve_analyses(self, info, **kwargs):
            from opencontractserver.annotations.query_optimizer import (
                AnalysisQueryOptimizer,
            )

            corpus_id = kwargs.get("corpus_id")
            if corpus_id:
                corpus_django_pk = int(from_global_id(corpus_id)[1])
            else:
                corpus_django_pk = None

            return AnalysisQueryOptimizer.get_visible_analyses(
                info.context.user, corpus_id=corpus_django_pk
            )
