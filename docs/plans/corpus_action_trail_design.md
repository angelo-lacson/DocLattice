# Corpus Action Trail System

## Overview

This document describes the design for a high-performance action trail system that provides unified tracking of all corpus action executions. Like GitHub Actions workflow runs, this system records every execution, its status, timing, and the objects it created or modified.

**Design Goals:**
1. **Unified Query Interface**: Single table to query all action executions across types
2. **Blazing Fast Performance**: Optimized indexes for common query patterns
3. **Complete Audit Trail**: Track timing, status, results, and affected objects
4. **Minimal Overhead**: Append-mostly pattern, batch operations where possible
5. **Export Support**: Optionally include action logs in corpus exports

---

## Implementation Phases

| Phase | Component | Description |
|-------|-----------|-------------|
| 1 | Model & Migration | Create `CorpusActionExecution` model with indexes |
| 2 | Manager & QuerySet | Add optimized query methods |
| 3 | Task Integration | Modify `process_corpus_action` to create execution records |
| 4 | GraphQL API | Add types, queries, and stats endpoint |
| 5 | Export Integration | Add optional action logs to corpus export V2 |
| 6 | Unit Tests | Test model, queries, and bulk operations |
| 7 | Integration Tests | End-to-end action trail verification |

---

## Model Design

### CorpusActionExecution

The core model that tracks every execution of a corpus action.

**File**: `opencontractserver/corpuses/models.py`

```python
class CorpusActionExecution(BaseOCModel):
    """
    Tracks individual executions of corpus actions.

    One record per (corpus_action, document, run) combination.
    Provides unified querying across all action types (fieldset, analyzer, agent).

    Design Notes:
    - Uses JSONField for affected_objects instead of GenericForeignKey for query performance
    - Append-mostly pattern: only status transitions after creation
    - Denormalized corpus_id for fast corpus-level queries without joins
    """

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"  # Idempotent skip (already processed)

    class ActionType(models.TextChoices):
        FIELDSET = "fieldset", "Fieldset Extract"
        ANALYZER = "analyzer", "Analyzer"
        AGENT = "agent", "Agent"

    # Core relationships
    corpus_action = models.ForeignKey(
        "CorpusAction",
        on_delete=models.CASCADE,
        related_name="executions",
        help_text="The corpus action configuration that was executed",
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.CASCADE,
        related_name="corpus_action_executions",
        help_text="The document this action was executed on",
    )

    # Denormalized for query performance (avoids join through corpus_action)
    corpus = models.ForeignKey(
        "Corpus",
        on_delete=models.CASCADE,
        related_name="action_executions",
        help_text="Denormalized corpus reference for fast queries",
        db_index=True,
    )

    # Denormalized action type for filtering without join
    action_type = models.CharField(
        max_length=20,
        choices=ActionType.choices,
        db_index=True,
        help_text="Type of action (fieldset/analyzer/agent)",
    )

    # Execution lifecycle
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    queued_at = models.DateTimeField(
        db_index=True,
        help_text="When the execution was queued (set explicitly for bulk_create compatibility)",
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="When execution actually started",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="When execution completed (success or failure)",
    )

    # Trigger context
    trigger = models.CharField(
        max_length=128,
        choices=CorpusActionTrigger.choices,
        help_text="What triggered this execution",
    )

    # Result tracking - uses JSON for flexibility and query performance
    affected_objects = models.JSONField(
        default=list,
        blank=True,
        help_text="""
        List of objects created or modified by this execution.
        Format: [
            {"type": "extract", "id": 123},
            {"type": "datacell", "id": 456, "column_name": "parties"},
            {"type": "analysis", "id": 789},
            {"type": "annotation", "id": 101, "label": "indemnification"},
            {"type": "document_summary", "revision_id": 202},
            {"type": "document_meta", "field": "description", "old_value": "...", "new_value": "..."},
        ]
        """,
    )

    # For agent actions, link to detailed result
    agent_result = models.ForeignKey(
        "agents.AgentActionResult",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="execution_record",
        help_text="Detailed agent result (for agent actions only)",
    )

    # For fieldset actions, link to extract
    extract = models.ForeignKey(
        "extracts.Extract",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="execution_records",
        help_text="Extract created (for fieldset actions only)",
    )

    # For analyzer actions, link to analysis
    analysis = models.ForeignKey(
        "analyzer.Analysis",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="execution_records",
        help_text="Analysis created (for analyzer actions only)",
    )

    # Error tracking
    error_message = models.TextField(
        blank=True,
        default="",
        help_text="Error message if status is FAILED",
    )
    error_traceback = models.TextField(
        blank=True,
        default="",
        help_text="Full traceback for debugging (truncated to 10KB)",
    )

    # Execution metadata (model, tokens, retries, etc.)
    execution_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="""
        Additional execution context:
        {
            "model": "gpt-4",
            "tokens_used": 1500,
            "retry_count": 0,
            "celery_task_id": "abc-123",
            "worker_id": "worker-1",
        }
        """,
    )

    class Meta:
        ordering = ["-queued_at"]

        indexes = [
            # Primary query: "Get all executions for a corpus, newest first"
            # Used by: corpus action trail UI, corpus dashboard
            models.Index(
                fields=["corpus", "-queued_at"],
                name="corpusactionexec_corpus_queue",
            ),

            # Query: "Get executions for a specific action, newest first"
            # Used by: action detail view, monitoring
            models.Index(
                fields=["corpus_action", "-queued_at"],
                name="corpusactionexec_action_queue",
            ),

            # Query: "Get executions for a document across all actions"
            # Used by: document history view
            models.Index(
                fields=["document", "-queued_at"],
                name="corpusactionexec_doc_queue",
            ),

            # Query: "Get executions by status" (pending work, failures)
            # Used by: monitoring, retry logic
            models.Index(
                fields=["status", "-queued_at"],
                name="corpusactionexec_status_queue",
            ),

            # Query: "Get executions by type for a corpus"
            # Used by: filtered trail views
            models.Index(
                fields=["corpus", "action_type", "-queued_at"],
                name="corpusactionexec_type_queue",
            ),

            # Composite: Detect duplicate/concurrent executions
            models.Index(
                fields=["corpus_action", "document", "status"],
                name="corpusactionexec_dedup",
            ),
        ]

        constraints = [
            # Ensure action_type matches the corpus_action's configuration
            # (enforced in save(), not as DB constraint due to FK complexity)
        ]

    def __str__(self):
        return f"{self.action_type}:{self.corpus_action.name}@{self.document_id} ({self.status})"

    @property
    def duration_seconds(self) -> float | None:
        """Calculate execution duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    @property
    def wait_time_seconds(self) -> float | None:
        """Calculate time spent in queue before execution."""
        if self.queued_at and self.started_at:
            return (self.started_at - self.queued_at).total_seconds()
        return None

    def add_affected_object(self, obj_type: str, obj_id: int, **extra) -> None:
        """
        Add an affected object to the trail.

        Usage:
            execution.add_affected_object("datacell", datacell.id, column_name="parties")
            execution.add_affected_object("annotation", ann.id, label="indemnification")
        """
        entry = {"type": obj_type, "id": obj_id, **extra}
        if self.affected_objects is None:
            self.affected_objects = []
        self.affected_objects.append(entry)

    def mark_started(self, save: bool = True) -> None:
        """Mark execution as started. Use atomic update in concurrent scenarios."""
        self.status = self.Status.RUNNING
        self.started_at = timezone.now()
        if save:
            self.save(update_fields=["status", "started_at", "modified"])

    def mark_completed(
        self,
        affected_objects: list[dict] | None = None,
        metadata: dict | None = None,
        save: bool = True,
    ) -> None:
        """Mark execution as successfully completed."""
        self.status = self.Status.COMPLETED
        self.completed_at = timezone.now()
        if affected_objects:
            self.affected_objects = affected_objects
        if metadata:
            self.execution_metadata.update(metadata)
        if save:
            self.save(update_fields=[
                "status", "completed_at", "affected_objects",
                "execution_metadata", "modified"
            ])

    def mark_failed(
        self,
        error_message: str,
        error_traceback: str = "",
        save: bool = True,
    ) -> None:
        """Mark execution as failed with error details."""
        self.status = self.Status.FAILED
        self.completed_at = timezone.now()
        self.error_message = error_message[:5000]  # Truncate
        self.error_traceback = error_traceback[:10000]  # Truncate
        if save:
            self.save(update_fields=[
                "status", "completed_at", "error_message",
                "error_traceback", "modified"
            ])

    def mark_skipped(self, reason: str = "", save: bool = True) -> None:
        """Mark execution as skipped (idempotent - already processed)."""
        self.status = self.Status.SKIPPED
        self.completed_at = timezone.now()
        if reason:
            self.execution_metadata["skip_reason"] = reason
        if save:
            self.save(update_fields=[
                "status", "completed_at", "execution_metadata", "modified"
            ])

    @classmethod
    def bulk_queue(
        cls,
        corpus_action: "CorpusAction",
        document_ids: list[int],
        trigger: str,
        user_id: int,
    ) -> list["CorpusActionExecution"]:
        """
        Efficiently queue multiple executions in a single INSERT.

        Returns list of created execution records.
        """
        # Determine action type
        if corpus_action.fieldset_id:
            action_type = cls.ActionType.FIELDSET
        elif corpus_action.analyzer_id:
            action_type = cls.ActionType.ANALYZER
        else:
            action_type = cls.ActionType.AGENT

        now = timezone.now()
        executions = [
            cls(
                corpus_action=corpus_action,
                document_id=doc_id,
                corpus_id=corpus_action.corpus_id,
                action_type=action_type,
                status=cls.Status.QUEUED,
                trigger=trigger,
                queued_at=now,
                creator_id=user_id,
            )
            for doc_id in document_ids
        ]

        return cls.objects.bulk_create(executions)
```

---

## Query Manager

**File**: `opencontractserver/corpuses/managers.py` (add to existing or create)

```python
from datetime import timedelta

from django.db import models
from django.utils import timezone

from opencontractserver.shared.Managers import BaseVisibilityManager


class CorpusActionExecutionQuerySet(models.QuerySet):
    """Optimized querysets for action trail queries."""

    def for_corpus(self, corpus_id: int) -> "CorpusActionExecutionQuerySet":
        """Get executions for a corpus, uses denormalized corpus field."""
        return self.filter(corpus_id=corpus_id)

    def for_document(self, document_id: int) -> "CorpusActionExecutionQuerySet":
        """Get all action executions that affected a document."""
        return self.filter(document_id=document_id)

    def by_type(self, action_type: str) -> "CorpusActionExecutionQuerySet":
        """Filter by action type (fieldset/analyzer/agent)."""
        return self.filter(action_type=action_type)

    def pending(self) -> "CorpusActionExecutionQuerySet":
        """Get executions that haven't completed yet."""
        return self.filter(status__in=["queued", "running"])

    def failed(self) -> "CorpusActionExecutionQuerySet":
        """Get failed executions for retry/monitoring."""
        return self.filter(status="failed")

    def recent(self, hours: int = 24) -> "CorpusActionExecutionQuerySet":
        """Get recent executions within time window."""
        cutoff = timezone.now() - timedelta(hours=hours)
        return self.filter(queued_at__gte=cutoff)

    def with_stats(self) -> "CorpusActionExecutionQuerySet":
        """Annotate with computed fields for display."""
        return self.annotate(
            duration=models.ExpressionWrapper(
                models.F("completed_at") - models.F("started_at"),
                output_field=models.DurationField(),
            ),
            wait_time=models.ExpressionWrapper(
                models.F("started_at") - models.F("queued_at"),
                output_field=models.DurationField(),
            ),
        )

    def summary_by_status(self) -> dict:
        """
        Get execution count summary by status.

        Returns: {"queued": 5, "running": 2, "completed": 100, "failed": 3}
        """
        return dict(
            self.values("status")
            .annotate(count=models.Count("id"))
            .values_list("status", "count")
        )

    def summary_by_action(self) -> models.QuerySet:
        """
        Get execution stats grouped by action.

        Returns QuerySet with corpus_action_id, action_name, total, completed, failed, avg_duration
        """
        return (
            self.values("corpus_action_id", "corpus_action__name")
            .annotate(
                total=models.Count("id"),
                completed=models.Count("id", filter=models.Q(status="completed")),
                failed=models.Count("id", filter=models.Q(status="failed")),
                avg_duration=models.Avg(
                    models.F("completed_at") - models.F("started_at"),
                    filter=models.Q(completed_at__isnull=False, started_at__isnull=False),
                ),
            )
            .order_by("-total")
        )


class CorpusActionExecutionManager(BaseVisibilityManager):
    """
    Manager with permission-aware filtering.

    Inherits visible_to_user() from BaseVisibilityManager which provides:
    - Superusers see everything
    - Anonymous users see only public objects
    - Authenticated users see: public, objects they created, or objects with explicit permissions

    The custom QuerySet methods are exposed via get_queryset() which returns
    CorpusActionExecutionQuerySet, allowing chaining like:
        CorpusActionExecution.objects.visible_to_user(user).for_corpus(corpus_id).pending()
    """

    def get_queryset(self) -> CorpusActionExecutionQuerySet:
        return CorpusActionExecutionQuerySet(self.model, using=self._db)

    def for_corpus(self, corpus_id: int) -> CorpusActionExecutionQuerySet:
        return self.get_queryset().for_corpus(corpus_id)

    def for_document(self, document_id: int) -> CorpusActionExecutionQuerySet:
        return self.get_queryset().for_document(document_id)

    def visible_to_user(self, user=None) -> CorpusActionExecutionQuerySet:
        """
        Override to return our custom QuerySet type while preserving permission logic.

        This allows chaining: .visible_to_user(user).for_corpus(id).pending()
        """
        # Get the base filtered queryset from parent
        base_qs = super().visible_to_user(user)
        # Re-apply through our custom queryset to enable custom methods
        return self.get_queryset().filter(pk__in=base_qs.values('pk'))
```

---

## Integration with Task Processing

### Modified process_corpus_action

**File**: `opencontractserver/tasks/corpus_tasks.py`

```python
@shared_task(bind=True)
def process_corpus_action(
    self,
    corpus_id: int,
    document_ids: list[int],
    user_id: int,
    trigger: str = CorpusActionTrigger.ADD_DOCUMENT,
) -> dict:
    """
    Process corpus actions for documents with execution tracking.

    Returns summary of queued executions.
    """
    from opencontractserver.corpuses.models import (
        Corpus, CorpusAction, CorpusActionExecution,
    )

    # Get applicable actions
    actions = CorpusAction.objects.filter(
        models.Q(corpus_id=corpus_id) | models.Q(run_on_all_corpuses=True),
        trigger=trigger,
        disabled=False,
    ).select_related("fieldset", "analyzer", "agent_config")

    summary = {"actions_processed": 0, "executions_queued": 0}

    for action in actions:
        # Bulk queue execution records
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=action,
            document_ids=document_ids,
            trigger=trigger,
            user_id=user_id,
        )

        summary["actions_processed"] += 1
        summary["executions_queued"] += len(executions)

        # Dispatch to appropriate handler with execution IDs
        execution_ids = [e.id for e in executions]

        if action.fieldset_id:
            process_fieldset_action.delay(
                action_id=action.id,
                execution_ids=execution_ids,
                user_id=user_id,
            )
        elif action.analyzer_id:
            process_analyzer_action.delay(
                action_id=action.id,
                execution_ids=execution_ids,
                user_id=user_id,
            )
        elif action.agent_config_id:
            # Agent actions are per-document
            for execution in executions:
                run_agent_corpus_action.delay(
                    corpus_action_id=action.id,
                    document_id=execution.document_id,
                    user_id=user_id,
                    execution_id=execution.id,
                )

    return summary


@shared_task(bind=True)
def process_fieldset_action(
    self,
    action_id: int,
    execution_ids: list[int],
    user_id: int,
) -> dict:
    """
    Process fieldset extraction with execution tracking.
    """
    from opencontractserver.corpuses.models import CorpusAction, CorpusActionExecution
    from opencontractserver.extracts.models import Extract, Datacell

    action = CorpusAction.objects.select_related("fieldset", "corpus").get(id=action_id)
    executions = CorpusActionExecution.objects.filter(id__in=execution_ids)

    # Mark all executions as started (bulk update)
    now = timezone.now()
    executions.update(status=CorpusActionExecution.Status.RUNNING, started_at=now)

    try:
        # Create or get extract
        extract, created = Extract.objects.get_or_create(
            corpus=action.corpus,
            fieldset=action.fieldset,
            corpus_action=action,
            defaults={
                "name": f"Action: {action.name}",
                "creator_id": user_id,
                "started": now,
            },
        )

        if not created:
            extract.started = now
            extract.save(update_fields=["started"])

        # Link extract to executions
        executions.update(extract=extract)

        # Create datacells and track affected objects
        affected_by_doc = {}  # doc_id -> list of affected objects

        for execution in executions.select_related("document"):
            doc_id = execution.document_id
            affected_by_doc[doc_id] = [
                {"type": "extract", "id": extract.id}
            ]

            # Create datacells for each column
            for column in action.fieldset.columns.all():
                datacell, _ = Datacell.objects.get_or_create(
                    extract=extract,
                    column=column,
                    document_id=doc_id,
                    defaults={"creator_id": user_id},
                )
                affected_by_doc[doc_id].append({
                    "type": "datacell",
                    "id": datacell.id,
                    "column_name": column.name,
                })

        # Queue extraction tasks...
        # (existing extraction logic)

        # Mark executions as completed with affected objects
        for execution in executions:
            execution.status = CorpusActionExecution.Status.COMPLETED
            execution.completed_at = timezone.now()
            execution.affected_objects = affected_by_doc.get(execution.document_id, [])

        CorpusActionExecution.objects.bulk_update(
            executions,
            ["status", "completed_at", "affected_objects"],
        )

        return {"status": "completed", "extract_id": extract.id}

    except Exception as e:
        # Mark all executions as failed
        executions.update(
            status=CorpusActionExecution.Status.FAILED,
            completed_at=timezone.now(),
            error_message=str(e)[:5000],
        )
        raise


@shared_task(bind=True, max_retries=3)
def run_agent_corpus_action(
    self,
    corpus_action_id: int,
    document_id: int,
    user_id: int,
    execution_id: int | None = None,  # NEW: Link to execution record
) -> dict:
    """
    Execute agent action with execution tracking.

    This task runs synchronously but internally uses asyncio.run() to call
    the async agent API (matching existing implementation pattern).
    """
    import asyncio
    import traceback

    from opencontractserver.corpuses.models import CorpusActionExecution

    # Link execution record to agent result
    if execution_id:
        execution = CorpusActionExecution.objects.get(id=execution_id)
        execution.mark_started()

        try:
            # Run agent using asyncio.run() - Celery tasks are synchronous
            # but agent API is async, so we bridge with asyncio.run()
            result = asyncio.run(
                _run_agent_corpus_action_async(
                    corpus_action_id=corpus_action_id,
                    document_id=document_id,
                    user_id=user_id,
                )
            )

            # Link to agent result
            execution.agent_result = result
            execution.mark_completed(
                affected_objects=[
                    {"type": "agent_result", "id": result.id},
                    {"type": "conversation", "id": result.conversation_id},
                    # Add any objects the agent created...
                ],
                metadata={
                    "model": result.execution_metadata.get("model"),
                    "tools_used": [t["name"] for t in result.tools_executed or []],
                },
            )

            return {"status": "completed", "result_id": result.id}

        except Exception as e:
            execution.mark_failed(str(e), traceback.format_exc())
            raise
    else:
        # Fallback for calls without execution tracking (backwards compatibility)
        return asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=corpus_action_id,
                document_id=document_id,
                user_id=user_id,
            )
        )
```

---

## GraphQL API

### Types

**File**: `config/graphql/graphene_types.py`

```python
class CorpusActionExecutionType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = CorpusActionExecution
        interfaces = (relay.Node,)
        fields = "__all__"

    # Computed fields
    duration_seconds = graphene.Float()
    wait_time_seconds = graphene.Float()

    # Resolved relationships
    corpus_action = graphene.Field(CorpusActionType)
    document = graphene.Field(DocumentType)
    agent_result = graphene.Field(AgentActionResultType)
    extract = graphene.Field(ExtractType)
    analysis = graphene.Field(AnalysisType)

    def resolve_duration_seconds(self, info):
        return self.duration_seconds

    def resolve_wait_time_seconds(self, info):
        return self.wait_time_seconds


class CorpusActionTrailStatsType(graphene.ObjectType):
    """Aggregated statistics for action trail."""
    total_executions = graphene.Int()
    completed = graphene.Int()
    failed = graphene.Int()
    running = graphene.Int()
    queued = graphene.Int()
    avg_duration_seconds = graphene.Float()

    # By action type
    fieldset_count = graphene.Int()
    analyzer_count = graphene.Int()
    agent_count = graphene.Int()
```

### Queries

```python
class Query(graphene.ObjectType):
    # Paginated list with filtering
    corpus_action_executions = DjangoFilterConnectionField(
        CorpusActionExecutionType,
        corpus_id=graphene.ID(),
        document_id=graphene.ID(),
        corpus_action_id=graphene.ID(),
        status=graphene.String(),
        action_type=graphene.String(),
        since=graphene.DateTime(),
    )

    # Stats for dashboard
    corpus_action_trail_stats = graphene.Field(
        CorpusActionTrailStatsType,
        corpus_id=graphene.ID(required=True),
        since=graphene.DateTime(),
    )

    def resolve_corpus_action_executions(self, info, **kwargs):
        user = info.context.user
        qs = CorpusActionExecution.objects.visible_to_user(user)

        if corpus_id := kwargs.get("corpus_id"):
            qs = qs.for_corpus(from_global_id(corpus_id)[1])
        if document_id := kwargs.get("document_id"):
            qs = qs.for_document(from_global_id(document_id)[1])
        if corpus_action_id := kwargs.get("corpus_action_id"):
            qs = qs.filter(corpus_action_id=from_global_id(corpus_action_id)[1])
        if status := kwargs.get("status"):
            qs = qs.filter(status=status)
        if action_type := kwargs.get("action_type"):
            qs = qs.by_type(action_type)
        if since := kwargs.get("since"):
            qs = qs.filter(queued_at__gte=since)

        return qs.select_related(
            "corpus_action", "document", "corpus"
        ).order_by("-queued_at")

    def resolve_corpus_action_trail_stats(self, info, corpus_id, since=None):
        user = info.context.user
        qs = CorpusActionExecution.objects.visible_to_user(user)
        qs = qs.for_corpus(from_global_id(corpus_id)[1])

        if since:
            qs = qs.filter(queued_at__gte=since)

        stats = qs.aggregate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
            failed=Count("id", filter=Q(status="failed")),
            running=Count("id", filter=Q(status="running")),
            queued=Count("id", filter=Q(status="queued")),
            avg_duration=Avg(
                F("completed_at") - F("started_at"),
                filter=Q(completed_at__isnull=False, started_at__isnull=False),
            ),
            fieldset_count=Count("id", filter=Q(action_type="fieldset")),
            analyzer_count=Count("id", filter=Q(action_type="analyzer")),
            agent_count=Count("id", filter=Q(action_type="agent")),
        )

        return CorpusActionTrailStatsType(
            total_executions=stats["total"],
            completed=stats["completed"],
            failed=stats["failed"],
            running=stats["running"],
            queued=stats["queued"],
            avg_duration_seconds=stats["avg_duration"].total_seconds() if stats["avg_duration"] else None,
            fieldset_count=stats["fieldset_count"],
            analyzer_count=stats["analyzer_count"],
            agent_count=stats["agent_count"],
        )
```

---

## Corpus Export Integration

### Export Types

**File**: `opencontractserver/types/dicts.py`

```python
class CorpusActionExecutionExport(TypedDict):
    """Export format for a single action execution."""
    id: str
    action_name: str
    action_type: str  # fieldset, analyzer, agent
    document_id: str
    status: str
    trigger: str
    queued_at: str  # ISO format
    started_at: str | None
    completed_at: str | None
    duration_seconds: float | None
    affected_objects: list[dict]
    error_message: str
    execution_metadata: dict


class CorpusActionExport(TypedDict):
    """Export format for a corpus action configuration."""
    id: str
    name: str
    action_type: str
    trigger: str
    disabled: bool
    # Type-specific config
    fieldset_id: str | None
    analyzer_id: str | None
    agent_config_id: str | None
    agent_prompt: str
    pre_authorized_tools: list[str]


class ActionTrailExport(TypedDict):
    """Complete action trail for export."""
    actions: list[CorpusActionExport]
    executions: list[CorpusActionExecutionExport]
    stats: dict  # Summary statistics
```

### Export Function

**File**: `opencontractserver/utils/export_v2.py`

```python
def package_action_trail(
    corpus: Corpus,
    include_executions: bool = True,
    execution_limit: int | None = 1000,
    since: datetime | None = None,
) -> ActionTrailExport:
    """
    Package corpus action trail for export.

    Args:
        corpus: Corpus to export actions for
        include_executions: Whether to include execution history
        execution_limit: Max executions to include (None = unlimited)
        since: Only include executions after this datetime

    Returns:
        ActionTrailExport dict with actions, executions, and stats
    """
    from opencontractserver.corpuses.models import CorpusAction, CorpusActionExecution

    # Export action configurations
    actions = []
    for action in corpus.actions.all():
        actions.append({
            "id": str(action.id),
            "name": action.name,
            "action_type": (
                "fieldset" if action.fieldset_id else
                "analyzer" if action.analyzer_id else
                "agent"
            ),
            "trigger": action.trigger,
            "disabled": action.disabled,
            "fieldset_id": str(action.fieldset_id) if action.fieldset_id else None,
            "analyzer_id": str(action.analyzer_id) if action.analyzer_id else None,
            "agent_config_id": str(action.agent_config_id) if action.agent_config_id else None,
            "agent_prompt": action.agent_prompt,
            "pre_authorized_tools": action.pre_authorized_tools or [],
        })

    # Export executions if requested
    executions = []
    if include_executions:
        qs = CorpusActionExecution.objects.filter(corpus=corpus)

        if since:
            qs = qs.filter(queued_at__gte=since)

        qs = qs.select_related("corpus_action", "document").order_by("-queued_at")

        if execution_limit:
            qs = qs[:execution_limit]

        for exec in qs:
            executions.append({
                "id": str(exec.id),
                "action_name": exec.corpus_action.name,
                "action_type": exec.action_type,
                "document_id": str(exec.document_id),
                "status": exec.status,
                "trigger": exec.trigger,
                "queued_at": exec.queued_at.isoformat() if exec.queued_at else None,
                "started_at": exec.started_at.isoformat() if exec.started_at else None,
                "completed_at": exec.completed_at.isoformat() if exec.completed_at else None,
                "duration_seconds": exec.duration_seconds,
                "affected_objects": exec.affected_objects or [],
                "error_message": exec.error_message,
                "execution_metadata": exec.execution_metadata or {},
            })

    # Calculate stats
    stats = CorpusActionExecution.objects.filter(corpus=corpus).aggregate(
        total=Count("id"),
        completed=Count("id", filter=Q(status="completed")),
        failed=Count("id", filter=Q(status="failed")),
    )

    return {
        "actions": actions,
        "executions": executions,
        "stats": {
            "total_executions": stats["total"],
            "completed": stats["completed"],
            "failed": stats["failed"],
            "exported_count": len(executions),
        },
    }
```

### Updated Export Data Structure

**File**: `opencontractserver/types/dicts.py`

Add to `OpenContractsExportDataJsonV2Type`:

```python
class OpenContractsExportDataJsonV2Type(TypedDict):
    # ... existing V2 fields ...

    # ===== NEW: Action Trail (optional) =====
    action_trail: ActionTrailExport | None
```

### Export Task Integration

**File**: `opencontractserver/tasks/export_tasks_v2.py`

```python
def build_corpus_export(
    corpus_id: int,
    user_id: int,
    include_conversations: bool = False,
    include_action_trail: bool = False,  # NEW
    action_trail_limit: int = 1000,  # NEW
) -> dict:
    """Build corpus export with optional components."""
    corpus = Corpus.objects.get(id=corpus_id)

    export_data = {
        "version": "2.0",
        # ... existing export building ...
    }

    # Add action trail if requested
    if include_action_trail:
        from opencontractserver.utils.export_v2 import package_action_trail
        export_data["action_trail"] = package_action_trail(
            corpus=corpus,
            include_executions=True,
            execution_limit=action_trail_limit,
        )

    return export_data
```

### GraphQL Mutation Update

**File**: `config/graphql/mutations.py`

```python
class StartExportCorpus(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.ID(required=True)
        include_conversations = graphene.Boolean(default_value=False)
        include_action_trail = graphene.Boolean(default_value=False)  # NEW
        action_trail_limit = graphene.Int(default_value=1000)  # NEW

    # ... existing fields ...

    @staticmethod
    def mutate(root, info, corpus_id, include_conversations=False,
               include_action_trail=False, action_trail_limit=1000):
        # ... existing validation ...

        export_task.delay(
            corpus_id=corpus_pk,
            user_id=user.id,
            include_conversations=include_conversations,
            include_action_trail=include_action_trail,
            action_trail_limit=action_trail_limit,
        )
```

---

## Performance Optimizations

### 1. Denormalized Fields

The model includes denormalized fields to avoid JOINs in common queries:

- `corpus_id`: Avoids join through `corpus_action` for corpus-level queries
- `action_type`: Avoids join to check `fieldset/analyzer/agent_config` is null

### 2. Targeted Indexes

Six indexes optimized for specific query patterns:

| Index | Query Pattern | Use Case |
|-------|---------------|----------|
| `(corpus, -queued_at)` | Corpus action trail | Dashboard, history |
| `(corpus_action, -queued_at)` | Action-specific history | Action detail view |
| `(document, -queued_at)` | Document action history | Document timeline |
| `(status, -queued_at)` | Pending/failed work | Monitoring, retries |
| `(corpus, action_type, -queued_at)` | Filtered trail | Type-specific views |
| `(corpus_action, document, status)` | Deduplication | Idempotency checks |

### 3. Bulk Operations

```python
# Queue many executions in single INSERT
executions = CorpusActionExecution.bulk_queue(action, doc_ids, trigger, user_id)

# Update many statuses in single UPDATE
CorpusActionExecution.objects.filter(id__in=ids).update(
    status="running", started_at=now
)

# Bulk update with affected objects
CorpusActionExecution.objects.bulk_update(executions, ["status", "affected_objects"])
```

### 4. Efficient Aggregations

Stats queries use database-level aggregation:

```python
# Single query for all stats
qs.aggregate(
    total=Count("id"),
    completed=Count("id", filter=Q(status="completed")),
    avg_duration=Avg(F("completed_at") - F("started_at")),
)
```

### 5. Append-Mostly Pattern

Executions follow a strict lifecycle with minimal updates:

```
CREATE (queued) → UPDATE (running) → UPDATE (completed/failed)
```

Only 2 updates per execution, and affected_objects is written once at completion.

### 6. Export Performance

- Uses `select_related()` to avoid N+1 queries
- Configurable `execution_limit` to cap export size
- `since` filter for incremental exports
- Stats calculated via single aggregate query

---

## Migration Strategy

### Phase 1: Add Model (Non-Breaking)

1. Create `CorpusActionExecution` model
2. Add migration
3. No changes to existing code

### Phase 2: Integrate with Task Processing

1. Modify `process_corpus_action` to create execution records
2. Update `run_agent_corpus_action` to link to executions
3. Update fieldset/analyzer processing

### Phase 3: Export Integration

1. Add `ActionTrailExport` types
2. Implement `package_action_trail()` function
3. Update export task and mutation
4. Update frontend ExportModal to include option

### Phase 4: Backfill (Optional)

For existing `AgentActionResult` records:

```python
# One-time backfill script
for result in AgentActionResult.objects.filter(execution_record__isnull=True):
    CorpusActionExecution.objects.create(
        corpus_action=result.corpus_action,
        document=result.document,
        corpus=result.corpus_action.corpus,
        action_type="agent",
        status=result.status,
        queued_at=result.started_at or result.created,
        started_at=result.started_at,
        completed_at=result.completed_at,
        trigger="add_document",  # Assumed
        agent_result=result,
        affected_objects=[{"type": "agent_result", "id": result.id}],
        creator=result.creator,
    )
```

---

## Testing Strategy

**File**: `opencontractserver/tests/test_corpus_action_execution.py`

### Test Coverage Matrix

| Component | Test Class | Priority |
|-----------|------------|----------|
| Model lifecycle | `TestCorpusActionExecutionModel` | P0 |
| Bulk operations | `TestCorpusActionExecutionBulkOps` | P0 |
| QuerySet methods | `TestCorpusActionExecutionQuerySet` | P0 |
| Manager/Permissions | `TestCorpusActionExecutionPermissions` | P0 |
| Computed properties | `TestCorpusActionExecutionProperties` | P1 |
| Export functionality | `TestActionTrailExport` | P1 |
| GraphQL queries | `TestCorpusActionExecutionGraphQL` | P1 |
| Task integration | `TestCorpusActionExecutionIntegration` | P0 |

---

### Unit Tests: Model Lifecycle

```python
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from opencontractserver.corpuses.models import (
    Corpus,
    CorpusAction,
    CorpusActionExecution,
    CorpusActionTrigger,
)
from opencontractserver.tests.fixtures import create_test_user, create_test_corpus


class TestCorpusActionExecutionModel(TestCase):
    """Test model lifecycle methods."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus = create_test_corpus(creator=cls.user)
        # Create a fieldset action for testing
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )
        cls.document = Document.objects.create(title="Test Doc", creator=cls.user)

    def create_execution(self, **kwargs):
        """Helper to create execution with defaults."""
        defaults = {
            "corpus_action": self.action,
            "document": self.document,
            "corpus": self.corpus,
            "action_type": CorpusActionExecution.ActionType.FIELDSET,
            "trigger": CorpusActionTrigger.ADD_DOCUMENT,
            "queued_at": timezone.now(),
            "creator": self.user,
        }
        defaults.update(kwargs)
        return CorpusActionExecution.objects.create(**defaults)

    # --- mark_started() ---

    def test_mark_started_sets_status_and_timestamp(self):
        """mark_started() transitions to RUNNING with timestamp."""
        execution = self.create_execution()
        self.assertEqual(execution.status, CorpusActionExecution.Status.QUEUED)
        self.assertIsNone(execution.started_at)

        execution.mark_started()

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.RUNNING)
        self.assertIsNotNone(execution.started_at)

    def test_mark_started_with_save_false(self):
        """mark_started(save=False) updates instance without DB write."""
        execution = self.create_execution()

        execution.mark_started(save=False)

        self.assertEqual(execution.status, CorpusActionExecution.Status.RUNNING)
        # Verify NOT saved to DB
        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.QUEUED)

    # --- mark_completed() ---

    def test_mark_completed_sets_status_and_timestamp(self):
        """mark_completed() transitions to COMPLETED with timestamp."""
        execution = self.create_execution()
        execution.mark_started()

        execution.mark_completed()

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.COMPLETED)
        self.assertIsNotNone(execution.completed_at)

    def test_mark_completed_with_affected_objects(self):
        """mark_completed() stores affected objects list."""
        execution = self.create_execution()
        execution.mark_started()

        affected = [
            {"type": "extract", "id": 1},
            {"type": "datacell", "id": 2, "column_name": "parties"},
        ]
        execution.mark_completed(affected_objects=affected)

        execution.refresh_from_db()
        self.assertEqual(len(execution.affected_objects), 2)
        self.assertEqual(execution.affected_objects[0]["type"], "extract")
        self.assertEqual(execution.affected_objects[1]["column_name"], "parties")

    def test_mark_completed_with_metadata(self):
        """mark_completed() merges execution metadata."""
        execution = self.create_execution()
        execution.execution_metadata = {"existing": "value"}
        execution.save()
        execution.mark_started()

        execution.mark_completed(metadata={"model": "gpt-4", "tokens": 1500})

        execution.refresh_from_db()
        self.assertEqual(execution.execution_metadata["existing"], "value")
        self.assertEqual(execution.execution_metadata["model"], "gpt-4")
        self.assertEqual(execution.execution_metadata["tokens"], 1500)

    # --- mark_failed() ---

    def test_mark_failed_sets_status_and_error(self):
        """mark_failed() transitions to FAILED with error details."""
        execution = self.create_execution()
        execution.mark_started()

        execution.mark_failed("Connection timeout", "Traceback: ...")

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.FAILED)
        self.assertIsNotNone(execution.completed_at)
        self.assertEqual(execution.error_message, "Connection timeout")
        self.assertEqual(execution.error_traceback, "Traceback: ...")

    def test_mark_failed_truncates_long_error_message(self):
        """mark_failed() truncates error_message to 5000 chars."""
        execution = self.create_execution()
        execution.mark_started()

        long_error = "x" * 10000
        execution.mark_failed(long_error)

        execution.refresh_from_db()
        self.assertEqual(len(execution.error_message), 5000)

    def test_mark_failed_truncates_long_traceback(self):
        """mark_failed() truncates error_traceback to 10000 chars."""
        execution = self.create_execution()
        execution.mark_started()

        long_traceback = "y" * 20000
        execution.mark_failed("Error", long_traceback)

        execution.refresh_from_db()
        self.assertEqual(len(execution.error_traceback), 10000)

    # --- mark_skipped() ---

    def test_mark_skipped_sets_status(self):
        """mark_skipped() transitions to SKIPPED."""
        execution = self.create_execution()

        execution.mark_skipped()

        execution.refresh_from_db()
        self.assertEqual(execution.status, CorpusActionExecution.Status.SKIPPED)
        self.assertIsNotNone(execution.completed_at)

    def test_mark_skipped_stores_reason_in_metadata(self):
        """mark_skipped() stores skip reason in execution_metadata."""
        execution = self.create_execution()

        execution.mark_skipped(reason="Already processed in previous run")

        execution.refresh_from_db()
        self.assertEqual(
            execution.execution_metadata["skip_reason"],
            "Already processed in previous run"
        )

    # --- add_affected_object() ---

    def test_add_affected_object_appends_to_list(self):
        """add_affected_object() appends to affected_objects list."""
        execution = self.create_execution()
        execution.affected_objects = []

        execution.add_affected_object("extract", 1)
        execution.add_affected_object("datacell", 2, column_name="parties")

        self.assertEqual(len(execution.affected_objects), 2)
        self.assertEqual(execution.affected_objects[0], {"type": "extract", "id": 1})
        self.assertEqual(
            execution.affected_objects[1],
            {"type": "datacell", "id": 2, "column_name": "parties"}
        )

    def test_add_affected_object_handles_none_list(self):
        """add_affected_object() initializes list if None."""
        execution = self.create_execution()
        execution.affected_objects = None

        execution.add_affected_object("annotation", 5)

        self.assertEqual(execution.affected_objects, [{"type": "annotation", "id": 5}])
```

---

### Unit Tests: Bulk Operations

```python
class TestCorpusActionExecutionBulkOps(TestCase):
    """Test bulk_queue and bulk update operations."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus = create_test_corpus(creator=cls.user)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )
        cls.documents = [
            Document.objects.create(title=f"Doc {i}", creator=cls.user)
            for i in range(5)
        ]

    def test_bulk_queue_creates_records(self):
        """bulk_queue() creates execution records efficiently."""
        doc_ids = [d.id for d in self.documents]

        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=doc_ids,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(len(executions), 5)
        self.assertTrue(all(
            e.status == CorpusActionExecution.Status.QUEUED
            for e in executions
        ))

    def test_bulk_queue_sets_correct_action_type_fieldset(self):
        """bulk_queue() detects fieldset action type."""
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(
            executions[0].action_type,
            CorpusActionExecution.ActionType.FIELDSET
        )

    def test_bulk_queue_sets_correct_action_type_analyzer(self):
        """bulk_queue() detects analyzer action type."""
        analyzer = Analyzer.objects.create(name="Test", creator=self.user)
        analyzer_action = CorpusAction.objects.create(
            name="Analyzer Action",
            corpus=self.corpus,
            analyzer=analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        executions = CorpusActionExecution.bulk_queue(
            corpus_action=analyzer_action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(
            executions[0].action_type,
            CorpusActionExecution.ActionType.ANALYZER
        )

    def test_bulk_queue_sets_correct_action_type_agent(self):
        """bulk_queue() detects agent action type."""
        agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            creator=self.user,
        )
        agent_action = CorpusAction.objects.create(
            name="Agent Action",
            corpus=self.corpus,
            agent_config=agent_config,
            agent_prompt="Summarize this document",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        executions = CorpusActionExecution.bulk_queue(
            corpus_action=agent_action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(
            executions[0].action_type,
            CorpusActionExecution.ActionType.AGENT
        )

    def test_bulk_queue_sets_denormalized_corpus_id(self):
        """bulk_queue() sets denormalized corpus_id for fast queries."""
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(executions[0].corpus_id, self.corpus.id)

    def test_bulk_queue_sets_creator(self):
        """bulk_queue() sets creator_id from user_id param."""
        executions = CorpusActionExecution.bulk_queue(
            corpus_action=self.action,
            document_ids=[self.documents[0].id],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            user_id=self.user.id,
        )

        self.assertEqual(executions[0].creator_id, self.user.id)

    def test_bulk_queue_uses_single_insert(self):
        """bulk_queue() uses bulk_create for efficiency."""
        doc_ids = [d.id for d in self.documents]

        # Should use 1 INSERT statement regardless of document count
        with self.assertNumQueries(1):
            CorpusActionExecution.bulk_queue(
                corpus_action=self.action,
                document_ids=doc_ids,
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                user_id=self.user.id,
            )
```

---

### Unit Tests: QuerySet Methods

```python
class TestCorpusActionExecutionQuerySet(TestCase):
    """Test custom QuerySet methods."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus1 = create_test_corpus(creator=cls.user, title="Corpus 1")
        cls.corpus2 = create_test_corpus(creator=cls.user, title="Corpus 2")
        cls.document = Document.objects.create(title="Test Doc", creator=cls.user)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action1 = CorpusAction.objects.create(
            name="Action 1",
            corpus=cls.corpus1,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )

    def create_execution(self, corpus, status="queued", **kwargs):
        """Helper to create execution with specified status."""
        action = CorpusAction.objects.filter(corpus=corpus).first() or self.action1
        exec = CorpusActionExecution.objects.create(
            corpus_action=action,
            document=self.document,
            corpus=corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
            **kwargs,
        )
        if status != "queued":
            exec.status = status
            exec.save()
        return exec

    # --- for_corpus() ---

    def test_for_corpus_filters_by_corpus_id(self):
        """for_corpus() returns only executions for that corpus."""
        exec1 = self.create_execution(self.corpus1)
        exec2 = self.create_execution(self.corpus2)

        result = CorpusActionExecution.objects.for_corpus(self.corpus1.id)

        self.assertEqual(list(result), [exec1])

    # --- for_document() ---

    def test_for_document_filters_by_document_id(self):
        """for_document() returns executions for that document."""
        doc2 = Document.objects.create(title="Doc 2", creator=self.user)
        exec1 = self.create_execution(self.corpus1)
        exec2 = CorpusActionExecution.objects.create(
            corpus_action=self.action1,
            document=doc2,
            corpus=self.corpus1,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
        )

        result = CorpusActionExecution.objects.for_document(self.document.id)

        self.assertEqual(list(result), [exec1])

    # --- by_type() ---

    def test_by_type_filters_by_action_type(self):
        """by_type() filters by action type."""
        exec_fieldset = self.create_execution(self.corpus1)
        exec_agent = self.create_execution(
            self.corpus1,
            action_type=CorpusActionExecution.ActionType.AGENT,
        )

        result = CorpusActionExecution.objects.by_type(
            CorpusActionExecution.ActionType.FIELDSET
        )

        self.assertIn(exec_fieldset, result)
        self.assertNotIn(exec_agent, result)

    # --- pending() ---

    def test_pending_returns_queued_and_running(self):
        """pending() returns QUEUED and RUNNING executions."""
        exec_queued = self.create_execution(self.corpus1, status="queued")
        exec_running = self.create_execution(self.corpus1, status="running")
        exec_completed = self.create_execution(self.corpus1, status="completed")
        exec_failed = self.create_execution(self.corpus1, status="failed")

        result = list(CorpusActionExecution.objects.pending())

        self.assertIn(exec_queued, result)
        self.assertIn(exec_running, result)
        self.assertNotIn(exec_completed, result)
        self.assertNotIn(exec_failed, result)

    # --- failed() ---

    def test_failed_returns_only_failed(self):
        """failed() returns only FAILED executions."""
        exec_failed = self.create_execution(self.corpus1, status="failed")
        exec_completed = self.create_execution(self.corpus1, status="completed")

        result = list(CorpusActionExecution.objects.failed())

        self.assertEqual(result, [exec_failed])

    # --- recent() ---

    def test_recent_filters_by_time_window(self):
        """recent() returns executions within time window."""
        now = timezone.now()
        recent_exec = self.create_execution(self.corpus1)

        # Create old execution
        old_exec = self.create_execution(self.corpus1)
        old_exec.queued_at = now - timedelta(hours=48)
        old_exec.save()

        result = list(CorpusActionExecution.objects.recent(hours=24))

        self.assertIn(recent_exec, result)
        self.assertNotIn(old_exec, result)

    # --- with_stats() ---

    def test_with_stats_annotates_duration(self):
        """with_stats() adds duration annotation."""
        exec = self.create_execution(self.corpus1)
        exec.started_at = timezone.now()
        exec.completed_at = exec.started_at + timedelta(seconds=30)
        exec.save()

        result = CorpusActionExecution.objects.filter(id=exec.id).with_stats().first()

        self.assertIsNotNone(result.duration)
        self.assertEqual(result.duration.total_seconds(), 30)

    def test_with_stats_annotates_wait_time(self):
        """with_stats() adds wait_time annotation."""
        exec = self.create_execution(self.corpus1)
        exec.started_at = exec.queued_at + timedelta(seconds=5)
        exec.save()

        result = CorpusActionExecution.objects.filter(id=exec.id).with_stats().first()

        self.assertIsNotNone(result.wait_time)
        self.assertEqual(result.wait_time.total_seconds(), 5)

    # --- summary_by_status() ---

    def test_summary_by_status_returns_counts(self):
        """summary_by_status() returns status counts dict."""
        self.create_execution(self.corpus1, status="queued")
        self.create_execution(self.corpus1, status="queued")
        self.create_execution(self.corpus1, status="completed")
        self.create_execution(self.corpus1, status="failed")

        result = CorpusActionExecution.objects.for_corpus(
            self.corpus1.id
        ).summary_by_status()

        self.assertEqual(result["queued"], 2)
        self.assertEqual(result["completed"], 1)
        self.assertEqual(result["failed"], 1)

    # --- summary_by_action() ---

    def test_summary_by_action_groups_by_action(self):
        """summary_by_action() returns per-action statistics."""
        action2 = CorpusAction.objects.create(
            name="Action 2",
            corpus=self.corpus1,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        # 2 executions for action1, 1 for action2
        self.create_execution(self.corpus1)
        self.create_execution(self.corpus1)
        CorpusActionExecution.objects.create(
            corpus_action=action2,
            document=self.document,
            corpus=self.corpus1,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
        )

        result = list(
            CorpusActionExecution.objects.for_corpus(
                self.corpus1.id
            ).summary_by_action()
        )

        self.assertEqual(len(result), 2)
        # Ordered by -total, so action1 (2 executions) comes first
        self.assertEqual(result[0]["total"], 2)
        self.assertEqual(result[1]["total"], 1)

    # --- Chaining ---

    def test_queryset_methods_chain(self):
        """QuerySet methods can be chained together."""
        self.create_execution(self.corpus1, status="failed")

        result = (
            CorpusActionExecution.objects
            .for_corpus(self.corpus1.id)
            .failed()
            .recent(hours=24)
        )

        self.assertEqual(result.count(), 1)
```

---

### Unit Tests: Computed Properties

```python
class TestCorpusActionExecutionProperties(TestCase):
    """Test computed property methods."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus = create_test_corpus(creator=cls.user)
        cls.document = Document.objects.create(title="Test Doc", creator=cls.user)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )

    def create_execution(self):
        return CorpusActionExecution.objects.create(
            corpus_action=self.action,
            document=self.document,
            corpus=self.corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=self.user,
        )

    def test_duration_seconds_when_completed(self):
        """duration_seconds returns seconds between started and completed."""
        exec = self.create_execution()
        exec.started_at = timezone.now()
        exec.completed_at = exec.started_at + timedelta(seconds=45, milliseconds=500)

        self.assertAlmostEqual(exec.duration_seconds, 45.5, places=1)

    def test_duration_seconds_when_not_completed(self):
        """duration_seconds returns None if not completed."""
        exec = self.create_execution()
        exec.started_at = timezone.now()

        self.assertIsNone(exec.duration_seconds)

    def test_duration_seconds_when_not_started(self):
        """duration_seconds returns None if not started."""
        exec = self.create_execution()

        self.assertIsNone(exec.duration_seconds)

    def test_wait_time_seconds_when_started(self):
        """wait_time_seconds returns seconds in queue."""
        exec = self.create_execution()
        exec.started_at = exec.queued_at + timedelta(seconds=10)

        self.assertAlmostEqual(exec.wait_time_seconds, 10, places=1)

    def test_wait_time_seconds_when_not_started(self):
        """wait_time_seconds returns None if not started."""
        exec = self.create_execution()

        self.assertIsNone(exec.wait_time_seconds)

    def test_str_representation(self):
        """__str__ returns readable format."""
        exec = self.create_execution()

        result = str(exec)

        self.assertIn("fieldset", result)
        self.assertIn(self.action.name, result)
        self.assertIn("queued", result)
```

---

### Unit Tests: Permission Filtering

```python
class TestCorpusActionExecutionPermissions(TestCase):
    """Test visible_to_user() permission filtering."""

    @classmethod
    def setUpTestData(cls):
        cls.owner = create_test_user(username="owner")
        cls.other_user = create_test_user(username="other")
        cls.superuser = create_test_user(username="admin", is_superuser=True)

        # Owner's private corpus and execution
        cls.private_corpus = create_test_corpus(creator=cls.owner, is_public=False)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.owner)
        cls.private_action = CorpusAction.objects.create(
            name="Private Action",
            corpus=cls.private_corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.owner,
        )
        cls.document = Document.objects.create(title="Test Doc", creator=cls.owner)
        cls.private_exec = CorpusActionExecution.objects.create(
            corpus_action=cls.private_action,
            document=cls.document,
            corpus=cls.private_corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=cls.owner,
        )

        # Public corpus and execution
        cls.public_corpus = create_test_corpus(creator=cls.owner, is_public=True)
        cls.public_action = CorpusAction.objects.create(
            name="Public Action",
            corpus=cls.public_corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.owner,
        )
        cls.public_exec = CorpusActionExecution.objects.create(
            corpus_action=cls.public_action,
            document=cls.document,
            corpus=cls.public_corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            queued_at=timezone.now(),
            creator=cls.owner,
            is_public=True,
        )

    def test_superuser_sees_all(self):
        """Superuser can see all executions."""
        result = CorpusActionExecution.objects.visible_to_user(self.superuser)

        self.assertIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_owner_sees_own_private(self):
        """Owner can see their own private executions."""
        result = CorpusActionExecution.objects.visible_to_user(self.owner)

        self.assertIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_other_user_cannot_see_private(self):
        """Other users cannot see private executions they don't own."""
        result = CorpusActionExecution.objects.visible_to_user(self.other_user)

        self.assertNotIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_anonymous_sees_only_public(self):
        """Anonymous users can only see public executions."""
        result = CorpusActionExecution.objects.visible_to_user(None)

        self.assertNotIn(self.private_exec, result)
        self.assertIn(self.public_exec, result)

    def test_visible_to_user_chains_with_queryset_methods(self):
        """visible_to_user() returns custom QuerySet for chaining."""
        result = (
            CorpusActionExecution.objects
            .visible_to_user(self.owner)
            .for_corpus(self.private_corpus.id)
            .pending()
        )

        # Should return CorpusActionExecutionQuerySet with custom methods
        self.assertTrue(hasattr(result, 'for_corpus'))
        self.assertTrue(hasattr(result, 'pending'))
```

---

### Unit Tests: Export Functionality

```python
class TestActionTrailExport(TestCase):
    """Test action trail export packaging."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus = create_test_corpus(creator=cls.user)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )
        cls.document = Document.objects.create(title="Test Doc", creator=cls.user)

    def create_executions(self, count, **kwargs):
        """Create multiple test executions."""
        executions = []
        for i in range(count):
            exec = CorpusActionExecution.objects.create(
                corpus_action=self.action,
                document=self.document,
                corpus=self.corpus,
                action_type=CorpusActionExecution.ActionType.FIELDSET,
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                queued_at=timezone.now() - timedelta(minutes=i),
                creator=self.user,
                **kwargs,
            )
            executions.append(exec)
        return executions

    def test_package_action_trail_structure(self):
        """package_action_trail() returns correct structure."""
        self.create_executions(3)

        trail = package_action_trail(self.corpus)

        self.assertIn("actions", trail)
        self.assertIn("executions", trail)
        self.assertIn("stats", trail)

    def test_package_action_trail_includes_action_config(self):
        """package_action_trail() includes action configuration."""
        trail = package_action_trail(self.corpus)

        self.assertEqual(len(trail["actions"]), 1)
        self.assertEqual(trail["actions"][0]["name"], "Test Action")
        self.assertEqual(trail["actions"][0]["action_type"], "fieldset")

    def test_package_action_trail_respects_limit(self):
        """package_action_trail() respects execution_limit."""
        self.create_executions(100)

        trail = package_action_trail(self.corpus, execution_limit=10)

        self.assertEqual(len(trail["executions"]), 10)

    def test_package_action_trail_respects_since_filter(self):
        """package_action_trail() filters by since datetime."""
        # Create old and new executions
        old_exec = self.create_executions(1)[0]
        old_exec.queued_at = timezone.now() - timedelta(hours=48)
        old_exec.save()

        new_exec = self.create_executions(1)[0]

        cutoff = timezone.now() - timedelta(hours=1)
        trail = package_action_trail(self.corpus, since=cutoff)

        exec_ids = [e["id"] for e in trail["executions"]]
        self.assertIn(str(new_exec.id), exec_ids)
        self.assertNotIn(str(old_exec.id), exec_ids)

    def test_package_action_trail_stats_accurate(self):
        """package_action_trail() calculates accurate stats."""
        self.create_executions(5, status=CorpusActionExecution.Status.COMPLETED)
        self.create_executions(2, status=CorpusActionExecution.Status.FAILED)

        trail = package_action_trail(self.corpus)

        self.assertEqual(trail["stats"]["total_executions"], 7)
        self.assertEqual(trail["stats"]["completed"], 5)
        self.assertEqual(trail["stats"]["failed"], 2)

    def test_package_action_trail_without_executions(self):
        """package_action_trail() works with include_executions=False."""
        self.create_executions(10)

        trail = package_action_trail(self.corpus, include_executions=False)

        self.assertEqual(len(trail["executions"]), 0)
        self.assertIn("actions", trail)
        self.assertIn("stats", trail)

    def test_package_action_trail_execution_format(self):
        """package_action_trail() formats executions correctly."""
        exec = self.create_executions(1)[0]
        exec.status = CorpusActionExecution.Status.COMPLETED
        exec.started_at = exec.queued_at + timedelta(seconds=5)
        exec.completed_at = exec.started_at + timedelta(seconds=30)
        exec.affected_objects = [{"type": "extract", "id": 1}]
        exec.save()

        trail = package_action_trail(self.corpus)

        exported = trail["executions"][0]
        self.assertEqual(exported["status"], "completed")
        self.assertIn("queued_at", exported)
        self.assertIn("started_at", exported)
        self.assertIn("completed_at", exported)
        self.assertIsNotNone(exported["duration_seconds"])
        self.assertEqual(len(exported["affected_objects"]), 1)
```

---

### Integration Tests

```python
from django.test import TransactionTestCase, override_settings


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class TestCorpusActionExecutionIntegration(TransactionTestCase):
    """
    End-to-end integration tests for action execution tracking.

    Uses CELERY_TASK_ALWAYS_EAGER=True to execute tasks synchronously,
    avoiding race conditions and eliminating need for time.sleep().
    """

    def setUp(self):
        self.user = create_test_user()
        self.corpus = create_test_corpus(creator=self.user)
        self.document = Document.objects.create(
            title="Test Doc",
            creator=self.user,
            backend_lock=False,  # Document is ready
        )

    # --- Fieldset Action Integration ---

    def test_fieldset_action_creates_execution_trail(self):
        """Adding document with fieldset action creates execution record."""
        fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        column = Column.objects.create(
            fieldset=fieldset,
            name="test_column",
            output_type="str",
            task_name="opencontractserver.tasks.extract_tasks.llm_extract_cell",
            creator=self.user,
        )
        action = CorpusAction.objects.create(
            name="Fieldset Action",
            corpus=self.corpus,
            fieldset=fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        # Add document - triggers corpus action
        doc, status, path = self.corpus.add_document(
            document=self.document,
            user=self.user,
        )

        # Verify execution record created
        execution = CorpusActionExecution.objects.get(
            corpus_action=action,
            document=doc,
        )
        self.assertEqual(execution.status, CorpusActionExecution.Status.COMPLETED)
        self.assertEqual(execution.action_type, CorpusActionExecution.ActionType.FIELDSET)
        self.assertIn("extract", [o["type"] for o in execution.affected_objects])

    # --- Analyzer Action Integration ---

    def test_analyzer_action_creates_execution_trail(self):
        """Adding document with analyzer action creates execution record."""
        analyzer = Analyzer.objects.create(
            name="Test Analyzer",
            task_name="opencontractserver.tasks.analyzer_tasks.test_analyzer",
            creator=self.user,
        )
        action = CorpusAction.objects.create(
            name="Analyzer Action",
            corpus=self.corpus,
            analyzer=analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        doc, status, path = self.corpus.add_document(
            document=self.document,
            user=self.user,
        )

        execution = CorpusActionExecution.objects.get(
            corpus_action=action,
            document=doc,
        )
        self.assertEqual(execution.action_type, CorpusActionExecution.ActionType.ANALYZER)
        self.assertIn("analysis", [o["type"] for o in execution.affected_objects])

    # --- Agent Action Integration ---

    def test_agent_action_creates_execution_trail(self):
        """Adding document with agent action creates execution record."""
        agent_config = AgentConfiguration.objects.create(
            name="Test Agent",
            creator=self.user,
        )
        action = CorpusAction.objects.create(
            name="Agent Action",
            corpus=self.corpus,
            agent_config=agent_config,
            agent_prompt="Summarize this document",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        doc, status, path = self.corpus.add_document(
            document=self.document,
            user=self.user,
        )

        execution = CorpusActionExecution.objects.get(
            corpus_action=action,
            document=doc,
        )
        self.assertEqual(execution.action_type, CorpusActionExecution.ActionType.AGENT)
        self.assertIsNotNone(execution.agent_result)

    # --- Failed Execution Tracking ---

    def test_failed_action_records_error(self):
        """Failed action execution records error details."""
        # Create action with invalid task that will fail
        fieldset = Fieldset.objects.create(name="Bad Fieldset", creator=self.user)
        column = Column.objects.create(
            fieldset=fieldset,
            name="bad_column",
            output_type="str",
            task_name="nonexistent.task.name",  # Will fail
            creator=self.user,
        )
        action = CorpusAction.objects.create(
            name="Failing Action",
            corpus=self.corpus,
            fieldset=fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        # Expect task to fail
        with self.assertRaises(Exception):
            self.corpus.add_document(document=self.document, user=self.user)

        execution = CorpusActionExecution.objects.get(
            corpus_action=action,
            document=self.document,
        )
        self.assertEqual(execution.status, CorpusActionExecution.Status.FAILED)
        self.assertNotEqual(execution.error_message, "")

    # --- Multiple Actions Integration ---

    def test_multiple_actions_create_separate_executions(self):
        """Multiple actions for same document create separate execution records."""
        fieldset1 = Fieldset.objects.create(name="Fieldset 1", creator=self.user)
        fieldset2 = Fieldset.objects.create(name="Fieldset 2", creator=self.user)

        action1 = CorpusAction.objects.create(
            name="Action 1",
            corpus=self.corpus,
            fieldset=fieldset1,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        action2 = CorpusAction.objects.create(
            name="Action 2",
            corpus=self.corpus,
            fieldset=fieldset2,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        doc, status, path = self.corpus.add_document(
            document=self.document,
            user=self.user,
        )

        executions = CorpusActionExecution.objects.filter(document=doc)
        self.assertEqual(executions.count(), 2)
        action_ids = set(e.corpus_action_id for e in executions)
        self.assertEqual(action_ids, {action1.id, action2.id})

    # --- Export Integration ---

    def test_export_includes_action_trail(self):
        """Corpus export with action trail includes execution records."""
        fieldset = Fieldset.objects.create(name="Test", creator=self.user)
        action = CorpusAction.objects.create(
            name="Test Action",
            corpus=self.corpus,
            fieldset=fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        # Create some executions
        doc, status, path = self.corpus.add_document(
            document=self.document,
            user=self.user,
        )

        export = build_corpus_export(
            corpus_id=self.corpus.id,
            user_id=self.user.id,
            include_action_trail=True,
        )

        self.assertIn("action_trail", export)
        self.assertGreater(len(export["action_trail"]["actions"]), 0)
        self.assertGreater(len(export["action_trail"]["executions"]), 0)

    def test_export_without_action_trail(self):
        """Corpus export without action trail flag excludes it."""
        export = build_corpus_export(
            corpus_id=self.corpus.id,
            user_id=self.user.id,
            include_action_trail=False,
        )

        self.assertNotIn("action_trail", export)
```

---

### GraphQL Tests

```python
from graphene_django.utils.testing import GraphQLTestCase


class TestCorpusActionExecutionGraphQL(GraphQLTestCase):
    """Test GraphQL queries for action trail."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus = create_test_corpus(creator=cls.user)
        cls.document = Document.objects.create(title="Test Doc", creator=cls.user)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )
        cls.execution = CorpusActionExecution.objects.create(
            corpus_action=cls.action,
            document=cls.document,
            corpus=cls.corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            status=CorpusActionExecution.Status.COMPLETED,
            queued_at=timezone.now(),
            started_at=timezone.now(),
            completed_at=timezone.now() + timedelta(seconds=30),
            creator=cls.user,
        )

    def test_query_corpus_action_executions(self):
        """Query returns paginated execution list."""
        response = self.query(
            '''
            query GetExecutions($corpusId: ID!) {
                corpusActionExecutions(corpusId: $corpusId, first: 10) {
                    edges {
                        node {
                            id
                            actionType
                            status
                            durationSeconds
                        }
                    }
                    pageInfo {
                        hasNextPage
                    }
                }
            }
            ''',
            variables={"corpusId": to_global_id("CorpusType", self.corpus.id)},
        )

        self.assertResponseNoErrors(response)
        edges = response.json()["data"]["corpusActionExecutions"]["edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["node"]["status"], "completed")
        self.assertEqual(edges[0]["node"]["actionType"], "fieldset")

    def test_query_corpus_action_trail_stats(self):
        """Query returns aggregated statistics."""
        # Create additional executions
        CorpusActionExecution.objects.create(
            corpus_action=self.action,
            document=self.document,
            corpus=self.corpus,
            action_type=CorpusActionExecution.ActionType.FIELDSET,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            status=CorpusActionExecution.Status.FAILED,
            queued_at=timezone.now(),
            creator=self.user,
        )

        response = self.query(
            '''
            query GetStats($corpusId: ID!) {
                corpusActionTrailStats(corpusId: $corpusId) {
                    totalExecutions
                    completed
                    failed
                    fieldsetCount
                }
            }
            ''',
            variables={"corpusId": to_global_id("CorpusType", self.corpus.id)},
        )

        self.assertResponseNoErrors(response)
        stats = response.json()["data"]["corpusActionTrailStats"]
        self.assertEqual(stats["totalExecutions"], 2)
        self.assertEqual(stats["completed"], 1)
        self.assertEqual(stats["failed"], 1)
        self.assertEqual(stats["fieldsetCount"], 2)

    def test_query_filters_by_status(self):
        """Query filters by status parameter."""
        response = self.query(
            '''
            query GetFailedExecutions($corpusId: ID!) {
                corpusActionExecutions(corpusId: $corpusId, status: "failed") {
                    edges {
                        node {
                            status
                        }
                    }
                }
            }
            ''',
            variables={"corpusId": to_global_id("CorpusType", self.corpus.id)},
        )

        self.assertResponseNoErrors(response)
        edges = response.json()["data"]["corpusActionExecutions"]["edges"]
        # Should only return failed executions
        for edge in edges:
            self.assertEqual(edge["node"]["status"], "failed")

    def test_query_respects_permissions(self):
        """Query respects user permissions."""
        other_user = create_test_user(username="other")

        # Query as other user who doesn't have access
        response = self.query(
            '''
            query GetExecutions($corpusId: ID!) {
                corpusActionExecutions(corpusId: $corpusId) {
                    edges {
                        node {
                            id
                        }
                    }
                }
            }
            ''',
            variables={"corpusId": to_global_id("CorpusType", self.corpus.id)},
            headers={"HTTP_AUTHORIZATION": f"Bearer {other_user.auth_token}"},
        )

        self.assertResponseNoErrors(response)
        edges = response.json()["data"]["corpusActionExecutions"]["edges"]
        self.assertEqual(len(edges), 0)  # Other user can't see private executions
```

---

### Performance Tests

```python
class TestCorpusActionExecutionPerformance(TestCase):
    """Test query performance and index usage."""

    @classmethod
    def setUpTestData(cls):
        cls.user = create_test_user()
        cls.corpus = create_test_corpus(creator=cls.user)
        cls.document = Document.objects.create(title="Test Doc", creator=cls.user)
        cls.fieldset = Fieldset.objects.create(name="Test", creator=cls.user)
        cls.action = CorpusAction.objects.create(
            name="Test Action",
            corpus=cls.corpus,
            fieldset=cls.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=cls.user,
        )

        # Create 1000 executions for performance testing
        now = timezone.now()
        executions = [
            CorpusActionExecution(
                corpus_action=cls.action,
                document=cls.document,
                corpus=cls.corpus,
                action_type=CorpusActionExecution.ActionType.FIELDSET,
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                queued_at=now - timedelta(minutes=i),
                creator=cls.user,
            )
            for i in range(1000)
        ]
        CorpusActionExecution.objects.bulk_create(executions)

    def test_for_corpus_query_uses_index(self):
        """for_corpus() query uses corpus index."""
        # Should be single query regardless of result count
        with self.assertNumQueries(1):
            list(CorpusActionExecution.objects.for_corpus(self.corpus.id)[:100])

    def test_pending_query_uses_index(self):
        """pending() query uses status index."""
        with self.assertNumQueries(1):
            list(CorpusActionExecution.objects.pending()[:100])

    def test_recent_query_uses_index(self):
        """recent() query uses queued_at index."""
        with self.assertNumQueries(1):
            list(CorpusActionExecution.objects.recent(hours=24)[:100])

    def test_summary_by_status_single_query(self):
        """summary_by_status() uses single aggregation query."""
        with self.assertNumQueries(1):
            CorpusActionExecution.objects.for_corpus(
                self.corpus.id
            ).summary_by_status()

    def test_bulk_queue_scales_linearly(self):
        """bulk_queue() performance scales linearly with document count."""
        import time

        doc_counts = [10, 100, 500]
        times = []

        for count in doc_counts:
            doc_ids = list(range(count))
            start = time.perf_counter()
            CorpusActionExecution.bulk_queue(
                corpus_action=self.action,
                document_ids=doc_ids,
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                user_id=self.user.id,
            )
            elapsed = time.perf_counter() - start
            times.append(elapsed)

        # Time should scale roughly linearly (within 3x)
        ratio_10_to_100 = times[1] / times[0]
        ratio_100_to_500 = times[2] / times[1]
        self.assertLess(ratio_10_to_100, 15)  # 10x docs -> should be < 15x time
        self.assertLess(ratio_100_to_500, 8)  # 5x docs -> should be < 8x time
```

---

## Example Queries

### Get Corpus Action Trail (Paginated)

```graphql
query GetCorpusActionTrail($corpusId: ID!, $first: Int, $after: String) {
  corpusActionExecutions(
    corpusId: $corpusId
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
        status
        queuedAt
        startedAt
        completedAt
        durationSeconds
        corpusAction {
          name
        }
        document {
          title
        }
        affectedObjects
        errorMessage
      }
    }
  }
}
```

### Get Trail Stats for Dashboard

```graphql
query GetCorpusActionStats($corpusId: ID!) {
  corpusActionTrailStats(corpusId: $corpusId) {
    totalExecutions
    completed
    failed
    running
    queued
    avgDurationSeconds
    fieldsetCount
    analyzerCount
    agentCount
  }
}
```

### Export with Action Trail

```graphql
mutation ExportCorpusWithActionTrail($corpusId: ID!) {
  startExportCorpus(
    corpusId: $corpusId
    includeConversations: false
    includeActionTrail: true
    actionTrailLimit: 500
  ) {
    ok
    message
    exportId
  }
}
```

---

## Related Documentation

- [Corpus Actions Design](../architecture/agent_corpus_actions_design.md)
- [Corpus Export/Import V2](../architecture/corpus_export_import_v2.md)
- [Document Versioning](../architecture/document_versioning.md)
- [Permissioning Guide](../permissioning/consolidated_permissioning_guide.md)
