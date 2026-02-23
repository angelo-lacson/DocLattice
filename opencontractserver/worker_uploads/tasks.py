"""
Celery tasks for processing staged worker document uploads.

The batch processor drains the WorkerDocumentUpload staging table using
SELECT ... FOR UPDATE SKIP LOCKED, so multiple workers can process
concurrently without conflicts.

All tasks run on the 'worker_uploads' queue to preserve capacity on the
default queue for regular user operations.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile, File
from django.db import transaction
from django.utils import timezone

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    Embedding,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.importing import (
    import_annotations,
    import_relationships,
    load_or_create_labels,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
from opencontractserver.worker_uploads.models import (
    UploadStatus,
    WorkerDocumentUpload,
)

logger = logging.getLogger(__name__)

# Default batch size — overridable via Django settings
BATCH_SIZE = getattr(settings, "WORKER_UPLOAD_BATCH_SIZE", 50)

# Dimension -> field name mapping for the Embedding model
_VECTOR_FIELD_MAP = {
    384: "vector_384",
    768: "vector_768",
    1024: "vector_1024",
    1536: "vector_1536",
    2048: "vector_2048",
    3072: "vector_3072",
    4096: "vector_4096",
}


@shared_task(
    bind=True,
    queue="worker_uploads",
    max_retries=0,
    acks_late=True,
)
def process_pending_uploads(self) -> dict:
    """
    Drain a batch of PENDING uploads from the staging table.

    Uses SELECT ... FOR UPDATE SKIP LOCKED so multiple instances can
    run concurrently. After processing a batch, re-enqueues itself
    if more PENDING rows exist.

    Returns:
        Summary dict with counts of processed, succeeded, and failed.
    """
    result = {"claimed": 0, "succeeded": 0, "failed": 0}

    # Claim a batch of PENDING uploads atomically
    with transaction.atomic():
        pending_ids = list(
            WorkerDocumentUpload.objects.select_for_update(skip_locked=True)
            .filter(status=UploadStatus.PENDING)
            .order_by("created")
            .values_list("id", flat=True)[:BATCH_SIZE]
        )

        if not pending_ids:
            logger.debug("process_pending_uploads: no pending uploads found.")
            return result

        # Mark as PROCESSING
        WorkerDocumentUpload.objects.filter(id__in=pending_ids).update(
            status=UploadStatus.PROCESSING,
            processing_started=timezone.now(),
        )

    result["claimed"] = len(pending_ids)
    logger.info(f"process_pending_uploads: claimed {len(pending_ids)} uploads.")

    # Process each upload in its own transaction for isolation
    for upload_id in pending_ids:
        try:
            _process_single_upload(upload_id)
            result["succeeded"] += 1
        except Exception as e:
            logger.error(
                f"process_pending_uploads: upload {upload_id} failed: {e}",
                exc_info=True,
            )
            WorkerDocumentUpload.objects.filter(id=upload_id).update(
                status=UploadStatus.FAILED,
                error_message=str(e)[:2000],
                processing_finished=timezone.now(),
            )
            result["failed"] += 1

    # Re-enqueue if there are more pending uploads
    remaining = WorkerDocumentUpload.objects.filter(
        status=UploadStatus.PENDING
    ).exists()
    if remaining:
        process_pending_uploads.apply_async(
            queue="worker_uploads",
            countdown=1,  # Brief pause to avoid tight loop
            ignore_result=True,
        )

    logger.info(f"process_pending_uploads: batch result={result}")
    return result


def _process_single_upload(upload_id) -> None:
    """
    Process one WorkerDocumentUpload: create Document, annotations,
    embeddings, and add to the target corpus.

    Runs inside its own transaction. On success, marks COMPLETED.
    On failure, the caller catches the exception and marks FAILED.
    """
    from opencontractserver.documents.models import Document

    upload = WorkerDocumentUpload.objects.select_related(
        "corpus",
        "corpus__creator",
        "corpus_access_token",
        "corpus_access_token__worker_account",
    ).get(id=upload_id)

    metadata = upload.metadata
    corpus = upload.corpus

    # Documents uploaded via workers are owned by the corpus creator,
    # not the service account, so they inherit the correct permissions
    # and appear naturally in the corpus owner's workspace.
    user = corpus.creator

    with transaction.atomic():
        # 1. Create the standalone Document
        doc_filename = metadata.get("title", "document") or "document"

        pawls_content = metadata.get("pawls_file_content", [])
        text_content = metadata.get("content", "")

        pawls_file = ContentFile(
            json.dumps(pawls_content).encode("utf-8"),
            name="pawls_tokens.json",
        )
        txt_file = ContentFile(
            text_content.encode("utf-8"),
            name="extracted_text.txt",
        )

        # Open the uploaded file
        upload.file.open("rb")
        try:
            doc = Document.objects.create(
                title=metadata.get("title", "Untitled"),
                description=metadata.get("description", ""),
                pdf_file=File(upload.file, doc_filename),
                pawls_parse_file=pawls_file,
                txt_extract_file=txt_file,
                file_type=metadata.get("file_type", "application/pdf"),
                page_count=metadata.get("page_count", len(pawls_content)),
                backend_lock=True,
                creator=user,
                # Mark as already processed — worker did the processing
                processing_started=timezone.now(),
                processing_status="completed",
            )
        finally:
            upload.file.close()

        set_permissions_for_obj_to_user(user, doc, [PermissionTypes.ALL])

        # 2. Prepare labels (auto-create any that don't exist)
        labelset = corpus.label_set
        label_lookup, doc_label_lookup = _prepare_labels(metadata, user.id, labelset)

        # 3. Add document to corpus (creates corpus-isolated copy)
        target_path = metadata.get("target_path")
        corpus_doc, _status, _doc_path = corpus.add_document(
            document=doc,
            user=user,
            path=target_path,
        )

        # 4. Import document-level labels
        for doc_label_name in metadata.get("doc_labels", []):
            label_obj = doc_label_lookup.get(doc_label_name)
            if label_obj:
                annot = Annotation.objects.create(
                    annotation_label=label_obj,
                    document=corpus_doc,
                    corpus=corpus,
                    creator_id=user.id,
                )
                set_permissions_for_obj_to_user(user, annot, [PermissionTypes.ALL])

        # 5. Import text annotations
        annot_id_map = import_annotations(
            user_id=user.id,
            doc_obj=corpus_doc,
            corpus_obj=corpus,
            annotations_data=metadata.get("labelled_text", []),
            label_lookup=label_lookup,
        )

        # 6. Import relationships
        if metadata.get("relationships"):
            import_relationships(
                user_id=user.id,
                doc_obj=corpus_doc,
                corpus_obj=corpus,
                relationships_data=metadata["relationships"],
                label_lookup=label_lookup,
                annotation_id_map=annot_id_map,
            )

        # 7. Store pre-computed embeddings
        embeddings_data = metadata.get("embeddings")
        if embeddings_data:
            _store_embeddings(
                embeddings_data=embeddings_data,
                corpus_doc=corpus_doc,
                annot_id_map=annot_id_map,
                user=user,
            )

        # 8. Place in target folder if specified
        target_folder_path = metadata.get("target_folder_path")
        if target_folder_path:
            _assign_to_folder(corpus, corpus_doc, target_folder_path, user)

        # 9. Unlock the original document
        doc.backend_lock = False
        doc.save(update_fields=["backend_lock"])

        # 10. Mark upload as completed
        upload.status = UploadStatus.COMPLETED
        upload.result_document = corpus_doc
        upload.processing_finished = timezone.now()
        upload.save(update_fields=["status", "result_document", "processing_finished"])

    logger.info(
        f"Worker upload {upload_id} processed: doc={corpus_doc.id} "
        f"in corpus={corpus.id}"
    )


def _prepare_labels(
    metadata: dict,
    user_id: int,
    labelset,
) -> tuple[dict[str, AnnotationLabel], dict[str, AnnotationLabel]]:
    """
    Load or create text and document labels from the upload metadata.
    Returns (label_lookup, doc_label_lookup).
    """
    text_labels = metadata.get("text_labels", {})
    doc_labels_defs = metadata.get("doc_labels_definitions", {})

    existing_text = load_or_create_labels(
        user_id=user_id,
        labelset_obj=labelset,
        label_data_dict=text_labels,
        existing_labels={},
    )

    existing_doc = load_or_create_labels(
        user_id=user_id,
        labelset_obj=labelset,
        label_data_dict=doc_labels_defs,
        existing_labels={},
    )

    label_lookup = {**existing_text, **existing_doc}
    doc_label_lookup = {label.text: label for label in existing_doc.values()}

    return label_lookup, doc_label_lookup


def _store_embeddings(
    embeddings_data: dict,
    corpus_doc,
    annot_id_map: dict[str | int, int],
    user,
) -> None:
    """
    Store pre-computed embeddings from the worker.

    Determines the correct vector_* field based on embedding dimension,
    then bulk-creates Embedding records.
    """
    embedder_path = embeddings_data.get("embedder_path", "")
    if not embedder_path:
        logger.warning("embeddings.embedder_path is empty, skipping embedding storage.")
        return

    # Document embedding
    doc_embedding = embeddings_data.get("document_embedding")
    if doc_embedding:
        _store_single_embedding(
            vector=doc_embedding,
            embedder_path=embedder_path,
            document=corpus_doc,
        )

    # Annotation embeddings
    annot_embeddings = embeddings_data.get("annotation_embeddings", {})
    embeddings_to_create = []
    for old_annot_id, vector in annot_embeddings.items():
        new_pk = annot_id_map.get(old_annot_id) or annot_id_map.get(str(old_annot_id))
        if not new_pk:
            logger.debug(
                f"Skipping embedding for unknown annotation ID: {old_annot_id}"
            )
            continue

        field_name = _get_vector_field(len(vector))
        if not field_name:
            logger.warning(
                f"Unsupported embedding dimension {len(vector)} for annotation "
                f"{old_annot_id}, skipping."
            )
            continue

        emb = Embedding(
            annotation_id=new_pk,
            embedder_path=embedder_path,
            creator_id=user.id,
        )
        setattr(emb, field_name, vector)
        embeddings_to_create.append(emb)

    if embeddings_to_create:
        Embedding.objects.bulk_create(embeddings_to_create)
        logger.info(
            f"Stored {len(embeddings_to_create)} annotation embeddings "
            f"(embedder={embedder_path})"
        )


def _store_single_embedding(
    vector: list[float],
    embedder_path: str,
    document=None,
    annotation=None,
) -> Optional[Embedding]:
    """Store a single embedding, determining the correct vector field by dimension."""
    field_name = _get_vector_field(len(vector))
    if not field_name:
        logger.warning(f"Unsupported embedding dimension {len(vector)}, skipping.")
        return None

    kwargs = {
        "embedder_path": embedder_path,
        "document": document,
        "annotation": annotation,
    }
    kwargs[field_name] = vector

    # Use update_or_create to handle duplicates gracefully
    emb, created = Embedding.objects.update_or_create(
        embedder_path=embedder_path,
        document=document,
        annotation=annotation,
        defaults={field_name: vector},
    )
    return emb


def _get_vector_field(dimension: int) -> Optional[str]:
    """Map an embedding dimension to the corresponding Embedding model field."""
    return _VECTOR_FIELD_MAP.get(dimension)


def _assign_to_folder(corpus, corpus_doc, folder_path: str, user) -> None:
    """
    Assign a document to a folder within the corpus, creating the folder
    hierarchy if needed.
    """
    from opencontractserver.corpuses.models import CorpusFolder
    from opencontractserver.documents.models import DocumentPath

    # Build folder hierarchy from path components
    parts = [p.strip() for p in folder_path.strip("/").split("/") if p.strip()]
    if not parts:
        return

    parent = None
    for part_name in parts:
        folder, _created = CorpusFolder.objects.get_or_create(
            corpus=corpus,
            name=part_name,
            parent=parent,
            defaults={
                "creator": user,
            },
        )
        parent = folder

    # Update the DocumentPath to point to this folder
    doc_path = DocumentPath.objects.filter(
        corpus=corpus,
        document=corpus_doc,
        is_current=True,
    ).first()

    if doc_path and parent:
        doc_path.folder = parent
        doc_path.save(update_fields=["folder"])
