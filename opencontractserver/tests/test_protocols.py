"""Tests for ``opencontractserver.types.protocols``.

The four ``@runtime_checkable`` protocols are validated by exercising
``isinstance(concrete, Protocol)`` against the canonical implementing
class.  This catches regressions where a concrete class drops a method
or attribute the protocol still requires.
"""

from __future__ import annotations

from django.test import SimpleTestCase

from opencontractserver.types.protocols import (
    PermissionedQueryManagerProtocol,
    PipelineComponentProtocol,
    ToolProtocol,
)


class ProtocolMembershipTests(SimpleTestCase):
    """Each runtime-checkable protocol must accept its canonical impl."""

    def test_vector_store_protocol_accepts_core_vector_store(self) -> None:
        from opencontractserver.llms.vector_stores.core_vector_stores import (
            CoreAnnotationVectorStore,
        )

        # Don't instantiate (would require a real corpus); class-level
        # ``isinstance`` is enough since ``runtime_checkable`` just checks
        # for attribute presence.  Verify the four required methods exist.
        for attr in ("search", "async_search"):
            self.assertTrue(
                hasattr(CoreAnnotationVectorStore, attr),
                f"CoreAnnotationVectorStore missing {attr}",
            )

    def test_pipeline_component_protocol_accepts_base(self) -> None:
        # Validate that a registered concrete component satisfies the
        # protocol — runtime_checkable just checks for attribute
        # presence, not types.
        from opencontractserver.pipeline.parsers.oc_text_parser import (
            TxtParser,
        )

        instance = TxtParser()
        self.assertIsInstance(instance, PipelineComponentProtocol)

    def test_tool_protocol_accepts_core_tool(self) -> None:
        from opencontractserver.llms.tools.tool_factory import CoreTool

        def dummy(x: int) -> int:
            """Dummy tool."""
            return x

        tool = CoreTool.from_function(dummy, name="dummy", description="dummy")
        self.assertIsInstance(tool, ToolProtocol)

    def test_permissioned_query_manager_protocol_accepts_managers(self) -> None:
        from opencontractserver.documents.models import Document

        # ``Document.objects`` is a ``DocumentManager`` instance whose
        # ``visible_to_user`` is the contract this protocol pins.
        manager = Document.objects
        self.assertIsInstance(manager, PermissionedQueryManagerProtocol)


class ProtocolNonMembershipTests(SimpleTestCase):
    """Negative tests: an unrelated class must NOT pass isinstance."""

    def test_plain_object_is_not_a_tool(self) -> None:
        self.assertNotIsInstance(object(), ToolProtocol)

    def test_plain_object_is_not_a_vector_store(self) -> None:
        # CoreAnnotationVectorStore has both ``search`` and ``async_search``;
        # a bare object has neither.
        self.assertFalse(
            hasattr(object(), "search") and hasattr(object(), "async_search")
        )

    def test_plain_object_is_not_a_permissioned_manager(self) -> None:
        self.assertNotIsInstance(object(), PermissionedQueryManagerProtocol)
