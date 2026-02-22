"""
Utilities for splitting PDF documents into page-range chunks.

Used by the chunked parsing pipeline to break large documents into
smaller pieces that can be parsed independently and reassembled.
"""

import io
import logging

from pypdf import PdfReader, PdfWriter

logger = logging.getLogger(__name__)


def get_pdf_page_count(pdf_bytes: bytes) -> int:
    """
    Return the number of pages in a PDF document.

    Args:
        pdf_bytes: Raw PDF file bytes.

    Returns:
        The number of pages in the PDF.

    Raises:
        ValueError: If the PDF cannot be read.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return len(reader.pages)
    except Exception as e:
        raise ValueError(f"Failed to read PDF for page count: {e}") from e


def split_pdf_by_page_range(
    pdf_bytes: bytes,
    start_page: int,
    end_page: int,
    reader: "PdfReader | None" = None,
) -> bytes:
    """
    Extract a contiguous range of pages from a PDF and return as new PDF bytes.

    Args:
        pdf_bytes: Raw PDF file bytes.
        start_page: First page to include (0-based, inclusive).
        end_page: Last page to include (0-based, exclusive).
        reader: Optional pre-built PdfReader to avoid re-parsing the PDF
            on every call. When splitting multiple ranges from the same PDF,
            create one reader and pass it to each call.

    Returns:
        Bytes of a new PDF containing only the specified page range.

    Raises:
        ValueError: If the page range is invalid or the PDF cannot be read.
    """
    if start_page < 0:
        raise ValueError(f"start_page must be >= 0, got {start_page}")
    if end_page <= start_page:
        raise ValueError(f"end_page ({end_page}) must be > start_page ({start_page})")

    if reader is None:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
        except Exception as e:
            raise ValueError(f"Failed to read PDF: {e}") from e

    total_pages = len(reader.pages)
    if start_page >= total_pages:
        raise ValueError(f"start_page ({start_page}) >= total pages ({total_pages})")

    # Clamp end_page to total pages
    actual_end = min(end_page, total_pages)

    writer = PdfWriter()
    for page_idx in range(start_page, actual_end):
        writer.add_page(reader.pages[page_idx])

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def calculate_page_chunks(
    total_pages: int,
    max_pages_per_chunk: int,
    min_pages_for_chunking: int,
) -> list[tuple[int, int]]:
    """
    Calculate page-range chunks for a document.

    If the document has *strictly fewer* pages than ``min_pages_for_chunking``,
    returns a single chunk spanning all pages (no splitting).  A document with
    exactly ``min_pages_for_chunking`` pages **will** be split.

    Args:
        total_pages: Total number of pages in the document.
        max_pages_per_chunk: Maximum pages per chunk (must be > 0).
        min_pages_for_chunking: Page count at which chunking activates (must be > 0).

    Returns:
        List of (start_page, end_page) tuples where start is inclusive
        and end is exclusive (0-based).

    Raises:
        ValueError: If ``max_pages_per_chunk`` or ``min_pages_for_chunking`` is <= 0.
    """
    if max_pages_per_chunk <= 0:
        raise ValueError(f"max_pages_per_chunk must be > 0, got {max_pages_per_chunk}")
    if min_pages_for_chunking <= 0:
        raise ValueError(
            f"min_pages_for_chunking must be > 0, got {min_pages_for_chunking}"
        )

    if total_pages <= 0:
        return []

    if total_pages < min_pages_for_chunking:
        return [(0, total_pages)]

    chunks: list[tuple[int, int]] = []
    start = 0
    while start < total_pages:
        end = min(start + max_pages_per_chunk, total_pages)
        chunks.append((start, end))
        start = end

    return chunks
