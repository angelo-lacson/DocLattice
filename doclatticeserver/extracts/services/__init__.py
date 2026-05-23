"""Extracts-app service package.

Re-exports the public services so callers import a stable path::

    from doclatticeserver.extracts.services import ExtractService, MetadataService

Phase 3 of the service-layer centralization roadmap — see
``docs/refactor_plans/2026-05-19-service-layer-centralization-design.md``.
"""

from doclatticeserver.extracts.services.extract_service import ExtractService
from doclatticeserver.extracts.services.metadata import MetadataService

__all__ = ["ExtractService", "MetadataService"]
