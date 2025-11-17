"""
Custom managers for the M2M to DocumentPath migration.

This module provides backward-compatible managers that use DocumentPath
as the source of truth while maintaining the M2M interface for legacy code.

Part of Issue #654: Resolving dual source of truth between corpus.documents
and DocumentPath model.
"""

import logging
import warnings
from contextvars import ContextVar
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.db.models import Q

logger = logging.getLogger(__name__)
User = get_user_model()

# Thread-local context for legacy M2M operations
# Using contextvars for async-safe thread-local storage
_document_path_context: ContextVar[Optional["DocumentPathContext"]] = ContextVar(
    "document_path_context", default=None
)


class DocumentPathContext:
    """
    Provides user and path context for legacy M2M operations.

    This context manager allows legacy code using corpus.documents.add()
    to work with the new DocumentPath-based system by providing the missing
    user and path information.

    Usage:
        with DocumentPathContext(user=request.user):
            corpus.documents.add(doc1, doc2)
    """

    def __init__(
        self,
        user: User,
        default_folder=None,
        default_path_prefix: str = "/legacy",
        auto_generate_paths: bool = True,
    ):
        """
        Initialize the context for legacy M2M operations.

        Args:
            user: The user performing the operation (required for audit trail)
            default_folder: Default folder to place documents in
            default_path_prefix: Prefix for auto-generated paths
            auto_generate_paths: Whether to auto-generate paths from document titles
        """
        self.user = user
        self.default_folder = default_folder
        self.default_path_prefix = default_path_prefix
        self.auto_generate_paths = auto_generate_paths
        self._token = None

    def __enter__(self):
        """Enter the context and set thread-local storage."""
        self._token = _document_path_context.set(self)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit the context and reset thread-local storage."""
        if self._token:
            _document_path_context.reset(self._token)

    @classmethod
    def get_current(cls) -> Optional["DocumentPathContext"]:
        """Get the current context from thread-local storage."""
        return _document_path_context.get()

    def generate_path_for_document(self, document) -> str:
        """Generate a filesystem path for a document."""
        if self.auto_generate_paths and document.title:
            # Sanitize title for filesystem path
            safe_title = "".join(
                c if c.isalnum() or c in "-_." else "_" for c in document.title[:100]
            )
            return f"{self.default_path_prefix}/{safe_title or f'doc_{document.pk}'}"
        return f"{self.default_path_prefix}/doc_{document.pk}"


class DocumentCorpusRelationshipManager(models.Manager):
    """
    Custom manager that replaces the default M2M manager for corpus.documents.

    This manager:
    - Uses DocumentPath as the source of truth for reads
    - Intercepts write operations and creates/updates DocumentPath records
    - Provides deprecation warnings to guide migration
    - Maintains backward compatibility with existing code
    """

    def __init__(self, corpus_field_name="corpus", through=None):
        """
        Initialize the custom manager.

        Args:
            corpus_field_name: Name of the field pointing to the corpus
            through: The through model (for compatibility, not used)
        """
        super().__init__()
        self.corpus_field_name = corpus_field_name
        self._corpus = None
        self._deprecation_warning_shown = False

    def __get__(self, instance, owner):
        """Called when accessing corpus.documents."""
        if instance is None:
            return self
        # Create a new instance bound to this specific corpus
        manager = self.__class__(self.corpus_field_name)
        manager._corpus = instance
        manager.model = self.model
        return manager

    def _show_deprecation_warning(self, operation: str):
        """Show deprecation warning once per manager instance."""
        if not self._deprecation_warning_shown:
            warnings.warn(
                f"corpus.documents.{operation}() is deprecated. "
                f"Use corpus.add_document() or corpus.remove_document() instead. "
                f"This provides better audit trail and version tracking.",
                DeprecationWarning,
                stacklevel=3,
            )
            self._deprecation_warning_shown = True

    def get_queryset(self):
        """
        Return documents that have active DocumentPaths in this corpus.

        This makes corpus.documents.all() return the correct set of documents
        based on the DocumentPath source of truth.
        """
        if not self._corpus:
            # Return empty queryset if not bound to a corpus
            from opencontractserver.documents.models import Document

            return Document.objects.none()

        from opencontractserver.documents.models import Document, DocumentPath

        # Get all documents with active paths in this corpus
        active_doc_ids = DocumentPath.objects.filter(
            corpus=self._corpus, is_current=True, is_deleted=False
        ).values_list("document_id", flat=True)

        return Document.objects.filter(id__in=active_doc_ids).distinct()

    def all(self):
        """Return all documents with active paths in this corpus."""
        return self.get_queryset()

    def count(self):
        """Return count of documents with active paths in this corpus."""
        return self.get_queryset().count()

    def filter(self, *args, **kwargs):
        """Filter documents that have active paths in this corpus."""
        return self.get_queryset().filter(*args, **kwargs)

    def exclude(self, *args, **kwargs):
        """Exclude documents from those with active paths in this corpus."""
        return self.get_queryset().exclude(*args, **kwargs)

    def exists(self):
        """Check if any documents have active paths in this corpus."""
        return self.get_queryset().exists()

    def add(self, *documents, **kwargs):
        """
        Add documents to the corpus by creating DocumentPath records.

        This method provides backward compatibility for corpus.documents.add()
        while using DocumentPath as the underlying storage mechanism.
        """
        self._show_deprecation_warning("add")

        if not self._corpus:
            raise ValueError("Manager not bound to a corpus instance")

        # Get context for user and path information
        context = DocumentPathContext.get_current()
        if not context:
            raise RuntimeError(
                "DocumentPathContext required for legacy M2M operations. "
                "Wrap your code with: "
                "with DocumentPathContext(user=request.user): ..."
            )

        from opencontractserver.documents.models import DocumentPath

        added_count = 0
        with transaction.atomic():
            for doc in documents:
                # Check if document already exists at any path in this corpus
                existing_path = DocumentPath.objects.filter(
                    corpus=self._corpus,
                    document=doc,
                    is_current=True,
                    is_deleted=False,
                ).first()

                if existing_path:
                    logger.debug(
                        f"Document {doc.pk} already exists in corpus {self._corpus.pk} "
                        f"at path {existing_path.path}"
                    )
                    continue

                # Generate path for this document
                path = context.generate_path_for_document(doc)

                # Ensure path is unique in this corpus
                path_counter = 0
                original_path = path
                while DocumentPath.objects.filter(
                    corpus=self._corpus,
                    path=path,
                    is_current=True,
                    is_deleted=False,
                ).exists():
                    path_counter += 1
                    path = f"{original_path}_{path_counter}"

                # For legacy M2M add, we create a simple DocumentPath record
                # without going through the full import_document process
                # This preserves the original Document instance
                DocumentPath.objects.create(
                    document=doc,
                    corpus=self._corpus,
                    folder=context.default_folder,
                    path=path,
                    version_number=1,  # First appearance in this corpus
                    parent=None,  # Root of path tree for this document in this corpus
                    is_current=True,
                    is_deleted=False,
                    creator=context.user,
                )

                added_count += 1
                logger.info(
                    f"Added document {doc.pk} to corpus {self._corpus.pk} "
                    f"via DocumentPath at {path}"
                )

        return added_count

    def remove(self, *documents, **kwargs):
        """
        Remove documents from the corpus by soft-deleting DocumentPath records.

        This method provides backward compatibility for corpus.documents.remove()
        while using DocumentPath soft-deletion.
        """
        self._show_deprecation_warning("remove")

        if not self._corpus:
            raise ValueError("Manager not bound to a corpus instance")

        # Get context for user information
        context = DocumentPathContext.get_current()
        if not context:
            raise RuntimeError(
                "DocumentPathContext required for legacy M2M operations. "
                "Wrap your code with: "
                "with DocumentPathContext(user=request.user): ..."
            )

        from opencontractserver.documents.models import DocumentPath

        removed_count = 0
        with transaction.atomic():
            for doc in documents:
                # Find all active paths for this document in this corpus
                active_paths = DocumentPath.objects.filter(
                    corpus=self._corpus,
                    document=doc,
                    is_current=True,
                    is_deleted=False,
                )

                for path_record in active_paths:
                    # Mark the current path as not current
                    path_record.is_current = False
                    path_record.save(update_fields=["is_current"])

                    # Create a new soft-deleted DocumentPath record
                    DocumentPath.objects.create(
                        document=path_record.document,
                        corpus=self._corpus,
                        folder=path_record.folder,
                        path=path_record.path,
                        version_number=path_record.version_number,
                        parent=path_record,  # Parent is the previous active record
                        is_deleted=True,  # Soft delete
                        is_current=True,
                        creator=context.user,
                    )

                    removed_count += 1
                    logger.info(
                        f"Soft-deleted document {doc.pk} from corpus "
                        f"{self._corpus.pk} at path {path_record.path}"
                    )

        return removed_count

    def clear(self, **kwargs):
        """
        Remove all documents from the corpus.

        This soft-deletes all DocumentPath records for this corpus.
        """
        self._show_deprecation_warning("clear")

        if not self._corpus:
            raise ValueError("Manager not bound to a corpus instance")

        # Get all documents and remove them
        documents = self.all()
        return self.remove(*documents, **kwargs)

    def set(self, objs, **kwargs):
        """
        Set the corpus documents to exactly the given set.

        This clears existing documents and adds the new ones.
        """
        self._show_deprecation_warning("set")

        with transaction.atomic():
            self.clear(**kwargs)
            self.add(*objs, **kwargs)


def install_custom_manager():
    """
    Install the custom manager on the Corpus model.

    This function should be called in the app's ready() method to replace
    the default M2M manager with our custom implementation.
    """
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    # Check if we need to install the manager
    if not hasattr(Corpus, "_custom_manager_installed"):
        logger.info("Installing custom DocumentCorpusRelationshipManager")

        # Store the original descriptor for potential rollback
        original_descriptor = Corpus.documents

        # Create and install our custom manager
        manager = DocumentCorpusRelationshipManager()
        manager.model = Document

        # Replace the descriptor
        Corpus.documents = manager
        Corpus._custom_manager_installed = True
        Corpus._original_documents_descriptor = original_descriptor

        logger.info("Custom DocumentCorpusRelationshipManager installed successfully")


def uninstall_custom_manager():
    """
    Uninstall the custom manager and restore the original M2M manager.

    This function can be used for testing or rolling back the changes.
    """
    from opencontractserver.corpuses.models import Corpus

    if hasattr(Corpus, "_custom_manager_installed") and hasattr(
        Corpus, "_original_documents_descriptor"
    ):
        logger.info("Uninstalling custom DocumentCorpusRelationshipManager")
        Corpus.documents = Corpus._original_documents_descriptor
        delattr(Corpus, "_custom_manager_installed")
        delattr(Corpus, "_original_documents_descriptor")
        logger.info("Original M2M manager restored")