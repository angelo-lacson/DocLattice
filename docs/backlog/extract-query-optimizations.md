# Extract-Based Annotation Filtering Optimizations

## Overview

This document outlines the implementation plan for adding extract-based filtering to the OpenContracts annotation performance optimizations. This builds upon the existing optimization patterns used for analysis filtering while accounting for the unique M2M relationship between Extracts and Annotations via Datacells.

**Implementation Status**: This is a greenfield implementation. While the Datacell model and M2M relationships exist (added in migration `0010_datacell_sources.py`), none of the extract-based filtering logic, materialized views, or optimization code has been implemented yet.

## Key Architecture Points

### Current State
- Annotations can be filtered by `analysis_id` (ForeignKey to Analysis model)
- Datacells have a ManyToMany relationship with Annotations via `sources` field
- No direct relationship between Annotation and Extract models
- Existing optimizations support filtering by analysis_id with dedicated indexes
- Frontend uses mixed types in GraphQL: `String!` for documentId, `ID!` for corpusId, `ID` for analysisId

### Extract-Annotation Relationship
- `Datacell.sources` → ManyToMany → `Annotation` (via `referencing_cells` related name)
- Each Extract has multiple Datacells
- Annotations referenced by extract datacells are the ones "used for extracts"

### Filter Combination Semantics
- When both `analysisId` and `extractId` are provided, apply intersection (AND) logic
- This allows queries like "show annotations from this analysis that were used in this extract"
- Structural annotations are included by default when document is accessible
- Set `structural=false` to explicitly exclude structural annotations/relationships
- Set `structural=true` to show ONLY structural annotations/relationships
- Set `structural=null` (or omit) to show both structural and non-structural (default)

## Implementation Plan

### Phase 1: Database Optimization

#### Migration 0040: Optimized Indexes for Extract Filtering
```python
# opencontractserver/extracts/migrations/0021_add_extract_filtering_indexes.py

class Migration(migrations.Migration):
    atomic = False  # Enable CONCURRENTLY

    operations = [
        migrations.RunSQL(
            """
            -- Primary index for datacell lookups by extract and document
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datacell_extract_document_id
            ON extracts_datacell(extract_id, document_id, id);
            """,
            reverse_sql="DROP INDEX IF EXISTS idx_datacell_extract_document_id;"
        ),
        migrations.RunSQL(
            """
            -- Forward M2M join: datacell -> annotations
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datacell_sources_forward
            ON extracts_datacell_sources(datacell_id, annotation_id);
            """,
            reverse_sql="DROP INDEX IF EXISTS idx_datacell_sources_forward;"
        ),
        migrations.RunSQL(
            """
            -- Reverse M2M join: annotation -> datacells (for invalidation and reverse lookups)
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datacell_sources_reverse
            ON extracts_datacell_sources(annotation_id, datacell_id);
            """,
            reverse_sql="DROP INDEX IF EXISTS idx_datacell_sources_reverse;"
        ),
        migrations.RunSQL(
            """
            -- Optional: Add uniqueness constraint to prevent duplicate M2M entries
            ALTER TABLE extracts_datacell_sources
            ADD CONSTRAINT unique_datacell_annotation
            UNIQUE (datacell_id, annotation_id);
            """,
            reverse_sql="ALTER TABLE extracts_datacell_sources DROP CONSTRAINT IF EXISTS unique_datacell_annotation;"
        ),
        migrations.RunSQL(
            """
            -- Optional: Index for document-only queries
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datacell_document
            ON extracts_datacell(document_id);
            """,
            reverse_sql="DROP INDEX IF EXISTS idx_datacell_document;"
        ),
    ]
```

#### Migration 0041: Extract-Aware Materialized Views
```python
# opencontractserver/extracts/migrations/0022_add_extract_materialized_views.py

class Migration(migrations.Migration):
    atomic = False  # Required for CONCURRENT index creation

    operations = [
        migrations.RunSQL(
            """
            -- Dedicated MV for extract annotation mappings (fast lookups)
            CREATE MATERIALIZED VIEW IF NOT EXISTS extract_annotation_mapping_mv AS
            SELECT DISTINCT
                dc.extract_id,
                dc.document_id,
                dcs.annotation_id,
                a.page,
                a.corpus_id
            FROM extracts_datacell dc
            INNER JOIN extracts_datacell_sources dcs ON dc.id = dcs.datacell_id
            INNER JOIN annotations_annotation a ON a.id = dcs.annotation_id
            WHERE dc.extract_id IS NOT NULL
            WITH DATA;

            -- CRITICAL: Unique index required for CONCURRENT refresh
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_extract_annotation_mapping_uniq
            ON extract_annotation_mapping_mv(extract_id, document_id, annotation_id);

            -- Additional indexes for performance
            CREATE INDEX ON extract_annotation_mapping_mv(extract_id, document_id);
            CREATE INDEX ON extract_annotation_mapping_mv(extract_id, document_id, page);

            -- Reverse lookup index for invalidation
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapping_mv_annotation
            ON extract_annotation_mapping_mv(annotation_id);
            """,
            reverse_sql="DROP MATERIALIZED VIEW IF EXISTS extract_annotation_mapping_mv CASCADE;"
        ),
    migrations.RunSQL(
        """
        -- Summary MV for extract statistics
        CREATE MATERIALIZED VIEW IF NOT EXISTS extract_annotation_summary_mv AS
        SELECT
            extract_id,
            document_id,
            COUNT(DISTINCT annotation_id) as annotation_count,
            COUNT(DISTINCT page) as page_count,
            -- Note: array_agg(DISTINCT ... ORDER BY) requires PostgreSQL 9.5+
            -- If not supported, use: (SELECT array_agg(DISTINCT page) FROM (SELECT page FROM extract_annotation_mapping_mv WHERE ... ORDER BY page) s)
            array_agg(DISTINCT page ORDER BY page) as pages_with_extract_annotations,
            MIN(page) as first_page,
            MAX(page) as last_page,
            NOW() as last_refreshed
        FROM extract_annotation_mapping_mv
        GROUP BY extract_id, document_id
        WITH DATA;

        CREATE UNIQUE INDEX ON extract_annotation_summary_mv(extract_id, document_id);
        """,
        reverse_sql="DROP MATERIALIZED VIEW IF EXISTS extract_annotation_summary_mv;"
    ),
]
```

### Phase 2: Query Optimizer Extensions

#### Update AnnotationQueryOptimizer with ORM Joins
```python
# opencontractserver/annotations/query_optimizer.py

import hashlib
import logging
from typing import Optional
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache
from django.db import connection
from django.db.models import Q, QuerySet
from opencontractserver.annotations.models import Annotation

logger = logging.getLogger(__name__)

@classmethod
def get_document_annotations(
    cls,
    document_id: int,
    user=None,
    corpus_id: Optional[int] = None,
    pages: Optional[list[int]] = None,
    structural: Optional[bool] = None,
    analysis_id: Optional[int] = None,
    extract_id: Optional[int] = None,  # NEW
    use_cache: bool = True,
) -> QuerySet:
    """Get optimized queryset with extract filtering support."""
    from opencontractserver.annotations.models import Annotation

    # Check permissions (existing code)
    if not cls._check_document_permission(user, document_id):
        return Annotation.objects.none()

    if corpus_id is not None and not cls._check_corpus_permission(user, corpus_id):
        return Annotation.objects.none()

    # Build cache key with extract_id (hash long keys for safety)
    user_id = str(user.id) if user and hasattr(user, "id") else "anon"
    pages_str = ",".join(map(str, sorted(pages))) if pages else "all"
    analysis_str = f"analysis:{analysis_id}" if analysis_id is not None else "no_analysis"
    extract_str = f"extract:{extract_id}" if extract_id is not None else "no_extract"

    # Hash the key if it's too long (Memcached limit is 250 chars)
    raw_key = f"doc_annotations:{document_id}:{corpus_id}:{pages_str}:{structural}:{analysis_str}:{extract_str}:{user_id}"
    if len(raw_key) > 200:  # Leave margin for safety
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()[:16]
        cache_key = f"doc_ann:{key_hash}"
    else:
        cache_key = raw_key

    if use_cache:
        # Cache annotation IDs, not the QuerySet
        cached_ids = cache.get(cache_key)
        if cached_ids is not None:
            return Annotation.objects.filter(id__in=cached_ids).select_related(
                "annotation_label", "creator"
            ).prefetch_related("user_feedback")

    # Start with base query
    qs = Annotation.objects.filter(document_id=document_id)

    # Apply permission filter
    permission_filter = cls._get_annotation_permission_filter(user)
    qs = qs.filter(permission_filter)

    # Apply filters
    if corpus_id is not None:
        if structural is False:
            # Explicitly exclude structural annotations
            qs = qs.filter(corpus_id=corpus_id, structural=False)
        else:
            # Default: include corpus annotations AND structural (structural=None or True)
            qs = qs.filter(Q(corpus_id=corpus_id) | Q(structural=True))
    else:
        # No corpus specified - only show structural annotations
        if structural is False:
            # User explicitly doesn't want structural, but no corpus - return empty
            return Annotation.objects.none()
        else:
            # Default: show structural annotations
            qs = qs.filter(structural=True)

    if pages is not None and len(pages) > 0:
        qs = qs.filter(page__in=pages)

    # Apply analysis AND extract filters (intersection when both provided)
    if analysis_id is not None:
        if analysis_id == 0:  # User annotations
            qs = qs.filter(analysis_id__isnull=True)
        else:
            qs = qs.filter(analysis_id=analysis_id)

    if extract_id is not None:
        # Use reverse M2M relationship for efficient join
        qs = qs.filter(
            referencing_cells__extract_id=extract_id,
            referencing_cells__document_id=document_id
        )

    # Apply distinct after all filters to remove duplicates from M2M joins
    if extract_id is not None:
        qs = qs.distinct()

    # Optimize with select_related and prefetch
    qs = qs.select_related("annotation_label", "creator").prefetch_related("user_feedback")
    qs = qs.order_by("page", "bounding_box")

    if use_cache:
        # Cache only the IDs, not the QuerySet
        annotation_ids = list(qs.values_list('id', flat=True))
        cache.set(cache_key, annotation_ids, cls.CACHE_TTL)
        cls._register_cache_key(document_id, corpus_id, extract_id, cache_key)

    return qs

@classmethod
def _register_cache_key(cls, document_id, corpus_id, extract_id, cache_key):
    """Register cache key for targeted invalidation."""
    try:
        # Document-level registry
        doc_registry_key = f"doc_annotations:keys:{document_id}"
        doc_registry = cache.get(doc_registry_key) or []
        if cache_key not in doc_registry:
            doc_registry.append(cache_key)
            cache.set(doc_registry_key, doc_registry, cls.CACHE_TTL * 6)

        # Document+corpus registry (if applicable)
        if corpus_id is not None:
            doc_corpus_registry_key = f"doc_annotations:keys:{document_id}:{corpus_id}"
            doc_corpus_registry = cache.get(doc_corpus_registry_key) or []
            if cache_key not in doc_corpus_registry:
                doc_corpus_registry.append(cache_key)
                cache.set(doc_corpus_registry_key, doc_corpus_registry, cls.CACHE_TTL * 6)

        # NEW: Document+extract registry
        if extract_id is not None:
            doc_extract_registry_key = f"doc_annotations:keys:{document_id}:extract:{extract_id}"
            doc_extract_registry = cache.get(doc_extract_registry_key) or []
            if cache_key not in doc_extract_registry:
                doc_extract_registry.append(cache_key)
                cache.set(doc_extract_registry_key, doc_extract_registry, cls.CACHE_TTL * 6)
    except Exception:
        pass

@classmethod
def get_extract_annotation_summary(
    cls,
    document_id: int,
    extract_id: int,
    user=None,
    use_mv: bool = True,
    use_cache: bool = True
) -> dict:
    """Get summary of annotations used in specific extract."""
    # Permission checks
    if not cls._check_document_permission(user, document_id):
        return {
            'extract_id': extract_id,
            'document_id': document_id,
            'annotation_count': 0,
            'pages_with_extract_annotations': [],
            'source': 'permission_denied'
        }

    user_id = user.id if user and hasattr(user, "id") else "anon"
    cache_key = f"extract_annotation_summary:{document_id}:{extract_id}:{user_id}"

    if use_cache:
        cached = cache.get(cache_key)
        if cached:
            return cached

    if use_mv:
        # Try materialized view first
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        annotation_count,
                        page_count,
                        pages_with_extract_annotations,
                        first_page,
                        last_page
                    FROM extract_annotation_summary_mv
                    WHERE extract_id = %s AND document_id = %s
                    """,
                    [extract_id, document_id]
                )

                row = cursor.fetchone()
                if row:
                    summary = {
                        'extract_id': extract_id,
                        'document_id': document_id,
                        'annotation_count': row[0] or 0,
                        'page_count': row[1] or 0,
                        'pages_with_extract_annotations': row[2] or [],
                        'first_page': row[3],
                        'last_page': row[4],
                        'source': 'materialized_view'
                    }
                    cache.set(cache_key, summary, cls.CACHE_TTL)
                    return summary
        except Exception as e:
            logger.warning(f"Failed to query extract MV: {e}")

    # Fallback to direct query using ORM join
    from opencontractserver.annotations.models import Annotation

    annotations = Annotation.objects.filter(
        referencing_cells__extract_id=extract_id,
        referencing_cells__document_id=document_id
    ).distinct()

    # Apply permission filter
    permission_filter = cls._get_annotation_permission_filter(user)
    annotations = annotations.filter(permission_filter)

    pages = annotations.values_list('page', flat=True).distinct().order_by('page')
    pages_list = list(pages)

    summary = {
        'extract_id': extract_id,
        'document_id': document_id,
        'annotation_count': annotations.count(),
        'page_count': len(pages_list),
        'pages_with_extract_annotations': pages_list,
        'first_page': pages_list[0] if pages_list else None,
        'last_page': pages_list[-1] if pages_list else None,
        'source': 'direct_query'
    }

    cache.set(cache_key, summary, cls.CACHE_TTL)
    return summary

@classmethod
def invalidate_extract_cache(cls, document_id: int, extract_id: int):
    """Invalidate caches related to a specific extract."""
    try:
        # Clear extract-specific annotation caches
        doc_extract_registry_key = f"doc_annotations:keys:{document_id}:extract:{extract_id}"
        keys = cache.get(doc_extract_registry_key) or []
        for k in keys:
            cache.delete(k)
        cache.delete(doc_extract_registry_key)

        # Clear extract summaries
        pattern = f"extract_annotation_summary:{document_id}:{extract_id}:*"
        cache.delete_pattern(pattern)
    except AttributeError:
        # Fallback if pattern deletion not supported
        logger.warning("Cache backend doesn't support pattern deletion")


# Extension to RelationshipQueryOptimizer for extract filtering

import hashlib
import logging
from typing import Optional
from django.core.cache import cache
from django.db import connection
from django.db.models import Q, QuerySet, Prefetch
from opencontractserver.annotations.models import Annotation, Relationship

logger = logging.getLogger(__name__)

class RelationshipQueryOptimizer:
    # ... existing class methods ...
    CACHE_TTL = 300  # 5 minutes

    @classmethod
    def _normalize_pages(cls, pages: Optional[list[int]]) -> str:
        """Normalize pages list for cache key generation."""
        if pages is None:
            return "all"
        if len(pages) == 0:
            return "empty"
        return ",".join(str(p) for p in sorted(pages))

    @classmethod
    def get_document_relationships(
        cls,
        document_id: int,
        user=None,
        corpus_id: Optional[int] = None,
        pages: Optional[list[int]] = None,
        structural: Optional[bool] = None,
        analysis_id: Optional[int] = None,
        extract_id: Optional[int] = None,  # NEW
        strict_extract_mode: bool = False,  # NEW
        use_cache: bool = True,
    ) -> QuerySet:
        """
        Get optimized queryset for document relationships with extract filtering.

        Args:
            document_id: Document ID
            user: User object for permission filtering
            corpus_id: Optional corpus ID filter
            pages: Optional list of page numbers to filter
            structural: Optional structural filter
            analysis_id: Optional analysis ID filter
            extract_id: Optional extract ID filter
            strict_extract_mode: If True, both endpoints must be in extract; if False, at least one
            use_cache: Whether to use caching

        Returns:
            Optimized QuerySet (empty if no permission)
        """
        from opencontractserver.annotations.models import Annotation, Relationship

        # Check permissions (existing logic)
        if not cls._check_document_permission(user, document_id):
            return Relationship.objects.none()

        if corpus_id is not None and not cls._check_corpus_permission(user, corpus_id):
            return Relationship.objects.none()

        # Build cache key with extract parameters (hash if too long)
        user_id = str(user.id) if user and hasattr(user, "id") else "anon"
        pages_str = cls._normalize_pages(pages)
        analysis_str = f"analysis:{analysis_id}" if analysis_id is not None else "no_analysis"
        extract_str = f"extract:{extract_id}:{strict_extract_mode}" if extract_id else "no_extract"

        # Hash long keys for cache backend compatibility
        raw_key = f"doc_relationships:{document_id}:{corpus_id}:{pages_str}:{structural}:{analysis_str}:{extract_str}:{user_id}"
        if len(raw_key) > 200:  # Leave margin for safety
            key_hash = hashlib.sha256(raw_key.encode()).hexdigest()[:16]
            cache_key = f"doc_rel:{key_hash}"
        else:
            cache_key = raw_key

        if use_cache:
            # Cache relationship IDs, not the QuerySet
            cached_ids = cache.get(cache_key)
            if cached_ids is not None:
                return Relationship.objects.filter(id__in=cached_ids).select_related(
                    "relationship_label", "creator", "corpus", "analysis"
                ).prefetch_related(
                    Prefetch("source_annotations", queryset=Annotation.objects.select_related("annotation_label", "creator")),
                    Prefetch("target_annotations", queryset=Annotation.objects.select_related("annotation_label", "creator"))
                )

        # Start with base query
        qs = Relationship.objects.filter(document_id=document_id)

        # Apply permission filter
        permission_filter = cls._get_relationship_permission_filter(user)
        qs = qs.filter(permission_filter)

        # Apply filters (consistent with annotation filtering)
        if corpus_id is not None:
            if structural is False:
                # Explicitly exclude structural relationships
                qs = qs.filter(corpus_id=corpus_id, structural=False)
            else:
                # Default: include corpus relationships AND structural (structural=None or True)
                qs = qs.filter(Q(corpus_id=corpus_id) | Q(structural=True))
        else:
            # No corpus specified - only show structural relationships
            if structural is False:
                # User explicitly doesn't want structural, but no corpus - return empty
                return Relationship.objects.none()
            else:
                # Default: show structural relationships
                qs = qs.filter(structural=True)

        # Apply analysis filter
        if analysis_id is not None:
            if analysis_id == 0:  # User relationships
                qs = qs.filter(Q(analysis_id__isnull=True) | Q(structural=True))
            else:
                qs = qs.filter(Q(analysis_id=analysis_id) | Q(structural=True))

        # Apply extract filtering if specified
        if extract_id is not None:
            # Use subquery for better performance with large sets
            extract_annotations_qs = Annotation.objects.filter(
                referencing_cells__extract_id=extract_id,
                referencing_cells__document_id=document_id
            ).values_list('id', flat=True).distinct()

            # Try to use MV for count optimization
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COUNT(DISTINCT annotation_id)
                        FROM extract_annotation_mapping_mv
                        WHERE extract_id = %s AND document_id = %s
                        """,
                        [extract_id, document_id]
                    )
                    count = cursor.fetchone()[0]
                    # Only use cached list if reasonably small
                    if count < 1000:
                        cursor.execute(
                            """
                            SELECT annotation_id
                            FROM extract_annotation_mapping_mv
                            WHERE extract_id = %s AND document_id = %s
                            """,
                            [extract_id, document_id]
                        )
                        extract_annotations = [row[0] for row in cursor.fetchall()]
                    else:
                        # Use subquery for large sets
                        extract_annotations = extract_annotations_qs
            except Exception:
                # Fallback to subquery
                extract_annotations = extract_annotations_qs

            if strict_extract_mode:
                # Both endpoints must be in extract
                qs = qs.filter(
                    source_annotations__in=extract_annotations,
                    target_annotations__in=extract_annotations
                )
            else:
                # At least one endpoint in extract
                qs = qs.filter(
                    Q(source_annotations__in=extract_annotations) |
                    Q(target_annotations__in=extract_annotations)
                )

        # Filter by pages if specified
        if pages:
            page_annotations = Annotation.objects.filter(
                document_id=document_id, page__in=pages
            )
            if corpus_id is not None:
                page_annotations = page_annotations.filter(corpus_id=corpus_id)

            annotation_ids = page_annotations.values_list("id", flat=True)
            qs = qs.filter(
                Q(source_annotations__in=annotation_ids) |
                Q(target_annotations__in=annotation_ids)
            )

        # Apply distinct after all filtering
        if extract_id is not None or pages:
            qs = qs.distinct()

        # Optimize with prefetching
        qs = qs.select_related(
            "relationship_label", "creator", "corpus", "analysis"
        ).prefetch_related(
            Prefetch(
                "source_annotations",
                queryset=Annotation.objects.select_related("annotation_label", "creator"),
            ),
            Prefetch(
                "target_annotations",
                queryset=Annotation.objects.select_related("annotation_label", "creator"),
            )
        )

        qs = qs.order_by("created")

        if use_cache:
            # Cache only the IDs, not the QuerySet
            relationship_ids = list(qs.values_list('id', flat=True))
            cache.set(cache_key, relationship_ids, cls.CACHE_TTL)
            cls._register_relationship_cache_key(document_id, corpus_id, extract_id, cache_key)

        return qs

    @classmethod
    def _register_relationship_cache_key(cls, document_id, corpus_id, extract_id, cache_key):
        """Register cache key for targeted invalidation including extract."""
        try:
            # ... existing registrations ...

            # NEW: Document+extract registry for relationships
            if extract_id is not None:
                doc_extract_registry_key = f"doc_relationships:keys:{document_id}:extract:{extract_id}"
                doc_extract_registry = cache.get(doc_extract_registry_key) or []
                if cache_key not in doc_extract_registry:
                    doc_extract_registry.append(cache_key)
                    cache.set(doc_extract_registry_key, doc_extract_registry, cls.CACHE_TTL * 6)
        except Exception:
            pass

    @classmethod
    def invalidate_extract_cache(cls, document_id: int, extract_id: int):
        """Invalidate relationship caches related to a specific extract."""
        try:
            # Clear extract-specific relationship caches (use correct prefix!)
            doc_extract_registry_key = f"doc_relationships:keys:{document_id}:extract:{extract_id}"
            keys = cache.get(doc_extract_registry_key) or []
            for k in keys:
                cache.delete(k)
            cache.delete(doc_extract_registry_key)

            # Clear relationship summaries with extract
            pattern = f"relationship_extract_summary:{document_id}:{extract_id}:*"
            cache.delete_pattern(pattern)
        except AttributeError:
            # Fallback if pattern deletion not supported
            logger.warning("Cache backend doesn't support pattern deletion")
```

### Phase 3: GraphQL Integration with Page-Scoped Support

#### Update DocumentType with Consistent Naming
```python
# config/graphql/graphene_types.py

import graphene
from graphene_django import DjangoObjectType
from graphql_relay import from_global_id
from opencontractserver.annotations.query_optimizer import (
    AnnotationQueryOptimizer,
    RelationshipQueryOptimizer
)

class DocumentType(DjangoObjectType):
    # ... existing fields ...

    # Page-scoped annotations with extract filtering (extending existing fields)
    page_annotations = graphene.List(
        AnnotationType,
        corpus_id=graphene.String(),  # Keep String for consistency with frontend
        pages=graphene.List(graphene.Int, required=True),
        structural=graphene.Boolean(),
        analysis_id=graphene.ID(),
        extract_id=graphene.ID(),  # NEW
    )

    # Page-scoped relationships with extract filtering
    page_relationships = graphene.List(
        RelationshipType,
        corpus_id=graphene.String(),  # Keep String for consistency
        pages=graphene.List(graphene.Int, required=True),
        structural=graphene.Boolean(),
        analysis_id=graphene.ID(),
        extract_id=graphene.ID(),  # NEW
        strict_extract_mode=graphene.Boolean(default_value=False),  # Both endpoints required
    )

    # Extract-specific summary
    extract_annotation_summary = graphene.Field(
        graphene.GenericScalar,
        extract_id=graphene.ID(required=True),
    )

    def resolve_page_annotations(
        self, info, pages, corpus_id=None, structural=None,
        analysis_id=None, extract_id=None
    ):
        """Resolve page-scoped annotations with optional extract filter."""
        from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer

        user = info.context.user if hasattr(info.context, "user") else None

        # Convert GraphQL IDs (handle both String and ID types)
        corpus_pk = None
        analysis_pk = None
        extract_pk = None

        if corpus_id:
            try:
                corpus_pk = from_global_id(corpus_id)[1]
            except:
                corpus_pk = corpus_id  # Already a raw ID

        if analysis_id:
            if analysis_id == "__none__":
                analysis_pk = 0  # Special case for user annotations
            else:
                try:
                    analysis_pk = from_global_id(analysis_id)[1]
                except:
                    analysis_pk = analysis_id

        if extract_id:
            try:
                extract_pk = from_global_id(extract_id)[1]
            except:
                extract_pk = extract_id

        return AnnotationQueryOptimizer.get_document_annotations(
            document_id=self.id,
            user=user,
            corpus_id=corpus_pk,
            pages=pages,
            structural=structural,
            analysis_id=analysis_pk,
            extract_id=extract_pk,
            use_cache=True
        )

    def resolve_page_relationships(
        self, info, pages, corpus_id=None, structural=None,
        analysis_id=None, extract_id=None, strict_extract_mode=False
    ):
        """Resolve page-scoped relationships with optional extract filter."""
        from opencontractserver.annotations.query_optimizer import RelationshipQueryOptimizer

        user = info.context.user if hasattr(info.context, "user") else None

        # Convert IDs (handle both String and ID types)
        corpus_pk = None
        analysis_pk = None
        extract_pk = None

        if corpus_id:
            try:
                corpus_pk = from_global_id(corpus_id)[1]
            except:
                corpus_pk = corpus_id

        if analysis_id:
            if analysis_id == "__none__":
                analysis_pk = 0
            else:
                try:
                    analysis_pk = from_global_id(analysis_id)[1]
                except:
                    analysis_pk = analysis_id

        if extract_id:
            try:
                extract_pk = from_global_id(extract_id)[1]
            except:
                extract_pk = extract_id

        # Use the enhanced optimizer with extract support
        return RelationshipQueryOptimizer.get_document_relationships(
            document_id=self.id,
            user=user,
            corpus_id=corpus_pk,
            pages=pages,
            structural=structural,
            analysis_id=analysis_pk,
            extract_id=extract_pk,
            strict_extract_mode=strict_extract_mode,
            use_cache=True
        )

    def resolve_extract_annotation_summary(self, info, extract_id):
        """Get summary of annotations in extract."""
        from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer

        user = info.context.user if hasattr(info.context, "user") else None
        extract_pk = from_global_id(extract_id)[1]

        return AnnotationQueryOptimizer.get_extract_annotation_summary(
            document_id=self.id,
            extract_id=extract_pk,
            user=user,
            use_cache=True
        )
```

### Phase 4: Frontend Integration

#### Update Progressive Hook
```typescript
// frontend/src/hooks/useProgressiveAnnotations.ts

export interface UseProgressiveAnnotationsArgs {
  documentId: string;
  corpusId: string;
  visiblePages: number[];
  structural?: boolean;
  analysisId?: string | null;
  extractId?: string | null;  // NEW
  enabled?: boolean;
}

// Update the fetch function to include extractId
const fetchPages = useCallback(async (pagesToFetch: number[]) => {
  if (pagesToFetch.length === 0) return;

  try {
    setIsLoading(true);
    setError(null);

    const oneBased = pagesToFetch.map((p) => p + 1);
    const { data } = await apollo.query({
      query: GET_PAGE_DATA,
      fetchPolicy: "network-only",
      variables: {
        documentId,
        corpusId,
        pages: oneBased,
        structural: structural ?? null,
        analysisId: analysisId ?? null,
        extractId: extractId ?? null,  // NEW
      },
    });
    // ... rest of function
  } catch (e) {
    setError(e as Error);
  } finally {
    setIsLoading(false);
  }
}, [apollo, documentId, corpusId, structural, analysisId, extractId]);

// Clear cache when extractId changes
useEffect(() => {
  resetCache();
}, [documentId, corpusId, analysisId, extractId, structural, resetCache]);
```

#### Update GraphQL Query
```typescript
// frontend/src/graphql/queries.ts

export const GET_PAGE_DATA = gql`
  query GetPageData(
    $documentId: String!
    $corpusId: ID!
    $pages: [Int!]!
    $structural: Boolean
    $analysisId: ID
    $extractId: ID
  ) {
    document(id: $documentId) {
      id
      pageAnnotations(
        corpusId: $corpusId
        pages: $pages
        structural: $structural
        analysisId: $analysisId
        extractId: $extractId
      ) {
        id
        page
        rawText
        json
        boundingBox
        structural
        annotationLabel {
          id
          text
          color
        }
      }
      pageRelationships(
        corpusId: $corpusId
        pages: $pages
        structural: $structural
        analysisId: $analysisId
        extractId: $extractId
      ) {
        id
        structural
        relationshipLabel { id text }
        sourceAnnotations { edges { node { id page } } }
        targetAnnotations { edges { node { id page } } }
      }
    }
  }
`;
```

### Phase 5: Targeted MV Refresh Triggers

Since extract datacells only change in specific scenarios, we can optimize MV refreshes to occur only when needed:

#### Update GraphQL Mutations to Trigger MV Refresh
```python
# config/graphql/mutations.py

import graphene
from django.contrib.auth.decorators import login_required
from opencontractserver.extracts.models import Datacell
from config.graphql.graphene_types import DatacellType

class ApproveDatacell(graphene.Mutation):
    class Arguments:
        datacell_id = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(DatacellType)

    @staticmethod
    @login_required
    def mutate(root, info, datacell_id):
        from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv
        from graphql_relay import from_global_id

        ok = True
        obj = None
        message = "Nothing modified..."

        try:
            # Decode the Relay Global ID to get the database PK
            _type, pk = from_global_id(datacell_id)
            obj = Datacell.objects.get(id=pk)
            obj.approved_by = info.context.user
            obj.rejected_by = None
            obj.save()
            message = "SUCCESS!"

            # Trigger MV refresh for this extract
            if obj.extract_id and obj.document_id:
                refresh_extract_annotation_mv.delay(
                    document_id=obj.document_id,
                    extract_id=obj.extract_id
                )

        except Exception as e:
            ok = False
            message = f"Failed to approve datacell due to error: {e}"

        return ApproveDatacell(ok=ok, obj=obj, message=message)


class RejectDatacell(graphene.Mutation):
    class Arguments:
        datacell_id = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(DatacellType)

    @staticmethod
    @login_required
    def mutate(root, info, datacell_id):
        from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv
        from graphql_relay import from_global_id

        ok = True
        obj = None
        message = "Nothing modified..."

        try:
            # Decode the Relay Global ID to get the database PK
            _type, pk = from_global_id(datacell_id)
            obj = Datacell.objects.get(id=pk)
            obj.approved_by = None
            obj.rejected_by = info.context.user
            obj.save()
            message = "SUCCESS!"

            # Trigger MV refresh for this extract
            if obj.extract_id and obj.document_id:
                refresh_extract_annotation_mv.delay(
                    document_id=obj.document_id,
                    extract_id=obj.extract_id
                )

        except Exception as e:
            ok = False
            message = f"Failed to reject datacell due to error: {e}"

        return RejectDatacell(ok=ok, obj=obj, message=message)


class EditDatacell(graphene.Mutation):
    class Arguments:
        datacell_id = graphene.String(required=True)
        edited_data = GenericScalar(required=True)  # Polymorphic by design - varies by column type

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(DatacellType)

    @staticmethod
    @login_required
    def mutate(root, info, datacell_id, edited_data):
        from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv
        from graphql_relay import from_global_id

        ok = True
        obj = None
        message = "Nothing modified..."

        try:
            # Decode the Relay Global ID to get the database PK
            _type, pk = from_global_id(datacell_id)
            obj = Datacell.objects.get(id=pk)
            obj.corrected_data = edited_data
            obj.save()
            message = "SUCCESS!"

            # Trigger MV refresh for this extract
            if obj.extract_id and obj.document_id:
                refresh_extract_annotation_mv.delay(
                    document_id=obj.document_id,
                    extract_id=obj.extract_id
                )

        except Exception as e:
            ok = False
            message = f"Failed to edit datacell due to error: {e}"

        return EditDatacell(ok=ok, obj=obj, message=message)
```

#### Update Extract Processing Completion Task
```python
# opencontractserver/tasks/extract_orchestrator_tasks.py

import logging
from celery import shared_task
from django.utils import timezone
from opencontractserver.extracts.models import Extract

logger = logging.getLogger(__name__)

@shared_task
def mark_extract_complete(extract_id):
    """Mark extract as complete and trigger MV refresh."""
    from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv

    extract = Extract.objects.get(pk=extract_id)
    extract.finished = timezone.now()
    extract.save()

    # Get all unique document IDs for this extract
    document_ids = extract.extracted_datacells.values_list(
        'document_id', flat=True
    ).distinct()

    # Trigger MV refresh for each document in the extract
    for doc_id in document_ids:
        refresh_extract_annotation_mv.delay(
            document_id=doc_id,
            extract_id=extract_id
        )

    logger.info(f"Extract {extract_id} marked complete, triggered MV refresh for {len(document_ids)} documents")
```

#### Signal Handlers for Cache Invalidation and MV Refresh
```python
# opencontractserver/annotations/signals.py

from django.db.models.signals import m2m_changed, post_delete
from django.dispatch import receiver
from opencontractserver.extracts.models import Datacell

# IMPORTANT: These signals must be imported at Django startup!
# Add to opencontractserver/annotations/apps.py:
#
# class AnnotationsConfig(AppConfig):
#     ...
#     def ready(self):
#         from . import signals  # Ensures signal handlers are registered

@receiver(m2m_changed, sender=Datacell.sources.through)
def invalidate_extract_annotation_cache_on_m2m_change(sender, instance, action, pk_set, **kwargs):
    """
    Invalidate cache when datacell sources change.
    This primarily happens during extract processing when annotations are linked to datacells.
    """
    if action in ['post_add', 'post_remove', 'post_clear']:
        from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer

        if hasattr(instance, 'extract_id') and instance.extract_id and instance.document_id:
            # Only invalidate cache, don't refresh MV here
            # MV will be refreshed when mark_extract_complete is called
            AnnotationQueryOptimizer.invalidate_extract_cache(
                document_id=instance.document_id,
                extract_id=instance.extract_id
            )

@receiver(post_delete, sender=Datacell)
def trigger_mv_refresh_on_datacell_delete(sender, instance, **kwargs):
    """
    Refresh the MV when a Datacell is deleted.
    Handles the edge case where datacells might be deleted.
    """
    if instance.extract_id and instance.document_id:
        from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv

        # Trigger MV refresh for the affected extract
        refresh_extract_annotation_mv.delay(
            document_id=instance.document_id,
            extract_id=instance.extract_id
        )
```

### Phase 6: Materialized View Refresh Tasks

```python
# opencontractserver/tasks/materialized_view_tasks.py

@shared_task
def refresh_extract_annotation_mv(document_id=None, extract_id=None):
    """
    Refresh extract annotation materialized views.
    Uses GLOBAL locking since MVs refresh globally, not per extract.
    """
    from django.core.cache import cache

    # Use global locks since MV refresh is global
    mapping_lock_key = "lock:refresh_extract_annotation_mapping_mv"
    summary_lock_key = "lock:refresh_extract_annotation_summary_mv"
    lock_timeout = 60 * 5  # 5 minutes

    # Track what we successfully locked
    locked_mapping = False
    locked_summary = False

    try:
        # Try to acquire lock for mapping MV
        locked_mapping = cache.add(mapping_lock_key, "true", lock_timeout)
        if locked_mapping:
            with connection.cursor() as cursor:
                cursor.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY extract_annotation_mapping_mv")
                logger.info(f"Refreshed extract_annotation_mapping_mv (triggered by doc={document_id}, extract={extract_id})")
        else:
            logger.info("Mapping MV refresh already in progress, skipping")

        # Try to acquire lock for summary MV
        locked_summary = cache.add(summary_lock_key, "true", lock_timeout)
        if locked_summary:
            with connection.cursor() as cursor:
                cursor.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY extract_annotation_summary_mv")
                logger.info(f"Refreshed extract_annotation_summary_mv (triggered by doc={document_id}, extract={extract_id})")
        else:
            logger.info("Summary MV refresh already in progress, skipping")

        # Invalidate related caches if specific IDs provided
        if document_id and extract_id:
            from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer
            AnnotationQueryOptimizer.invalidate_extract_cache(document_id, extract_id)

    except Exception as e:
        logger.error(f"Failed to refresh extract MVs: {e}")
        raise
    finally:
        # Release the locks we acquired
        if locked_mapping:
            cache.delete(mapping_lock_key)
        if locked_summary:
            cache.delete(summary_lock_key)
```

### Phase 7: Comprehensive Test Suite

#### Test Files Structure

1. **`test_extract_annotation_filtering.py`**
   - Test ORM join-based filtering works correctly
   - Verify `distinct()` prevents duplicates
   - Test permission filters still apply
   - Test empty extracts return no annotations
   - Test analysis + extract intersection behavior

2. **`test_extract_index_usage.py`**
   - EXPLAIN tests confirming indexes are used
   - Test M2M join performance
   - Verify no table scans occur
   - Test unique index exists for CONCURRENT refresh

3. **`test_extract_page_scoped.py`**
   - Test page filtering with extract filtering
   - Test progressive loading accumulates correctly
   - Test cache resets on extract change
   - Test relationship filtering with extracts
   - Test structural flag with extract filtering

4. **`test_extract_materialized_views.py`**
   - Test MV creation and refresh
   - Test CONCURRENT refresh doesn't block reads
   - Test fallback to direct query
   - Test summary accuracy
   - Test staleness handling
   - Verify unique index exists on mapping MV
   - Test MV refresh locking and deduplication:
     ```python
     def test_mv_refresh_locking(self):
         """Test that concurrent MV refresh calls are properly locked."""
         from unittest.mock import patch
         from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv

         # Mock cache.add to simulate lock acquisition
         with patch('django.core.cache.cache.add') as mock_add:
             mock_add.return_value = False  # Lock already held

             # Task should exit early
             result = refresh_extract_annotation_mv(doc_id=1, extract_id=1)
             self.assertIsNone(result)  # Task skipped due to lock

     def test_mv_refresh_deduplication(self):
         """Test that duplicate refresh tasks are deduplicated."""
         from opencontractserver.tasks.materialized_view_tasks import refresh_extract_annotation_mv

         # Queue multiple refresh tasks
         task1 = refresh_extract_annotation_mv.delay(doc_id=1, extract_id=1)
         task2 = refresh_extract_annotation_mv.delay(doc_id=1, extract_id=1)
         task3 = refresh_extract_annotation_mv.delay(doc_id=1, extract_id=1)

         # Only one should actually execute due to locking
         results = [t.get(timeout=10) for t in [task1, task2, task3]]
         executed = [r for r in results if r is not None]
         self.assertEqual(len(executed), 1)  # Only one executed
     ```

5. **`test_extract_cache_keys.py`**
   - Test cache key generation for different extract modes
   - Test cache key hashing for long keys
   - Verify different extract filters generate different keys:
     ```python
     def test_cache_key_extract_modes(self):
         """Test that different extract modes generate different cache keys."""
         from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer

         optimizer = AnnotationQueryOptimizer()

         # Same doc/corpus but different extract filters should have different keys
         key1 = optimizer._build_cache_key(doc_id=1, corpus_id=1, extract_id=1)
         key2 = optimizer._build_cache_key(doc_id=1, corpus_id=1, extract_id=1, strict_extract=True)
         key3 = optimizer._build_cache_key(doc_id=1, corpus_id=1, extract_id=2)

         self.assertNotEqual(key1, key2)  # Different strict mode
         self.assertNotEqual(key1, key3)  # Different extract
         self.assertNotEqual(key2, key3)  # All different
     ```

5. **`test_extract_cache_invalidation.py`**
   - Test M2M change signals trigger invalidation
   - Test datacell changes invalidate correctly
   - Test registry-based invalidation
   - Test per-user cache safety
   - Test distinct cache keys for analysis vs extract

6. **`test_graphql_extract_fields.py`**
   - Test `pageAnnotations` with `extractId`
   - Test `pageRelationships` with `extractId` and `strictExtractMode`
   - Test `extractAnnotationSummary`
   - Test permission checks in GraphQL
   - Test String type consistency in queries

7. **`test_extract_frontend_integration.py`**
   - Test hook resets on extract change
   - Test progressive accumulation
   - Test analysis + extract intersection
   - Test structural toggle with extracts
   - Test relationship-only batches merge correctly

8. **`test_extract_relationship_optimizer.py`**
   - Test RelationshipQueryOptimizer with extract filtering
   - Test strict vs non-strict extract mode
   - Test permission-aware filtering
   - Test caching behavior
   - Verify N+1 queries avoided with prefetch

9. **`test_extract_mutation_refresh.py`**
   - Test ApproveDatacell triggers MV refresh
   - Test RejectDatacell triggers MV refresh
   - Test EditDatacell triggers MV refresh
   - Test mark_extract_complete triggers refresh for all documents

10. **`test_extract_multi_page_annotations.py`**
    - Document limitation: MV only captures primary page
    - Test annotations spanning multiple pages (if needed in future)
    - Verify current behavior is acceptable for MVP

11. **`test_extract_edge_cases.py`**
    - Test strict vs non-strict mode generates different cache keys
    - Test relationship-only batches merge correctly when annotations array is empty
    - Test intersection behavior when both analysisId and extractId provided
    - Test cache key collision prevention with distinct prefixes

## Key Implementation Notes

1. **Performance**: ORM joins with proper indexes will be 10-20x faster than IN queries
2. **Cache Safety**: Per-user cache keys prevent permission leaks
3. **Progressive Loading**: Page-scoped queries maintain viewport efficiency
4. **Backward Compatibility**: All changes are additive, existing queries unchanged
5. **MV Strategy**: Dedicated small MVs for extract mappings keep refresh fast
6. **Targeted MV Refresh**: Since extracts are immutable after processing (except for approve/reject/edit operations), we only refresh MVs at these specific points:
   - When extract processing completes (`mark_extract_complete`)
   - When user approves a datacell (`ApproveDatacell` mutation)
   - When user rejects a datacell (`RejectDatacell` mutation)
   - When user edits a datacell (`EditDatacell` mutation)

   This avoids unnecessary MV refreshes and keeps the system performant
7. **Filter Combination**: When both `analysisId` and `extractId` are provided, we apply intersection (AND) logic
8. **Cache Key Design**: Uses distinct prefixes (`analysis:` and `extract:`) to avoid ID collisions
9. **Type Consistency**: Maintains `String!` type for IDs to match existing frontend patterns
10. **CONCURRENT Refresh**: Unique index on mapping MV enables non-blocking refresh

## Known Limitations

1. **Multi-page Annotations**: The mapping MV only captures the primary `page` field from annotations. Annotations that span multiple pages (stored in the `json` field) will only be indexed by their anchor page. This is acceptable for MVP but should be documented for future enhancement.

2. **Extract + Analysis Intersection**: When both filters are applied, only annotations that match BOTH criteria are returned. This is the intended behavior but should be clearly documented in the UI.

3. **Materialized View Staleness**: There's a brief window (milliseconds to seconds) after datacell changes where the MV may be stale. The system falls back to direct queries if staleness is detected.

4. **Pattern Deletion Fallback**: On cache backends that don't support pattern deletion, we rely on registry-based invalidation which may miss some edge cases.

5. **PostgreSQL Version Compatibility**: The `array_agg(DISTINCT ...)` syntax requires PostgreSQL 8.4+. For older versions, use:
   ```sql
   -- Alternative for PostgreSQL < 8.4
   array_agg(DISTINCT extract_id ORDER BY extract_id)
   -- becomes
   array(SELECT DISTINCT unnest(array_agg(extract_id)) ORDER BY 1)
   ```

## Technical Debt

1. **GraphQL Type Consistency**: The codebase currently uses `String!` for ID fields in GraphQL, while `ID` would be more semantically correct and better for tooling/codegen. The implementation handles both types gracefully with try/except blocks around `from_global_id()`, but this should be standardized to `ID` in a future migration when client compatibility can be ensured

2. **Type Casting After Global ID Decode**: Consider adding explicit type casting after `from_global_id()` calls to ensure type safety:
   ```python
   # Current
   _, datacell_id = from_global_id(datacell_id)

   # Consider for future improvement
   _, datacell_id_str = from_global_id(datacell_id)
   datacell_id = int(datacell_id_str) if datacell_id_str else None
   ```

## Expected Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Extract annotation lookup | 2-5s | 100-200ms | 10-25x faster |
| M2M join queries | 500ms-2s | 50-100ms | 10-20x faster |
| Extract summary | 1-2s | <50ms (MV) | 20-40x faster |
| Cache hit rate | 0% | 60-70% | Significant |
| Query count per request | 50+ | 3-5 | 90% reduction |

## Migration Sequence

1. Deploy database migrations (indexes + MVs)
2. Deploy backend code (query optimizer + GraphQL)
3. Deploy frontend updates (hook + query)
4. Monitor and tune based on production metrics

## Risk Mitigation

- **Rollback Plan**: All changes are additive; can rollback without breaking existing functionality
- **Performance Testing**: Load test with large extracts (1000+ annotations)
- **Cache Stampede**: Use cache warming and staggered TTLs
- **MV Staleness**: 5-minute refresh cycle with manual trigger option

## Success Metrics

- Page load time for extract views < 500ms
- Progressive annotation loading < 100ms per page batch
- No N+1 queries in GraphQL resolvers
- Cache hit rate > 60% in production
- Zero permission leaks in multi-user scenarios