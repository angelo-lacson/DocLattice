"""Agents service-layer package.

Re-exports the public services so callers import a stable path::

    from doclatticeserver.agents.services import AgentConfigurationService

Phase 5 of the service-layer centralization roadmap — see
``docs/refactor_plans/2026-05-19-service-layer-centralization-design.md``.
"""

from doclatticeserver.agents.services.agent_action_result_service import (
    AgentActionResultService,
)
from doclatticeserver.agents.services.agent_configuration_service import (
    AgentConfigurationService,
)

__all__ = ["AgentActionResultService", "AgentConfigurationService"]
