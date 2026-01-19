import logging
from pathlib import Path
from typing import Optional

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction

from config import celery_app
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

# Excellent django logging guidance here: https://docs.python.org/3/howto/logging-cookbook.html
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@celery_app.task()
def fork_corpus(
    new_corpus_id: str,
    doc_ids: list[str],
    label_set_id: str,
    annotation_ids: list[str],
    folder_ids: list[str],
    relationship_ids: list[str],
    user_id: str,
) -> Optional[str]:

    logger.info(
        f"Start fork_corpus -----\n\tnew_corpus_id: {new_corpus_id}\n\tdoc_ids: "
        f"{doc_ids}\n\tannotation_ids: {annotation_ids}\n\tuser_id: {user_id}"
    )

    # We need reference to corpus model so we can unlock it upon completion
    corpus = Corpus.objects.get(pk=new_corpus_id)

    with transaction.atomic():

        try:

            label_map = {}
            doc_map = {}
            label_ids = []

            try:
                # Create the label set copy first.
                old_label_set = LabelSet.objects.get(pk=label_set_id)
                label_ids = list(
                    old_label_set.annotation_labels.all().values_list("id", flat=True)
                )

                label_set = LabelSet(
                    creator_id=user_id,
                    title=f"[FORK] {old_label_set.title}",
                    description=old_label_set.description,
                )
                label_set.save()
                logger.info(f"Cloned labelset: {label_set}")

                # If there's an icon... copy it to a new file
                if old_label_set.icon:
                    icon_obj = default_storage.open(old_label_set.icon.name)
                    icon_file = ContentFile(icon_obj.read())
                    logger.info(
                        f"Label set icon name: {Path(old_label_set.icon.name).name}"
                    )
                    label_set.icon.save(Path(old_label_set.icon.name).name, icon_file)
                    label_set.save()

            except Exception as e:
                logger.error(f"ERROR forking label_set for corpus {new_corpus_id}: {e}")
                raise e

            # Get old label objs (can't just get these earlier as manytomany values are cleared by django when we call
            # clear(), it seems)
            # Copy labels and add new labels to label_set
            logger.info("Cloning labels")
            try:
                for old_label in AnnotationLabel.objects.filter(pk__in=label_ids):

                    try:
                        new_label = AnnotationLabel(
                            creator_id=user_id,
                            label_type=old_label.label_type,
                            color=old_label.color,
                            description=old_label.description,
                            icon=old_label.icon,
                            text=old_label.text,
                        )
                        new_label.save()

                        # store map of old id to new id
                        label_map[old_label.id] = new_label.id

                        # Add to new labelset
                        label_set.annotation_labels.add(new_label)

                    except Exception as e:
                        logger.error(
                            f"ERROR - could not fork label for labelset {label_set_id}: {e}"
                        )

                # Save label_set
                label_set.save()

                # Update corpus LabelSet to point to cloned copy of original labelset:
                corpus.label_set = label_set

            except Exception as e:
                logger.error(
                    f"ERROR - could not populate labels for labelset {label_set_id}: {e}"
                )
                raise e

            # ============================================================
            # Clone folder structure (must be before documents)
            # ============================================================
            folder_map = {}  # old_folder_id -> new_folder_id

            logger.info(f"Cloning {len(folder_ids)} folders")
            for old_folder in CorpusFolder.objects.filter(pk__in=folder_ids).order_by(
                "tree_depth", "pk"
            ):
                try:
                    new_folder = CorpusFolder(
                        name=old_folder.name,
                        corpus_id=new_corpus_id,
                        description=old_folder.description,
                        color=old_folder.color,
                        icon=old_folder.icon,
                        tags=old_folder.tags.copy() if old_folder.tags else [],
                        is_public=old_folder.is_public,
                        creator_id=user_id,
                        # Map parent to new folder ID (None if root)
                        parent_id=folder_map.get(old_folder.parent_id),
                    )
                    new_folder.save()
                    folder_map[old_folder.pk] = new_folder.pk

                    set_permissions_for_obj_to_user(
                        user_id, new_folder, [PermissionTypes.CRUD]
                    )
                    logger.info(f"Cloned folder {old_folder.name} -> {new_folder.pk}")

                except Exception as e:
                    logger.error(f"ERROR cloning folder {old_folder.pk}: {e}")
                    raise e

            # ============================================================
            # Clone documents
            # ============================================================
            for document in Document.objects.filter(pk__in=doc_ids):

                try:
                    logger.info(f"Clone document: {document}")
                    old_id = document.pk

                    # First start by copying the document (the procedure below
                    # is a trick to get ORM to copy the Django database obj). Resetting
                    # pk to None will, on save, save a NEW object with old obj properties,
                    # except as modified
                    document.pk = None
                    document.title = f"[FORK] {document.title}"
                    document.creator_id = user_id
                    document.backend_lock = True  # Lock doc while we process stuff
                    document.save()

                    # If there's a text extract file... copy it to a new file
                    if document.txt_extract_file:
                        file_object = default_storage.open(
                            document.txt_extract_file.name
                        )
                        txt_file = ContentFile(file_object.read())
                        document.txt_extract_file.save(f"{document.id}.txt", txt_file)
                        document.save()
                        logger.info("Clone txt layer")

                    # If there's a pawls file... copy it to new file
                    if document.pawls_parse_file:
                        file_object = default_storage.open(
                            document.pawls_parse_file.name
                        )
                        pawls_file = ContentFile(file_object.read())
                        document.pawls_parse_file.save(
                            f"doc_{document.id}.pawls", pawls_file
                        )
                        document.save()
                        logger.info("Cloned pawls file")

                    # Unlock the document.
                    document.backend_lock = False
                    document.save()

                    set_permissions_for_obj_to_user(
                        user_id, document, [PermissionTypes.CRUD]
                    )

                    # Get original DocumentPath to preserve folder and path
                    original_corpus_id = corpus.parent_id
                    original_path = DocumentPath.objects.filter(
                        corpus_id=original_corpus_id,
                        document_id=old_id,
                        is_current=True,
                        is_deleted=False,
                    ).first()

                    # Map folder to new folder ID
                    target_folder = None
                    original_path_str = None
                    if original_path:
                        original_path_str = original_path.path
                        if original_path.folder_id:
                            new_folder_id = folder_map.get(original_path.folder_id)
                            if new_folder_id:
                                target_folder = CorpusFolder.objects.get(pk=new_folder_id)

                    # Add document with preserved folder and path
                    corpus.add_document(
                        document=document,
                        user=user_id,
                        folder=target_folder,
                        path=original_path_str,
                    )

                    # Store map of old id to new id
                    doc_map[old_id] = document.pk

                except Exception as e:
                    logger.error(f"ERROR - could not fork document {document}: {e}")
                    raise e

            # Save updated corpus with docs and new LabelSet.
            corpus.save()

            # ============================================================
            # Clone annotations
            # ============================================================
            logger.info("Start Annotations...")
            logger.info(f"Label map: {label_map}")

            annotation_map = {}  # old_annotation_id -> new_annotation_id

            # Fetch annotations and map to new docs, labels and corpus
            for annotation in Annotation.objects.filter(pk__in=annotation_ids):

                try:
                    old_annotation_id = annotation.pk  # Save before clearing
                    logger.info(f"Clone annotation: {annotation}")

                    # Copy the annotation, update label and doc object references using our
                    # object maps of old objs to new objs
                    annotation.pk = None
                    annotation.creator_id = user_id
                    annotation.corpus_id = new_corpus_id
                    annotation.document_id = doc_map[annotation.document.id]
                    annotation.annotation_label_id = label_map[
                        annotation.annotation_label.id
                    ]
                    annotation.save()

                    # Track mapping for relationship cloning
                    annotation_map[old_annotation_id] = annotation.pk

                    set_permissions_for_obj_to_user(
                        user_id, annotation, [PermissionTypes.CRUD]
                    )

                except Exception as e:
                    logger.error(f"ERROR - could not fork annotation {annotation}: {e}")
                    raise e

            logger.info("Annotations completed...")

            # ============================================================
            # Clone relationships
            # ============================================================
            logger.info(f"Cloning {len(relationship_ids)} relationships")

            for old_relationship in Relationship.objects.filter(pk__in=relationship_ids):
                try:
                    # Get source and target annotation IDs
                    old_source_ids = list(
                        old_relationship.source_annotations.values_list("id", flat=True)
                    )
                    old_target_ids = list(
                        old_relationship.target_annotations.values_list("id", flat=True)
                    )

                    # Map to new annotation IDs (skip if mapping is missing)
                    new_source_ids = [
                        annotation_map[old_id]
                        for old_id in old_source_ids
                        if old_id in annotation_map
                    ]
                    new_target_ids = [
                        annotation_map[old_id]
                        for old_id in old_target_ids
                        if old_id in annotation_map
                    ]

                    # Only create relationship if we have valid mappings
                    if not new_source_ids and not new_target_ids:
                        logger.warning(
                            f"Skipping relationship {old_relationship.pk}: no mapped annotations"
                        )
                        continue

                    # Map document and label
                    new_doc_id = None
                    if old_relationship.document_id:
                        new_doc_id = doc_map.get(old_relationship.document_id)

                    new_label_id = None
                    if old_relationship.relationship_label_id:
                        new_label_id = label_map.get(old_relationship.relationship_label_id)

                    # Create new relationship
                    new_relationship = Relationship(
                        creator_id=user_id,
                        corpus_id=new_corpus_id,
                        document_id=new_doc_id,
                        relationship_label_id=new_label_id,
                    )
                    new_relationship.save()

                    # Set M2M relationships
                    if new_source_ids:
                        new_relationship.source_annotations.set(new_source_ids)
                    if new_target_ids:
                        new_relationship.target_annotations.set(new_target_ids)

                    set_permissions_for_obj_to_user(
                        user_id, new_relationship, [PermissionTypes.CRUD]
                    )

                    logger.info(
                        f"Cloned relationship {old_relationship.pk} -> {new_relationship.pk}"
                    )

                except Exception as e:
                    logger.error(f"ERROR cloning relationship {old_relationship.pk}: {e}")
                    raise e

            logger.info("Relationships completed...")

            # Unlock the corpus
            corpus.backend_lock = False
            corpus.save()

            return corpus.id

        except Exception as e:
            logger.error(f"ERROR - Unable to fork corpus: {e}")
            corpus.backend_lock = False
            corpus.error = True
            corpus.save()
            return None
