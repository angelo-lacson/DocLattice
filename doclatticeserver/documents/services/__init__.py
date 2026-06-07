"""Documents service package.

Re-exports the public document service classes so callers can
``from doclatticeserver.documents.services import DocumentRelationshipService``
without depending on the internal module layout.

Each service inherits ``doclatticeserver.shared.services.BaseService`` and
exposes permission-filtered ``get_*`` methods. Migrated from the retired
``documents/query_optimizer.py`` as Phase 4 of the service-layer
centralization roadmap — see
docs/refactor_plans/2026-05-19-service-layer-centralization-design.md.
"""

from doclatticeserver.documents.services.actions import DocumentActionsService
from doclatticeserver.documents.services.ingestion_admin import IngestionAdminService
from doclatticeserver.documents.services.relationships import (
    DocumentRelationshipService,
)
from doclatticeserver.documents.services.versions import DocumentVersionService

__all__ = [
    "DocumentActionsService",
    "DocumentRelationshipService",
    "DocumentVersionService",
    "IngestionAdminService",
]
