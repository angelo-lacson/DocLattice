"""
Simplified Query Optimizers for OpenContracts
Direct database queries with smart prefetching and permission filtering.
No caching layer - just optimized queries.
"""
from typing import Optional, List, Dict
from django.db.models import QuerySet, Count, Q, Value



class AnnotationQueryOptimizer:
    """
    Optimized annotation queries with permission filtering.
    Direct database queries without caching.

    Permission model:
    - Document permissions are primary (most restrictive)
    - Corpus permissions are secondary
    - Effective permission = MIN(document_permission, corpus_permission)
    - Structural annotations always have READ permission if document is readable
    """

    @classmethod
    def _compute_effective_permissions(
        cls,
        user,
        document_id: int,
        corpus_id: Optional[int] = None
    ) -> tuple[bool, bool, bool, bool]:
        """
        Compute effective permissions based on document and corpus.
        Returns: (can_read, can_create, can_update, can_delete)
        """
        from opencontractserver.documents.models import Document
        from opencontractserver.corpuses.models import Corpus
        from opencontractserver.utils.permissioning import user_has_permission_for_obj
        from opencontractserver.types.enums import PermissionTypes

        # Superusers have all permissions
        if user.is_superuser:
            return True, True, True, True

        # First check document permissions (primary)
        try:
            document = Document.objects.get(id=document_id)
            doc_read = user_has_permission_for_obj(user, document, PermissionTypes.READ)
            doc_create = user_has_permission_for_obj(user, document, PermissionTypes.CREATE)
            doc_update = user_has_permission_for_obj(user, document, PermissionTypes.UPDATE)
            doc_delete = user_has_permission_for_obj(user, document, PermissionTypes.DELETE)
        except Document.DoesNotExist:
            return False, False, False, False

        # If no document read permission, no access at all
        if not doc_read:
            return False, False, False, False

        # If no corpus, use document permissions only
        if not corpus_id:
            return doc_read, doc_create, doc_update, doc_delete

        # Check corpus permissions and apply most restrictive
        try:
            corpus = Corpus.objects.get(id=corpus_id)
            corpus_read = user_has_permission_for_obj(user, corpus, PermissionTypes.READ)
            corpus_create = user_has_permission_for_obj(user, corpus, PermissionTypes.CREATE)
            corpus_update = user_has_permission_for_obj(user, corpus, PermissionTypes.UPDATE)
            corpus_delete = user_has_permission_for_obj(user, corpus, PermissionTypes.DELETE)

            # Return minimum permissions (most restrictive)
            return (
                doc_read and corpus_read,
                doc_create and corpus_create,
                doc_update and corpus_update,
                doc_delete and corpus_delete
            )
        except Corpus.DoesNotExist:
            # Corpus doesn't exist, use document permissions
            return doc_read, doc_create, doc_update, doc_delete

    @classmethod
    def get_document_annotations(
        cls,
        document_id: int,
        user,
        corpus_id: Optional[int] = None,
        pages: Optional[List[int]] = None,
        analysis_id: Optional[int] = None,
        extract_id: Optional[int] = None,
        structural: Optional[bool] = None,  # Filter for structural annotations
        use_cache: bool = True  # Kept for backward compatibility, ignored
    ) -> QuerySet:
        """
        Get annotations with permission filtering and optimized queries.
        Permissions are computed at document+corpus level and applied to all annotations.
        """
        from opencontractserver.annotations.models import Annotation
        from opencontractserver.documents.models import Document

        # Compute effective permissions once
        can_read, can_create, can_update, can_delete = cls._compute_effective_permissions(
            user, document_id, corpus_id
        )
        # No read permission = no annotations
        if not can_read:
            return Annotation.objects.none()

        # Build optimized query
        qs = Annotation.objects.filter(document_id=document_id)

        # Add filters
        if corpus_id:
            # Filter by corpus (permissions already checked)
            qs = qs.filter(corpus_id=corpus_id)
            # Apply structural filter if specified
            if structural is not None:
                qs = qs.filter(structural=structural)
        else:
            # No corpus = structural only (always readable if doc is readable)
            # Unless explicitly requested otherwise
            if structural is False:
                # Explicitly requesting non-structural without corpus = empty
                return Annotation.objects.none()
            # Default to structural only when no corpus
            qs = qs.filter(structural=True)

        if pages:
            qs = qs.filter(page__in=pages)

        if analysis_id:
            # Additional filter for analysis visibility
            from opencontractserver.analyzer.models import Analysis
            try:
                analysis = Analysis.objects.get(id=analysis_id)
                # Check analysis visibility as additional restriction
                if not (analysis.is_public or analysis.creator_id == user.id):
                    return Annotation.objects.none()
            except Analysis.DoesNotExist:
                return Annotation.objects.none()
            qs = qs.filter(analysis_id=analysis_id)

        if extract_id:
            # Filter to annotations that are sources for datacells in this extract
            from opencontractserver.extracts.models import Datacell
            datacell_annotation_ids = Datacell.objects.filter(
                extract_id=extract_id,
                document_id=document_id
            ).values_list('sources__id', flat=True)
            qs = qs.filter(id__in=datacell_annotation_ids)

        # Optimize query with prefetches and annotate feedback count
        # Also annotate with computed permissions for backwards compatibility
        qs = qs.select_related(
            'annotation_label',
            'creator',
            'analysis'
        ).annotate(
            feedback_count=Count('user_feedback'),
            # Store computed permissions for GraphQL myPermissions field
            _can_read=Value(can_read),
            _can_create=Value(can_create),
            _can_update=Value(can_update),
            _can_delete=Value(can_delete)
        ).distinct()

        return qs

    # TODO - in-use?
    @classmethod
    def get_extract_annotation_summary(
        cls,
        document_id: int,
        extract_id: int,
        user,
        use_cache: bool = True  # Ignored
    ) -> Dict:
        """
        Get summary of annotations used in specific extract.
        """
        from opencontractserver.annotations.models import Annotation
        from opencontractserver.extracts.models import Datacell, Extract

        # Get extract to determine corpus
        try:
            extract = Extract.objects.get(id=extract_id)
            corpus_id = extract.corpus_id if hasattr(extract, 'corpus_id') else None
        except Extract.DoesNotExist:
            corpus_id = None

        # Use unified permission check
        can_read, _, _, _ = cls._compute_effective_permissions(
            user, document_id, corpus_id
        )

        if not can_read:
            return {
                'total_source_annotations': 0,
                'by_label': {},
                'pages_with_sources': []
            }
        
        # Get annotation IDs used as sources in this extract
        source_annotation_ids = Datacell.objects.filter(
            extract_id=extract_id,
            document_id=document_id
        ).values_list('sources__id', flat=True).distinct()
        
        # Get annotation summary
        annotations = Annotation.objects.filter(
            id__in=source_annotation_ids
        )
        
        summary = {
            'total_source_annotations': annotations.count(),
            'by_label': {},
            'pages_with_sources': list(
                annotations.values_list('page', flat=True).distinct().order_by('page')
            )
        }
        
        # Count by label
        label_counts = annotations.values(
            'annotation_label__text'
        ).annotate(count=Count('id'))
        
        summary['by_label'] = {
            item['annotation_label__text']: item['count'] 
            for item in label_counts if item['annotation_label__text']
        }
        
        return summary

    @classmethod
    def _check_document_permission(cls, user, document_id) -> bool:
        """Check if user has permission to access document.
        DEPRECATED: Use _compute_effective_permissions instead.
        Kept for backwards compatibility.
        """
        can_read, _, _, _ = cls._compute_effective_permissions(user, document_id, None)
        return can_read

    @classmethod
    def _apply_permission_filter(cls, qs, user, corpus_id):
        """Apply permission-based filtering.
        DEPRECATED: Permissions are now checked at document+corpus level.
        This method now just filters by corpus_id.
        """
        # Simply filter by corpus since permissions are already checked
        return qs.filter(corpus_id=corpus_id)


class RelationshipQueryOptimizer:
    """
    Optimized relationship queries without caching.

    Permission model:
    - Uses same document+corpus permission model as annotations
    - Document permissions are primary (most restrictive)
    - Corpus permissions are secondary
    - Effective permission = MIN(document_permission, corpus_permission)
    """

    @classmethod
    def get_document_relationships(
        cls,
        document_id: int,
        user,
        corpus_id: Optional[int] = None,
        analysis_id: Optional[int] = None,
        pages: Optional[List[int]] = None,
        structural: Optional[bool] = None,
        extract_id: Optional[int] = None,
        strict_extract_mode: bool = False,
        use_cache: bool = True  # Ignored
    ) -> QuerySet:
        """
        Get relationships with optimized prefetching.
        Permissions are computed at document+corpus level.
        """
        from opencontractserver.annotations.models import Relationship

        # Use unified permission check from AnnotationQueryOptimizer
        can_read, can_create, can_update, can_delete = AnnotationQueryOptimizer._compute_effective_permissions(
            user, document_id, corpus_id
        )

        if not can_read:
            return Relationship.objects.none()

        # Build query
        qs = Relationship.objects.filter(document_id=document_id)

        if corpus_id:
            # Filter by corpus (permissions already checked)
            qs = qs.filter(corpus_id=corpus_id)
        else:
            # No corpus = structural only (always readable if doc is readable)
            qs = qs.filter(structural=True)

        if analysis_id is not None:
            if analysis_id == 0:  # Special case for user relationships
                qs = qs.filter(analysis__isnull=True)
            else:
                # Check analysis visibility as additional restriction
                from opencontractserver.analyzer.models import Analysis
                try:
                    analysis = Analysis.objects.get(id=analysis_id)
                    if not (analysis.is_public or analysis.creator_id == user.id):
                        return Relationship.objects.none()
                except Analysis.DoesNotExist:
                    return Relationship.objects.none()
                qs = qs.filter(analysis_id=analysis_id)
                
        if structural is not None:
            qs = qs.filter(structural=structural)
            
        if pages:
            # Filter relationships where source or target annotations are on specified pages
            qs = qs.filter(
                Q(source_annotations__page__in=pages) | 
                Q(target_annotations__page__in=pages)
            ).distinct()
            
        if extract_id:
            # Filter to relationships connected to annotations used in extract
            from opencontractserver.extracts.models import Datacell
            datacell_annotation_ids = Datacell.objects.filter(
                extract_id=extract_id,
                document_id=document_id
            ).values_list('sources__id', flat=True)
            
            if strict_extract_mode:
                # Both source and target must be in extract
                qs = qs.filter(
                    source_annotations__id__in=datacell_annotation_ids,
                    target_annotations__id__in=datacell_annotation_ids
                )
            else:
                # Either source or target in extract
                qs = qs.filter(
                    Q(source_annotations__id__in=datacell_annotation_ids) |
                    Q(target_annotations__id__in=datacell_annotation_ids)
                )

        # Optimize with prefetches and annotate with computed permissions
        qs = qs.select_related(
            'relationship_label',
            'creator'
        ).prefetch_related(
            'source_annotations__annotation_label',
            'target_annotations__annotation_label'
        ).annotate(
            # Store computed permissions for backwards compatibility
            _can_read=Value(can_read),
            _can_create=Value(can_create),
            _can_update=Value(can_update),
            _can_delete=Value(can_delete)
        ).distinct()

        return qs

    @classmethod
    def get_relationship_summary(
        cls,
        document_id: int,
        corpus_id: int,
        user
    ) -> Dict:
        """
        Get relationship counts by type.
        """
        from opencontractserver.annotations.models import Relationship

        # Use unified permission check
        can_read, _, _, _ = AnnotationQueryOptimizer._compute_effective_permissions(
            user, document_id, corpus_id
        )

        if not can_read:
            return {'total': 0, 'by_type': {}}

        summary = Relationship.objects.filter(
            document_id=document_id,
            corpus_id=corpus_id
        ).values('relationship_label__text').annotate(
            count=Count('id')
        )

        result = {
            'total': sum(item['count'] for item in summary),
            'by_type': {item['relationship_label__text']: item['count'] for item in summary if item['relationship_label__text']}
        }

        return result

    @classmethod
    def _apply_permission_filter(cls, qs, user, corpus_id):
        """Apply permission-based filtering.
        DEPRECATED: Permissions are now checked at document+corpus level.
        This method now just filters by corpus_id.
        """
        # Simply filter by corpus since permissions are already checked
        return qs.filter(corpus_id=corpus_id)


class AnalysisQueryOptimizer:
    """
    Optimized queries for analysis-generated annotations.
    """

    @classmethod
    def get_analysis_annotations(
        cls,
        analysis_id: int,
        document_id: int,
        user
    ) -> QuerySet:
        """
        Get analysis annotations with permission check.
        """
        from opencontractserver.annotations.models import Annotation
        from opencontractserver.analyzer.models import Analysis

        # Check analysis visibility
        try:
            analysis = Analysis.objects.get(id=analysis_id)
            if not (analysis.is_public or analysis.creator_id == user.id):
                return Annotation.objects.none()
        except Analysis.DoesNotExist:
            return Annotation.objects.none()

        # Optimized query
        qs = Annotation.objects.filter(
            analysis_id=analysis_id,
            document_id=document_id
        ).select_related(
            'annotation_label',
            'analysis'
        ).annotate(
            feedback_count=Count('user_feedback')
        )

        return qs

    @classmethod
    def get_analysis_relationships(
        cls,
        analysis_id: int,
        document_id: int,
        user
    ) -> QuerySet:
        """
        Get analysis relationships with permission check.
        """
        from opencontractserver.annotations.models import Relationship
        from opencontractserver.analyzer.models import Analysis

        # Check analysis visibility
        try:
            analysis = Analysis.objects.get(id=analysis_id)
            if not (analysis.is_public or analysis.creator_id == user.id):
                return Relationship.objects.none()
        except Analysis.DoesNotExist:
            return Relationship.objects.none()

        # Optimized query
        qs = Relationship.objects.filter(
            analysis_id=analysis_id,
            document_id=document_id
        ).select_related(
            'relationship_label'
        ).prefetch_related(
            'source_annotations',
            'target_annotations'
        )

        return qs


class ExtractQueryOptimizer:
    """
    Optimized queries for extract datacells.
    """

    @classmethod
    def get_extract_datacells(
        cls,
        extract_id: int,
        document_id: int,
        user,
        include_sources: bool = True
    ) -> QuerySet:
        """
        Get datacells with modifications and sources.
        """
        from opencontractserver.extracts.models import Datacell, Extract
        from opencontractserver.utils.permissioning import user_has_permission_for_obj
        from opencontractserver.types.enums import PermissionTypes

        # Permission check
        try:
            extract = Extract.objects.get(id=extract_id)
            if not user_has_permission_for_obj(user, extract.corpus, PermissionTypes.READ):
                return Datacell.objects.none()
        except Extract.DoesNotExist:
            return Datacell.objects.none()

        # Build query
        qs = Datacell.objects.filter(
            extract_id=extract_id,
            document_id=document_id
        ).select_related(
            'column',
            'approved_by',
            'rejected_by'
        )

        if include_sources:
            qs = qs.prefetch_related('sources')

        return qs

    @classmethod
    def get_extract_summary(
        cls,
        extract_id: int,
        document_id: Optional[int] = None
    ) -> Dict:
        """
        Get extract completion statistics.
        """
        from opencontractserver.extracts.models import Datacell

        filters = {'extract_id': extract_id}
        if document_id:
            filters['document_id'] = document_id

        summary = Datacell.objects.filter(**filters).aggregate(
            total=Count('id'),
            approved=Count('id', filter=Q(approved_by__isnull=False)),
            rejected=Count('id', filter=Q(rejected_by__isnull=False)),
            edited=Count('id', filter=Q(corrected_data__isnull=False)),
            pending=Count('id', filter=Q(
                approved_by__isnull=True,
                rejected_by__isnull=True
            ))
        )

        return summary