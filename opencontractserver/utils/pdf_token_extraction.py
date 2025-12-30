"""
PDF Token Extraction Utility.

This module provides functions to extract word-level tokens from PDFs
and calculate which tokens fall within annotation bounding boxes.

Based on the Docsling microservice implementation:
https://github.com/JSv4/Docsling/blob/main/app/core/parser.py
"""

import io
import logging
from typing import Optional

import numpy as np
from shapely.geometry import box
from shapely.strtree import STRtree

from opencontractserver.types.dicts import (
    BoundingBoxPythonType,
    PawlsPagePythonType,
    PawlsTokenPythonType,
    TokenIdPythonType,
)

logger = logging.getLogger(__name__)


def has_extractable_text(pdf_bytes: bytes, min_chars: int = 10) -> bool:
    """
    Check if a PDF has extractable text content.

    This is a detection function only - no OCR is performed. PDFs without
    embedded text (scanned documents) will return False.

    Args:
        pdf_bytes: The raw bytes of the PDF file.
        min_chars: Minimum number of non-whitespace characters to consider
                   the PDF as having extractable text. Default: 10.

    Returns:
        True if the PDF has extractable text, False otherwise.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.warning("pdfplumber not installed. Cannot check for extractable text.")
        return False

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                logger.warning("PDF has no pages.")
                return False

            # Check the first few pages for text content
            pages_to_check = min(len(pdf.pages), 3)
            for i in range(pages_to_check):
                try:
                    page_text = pdf.pages[i].extract_text(x_tolerance=2, y_tolerance=2)
                    if page_text and len(page_text.strip()) > min_chars:
                        logger.debug(f"Text found on page {i + 1} using pdfplumber.")
                        return True
                except Exception as page_error:
                    logger.warning(
                        f"Could not extract text from page {i + 1}: {page_error}"
                    )
                    continue

            logger.info(
                f"No significant text found in first {pages_to_check} pages. "
                "PDF may be scanned."
            )
            return False

    except Exception as e:
        logger.error(f"Error checking PDF for extractable text: {e}")
        return False


def extract_pawls_tokens_from_pdf(
    pdf_bytes: bytes,
    page_dimensions: Optional[dict[int, tuple[float, float]]] = None,
) -> tuple[
    list[PawlsPagePythonType],
    dict[int, STRtree],
    dict[int, list[PawlsTokenPythonType]],
    dict[int, np.ndarray],
    dict[int, tuple[float, float]],
    str,
]:
    """
    Extract word-level tokens from a PDF with bounding boxes.

    Uses pdfplumber for text extraction. Returns PAWLS-compatible token data
    and spatial indices for intersection queries.

    This function is based on Docsling's _generate_pawls_content() function,
    simplified to remove OCR support.

    Args:
        pdf_bytes: The raw bytes of the PDF file.
        page_dimensions: Optional dict mapping 0-based page index to (width, height)
                        tuples. If provided, coordinates are scaled to match.
                        If None, pdfplumber's native dimensions are used.

    Returns:
        A tuple containing:
        - pawls_pages: List of PawlsPagePythonType with tokens per page
        - spatial_indices: Dict mapping 0-based page index to STRtree spatial index
        - tokens_by_page: Dict mapping 0-based page index to list of tokens
        - token_indices_by_page: Dict mapping 0-based page index to numpy array
                                 of original token indices
        - page_dims: Dict mapping 0-based page index to (width, height) tuple
        - content: Full text content concatenated across pages

    Raises:
        ImportError: If pdfplumber is not installed.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber not installed. Install with: pip install pdfplumber")
        raise

    pawls_pages: list[PawlsPagePythonType] = []
    spatial_indices_by_page: dict[int, STRtree] = {}
    tokens_by_page: dict[int, list[PawlsTokenPythonType]] = {}
    token_indices_by_page: dict[int, np.ndarray] = {}
    page_dims: dict[int, tuple[float, float]] = {}
    content_parts: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                logger.warning("PDF has no pages.")
                return (
                    pawls_pages,
                    spatial_indices_by_page,
                    tokens_by_page,
                    token_indices_by_page,
                    page_dims,
                    "",
                )

            for page_num_0based, pdf_page in enumerate(pdf.pages):
                logger.debug(f"Processing page {page_num_0based + 1} with pdfplumber")

                # Get page dimensions
                native_width = float(pdf_page.width)
                native_height = float(pdf_page.height)

                # Use provided dimensions if available, otherwise use native
                if page_dimensions and page_num_0based in page_dimensions:
                    width, height = page_dimensions[page_num_0based]
                    scale_x = width / native_width
                    scale_y = height / native_height
                else:
                    width, height = native_width, native_height
                    scale_x, scale_y = 1.0, 1.0

                page_dims[page_num_0based] = (width, height)

                current_page_tokens: list[PawlsTokenPythonType] = []
                current_page_geometries: list[box] = []
                current_page_token_indices: list[int] = []
                page_content_parts: list[str] = []

                # Extract words using pdfplumber
                # Match Docsling's extraction options for consistency
                words = pdf_page.extract_words(
                    x_tolerance=2,
                    y_tolerance=2,
                    keep_blank_chars=False,
                    use_text_flow=True,
                )

                if not words:
                    logger.debug(f"No words found on page {page_num_0based + 1}.")
                    content_parts.append("")
                    pawls_page: PawlsPagePythonType = {
                        "page": {
                            "width": width,
                            "height": height,
                            "index": page_num_0based,
                        },
                        "tokens": [],
                    }
                    pawls_pages.append(pawls_page)
                    tokens_by_page[page_num_0based] = []
                    token_indices_by_page[page_num_0based] = np.array([], dtype=np.intp)
                    continue

                for token_index, word in enumerate(words):
                    # pdfplumber coordinates: x0, top, x1, bottom (origin top-left)
                    x0 = float(word["x0"]) * scale_x
                    top = float(word["top"]) * scale_y
                    x1 = float(word["x1"]) * scale_x
                    bottom = float(word["bottom"]) * scale_y
                    text = word["text"]

                    # PAWLS uses top-left corner (x, y) and width, height
                    token_x = x0
                    token_y = top
                    token_width = x1 - x0
                    token_height = bottom - top

                    # Skip potentially invalid boxes
                    if token_width <= 0 or token_height <= 0 or not text.strip():
                        continue

                    token: PawlsTokenPythonType = {
                        "x": token_x,
                        "y": token_y,
                        "width": token_width,
                        "height": token_height,
                        "text": text,
                    }
                    current_page_tokens.append(token)
                    page_content_parts.append(text)

                    # Create geometry for STRtree (minx, miny, maxx, maxy)
                    token_bbox = box(
                        token_x, token_y, token_x + token_width, token_y + token_height
                    )
                    current_page_geometries.append(token_bbox)
                    current_page_token_indices.append(len(current_page_tokens) - 1)

                content_parts.append(" ".join(page_content_parts))

                # Build spatial index for the page if tokens were found
                if current_page_geometries:
                    geometries_array = np.array(current_page_geometries)
                    token_indices_array = np.array(
                        current_page_token_indices, dtype=np.intp
                    )
                    spatial_index = STRtree(geometries_array)
                    spatial_indices_by_page[page_num_0based] = spatial_index
                    tokens_by_page[page_num_0based] = current_page_tokens
                    token_indices_by_page[page_num_0based] = token_indices_array
                    logger.debug(
                        f"Built STRtree for page {page_num_0based + 1} with "
                        f"{len(current_page_geometries)} tokens."
                    )
                else:
                    tokens_by_page[page_num_0based] = []
                    token_indices_by_page[page_num_0based] = np.array([], dtype=np.intp)

                # Create PAWLS page structure
                pawls_page = {
                    "page": {
                        "width": width,
                        "height": height,
                        "index": page_num_0based,
                    },
                    "tokens": current_page_tokens,
                }
                pawls_pages.append(pawls_page)

        full_content = "\n".join(content_parts)
        logger.info(f"Extracted tokens from {len(pawls_pages)} pages.")

        return (
            pawls_pages,
            spatial_indices_by_page,
            tokens_by_page,
            token_indices_by_page,
            page_dims,
            full_content,
        )

    except Exception as e:
        logger.error(f"Error extracting tokens from PDF: {e}")
        raise


def find_tokens_in_bbox(
    bbox: BoundingBoxPythonType,
    page_idx: int,
    spatial_index: Optional[STRtree],
    token_indices: Optional[np.ndarray],
    tokens: Optional[list[PawlsTokenPythonType]] = None,
) -> list[TokenIdPythonType]:
    """
    Find all tokens that intersect with a bounding box.

    Uses spatial indexing (STRtree) to efficiently find tokens that overlap
    with the given bounding box.

    This function is based on the spatial query portion of Docsling's
    convert_docling_item_to_annotation() function.

    Args:
        bbox: The bounding box to find intersecting tokens for.
              Uses {left, top, right, bottom} format.
        page_idx: 0-based page index.
        spatial_index: STRtree spatial index for the page (from extract_pawls_tokens_from_pdf).
        token_indices: Numpy array of token indices for the page.
        tokens: Optional list of tokens for validation (unused, kept for API compatibility).

    Returns:
        List of TokenIdPythonType references ({pageIndex, tokenIndex}) for tokens
        that intersect with the bounding box. Returns empty list if no spatial
        index is available or no tokens intersect.
    """
    if spatial_index is None or token_indices is None:
        logger.debug(f"No spatial index for page {page_idx}, returning empty tokens.")
        return []

    if len(token_indices) == 0:
        return []

    try:
        # Create bbox geometry for query
        left = float(bbox["left"])
        top = float(bbox["top"])
        right = float(bbox["right"])
        bottom = float(bbox["bottom"])

        # Ensure valid bounds
        if left > right:
            left, right = right, left
        if top > bottom:
            top, bottom = bottom, top

        query_bbox = box(left, top, right, bottom)

        # Perform spatial query
        candidate_indices = spatial_index.query(query_bbox)

        if not isinstance(candidate_indices, np.ndarray) or candidate_indices.size == 0:
            return []

        # Filter to only valid indices
        valid_indices = candidate_indices[
            candidate_indices < len(spatial_index.geometries)
        ]

        if len(valid_indices) == 0:
            return []

        # Check for actual intersection (STRtree.query returns bounding box overlaps)
        candidate_geometries = spatial_index.geometries.take(valid_indices)
        intersects_mask = np.array(
            [
                geom.intersects(query_bbox) if geom.is_valid else False
                for geom in candidate_geometries
            ]
        )
        actual_indices = valid_indices[intersects_mask]

        if actual_indices.size == 0:
            return []

        # Map back to token indices and ensure they're valid
        valid_actual_indices = actual_indices[actual_indices < len(token_indices)]
        if valid_actual_indices.size == 0:
            return []

        result_token_indices = token_indices[valid_actual_indices]

        # Create token reference list
        token_refs: list[TokenIdPythonType] = [
            {"pageIndex": page_idx, "tokenIndex": int(idx)}
            for idx in sorted(result_token_indices)
        ]

        return token_refs

    except Exception as e:
        logger.error(f"Error during spatial query for page {page_idx}: {e}")
        return []
