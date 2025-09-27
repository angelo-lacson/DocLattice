"""
Progressive loading GraphQL types for optimized data fetching.
"""

from typing import Optional

import graphene
from graphql_relay import from_global_id

from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer


class AnnotationSummaryType(graphene.ObjectType):
    """
    Lightweight summary statistics for annotations.
    Uses materialized views for instant response.
    """

    document_id = graphene.ID(required=True)
    corpus_id = graphene.ID(required=True)
    annotation_count = graphene.Int()
    structural_count = graphene.Int()
    user_annotation_count = graphene.Int()
    analysis_count = graphene.Int()
    page_count = graphene.Int()
    pages_with_annotations = graphene.List(graphene.Int)
    first_page = graphene.Int()
    last_page = graphene.Int()
    source = graphene.String()  # 'materialized_view' or 'direct_query'
    last_refreshed = graphene.DateTime()

    @classmethod
    def resolve_for_document(cls, document_id: int, corpus_id: int, user=None):
        """
        Resolve summary statistics for a document with permission filtering.
        """
        summary = AnnotationQueryOptimizer.get_annotation_summary(
            document_id=document_id, corpus_id=corpus_id, user=user
        )

        return cls(document_id=document_id, corpus_id=corpus_id, **summary)


class AnnotationNavigationType(graphene.ObjectType):
    """
    Lightweight annotation data for navigation/jumping.
    """

    id = graphene.ID(required=True)
    page = graphene.Int(required=True)
    bounding_box = graphene.JSONString()

    @classmethod
    def resolve_for_document(
        cls,
        document_id: int,
        corpus_id: int,
        user=None,
        analysis_id: Optional[int] = None,
    ):
        """
        Get navigation data for document annotations with permission filtering.
        """
        nav_data = AnnotationQueryOptimizer.get_navigation_annotations(
            document_id=document_id,
            corpus_id=corpus_id,
            user=user,
            analysis_id=analysis_id,
        )

        results = []
        for item in nav_data:
            if isinstance(item, dict):
                results.append(cls(**item))
            else:
                # Django model instance
                results.append(
                    cls(id=item.id, page=item.page, bounding_box=item.bounding_box)
                )

        return results


class DocumentProgressiveType(graphene.ObjectType):
    """
    Progressive loading fields for documents.
    These fields load data on-demand rather than eagerly.
    """

    id = graphene.ID(required=True)

    # Quick summary (uses materialized view)
    annotation_summary = graphene.Field(
        AnnotationSummaryType,
        corpus_id=graphene.ID(required=True),
        description="Get annotation statistics from materialized view",
    )

    def resolve_annotation_summary(self, info, corpus_id):
        """
        Resolve annotation summary using materialized view.
        """
        _, corpus_pk = from_global_id(corpus_id)
        return AnnotationSummaryType.resolve_for_document(
            document_id=self.id, corpus_id=corpus_pk
        )

    # Navigation data (lightweight)
    annotation_navigation = graphene.List(
        AnnotationNavigationType,
        corpus_id=graphene.ID(required=True),
        analysis_id=graphene.ID(),
        description="Get lightweight annotation data for navigation",
    )

    def resolve_annotation_navigation(self, info, corpus_id, analysis_id=None):
        """
        Resolve navigation annotations.
        """
        _, corpus_pk = from_global_id(corpus_id)
        analysis_pk = None
        if analysis_id:
            _, analysis_pk = from_global_id(analysis_id)

        return AnnotationNavigationType.resolve_for_document(
            document_id=self.id, corpus_id=corpus_pk, analysis_id=analysis_pk
        )

    # Page-specific annotations (uses indexes)
    page_annotations = graphene.List(
        "config.graphql.graphene_types.AnnotationType",
        corpus_id=graphene.ID(required=True),
        page=graphene.Int(required=True),
        structural=graphene.Boolean(),
        analysis_id=graphene.ID(),
        description="Get annotations for a specific page",
    )

    def resolve_page_annotations(
        self, info, corpus_id, page, structural=None, analysis_id=None
    ):
        """
        Resolve annotations for a specific page.
        Uses optimized queries with indexes.
        """
        _, corpus_pk = from_global_id(corpus_id)
        analysis_pk = None
        if analysis_id:
            _, analysis_pk = from_global_id(analysis_id)

        return AnnotationQueryOptimizer.get_document_annotations(
            document_id=self.id,
            corpus_id=corpus_pk,
            pages=[page] if page is not None else None,  # Convert single page to list
            structural=structural,
            analysis_id=analysis_pk,
            use_cache=True,
        )


## Materialized view monitoring removed per cache-v2 plan.
