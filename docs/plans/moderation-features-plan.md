# Moderation Features Implementation Plan

**Issue**: #742
**Integrates With**: PR #733 (Thread/Message Triggered Corpus Actions)
**Branch**: `claude/plan-moderation-features-Q9AQS`
**Date**: 2025-12-29

---

## Executive Summary

This plan addresses the four primary enhancements proposed in Issue #742:
1. **Moderation Dashboard** - UI for viewing ModerationAction audit logs
2. **Rollback Capability** - Undo functionality for automated moderation actions
3. **Metrics & Monitoring** - Track automated moderation frequency
4. **Technical Cleanup** - Address code quality concerns from PR #733

---

## Part 1: Technical Cleanup (Priority: Critical)

These items should be addressed first as they may affect correctness and security.

### 1.1 Race Condition Fix in `agent_tasks.py`

**Location**: `opencontractserver/tasks/agent_tasks.py:859-898`

**Current Issue**: The `get_or_create_result()` function has a TOCTOU (Time-Of-Check-Time-Of-Use) vulnerability. Multiple workers can see the same non-RUNNING record and attempt to claim it simultaneously.

**Solution**: Add `select_for_update()` to the claim logic.

```python
# In get_or_create_result() function
@database_sync_to_async
def get_or_create_result():
    from django.db import transaction

    with transaction.atomic():
        # For thread-based actions, use triggering_conversation and triggering_message
        result, created = AgentActionResult.objects.select_for_update().get_or_create(
            corpus_action=action,
            triggering_conversation=conversation,
            triggering_message=message,
            defaults={
                "creator_id": user_id,
                "status": AgentActionResult.Status.RUNNING,
                "started_at": timezone.now(),
            },
        )

        if created:
            return result, "created"

        # Try to claim existing record with lock held
        if result.status not in [
            AgentActionResult.Status.RUNNING,
            AgentActionResult.Status.COMPLETED,
        ]:
            result.status = AgentActionResult.Status.RUNNING
            result.started_at = timezone.now()
            result.error_message = ""
            result.save(update_fields=["status", "started_at", "error_message"])
            return result, "claimed"

        return result, f"already_{result.status}"
```

**Files to Modify**:
- `opencontractserver/tasks/agent_tasks.py`

**Tests**:
- Add concurrent execution test in `opencontractserver/tests/test_agent_tasks.py`

---

### 1.2 Tool Validation for Inline Agents

**Location**: `config/graphql/mutations.py:3738-4010` (CreateCorpusAction mutation)

**Current Issue**: When `create_agent_inline=True` with thread/message triggers, there's no validation that `inline_agent_tools` contains only valid MODERATION category tools.

**Solution**: Add validation before agent creation.

```python
# Add after line 3866 in CreateCorpusAction.mutate()

# For thread/message triggers with inline agent, validate tools are moderation category
if create_agent_inline and trigger in ["new_thread", "new_message"]:
    from opencontractserver.llms.tools.tool_registry import (
        TOOL_REGISTRY,
        ToolCategory,
    )

    # Get valid moderation tool names
    valid_moderation_tools = {
        tool.name for tool in TOOL_REGISTRY
        if tool.category == ToolCategory.MODERATION
    }

    # Validate provided tools
    if inline_agent_tools:
        invalid_tools = set(inline_agent_tools) - valid_moderation_tools
        if invalid_tools:
            return CreateCorpusAction(
                ok=False,
                message=f"Invalid tools for moderation agent: {', '.join(invalid_tools)}. "
                        f"Valid moderation tools: {', '.join(sorted(valid_moderation_tools))}",
                obj=None,
            )
```

**Files to Modify**:
- `config/graphql/mutations.py`

**Tests**:
- Add validation tests in backend test suite

---

### 1.3 Migration Dependency Verification

**Status**: ✅ ALREADY CORRECT

Both migrations (`0008_add_thread_message_triggers.py` and `0032_add_thread_message_triggers.py`) correctly depend on `conversations.0013_alter_chatmessage_backend_lock_and_more`. No changes needed.

---

### 1.4 N+1 Query Assessment

**Status**: ✅ DOCUMENTED AS ACCEPTABLE

The signal handlers in `corpuses/signals.py:170` include explicit documentation:

```python
# Access the conversation FK - this may trigger a single DB query if not already
# loaded on the instance. This is acceptable since signals fire once per message
# save, not in a loop (so it's not an N+1 issue).
```

This is NOT an N+1 issue because signals fire once per save, not in a loop. No changes needed.

---

## Part 2: GraphQL API for ModerationAction

### 2.1 Create ModerationActionType

**File**: `config/graphql/graphene_types.py`

```python
class ModerationActionType(DjangoObjectType):
    """GraphQL type for ModerationAction audit records."""

    class Meta:
        model = ModerationAction
        interfaces = (relay.Node,)
        fields = [
            "id",
            "conversation",
            "message",
            "action_type",
            "moderator",
            "reason",
            "created",
            "modified",
        ]
        filter_fields = {
            "action_type": ["exact", "in"],
            "created": ["gte", "lte"],
        }

    # Additional fields for context
    corpus_id = graphene.ID()
    is_automated = graphene.Boolean()
    can_rollback = graphene.Boolean()

    def resolve_corpus_id(self, info):
        """Get corpus ID from conversation if linked."""
        if self.conversation and self.conversation.chat_with_corpus:
            return to_global_id("CorpusType", self.conversation.chat_with_corpus.pk)
        return None

    def resolve_is_automated(self, info):
        """Check if this was an automated (agent) action."""
        # Automated actions have no moderator or moderator is a system user
        return self.moderator is None or getattr(self.moderator, 'is_system_user', False)

    def resolve_can_rollback(self, info):
        """Check if this action can be rolled back."""
        # Can rollback: delete -> restore, lock -> unlock, pin -> unpin
        rollback_pairs = {
            "delete_message": "restore_message",
            "delete_thread": "restore_thread",
            "lock_thread": "unlock_thread",
            "pin_thread": "unpin_thread",
        }
        return self.action_type in rollback_pairs
```

---

### 2.2 Create ModerationAction Queries

**File**: `config/graphql/queries.py`

```python
# Add to Query class

# Moderation action queries
moderation_actions = DjangoFilterConnectionField(
    ModerationActionType,
    corpus_id=graphene.ID(),
    thread_id=graphene.ID(),
    moderator_id=graphene.ID(),
    action_types=graphene.List(graphene.String),
    automated_only=graphene.Boolean(),
    description="Query moderation action audit logs with filtering",
)

moderation_action = graphene.Field(
    ModerationActionType,
    id=graphene.ID(required=True),
    description="Get a specific moderation action by ID",
)

moderation_metrics = graphene.Field(
    ModerationMetricsType,
    corpus_id=graphene.ID(required=True),
    time_range_hours=graphene.Int(default_value=24),
    description="Get moderation metrics for a corpus",
)

@login_required
def resolve_moderation_actions(
    self, info, corpus_id=None, thread_id=None, moderator_id=None,
    action_types=None, automated_only=None, **kwargs
):
    """Resolve moderation actions with optional filters."""
    user = info.context.user

    # Start with actions user can see
    # Users can see actions for corpuses they own or moderate
    qs = ModerationAction.objects.select_related(
        "conversation", "conversation__chat_with_corpus",
        "message", "moderator"
    )

    # Filter by corpus ownership or moderator status
    if not user.is_superuser:
        qs = qs.filter(
            Q(conversation__chat_with_corpus__creator=user) |
            Q(conversation__chat_with_corpus__moderators__user=user)
        ).distinct()

    # Apply optional filters
    if corpus_id:
        corpus_pk = from_global_id(corpus_id)[1]
        qs = qs.filter(conversation__chat_with_corpus_id=corpus_pk)

    if thread_id:
        thread_pk = from_global_id(thread_id)[1]
        qs = qs.filter(conversation_id=thread_pk)

    if moderator_id:
        moderator_pk = from_global_id(moderator_id)[1]
        qs = qs.filter(moderator_id=moderator_pk)

    if action_types:
        qs = qs.filter(action_type__in=action_types)

    if automated_only:
        qs = qs.filter(moderator__isnull=True)

    return qs.order_by("-created")
```

---

### 2.3 Create ModerationMetricsType

**File**: `config/graphql/graphene_types.py`

```python
class ModerationMetricsType(graphene.ObjectType):
    """Aggregated moderation metrics for monitoring."""

    total_actions = graphene.Int()
    automated_actions = graphene.Int()
    manual_actions = graphene.Int()
    actions_by_type = GenericScalar()  # Dict[action_type, count]

    # Trend indicators
    hourly_action_rate = graphene.Float()
    is_above_threshold = graphene.Boolean()
    threshold_exceeded_types = graphene.List(graphene.String)

    # Time range info
    time_range_hours = graphene.Int()
    start_time = graphene.DateTime()
    end_time = graphene.DateTime()
```

---

## Part 3: Rollback Mutations

### 3.1 RollbackModerationAction Mutation

**File**: `config/graphql/moderation_mutations.py`

```python
class RollbackModerationActionMutation(graphene.Mutation):
    """
    Rollback a moderation action by executing its inverse.
    - delete_message -> restore_message
    - delete_thread -> restore_thread
    - lock_thread -> unlock_thread
    - pin_thread -> unpin_thread

    Only moderators with appropriate permissions can rollback.
    Creates a new ModerationAction record for the rollback.
    """

    class Arguments:
        action_id = graphene.ID(required=True, description="ID of action to rollback")
        reason = graphene.String(description="Reason for rollback")

    ok = graphene.Boolean()
    message = graphene.String()
    rollback_action = graphene.Field(ModerationActionType)

    @login_required
    @graphql_ratelimit(limit=10, period=60)
    def mutate(self, info, action_id, reason=None):
        user = info.context.user

        try:
            action_pk = from_global_id(action_id)[1]
            original_action = ModerationAction.objects.select_related(
                "conversation", "conversation__chat_with_corpus", "message"
            ).get(pk=action_pk)
        except ModerationAction.DoesNotExist:
            return RollbackModerationActionMutation(
                ok=False,
                message="Moderation action not found",
                rollback_action=None,
            )

        # Define rollback mappings
        rollback_map = {
            ModerationActionType.DELETE_MESSAGE: (
                ModerationActionType.RESTORE_MESSAGE,
                "restore_message"
            ),
            ModerationActionType.DELETE_THREAD: (
                ModerationActionType.RESTORE_THREAD,
                "restore_thread"
            ),
            ModerationActionType.LOCK_THREAD: (
                ModerationActionType.UNLOCK_THREAD,
                "unlock"
            ),
            ModerationActionType.PIN_THREAD: (
                ModerationActionType.UNPIN_THREAD,
                "unpin"
            ),
        }

        if original_action.action_type not in rollback_map:
            return RollbackModerationActionMutation(
                ok=False,
                message=f"Action type '{original_action.action_type}' cannot be rolled back",
                rollback_action=None,
            )

        rollback_action_type, method_name = rollback_map[original_action.action_type]

        # Check permissions - user must be able to moderate
        conversation = original_action.conversation
        if conversation and not conversation.can_moderate(user):
            return RollbackModerationActionMutation(
                ok=False,
                message="You don't have permission to rollback this action",
                rollback_action=None,
            )

        # Execute the rollback
        try:
            if original_action.action_type in [
                ModerationActionType.DELETE_MESSAGE,
                ModerationActionType.RESTORE_MESSAGE,
            ]:
                message_obj = original_action.message
                if message_obj:
                    getattr(message_obj, method_name)(user=user, reason=reason)
            else:
                # Thread-level actions
                if conversation:
                    getattr(conversation, method_name)(user=user, reason=reason)

            # The model methods create ModerationAction records automatically
            # Find the new action created
            rollback_action = ModerationAction.objects.filter(
                action_type=rollback_action_type,
                moderator=user,
            ).order_by("-created").first()

            return RollbackModerationActionMutation(
                ok=True,
                message=f"Successfully rolled back {original_action.action_type}",
                rollback_action=rollback_action,
            )

        except Exception as e:
            logger.error(f"Error rolling back moderation action: {e}", exc_info=True)
            return RollbackModerationActionMutation(
                ok=False,
                message=f"Failed to rollback: {str(e)}",
                rollback_action=None,
            )
```

---

### 3.2 Missing Thread Mutations

**File**: `config/graphql/moderation_mutations.py`

Add `DeleteThreadMutation` and `RestoreThreadMutation` that the frontend expects:

```python
class DeleteThreadMutation(graphene.Mutation):
    """Soft delete a thread (conversation)."""

    class Arguments:
        thread_id = graphene.ID(required=True)
        reason = graphene.String()

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(ConversationType)

    @login_required
    @graphql_ratelimit(limit=10, period=60)
    def mutate(self, info, thread_id, reason=None):
        user = info.context.user

        try:
            thread_pk = from_global_id(thread_id)[1]
            conversation = Conversation.objects.get(pk=thread_pk)
        except Conversation.DoesNotExist:
            return DeleteThreadMutation(
                ok=False,
                message="Thread not found or access denied",
                obj=None,
            )

        if not conversation.can_moderate(user):
            return DeleteThreadMutation(
                ok=False,
                message="Thread not found or access denied",
                obj=None,
            )

        try:
            conversation.soft_delete_thread(user=user, reason=reason)
            return DeleteThreadMutation(
                ok=True,
                message="Thread deleted successfully",
                obj=conversation,
            )
        except Exception as e:
            return DeleteThreadMutation(
                ok=False,
                message=f"Failed to delete thread: {str(e)}",
                obj=None,
            )


class RestoreThreadMutation(graphene.Mutation):
    """Restore a soft-deleted thread."""

    class Arguments:
        thread_id = graphene.ID(required=True)
        reason = graphene.String()

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(ConversationType)

    @login_required
    @graphql_ratelimit(limit=10, period=60)
    def mutate(self, info, thread_id, reason=None):
        user = info.context.user

        try:
            thread_pk = from_global_id(thread_id)[1]
            # Include deleted threads in query
            conversation = Conversation.all_objects.get(pk=thread_pk)
        except Conversation.DoesNotExist:
            return RestoreThreadMutation(
                ok=False,
                message="Thread not found or access denied",
                obj=None,
            )

        if not conversation.can_moderate(user):
            return RestoreThreadMutation(
                ok=False,
                message="Thread not found or access denied",
                obj=None,
            )

        try:
            conversation.restore_thread(user=user, reason=reason)
            return RestoreThreadMutation(
                ok=True,
                message="Thread restored successfully",
                obj=conversation,
            )
        except Exception as e:
            return RestoreThreadMutation(
                ok=False,
                message=f"Failed to restore thread: {str(e)}",
                obj=None,
            )
```

---

## Part 4: Frontend Implementation

### 4.1 GraphQL Operations

**File**: `frontend/src/graphql/queries.ts`

```typescript
export const GET_MODERATION_ACTIONS = gql`
  query GetModerationActions(
    $corpusId: ID
    $threadId: ID
    $moderatorId: ID
    $actionTypes: [String]
    $automatedOnly: Boolean
    $first: Int
    $after: String
  ) {
    moderationActions(
      corpusId: $corpusId
      threadId: $threadId
      moderatorId: $moderatorId
      actionTypes: $actionTypes
      automatedOnly: $automatedOnly
      first: $first
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          actionType
          reason
          created
          canRollback
          isAutomated
          corpusId
          conversation {
            id
            title
          }
          message {
            id
            content
          }
          moderator {
            id
            username
          }
        }
      }
    }
  }
`;

export const GET_MODERATION_METRICS = gql`
  query GetModerationMetrics($corpusId: ID!, $timeRangeHours: Int) {
    moderationMetrics(corpusId: $corpusId, timeRangeHours: $timeRangeHours) {
      totalActions
      automatedActions
      manualActions
      actionsByType
      hourlyActionRate
      isAboveThreshold
      thresholdExceededTypes
      timeRangeHours
      startTime
      endTime
    }
  }
`;

export const GET_AVAILABLE_MODERATION_TOOLS = gql`
  query GetAvailableModerationTools {
    availableTools(category: "moderation") {
      name
      description
      requiresApproval
    }
  }
`;
```

**File**: `frontend/src/graphql/mutations.ts`

```typescript
export const ROLLBACK_MODERATION_ACTION = gql`
  mutation RollbackModerationAction($actionId: ID!, $reason: String) {
    rollbackModerationAction(actionId: $actionId, reason: $reason) {
      ok
      message
      rollbackAction {
        id
        actionType
        created
      }
    }
  }
`;

export const DELETE_THREAD = gql`
  mutation DeleteThread($threadId: ID!, $reason: String) {
    deleteThread(threadId: $threadId, reason: $reason) {
      ok
      message
      obj {
        id
        deletedAt
      }
    }
  }
`;

export const RESTORE_THREAD = gql`
  mutation RestoreThread($threadId: ID!, $reason: String) {
    restoreThread(threadId: $threadId, reason: $reason) {
      ok
      message
      obj {
        id
        deletedAt
      }
    }
  }
`;
```

---

### 4.2 Moderation Dashboard Component

**File**: `frontend/src/components/moderation/ModerationDashboard.tsx`

Key features:
- Table view of ModerationAction records with pagination
- Filter controls: corpus, thread, moderator, action type, automated only
- Rollback button for eligible actions
- Metrics summary card showing automated action rates
- Alert indicator when action rate exceeds threshold

Component structure:
```
ModerationDashboard/
├── ModerationDashboard.tsx       # Main container
├── ModerationActionTable.tsx     # Table with filtering
├── ModerationMetricsCard.tsx     # Metrics summary
├── RollbackConfirmModal.tsx      # Confirmation dialog
└── ModerationFilters.tsx         # Filter controls
```

---

### 4.3 Dynamic Tool Fetching

**File**: `frontend/src/components/corpuses/CreateCorpusActionModal.tsx`

Replace hardcoded `MODERATION_TOOLS` with dynamic fetching:

```typescript
// Remove hardcoded MODERATION_TOOLS constant

// Add query hook
const { data: toolsData, loading: toolsLoading } = useQuery(
  GET_AVAILABLE_MODERATION_TOOLS,
  { skip: trigger !== "new_thread" && trigger !== "new_message" }
);

const moderationTools = useMemo(() => {
  if (toolsData?.availableTools) {
    return toolsData.availableTools.map((tool: AvailableTool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }
  // Fallback to defaults if query fails
  return DEFAULT_MODERATION_TOOLS;
}, [toolsData]);
```

---

## Part 5: Backend Query for Available Tools

### 5.1 Add availableTools Query

**File**: `config/graphql/queries.py`

```python
available_tools = graphene.List(
    AvailableToolType,
    category=graphene.String(description="Filter by tool category"),
    description="Get available agent tools, optionally filtered by category",
)

@login_required
def resolve_available_tools(self, info, category=None):
    """Return available tools from the tool registry."""
    from opencontractserver.llms.tools.tool_registry import (
        TOOL_REGISTRY,
        ToolCategory,
    )

    tools = TOOL_REGISTRY

    if category:
        try:
            cat_enum = ToolCategory(category)
            tools = [t for t in tools if t.category == cat_enum]
        except ValueError:
            # Invalid category, return empty
            return []

    return [
        {
            "name": t.name,
            "description": t.description,
            "category": t.category.value,
            "requires_approval": t.requires_approval,
        }
        for t in tools
    ]
```

---

## Part 6: Testing Strategy

### Backend Tests

1. **Race condition test**: Concurrent `get_or_create_result()` calls
2. **Tool validation test**: Invalid tools rejected for inline agents
3. **ModerationAction query permissions**: Verify users only see allowed actions
4. **Rollback mutation tests**: All rollback scenarios
5. **DeleteThread/RestoreThread tests**: Permissions and functionality

### Frontend Tests

1. **ModerationDashboard.ct.tsx**: Component rendering and interactions
2. **CreateCorpusActionModal.ct.tsx**: Dynamic tool loading
3. **RollbackConfirmModal.ct.tsx**: Confirmation flow

---

## Implementation Order

### Phase 1: Technical Cleanup (1-2 days)
1. Fix race condition in `agent_tasks.py`
2. Add tool validation in `CreateCorpusAction`
3. Add tests for both fixes

### Phase 2: GraphQL API (2-3 days)
1. Create `ModerationActionType`
2. Add `moderation_actions` and `moderation_metrics` queries
3. Add `availableTools` query
4. Create `RollbackModerationActionMutation`
5. Create `DeleteThreadMutation` and `RestoreThreadMutation`
6. Add backend tests

### Phase 3: Frontend (2-3 days)
1. Add GraphQL operations
2. Create ModerationDashboard components
3. Update CreateCorpusActionModal for dynamic tools
4. Add component tests

### Phase 4: Integration & Polish (1 day)
1. End-to-end testing
2. Documentation updates
3. CHANGELOG update

---

## Files to Create/Modify

### New Files
- `frontend/src/components/moderation/ModerationDashboard.tsx`
- `frontend/src/components/moderation/ModerationActionTable.tsx`
- `frontend/src/components/moderation/ModerationMetricsCard.tsx`
- `frontend/src/components/moderation/RollbackConfirmModal.tsx`
- `frontend/src/components/moderation/ModerationFilters.tsx`
- `frontend/tests/ModerationDashboard.ct.tsx`
- `opencontractserver/tests/test_moderation_api.py`

### Modified Files
- `opencontractserver/tasks/agent_tasks.py` (race condition fix)
- `config/graphql/mutations.py` (tool validation + register mutations)
- `config/graphql/moderation_mutations.py` (rollback + delete/restore thread)
- `config/graphql/graphene_types.py` (ModerationActionType, ModerationMetricsType)
- `config/graphql/queries.py` (new queries)
- `frontend/src/graphql/queries.ts`
- `frontend/src/graphql/mutations.ts`
- `frontend/src/components/corpuses/CreateCorpusActionModal.tsx`
- `CHANGELOG.md`

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition fix breaks existing functionality | High | Comprehensive tests, staged rollout |
| GraphQL schema changes break frontend | Medium | Ensure backwards compatibility |
| Rollback creates invalid state | High | Validate state before rollback |
| Performance impact from metrics queries | Low | Add indexes, cache metrics |

---

## Success Criteria

1. Moderation dashboard displays audit logs with filtering
2. Moderators can rollback automated actions
3. Metrics show automated moderation frequency
4. No hardcoded tool lists in frontend
5. All tests pass (backend + frontend)
6. TypeScript compiles without errors
7. Pre-commit hooks pass
