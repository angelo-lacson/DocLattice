import logging
from typing import Optional

import requests
from django.core.files.storage import default_storage

from opencontractserver.annotations.models import TOKEN_LABEL
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.utils.files import check_if_pdf_needs_ocr

logger = logging.getLogger(__name__)


class NLMIngestParser(BaseParser):
    """
    Parser that uses the NLM ingest service to parse PDF documents.
    """

    title = "NLM Ingest Parser"
    description = "Parses PDF documents using the NLM ingest service."
    author = "Your Name"
    dependencies = []
    supported_file_types = [FileTypeEnum.PDF]

    def __init__(self, **kwargs):
        """Initializes the NLMIngestParser."""
        super().__init__(**kwargs)
        logger.info("NLMIngestParser initialized.")

    def _compute_content_modalities(
        self, token_refs: list[dict], pawls_data: list[dict]
    ) -> list[str]:
        """
        Compute content modalities from token references.

        Args:
            token_refs: List of token references with pageIndex and tokenIndex.
            pawls_data: PAWLs data containing token information.

        Returns:
            List of modality strings (e.g., ["TEXT"], ["IMAGE"], ["TEXT", "IMAGE"]).
        """
        if not token_refs or not pawls_data:
            return ["TEXT"]

        has_text = False
        has_image = False

        for token_ref in token_refs:
            page_idx = token_ref.get("pageIndex")
            token_idx = token_ref.get("tokenIndex")

            if page_idx is None or token_idx is None:
                continue

            if page_idx < 0 or page_idx >= len(pawls_data):
                continue

            page = pawls_data[page_idx]
            if not isinstance(page, dict):
                continue

            tokens = page.get("tokens", [])
            if token_idx < 0 or token_idx >= len(tokens):
                continue

            token = tokens[token_idx]
            if not isinstance(token, dict):
                continue

            # Check if this is an image token
            if token.get("is_image"):
                has_image = True
            else:
                has_text = True

            # Early exit if we've found both
            if has_text and has_image:
                break

        # Build modality list
        modalities = []
        if has_text:
            modalities.append("TEXT")
        if has_image:
            modalities.append("IMAGE")

        # Default to TEXT if no modalities detected
        if not modalities:
            modalities = ["TEXT"]

        return modalities

    def _parse_document_impl(
        self, user_id: int, doc_id: int, **all_kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Parses a document using the NLM ingest service and ensures that all annotations
        have 'structural' set to True and 'annotation_type' set to TOKEN_LABEL.

        Configuration is loaded from **all_kwargs (merged from PIPELINE_SETTINGS and direct call args).

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to parse.
            **all_kwargs: Parser configuration arguments such as 'endpoint', 'api_key', and 'use_ocr'.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data,
            or None if parsing failed.
        """
        logger.info(
            f"NLMIngestParser - Parsing doc {doc_id} for user {user_id} with effective kwargs: {all_kwargs}"
        )

        # Retrieve config from all_kwargs or fallback to defaults
        # Defaults are based on previous PARSER_KWARGS values
        endpoint = all_kwargs.get("endpoint", "http://nlm-ingestor:5001")
        api_key = all_kwargs.get("api_key", "")  # Default was empty string
        use_ocr_config = all_kwargs.get(
            "use_ocr", True
        )  # Default was True in PARSER_KWARGS

        # Retrieve the document
        document = Document.objects.get(pk=doc_id)
        doc_path = document.pdf_file.name

        # Open the document file
        with default_storage.open(doc_path, "rb") as doc_file:
            # Check if OCR is needed
            needs_ocr = check_if_pdf_needs_ocr(doc_file)
            logger.debug(f"Document {doc_id} needs OCR: {needs_ocr}")

            # Prepare request headers
            logger.info(f"Using NLM API key: {'*' * 8 if api_key else 'None'}")
            headers = {"API_KEY": api_key} if api_key else {}
            logger.info(
                f"Using NLM headers with API key: {'present' if headers.get('API_KEY') else 'absent'}"
            )

            # Reset file pointer
            doc_file.seek(0)

            # Prepare request files and parameters
            files = {"file": doc_file}
            params = {
                "calculate_opencontracts_data": "yes",
                "applyOcr": "yes" if (needs_ocr and use_ocr_config) else "no",
            }

            # Make the POST request to the NLM ingest service
            response = requests.post(
                f"{endpoint}/api/parseDocument",
                headers=headers,
                files=files,
                params=params,
            )

        if response.status_code != 200:
            logger.error(
                f"NLM ingest service returned status code {response.status_code}"
            )
            response.raise_for_status()

        response_data = response.json()
        open_contracts_data: Optional[OpenContractDocExport] = response_data.get(
            "return_dict", {}
        ).get("opencontracts_data")

        if open_contracts_data is None:
            logger.error("No 'opencontracts_data' found in NLM ingest service response")
            return None

        # Ensure all annotations have 'structural' set to True and 'annotation_type' set to TOKEN_LABEL
        # Also compute and set content_modalities based on token references
        if "labelled_text" in open_contracts_data:
            pawls_data = open_contracts_data.get("pawls_file_content", [])
            for annotation in open_contracts_data["labelled_text"]:
                annotation["structural"] = True
                annotation["annotation_type"] = TOKEN_LABEL

                # Compute content modalities from token references
                token_refs = annotation.get("annotation_json", {}).get("tokens", [])
                annotation["content_modalities"] = self._compute_content_modalities(
                    token_refs, pawls_data
                )

        logger.info(
            f"Open contracts data labelled text: {open_contracts_data.get('labelled_text', [])}"
        )

        return open_contracts_data
