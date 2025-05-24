"""
DocLattice LLM Agents Package

This package provides framework-agnostic agent interfaces and framework-specific implementations.
"""

from doclatticeserver.llms.types import AgentFramework
from doclatticeserver.llms.agents.core_agents import (
    AgentConfig,
    CoreAgent,
    get_default_config,
)
from doclatticeserver.llms.agents.agent_factory import (
    UnifiedAgentFactory,
    create_document_agent,
    create_corpus_agent,
)

__all__ = [
    # Core interfaces
    "AgentFramework",
    "AgentConfig", 
    "CoreAgent",
    "get_default_config",
    # Factory
    "UnifiedAgentFactory",
    "create_document_agent",
    "create_corpus_agent",
]
