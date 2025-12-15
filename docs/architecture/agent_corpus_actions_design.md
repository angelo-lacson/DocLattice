# Agent-Based Corpus Actions

## Overview

This document describes the third type of corpus action: agent-based actions that invoke an AI agent with a prompt and pre-authorized tools. This extends the existing corpus action system (which supports fieldsets and analyzers) to enable intelligent, automated document processing.

**Status**: Implemented in v3.0.0

## Use Cases

1. **Auto-update Document Summary**: When a document is added, analyze it and create/update the summary
2. **Auto-annotate Key Clauses**: Find and annotate specific clause types (indemnification, termination, etc.)
3. **Auto-tag Documents**: Analyze content and add appropriate tags/labels
4. **Extract Metadata**: Pull out key dates, parties, values into custom_meta
5. **Quality Checks**: Verify document completeness or flag issues

## Versioning Safety

**Critical**: All agent operations must respect the Document versioning architecture (see `docs/architecture/doc_and_path_versioning.md`).

### Safe Operations (No Document Version Created)
| Tool/Operation | Target | Why Safe |
|---------------|--------|----------|
| `update_document_summary` | DocumentSummaryRevision | Separate append-only model |
| Update `description` | Document.description | Metadata field, no hash change |
| Update `title` | Document.title | Metadata field, no hash change |
| Update `custom_meta` | Document.custom_meta | JSON field, no hash change |
| Create annotations | Annotation model | Separate model |
| Create notes | Note model | Separate model |

### Unsafe Operations (Avoid in Corpus Actions)
- Uploading/replacing PDF file (changes `pdf_file_hash`)
- Any operation that modifies document content

---

## Model Changes

### 1. CorpusAction Model Extension

**File**: `opencontractserver/corpuses/models.py`

```python
class CorpusAction(BaseOCModel):
    # Existing fields
    name = models.CharField(max_length=256, default="Corpus Action")
    corpus = models.ForeignKey("Corpus", on_delete=models.CASCADE, related_name="actions")
    fieldset = models.ForeignKey("extracts.Fieldset", on_delete=models.SET_NULL, null=True, blank=True)
    analyzer = models.ForeignKey("analyzer.Analyzer", on_delete=models.SET_NULL, null=True, blank=True)
    trigger = models.CharField(max_length=128, choices=CorpusActionTrigger.choices)
    disabled = models.BooleanField(default=False)
    run_on_all_corpuses = models.BooleanField(default=False)

    # NEW: Agent-based action fields
    agent_config = models.ForeignKey(
        "agents.AgentConfiguration",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="corpus_actions",
        help_text="Agent configuration to use for this action"
    )
    agent_prompt = models.TextField(
        blank=True,
        default="",
        help_text="Task-specific prompt for the agent (e.g., 'Summarize this document')"
    )
    pre_authorized_tools = NullableJSONField(
        default=list,
        blank=True,
        help_text="Tools pre-authorized to run without approval. If empty, uses agent_config.available_tools"
    )

    class Meta:
        constraints = [
            # Exactly ONE of fieldset, analyzer, or agent_config must be set
            models.CheckConstraint(
                check=(
                    (Q(fieldset__isnull=False) & Q(analyzer__isnull=True) & Q(agent_config__isnull=True)) |
                    (Q(fieldset__isnull=True) & Q(analyzer__isnull=False) & Q(agent_config__isnull=True)) |
                    (Q(fieldset__isnull=True) & Q(analyzer__isnull=True) & Q(agent_config__isnull=False))
                ),
                name="corpus_action_exactly_one_action_type"
            )
        ]
```

### 2. AgentActionResult Model

**File**: `opencontractserver/agents/models.py`

```python
class AgentActionResult(BaseOCModel):
    """
    Stores results from agent-based corpus actions.
    One record per (corpus_action, document) execution.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    corpus_action = models.ForeignKey(
        "corpuses.CorpusAction",
        on_delete=models.CASCADE,
        related_name="agent_results",
        help_text="The corpus action that triggered this execution"
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.CASCADE,
        related_name="agent_action_results",
        help_text="The document this action was run on"
    )
    conversation = models.ForeignKey(
        "conversations.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="corpus_action_results",
        help_text="Conversation record containing the full agent interaction"
    )

    # Execution tracking
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Results
    agent_response = models.TextField(
        blank=True,
        help_text="Final response content from the agent"
    )
    tools_executed = NullableJSONField(
        default=list,
        blank=True,
        help_text="List of tools executed: [{name, args, result, timestamp}]"
    )
    error_message = models.TextField(
        blank=True,
        help_text="Error message if status is FAILED"
    )

    # Audit trail
    execution_metadata = NullableJSONField(
        default=dict,
        blank=True,
        help_text="Additional execution metadata (model used, token counts, etc.)"
    )

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["corpus_action", "document"]),
            models.Index(fields=["status"]),
            models.Index(fields=["started_at"]),
        ]

    def __str__(self):
        return f"AgentActionResult({self.corpus_action.name} on doc {self.document_id}: {self.status})"
```

---

## Task Implementation

### Celery Task: run_agent_corpus_action

**File**: `opencontractserver/tasks/agent_tasks.py` (new file)

```python
import asyncio
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def run_agent_corpus_action(
    self,
    corpus_action_id: int,
    document_id: int,
    user_id: int,
) -> dict:
    """
    Execute an agent-based corpus action on a single document.

    This task runs synchronously but internally uses asyncio to call
    the async agent API.
    """
    try:
        return asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=corpus_action_id,
                document_id=document_id,
                user_id=user_id,
            )
        )
    except Exception as exc:
        logger.error(
            f"Agent corpus action failed: action={corpus_action_id}, "
            f"doc={document_id}, error={exc}",
            exc_info=True
        )
        raise self.retry(exc=exc, countdown=60)


async def _run_agent_corpus_action_async(
    corpus_action_id: int,
    document_id: int,
    user_id: int,
) -> dict:
    """Async implementation of agent corpus action execution."""
    from opencontractserver.agents.models import AgentActionResult
    from opencontractserver.corpuses.models import CorpusAction
    from opencontractserver.documents.models import Document
    from opencontractserver.llms import agents

    # Load the action and document
    action = await CorpusAction.objects.select_related(
        'agent_config', 'corpus'
    ).aget(id=corpus_action_id)

    document = await Document.objects.aget(id=document_id)

    # Create or get result record
    result, created = await AgentActionResult.objects.aget_or_create(
        corpus_action=action,
        document=document,
        defaults={
            'creator_id': user_id,
            'status': AgentActionResult.Status.RUNNING,
            'started_at': timezone.now(),
        }
    )

    if not created and result.status == AgentActionResult.Status.COMPLETED:
        logger.info(f"Agent action already completed for doc {document_id}")
        return {"status": "already_completed", "result_id": result.id}

    # Update status to running
    result.status = AgentActionResult.Status.RUNNING
    result.started_at = timezone.now()
    await result.asave(update_fields=['status', 'started_at'])

    try:
        # Determine which tools to use
        tools = action.pre_authorized_tools or []
        if not tools and action.agent_config:
            tools = action.agent_config.available_tools or []

        # Build system prompt
        system_prompt = None
        if action.agent_config and action.agent_config.system_instructions:
            system_prompt = action.agent_config.system_instructions

        # Create agent with pre-authorization
        agent = await agents.for_document(
            document=document,
            corpus=action.corpus,
            user_id=user_id,
            system_prompt=system_prompt,
            tools=tools,
            streaming=False,
            # Pre-authorize all tools for automated execution
            skip_approval_gate=True,
        )

        # Execute the task prompt
        response = await agent.chat(action.agent_prompt)

        # Update result with success
        result.status = AgentActionResult.Status.COMPLETED
        result.agent_response = response.content
        result.conversation_id = agent.get_conversation_id()
        result.completed_at = timezone.now()
        result.execution_metadata = {
            "model": action.agent_config.model_name if action.agent_config else "default",
            "tools_available": tools,
            "sources_count": len(response.sources) if response.sources else 0,
        }
        await result.asave()

        logger.info(
            f"Agent corpus action completed: action={corpus_action_id}, "
            f"doc={document_id}, result={result.id}"
        )

        return {
            "status": "completed",
            "result_id": result.id,
            "response_length": len(response.content),
        }

    except Exception as e:
        # Update result with failure
        result.status = AgentActionResult.Status.FAILED
        result.error_message = str(e)
        result.completed_at = timezone.now()
        await result.asave()

        logger.error(
            f"Agent corpus action failed: action={corpus_action_id}, "
            f"doc={document_id}, error={e}",
            exc_info=True
        )
        raise
```

### Integration with process_corpus_action

**File**: `opencontractserver/tasks/corpus_tasks.py` (modify existing)

```python
# Add to imports
from opencontractserver.tasks.agent_tasks import run_agent_corpus_action

# In process_corpus_action function, add after existing fieldset/analyzer handling:

for action in actions:
    if action.fieldset:
        # Existing fieldset logic...
        pass
    elif action.analyzer:
        # Existing analyzer logic...
        pass
    elif action.agent_config:
        # NEW: Agent-based action
        for doc_id in document_ids:
            run_agent_corpus_action.delay(
                corpus_action_id=action.id,
                document_id=doc_id,
                user_id=user_id,
            )
```

---

## Agent Factory Changes

### Skip Approval Gate Support

**File**: `opencontractserver/llms/api.py`

Add `skip_approval_gate` parameter to `for_document` and `for_corpus`:

```python
@staticmethod
async def for_document(
    document: DocumentType,
    corpus: Optional[CorpusType] = None,
    *,
    # ... existing parameters ...
    skip_approval_gate: bool = False,  # NEW
    **kwargs,
) -> CoreAgent:
    """
    Create an agent for document analysis.

    Parameters
    ----------
    skip_approval_gate : bool
        If True, all tools run without requiring approval.
        Use for automated corpus actions where tools are pre-authorized.
    """
    # Pass to agent config
    config = AgentConfig(
        # ... existing config ...
        skip_approval_gate=skip_approval_gate,
    )
```

### AgentConfig Extension

**File**: `opencontractserver/llms/agents/core_agents.py`

```python
@dataclass
class AgentConfig:
    # ... existing fields ...

    # NEW: For automated execution without approval prompts
    skip_approval_gate: bool = False
```

### PydanticAIDependencies Extension

**File**: `opencontractserver/llms/tools/pydantic_ai_tools.py`

```python
class PydanticAIDependencies(BaseModel):
    # ... existing fields ...

    # NEW: Skip approval for automated execution
    skip_approval_gate: bool = Field(
        default=False,
        description="If True, bypass approval checks for all tools"
    )
```

### Tool Wrapper Modification

**File**: `opencontractserver/llms/tools/pydantic_ai_tools.py`

In `PydanticAIToolWrapper._maybe_raise()`:

```python
def _maybe_raise(self, ctx: RunContext[PydanticAIDependencies]):
    """Raise ToolConfirmationRequired if approval is needed."""
    # Skip approval gate entirely if configured
    if ctx.deps.skip_approval_gate:
        return

    # Existing approval logic...
    if self.core_tool.requires_approval:
        raise ToolConfirmationRequired(...)
```

---

## GraphQL API

### Mutation: CreateCorpusAction (Extended)

**File**: `config/graphql/mutations.py`

```python
class CreateCorpusAction(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.ID(required=True)
        trigger = graphene.String(required=True)
        name = graphene.String()
        disabled = graphene.Boolean()
        run_on_all_corpuses = graphene.Boolean()
        # Existing
        fieldset_id = graphene.ID()
        analyzer_id = graphene.ID()
        # NEW
        agent_config_id = graphene.ID()
        agent_prompt = graphene.String()
        pre_authorized_tools = graphene.List(graphene.String)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(CorpusActionType)

    @staticmethod
    def mutate(root, info, corpus_id, trigger, **kwargs):
        # Validate exactly one action type
        action_types = [
            kwargs.get('fieldset_id'),
            kwargs.get('analyzer_id'),
            kwargs.get('agent_config_id'),
        ]
        set_count = sum(1 for a in action_types if a is not None)

        if set_count != 1:
            return CreateCorpusAction(
                ok=False,
                message="Exactly one of fieldset_id, analyzer_id, or agent_config_id must be provided",
                obj=None
            )

        # ... rest of creation logic ...
```

### Type: CorpusActionType (Extended)

**File**: `config/graphql/graphene_types.py`

```python
class CorpusActionType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = CorpusAction
        interfaces = (relay.Node,)
        fields = "__all__"

    # NEW fields
    agent_config = graphene.Field(AgentConfigurationType)
    agent_prompt = graphene.String()
    pre_authorized_tools = graphene.List(graphene.String)
```

### Type: AgentActionResultType (New)

```python
class AgentActionResultType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = AgentActionResult
        interfaces = (relay.Node,)
        fields = "__all__"

    corpus_action = graphene.Field(CorpusActionType)
    document = graphene.Field(DocumentType)
    conversation = graphene.Field(ConversationType)
```

### Query: agent_action_results

```python
class Query(graphene.ObjectType):
    agent_action_results = DjangoFilterConnectionField(
        AgentActionResultType,
        corpus_action_id=graphene.ID(),
        document_id=graphene.ID(),
        status=graphene.String(),
    )

    def resolve_agent_action_results(self, info, **kwargs):
        user = info.context.user
        qs = AgentActionResult.objects.visible_to_user(user)
        # Apply filters...
        return qs
```

---

## Example Usage

### Creating an Auto-Summary Action

```graphql
mutation CreateAutoSummaryAction {
  create_corpus_action(
    corpusId: "Q29ycHVzVHlwZTox"
    trigger: "add_document"
    name: "Auto-Generate Summary"
    agentConfigId: "QWdlbnRDb25maWd1cmF0aW9uVHlwZTox"
    agentPrompt: """
      Analyze this document and create a comprehensive summary.

      1. Use load_document_text to read the full content
      2. Identify the document type, key parties, and main topics
      3. Use update_document_summary to save a 3-5 sentence summary

      Focus on: document purpose, key terms, important dates, and parties involved.
    """
    preAuthorizedTools: ["load_document_text", "load_document_summary", "update_document_summary"]
  ) {
    ok
    message
    obj {
      id
      name
      agentPrompt
      preAuthorizedTools
    }
  }
}
```

### Querying Action Results

```graphql
query GetActionResults($corpusActionId: ID!) {
  agent_action_results(corpusActionId: $corpusActionId) {
    edges {
      node {
        id
        document {
          id
          title
        }
        status
        agentResponse
        toolsExecuted
        startedAt
        completedAt
        errorMessage
      }
    }
  }
}
```

---

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | CorpusAction model extension | ✅ Complete |
| 1 | AgentActionResult model | ✅ Complete |
| 1 | Database migrations | ✅ Complete |
| 2 | `skip_approval_gate` in agent factory | ✅ Complete |
| 2 | `run_agent_corpus_action` task | ✅ Complete |
| 2 | Integration with `process_corpus_action` | ✅ Complete |
| 2 | Deferred action architecture | ✅ Complete |
| 3 | CreateCorpusAction mutation extended | ✅ Complete |
| 3 | AgentActionResultType | ✅ Complete |
| 3 | GraphQL queries for results | ✅ Complete |
| 4 | CorpusSettings UI for agent actions | ✅ Complete |
| 4 | Agent action result viewer | 🔄 In Progress |
| 4 | Pre-authorized tools selector | ✅ Complete |
| 5 | Unit tests for models | ✅ Complete |
| 5 | Integration tests for task execution | ✅ Complete |
| 5 | E2E tests | 🔄 In Progress |

### Key Files

- **Models**: `opencontractserver/corpuses/models.py`, `opencontractserver/agents/models.py`
- **Tasks**: `opencontractserver/tasks/agent_tasks.py`, `opencontractserver/tasks/corpus_tasks.py`
- **Signals**: `opencontractserver/corpuses/signals.py`, `opencontractserver/documents/signals.py`
- **GraphQL**: `config/graphql/graphene_types.py`, `config/graphql/mutations.py`
- **Frontend**: `frontend/src/components/corpuses/CorpusAgentManagement.tsx`

---

## Security Considerations

1. **Tool Pre-Authorization**: Only corpus owners can create actions with pre-authorized tools
2. **Permission Inheritance**: Actions inherit corpus permissions
3. **Audit Trail**: All executions are logged via AgentActionResult model
4. **Tool Filtering**: Public corpuses cannot use approval-gated tools (even if pre-authorized)
5. **Rate Limiting**: Celery task queue provides natural rate limiting; additional limits can be configured

---

## Deferred Action Architecture

### Problem

Corpus actions (including agent-based ones) need access to fully processed document content.
When a document is uploaded, it goes through a processing pipeline:

1. **Thumbnail extraction** - Generate preview image
2. **Document ingestion** - Parse PDF, extract text, create PAWLs layers
3. **Unlock document** - Set `backend_lock=False`, `processing_finished=now()`

If corpus actions fire immediately when a document is added to a corpus (via M2M signal),
agent tools like `load_document_text` may fail because the document isn't fully parsed yet.

### Solution: Event-Driven Deferred Actions

Instead of polling/retrying, we use a purely event-driven architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DOCUMENT UPLOAD FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Document Created                                                            │
│       │                                                                      │
│       ▼                                                                      │
│  backend_lock = True ──────────────────┐                                    │
│       │                                │                                    │
│       ▼                                │                                    │
│  Document Added to Corpus              │                                    │
│       │                                │                                    │
│       ▼                                │                                    │
│  M2M Signal Fires                      │                                    │
│       │                                │                                    │
│       ▼                                │                                    │
│  Check backend_lock                    │                                    │
│       │                                │                                    │
│  ┌────┴────┐                          │                                    │
│  │         │                          │                                    │
│  ▼         ▼                          │                                    │
│ TRUE     FALSE                        │ Processing Pipeline                │
│  │         │                          │ (thumbnail, parse, embed)          │
│  │         ▼                          │         │                          │
│  │    Trigger Actions                 │         │                          │
│  │    Immediately                     │         ▼                          │
│  │                                    └──► set_doc_lock_state(False)       │
│  │                                              │                          │
│  │                                              ▼                          │
│  │                                    document_processing_complete          │
│  │                                         signal fires                     │
│  │                                              │                          │
│  │                                              ▼                          │
│  └──────────────────────────────────────► Check corpus membership          │
│                                              │                              │
│                                              ▼                              │
│                                         Trigger Actions                     │
│                                         for each corpus                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Details

#### Signal: `document_processing_complete`

**File**: `opencontractserver/documents/signals.py`

```python
from django.dispatch import Signal

# Fired when document processing (parsing, thumbnailing) completes
# Provides: document (Document instance), user_id (int)
document_processing_complete = Signal()
```

This signal is fired from `set_doc_lock_state` when unlocking a document:

**File**: `opencontractserver/tasks/doc_tasks.py`

```python
@celery_app.task()
def set_doc_lock_state(*args, locked: bool, doc_id: int):
    document = Document.objects.get(pk=doc_id)
    document.backend_lock = locked
    document.processing_finished = timezone.now()
    document.save()

    # Fire signal when unlocking to trigger deferred corpus actions
    if not locked:
        document_processing_complete.send(
            sender=Document,
            document=document,
            user_id=document.creator_id,
        )
```

#### Handler: M2M Signal (Updated)

**File**: `opencontractserver/corpuses/signals.py`

```python
@receiver(m2m_changed, sender=Corpus.documents.through)
def handle_document_added_to_corpus(sender, instance, action, pk_set, **kwargs):
    if action != "post_add" or not pk_set:
        return

    # Filter to only documents that are ready (not still processing)
    ready_doc_ids = list(
        Document.objects.filter(
            id__in=pk_set,
            backend_lock=False,  # Only ready documents
        ).values_list("id", flat=True)
    )

    # Only trigger actions for ready documents
    # Locked documents will be handled by document_processing_complete signal
    if ready_doc_ids:
        process_corpus_action.si(
            corpus_id=instance.id,
            document_ids=ready_doc_ids,
            user_id=instance.creator.id,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
        ).apply_async()
```

#### Handler: Processing Complete Signal

**File**: `opencontractserver/corpuses/signals.py`

```python
@receiver(document_processing_complete)
def handle_document_processing_complete(sender, document, user_id, **kwargs):
    # Get all corpuses this document belongs to
    corpuses = Corpus.objects.filter(documents=document)

    for corpus in corpuses:
        process_corpus_action.si(
            corpus_id=corpus.id,
            document_ids=[document.id],
            user_id=corpus.creator.id,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
        ).apply_async()
```

### Behavior Matrix

| Scenario | M2M Signal | Processing Complete Signal |
|----------|------------|---------------------------|
| New doc uploaded to corpus | Skipped (locked) | Triggers actions |
| Existing processed doc added | Triggers immediately | N/A (already unlocked) |
| Doc in multiple corpuses | N/A | Triggers for ALL corpuses |
| Doc not in any corpus | N/A | No action |

### Idempotency Requirements

**Important**: Corpus actions SHOULD be designed to be idempotent. Due to the deferred execution
architecture, the same action may be triggered multiple times for the same document in edge cases:

1. Document added to corpus while still processing → triggers via `document_processing_complete`
2. Document later re-added or corpus action re-run → may trigger again

Most built-in corpus actions are idempotent by design:

- **Fieldset extractions**: Use `Extract.objects.get_or_create()`
- **Analyzers**: Create Analysis objects (tracked via CorpusAction)
- **Agent actions**: Use `AgentActionResult.objects.get_or_create()` - skips if already completed

**Recommendations for custom agent prompts**:

1. **Check before creating**: Use tools like `load_document_summary` to check if work already exists
2. **Update rather than duplicate**: Use `update_document_summary` which overwrites, not appends
3. **Idempotent annotations**: Agent should check for existing annotations before creating new ones

If stricter duplicate prevention is needed, actions can check for existing results before execution.

### Testing

See `opencontractserver/tests/test_corpus_document_actions.py` for tests covering:

- `test_locked_document_skipped_by_m2m_signal` - Locked docs not triggered
- `test_document_processing_complete_triggers_corpus_actions` - Signal triggers actions
- `test_document_processing_complete_no_corpus_no_action` - Orphan docs ignored
- `test_document_in_multiple_corpuses_triggers_all` - Multi-corpus support

---

## Related Documentation

- [Corpus Actions Intro](../corpus_actions/intro_to_corpus_actions.md)
- [Document Versioning](./doc_and_path_versioning.md)
- [Agent Framework](../llms/README.md)
- [Permissioning Guide](../permissioning/consolidated_permissioning_guide.md)
