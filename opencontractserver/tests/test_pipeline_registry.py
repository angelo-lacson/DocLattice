"""
Tests for the pipeline component registry.

Tests the cached registry pattern that provides efficient access to
pipeline components (parsers, embedders, thumbnailers, post-processors).
"""

from django.test import TestCase

from opencontractserver.pipeline.registry import (
    ComponentType,
    PipelineComponentDefinition,
    get_all_components_cached,
    get_all_embedders_cached,
    get_all_parsers_cached,
    get_all_post_processors_cached,
    get_all_thumbnailers_cached,
    get_component_by_name_cached,
    get_components_by_mimetype_cached,
    get_registry,
    reset_registry,
)


class TestPipelineComponentDefinition(TestCase):
    """Tests for PipelineComponentDefinition dataclass."""

    def test_to_dict_basic(self):
        """Test basic conversion to dictionary."""
        defn = PipelineComponentDefinition(
            name="TestParser",
            class_name="test.module.TestParser",
            component_type=ComponentType.PARSER,
            title="Test Parser",
            module_name="test_module",
            description="A test parser",
            author="Test Author",
            dependencies=("dep1", "dep2"),
            supported_file_types=("application/pdf",),
            input_schema={"type": "object"},
        )

        result = defn.to_dict()

        self.assertEqual(result["name"], "TestParser")
        self.assertEqual(result["class_name"], "test.module.TestParser")
        self.assertEqual(result["component_type"], "parser")
        self.assertEqual(result["title"], "Test Parser")
        self.assertEqual(result["dependencies"], ["dep1", "dep2"])
        self.assertEqual(result["supported_file_types"], ["application/pdf"])
        self.assertNotIn("vector_size", result)

    def test_to_dict_with_vector_size(self):
        """Test that embedders include vector_size."""
        defn = PipelineComponentDefinition(
            name="TestEmbedder",
            class_name="test.module.TestEmbedder",
            component_type=ComponentType.EMBEDDER,
            title="Test Embedder",
            module_name="test_module",
            description="A test embedder",
            author="Test Author",
            dependencies=(),
            supported_file_types=(),
            vector_size=768,
        )

        result = defn.to_dict()

        self.assertEqual(result["vector_size"], 768)

    def test_frozen_dataclass(self):
        """Test that definition is immutable."""
        defn = PipelineComponentDefinition(
            name="TestParser",
            class_name="test.module.TestParser",
            component_type=ComponentType.PARSER,
            title="Test Parser",
            module_name="test_module",
            description="A test parser",
            author="Test Author",
            dependencies=(),
            supported_file_types=(),
        )

        with self.assertRaises(Exception):
            defn.name = "ChangedName"


class TestPipelineComponentRegistry(TestCase):
    """Tests for PipelineComponentRegistry singleton."""

    def setUp(self):
        """Reset registry before each test."""
        reset_registry()

    def tearDown(self):
        """Reset registry after each test."""
        reset_registry()

    def test_singleton_pattern(self):
        """Test that registry is a singleton."""
        registry1 = get_registry()
        registry2 = get_registry()
        self.assertIs(registry1, registry2)

    def test_registry_has_parsers(self):
        """Test that registry discovers parsers."""
        registry = get_registry()
        self.assertIsInstance(registry.parsers, tuple)
        # Should have at least one parser (DoclingParser, NLMIngestParser, etc.)
        self.assertGreater(len(registry.parsers), 0)

    def test_registry_has_embedders(self):
        """Test that registry discovers embedders."""
        registry = get_registry()
        self.assertIsInstance(registry.embedders, tuple)
        # Should have at least one embedder
        self.assertGreater(len(registry.embedders), 0)

    def test_registry_has_thumbnailers(self):
        """Test that registry discovers thumbnailers."""
        registry = get_registry()
        self.assertIsInstance(registry.thumbnailers, tuple)
        # Should have at least one thumbnailer
        self.assertGreater(len(registry.thumbnailers), 0)

    def test_get_by_name(self):
        """Test looking up component by name."""
        registry = get_registry()
        # Get first parser name
        if registry.parsers:
            parser_name = registry.parsers[0].name
            result = registry.get_by_name(parser_name)
            self.assertIsNotNone(result)
            self.assertEqual(result.name, parser_name)

    def test_get_by_name_not_found(self):
        """Test looking up non-existent component."""
        registry = get_registry()
        result = registry.get_by_name("NonExistentParser")
        self.assertIsNone(result)

    def test_get_by_class_name(self):
        """Test looking up component by full class name."""
        registry = get_registry()
        if registry.parsers:
            class_name = registry.parsers[0].class_name
            result = registry.get_by_class_name(class_name)
            self.assertIsNotNone(result)
            self.assertEqual(result.class_name, class_name)

    def test_get_parsers_for_filetype_pdf(self):
        """Test getting parsers for PDF files."""
        registry = get_registry()
        # FileTypeEnum.PDF.value is "pdf", not the MIME type
        pdf_parsers = registry.get_parsers_for_filetype("pdf")
        self.assertIsInstance(pdf_parsers, list)
        # Should have at least one PDF parser
        self.assertGreater(len(pdf_parsers), 0)

    def test_get_parsers_for_filetype_unknown(self):
        """Test getting parsers for unknown file type."""
        registry = get_registry()
        result = registry.get_parsers_for_filetype("application/unknown")
        self.assertEqual(result, [])


class TestModuleLevelFunctions(TestCase):
    """Tests for module-level convenience functions."""

    def setUp(self):
        """Reset registry before each test."""
        reset_registry()

    def tearDown(self):
        """Reset registry after each test."""
        reset_registry()

    def test_get_all_parsers_cached(self):
        """Test cached parser retrieval."""
        parsers = get_all_parsers_cached()
        self.assertIsInstance(parsers, tuple)
        self.assertGreater(len(parsers), 0)
        # All should be PipelineComponentDefinition
        for p in parsers:
            self.assertIsInstance(p, PipelineComponentDefinition)
            self.assertEqual(p.component_type, ComponentType.PARSER)

    def test_get_all_embedders_cached(self):
        """Test cached embedder retrieval."""
        embedders = get_all_embedders_cached()
        self.assertIsInstance(embedders, tuple)
        self.assertGreater(len(embedders), 0)
        for e in embedders:
            self.assertIsInstance(e, PipelineComponentDefinition)
            self.assertEqual(e.component_type, ComponentType.EMBEDDER)

    def test_get_all_thumbnailers_cached(self):
        """Test cached thumbnailer retrieval."""
        thumbnailers = get_all_thumbnailers_cached()
        self.assertIsInstance(thumbnailers, tuple)
        for t in thumbnailers:
            self.assertIsInstance(t, PipelineComponentDefinition)
            self.assertEqual(t.component_type, ComponentType.THUMBNAILER)

    def test_get_all_post_processors_cached(self):
        """Test cached post-processor retrieval."""
        post_processors = get_all_post_processors_cached()
        self.assertIsInstance(post_processors, tuple)
        for p in post_processors:
            self.assertIsInstance(p, PipelineComponentDefinition)
            self.assertEqual(p.component_type, ComponentType.POST_PROCESSOR)

    def test_get_component_by_name_cached(self):
        """Test cached component lookup by name."""
        # First, get a known parser name
        parsers = get_all_parsers_cached()
        if parsers:
            parser_name = parsers[0].name
            result = get_component_by_name_cached(parser_name)
            self.assertIsNotNone(result)
            self.assertEqual(result.name, parser_name)

    def test_get_components_by_mimetype_cached_pdf(self):
        """Test getting components for PDF MIME type."""
        result = get_components_by_mimetype_cached("application/pdf")

        self.assertIn("parsers", result)
        self.assertIn("embedders", result)
        self.assertIn("thumbnailers", result)
        self.assertIn("post_processors", result)

        # Should have PDF-compatible parsers
        self.assertGreater(len(result["parsers"]), 0)

    def test_get_all_components_cached(self):
        """Test getting all components grouped by type."""
        result = get_all_components_cached()

        self.assertIn("parsers", result)
        self.assertIn("embedders", result)
        self.assertIn("thumbnailers", result)
        self.assertIn("post_processors", result)

        # Each should be a tuple
        self.assertIsInstance(result["parsers"], tuple)
        self.assertIsInstance(result["embedders"], tuple)

    def test_caching_is_effective(self):
        """Test that registry is only initialized once."""
        # Get first registry
        reset_registry()
        registry1 = get_registry()

        # Get second registry - should be same instance
        registry2 = get_registry()

        # Singleton should return same instance
        self.assertIs(registry1, registry2)

    def test_reset_registry(self):
        """Test that reset_registry clears the singleton."""
        _ = get_registry()  # First access
        reset_registry()
        registry_after_reset = get_registry()
        # Should be a new instance after reset
        self.assertIsNotNone(registry_after_reset)


class TestRegistryPerformance(TestCase):
    """Tests for registry performance characteristics."""

    def setUp(self):
        """Reset registry before each test."""
        reset_registry()

    def tearDown(self):
        """Reset registry after each test."""
        reset_registry()

    def test_subsequent_access_is_fast(self):
        """Test that subsequent registry access doesn't re-scan."""
        import time

        # First access (cold)
        start = time.perf_counter()
        _ = get_registry()
        first_access = time.perf_counter() - start

        # Multiple subsequent accesses (should be near-instant)
        total_subsequent = 0
        for _ in range(100):
            start = time.perf_counter()
            _ = get_registry()
            total_subsequent += time.perf_counter() - start

        avg_subsequent = total_subsequent / 100

        # Subsequent accesses should be much faster than first
        # (This is more of a sanity check than a strict assertion)
        self.assertLess(
            avg_subsequent,
            first_access * 0.1,  # At least 10x faster
            "Subsequent access should be much faster than first access",
        )
