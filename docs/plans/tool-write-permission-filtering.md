# Plan: Tool Write Permission Filtering

## Problem Statement

Currently, tools are filtered based on:
- `requires_corpus` - filters out tools when no corpus context is available
- `requires_approval` - filters out approval-gated tools for public/anonymous contexts

However, there's no mechanism to filter out **write tools** when the calling user lacks WRITE permission on the target resource. This means a user with READ-only access to a corpus/document could still have write tools available to the agent, even though the underlying operations would fail or shouldn't be allowed.

## Goal

Add a `requires_write_permission` flag that allows filtering out write-capable tools when users lack WRITE permission on the target resource (corpus or document). This provides defense-in-depth alongside the existing tool-level permission check in `pydantic_ai_tools.py`.

## Key Distinction

| Flag | Purpose | Behavior |
|------|---------|----------|
| `requires_approval` | Interactive confirmation gate | User prompted before tool executes |
| `requires_write_permission` | Permission-based filtering | Tool excluded if user lacks WRITE access |

These are **independent** flags - a tool can require both, either, or neither.

## Implementation Plan

### Phase 1: Add the new flag to data structures

#### 1.1 Update CoreTool dataclass
**File:** `opencontractserver/llms/tools/tool_factory.py`

```python
@dataclass
class CoreTool:
    """Framework-agnostic tool representation."""

    function: Callable
    metadata: ToolMetadata
    requires_approval: bool = False
    requires_corpus: bool = False
    requires_write_permission: bool = False  # NEW
```

Also update `from_function()` class method to accept and pass through the new parameter.

#### 1.2 Update ToolDefinition dataclass
**File:** `opencontractserver/llms/tools/tool_registry.py`

```python
@dataclass(frozen=True)
class ToolDefinition:
    """Definition of an available tool for agents."""

    name: str
    description: str
    category: ToolCategory
    requires_corpus: bool = False
    requires_approval: bool = False
    requires_write_permission: bool = False  # NEW
    parameters: tuple[tuple[str, str, bool], ...] = ()
```

Also update `to_dict()` method to include `requiresWritePermission` in output.

#### 1.3 Update UnifiedToolFactory
**File:** `opencontractserver/llms/tools/tool_factory.py`

Update `from_function()` static method to pass through `requires_write_permission`.

---

### Phase 2: Mark write tools with the flag

**File:** `opencontractserver/llms/tools/tool_registry.py`

Tools that need `requires_write_permission=True`:

| Tool Name | Category | Current Flags |
|-----------|----------|---------------|
| `update_document_description` | DOCUMENT | `requires_approval=True` |
| `update_document_summary` | DOCUMENT | `requires_corpus=True`, `requires_approval=True` |
| `add_document_note` | NOTES | `requires_approval=True` |
| `update_document_note` | NOTES | `requires_approval=True` |
| `update_corpus_description` | CORPUS | `requires_corpus=True`, `requires_approval=True` |
| `duplicate_annotations_with_label` | ANNOTATIONS | `requires_corpus=True`, `requires_approval=True` |
| `add_annotations_from_exact_strings` | ANNOTATIONS | `requires_corpus=True`, `requires_approval=True` |
| `delete_message` | MODERATION | `requires_approval=True` |
| `lock_thread` | MODERATION | `requires_approval=True` |
| `unlock_thread` | MODERATION | `requires_approval=True` |
| `add_thread_message` | MODERATION | `requires_approval=True` |
| `pin_thread` | MODERATION | `requires_approval=True` |
| `unpin_thread` | MODERATION | `requires_approval=True` |

**Note:** All tools with `requires_approval=True` that modify data should also have `requires_write_permission=True`. The flags serve different purposes:
- `requires_approval` → prompts user for confirmation
- `requires_write_permission` → filters tool out entirely if user lacks WRITE access

---

### Phase 3: Filter tools in agent factory

**File:** `opencontractserver/llms/agents/agent_factory.py`

#### 3.1 Add permission check helper

```python
from opencontractserver.utils.permissioning import user_has_permission_for_obj
from opencontractserver.types.enums import PermissionTypes

async def _user_has_write_permission(
    user_id: int | None,
    resource: Document | Corpus | None,
) -> bool:
    """Check if user has WRITE permission on the resource."""
    if resource is None:
        return False

    if user_id is None:
        # Anonymous users never have write permission
        return False

    from django.contrib.auth import get_user_model
    User = get_user_model()

    try:
        user = await User.objects.aget(pk=user_id)
    except User.DoesNotExist:
        return False

    # Use sync_to_async since user_has_permission_for_obj is synchronous
    from channels.db import database_sync_to_async
    return await database_sync_to_async(user_has_permission_for_obj)(
        user, resource, PermissionTypes.CRUD
    )
```

#### 3.2 Update create_document_agent()

In the tool filtering section, add:

```python
# Check user's write permission on document
has_write_permission = await _user_has_write_permission(user_id, doc_obj)

filtered_tools: list[Union[CoreTool, Callable, str]] = []
if tools:
    for t in tools:
        # Existing: skip approval tools for public context
        if public_context and isinstance(t, CoreTool) and t.requires_approval:
            logger.warning(
                "Skipping approval-required tool '%s' for public context",
                t.name,
            )
            continue

        # Existing: skip corpus-required tools when no corpus
        if corpus is None and isinstance(t, CoreTool) and t.requires_corpus:
            logger.info(
                "Skipping corpus-required tool '%s' - no corpus provided",
                t.name,
            )
            continue

        # NEW: skip write tools if user lacks write permission
        if not has_write_permission and isinstance(t, CoreTool) and t.requires_write_permission:
            logger.info(
                "Skipping write tool '%s' - user %s lacks WRITE permission on document %s",
                t.name,
                user_id,
                doc_obj.id if doc_obj else "unknown",
            )
            continue

        filtered_tools.append(t)
```

#### 3.3 Update create_corpus_agent()

Same pattern, checking WRITE permission on corpus:

```python
# Check user's write permission on corpus
has_write_permission = await _user_has_write_permission(user_id, corpus_obj)

# ... filtering logic same as above ...
```

---

### Phase 4: Update Documentation

#### 4.1 Update LLM Architecture Documentation
**File:** `docs/architecture/llms/README.md`

Add a new section on **Agent Permission Model** covering:

1. **Tool Permission Flags:**
   - `requires_corpus` - tool needs corpus context
   - `requires_approval` - tool needs user confirmation before execution
   - `requires_write_permission` - tool performs write operations

2. **Permission Filtering Flow:**
   - Consumer layer validates user READ access to corpus/document
   - Agent factory filters tools based on user's WRITE permission
   - Tool wrapper (`pydantic_ai_tools.py`) validates permissions before each tool call (defense-in-depth)

3. **Key Files:**
   - `opencontractserver/llms/tools/tool_factory.py` - CoreTool with permission flags
   - `opencontractserver/llms/tools/tool_registry.py` - Tool definitions with flags
   - `opencontractserver/llms/agents/agent_factory.py` - Permission-based filtering
   - `opencontractserver/llms/tools/pydantic_ai_tools.py` - Runtime permission check

#### 4.2 Update Consolidated Permissioning Guide
**File:** `docs/permissioning/consolidated_permissioning_guide.md`

Add a new section on **Agent/LLM Permission Model** covering:

1. **WebSocket Consumer Layer:**
   - `UnifiedAgentConsumer` validates user has READ permission on corpus/document
   - Anonymous users only allowed for public resources
   - Legacy consumers (DocumentQueryConsumer, CorpusQueryConsumer) have been removed

2. **Tool-Level Permission Enforcement:**
   - Tools flagged with `requires_write_permission` filtered for read-only users
   - Defense-in-depth: `_check_user_permissions()` validates before every tool call
   - Permission checked against `user_id`, `document_id`, `corpus_id` from agent context

3. **Permission Inheritance:**
   - Agent inherits calling user's permissions (never escalates)
   - Even if agent creator has higher permissions, tools execute with caller's permissions
   - Formula: `Effective Tool Permission = MIN(caller_permission, tool_requirement)`

4. **Cross-Reference:**
   - Link to `docs/architecture/llms/README.md` for full LLM architecture details

---

## Testing Strategy

### Unit Tests

**File:** `opencontractserver/tests/test_tool_write_permission.py`

1. **Flag propagation tests:**
   - CoreTool respects `requires_write_permission` flag
   - ToolDefinition includes flag in `to_dict()` output

2. **Filtering tests:**
   - User WITH WRITE permission → write tools available
   - User WITHOUT WRITE permission → write tools filtered out
   - Anonymous user → write tools always filtered out
   - Public resource → write tools filtered out (via existing public context check)

3. **Integration tests:**
   - Create document agent with read-only user → verify no write tools
   - Create corpus agent with owner → verify write tools present

---

## Files to Modify

| File | Changes |
|------|---------|
| `opencontractserver/llms/tools/tool_factory.py` | Add `requires_write_permission` to `CoreTool`, update `from_function()` |
| `opencontractserver/llms/tools/tool_registry.py` | Add `requires_write_permission` to `ToolDefinition`, mark write tools |
| `opencontractserver/llms/agents/agent_factory.py` | Add permission check, filter write tools |
| `docs/architecture/llms/README.md` | Add Agent Permission Model section |
| `docs/permissioning/consolidated_permissioning_guide.md` | Add Agent/LLM Permission Model section |

---

## Rollback Plan

If issues arise:
1. Remove the `requires_write_permission` filtering logic from `agent_factory.py`
2. The flag can remain on data structures without effect
3. No database changes required - this is purely code-level

---

## Success Criteria

- [ ] `requires_write_permission` flag added to `CoreTool` and `ToolDefinition`
- [ ] All write-capable tools marked with the flag
- [ ] Agent factory filters out write tools for users without WRITE permission
- [ ] Existing tests pass
- [ ] New tests cover permission-based tool filtering
- [ ] TypeScript compiles (no frontend changes needed)
- [ ] Pre-commit checks pass
- [ ] LLM architecture docs updated with Agent Permission Model section
- [ ] Consolidated permissioning guide updated with Agent/LLM section
