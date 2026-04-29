"""
LLM / agent integration constants.

Anthropic structured-extraction reliability knobs and the failure-mode
classifier vocabulary that ``data_extract_tasks._classify_none_result``
emits to ``Datacell.stacktrace``.  Lives here per CLAUDE.md "no magic
numbers in business code" rule so operators can grep canonical values
instead of chasing literals across modules.
"""

# Retry budget passed to ``PydanticAIAgent`` for structured extraction.
# pydantic-ai's default is 1; Claude/Anthropic models routinely fail to
# call ``final_result`` on the first turn for sparse documents and we
# observed an ~85% failure rate without retries.  3 strikes the right
# balance: enough to absorb a single missed-tool-call attempt with a
# follow-up reminder, without blowing the per-cell wall-clock budget.
STRUCTURED_OUTPUT_RETRIES = 3

# Threshold for declaring a tool loop in ``_classify_none_result``.  If
# the same ``(tool_name, args)`` signature appears at least this many
# times in the captured pydantic-ai message log without a matching
# ``final_result`` call, the cell is classified as
# ``NONE_RESULT_TOOL_LOOP`` (integration failure, NOT a "data absent"
# answer).  Distinct from ``STRUCTURED_OUTPUT_RETRIES`` despite the
# coincidental equality — the retry budget is a pydantic-ai input,
# this threshold is a post-mortem heuristic.
TOOL_LOOP_THRESHOLD = 3

# Failure-mode classification vocabulary written to ``Datacell.stacktrace``
# when extraction returns ``None``.  Operators grep ``failure_mode=`` to
# separate legitimate "data not present" outcomes from pipeline bugs;
# changing these strings is a breaking change for downstream dashboards.
NONE_RESULT_AGENT_COMMITTED = "agent_committed_none"
NONE_RESULT_NO_FINAL = "no_final_response"
NONE_RESULT_TOOL_LOOP = "tool_loop_no_output"
NONE_RESULT_UNKNOWN = "unknown"
