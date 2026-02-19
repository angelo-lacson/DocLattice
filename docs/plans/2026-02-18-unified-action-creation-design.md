# Unified Corpus Action Creation — Design

**Goal:** Eliminate the two-step agent-then-action workflow and the confusing dual-instructions split. Make creating an agent-based corpus action a single-form experience with one instructions field.

## Problem

Creating a document-trigger agent action currently requires:
1. Create an `AgentConfiguration` (name, system_instructions, available_tools)
2. Create a `CorpusAction` pointing to that agent, write `task_instructions`
3. Two instruction fields combine at runtime — users don't know which to use for what

Thread/message triggers already have "Quick Create Moderator" (inline agent creation) but document triggers don't.

## Design

### Extend Inline Agent Creation to Document Triggers

The `CreateCorpusAction` mutation already supports `create_agent_inline=True` for thread/message triggers. We generalize this to work for all trigger types.

**Backend (`CreateCorpusAction` mutation):**
- Lift the thread/message-only restriction on `create_agent_inline`
- For document triggers with `create_agent_inline=True`:
  - Create `AgentConfiguration` with scope=CORPUS, linked to the corpus
  - `system_instructions`: generic role tagline (e.g., "You are a document processing agent.")
  - `available_tools`: from `inline_agent_tools`, or default to `DEFAULT_DOCUMENT_ACTION_TOOLS`
  - Badge: `{icon: "robot", color: "#3b82f6", label: "Doc Agent"}`
  - `task_instructions` on the action: the user's unified instructions
- Tool category validation (moderation-only) stays specific to thread/message triggers

**Frontend (`CreateCorpusActionModal`):**
- For document triggers + agent type: default to "Quick Create" mode (inline) instead of "Select existing agent"
- Single "Instructions" textarea — maps to `task_instructions`
- Auto-generated agent name if blank: "{corpus title} - {trigger} Agent"
- Tool selection with trigger-appropriate defaults pre-checked
- "Use existing agent" toggle for advanced users (reveals current agent-picker flow)
- Thread/message flow unchanged (already has quick create)

### No Model Changes

The existing `AgentConfiguration` and `CorpusAction` models already support this. No migrations needed.

### No Prompt Builder Changes

The runtime prompt building (`_build_document_action_system_prompt`) already handles inline-created agents correctly — `task_instructions` becomes "Task Instructions" and `agent_config.system_instructions` becomes "Additional Agent Guidance".

## What This Changes

- `config/graphql/mutations.py`: Relax validation in `CreateCorpusAction` for inline agent creation on document triggers
- `frontend/src/components/corpuses/CreateCorpusActionModal.tsx`: Flip default mode for document triggers from "select existing" to "quick create"

## What This Does NOT Change

- CorpusAction model or AgentConfiguration model
- Prompt building logic
- Thread/message trigger flow (already good)
- Existing agent-picker flow (still available as advanced option)
- UpdateCorpusAction mutation
