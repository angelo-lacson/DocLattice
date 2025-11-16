"""
Dual-Tree Document Versioning Operations

This module implements the core operations for the dual-tree versioning architecture.
It provides functions for import, move, delete, restore, and query operations on documents
within the corpus filesystem.

Architecture Rules Implemented:
- Content Tree (Document model):
  - C1: New Document only when hash first seen globally
  - C2: Updates create child nodes of previous version
  - C3: Only one current Document per version tree

- Path Tree (DocumentPath model):
  - P1: Every lifecycle event creates new node
  - P2: New nodes are children of previous state
  - P3: Only current filesystem state is is_current=True
  - P4: One active path per (corpus, path) tuple
  - P5: Version number increments only on content changes
  - P6: Folder deletion sets folder=NULL

- Interaction Rules:
  - I1: Corpuses share Documents but have independent paths
  - Q1: Content "truly deleted" when no active paths point to it
"""

import hashlib
import logging
import uuid
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction

from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.documents.models import Document, DocumentPath

logger = logging.getLogger(__name__)
User = get_user_model()


def compute_sha256(content: bytes) -> str:
    """Compute SHA-256 hash of content."""
    return hashlib.sha256(content).hexdigest()


def calculate_content_version(document: Document) -> int:
    """
    Calculate the version number of a document by counting
    ancestors in the content tree.

    Implements: Rule C2 traversal
    """
    count = 1
    current = document
    while current.parent_id:
        count += 1
        current = current.parent
    return count


def import_document(
    corpus: Corpus,
    path: str,
    content: bytes,
    user: User,
    folder: Optional[CorpusFolder] = None,
    pdf_file=None,
    **doc_kwargs,
) -> tuple[Document, str, DocumentPath]:
    """
    Import or update a document with dual-tree versioning logic.

    This implements the interaction rules for document import according to
    the dual-tree architecture specification.

    Args:
        corpus: The corpus to import into
        path: The filesystem path within the corpus
        content: The PDF file content as bytes
        user: The user performing the import
        folder: Optional folder to place the document in
        pdf_file: Optional Django file object for the PDF
        **doc_kwargs: Additional keyword arguments for Document creation

    Returns:
        Tuple of (document, status, path_record) where status is one of:
        - 'created': Brand new document
        - 'updated': Content changed at existing path
        - 'unchanged': No change detected
        - 'cross_corpus_import': Content exists elsewhere, new path created

    Implements: Rules C1, C2, C3, P1, P2, P4, P5, I1
    """
    content_hash = compute_sha256(content)

    with transaction.atomic():
        # Step 1: Check Content Tree (Rules C1, C2)
        existing_doc = (
            Document.objects.filter(pdf_file_hash=content_hash)
            .select_for_update()
            .first()
        )

        # Step 2: Check Path Tree (Rules P1, P4)
        current_path = (
            DocumentPath.objects.filter(
                corpus=corpus, path=path, is_current=True, is_deleted=False
            )
            .select_for_update()
            .first()
        )

        if current_path:
            # Path exists - check if content changed
            if current_path.document.pdf_file_hash == content_hash:
                logger.info(
                    f"No content change detected for {path} in corpus {corpus.id}"
                )
                return current_path.document, "unchanged", current_path

            # Content changed - apply Rule C2
            old_doc = current_path.document

            if existing_doc:
                # Content exists elsewhere - use it (Rule I1)
                new_doc = existing_doc
                logger.info(
                    f"Content already exists as doc {existing_doc.id}, "
                    f"reusing for {path} in corpus {corpus.id}"
                )
            else:
                # Create new version (Rule C2)
                logger.info(
                    f"Creating new version of doc {old_doc.id} for {path} "
                    f"in corpus {corpus.id}"
                )

                # Rule C3: Mark old as not current
                Document.objects.filter(version_tree_id=old_doc.version_tree_id).update(
                    is_current=False
                )

                # Create new document version
                new_doc = Document.objects.create(
                    title=doc_kwargs.get("title", old_doc.title),
                    description=doc_kwargs.get("description", old_doc.description),
                    file_type=doc_kwargs.get("file_type", old_doc.file_type),
                    pdf_file=pdf_file or old_doc.pdf_file,
                    pdf_file_hash=content_hash,
                    version_tree_id=old_doc.version_tree_id,
                    parent=old_doc,  # Rule C2
                    is_current=True,  # Rule C3
                    creator=user,
                    **{
                        k: v
                        for k, v in doc_kwargs.items()
                        if k not in ["title", "description", "file_type"]
                    },
                )

            # Apply Rules P1, P2, P3
            current_path.is_current = False
            current_path.save(update_fields=["is_current"])

            new_path = DocumentPath.objects.create(
                document=new_doc,
                corpus=corpus,
                folder=folder or current_path.folder,
                path=path,
                version_number=current_path.version_number + 1,  # Rule P5
                parent=current_path,  # Rule P2
                is_current=True,  # Rule P3
                is_deleted=False,
                creator=user,
            )

            logger.info(
                f"Updated {path} in corpus {corpus.id}: "
                f"doc {old_doc.id} v{current_path.version_number} → "
                f"doc {new_doc.id} v{new_path.version_number}"
            )

            return new_doc, "updated", new_path

        else:
            # New path
            if existing_doc:
                # Content exists elsewhere (Rule I1)
                doc = existing_doc
                # Calculate actual content version from tree depth
                version = calculate_content_version(doc)
                status = "cross_corpus_import"
                logger.info(
                    f"Cross-corpus import: doc {doc.id} v{version} "
                    f"to {path} in corpus {corpus.id}"
                )
            else:
                # Brand new content (Rule C1)
                tree_id = uuid.uuid4()
                doc = Document.objects.create(
                    title=doc_kwargs.get("title", f"Document at {path}"),
                    description=doc_kwargs.get("description", ""),
                    file_type=doc_kwargs.get("file_type", "application/pdf"),
                    pdf_file=pdf_file,
                    pdf_file_hash=content_hash,
                    version_tree_id=tree_id,
                    is_current=True,
                    parent=None,  # Root of content tree
                    creator=user,
                    **{
                        k: v
                        for k, v in doc_kwargs.items()
                        if k not in ["title", "description", "file_type"]
                    },
                )
                version = 1  # First version of new content
                status = "created"
                logger.info(f"Created new doc {doc.id} at {path} in corpus {corpus.id}")

            # Create root of path tree (Rule P1)
            new_path = DocumentPath.objects.create(
                document=doc,
                corpus=corpus,
                folder=folder,
                path=path,
                version_number=version,
                parent=None,  # Root of path tree
                is_current=True,
                is_deleted=False,
                creator=user,
            )

            return doc, status, new_path


def move_document(
    corpus: Corpus,
    old_path: str,
    new_path: str,
    user: User,
    new_folder: Optional[CorpusFolder] = "UNSET",
) -> DocumentPath:
    """
    Move document - creates new DocumentPath, Document unchanged.

    Implements: Rules P1, P2, P3, P5 (no version increment on move)

    Note: new_folder defaults to 'UNSET' to distinguish between "keep current folder"
    and "explicitly set to None". Pass None explicitly to remove folder.
    """
    with transaction.atomic():
        current = DocumentPath.objects.select_for_update().get(
            corpus=corpus, path=old_path, is_current=True, is_deleted=False
        )

        # Apply Rule P3
        current.is_current = False
        current.save(update_fields=["is_current"])

        # Determine folder for new path
        if new_folder == "UNSET":
            # Not specified, keep current folder
            folder_to_use = current.folder
        else:
            # Explicitly set (could be None or a folder)
            folder_to_use = new_folder

        # Apply Rules P1, P2
        new_path_record = DocumentPath.objects.create(
            document=current.document,  # Same content
            corpus=corpus,
            folder=folder_to_use,
            path=new_path,
            version_number=current.version_number,  # Rule P5 - no increment
            parent=current,  # Rule P2
            is_current=True,
            is_deleted=False,
            creator=user,
        )

        logger.info(
            f"Moved doc {current.document_id} in corpus {corpus.id}: "
            f"{old_path} → {new_path}"
        )

        return new_path_record


def delete_document(corpus: Corpus, path: str, user: User) -> DocumentPath:
    """
    Soft delete - creates deleted DocumentPath.

    Implements: Rules P1, P2, P3, P5 (no version increment on delete)
    """
    with transaction.atomic():
        current = DocumentPath.objects.select_for_update().get(
            corpus=corpus, path=path, is_current=True, is_deleted=False
        )

        current.is_current = False
        current.save(update_fields=["is_current"])

        deleted_path = DocumentPath.objects.create(
            document=current.document,
            corpus=corpus,
            folder=current.folder,
            path=current.path,
            version_number=current.version_number,  # Rule P5
            parent=current,  # Rule P2
            is_deleted=True,  # Soft delete
            is_current=True,
            creator=user,
        )

        logger.info(
            f"Soft deleted doc {current.document_id} at {path} "
            f"in corpus {corpus.id}"
        )

        return deleted_path


def restore_document(corpus: Corpus, path: str, user: User) -> DocumentPath:
    """
    Restore deleted document.

    Implements: Rules P1, P2, P3
    """
    with transaction.atomic():
        deleted = DocumentPath.objects.select_for_update().get(
            corpus=corpus, path=path, is_current=True, is_deleted=True
        )

        deleted.is_current = False
        deleted.save(update_fields=["is_current"])

        restored_path = DocumentPath.objects.create(
            document=deleted.document,
            corpus=corpus,
            folder=deleted.folder,
            path=deleted.path,
            version_number=deleted.version_number,
            parent=deleted,
            is_deleted=False,  # Not deleted
            is_current=True,
            creator=user,
        )

        logger.info(
            f"Restored doc {deleted.document_id} at {path} " f"in corpus {corpus.id}"
        )

        return restored_path


# ========== Query Functions ==========


def get_current_filesystem(corpus: Corpus):
    """
    Get current filesystem state for a corpus.

    Returns: QuerySet of active DocumentPath records

    Implements: Rule P3
    """
    return DocumentPath.objects.filter(
        corpus=corpus, is_current=True, is_deleted=False
    ).select_related("document", "folder")


def get_content_history(document: Document):
    """
    Traverse content tree upward to get version history.

    Returns: List of Documents from oldest to newest

    Implements: Rule C2 traversal
    """
    history = []
    current = document
    while current:
        history.append(current)
        current = current.parent
    return list(reversed(history))  # Oldest to newest


def get_path_history(document_path: DocumentPath):
    """
    Traverse path tree upward to get lifecycle history.

    Returns: List of dicts with path lifecycle events from oldest to newest

    Implements: Rule P2 traversal
    """

    def determine_action(current, previous):
        """Determine what action this path record represents."""
        if not previous:
            return "CREATED"
        if current.is_deleted and not previous.is_deleted:
            return "DELETED"
        if not current.is_deleted and previous.is_deleted:
            return "RESTORED"
        if current.path != previous.path:
            return "MOVED"
        if current.document_id != previous.document_id:
            return "UPDATED"
        return "UNKNOWN"

    history = []
    current = document_path
    while current:
        history.append(
            {
                "id": current.id,
                "timestamp": current.created,
                "path": current.path,
                "version": current.version_number,
                "deleted": current.is_deleted,
                "document_id": current.document_id,
                "action": determine_action(current, current.parent),
            }
        )
        current = current.parent

    return list(reversed(history))  # Oldest to newest


def get_filesystem_at_time(corpus: Corpus, timestamp):
    """
    Reconstruct filesystem at specific time (time-travel query).

    Returns: QuerySet of DocumentPath records representing filesystem state

    Implements: Time-travel capability using Rule P1 (temporal tree)
    """
    from django.db.models import OuterRef, Subquery

    # For each unique path, find the most recent DocumentPath before timestamp
    newest_before_time = (
        DocumentPath.objects.filter(
            corpus=corpus, created__lte=timestamp, path=OuterRef("path")
        )
        .order_by("-created")
        .values("id")[:1]
    )

    return (
        DocumentPath.objects.filter(id__in=Subquery(newest_before_time))
        .exclude(is_deleted=True)
        .select_related("document", "folder")
    )


def is_content_truly_deleted(document: Document, corpus: Corpus) -> bool:
    """
    Check if content is "truly deleted" (no active paths point to it).

    Implements: Rule Q1
    """
    return not DocumentPath.objects.filter(
        document=document, corpus=corpus, is_current=True, is_deleted=False
    ).exists()
