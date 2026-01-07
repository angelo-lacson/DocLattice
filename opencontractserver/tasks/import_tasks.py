import base64
import json
import logging
import pathlib
import zipfile
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from opencontractserver.utils.metadata_file_parser import DocumentMetadata

import filetype
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile, File

from config import celery_app
from opencontractserver.annotations.models import (
    DOC_TYPE_LABEL,
    TOKEN_LABEL,
    Annotation,
)
from opencontractserver.corpuses.models import Corpus, TemporaryFileHandle
from opencontractserver.documents.models import Document
from opencontractserver.types.dicts import (
    OpenContractsAnnotatedDocumentImportType,
    OpenContractsExportDataJsonPythonType,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.files import is_plaintext_content
from opencontractserver.utils.importing import import_annotations, load_or_create_labels
from opencontractserver.utils.packaging import (
    unpack_corpus_from_export,
    unpack_label_set_from_export,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@celery_app.task()
def import_corpus(
    temporary_file_handle_id: str | int, user_id: int, seed_corpus_id: Optional[int]
) -> Optional[str]:
    try:
        logger.info(f"import_corpus() - for user_id: {user_id}")

        temporary_file_handle = TemporaryFileHandle.objects.get(
            id=temporary_file_handle_id
        )
        user_obj = User.objects.get(id=user_id)

        with temporary_file_handle.file.open("rb") as import_file, zipfile.ZipFile(
            import_file, mode="r"
        ) as import_zip:
            logger.info("import_corpus() - Data decoded successfully")
            files = import_zip.namelist()
            logger.info(f"import_corpus() - Raw files: {files}")

            if "data.json" in files:
                files.remove("data.json")
                with import_zip.open("data.json") as corpus_data:
                    data_json: OpenContractsExportDataJsonPythonType = json.loads(
                        corpus_data.read().decode("UTF-8")
                    )

                    text_labels = data_json["text_labels"]
                    doc_labels = data_json["doc_labels"]
                    label_set_data = {**data_json["label_set"]}
                    label_set_data.pop("id", None)
                    corpus_data_json = {**data_json["corpus"]}
                    corpus_data_json.pop("id", None)

                    # Create LabelSet
                    labelset_obj = unpack_label_set_from_export(
                        label_set_data, user_obj
                    )
                    logger.info(f"LabelSet created: {labelset_obj}")

                    # Create Corpus
                    corpus_kwargs = {
                        "data": corpus_data_json,
                        "user": user_obj,
                        "label_set_id": labelset_obj.id,
                        "corpus_id": seed_corpus_id if seed_corpus_id else None,
                    }
                    corpus_obj = unpack_corpus_from_export(**corpus_kwargs)
                    logger.info(f"Created corpus_obj: {corpus_obj}")

                    # Prepare label data
                    existing_text_labels = {}
                    existing_doc_labels = {}
                    text_label_data_dict = {
                        label_name: label_info
                        for label_name, label_info in text_labels.items()
                    }
                    doc_label_data_dict = {
                        label_name: label_info
                        for label_name, label_info in doc_labels.items()
                    }

                    # Load or create labels
                    existing_text_labels = load_or_create_labels(
                        user_id=user_id,
                        labelset_obj=labelset_obj,
                        label_data_dict=text_label_data_dict,
                        existing_labels=existing_text_labels,
                    )
                    logger.info(
                        f"import_corpus() - existing_text_labels: {existing_text_labels}"
                    )
                    # This is super hacky... need to rebuild entire import / export pipeline (one day)
                    existing_doc_labels = load_or_create_labels(
                        user_id=user_id,
                        labelset_obj=labelset_obj,
                        label_data_dict=doc_label_data_dict,
                        existing_labels=existing_doc_labels,
                    )
                    doc_label_lookup = {
                        label.text: label for label in existing_doc_labels.values()
                    }
                    logger.info(
                        f"import_corpus() - existing_doc_labels: {existing_doc_labels}"
                    )
                    label_lookup = {**existing_text_labels, **existing_doc_labels}

                    # Iterate over documents
                    for doc_filename in data_json["annotated_docs"]:
                        logger.info(f"Start load for doc: {doc_filename}")
                        doc_data = data_json["annotated_docs"][doc_filename]
                        txt_content = doc_data["content"]
                        pawls_layers = doc_data["pawls_file_content"]

                        try:
                            with import_zip.open(doc_filename) as pdf_file_handle:
                                pdf_file = File(pdf_file_handle, doc_filename)
                                logger.info("pdf_file obj created in memory")

                                pawls_parse_file = ContentFile(
                                    json.dumps(pawls_layers).encode("utf-8"),
                                    name="pawls_tokens.json",
                                )
                                logger.info("Pawls parse file obj created in memory")

                                txt_extract_file = ContentFile(
                                    txt_content.encode("utf-8"),
                                    name="extracted_text.txt",
                                )
                                logger.info("Text extract file obj created in memory")

                                # Create Document instance
                                doc_obj = Document.objects.create(
                                    title=doc_data["title"],
                                    description=f"Imported document with filename {doc_filename}",
                                    pdf_file=pdf_file,
                                    pawls_parse_file=pawls_parse_file,
                                    txt_extract_file=txt_extract_file,
                                    backend_lock=True,  # Prevent immediate processing
                                    creator=user_obj,
                                    page_count=len(pawls_layers),
                                )
                                logger.info(f"Doc created: {doc_obj}")

                                set_permissions_for_obj_to_user(
                                    user_obj, doc_obj, [PermissionTypes.ALL]
                                )

                                # Link Document to Corpus using proper versioning method
                                # This creates a corpus-isolated copy with DocumentPath
                                corpus_copy, _status, _doc_path = (
                                    corpus_obj.add_document(
                                        document=doc_obj, user=user_obj
                                    )
                                )

                                # Import Document-level annotations
                                # IMPORTANT: Use corpus_copy for annotations, not the original doc_obj
                                doc_labels_list = doc_data.get("doc_labels", [])
                                logger.info(
                                    f"import_corpus() - Found {len(doc_labels_list)} doc labels to import"
                                )

                                for doc_label_name in doc_labels_list:
                                    label_obj = doc_label_lookup.get(doc_label_name)
                                    logger.info(
                                        f"import_corpus() - Found doc label_obj: {label_obj}"
                                    )
                                    if label_obj:
                                        annot_obj = Annotation.objects.create(
                                            annotation_label=label_obj,
                                            document=corpus_copy,
                                            corpus=corpus_obj,
                                            creator=user_obj,
                                        )
                                        set_permissions_for_obj_to_user(
                                            user_obj, annot_obj, [PermissionTypes.ALL]
                                        )

                                # Import Text annotations
                                # IMPORTANT: Use corpus_copy for annotations, not the original doc_obj
                                text_annotations_data = doc_data.get(
                                    "labelled_text", []
                                )
                                logger.info(
                                    f"import_corpus() - Found {len(text_annotations_data)} text annotations to import"
                                )
                                import_annotations(
                                    user_id=user_id,
                                    doc_obj=corpus_copy,
                                    corpus_obj=corpus_obj,
                                    annotations_data=text_annotations_data,
                                    label_lookup=label_lookup,
                                    label_type=TOKEN_LABEL,
                                )

                                # Unlock the document
                                doc_obj.backend_lock = False
                                doc_obj.save()
                                logger.info("Doc load complete.")

                        except Exception as e:
                            logger.error(
                                f"import_corpus() - Error loading document {doc_filename}: {e}"
                            )

                    return corpus_obj.id

            # If data.json is not found
            logger.error("import_corpus() - data.json not found in import zip.")
            return None

    except Exception as e:
        logger.error(f"import_corpus() - Exception encountered in corpus import: {e}")
        return None


@celery_app.task()
def import_document_to_corpus(
    target_corpus_id: int,
    user_id: int,
    document_import_data: OpenContractsAnnotatedDocumentImportType,
) -> Optional[str]:
    try:
        logger.info(f"import_document_to_corpus() - for user_id: {user_id}")
        logger.info(
            f"import_document_to_corpus() - target_corpus_id: {target_corpus_id}"
        )

        # Load target corpus
        corpus_obj = Corpus.objects.get(id=target_corpus_id)
        logger.info(f"Loaded corpus: {corpus_obj.title}")

        # Load labelset
        labelset_obj = corpus_obj.label_set
        logger.info(f"Loaded labelset: {labelset_obj.title}")

        # Load existing labels
        existing_text_labels = {
            label.text: label
            for label in labelset_obj.annotation_labels.filter(label_type=TOKEN_LABEL)
        }
        existing_doc_labels = {
            label.text: label
            for label in labelset_obj.annotation_labels.filter(
                label_type=DOC_TYPE_LABEL
            )
        }

        # Create new labels if needed
        existing_text_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("text_labels", {}),
            existing_text_labels,
        )
        existing_doc_labels = load_or_create_labels(
            user_id,
            labelset_obj,
            document_import_data.get("doc_labels", {}),
            existing_doc_labels,
        )

        label_lookup = {
            **existing_text_labels,
            **existing_doc_labels,
        }
        logger.info(f"Label lookup: {label_lookup}")

        # Import the document
        logger.info("Starting document import")
        pdf_base64 = document_import_data["pdf_base64"]
        pdf_data = base64.b64decode(pdf_base64)

        pdf_file = ContentFile(pdf_data, name=f"{document_import_data['pdf_name']}.pdf")
        pawls_parse_file = ContentFile(
            json.dumps(document_import_data["doc_data"]["pawls_file_content"]).encode(
                "utf-8"
            ),
            name="pawls_tokens.json",
        )

        doc_obj = Document.objects.create(
            title=document_import_data["doc_data"]["title"],
            description=document_import_data["doc_data"].get(
                "description", "No Description"
            ),
            pdf_file=pdf_file,
            pawls_parse_file=pawls_parse_file,
            creator_id=user_id,
            page_count=document_import_data["doc_data"]["page_count"],
        )
        logger.info(f"Created document: {doc_obj.title}")
        user_obj = User.objects.get(id=user_id)
        set_permissions_for_obj_to_user(user_obj, doc_obj, [PermissionTypes.ALL])

        # Link to corpus using proper versioning method
        # This creates a corpus-isolated copy with DocumentPath
        corpus_obj.add_document(document=doc_obj, user=user_obj)
        logger.info(f"Linked document to corpus: {corpus_obj.title}")

        # Import text annotations
        doc_annotations_data = document_import_data["doc_data"]["labelled_text"]
        logger.info(f"Importing {len(doc_annotations_data)} text annotations")
        import_annotations(
            user_id,
            doc_obj,
            corpus_obj,
            doc_annotations_data,
            label_lookup,
            label_type=TOKEN_LABEL,
        )

        # Import document-level annotations
        doc_labels = document_import_data["doc_data"]["doc_labels"]
        logger.info(f"Importing {len(doc_labels)} doc labels")
        for doc_label in doc_labels:
            label_obj = existing_doc_labels[doc_label]
            annot_obj = Annotation.objects.create(
                annotation_label=label_obj,
                document=doc_obj,
                corpus=corpus_obj,
                creator_id=user_id,
            )
            set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

        logger.info("Document import completed successfully")
        return doc_obj.id

    except Exception as e:
        logger.error(f"Exception encountered in document import: {e}")
        return None


@celery_app.task()
def process_documents_zip(
    temporary_file_handle_id: str | int,
    user_id: int,
    job_id: str,
    title_prefix: Optional[str] = None,
    description: Optional[str] = None,
    custom_meta: Optional[dict] = None,
    make_public: bool = False,
    corpus_id: Optional[int] = None,
) -> dict:
    """
    Process a zip file containing documents, extract each file, and create Document objects
    for files with allowed MIME types.

    Args:
        temporary_file_handle_id: ID of the temporary file containing the zip
        user_id: ID of the user who uploaded the zip
        job_id: Unique ID for the job
        title_prefix: Optional prefix for document titles
        description: Optional description to apply to all documents
        custom_meta: Optional metadata to apply to all documents
        make_public: Whether the documents should be public
        corpus_id: Optional ID of corpus to link documents to

    Returns:
        Dictionary with summary of processing results
    """
    results = {
        "job_id": job_id,
        "success": False,
        "completed": False,  # Will be set to True on successful completion
        "total_files": 0,
        "processed_files": 0,
        "skipped_files": 0,
        "error_files": 0,
        "document_ids": [],
        "errors": [],
    }

    try:
        logger.info(f"process_documents_zip() - Processing started for job: {job_id}")

        # Get the temporary file and user objects
        temporary_file_handle = TemporaryFileHandle.objects.get(
            id=temporary_file_handle_id
        )
        user_obj = User.objects.get(id=user_id)

        # Check for corpus if needed
        corpus_obj = None
        if corpus_id:
            corpus_obj = Corpus.objects.get(id=corpus_id)

        # Calculate user doc limit if capped
        if user_obj.is_usage_capped:
            current_doc_count = user_obj.document_set.count()
            remaining_quota = (
                settings.USAGE_CAPPED_USER_DOC_CAP_COUNT - current_doc_count
            )
            if remaining_quota <= 0:
                results["success"] = False
                results["completed"] = True  # Task completed but failed
                results["errors"].append(
                    f"User has reached maximum document limit of {settings.USAGE_CAPPED_USER_DOC_CAP_COUNT}"
                )
                return results

        # Process the zip file
        with temporary_file_handle.file.open("rb") as import_file, zipfile.ZipFile(
            import_file, mode="r"
        ) as import_zip:
            logger.info(f"process_documents_zip() - Opened zip file for job: {job_id}")

            # Get list of files in the zip
            files = import_zip.namelist()
            logger.info(f"process_documents_zip() - Found {len(files)} files in zip")
            results["total_files"] = len(files)

            # Process each file in the zip
            for filename in files:
                # Skip directories and hidden files
                if (
                    filename.endswith("/")
                    or filename.startswith(".")
                    or "/__MACOSX/" in filename
                ):
                    results["skipped_files"] += 1
                    continue

                try:
                    # Check if we've hit the user cap
                    if user_obj.is_usage_capped:
                        current_doc_count = user_obj.document_set.count()
                        if (
                            current_doc_count
                            >= settings.USAGE_CAPPED_USER_DOC_CAP_COUNT
                        ):
                            results["errors"].append(
                                "User document limit reached during processing"
                            )
                            break

                    # Extract the file from the zip
                    with import_zip.open(filename) as file_handle:
                        file_bytes = file_handle.read()

                        # Check file type
                        kind = filetype.guess(file_bytes)
                        if kind is None:
                            # Try to detect plaintext using the improved utility
                            if is_plaintext_content(file_bytes):
                                kind = "text/plain"
                            else:  # Truly unknown/binary
                                logger.info(
                                    f"process_documents_zip() - Skipping file with unknown type: {filename}"
                                )
                                results["skipped_files"] += 1
                                continue
                        else:
                            kind = kind.mime

                        # Skip files with unsupported types
                        if kind not in settings.ALLOWED_DOCUMENT_MIMETYPES:
                            results["skipped_files"] += 1
                            continue

                        # Prepare document attributes
                        # Use only the filename part, discarding the path within the zip
                        base_filename = pathlib.Path(filename).name
                        doc_title = base_filename
                        if title_prefix:
                            doc_title = f"{title_prefix} - {base_filename}"

                        doc_description = (
                            description
                            or f"Uploaded as part of batch upload (job: {job_id})"
                        )

                        # Create the document based on file type
                        document = None

                        if kind in [
                            "application/pdf",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        ]:
                            pdf_file = ContentFile(file_bytes, name=filename)
                            document = Document(
                                creator=user_obj,
                                title=doc_title,
                                description=doc_description,
                                custom_meta=custom_meta,
                                pdf_file=pdf_file,
                                backend_lock=True,
                                is_public=make_public,
                                file_type=kind,
                            )
                            document.save()
                        elif kind in ["text/plain", "application/txt"]:
                            txt_extract_file = ContentFile(file_bytes, name=filename)
                            document = Document(
                                creator=user_obj,
                                title=doc_title,
                                description=doc_description,
                                custom_meta=custom_meta,
                                txt_extract_file=txt_extract_file,
                                backend_lock=True,
                                is_public=make_public,
                                file_type=kind,
                            )
                            document.save()

                        if document:
                            # Set permissions for the document
                            set_permissions_for_obj_to_user(
                                user_obj, document, [PermissionTypes.CRUD]
                            )

                            # Add to corpus if needed
                            if corpus_obj:
                                # Use the new versioning system to create proper DocumentPath
                                added_doc, status, doc_path = corpus_obj.add_document(
                                    document=document, user=user_obj
                                )
                                # Update document reference in case versioning returned a different doc
                                document = added_doc

                            # Update results
                            results["processed_files"] += 1
                            results["document_ids"].append(str(document.id))
                            logger.info(
                                f"process_documents_zip() - Created document: {document.id} for file: {filename}"
                            )

                except Exception as e:
                    logger.error(
                        f"process_documents_zip() - Error processing file {filename}: {str(e)}"
                    )
                    results["error_files"] += 1
                    results["errors"].append(f"Error processing {filename}: {str(e)}")

        # Check if processing was stopped early due to user cap
        user_cap_reached_mid_processing = any(
            "User document limit reached during processing" in error
            for error in results["errors"]
        )

        # Clean up the temporary file
        temporary_file_handle.delete()

        results["success"] = not user_cap_reached_mid_processing
        results["completed"] = True  # Task completed, success depends on errors/cap
        logger.info(
            f"process_documents_zip() - Completed job: {job_id}, processed: {results['processed_files']}"
        )

    except Exception as e:
        logger.error(f"process_documents_zip() - Job failed with error: {str(e)}")
        results["success"] = False
        results["completed"] = True  # Task completed but failed
        results["errors"].append(f"Job failed: {str(e)}")

    return results


def create_relationships_from_parsed(
    corpus,
    user,
    document_path_map: dict[str, "Document"],
    parsed_relationships: list,
    logger,
) -> dict:
    """
    Create DocumentRelationship objects from parsed relationship data.

    This function is called after all documents are imported and the
    document_path_map has been built. It creates relationships between
    documents based on the paths specified in the relationships CSV.

    Args:
        corpus: The Corpus object to create relationships in
        user: The User creating the relationships
        document_path_map: Mapping of normalized paths to Document objects
        parsed_relationships: List of ParsedRelationship objects from the parser
        logger: Logger instance for logging

    Returns:
        Dictionary with relationship creation statistics:
        - relationships_created: Number of relationships successfully created
        - relationships_skipped: Number skipped due to missing documents
        - relationship_errors: List of error messages
    """
    from opencontractserver.annotations.models import AnnotationLabel
    from opencontractserver.documents.models import DocumentRelationship
    from opencontractserver.types.enums import LabelType

    results = {
        "relationships_created": 0,
        "relationships_skipped": 0,
        "relationship_errors": [],
    }

    # Cache for labels to avoid repeated lookups
    label_cache: dict[str, AnnotationLabel] = {}

    for rel in parsed_relationships:
        try:
            # Look up source and target documents by path
            source_doc = document_path_map.get(rel.source_path)
            target_doc = document_path_map.get(rel.target_path)

            if source_doc is None:
                results["relationships_skipped"] += 1
                results["relationship_errors"].append(
                    f"Source document not found: {rel.source_path}"
                )
                continue

            if target_doc is None:
                results["relationships_skipped"] += 1
                results["relationship_errors"].append(
                    f"Target document not found: {rel.target_path}"
                )
                continue

            # Get or create the label for this relationship
            if rel.label not in label_cache:
                annotation_label = corpus.ensure_label_and_labelset(
                    label_text=rel.label,
                    creator_id=user.id,
                    label_type=LabelType.RELATIONSHIP_LABEL,
                )
                label_cache[rel.label] = annotation_label
            else:
                annotation_label = label_cache[rel.label]

            # Build relationship data
            relationship_data = {}
            if rel.notes:
                relationship_data["note"] = rel.notes

            # Create the relationship
            DocumentRelationship.objects.create(
                source_document=source_doc,
                target_document=target_doc,
                corpus=corpus,
                annotation_label=annotation_label,
                relationship_type=rel.relationship_type,
                data=relationship_data if relationship_data else None,
                creator=user,
            )

            results["relationships_created"] += 1
            logger.debug(
                f"Created relationship: {rel.source_path} --[{rel.label}]--> "
                f"{rel.target_path} (type: {rel.relationship_type})"
            )

        except Exception as e:
            results["relationship_errors"].append(
                f"Error creating relationship {rel.source_path} -> {rel.target_path}: {str(e)}"
            )
            logger.error(
                f"Error creating relationship {rel.source_path} -> {rel.target_path}: {e}"
            )

    logger.info(
        f"Relationship creation complete: {results['relationships_created']} created, "
        f"{results['relationships_skipped']} skipped"
    )

    return results


@celery_app.task()
def import_zip_with_folder_structure(
    temporary_file_handle_id: str | int,
    user_id: int,
    job_id: str,
    corpus_id: int,
    target_folder_id: Optional[int] = None,
    title_prefix: Optional[str] = None,
    description: Optional[str] = None,
    custom_meta: Optional[dict] = None,
    make_public: bool = False,
) -> dict:
    """
    Process a zip file and import documents preserving folder structure.

    This task:
    1. Validates the zip file for security (path traversal, zip bombs, etc.)
    2. Creates the folder structure from the zip in the corpus
    3. Extracts and creates documents with proper folder assignments
    4. If a relationships.csv file is present at the zip root, creates
       document relationships based on its contents

    The relationships.csv file should have the format:
        source_path,relationship_label,target_path,notes
        /contracts/master.pdf,Parent,/contracts/amendments/a1.pdf,
        /contracts/master.pdf,References,/exhibits/exhibit_a.pdf,See section 3

    Args:
        temporary_file_handle_id: ID of the temporary file containing the zip
        user_id: ID of the user who uploaded the zip
        job_id: Unique ID for the job
        corpus_id: ID of the corpus to import into
        target_folder_id: Optional folder ID to place zip contents under
        title_prefix: Optional prefix for document titles
        description: Optional description to apply to all documents
        custom_meta: Optional metadata to apply to all documents
        make_public: Whether the documents should be public

    Returns:
        Dictionary with comprehensive results including:
        - job_id, success, completed flags
        - File statistics (processed, skipped by type/size/path, errored)
        - Folder statistics (created, reused)
        - Relationship statistics (created, skipped, errors)
        - Document IDs and error messages
    """
    from opencontractserver.constants.zip_import import ZIP_DOCUMENT_BATCH_SIZE
    from opencontractserver.corpuses.folder_service import DocumentFolderService
    from opencontractserver.corpuses.models import Corpus, CorpusFolder
    from opencontractserver.utils.zip_security import validate_zip_for_import

    results = {
        "job_id": job_id,
        "success": False,
        "completed": False,
        # Validation
        "validation_passed": False,
        "validation_errors": [],
        # File statistics
        "total_files_in_zip": 0,
        "files_processed": 0,
        "files_skipped_type": 0,
        "files_skipped_size": 0,
        "files_skipped_hidden": 0,
        "files_skipped_path": 0,
        "files_errored": 0,
        "files_upversioned": 0,  # Count of documents that replaced existing versions
        # Folder statistics
        "folders_created": 0,
        "folders_reused": 0,
        # Metadata statistics
        "metadata_file_found": False,
        "metadata_applied": 0,
        # Relationship statistics
        "relationships_file_found": False,
        "relationships_created": 0,
        "relationships_skipped": 0,
        "relationship_errors": [],
        # Output
        "document_ids": [],
        "errors": [],
        "skipped_oversized": [],
        "upversioned_paths": [],  # Paths where new versions replaced old ones
    }

    try:
        logger.info(
            f"import_zip_with_folder_structure() - Processing started for job: {job_id}"
        )

        # Get required objects
        temporary_file_handle = TemporaryFileHandle.objects.get(
            id=temporary_file_handle_id
        )
        user_obj = User.objects.get(id=user_id)
        corpus_obj = Corpus.objects.get(id=corpus_id)

        # Get target folder if specified
        target_folder = None
        if target_folder_id:
            target_folder = CorpusFolder.objects.get(
                id=target_folder_id, corpus=corpus_obj
            )

        # Check user quota
        if user_obj.is_usage_capped:
            current_doc_count = user_obj.document_set.count()
            remaining_quota = (
                settings.USAGE_CAPPED_USER_DOC_CAP_COUNT - current_doc_count
            )
            if remaining_quota <= 0:
                results["completed"] = True
                results["errors"].append(
                    f"User has reached maximum document limit of "
                    f"{settings.USAGE_CAPPED_USER_DOC_CAP_COUNT}"
                )
                return results

        # Open and validate the zip file
        with temporary_file_handle.file.open("rb") as import_file, zipfile.ZipFile(
            import_file, mode="r"
        ) as import_zip:
            logger.info(
                f"import_zip_with_folder_structure() - Opened zip file for job: {job_id}"
            )

            # Phase 1: Validate the zip file
            manifest = validate_zip_for_import(import_zip)
            results["total_files_in_zip"] = manifest.total_files_in_zip

            if not manifest.is_valid:
                results["completed"] = True
                results["validation_errors"].append(manifest.error_message)
                results["errors"].append(f"Validation failed: {manifest.error_message}")
                logger.warning(
                    f"import_zip_with_folder_structure() - Validation failed: "
                    f"{manifest.error_message}"
                )
                return results

            results["validation_passed"] = True

            # Count skipped files by reason
            for skipped in manifest.skipped_files:
                if skipped.is_oversized:
                    results["files_skipped_size"] += 1
                    results["skipped_oversized"].append(skipped.original_path)
                elif "hidden" in skipped.skip_reason.lower():
                    results["files_skipped_hidden"] += 1
                elif "path" in skipped.skip_reason.lower():
                    results["files_skipped_path"] += 1
                else:
                    # Generic skip
                    results["files_skipped_path"] += 1

            logger.info(
                f"import_zip_with_folder_structure() - Validation passed: "
                f"{len(manifest.valid_files)} valid files, "
                f"{len(manifest.skipped_files)} skipped, "
                f"{len(manifest.folder_paths)} folders to create"
            )

            # Phase 2: Create folder structure
            if manifest.folder_paths:
                folder_map, created, reused, folder_error = (
                    DocumentFolderService.create_folder_structure_from_paths(
                        user=user_obj,
                        corpus=corpus_obj,
                        folder_paths=manifest.folder_paths,
                        target_folder=target_folder,
                    )
                )

                if folder_error:
                    results["completed"] = True
                    results["errors"].append(f"Folder creation failed: {folder_error}")
                    logger.error(
                        f"import_zip_with_folder_structure() - Folder creation failed: "
                        f"{folder_error}"
                    )
                    return results

                results["folders_created"] = created
                results["folders_reused"] = reused
            else:
                folder_map = {}

            logger.info(
                f"import_zip_with_folder_structure() - Folder structure ready: "
                f"{results['folders_created']} created, {results['folders_reused']} reused"
            )

            # Track if relationships file was found for Phase 4
            if manifest.relationship_file:
                results["relationships_file_found"] = True
                logger.info(
                    f"import_zip_with_folder_structure() - Relationships file found: "
                    f"{manifest.relationship_file}"
                )

            # Parse metadata file if present (used in Phase 3)
            metadata_lookup: dict[str, "DocumentMetadata"] = {}
            if manifest.metadata_file:
                from opencontractserver.utils.metadata_file_parser import (
                    parse_metadata_file,
                )

                results["metadata_file_found"] = True
                logger.info(
                    f"import_zip_with_folder_structure() - Metadata file found: "
                    f"{manifest.metadata_file}"
                )

                meta_result = parse_metadata_file(import_zip, manifest.metadata_file)
                if meta_result.is_valid:
                    metadata_lookup = meta_result.metadata
                    logger.info(
                        f"import_zip_with_folder_structure() - Parsed metadata for "
                        f"{len(metadata_lookup)} documents"
                    )
                    for warning in meta_result.warnings:
                        logger.warning(
                            f"import_zip_with_folder_structure() - "
                            f"Metadata warning: {warning}"
                        )
                else:
                    for error in meta_result.errors:
                        logger.warning(
                            f"import_zip_with_folder_structure() - "
                            f"Metadata parsing error: {error}"
                        )
                        results["errors"].append(f"Metadata file error: {error}")

            # Phase 3: Process documents in batches
            # Build document_path_map as documents are created for use in Phase 4
            document_path_map: dict[str, Document] = {}
            batch_count = 0
            for entry in manifest.valid_files:
                try:
                    # Check user quota during processing
                    if user_obj.is_usage_capped:
                        current_doc_count = user_obj.document_set.count()
                        if (
                            current_doc_count
                            >= settings.USAGE_CAPPED_USER_DOC_CAP_COUNT
                        ):
                            results["errors"].append(
                                "User document limit reached during processing"
                            )
                            break

                    # Extract file from zip
                    with import_zip.open(entry.original_path) as file_handle:
                        file_bytes = file_handle.read()

                    # Validate MIME type
                    kind = filetype.guess(file_bytes)
                    if kind is None:
                        if is_plaintext_content(file_bytes):
                            mime_type = "text/plain"
                        else:
                            results["files_skipped_type"] += 1
                            continue
                    else:
                        mime_type = kind.mime

                    if mime_type not in settings.ALLOWED_DOCUMENT_MIMETYPES:
                        results["files_skipped_type"] += 1
                        continue

                    # Prepare document attributes
                    doc_title = entry.filename
                    if title_prefix:
                        doc_title = f"{title_prefix} - {entry.filename}"

                    doc_description = (
                        description or f"Imported from zip (job: {job_id})"
                    )

                    # Apply metadata from meta.csv if available
                    # Lookup key is normalized path with leading slash
                    metadata_path = f"/{entry.sanitized_path}"
                    doc_metadata = metadata_lookup.get(metadata_path)
                    if doc_metadata:
                        if doc_metadata.title:
                            doc_title = doc_metadata.title
                            if title_prefix:
                                doc_title = f"{title_prefix} - {doc_metadata.title}"
                        if doc_metadata.description:
                            doc_description = doc_metadata.description
                        results["metadata_applied"] += 1

                    # Determine target folder for this document
                    doc_folder = None
                    if entry.folder_path:
                        doc_folder = folder_map.get(entry.folder_path)
                        if doc_folder is None and target_folder:
                            # Fallback to target folder if path mapping failed
                            doc_folder = target_folder
                    elif target_folder:
                        # File at zip root goes to target folder
                        doc_folder = target_folder

                    # Build the document path for versioning
                    # This enables collision detection and upversioning
                    if target_folder:
                        # Prepend target folder's path to the zip path
                        target_path = target_folder.get_path()
                        doc_path_str = f"{target_path}/{entry.sanitized_path}"
                    else:
                        # Use the sanitized path directly from the zip
                        doc_path_str = f"/{entry.sanitized_path}"

                    # Create document based on file type
                    document = None

                    if mime_type in [
                        "application/pdf",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    ]:
                        pdf_file = ContentFile(file_bytes, name=entry.filename)
                        document = Document(
                            creator=user_obj,
                            title=doc_title,
                            description=doc_description,
                            custom_meta=custom_meta,
                            pdf_file=pdf_file,
                            backend_lock=True,
                            is_public=make_public,
                            file_type=mime_type,
                        )
                        document.save()
                    elif mime_type in ["text/plain", "application/txt"]:
                        txt_extract_file = ContentFile(file_bytes, name=entry.filename)
                        document = Document(
                            creator=user_obj,
                            title=doc_title,
                            description=doc_description,
                            custom_meta=custom_meta,
                            txt_extract_file=txt_extract_file,
                            backend_lock=True,
                            is_public=make_public,
                            file_type=mime_type,
                        )
                        document.save()

                    if document:
                        # Set permissions for the document
                        set_permissions_for_obj_to_user(
                            user_obj, document, [PermissionTypes.CRUD]
                        )

                        # Add to corpus with folder assignment and path for versioning
                        # If a document already exists at this path, it will be upversioned
                        try:
                            added_doc, status, doc_path = corpus_obj.add_document(
                                document=document,
                                user=user_obj,
                                folder=doc_folder,
                                path=doc_path_str,
                            )
                        except PermissionError as e:
                            logger.warning(
                                f"Permission error adding document at {doc_path_str}: {e}"
                            )
                            results["files_errored"] += 1
                            results["errors"].append(
                                f"Permission error for {entry.sanitized_path}: {str(e)}"
                            )
                            continue

                        results["files_processed"] += 1
                        results["document_ids"].append(str(added_doc.id))

                        # Add to document_path_map for relationship processing
                        # Key is normalized path with leading slash to match CSV format
                        normalized_zip_path = f"/{entry.sanitized_path}"
                        document_path_map[normalized_zip_path] = added_doc

                        # Track upversioned documents
                        if doc_path.version_number > 1:
                            results["files_upversioned"] += 1
                            results["upversioned_paths"].append(doc_path_str)

                        batch_count += 1
                        if batch_count % ZIP_DOCUMENT_BATCH_SIZE == 0:
                            logger.info(
                                f"import_zip_with_folder_structure() - "
                                f"Processed {batch_count} documents..."
                            )

                except Exception as e:
                    logger.error(
                        f"import_zip_with_folder_structure() - Error processing file "
                        f"{entry.sanitized_path}: {str(e)}"
                    )
                    results["files_errored"] += 1
                    results["errors"].append(
                        f"Error processing {entry.sanitized_path}: {str(e)}"
                    )

            # Phase 4: Process relationships file if present
            if manifest.relationship_file and document_path_map:
                from opencontractserver.utils.relationship_file_parser import (
                    parse_relationship_file,
                )

                logger.info(
                    f"import_zip_with_folder_structure() - Processing relationships "
                    f"file: {manifest.relationship_file}"
                )

                # Parse the relationships file
                parse_result = parse_relationship_file(
                    import_zip, manifest.relationship_file
                )

                if not parse_result.is_valid:
                    for error in parse_result.errors:
                        results["relationship_errors"].append(error)
                    logger.warning(
                        f"import_zip_with_folder_structure() - Relationships file "
                        f"parsing failed: {parse_result.errors}"
                    )
                else:
                    # Log any warnings
                    for warning in parse_result.warnings:
                        logger.warning(
                            f"import_zip_with_folder_structure() - "
                            f"Relationship warning: {warning}"
                        )

                    # Create relationships if there are any
                    if parse_result.relationships:
                        rel_results = create_relationships_from_parsed(
                            corpus=corpus_obj,
                            user=user_obj,
                            document_path_map=document_path_map,
                            parsed_relationships=parse_result.relationships,
                            logger=logger,
                        )

                        results["relationships_created"] = rel_results[
                            "relationships_created"
                        ]
                        results["relationships_skipped"] = rel_results[
                            "relationships_skipped"
                        ]
                        results["relationship_errors"].extend(
                            rel_results["relationship_errors"]
                        )

                        logger.info(
                            f"import_zip_with_folder_structure() - "
                            f"Relationships created: {results['relationships_created']}, "
                            f"skipped: {results['relationships_skipped']}"
                        )

        # Cleanup temporary file
        temporary_file_handle.delete()

        # Determine success
        user_cap_reached = any(
            "User document limit reached" in error for error in results["errors"]
        )
        results["success"] = not user_cap_reached and results["files_errored"] == 0
        results["completed"] = True

        logger.info(
            f"import_zip_with_folder_structure() - Completed job: {job_id}, "
            f"processed: {results['files_processed']}, "
            f"upversioned: {results['files_upversioned']}, "
            f"folders created: {results['folders_created']}, "
            f"metadata applied: {results['metadata_applied']}, "
            f"relationships created: {results['relationships_created']}"
        )

    except Corpus.DoesNotExist:
        logger.error(
            f"import_zip_with_folder_structure() - Corpus {corpus_id} not found"
        )
        results["completed"] = True
        results["errors"].append(f"Corpus not found: {corpus_id}")
    except CorpusFolder.DoesNotExist:
        logger.error(
            f"import_zip_with_folder_structure() - Target folder {target_folder_id} not found"
        )
        results["completed"] = True
        results["errors"].append(f"Target folder not found: {target_folder_id}")
    except Exception as e:
        logger.error(
            f"import_zip_with_folder_structure() - Job failed with error: {str(e)}"
        )
        results["completed"] = True
        results["errors"].append(f"Job failed: {str(e)}")

    return results
