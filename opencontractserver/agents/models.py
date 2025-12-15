from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q
from django.utils.text import slugify
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.shared.Managers import BaseVisibilityManager
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()


class AgentConfigurationQuerySet(models.QuerySet):
    """QuerySet with permission filtering for AgentConfiguration."""

    def visible_to_user(self, user):
        """
        Return agents visible to the user:
        - All active global agents (public)
        - Corpus agents for corpuses the user can access
        """
        from opencontractserver.corpuses.models import Corpus

        if not user or not user.is_authenticated:
            # Anonymous users see only active global agents
            return self.filter(scope="GLOBAL", is_active=True)

        if user.is_superuser:
            # Superusers see all agents
            return self.all()

        # Authenticated users see:
        # 1. All active global agents
        # 2. Corpus agents for corpuses they can access
        accessible_corpuses = Corpus.objects.visible_to_user(user)

        return self.filter(
            Q(scope="GLOBAL", is_active=True)
            | Q(scope="CORPUS", is_active=True, corpus__in=accessible_corpuses)
        ).distinct()


class AgentConfigurationManager(BaseVisibilityManager):
    """Manager for AgentConfiguration with permission filtering."""

    def get_queryset(self):
        return AgentConfigurationQuerySet(self.model, using=self._db)

    def visible_to_user(self, user):
        """Override to use AgentConfigurationQuerySet's visible_to_user method."""
        return self.get_queryset().visible_to_user(user)


class AgentConfiguration(BaseOCModel):
    """
    Defines a bot/agent that can participate in conversations.
    Can be scoped globally or to a specific corpus.
    """

    SCOPE_CHOICES = (
        ("GLOBAL", "Global"),
        ("CORPUS", "Corpus-specific"),
    )

    # Identity
    name = models.CharField(max_length=255, help_text="Display name for this agent")
    slug = models.SlugField(
        max_length=128,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="URL-friendly identifier for mentions (e.g., 'research-assistant')",
    )
    description = models.TextField(
        blank=True, help_text="Description of agent's purpose and capabilities"
    )

    # Behavior
    system_instructions = models.TextField(
        help_text="System prompt/instructions for this agent"
    )
    available_tools = models.JSONField(
        default=list,
        help_text="List of tool identifiers this agent can use (e.g., ['similarity_search', 'load_document_text'])",
    )
    permission_required_tools = models.JSONField(
        default=list,
        help_text="Subset of tools that require explicit user permission to use",
    )

    # Display
    badge_config = models.JSONField(
        default=dict,
        help_text="Visual config: {'icon': 'bot', 'color': '#4A90E2', 'label': 'AI Assistant'}",
    )
    avatar_url = models.URLField(
        blank=True,
        null=True,
        help_text="URL to agent's avatar image",
    )

    # Scope
    scope = models.CharField(
        max_length=10,
        choices=SCOPE_CHOICES,
        default="GLOBAL",
    )
    corpus = models.ForeignKey(
        "corpuses.Corpus",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="agents",
        help_text="Corpus this agent belongs to (if scope=CORPUS)",
    )

    # Metadata
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this agent is active and can be used",
    )

    # Manager
    objects = AgentConfigurationManager()

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(scope="GLOBAL", corpus__isnull=True)
                    | Q(scope="CORPUS", corpus__isnull=False)
                ),
                name="agent_scope_corpus_consistency",
            )
        ]
        indexes = [
            models.Index(fields=["scope", "is_active"]),
            models.Index(fields=["corpus", "is_active"]),
        ]
        permissions = (
            ("permission_agentconfiguration", "permission agentconfiguration"),
            ("publish_agentconfiguration", "publish agentconfiguration"),
            ("create_agentconfiguration", "create agentconfiguration"),
            ("read_agentconfiguration", "read agentconfiguration"),
            ("update_agentconfiguration", "update agentconfiguration"),
            ("remove_agentconfiguration", "delete agentconfiguration"),
        )

    def __str__(self):
        scope_label = (
            f" ({self.corpus.title})" if self.scope == "CORPUS" else " (Global)"
        )
        return f"{self.name}{scope_label}"

    def save(self, *args, **kwargs):
        """Auto-generate slug from name if not provided."""
        if not self.slug:
            base_slug = slugify(self.name)
            # Ensure uniqueness by appending a number if needed
            slug = base_slug
            counter = 1
            while (
                AgentConfiguration.objects.filter(slug=slug)
                .exclude(pk=self.pk)
                .exists()
            ):
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)


class AgentConfigurationUserObjectPermission(UserObjectPermissionBase):
    """Permissions for AgentConfiguration objects at the user level."""

    content_object = models.ForeignKey("AgentConfiguration", on_delete=models.CASCADE)


class AgentConfigurationGroupObjectPermission(GroupObjectPermissionBase):
    """Permissions for AgentConfiguration objects at the group level."""

    content_object = models.ForeignKey("AgentConfiguration", on_delete=models.CASCADE)


# --------------------------------------------------------------------------- #
# AgentActionResult - Stores results from agent-based corpus actions
# --------------------------------------------------------------------------- #


class AgentActionResultQuerySet(models.QuerySet):
    """QuerySet with permission filtering for AgentActionResult."""

    def visible_to_user(self, user):
        """
        Return results visible to the user based on corpus permissions.
        Users can see results for corpuses they have access to.
        """
        from opencontractserver.corpuses.models import Corpus

        if not user or not user.is_authenticated:
            # Anonymous users see results for public corpuses only
            return self.filter(corpus_action__corpus__is_public=True)

        if user.is_superuser:
            return self.all()

        # Users see results for corpuses they can access
        accessible_corpuses = Corpus.objects.visible_to_user(user)
        return self.filter(corpus_action__corpus__in=accessible_corpuses).distinct()


class AgentActionResultManager(BaseVisibilityManager):
    """Manager for AgentActionResult with permission filtering."""

    def get_queryset(self):
        return AgentActionResultQuerySet(self.model, using=self._db)

    def visible_to_user(self, user):
        return self.get_queryset().visible_to_user(user)


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
        help_text="The corpus action that triggered this execution",
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.CASCADE,
        related_name="agent_action_results",
        help_text="The document this action was run on",
    )
    conversation = models.ForeignKey(
        "conversations.Conversation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="corpus_action_results",
        help_text="Conversation record containing the full agent interaction",
    )

    # Execution tracking
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Results
    agent_response = models.TextField(
        blank=True,
        help_text="Final response content from the agent",
    )
    tools_executed = models.JSONField(
        default=list,
        blank=True,
        help_text="List of tools executed: [{name, args, result, timestamp}]",
    )
    error_message = models.TextField(
        blank=True,
        help_text="Error message if status is FAILED",
    )

    # Audit trail
    execution_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional execution metadata (model used, token counts, etc.)",
    )

    # Manager
    objects = AgentActionResultManager()

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["corpus_action", "document"]),
            models.Index(fields=["status"]),
            models.Index(fields=["started_at"]),
        ]
        # Unique constraint: one result per (corpus_action, document) combination
        # This prevents duplicate executions for the same action+document
        constraints = [
            models.UniqueConstraint(
                fields=["corpus_action", "document"],
                name="unique_corpus_action_document_result",
            )
        ]
        permissions = (
            ("permission_agentactionresult", "permission agentactionresult"),
            ("publish_agentactionresult", "publish agentactionresult"),
            ("create_agentactionresult", "create agentactionresult"),
            ("read_agentactionresult", "read agentactionresult"),
            ("update_agentactionresult", "update agentactionresult"),
            ("remove_agentactionresult", "delete agentactionresult"),
        )

    def __str__(self):
        return (
            f"AgentActionResult({self.corpus_action.name} on doc {self.document_id}: "
            f"{self.status})"
        )

    @property
    def duration_seconds(self) -> float | None:
        """Calculate execution duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


class AgentActionResultUserObjectPermission(UserObjectPermissionBase):
    """Permissions for AgentActionResult objects at the user level."""

    content_object = models.ForeignKey("AgentActionResult", on_delete=models.CASCADE)


class AgentActionResultGroupObjectPermission(GroupObjectPermissionBase):
    """Permissions for AgentActionResult objects at the group level."""

    content_object = models.ForeignKey("AgentActionResult", on_delete=models.CASCADE)
