"""
Shared ``Protocol`` definitions for OpenContracts pluggable interfaces.

The platform exposes several extension points where external code (or
internal modules from another package) is expected to satisfy a contract
without inheriting from a concrete base class — vector stores, pipeline
components, framework-agnostic LLM tools, and permissioned query
managers. ``Protocol`` types let static type-checkers verify that an
implementation conforms to the interface without forcing nominal
inheritance.

These protocols intentionally describe the *minimum* surface area
required by the consumers in this repo. Concrete implementations are
free to expose additional attributes/methods.

See ``docs/architecture/llms/README.md`` for the LLM tool architecture
and ``docs/permissioning/consolidated_permissioning_guide.md`` for the
visibility-manager pattern.
"""

from __future__ import annotations

from collections.abc import Awaitable
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from django.db.models import QuerySet

# ---------------------------------------------------------------------------
# Vector store protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class VectorStoreProtocol(Protocol):
    """Minimum interface implemented by vector stores in OpenContracts.

    Used by ``llms/vector_stores/`` adapters and pipeline embedders that
    need to look up annotations by similarity. Concrete implementations
    include :class:`opencontractserver.llms.vector_stores.core_vector_stores.CoreAnnotationVectorStore`.

    The ``search`` method returns the framework-agnostic
    :class:`VectorSearchResult` items (defined in
    ``llms.vector_stores.core_vector_stores``); it is typed loosely as
    ``list[Any]`` here to avoid an import cycle with the concrete
    dataclasses.
    """

    def search(self, query: Any) -> list[Any]:
        """Synchronous vector similarity search.

        Args:
            query: A :class:`VectorSearchQuery` describing the embedding /
                text and any filters.

        Returns:
            A list of :class:`VectorSearchResult` (annotation + score).
        """
        ...

    async def async_search(self, query: Any) -> list[Any]:
        """Asynchronous variant of :meth:`search`."""
        ...


# ---------------------------------------------------------------------------
# Pipeline component protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class PipelineComponentProtocol(Protocol):
    """Common surface of all pluggable pipeline components.

    The pipeline registry (``opencontractserver.pipeline.utils``)
    discovers parsers, embedders, thumbnailers, and post-processors at
    import time and dispatches calls into them. Each concrete class
    inherits from
    :class:`opencontractserver.pipeline.base.base_component.PipelineComponentBase`
    via ``BaseParser`` / ``BaseEmbedder`` / etc, but downstream consumers
    only ever rely on the attributes captured here. Treating that
    surface as a ``Protocol`` lets the type-checker verify duck-typed
    dispatch (e.g. ``component.title``) without forcing the importer to
    name the concrete subclass.
    """

    title: str
    description: str
    author: str
    dependencies: list[str]


# ---------------------------------------------------------------------------
# Framework-agnostic tool protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class ToolProtocol(Protocol):
    """Framework-agnostic interface for LLM tool implementations.

    Mirrors the public surface of
    :class:`opencontractserver.llms.tools.tool_factory.CoreTool` without
    requiring callers to import the dataclass directly. Framework
    adapters (e.g. ``PydanticAIToolWrapper``) accept any value satisfying
    this protocol.

    See ``docs/architecture/llms/README.md`` for the
    ``CoreTool`` → framework-specific wrapper architecture.
    """

    @property
    def name(self) -> str:
        """Tool name as exposed to the LLM."""
        ...

    @property
    def description(self) -> str:
        """Human-readable description used in tool schemas."""
        ...

    @property
    def parameters(self) -> dict[str, Any]:
        """JSONSchema-style parameters dict for the tool."""
        ...

    @property
    def requires_approval(self) -> bool:
        """``True`` if invocation must be gated behind an approval step."""
        ...


# ---------------------------------------------------------------------------
# Permissioned query manager protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class PermissionedQueryManagerProtocol(Protocol):
    """Guarantees the surface that ``Model.objects.visible_to_user()`` exposes.

    OpenContracts standardises permission filtering via
    :meth:`BaseVisibilityManager.visible_to_user`
    (``opencontractserver/shared/Managers.py``). Any code receiving a
    "permissioned manager" (e.g. for analytics or graphene resolvers)
    should depend on this protocol, not on a concrete manager class.

    The trailing ``Optional`` argument is widened so that managers that
    accept ``None`` (treated as anonymous) still satisfy the protocol.
    """

    def visible_to_user(self, user: Any | None = ...) -> QuerySet[Any]:
        """Return a queryset filtered to objects visible to ``user``."""
        ...


# ---------------------------------------------------------------------------
# Stream observer protocol (re-exported convenience)
# ---------------------------------------------------------------------------


class StreamObserverProtocol(Protocol):
    """Callable invoked by framework adapters as streaming events emit.

    Mirrors :class:`opencontractserver.llms.types.StreamObserver` so it
    can be referenced from non-LLM code (notifications, websockets)
    without importing ``llms.types``.
    """

    async def __call__(self, event: Any) -> Awaitable[None]: ...


__all__ = [
    "PermissionedQueryManagerProtocol",
    "PipelineComponentProtocol",
    "StreamObserverProtocol",
    "ToolProtocol",
    "VectorStoreProtocol",
]
