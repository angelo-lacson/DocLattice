"""
Tests for the LlamaParseParser class.

Tests cover:
- Successful document parsing with JSON/layout output
- PAWLS token generation from bounding boxes
- Structural annotation creation
- Error handling (missing API key, API errors, etc.)
- Configuration via environment variables
"""

import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase, override_settings

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.parsers.llamaparse_parser import LlamaParseParser

User = get_user_model()


class MockLlamaDocument:
    """Mock LlamaIndex Document object."""

    def __init__(self, text: str):
        self.text = text


class TestLlamaParseParser(TestCase):
    """Tests for the LlamaParseParser class."""

    def setUp(self):
        """Set up test environment."""
        with transaction.atomic():
            self.user = User.objects.create_user(username="testuser", password="testpass123")

        # Create a sample Document object with a mock PDF file
        self.doc = Document.objects.create(
            title="Test LlamaParse Document",
            description="Test Description",
            file_type="pdf",
            creator=self.user,
        )

        # Create a minimal valid PDF for testing
        pdf_content = b"%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Count 1/Kids[3 0 R]>>\nendobj\n3 0 obj\n<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\ntrailer\n<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"  # noqa: E501
        self.doc.pdf_file.save("test_llama.pdf", ContentFile(pdf_content))

        # Sample JSON response from LlamaParse with layout data
        self.sample_json_response = [
            {
                "pages": [
                    {
                        "text": "This is the first page of the document.",
                        "width": 612,
                        "height": 792,
                        "items": [
                            {
                                "type": "title",
                                "text": "Document Title",
                                "bbox": {
                                    "x": 0.1,
                                    "y": 0.05,
                                    "width": 0.8,
                                    "height": 0.05,
                                },
                            },
                            {
                                "type": "paragraph",
                                "text": "This is a paragraph with some content.",
                                "bbox": {
                                    "x": 0.1,
                                    "y": 0.15,
                                    "width": 0.8,
                                    "height": 0.1,
                                },
                            },
                            {
                                "type": "table",
                                "text": "Column A | Column B\nValue 1 | Value 2",
                                "bbox": {
                                    "left": 0.1,
                                    "top": 0.3,
                                    "right": 0.9,
                                    "bottom": 0.5,
                                },
                            },
                        ],
                        "layout": [
                            {
                                "label": "title",
                                "bbox": {"x": 0.1, "y": 0.05, "width": 0.8, "height": 0.05},
                                "confidence": 0.95,
                                "isLikelyNoise": False,
                            },
                        ],
                    },
                    {
                        "text": "This is the second page.",
                        "width": 612,
                        "height": 792,
                        "items": [
                            {
                                "type": "text",
                                "text": "More content on page 2.",
                                "bbox": [0.1, 0.1, 0.9, 0.2],  # Array format
                            },
                        ],
                    },
                ]
            }
        ]

    @override_settings(LLAMAPARSE_API_KEY="test-api-key-123")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParse")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.default_storage.open")
    def test_parse_document_success_with_layout(self, mock_open, mock_llama_parse_class):
        """Test successful document parsing with layout extraction."""
        # Mock file reading
        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf content"
        mock_open.return_value.__enter__.return_value = mock_file

        # Mock the LlamaParse instance
        mock_parser = MagicMock()
        mock_parser.get_json_result.return_value = self.sample_json_response
        mock_llama_parse_class.return_value = mock_parser

        # Create parser and parse document
        parser = LlamaParseParser()
        result = parser.parse_document(user_id=self.user.id, doc_id=self.doc.id)

        # Verify result structure
        self.assertIsNotNone(result)
        self.assertEqual(result["title"], "Test LlamaParse Document")
        self.assertEqual(result["page_count"], 2)

        # Verify PAWLS content was generated
        self.assertIn("pawls_file_content", result)
        self.assertEqual(len(result["pawls_file_content"]), 2)

        # Verify first page structure
        first_page = result["pawls_file_content"][0]
        self.assertEqual(first_page["page"]["index"], 0)
        self.assertEqual(first_page["page"]["width"], 612)
        self.assertEqual(first_page["page"]["height"], 792)
        self.assertGreater(len(first_page["tokens"]), 0)

        # Verify annotations were created
        self.assertIn("labelled_text", result)
        self.assertGreater(len(result["labelled_text"]), 0)

        # Verify annotation structure
        first_annotation = result["labelled_text"][0]
        self.assertEqual(first_annotation["annotationLabel"], "Title")
        self.assertEqual(first_annotation["structural"], True)
        self.assertEqual(first_annotation["annotation_type"], "TOKEN_LABEL")
        self.assertIn("annotation_json", first_annotation)

    @override_settings(LLAMAPARSE_API_KEY="test-api-key-123")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParse")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.default_storage.open")
    def test_parse_document_markdown_mode(self, mock_open, mock_llama_parse_class):
        """Test document parsing with markdown output (no layout)."""
        # Mock file reading
        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf content"
        mock_open.return_value.__enter__.return_value = mock_file

        # Mock the LlamaParse instance for markdown mode
        mock_parser = MagicMock()
        mock_parser.load_data.return_value = [
            MockLlamaDocument("# Title\n\nThis is the document content."),
            MockLlamaDocument("## Section 2\n\nMore content here."),
        ]
        mock_llama_parse_class.return_value = mock_parser

        # Create parser and parse document with markdown mode
        parser = LlamaParseParser()
        result = parser.parse_document(
            user_id=self.user.id,
            doc_id=self.doc.id,
            result_type="markdown",
            extract_layout=False,
        )

        # Verify result structure
        self.assertIsNotNone(result)
        self.assertEqual(result["title"], "Test LlamaParse Document")
        self.assertIn("# Title", result["content"])
        self.assertEqual(result["page_count"], 2)

        # Verify no PAWLS content (markdown mode)
        self.assertEqual(result["pawls_file_content"], [])

        # Verify no annotations (markdown mode without layout)
        self.assertEqual(result["labelled_text"], [])

    def test_parse_document_no_api_key(self):
        """Test that parsing fails gracefully without API key."""
        with override_settings(LLAMAPARSE_API_KEY=""):
            parser = LlamaParseParser()
            parser.api_key = ""  # Ensure no API key

            result = parser.parse_document(user_id=self.user.id, doc_id=self.doc.id)

            self.assertIsNone(result)

    @override_settings(LLAMAPARSE_API_KEY="test-api-key-123")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParse")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.default_storage.open")
    def test_parse_document_api_error(self, mock_open, mock_llama_parse_class):
        """Test handling of API errors."""
        # Mock file reading
        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf content"
        mock_open.return_value.__enter__.return_value = mock_file

        # Mock the LlamaParse instance to raise an error
        mock_parser = MagicMock()
        mock_parser.get_json_result.side_effect = Exception("API rate limit exceeded")
        mock_llama_parse_class.return_value = mock_parser

        # Create parser and attempt to parse
        parser = LlamaParseParser()
        result = parser.parse_document(user_id=self.user.id, doc_id=self.doc.id)

        # Should return None on error
        self.assertIsNone(result)

    @override_settings(LLAMAPARSE_API_KEY="test-api-key-123")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParse")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.default_storage.open")
    def test_parse_document_empty_result(self, mock_open, mock_llama_parse_class):
        """Test handling of empty results from API."""
        # Mock file reading
        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf content"
        mock_open.return_value.__enter__.return_value = mock_file

        # Mock empty response
        mock_parser = MagicMock()
        mock_parser.get_json_result.return_value = []
        mock_llama_parse_class.return_value = mock_parser

        parser = LlamaParseParser()
        result = parser.parse_document(user_id=self.user.id, doc_id=self.doc.id)

        self.assertIsNone(result)

    def test_parse_document_nonexistent(self):
        """Test parsing a document that doesn't exist."""
        with override_settings(LLAMAPARSE_API_KEY="test-api-key-123"):
            parser = LlamaParseParser()
            result = parser.parse_document(user_id=self.user.id, doc_id=999999)

            self.assertIsNone(result)

    @override_settings(LLAMAPARSE_API_KEY="test-api-key-123")
    def test_parse_document_no_pdf_file(self):
        """Test parsing a document without a PDF file."""
        # Create a document without a PDF file
        doc_without_pdf = Document.objects.create(
            title="No PDF Document",
            description="Test",
            file_type="pdf",
            creator=self.user,
        )

        parser = LlamaParseParser()
        result = parser.parse_document(user_id=self.user.id, doc_id=doc_without_pdf.id)

        self.assertIsNone(result)


class TestLlamaParseParserBboxConversion(TestCase):
    """Tests for bounding box conversion methods."""

    def setUp(self):
        """Set up test environment."""
        self.parser = LlamaParseParser()

    def test_bbox_fractional_xy_format(self):
        """Test conversion of fractional x,y,width,height bbox format."""
        bbox = {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1}
        tokens, bounds = self.parser._create_pawls_tokens_from_bbox(
            text="test word",
            bbox=bbox,
            page_width=612,
            page_height=792,
            start_token_idx=0,
        )

        # Check bounds are converted to absolute coordinates
        self.assertAlmostEqual(bounds["left"], 61.2, places=1)
        self.assertAlmostEqual(bounds["top"], 158.4, places=1)
        self.assertAlmostEqual(bounds["right"], 244.8, places=1)
        self.assertAlmostEqual(bounds["bottom"], 237.6, places=1)

        # Check tokens were created
        self.assertEqual(len(tokens), 2)  # "test" and "word"
        self.assertEqual(tokens[0]["text"], "test")
        self.assertEqual(tokens[1]["text"], "word")

    def test_bbox_fractional_ltrb_format(self):
        """Test conversion of fractional left,top,right,bottom bbox format."""
        bbox = {"left": 0.1, "top": 0.2, "right": 0.9, "bottom": 0.3}
        tokens, bounds = self.parser._create_pawls_tokens_from_bbox(
            text="hello world",
            bbox=bbox,
            page_width=612,
            page_height=792,
            start_token_idx=0,
        )

        self.assertAlmostEqual(bounds["left"], 61.2, places=1)
        self.assertAlmostEqual(bounds["top"], 158.4, places=1)
        self.assertAlmostEqual(bounds["right"], 550.8, places=1)
        self.assertAlmostEqual(bounds["bottom"], 237.6, places=1)

    def test_bbox_array_format(self):
        """Test conversion of array bbox format [x1, y1, x2, y2]."""
        bbox = [0.1, 0.2, 0.9, 0.3]
        tokens, bounds = self.parser._create_pawls_tokens_from_bbox(
            text="array format test",
            bbox=bbox,
            page_width=612,
            page_height=792,
            start_token_idx=0,
        )

        self.assertAlmostEqual(bounds["left"], 61.2, places=1)
        self.assertAlmostEqual(bounds["top"], 158.4, places=1)
        self.assertAlmostEqual(bounds["right"], 550.8, places=1)
        self.assertAlmostEqual(bounds["bottom"], 237.6, places=1)

    def test_bbox_absolute_coordinates(self):
        """Test handling of absolute coordinate bbox (values > 1)."""
        bbox = {"x": 100, "y": 200, "width": 300, "height": 50}
        tokens, bounds = self.parser._create_pawls_tokens_from_bbox(
            text="absolute coords",
            bbox=bbox,
            page_width=612,
            page_height=792,
            start_token_idx=0,
        )

        # When values > 1, they're treated as absolute
        self.assertEqual(bounds["left"], 100)
        self.assertEqual(bounds["top"], 200)
        self.assertEqual(bounds["right"], 400)  # x + width
        self.assertEqual(bounds["bottom"], 250)  # y + height

    def test_bbox_empty(self):
        """Test handling of empty/missing bbox."""
        tokens, bounds = self.parser._create_pawls_tokens_from_bbox(
            text="no bbox",
            bbox={},
            page_width=612,
            page_height=792,
            start_token_idx=0,
        )

        # Should use default margins
        self.assertEqual(bounds["left"], 72)
        self.assertEqual(bounds["top"], 72)

        # Tokens should still be created
        self.assertEqual(len(tokens), 2)

    def test_token_spacing(self):
        """Test that tokens are properly spaced within the bounding box."""
        bbox = {"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 0.1}
        tokens, bounds = self.parser._create_pawls_tokens_from_bbox(
            text="one two three four",
            bbox=bbox,
            page_width=612,
            page_height=792,
            start_token_idx=0,
        )

        self.assertEqual(len(tokens), 4)

        # Check tokens don't overlap (each starts after previous)
        for i in range(1, len(tokens)):
            self.assertGreater(tokens[i]["x"], tokens[i - 1]["x"])


class TestLlamaParseParserAnnotations(TestCase):
    """Tests for annotation creation methods."""

    def setUp(self):
        """Set up test environment."""
        self.parser = LlamaParseParser()

    def test_create_annotation_structure(self):
        """Test annotation creation has correct structure."""
        bounds = {"left": 100, "top": 100, "right": 300, "bottom": 150}

        annotation = self.parser._create_annotation(
            annotation_id="anno-1",
            label="Title",
            raw_text="Sample Title",
            page_idx=0,
            bounds=bounds,
            start_token_idx=0,
            end_token_idx=2,
        )

        # Check required fields
        self.assertEqual(annotation["id"], "anno-1")
        self.assertEqual(annotation["annotationLabel"], "Title")
        self.assertEqual(annotation["rawText"], "Sample Title")
        self.assertEqual(annotation["page"], 0)
        self.assertEqual(annotation["structural"], True)
        self.assertEqual(annotation["annotation_type"], "TOKEN_LABEL")
        self.assertIsNone(annotation["parent_id"])

        # Check annotation_json structure
        self.assertIn("0", annotation["annotation_json"])
        page_anno = annotation["annotation_json"]["0"]
        self.assertEqual(page_anno["bounds"], bounds)
        self.assertEqual(page_anno["rawText"], "Sample Title")
        self.assertEqual(len(page_anno["tokensJsons"]), 2)

    def test_element_type_mapping(self):
        """Test that element types are properly mapped to labels."""
        type_mappings = {
            "title": "Title",
            "paragraph": "Paragraph",
            "table": "Table",
            "figure": "Figure",
            "list": "List",
            "heading": "Heading",
            "unknown_type": "Text Block",  # Default
        }

        for element_type, expected_label in type_mappings.items():
            label = LlamaParseParser.ELEMENT_TYPE_MAPPING.get(element_type, "Text Block")
            self.assertEqual(
                label,
                expected_label,
                f"Element type '{element_type}' should map to '{expected_label}'",
            )


class TestLlamaParseParserConfiguration(TestCase):
    """Tests for parser configuration."""

    def test_default_configuration(self):
        """Test default configuration values."""
        with override_settings(
            LLAMAPARSE_API_KEY="test-key",
            LLAMAPARSE_RESULT_TYPE="json",
            LLAMAPARSE_EXTRACT_LAYOUT=True,
            LLAMAPARSE_NUM_WORKERS=4,
            LLAMAPARSE_LANGUAGE="en",
            LLAMAPARSE_VERBOSE=False,
        ):
            parser = LlamaParseParser()

            self.assertEqual(parser.result_type, "json")
            self.assertEqual(parser.extract_layout, True)
            self.assertEqual(parser.num_workers, 4)
            self.assertEqual(parser.language, "en")
            self.assertEqual(parser.verbose, False)

    def test_custom_configuration(self):
        """Test custom configuration via settings."""
        with override_settings(
            LLAMAPARSE_API_KEY="custom-key",
            LLAMAPARSE_RESULT_TYPE="markdown",
            LLAMAPARSE_EXTRACT_LAYOUT=False,
            LLAMAPARSE_NUM_WORKERS=8,
            LLAMAPARSE_LANGUAGE="de",
            LLAMAPARSE_VERBOSE=True,
        ):
            parser = LlamaParseParser()

            self.assertEqual(parser.result_type, "markdown")
            self.assertEqual(parser.extract_layout, False)
            self.assertEqual(parser.num_workers, 8)
            self.assertEqual(parser.language, "de")
            self.assertEqual(parser.verbose, True)

    @override_settings(LLAMAPARSE_API_KEY="test-key")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParse")
    @patch("opencontractserver.pipeline.parsers.llamaparse_parser.default_storage.open")
    def test_kwargs_override_settings(self, mock_open, mock_llama_parse_class):
        """Test that kwargs override settings."""
        with transaction.atomic():
            user = User.objects.create_user(username="configtestuser", password="pass123")

        doc = Document.objects.create(
            title="Config Test Doc",
            file_type="pdf",
            creator=user,
        )
        doc.pdf_file.save("config_test.pdf", ContentFile(b"%PDF-1.4 test"))

        mock_file = MagicMock()
        mock_file.read.return_value = b"mock pdf"
        mock_open.return_value.__enter__.return_value = mock_file

        mock_parser = MagicMock()
        mock_parser.get_json_result.return_value = [{"pages": []}]
        mock_llama_parse_class.return_value = mock_parser

        parser = LlamaParseParser()
        parser.parse_document(
            user_id=user.id,
            doc_id=doc.id,
            language="fr",
            num_workers=16,
        )

        # Verify LlamaParse was called with overridden values
        mock_llama_parse_class.assert_called_once()
        call_kwargs = mock_llama_parse_class.call_args.kwargs
        self.assertEqual(call_kwargs["language"], "fr")
        self.assertEqual(call_kwargs["num_workers"], 16)
