"""
Query Optimizer for Metadata (Datacell) queries.

Follows the same pattern as AnnotationQueryOptimizer:
- Direct database queries with smart prefetching
- Permission filtering based on document + corpus (MIN logic)
- No caching layer - just optimized queries
"""

from collections import defaultdict
from typing import Optional

from django.db.models import QuerySet, Value

from opencontractserver.extracts.models import Column, Datacell


class MetadataQueryOptimizer:
    """
    Optimized metadata (Datacell) queries with permission filtering.

    Permission model (same as annotations):
    - Document permissions are primary (most restrictive)
    - Corpus permissions are secondary
    - Effective permission = MIN(document_permission, corpus_permission)

    Use this optimizer for:
    - Fetching metadata for single documents
    - Batch fetching metadata for multiple documents (N+1 fix)
    - Any query that needs permission-aware metadata access
    """

    @classmethod
    def _compute_effective_permissions(
        cls, user, document_id: int, corpus_id: int
    ) -> tuple[bool, bool, bool, bool]:
        """
        Compute effective permissions based on document and corpus.

        Returns: (can_read, can_create, can_update, can_delete)
        """
        from opencontractserver.corpuses.models import Corpus
        from opencontractserver.documents.models import Document
        from opencontractserver.types.enums import PermissionTypes
        from opencontractserver.utils.permissioning import user_has_permission_for_obj

        # Superusers have all permissions
        if user.is_superuser:
            return True, True, True, True

        # Anonymous users only have read access to public documents/corpuses
        if user.is_anonymous:
            try:
                document = Document.objects.get(id=document_id)
                corpus = Corpus.objects.get(id=corpus_id)
                if document.is_public and corpus.is_public:
                    return True, False, False, False
            except (Document.DoesNotExist, Corpus.DoesNotExist):
                pass
            return False, False, False, False

        # Check document permissions (primary)
        try:
            document = Document.objects.get(id=document_id)
            doc_read = user_has_permission_for_obj(
                user, document, PermissionTypes.READ, include_group_permissions=True
            )
            doc_create = user_has_permission_for_obj(
                user, document, PermissionTypes.CREATE, include_group_permissions=True
            )
            doc_update = user_has_permission_for_obj(
                user, document, PermissionTypes.UPDATE, include_group_permissions=True
            )
            doc_delete = user_has_permission_for_obj(
                user, document, PermissionTypes.DELETE, include_group_permissions=True
            )
        except Document.DoesNotExist:
            return False, False, False, False

        # If no document read permission, no access
        if not doc_read:
            return False, False, False, False

        # Check corpus permissions (secondary) and apply most restrictive
        try:
            corpus = Corpus.objects.get(id=corpus_id)
            corpus_read = user_has_permission_for_obj(
                user, corpus, PermissionTypes.READ, include_group_permissions=True
            )
            corpus_create = user_has_permission_for_obj(
                user, corpus, PermissionTypes.CREATE, include_group_permissions=True
            )
            corpus_update = user_has_permission_for_obj(
                user, corpus, PermissionTypes.UPDATE, include_group_permissions=True
            )
            corpus_delete = user_has_permission_for_obj(
                user, corpus, PermissionTypes.DELETE, include_group_permissions=True
            )

            # Apply MIN logic: effective = MIN(doc_perm, corpus_perm)
            return (
                doc_read and corpus_read,
                doc_create and corpus_create,
                doc_update and corpus_update,
                doc_delete and corpus_delete,
            )
        except Corpus.DoesNotExist:
            return False, False, False, False

    @classmethod
    def get_corpus_metadata_columns(
        cls, user, corpus_id: int, manual_only: bool = True
    ) -> QuerySet:
        """
        Get metadata columns for a corpus with permission check.

        Args:
            user: The requesting user
            corpus_id: The corpus ID (local, not global)
            manual_only: If True, only return manual entry columns (default)

        Returns:
            QuerySet of Column objects ordered by display_order
        """
        from opencontractserver.corpuses.models import Corpus
        from opencontractserver.types.enums import PermissionTypes
        from opencontractserver.utils.permissioning import user_has_permission_for_obj

        try:
            corpus = Corpus.objects.get(pk=corpus_id)

            # Check corpus read permission
            if not user.is_superuser:
                if user.is_anonymous:
                    if not corpus.is_public:
                        return Column.objects.none()
                elif not user_has_permission_for_obj(
                    user, corpus, PermissionTypes.READ, include_group_permissions=True
                ):
                    return Column.objects.none()

            # Get metadata fieldset
            if not hasattr(corpus, "metadata_schema") or not corpus.metadata_schema:
                return Column.objects.none()

            qs = corpus.metadata_schema.columns.all()
            if manual_only:
                qs = qs.filter(is_manual_entry=True)

            return qs.order_by("display_order")

        except Corpus.DoesNotExist:
            return Column.objects.none()

    @classmethod
    def get_document_metadata(
        cls,
        user,
        document_id: int,
        corpus_id: int,
        manual_only: bool = True,
    ) -> QuerySet:
        """
        Get metadata datacells for a single document with permission filtering.

        Args:
            user: The requesting user
            document_id: The document ID (local, not global)
            corpus_id: The corpus ID (local, not global)
            manual_only: If True, only return manual entry datacells (default)

        Returns:
            QuerySet of Datacell objects with related column data
        """
        from opencontractserver.corpuses.models import Corpus

        # Check permissions
        can_read, _, _, _ = cls._compute_effective_permissions(
            user, document_id, corpus_id
        )
        if not can_read:
            return Datacell.objects.none()

        # Get corpus metadata schema
        try:
            corpus = Corpus.objects.get(pk=corpus_id)
            if not hasattr(corpus, "metadata_schema") or not corpus.metadata_schema:
                return Datacell.objects.none()

            qs = Datacell.objects.filter(
                document_id=document_id,
                column__fieldset=corpus.metadata_schema,
            )

            if manual_only:
                qs = qs.filter(column__is_manual_entry=True)

            return qs.select_related("column", "creator")

        except Corpus.DoesNotExist:
            return Datacell.objects.none()

    @classmethod
    def get_documents_metadata_batch(
        cls,
        user,
        document_ids: list[int],
        corpus_id: int,
        manual_only: bool = True,
        context=None,
    ) -> dict[int, list[Datacell]]:
        """
        Get metadata datacells for multiple documents in a single optimized query.

        This method solves the N+1 problem when loading metadata for a grid view.
        Instead of fetching metadata for each document individually, this fetches
        all metadata for all requested documents in one database query.

        Permission model:
        - Each document is checked against document + corpus permissions (MIN logic)
        - Only datacells for documents the user can read are returned

        Args:
            user: The requesting user
            document_ids: List of document IDs (local, not global)
            corpus_id: The corpus ID (local, not global)
            manual_only: If True, only return manual entry datacells (default)
            context: Optional GraphQL context for request-level caching

        Returns:
            Dict mapping document_id -> list of Datacell objects
        """
        from opencontractserver.corpuses.models import Corpus
        from opencontractserver.documents.models import Document
        from opencontractserver.types.enums import PermissionTypes
        from opencontractserver.utils.permissioning import user_has_permission_for_obj

        result: dict[int, list[Datacell]] = defaultdict(list)

        if not document_ids:
            return result

        # Check corpus permission first (applies to all documents)
        try:
            corpus = Corpus.objects.get(pk=corpus_id)
        except Corpus.DoesNotExist:
            return result

        # Superuser check
        if not user.is_superuser:
            # Anonymous user corpus check
            if user.is_anonymous:
                if not corpus.is_public:
                    return result
            # Authenticated user corpus check
            elif not user_has_permission_for_obj(
                user, corpus, PermissionTypes.READ, include_group_permissions=True
            ):
                return result

        # Check if corpus has metadata schema
        if not hasattr(corpus, "metadata_schema") or not corpus.metadata_schema:
            return result

        # Get all documents and check permissions
        documents = Document.objects.filter(pk__in=document_ids)

        if user.is_superuser:
            readable_doc_ids = set(document_ids)
        elif user.is_anonymous:
            # Anonymous users can only read public documents
            readable_doc_ids = set(
                documents.filter(is_public=True).values_list("id", flat=True)
            )
        else:
            # Check document permissions for each document
            # This is still O(n) permission checks, but documents are fetched in one query
            readable_doc_ids = set()
            for doc in documents:
                if user_has_permission_for_obj(
                    user, doc, PermissionTypes.READ, include_group_permissions=True
                ):
                    readable_doc_ids.add(doc.pk)

        if not readable_doc_ids:
            return result

        # Initialize result with empty lists for all readable documents
        # This ensures documents with no datacells are still included in the result
        for doc_id in readable_doc_ids:
            result[doc_id] = []

        # Single query for all datacells with related data
        qs = Datacell.objects.filter(
            document_id__in=readable_doc_ids,
            column__fieldset=corpus.metadata_schema,
        )

        if manual_only:
            qs = qs.filter(column__is_manual_entry=True)

        # Optimize with select_related for efficient joins
        datacells = qs.select_related("column", "document", "creator")

        # Group by document
        for datacell in datacells:
            result[datacell.document_id].append(datacell)

        return result

    @classmethod
    def get_metadata_completion_status(
        cls,
        user,
        document_id: int,
        corpus_id: int,
    ) -> dict | None:
        """
        Get metadata completion status for a document.

        Returns:
            Dict with total_fields, filled_fields, missing_fields, percentage, missing_required
            or None if user doesn't have permission
        """
        from opencontractserver.corpuses.models import Corpus

        # Check permissions
        can_read, _, _, _ = cls._compute_effective_permissions(
            user, document_id, corpus_id
        )
        if not can_read:
            return None

        try:
            corpus = Corpus.objects.get(pk=corpus_id)
        except Corpus.DoesNotExist:
            return None

        # Check if corpus has metadata schema
        if not hasattr(corpus, "metadata_schema") or not corpus.metadata_schema:
            return {
                "total_fields": 0,
                "filled_fields": 0,
                "missing_fields": 0,
                "percentage": 100.0,
                "missing_required": [],
            }

        columns = corpus.metadata_schema.columns.filter(is_manual_entry=True)
        total_fields = columns.count()

        if total_fields == 0:
            return {
                "total_fields": 0,
                "filled_fields": 0,
                "missing_fields": 0,
                "percentage": 100.0,
                "missing_required": [],
            }

        # Get filled datacells
        filled_datacells = Datacell.objects.filter(
            document_id=document_id, column__in=columns
        ).exclude(data__value__isnull=True)

        filled_count = filled_datacells.count()
        filled_column_ids = set(filled_datacells.values_list("column_id", flat=True))

        # Find missing required fields
        missing_required = []
        for column in columns:
            if column.id not in filled_column_ids:
                config = column.validation_config or {}
                if config.get("required", False):
                    missing_required.append(column.name)

        percentage = (filled_count / total_fields * 100) if total_fields > 0 else 0

        return {
            "total_fields": total_fields,
            "filled_fields": filled_count,
            "missing_fields": total_fields - filled_count,
            "percentage": percentage,
            "missing_required": missing_required,
        }

    @classmethod
    def check_metadata_mutation_permission(
        cls,
        user,
        document_id: int,
        corpus_id: int,
        permission_type: str = "UPDATE",
    ) -> tuple[bool, str]:
        """
        Check if user has permission to mutate metadata on a document.

        This applies the MIN(document_permission, corpus_permission) model
        for metadata mutations (create, update, delete).

        Args:
            user: The requesting user
            document_id: The document ID (local, not global)
            corpus_id: The corpus ID (local, not global)
            permission_type: "UPDATE" or "DELETE" (default: "UPDATE")

        Returns:
            Tuple of (has_permission: bool, error_message: str)
            If has_permission is True, error_message will be empty.
        """
        from opencontractserver.corpuses.models import Corpus
        from opencontractserver.documents.models import Document
        from opencontractserver.types.enums import PermissionTypes
        from opencontractserver.utils.permissioning import user_has_permission_for_obj

        # Anonymous users cannot mutate
        if user.is_anonymous:
            return False, "Authentication required"

        # Superusers can do anything
        if user.is_superuser:
            return True, ""

        # Check document exists
        try:
            document = Document.objects.get(id=document_id)
        except Document.DoesNotExist:
            return False, "Document not found"

        # Check corpus exists
        try:
            corpus = Corpus.objects.get(id=corpus_id)
        except Corpus.DoesNotExist:
            return False, "Corpus not found"

        # Determine which permission to check
        perm_type = (
            PermissionTypes.DELETE
            if permission_type == "DELETE"
            else PermissionTypes.UPDATE
        )

        # Check document permission (primary)
        doc_has_perm = user_has_permission_for_obj(
            user, document, perm_type, include_group_permissions=True
        )
        if not doc_has_perm:
            return False, f"You don't have {permission_type} permission on this document"

        # Check corpus permission (secondary) - MIN logic
        corpus_has_perm = user_has_permission_for_obj(
            user, corpus, perm_type, include_group_permissions=True
        )
        if not corpus_has_perm:
            return False, f"You don't have {permission_type} permission on this corpus"

        return True, ""

    @classmethod
    def validate_metadata_column(
        cls,
        column_id: int,
        corpus_id: int,
    ) -> tuple[bool, str, "Column | None"]:
        """
        Validate that a column belongs to the corpus's metadata schema and is manual entry.

        Args:
            column_id: The column ID (local, not global)
            corpus_id: The corpus ID (local, not global)

        Returns:
            Tuple of (is_valid: bool, error_message: str, column: Column | None)
        """
        from opencontractserver.corpuses.models import Corpus

        try:
            column = Column.objects.get(pk=column_id)
        except Column.DoesNotExist:
            return False, "Column not found", None

        try:
            corpus = Corpus.objects.get(pk=corpus_id)
        except Corpus.DoesNotExist:
            return False, "Corpus not found", None

        # Check column belongs to corpus metadata schema
        if not (
            column.fieldset
            and hasattr(column.fieldset, "corpus")
            and column.fieldset.corpus_id == corpus.id
        ):
            return False, "Column does not belong to corpus metadata schema", None

        # Check it's a manual entry column
        if not column.is_manual_entry:
            return False, "Only manual entry columns can be modified", None

        return True, "", column
