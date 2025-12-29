"""
Tests for the PDF token extraction utility module.

Tests cover:
- Token extraction from PDFs using pdfplumber
- Spatial intersection queries using shapely STRtree
- Edge cases (empty PDFs, invalid coordinates)
- has_extractable_text detection

Uses mock-based testing to avoid needing real PDF fixtures.
"""

from unittest.mock import MagicMock, patch

import numpy as np
from django.test import TestCase
from shapely.geometry import box
from shapely.strtree import STRtree

from opencontractserver.utils.pdf_token_extraction import (
    extract_pawls_tokens_from_pdf,
    find_tokens_in_bbox,
    has_extractable_text,
)


class TestHasExtractableText(TestCase):
    """Tests for the has_extractable_text function."""

    @patch("pdfplumber.open")
    def test_has_extractable_text_returns_true_for_text_pdf(self, mock_pdfplumber_open):
        """Test that has_extractable_text returns True for PDFs with text."""
        # Mock pdfplumber to return a PDF with text
        mock_page = MagicMock()
        mock_page.extract_text.return_value = (
            "This is sample text content that is long enough."
        )

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        result = has_extractable_text(b"fake pdf bytes")

        self.assertTrue(result)

    @patch("pdfplumber.open")
    def test_has_extractable_text_returns_false_for_scanned_pdf(
        self, mock_pdfplumber_open
    ):
        """Test that has_extractable_text returns False for scanned PDFs."""
        # Mock pdfplumber to return a PDF with no text
        mock_page = MagicMock()
        mock_page.extract_text.return_value = ""

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page, mock_page, mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        result = has_extractable_text(b"fake scanned pdf bytes")

        self.assertFalse(result)

    @patch("pdfplumber.open")
    def test_has_extractable_text_returns_false_for_empty_pdf(
        self, mock_pdfplumber_open
    ):
        """Test that has_extractable_text returns False for PDFs with no pages."""
        mock_pdf = MagicMock()
        mock_pdf.pages = []
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        result = has_extractable_text(b"empty pdf")

        self.assertFalse(result)

    @patch("pdfplumber.open")
    def test_has_extractable_text_min_chars_threshold(self, mock_pdfplumber_open):
        """Test that min_chars threshold works correctly."""
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "short"  # Less than 10 chars

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        # Default min_chars=10, "short" is only 5 chars
        result = has_extractable_text(b"pdf", min_chars=10)
        self.assertFalse(result)

        # With lower threshold, should pass
        mock_page.extract_text.return_value = "short"
        result = has_extractable_text(b"pdf", min_chars=3)
        self.assertTrue(result)


class TestExtractPawlsTokensFromPdf(TestCase):
    """Tests for the extract_pawls_tokens_from_pdf function."""

    @patch("pdfplumber.open")
    def test_extract_tokens_returns_correct_format(self, mock_pdfplumber_open):
        """Test that token extraction returns correct PAWLS format."""
        # Mock pdfplumber page with words
        mock_page = MagicMock()
        mock_page.width = 612
        mock_page.height = 792
        mock_page.extract_words.return_value = [
            {"x0": 100, "top": 100, "x1": 150, "bottom": 120, "text": "Hello"},
            {"x0": 160, "top": 100, "x1": 210, "bottom": 120, "text": "World"},
        ]

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        (
            pawls_pages,
            spatial_indices,
            tokens_by_page,
            token_indices_by_page,
            page_dims,
            content,
        ) = extract_pawls_tokens_from_pdf(b"fake pdf bytes")

        # Check PAWLS pages structure
        self.assertEqual(len(pawls_pages), 1)
        self.assertEqual(pawls_pages[0]["page"]["width"], 612)
        self.assertEqual(pawls_pages[0]["page"]["height"], 792)
        self.assertEqual(pawls_pages[0]["page"]["index"], 0)

        # Check tokens
        tokens = pawls_pages[0]["tokens"]
        self.assertEqual(len(tokens), 2)
        self.assertEqual(tokens[0]["text"], "Hello")
        self.assertEqual(tokens[0]["x"], 100)
        self.assertEqual(tokens[0]["y"], 100)
        self.assertEqual(tokens[0]["width"], 50)  # 150 - 100
        self.assertEqual(tokens[0]["height"], 20)  # 120 - 100

        # Check spatial index was created
        self.assertIn(0, spatial_indices)
        self.assertIsInstance(spatial_indices[0], STRtree)

        # Check tokens_by_page
        self.assertIn(0, tokens_by_page)
        self.assertEqual(len(tokens_by_page[0]), 2)

        # Check token_indices_by_page
        self.assertIn(0, token_indices_by_page)
        self.assertEqual(len(token_indices_by_page[0]), 2)

        # Check page dimensions
        self.assertEqual(page_dims[0], (612.0, 792.0))

        # Check content
        self.assertIn("Hello", content)
        self.assertIn("World", content)

    @patch("pdfplumber.open")
    def test_extract_tokens_multiple_pages(self, mock_pdfplumber_open):
        """Test token extraction from multiple pages."""
        mock_page1 = MagicMock()
        mock_page1.width = 612
        mock_page1.height = 792
        mock_page1.extract_words.return_value = [
            {"x0": 100, "top": 100, "x1": 150, "bottom": 120, "text": "Page1"},
        ]

        mock_page2 = MagicMock()
        mock_page2.width = 612
        mock_page2.height = 792
        mock_page2.extract_words.return_value = [
            {"x0": 100, "top": 100, "x1": 150, "bottom": 120, "text": "Page2"},
        ]

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page1, mock_page2]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        (pawls_pages, spatial_indices, tokens_by_page, _, _, content) = (
            extract_pawls_tokens_from_pdf(b"multi-page pdf")
        )

        self.assertEqual(len(pawls_pages), 2)
        self.assertEqual(pawls_pages[0]["page"]["index"], 0)
        self.assertEqual(pawls_pages[1]["page"]["index"], 1)
        self.assertIn(0, spatial_indices)
        self.assertIn(1, spatial_indices)

    @patch("pdfplumber.open")
    def test_extract_tokens_empty_page(self, mock_pdfplumber_open):
        """Test handling of pages with no words."""
        mock_page = MagicMock()
        mock_page.width = 612
        mock_page.height = 792
        mock_page.extract_words.return_value = []

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        (pawls_pages, spatial_indices, tokens_by_page, token_indices_by_page, _, _) = (
            extract_pawls_tokens_from_pdf(b"empty page pdf")
        )

        self.assertEqual(len(pawls_pages), 1)
        self.assertEqual(len(pawls_pages[0]["tokens"]), 0)
        # No spatial index for empty page
        self.assertNotIn(0, spatial_indices)
        self.assertEqual(len(tokens_by_page[0]), 0)

    @patch("pdfplumber.open")
    def test_extract_tokens_with_page_dimensions_override(self, mock_pdfplumber_open):
        """Test that page_dimensions parameter scales coordinates."""
        mock_page = MagicMock()
        mock_page.width = 612  # Native width
        mock_page.height = 792  # Native height
        mock_page.extract_words.return_value = [
            {"x0": 100, "top": 100, "x1": 200, "bottom": 120, "text": "Test"},
        ]

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        # Override with double the dimensions
        page_dimensions = {0: (1224.0, 1584.0)}  # 2x the native dimensions

        (pawls_pages, _, _, _, page_dims, _) = extract_pawls_tokens_from_pdf(
            b"pdf", page_dimensions=page_dimensions
        )

        # Coordinates should be scaled
        token = pawls_pages[0]["tokens"][0]
        self.assertEqual(token["x"], 200)  # 100 * 2
        self.assertEqual(token["y"], 200)  # 100 * 2
        self.assertEqual(token["width"], 200)  # 100 * 2
        self.assertEqual(token["height"], 40)  # 20 * 2

        # Page dimensions should match override
        self.assertEqual(page_dims[0], (1224.0, 1584.0))

    @patch("pdfplumber.open")
    def test_extract_tokens_skips_invalid_tokens(self, mock_pdfplumber_open):
        """Test that tokens with zero width/height or empty text are skipped."""
        mock_page = MagicMock()
        mock_page.width = 612
        mock_page.height = 792
        mock_page.extract_words.return_value = [
            {
                "x0": 100,
                "top": 100,
                "x1": 100,
                "bottom": 120,
                "text": "ZeroWidth",
            },  # Skip
            {
                "x0": 100,
                "top": 100,
                "x1": 150,
                "bottom": 100,
                "text": "ZeroHeight",
            },  # Skip
            {
                "x0": 100,
                "top": 100,
                "x1": 150,
                "bottom": 120,
                "text": "   ",
            },  # Skip whitespace
            {"x0": 200, "top": 100, "x1": 250, "bottom": 120, "text": "Valid"},  # Keep
        ]

        mock_pdf = MagicMock()
        mock_pdf.pages = [mock_page]
        mock_pdfplumber_open.return_value.__enter__.return_value = mock_pdf

        (pawls_pages, _, _, _, _, _) = extract_pawls_tokens_from_pdf(b"pdf")

        # Only the valid token should be included
        self.assertEqual(len(pawls_pages[0]["tokens"]), 1)
        self.assertEqual(pawls_pages[0]["tokens"][0]["text"], "Valid")


class TestFindTokensInBbox(TestCase):
    """Tests for the find_tokens_in_bbox function."""

    def setUp(self):
        """Create a test spatial index with some tokens."""
        # Create tokens at known positions
        self.tokens = [
            {"x": 100, "y": 100, "width": 50, "height": 20, "text": "Token0"},
            {"x": 160, "y": 100, "width": 50, "height": 20, "text": "Token1"},
            {"x": 220, "y": 100, "width": 50, "height": 20, "text": "Token2"},
            {"x": 100, "y": 200, "width": 50, "height": 20, "text": "Token3"},
        ]

        # Create geometries for spatial index
        geometries = []
        for token in self.tokens:
            geom = box(
                token["x"],
                token["y"],
                token["x"] + token["width"],
                token["y"] + token["height"],
            )
            geometries.append(geom)

        self.spatial_index = STRtree(geometries)
        self.token_indices = np.array([0, 1, 2, 3], dtype=np.intp)

    def test_find_tokens_in_bbox_returns_intersecting_tokens(self):
        """Test that find_tokens_in_bbox returns tokens that intersect the bbox."""
        # Bbox that should intersect Token0 and Token1
        bbox = {"left": 80, "top": 90, "right": 200, "bottom": 130}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=0,
            spatial_index=self.spatial_index,
            token_indices=self.token_indices,
            tokens=self.tokens,
        )

        # Should find Token0 and Token1
        self.assertEqual(len(token_refs), 2)
        self.assertIn({"pageIndex": 0, "tokenIndex": 0}, token_refs)
        self.assertIn({"pageIndex": 0, "tokenIndex": 1}, token_refs)

    def test_find_tokens_in_bbox_returns_empty_for_no_intersection(self):
        """Test that find_tokens_in_bbox returns empty list when no intersection."""
        # Bbox that doesn't intersect any tokens
        bbox = {"left": 500, "top": 500, "right": 600, "bottom": 600}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=0,
            spatial_index=self.spatial_index,
            token_indices=self.token_indices,
            tokens=self.tokens,
        )

        self.assertEqual(len(token_refs), 0)

    def test_find_tokens_in_bbox_handles_no_spatial_index(self):
        """Test that find_tokens_in_bbox returns empty list when no spatial index."""
        bbox = {"left": 100, "top": 100, "right": 200, "bottom": 200}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=0,
            spatial_index=None,
            token_indices=None,
            tokens=None,
        )

        self.assertEqual(len(token_refs), 0)

    def test_find_tokens_in_bbox_handles_empty_token_indices(self):
        """Test that find_tokens_in_bbox returns empty list for empty indices."""
        bbox = {"left": 100, "top": 100, "right": 200, "bottom": 200}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=0,
            spatial_index=self.spatial_index,
            token_indices=np.array([], dtype=np.intp),
            tokens=[],
        )

        self.assertEqual(len(token_refs), 0)

    def test_find_tokens_in_bbox_handles_swapped_coordinates(self):
        """Test that find_tokens_in_bbox handles left > right or top > bottom."""
        # Swapped coordinates (right < left, bottom < top)
        bbox = {"left": 200, "top": 130, "right": 80, "bottom": 90}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=0,
            spatial_index=self.spatial_index,
            token_indices=self.token_indices,
            tokens=self.tokens,
        )

        # Should still find Token0 and Token1 after coordinates are swapped
        self.assertEqual(len(token_refs), 2)

    def test_find_tokens_in_bbox_returns_sorted_indices(self):
        """Test that token refs are sorted by token index."""
        # Bbox that should intersect all tokens
        bbox = {"left": 0, "top": 0, "right": 500, "bottom": 500}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=0,
            spatial_index=self.spatial_index,
            token_indices=self.token_indices,
            tokens=self.tokens,
        )

        # Should be sorted by token index
        indices = [ref["tokenIndex"] for ref in token_refs]
        self.assertEqual(indices, sorted(indices))

    def test_find_tokens_in_bbox_uses_correct_page_index(self):
        """Test that returned token refs use the provided page index."""
        bbox = {"left": 80, "top": 90, "right": 200, "bottom": 130}

        token_refs = find_tokens_in_bbox(
            bbox=bbox,
            page_idx=5,  # Use a different page index
            spatial_index=self.spatial_index,
            token_indices=self.token_indices,
            tokens=self.tokens,
        )

        # All refs should have pageIndex=5
        for ref in token_refs:
            self.assertEqual(ref["pageIndex"], 5)
