import inspect
from typing import Optional
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.llms.tools.pydantic_ai_tools import (
    PydanticAIDependencies,
    PydanticAIToolFactory,
    PydanticAIToolWrapper,
    _check_user_permissions,
    create_pydantic_ai_tool_from_func,
    create_typed_pydantic_ai_tool,
    pydantic_ai_tool,
)
from opencontractserver.llms.tools.tool_factory import CoreTool

User = get_user_model()

# ---------------------------------------------------------------------------
# Helper functions for the tests
# ---------------------------------------------------------------------------


def sync_multiply(a: int, b: int) -> int:
    """Multiply two integers and return the product (sync)."""
    return a * b


async def async_add(a: int, b: int) -> int:
    """Add two integers and return the sum (async)."""
    return a + b


def subtract(x: int, y: int) -> int:
    """Subtract y from x."""
    return x - y


# ---------------------------------------------------------------------------
# Test suite
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPydanticAITools(TestCase):
    """Test suite for PydanticAI tool wrappers and factories."""

    def test_pydantic_ai_tool_wrapper_basic_properties(self):
        """Test basic wrapper properties and metadata."""
        core_tool = CoreTool.from_function(sync_multiply)
        wrapper = PydanticAIToolWrapper(core_tool)

        # Basic metadata checks
        self.assertEqual(wrapper.name, "sync_multiply")
        self.assertIn("multiply", wrapper.description.lower())

        # The callable_function should accept `ctx` as first parameter
        callable_tool = wrapper.callable_function
        sig = inspect.signature(callable_tool)
        first_param = next(iter(sig.parameters.keys()))
        self.assertEqual(first_param, "ctx")

        # to_dict should expose minimal metadata
        tool_dict = wrapper.to_dict()
        expected_keys = {"function", "name", "description"}
        self.assertEqual(set(tool_dict.keys()), expected_keys)

    def test_pydantic_ai_tool_factory_collections(self):
        """Test factory helpers for building tool collections."""
        tools = [
            CoreTool.from_function(sync_multiply),
            CoreTool.from_function(async_add),
        ]

        # create_tools returns list[Callable]
        callable_tools = PydanticAIToolFactory.create_tools(tools)
        self.assertEqual(len(callable_tools), 2)
        for tool in callable_tools:
            self.assertTrue(callable(tool))

        # create_tool_registry maps names → callable
        registry = PydanticAIToolFactory.create_tool_registry(tools)
        expected_names = {"sync_multiply", "async_add"}
        self.assertEqual(set(registry.keys()), expected_names)
        for name, fn in registry.items():
            self.assertTrue(callable(fn))

    def test_decorator_function_properties(self):
        """Test decorator creates proper function signatures."""

        @pydantic_ai_tool(description="Square a number")
        def square(x: int) -> int:  # type: ignore[valid-type]
            """Return x squared."""
            return x * x

        # Check that decorator preserves callable nature
        self.assertTrue(callable(square))

        # Check signature includes ctx parameter
        sig = inspect.signature(square)
        first_param = next(iter(sig.parameters.keys()))
        self.assertEqual(first_param, "ctx")

    def test_typed_tool_creation(self):
        """Test creation of typed tools from annotated functions."""
        typed_tool = create_typed_pydantic_ai_tool(subtract)

        # Should be callable
        self.assertTrue(callable(typed_tool))

        # Should have ctx as first parameter
        sig = inspect.signature(typed_tool)
        first_param = next(iter(sig.parameters.keys()))
        self.assertEqual(first_param, "ctx")

    def test_custom_tool_creation(self):
        """Test custom tool creation with metadata."""

        def divide(x: int, y: int) -> Optional[float]:  # noqa: D401 – simple example
            """Divide x by y, returning None on ZeroDivisionError."""
            try:
                return x / y
            except ZeroDivisionError:
                return None

        callable_tool = create_pydantic_ai_tool_from_func(
            divide,
            name="divide_numbers",
            description="Divide two numbers and handle division by zero.",
        )

        # Should be callable
        self.assertTrue(callable(callable_tool))

        # Should have proper signature
        sig = inspect.signature(callable_tool)
        params = list(sig.parameters.keys())
        self.assertEqual(params[0], "ctx")
        self.assertIn("x", params)
        self.assertIn("y", params)


@pytest.mark.django_db
@pytest.mark.asyncio
class TestPydanticAIToolsAsync(TestCase):
    """Async test cases for PydanticAI tools execution."""

    async def test_sync_function_wrapper_execution(self):
        """Test that sync functions are properly wrapped and executed."""
        core_tool = CoreTool.from_function(sync_multiply)
        wrapper = PydanticAIToolWrapper(core_tool)
        callable_tool = wrapper.callable_function

        # Use deps=None to skip permission checks during unit tests
        ctx = MagicMock(deps=None)
        result = await callable_tool(ctx, 3, 4)
        self.assertEqual(result, 12)

    async def test_async_function_wrapper_execution(self):
        """Test that async functions retain async behaviour when wrapped."""
        core_tool = CoreTool.from_function(async_add)
        callable_tool = PydanticAIToolWrapper(core_tool).callable_function

        ctx = MagicMock(deps=None)
        result = await callable_tool(ctx, 5, 6)
        self.assertEqual(result, 11)

    async def test_factory_from_function_execution(self):
        """Test from_function returns executable callable tool."""
        callable_tool = PydanticAIToolFactory.from_function(sync_multiply)
        ctx = MagicMock(deps=None)
        result = await callable_tool(ctx, 7, 8)
        self.assertEqual(result, 56)

    async def test_decorator_tool_execution(self):
        """Test decorator creates executable async tool."""

        @pydantic_ai_tool(description="Square a number")
        def square(x: int) -> int:  # type: ignore[valid-type]
            """Return x squared."""
            return x * x

        ctx = MagicMock(deps=None)
        result = await square(ctx, 9)  # type: ignore[arg-type]
        self.assertEqual(result, 81)

    async def test_typed_tool_execution(self):
        """Test typed tool executes correctly."""
        typed_tool = create_typed_pydantic_ai_tool(subtract)
        ctx = MagicMock(deps=None)
        result = await typed_tool(ctx, 10, 4)
        self.assertEqual(result, 6)

    async def test_custom_tool_execution_with_error_handling(self):
        """Test custom tool with error handling executes correctly."""

        def divide(x: int, y: int) -> Optional[float]:  # noqa: D401 – simple example
            """Divide x by y, returning None on ZeroDivisionError."""
            try:
                return x / y
            except ZeroDivisionError:
                return None

        callable_tool = create_pydantic_ai_tool_from_func(
            divide,
            name="divide_numbers",
            description="Divide two numbers and handle division by zero.",
        )

        ctx = MagicMock(deps=None)
        result_ok = await callable_tool(ctx, 8, 2)
        result_fail = await callable_tool(ctx, 8, 0)

        self.assertEqual(result_ok, 4.0)
        self.assertIsNone(result_fail)


@pytest.mark.django_db
@pytest.mark.asyncio
class TestCheckUserPermissions(TestCase):
    """Tests for _check_user_permissions defense-in-depth function.

    These tests cover edge cases for permission checking that validates
    user access before any tool execution.
    """

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="perm_check_user", password="password", email="permcheck@test.com"
        )
        cls.corpus = Corpus.objects.create(
            title="Perm Check Corpus", creator=cls.user, is_public=False
        )
        cls.doc = Document.objects.create(
            title="Perm Check Doc", corpus=cls.corpus, creator=cls.user, is_public=False
        )

    async def test_anonymous_user_nonexistent_document_raises_error(self):
        """Test that anonymous user accessing non-existent document raises PermissionError.

        Line 79 coverage: Document.DoesNotExist for anonymous user.
        """
        deps = PydanticAIDependencies(
            user_id=None,  # Anonymous
            document_id=99999999,  # Non-existent
            corpus_id=None,
        )
        ctx = MagicMock(deps=deps)

        with self.assertRaises(PermissionError) as context:
            await _check_user_permissions(ctx)
        self.assertIn("not found", str(context.exception))

    async def test_anonymous_user_nonexistent_corpus_raises_error(self):
        """Test that anonymous user accessing non-existent corpus raises PermissionError.

        Line 90 coverage: Corpus.DoesNotExist for anonymous user.
        """
        deps = PydanticAIDependencies(
            user_id=None,  # Anonymous
            document_id=None,
            corpus_id=99999999,  # Non-existent
        )
        ctx = MagicMock(deps=deps)

        with self.assertRaises(PermissionError) as context:
            await _check_user_permissions(ctx)
        self.assertIn("not found", str(context.exception))

    async def test_nonexistent_user_raises_error(self):
        """Test that non-existent user ID raises PermissionError.

        Lines 96-97 coverage: User.DoesNotExist for authenticated user.
        """
        deps = PydanticAIDependencies(
            user_id=99999999,  # Non-existent user
            document_id=self.doc.id,
            corpus_id=None,
        )
        ctx = MagicMock(deps=deps)

        with self.assertRaises(PermissionError) as context:
            await _check_user_permissions(ctx)
        self.assertIn("not found", str(context.exception))

    async def test_authenticated_user_nonexistent_document_raises_error(self):
        """Test that authenticated user accessing non-existent document raises PermissionError.

        Line 113 coverage: Document.DoesNotExist for authenticated user.
        """
        deps = PydanticAIDependencies(
            user_id=self.user.id,
            document_id=99999999,  # Non-existent
            corpus_id=None,
        )
        ctx = MagicMock(deps=deps)

        with self.assertRaises(PermissionError) as context:
            await _check_user_permissions(ctx)
        self.assertIn("not found", str(context.exception))

    async def test_authenticated_user_nonexistent_corpus_raises_error(self):
        """Test that authenticated user accessing non-existent corpus raises PermissionError.

        Line 129 coverage: Corpus.DoesNotExist for authenticated user.
        """
        deps = PydanticAIDependencies(
            user_id=self.user.id,
            document_id=None,
            corpus_id=99999999,  # Non-existent
        )
        ctx = MagicMock(deps=deps)

        with self.assertRaises(PermissionError) as context:
            await _check_user_permissions(ctx)
        self.assertIn("not found", str(context.exception))


# ---------------------------------------------------------------------------
# Tests for inject_params functionality
# ---------------------------------------------------------------------------


def tool_with_doc_id(document_id: int, text: str) -> dict:
    """A tool that requires document_id and text."""
    return {"document_id": document_id, "text": text, "processed": True}


async def async_tool_with_ids(document_id: int, corpus_id: int, query: str) -> dict:
    """An async tool that requires document_id, corpus_id, and a query."""
    return {"document_id": document_id, "corpus_id": corpus_id, "query": query}


@pytest.mark.django_db
class TestInjectParams(TestCase):
    """Test suite for inject_params functionality.

    This tests the feature where context-bound parameters (like document_id)
    can be automatically injected at execution time while being hidden from
    the LLM's view of the tool schema.
    """

    def test_inject_params_filters_from_signature(self):
        """Test that injected params are filtered from the function signature.

        The LLM should not see document_id as a parameter - it should only
        see 'text' as a required parameter.
        """
        wrapped = PydanticAIToolFactory.from_function(
            tool_with_doc_id,
            name="process_document",
            inject_params={"document_id": 123},
        )

        sig = inspect.signature(wrapped)
        param_names = list(sig.parameters.keys())

        # ctx should be first param (for PydanticAI)
        self.assertEqual(param_names[0], "ctx")

        # document_id should NOT be in params (hidden from LLM)
        self.assertNotIn("document_id", param_names)

        # text should still be visible to LLM
        self.assertIn("text", param_names)

    def test_inject_params_multiple_params_filtered(self):
        """Test that multiple injected params are all filtered from signature."""
        wrapped = PydanticAIToolFactory.from_function(
            async_tool_with_ids,
            name="search_document",
            inject_params={"document_id": 100, "corpus_id": 200},
        )

        sig = inspect.signature(wrapped)
        param_names = list(sig.parameters.keys())

        # Only ctx and query should be visible
        self.assertEqual(param_names, ["ctx", "query"])

        # document_id and corpus_id should be hidden
        self.assertNotIn("document_id", param_names)
        self.assertNotIn("corpus_id", param_names)


@pytest.mark.django_db
@pytest.mark.asyncio
class TestInjectParamsExecution(TestCase):
    """Async tests for inject_params execution behavior."""

    async def test_sync_tool_injects_params_at_execution(self):
        """Test that injected params are provided to sync function at execution."""
        wrapped = PydanticAIToolFactory.from_function(
            tool_with_doc_id,
            name="process_document",
            inject_params={"document_id": 42},
        )

        # Call without providing document_id - it should be injected
        ctx = MagicMock(deps=None)
        result = await wrapped(ctx, text="hello world")

        # Verify injected value was used
        self.assertEqual(result["document_id"], 42)
        self.assertEqual(result["text"], "hello world")
        self.assertTrue(result["processed"])

    async def test_async_tool_injects_params_at_execution(self):
        """Test that injected params are provided to async function at execution."""
        wrapped = PydanticAIToolFactory.from_function(
            async_tool_with_ids,
            name="search_document",
            inject_params={"document_id": 100, "corpus_id": 200},
        )

        # Call with only query - document_id and corpus_id should be injected
        ctx = MagicMock(deps=None)
        result = await wrapped(ctx, query="find contracts")

        # Verify all injected values were used
        self.assertEqual(result["document_id"], 100)
        self.assertEqual(result["corpus_id"], 200)
        self.assertEqual(result["query"], "find contracts")

    async def test_wrapper_constructor_accepts_inject_params(self):
        """Test that PydanticAIToolWrapper constructor accepts inject_params."""
        core_tool = CoreTool.from_function(tool_with_doc_id)
        wrapper = PydanticAIToolWrapper(core_tool, inject_params={"document_id": 999})

        # Verify inject_params is stored
        self.assertEqual(wrapper.inject_params, {"document_id": 999})

        # Verify it works at execution
        ctx = MagicMock(deps=None)
        result = await wrapper.callable_function(ctx, text="test")
        self.assertEqual(result["document_id"], 999)

    async def test_create_tool_accepts_inject_params(self):
        """Test that PydanticAIToolFactory.create_tool accepts inject_params."""
        core_tool = CoreTool.from_function(tool_with_doc_id)
        wrapped = PydanticAIToolFactory.create_tool(
            core_tool, inject_params={"document_id": 777}
        )

        ctx = MagicMock(deps=None)
        result = await wrapped(ctx, text="factory test")

        self.assertEqual(result["document_id"], 777)
        self.assertEqual(result["text"], "factory test")

    async def test_no_inject_params_preserves_original_signature(self):
        """Test that without inject_params, all original params are preserved."""
        wrapped = PydanticAIToolFactory.from_function(
            tool_with_doc_id,
            name="process_document",
            # No inject_params
        )

        sig = inspect.signature(wrapped)
        param_names = list(sig.parameters.keys())

        # All params should be visible (ctx + original params)
        self.assertIn("ctx", param_names)
        self.assertIn("document_id", param_names)
        self.assertIn("text", param_names)
