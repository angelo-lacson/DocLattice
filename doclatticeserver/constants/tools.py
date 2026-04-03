"""
Constants for agent tool configuration.

Defines the namespace prefix used by all agent tools in PipelineSettings.
Tool-specific constants should remain in their own constants modules
(e.g. ``constants/web_search.py``).
"""

# ---------------------------------------------------------------------------
# PipelineSettings namespace prefix for agent tool secrets/settings
# ---------------------------------------------------------------------------
# Tool secrets are stored under a "tool:" namespace in PipelineSettings
# encrypted_secrets to distinguish them from pipeline component secrets.
TOOL_SETTINGS_PREFIX = "tool:"
