"""Corpus-scoped service layer.

Segmented services for corpus-scoped object access and permissioning, split
out of the former ``corpus_objs_service.py`` monolith (issue #1716,
service-layer centralization Phase 2 — see
``docs/refactor_plans/2026-05-21-service-layer-phase2-corpus-services-plan.md``).
Each service inherits :class:`doclatticeserver.shared.services.base.BaseService`.

- :class:`~doclatticeserver.corpuses.services.folders.FolderCRUDService`
  — folder CRUD, the folder tree, search, and bulk structure creation.
- :class:`~doclatticeserver.corpuses.services.folder_documents.FolderDocumentService`
  — document-in-folder placement, listing, and counts.
- :class:`~doclatticeserver.corpuses.services.corpus_actions.CorpusActionService`
  — batch execution of agent-based corpus actions across every active doc.
- :class:`~doclatticeserver.corpuses.services.corpus_documents.CorpusDocumentService`
  — document-in-corpus reads / writes and corpus membership.
- :class:`~doclatticeserver.corpuses.services.corpus_service.CorpusService`
  — Corpus-row CRUD: delete, visibility, and description versioning.
- :class:`~doclatticeserver.corpuses.services.corpus_category_service.CorpusCategoryService`
  — CRUD for the runtime-configurable corpus category (tag) set.
- :class:`~doclatticeserver.corpuses.services.lifecycle.DocumentLifecycleService`
  — soft-delete / restore / trash.
- :class:`~doclatticeserver.corpuses.services.paths.CorpusPathService`
  — low-level :class:`DocumentPath` disambiguation internals.

Import the specific service you need from this package::

    from doclatticeserver.corpuses.services import FolderCRUDService
"""

from doclatticeserver.corpuses.services.corpus_actions import (
    BatchRunSummary,
    CorpusActionService,
)
from doclatticeserver.corpuses.services.corpus_category_service import (
    CorpusCategoryService,
)
from doclatticeserver.corpuses.services.corpus_documents import (
    CorpusDocumentService,
)
from doclatticeserver.corpuses.services.corpus_service import CorpusService
from doclatticeserver.corpuses.services.folder_documents import (
    FolderDocumentService,
)
from doclatticeserver.corpuses.services.folders import FolderCRUDService
from doclatticeserver.corpuses.services.lifecycle import DocumentLifecycleService
from doclatticeserver.corpuses.services.paths import CorpusPathService
from doclatticeserver.corpuses.services.votes import CorpusVoteService

__all__ = [
    "BatchRunSummary",
    "CorpusActionService",
    "CorpusCategoryService",
    "FolderCRUDService",
    "FolderDocumentService",
    "CorpusDocumentService",
    "CorpusService",
    "DocumentLifecycleService",
    "CorpusPathService",
    "CorpusVoteService",
]
