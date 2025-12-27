"""
LlamaParse Parser for OpenContracts.

This parser uses the LlamaParse API (from LlamaIndex) to parse PDF documents
and extract structural annotations with bounding boxes.
"""

import logging
import os
import tempfile
from typing import Any, Optional

from django.conf import settings
from django.core.files.storage import default_storage

from opencontractserver.annotations.models import TOKEN_LABEL
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    BoundingBoxPythonType,
    OpenContractDocExport,
    OpenContractsAnnotationPythonType,
    OpenContractsSinglePageAnnotationType,
    PawlsPagePythonType,
    PawlsTokenPythonType,
    TokenIdPythonType,
)

logger = logging.getLogger(__name__)


class LlamaParseParser(BaseParser):
    """
    A parser that uses the LlamaParse API to parse PDF documents.

    LlamaParse provides advanced document parsing with layout extraction,
    returning bounding boxes for various document elements (titles, text,
    tables, figures, lists).

    Configuration via environment variables:
        - LLAMAPARSE_API_KEY: API key for LlamaParse (required)
        - LLAMAPARSE_RESULT_TYPE: Output type (default: "json")
        - LLAMAPARSE_EXTRACT_LAYOUT: Whether to extract layout (default: True)
        - LLAMAPARSE_NUM_WORKERS: Number of parallel workers (default: 4)
        - LLAMAPARSE_LANGUAGE: Document language (default: "en")
        - LLAMAPARSE_VERBOSE: Enable verbose logging (default: False)
    """

    title = "LlamaParse Parser"
    description = (
        "Parses PDF documents using the LlamaParse API with layout extraction."
    )
    author = "OpenContracts Team"
    dependencies = ["llama-parse"]
    supported_file_types = [FileTypeEnum.PDF, FileTypeEnum.DOCX]

    # Mapping from LlamaParse element types to OpenContracts annotation labels
    ELEMENT_TYPE_MAPPING = {
        "title": "Title",
        "section_header": "Section Header",
        "heading": "Heading",
        "text": "Text Block",
        "paragraph": "Paragraph",
        "table": "Table",
        "figure": "Figure",
        "image": "Image",
        "list": "List",
        "list_item": "List Item",
        "caption": "Caption",
        "footnote": "Footnote",
        "header": "Page Header",
        "footer": "Page Footer",
        "page_number": "Page Number",
        "equation": "Equation",
        "code": "Code Block",
    }

    def __init__(self):
        """Initialize the LlamaParse parser with configuration from settings."""
        super().__init__()

        # Get API key from settings (which reads from env vars)
        self.api_key = getattr(settings, "LLAMAPARSE_API_KEY", "")
        if not self.api_key:
            self.api_key = os.environ.get("LLAMA_CLOUD_API_KEY", "")

        # Get other configuration options
        self.result_type = getattr(settings, "LLAMAPARSE_RESULT_TYPE", "json")
        self.extract_layout = getattr(settings, "LLAMAPARSE_EXTRACT_LAYOUT", True)
        self.num_workers = getattr(settings, "LLAMAPARSE_NUM_WORKERS", 4)
        self.language = getattr(settings, "LLAMAPARSE_LANGUAGE", "en")
        self.verbose = getattr(settings, "LLAMAPARSE_VERBOSE", False)

        logger.info(
            f"LlamaParseParser initialized with extract_layout={self.extract_layout}, "
            f"language={self.language}"
        )

    def _parse_document_impl(
        self, user_id: int, doc_id: int, **all_kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Parse a document using the LlamaParse API.

        Args:
            user_id: ID of the user requesting the parse.
            doc_id: ID of the document to parse.
            **all_kwargs: Additional configuration options that can override defaults:
                - api_key: Override the API key
                - result_type: Output type ("json", "markdown", "text")
                - extract_layout: Whether to extract layout/bounding boxes
                - num_workers: Number of parallel workers
                - language: Document language
                - verbose: Enable verbose logging

        Returns:
            OpenContractDocExport with the parsed document data, or None if parsing failed.
        """
        # Redact sensitive keys before logging
        safe_kwargs = {
            k: ("***" if k == "api_key" else v) for k, v in all_kwargs.items()
        }
        logger.info(
            f"LlamaParseParser - Parsing doc {doc_id} for user {user_id} "
            f"with effective kwargs: {safe_kwargs}"
        )

        # Override settings with kwargs if provided
        api_key = all_kwargs.get("api_key", self.api_key)
        result_type = all_kwargs.get("result_type", self.result_type)
        extract_layout = all_kwargs.get("extract_layout", self.extract_layout)
        num_workers = all_kwargs.get("num_workers", self.num_workers)
        language = all_kwargs.get("language", self.language)
        verbose = all_kwargs.get("verbose", self.verbose)

        if not api_key:
            logger.error(
                "LlamaParse API key not configured. Set LLAMAPARSE_API_KEY in settings "
                "or LLAMA_CLOUD_API_KEY environment variable."
            )
            return None

        # Get the document
        try:
            document = Document.objects.get(pk=doc_id)
        except Document.DoesNotExist:
            logger.error(f"Document {doc_id} not found")
            return None

        # Determine which file to use
        if document.pdf_file and document.pdf_file.name:
            doc_path = document.pdf_file.name
        else:
            logger.error(f"No PDF file found for document {doc_id}")
            return None

        try:
            # Import llama-parse here to avoid import errors if not installed
            from llama_parse import LlamaParse

            # Initialize the parser
            parser = LlamaParse(
                api_key=api_key,
                result_type=result_type,
                num_workers=num_workers,
                verbose=verbose,
                language=language,
            )

            # Read the file from storage and write to a temp file
            # (LlamaParse needs a file path)
            with default_storage.open(doc_path, "rb") as doc_file:
                doc_bytes = doc_file.read()

            # Determine file extension from document type
            file_type = document.file_type.lower() if document.file_type else "pdf"
            suffix = f".{file_type}" if file_type in ("pdf", "docx") else ".pdf"

            # Create a temporary file - use a nested try-finally to ensure cleanup
            # on all exit paths (success, error, or early return)
            temp_file_path = None
            try:
                with tempfile.NamedTemporaryFile(
                    suffix=suffix, delete=False
                ) as temp_file:
                    temp_file.write(doc_bytes)
                    temp_file_path = temp_file.name

                # Parse the document
                logger.info("Sending document to LlamaParse API...")

                # Use get_json_result for JSON with layout data
                if result_type == "json" and extract_layout:
                    # For JSON with layout, we need to use the async API or
                    # get_json_result method
                    json_results = parser.get_json_result(temp_file_path)

                    if not json_results:
                        logger.error("LlamaParse returned empty results")
                        return None

                    # Convert to OpenContracts format
                    return self._convert_json_to_opencontracts(
                        document, json_results, extract_layout
                    )
                else:
                    # For markdown/text output, use load_data
                    documents = parser.load_data(temp_file_path)

                    if not documents:
                        logger.error("LlamaParse returned empty results")
                        return None

                    # Convert simple text/markdown output
                    return self._convert_text_to_opencontracts(document, documents)

            finally:
                # Clean up temp file - always runs on any exit path
                if temp_file_path and os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)

        except ImportError:
            logger.error(
                "llama-parse library not installed. "
                "Install with: pip install llama-parse"
            )
            return None
        except Exception as e:
            import traceback

            stacktrace = traceback.format_exc()
            logger.error(f"LlamaParse parsing failed: {e}\n{stacktrace}")
            return None

    def _convert_json_to_opencontracts(
        self,
        document: Document,
        json_results: list[dict[str, Any]],
        extract_layout: bool = True,
    ) -> OpenContractDocExport:
        """
        Convert LlamaParse JSON results to OpenContracts format.

        Args:
            document: The Document model instance.
            json_results: List of JSON results from LlamaParse.
            extract_layout: Whether layout data with bounding boxes is included.

        Returns:
            OpenContractDocExport with parsed data.
        """
        # The first result contains the parsed document
        result = json_results[0] if json_results else {}
        pages = result.get("pages", [])

        # Build the full text content
        full_text_parts = []
        pawls_pages: list[PawlsPagePythonType] = []
        annotations: list[OpenContractsAnnotationPythonType] = []

        # Track token indices for annotations - these are global across all pages
        annotation_id_counter = 0
        token_idx = 0  # Global token index across all pages

        for page_idx, page in enumerate(pages):
            page_text = page.get("text", "")
            full_text_parts.append(page_text)

            # Get page dimensions (default to standard US Letter size in points: 8.5" x 11")
            # Note: A4 size would be 595 x 842 points
            DEFAULT_WIDTH = 612
            DEFAULT_HEIGHT = 792
            page_width = page.get("width")
            page_height = page.get("height")

            # Validate dimensions - must be positive numbers
            if page_width is None or page_width <= 0:
                page_width = DEFAULT_WIDTH
                logger.warning(
                    f"Page {page_idx} has invalid width, using default: {page_width}"
                )
            if page_height is None or page_height <= 0:
                page_height = DEFAULT_HEIGHT
                logger.warning(
                    f"Page {page_idx} has invalid height, using default: {page_height}"
                )

            # Create PAWLS page structure
            pawls_page: PawlsPagePythonType = {
                "page": {
                    "width": page_width,
                    "height": page_height,
                    "index": page_idx,
                },
                "tokens": [],
            }

            # Extract layout elements if available
            layout_elements = page.get("layout", []) if extract_layout else []
            items = page.get("items", [])

            # Process items (elements with text and positions)
            for item in items:
                item_text = item.get("text", "") or item.get("value", "")
                item_type = item.get("type", "text").lower()
                bbox = item.get("bbox", item.get("bounding_box", {}))

                if not item_text.strip():
                    continue

                # Convert bbox (which may be fractional 0-1) to absolute coordinates
                pawls_tokens, token_bounds = self._create_pawls_tokens_from_bbox(
                    item_text,
                    bbox,
                    page_width,
                    page_height,
                    token_idx,
                )

                if pawls_tokens:
                    # Add tokens to page
                    start_token_idx = token_idx
                    for token in pawls_tokens:
                        pawls_page["tokens"].append(token)
                        token_idx += 1
                    end_token_idx = token_idx

                    # Create annotation for this element
                    label = self.ELEMENT_TYPE_MAPPING.get(item_type, "Text Block")
                    annotation = self._create_annotation(
                        annotation_id=str(annotation_id_counter),
                        label=label,
                        raw_text=item_text,
                        page_idx=page_idx,
                        bounds=token_bounds,
                        start_token_idx=start_token_idx,
                        end_token_idx=end_token_idx,
                    )
                    annotations.append(annotation)
                    annotation_id_counter += 1

            # If no items but we have layout, process layout elements
            if not items and layout_elements:
                for element in layout_elements:
                    element_type = element.get("label", "text").lower()
                    bbox = element.get("bbox", {})
                    element_text = element.get("text", "")

                    if not element_text and element_type not in ["figure", "image"]:
                        continue

                    # Convert bbox to absolute coordinates
                    pawls_tokens, token_bounds = self._create_pawls_tokens_from_bbox(
                        element_text or f"[{element_type}]",
                        bbox,
                        page_width,
                        page_height,
                        token_idx,
                    )

                    if pawls_tokens:
                        start_token_idx = token_idx
                        for token in pawls_tokens:
                            pawls_page["tokens"].append(token)
                            token_idx += 1
                        end_token_idx = token_idx

                        label = self.ELEMENT_TYPE_MAPPING.get(
                            element_type, "Text Block"
                        )
                        annotation = self._create_annotation(
                            annotation_id=str(annotation_id_counter),
                            label=label,
                            raw_text=element_text or f"[{element_type}]",
                            page_idx=page_idx,
                            bounds=token_bounds,
                            start_token_idx=start_token_idx,
                            end_token_idx=end_token_idx,
                        )
                        annotations.append(annotation)
                        annotation_id_counter += 1

            pawls_pages.append(pawls_page)

        # Combine all text
        full_text = "\n\n".join(full_text_parts)

        # Build the export
        export: OpenContractDocExport = {
            "title": document.title,
            "content": full_text,
            "description": document.description or "",
            "pawls_file_content": pawls_pages,
            "page_count": len(pages),
            "doc_labels": [],
            "labelled_text": annotations,
            "relationships": [],
        }

        logger.info(
            f"Converted LlamaParse output: {len(pages)} pages, "
            f"{len(annotations)} annotations"
        )

        return export

    def _convert_text_to_opencontracts(
        self,
        document: Document,
        llama_documents: list,
    ) -> OpenContractDocExport:
        """
        Convert simple text/markdown LlamaParse output to OpenContracts format.

        This is used when layout extraction is not enabled.

        Args:
            document: The Document model instance.
            llama_documents: List of LlamaIndex Document objects.

        Returns:
            OpenContractDocExport with parsed data.
        """
        # Combine text from all documents
        full_text = "\n\n".join(doc.text for doc in llama_documents if doc.text)

        # Without layout data, we create a minimal export
        export: OpenContractDocExport = {
            "title": document.title,
            "content": full_text,
            "description": document.description or "",
            "pawls_file_content": [],
            "page_count": len(llama_documents) or 1,
            "doc_labels": [],
            "labelled_text": [],
            "relationships": [],
        }

        logger.info(
            f"Converted LlamaParse text output: {len(llama_documents)} documents, "
            f"{len(full_text)} characters"
        )

        return export

    def _create_pawls_tokens_from_bbox(
        self,
        text: str,
        bbox: dict[str, Any],
        page_width: float,
        page_height: float,
        start_token_idx: int,
    ) -> tuple[list[PawlsTokenPythonType], BoundingBoxPythonType]:
        """
        Create PAWLS tokens from text and bounding box.

        LlamaParse returns bounding boxes as fractions (0-1) of page dimensions.
        We need to convert these to absolute coordinates.

        Args:
            text: The text content.
            bbox: Bounding box dict with keys like 'x', 'y', 'width', 'height' or
                  'left', 'top', 'right', 'bottom' (as fractions 0-1).
            page_width: Page width in points.
            page_height: Page height in points.
            start_token_idx: Starting token index.

        Returns:
            Tuple of (list of PAWLS tokens, overall bounding box).
        """
        tokens: list[PawlsTokenPythonType] = []

        # Default margin constant (1 inch = 72 points)
        DEFAULT_MARGIN = 72
        DEFAULT_BOTTOM = 100

        # Parse bounding box - handle different formats from LlamaParse
        # LlamaParse may return fractional coordinates (0-1) or absolute coordinates
        if not bbox:
            # No bbox, create a default one with standard margins
            left, top = DEFAULT_MARGIN, DEFAULT_MARGIN
            right, bottom = page_width - DEFAULT_MARGIN, DEFAULT_BOTTOM
        elif "x" in bbox and "y" in bbox:
            # Format: {x, y, width, height}
            x = float(bbox.get("x", 0))
            y = float(bbox.get("y", 0))
            w = float(bbox.get("width", 0.1))
            h = float(bbox.get("height", 0.02))

            # Check if values are fractions (0-1) or absolute
            # Heuristic: if both corners (x,y) and (x+w,y+h) are in [0,1], treat as fractional
            is_fractional = (
                0 <= x <= 1.0
                and 0 <= y <= 1.0
                and 0 <= (x + w) <= 1.0
                and 0 <= (y + h) <= 1.0
            )
            if is_fractional:
                left = x * page_width
                top = y * page_height
                right = (x + w) * page_width
                bottom = (y + h) * page_height
            else:
                left, top = x, y
                right = x + w
                bottom = y + h
        elif "left" in bbox:
            # Format: {left, top, right, bottom}
            bbox_l = float(bbox.get("left", 0))
            bbox_t = float(bbox.get("top", 0))
            bbox_r = float(bbox.get("right", 1))
            bbox_b = float(bbox.get("bottom", 0.05))

            # Check if ALL values are in [0,1] range - indicates fractional coordinates
            is_fractional = all(0 <= v <= 1.0 for v in [bbox_l, bbox_t, bbox_r, bbox_b])
            if is_fractional:
                left = bbox_l * page_width
                top = bbox_t * page_height
                right = bbox_r * page_width
                bottom = bbox_b * page_height
            else:
                left, top, right, bottom = bbox_l, bbox_t, bbox_r, bbox_b
        elif isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            # Format: [x1, y1, x2, y2] or [left, top, right, bottom]
            vals = [float(v) for v in bbox[:4]]
            # Check if ALL values are in [0,1] range - indicates fractional coordinates
            is_fractional = all(0 <= v <= 1.0 for v in vals)
            if is_fractional:
                left = vals[0] * page_width
                top = vals[1] * page_height
                right = vals[2] * page_width
                bottom = vals[3] * page_height
            else:
                left, top, right, bottom = vals
        else:
            # Unknown format, use defaults with standard margins
            left, top = DEFAULT_MARGIN, DEFAULT_MARGIN
            right, bottom = page_width - DEFAULT_MARGIN, DEFAULT_BOTTOM

        # Create tokens - split text into words
        # Note: If text is empty or whitespace-only, we create a single token with the
        # original text (or empty string). This ensures we always have at least one token
        # for the bounding box, which is required for PAWLS format consistency.
        words = text.split()
        if not words:
            words = [text] if text else [""]

        # Calculate token dimensions
        # TOKEN_GAP_RATIO: 5% gap between tokens for visual separation
        TOKEN_GAP_RATIO = 0.95
        total_width = right - left
        token_width = total_width / max(
            len(words), 1
        )  # max() prevents division by zero
        token_height = bottom - top

        for i, word in enumerate(words):
            token: PawlsTokenPythonType = {
                "x": left + (i * token_width),
                "y": top,
                "width": token_width * TOKEN_GAP_RATIO,
                "height": token_height,
                "text": word,
            }
            tokens.append(token)

        # Create overall bounding box
        bounds: BoundingBoxPythonType = {
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
        }

        return tokens, bounds

    def _create_annotation(
        self,
        annotation_id: str,
        label: str,
        raw_text: str,
        page_idx: int,
        bounds: BoundingBoxPythonType,
        start_token_idx: int,
        end_token_idx: int,
    ) -> OpenContractsAnnotationPythonType:
        """
        Create an OpenContracts annotation.

        Args:
            annotation_id: Unique ID for the annotation.
            label: The annotation label.
            raw_text: The text content.
            page_idx: Page index (0-based).
            bounds: Bounding box.
            start_token_idx: Starting token index.
            end_token_idx: Ending token index (exclusive).

        Returns:
            OpenContractsAnnotationPythonType annotation.
        """
        # Create token references
        tokens_jsons: list[TokenIdPythonType] = [
            {"pageIndex": page_idx, "tokenIndex": idx}
            for idx in range(start_token_idx, end_token_idx)
        ]

        # Create page annotation
        page_annotation: OpenContractsSinglePageAnnotationType = {
            "bounds": bounds,
            "tokensJsons": tokens_jsons,
            "rawText": raw_text,
        }

        annotation: OpenContractsAnnotationPythonType = {
            "id": annotation_id,
            "annotationLabel": label,
            "rawText": raw_text,
            "page": page_idx,
            "annotation_json": {str(page_idx): page_annotation},
            "parent_id": None,
            "annotation_type": TOKEN_LABEL,
            "structural": True,
        }

        return annotation
