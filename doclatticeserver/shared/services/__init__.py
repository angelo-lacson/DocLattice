"""Service-layer package root.

Re-exports the shared building blocks so services and their callers can
``from doclatticeserver.shared.services import BaseService, ServiceResult``.

Part of the Phase 1 service-layer foundation — see
docs/refactor_plans/2026-05-19-service-layer-centralization-design.md.
"""

from doclatticeserver.shared.services.base import BaseService
from doclatticeserver.shared.services.conventions import (
    ServiceResult,
    get_for_user_or_none,
)

__all__ = ["BaseService", "ServiceResult", "get_for_user_or_none"]
