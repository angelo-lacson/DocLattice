"""
Tests for the PDF splitting utility used by chunked document processing.
"""

import io

from django.test import TestCase
from pypdf import PdfReader

from opencontractserver.tests.helpers import make_test_pdf
from opencontractserver.utils.pdf_splitting import (
    calculate_page_chunks,
    get_pdf_page_count,
    split_pdf_by_page_range,
)


class TestGetPdfPageCount(TestCase):
    """Tests for get_pdf_page_count."""

    def test_single_page(self):
        pdf_bytes = make_test_pdf(1)
        self.assertEqual(get_pdf_page_count(pdf_bytes), 1)

    def test_multi_page(self):
        pdf_bytes = make_test_pdf(10)
        self.assertEqual(get_pdf_page_count(pdf_bytes), 10)

    def test_large_document(self):
        pdf_bytes = make_test_pdf(200)
        self.assertEqual(get_pdf_page_count(pdf_bytes), 200)

    def test_invalid_pdf_raises(self):
        with self.assertRaises(ValueError):
            get_pdf_page_count(b"not a pdf")


class TestSplitPdfByPageRange(TestCase):
    """Tests for split_pdf_by_page_range."""

    def test_first_chunk(self):
        pdf_bytes = make_test_pdf(10)
        chunk = split_pdf_by_page_range(pdf_bytes, 0, 5)
        self.assertEqual(get_pdf_page_count(chunk), 5)

    def test_last_chunk(self):
        pdf_bytes = make_test_pdf(10)
        chunk = split_pdf_by_page_range(pdf_bytes, 5, 10)
        self.assertEqual(get_pdf_page_count(chunk), 5)

    def test_single_page_chunk(self):
        pdf_bytes = make_test_pdf(5)
        chunk = split_pdf_by_page_range(pdf_bytes, 2, 3)
        self.assertEqual(get_pdf_page_count(chunk), 1)

    def test_end_page_clamped_to_total(self):
        pdf_bytes = make_test_pdf(10)
        chunk = split_pdf_by_page_range(pdf_bytes, 7, 100)
        self.assertEqual(get_pdf_page_count(chunk), 3)

    def test_invalid_start_page_negative(self):
        pdf_bytes = make_test_pdf(5)
        with self.assertRaises(ValueError):
            split_pdf_by_page_range(pdf_bytes, -1, 3)

    def test_end_before_start(self):
        pdf_bytes = make_test_pdf(5)
        with self.assertRaises(ValueError):
            split_pdf_by_page_range(pdf_bytes, 3, 2)

    def test_start_equals_end(self):
        pdf_bytes = make_test_pdf(5)
        with self.assertRaises(ValueError):
            split_pdf_by_page_range(pdf_bytes, 3, 3)

    def test_start_beyond_document(self):
        pdf_bytes = make_test_pdf(5)
        with self.assertRaises(ValueError):
            split_pdf_by_page_range(pdf_bytes, 10, 15)

    def test_invalid_pdf(self):
        with self.assertRaises(ValueError):
            split_pdf_by_page_range(b"not a pdf", 0, 5)

    def test_full_document_round_trip(self):
        """Splitting the full range should produce a PDF with same page count."""
        pdf_bytes = make_test_pdf(8)
        chunk = split_pdf_by_page_range(pdf_bytes, 0, 8)
        self.assertEqual(get_pdf_page_count(chunk), 8)

    def test_accepts_prebuilt_reader(self):
        """Passing a pre-built PdfReader avoids re-parsing the full PDF."""
        pdf_bytes = make_test_pdf(10)
        reader = PdfReader(io.BytesIO(pdf_bytes))
        chunk = split_pdf_by_page_range(pdf_bytes, 2, 5, reader=reader)
        self.assertEqual(get_pdf_page_count(chunk), 3)


class TestCalculatePageChunks(TestCase):
    """Tests for calculate_page_chunks."""

    def test_zero_pages(self):
        self.assertEqual(calculate_page_chunks(0, 50, 75), [])

    def test_below_threshold_returns_single(self):
        chunks = calculate_page_chunks(50, 50, 75)
        self.assertEqual(chunks, [(0, 50)])

    def test_one_below_threshold_returns_single(self):
        chunks = calculate_page_chunks(74, 50, 75)
        self.assertEqual(chunks, [(0, 74)])

    def test_at_exact_threshold_splits(self):
        """Exactly min_pages_for_chunking pages should trigger splitting."""
        chunks = calculate_page_chunks(75, 50, 75)
        self.assertEqual(chunks, [(0, 50), (50, 75)])

    def test_above_threshold_splits(self):
        chunks = calculate_page_chunks(100, 50, 75)
        self.assertEqual(chunks, [(0, 50), (50, 100)])

    def test_uneven_split(self):
        chunks = calculate_page_chunks(120, 50, 75)
        self.assertEqual(chunks, [(0, 50), (50, 100), (100, 120)])

    def test_exact_multiple(self):
        chunks = calculate_page_chunks(150, 50, 75)
        self.assertEqual(chunks, [(0, 50), (50, 100), (100, 150)])

    def test_large_document(self):
        chunks = calculate_page_chunks(500, 50, 75)
        self.assertEqual(len(chunks), 10)
        # First chunk
        self.assertEqual(chunks[0], (0, 50))
        # Last chunk
        self.assertEqual(chunks[-1], (450, 500))
        # All chunks contiguous
        for i in range(len(chunks) - 1):
            self.assertEqual(chunks[i][1], chunks[i + 1][0])

    def test_single_page_document(self):
        chunks = calculate_page_chunks(1, 50, 75)
        self.assertEqual(chunks, [(0, 1)])

    def test_zero_max_pages_per_chunk_raises(self):
        with self.assertRaises(ValueError):
            calculate_page_chunks(100, 0, 75)

    def test_negative_max_pages_per_chunk_raises(self):
        with self.assertRaises(ValueError):
            calculate_page_chunks(100, -1, 75)

    def test_zero_min_pages_for_chunking_raises(self):
        with self.assertRaises(ValueError):
            calculate_page_chunks(100, 50, 0)

    def test_negative_min_pages_for_chunking_raises(self):
        with self.assertRaises(ValueError):
            calculate_page_chunks(100, 50, -1)
