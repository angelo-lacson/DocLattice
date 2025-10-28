from typing import Literal

import django
from django.contrib.auth import get_user_model
from django.db import models
from django.forms import ValidationError
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.shared.defaults import jsonfield_default_value
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Managers import BaseVisibilityManager
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()


MessageType = Literal["ASYNC_START", "ASYNC_CONTENT", "ASYNC_FINISH", "SYNC_CONTENT"]


# NEW – persisted lifecycle state so the frontend does not have to
# inspect JSON blobs to determine whether a message is complete, paused…
class MessageStateChoices(models.TextChoices):
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    ERROR = "error", "Error"
    AWAITING_APPROVAL = "awaiting_approval", "Awaiting Approval"


# Conversation types for distinguishing between agent chats and discussion threads
class ConversationTypeChoices(models.TextChoices):
    CHAT = "chat", "Chat"  # Default for agent-based conversations
    THREAD = "thread", "Thread"  # For discussion threads


# Agent types for multi-agent conversation support
class AgentTypeChoices(models.TextChoices):
    DOCUMENT_AGENT = "document_agent", "Document Agent"
    CORPUS_AGENT = "corpus_agent", "Corpus Agent"


# Custom QuerySet for soft delete functionality
class SoftDeleteQuerySet(models.QuerySet):
    """
    QuerySet that filters soft-deleted objects and implements user visibility.
    """

    def visible_to_user(self, user=None):
        """
        Returns queryset filtered to objects visible to the user.
        Maintains soft-delete filtering from the base queryset.
        """
        from django.contrib.auth.models import AnonymousUser
        from django.apps import apps
        from django.db.models import Q

        # Handle None user as anonymous
        if user is None:
            user = AnonymousUser()

        # Start with current queryset (already has soft-delete filtering)
        queryset = self

        # Superusers see everything
        if hasattr(user, "is_superuser") and user.is_superuser:
            return queryset.order_by("created")

        # Anonymous users only see public items
        if user.is_anonymous:
            return queryset.filter(is_public=True)

        # Authenticated users: public, created by them, or explicitly shared
        model_name = self.model._meta.model_name
        app_label = self.model._meta.app_label

        try:
            permission_model_name = f"{model_name}userobjectpermission"
            permission_model_type = apps.get_model(app_label, permission_model_name)
            permitted_ids = permission_model_type.objects.filter(
                permission__codename=f"read_{model_name}", user_id=user.id
            ).values_list("content_object_id", flat=True)

            return queryset.filter(
                Q(creator_id=user.id) | Q(is_public=True) | Q(id__in=permitted_ids)
            )
        except LookupError:
            # Fallback if permission model doesn't exist
            return queryset.filter(Q(creator_id=user.id) | Q(is_public=True))


# Custom manager for soft delete functionality
class SoftDeleteManager(BaseVisibilityManager):
    """
    Manager that filters out soft-deleted objects by default and implements
    user visibility permissions via BaseVisibilityManager.
    Use Model.all_objects to access soft-deleted objects.
    """

    def get_queryset(self):
        # Return our custom queryset, filtered for non-deleted objects
        return SoftDeleteQuerySet(self.model, using=self._db).filter(
            deleted_at__isnull=True
        )


class ConversationUserObjectPermission(UserObjectPermissionBase):
    """
    Permissions for Conversation objects at the user level.
    """

    content_object = django.db.models.ForeignKey(
        "Conversation", on_delete=django.db.models.CASCADE
    )


class ConversationGroupObjectPermission(GroupObjectPermissionBase):
    """
    Permissions for Conversation objects at the group level.
    """

    content_object = django.db.models.ForeignKey(
        "Conversation", on_delete=django.db.models.CASCADE
    )


class Conversation(BaseOCModel):
    """
    Stores high-level information about an agent-based conversation.
    Each conversation can have multiple messages (now renamed to ChatMessage) associated with it.
    Only one of chat_with_corpus or chat_with_document can be set.
    """

    title = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional title for the conversation",
    )
    description = models.TextField(
        blank=True,
        help_text="Optional description for the conversation",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the conversation was created",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when the conversation was last updated",
    )
    conversation_type = models.CharField(
        max_length=32,
        choices=ConversationTypeChoices.choices,
        default=ConversationTypeChoices.CHAT,
        help_text="Type of conversation: chat (agent-based) or thread (discussion)",
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the conversation was soft-deleted",
    )
    chat_with_corpus = models.ForeignKey(
        Corpus,
        on_delete=models.SET_NULL,
        related_name="conversations",
        help_text="The corpus to which this conversation belongs",
        blank=True,
        null=True,
    )
    chat_with_document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        related_name="conversations",
        help_text="The document to which this conversation belongs",
        blank=True,
        null=True,
    )

    # Managers
    objects = SoftDeleteManager()  # Default manager excludes soft-deleted
    all_objects = models.Manager()  # Access all objects including soft-deleted

    class Meta:
        constraints = [
            django.db.models.CheckConstraint(
                check=django.db.models.Q(chat_with_corpus__isnull=True)
                | django.db.models.Q(chat_with_document__isnull=True),
                name="one_chat_field_null_constraint",
            ),
        ]
        permissions = (
            ("permission_conversation", "permission conversation"),
            ("publish_conversation", "publish conversation"),
            ("create_conversation", "create conversation"),
            ("read_conversation", "read conversation"),
            ("update_conversation", "update conversation"),
            ("remove_conversation", "delete conversation"),
            ("comment_conversation", "comment conversation"),
        )

    def clean(self):
        """
        Ensure that only one of chat_with_corpus or chat_with_document is set.
        """
        if self.chat_with_corpus and self.chat_with_document:
            raise ValidationError(
                "Only one of chat_with_corpus or chat_with_document can be set."
            )

    def __str__(self) -> str:
        return f"Conversation {self.pk} - {self.title if self.title else 'Untitled'}"


class ChatMessage(BaseOCModel):
    """
    Represents a single chat message within an agent conversation.
    ChatMessages follow a standardized format to indicate their type,
    content, and any additional data.
    """

    class Meta:
        permissions = (
            ("permission_chatmessage", "permission chatmessage"),
            ("publish_chatmessage", "publish chatmessage"),
            ("create_chatmessage", "create chatmessage"),
            ("read_chatmessage", "read chatmessage"),
            ("update_chatmessage", "update chatmessage"),
            ("remove_chatmessage", "delete chatmessage"),
            ("comment_chatmessage", "comment chatmessage"),
        )

    TYPE_CHOICES = (
        ("SYSTEM", "SYSTEM"),
        ("HUMAN", "HUMAN"),
        ("LLM", "LLM"),
    )

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="chat_messages",
        help_text="The conversation to which this chat message belongs",
    )
    msg_type = models.CharField(
        max_length=32,
        choices=TYPE_CHOICES,
        help_text="The type of message (SYSTEM, HUMAN, or LLM)",
    )
    agent_type = models.CharField(
        max_length=32,
        choices=AgentTypeChoices.choices,
        blank=True,
        null=True,
        help_text="The specific agent type that generated this message (for LLM messages)",
    )
    parent_message = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="replies",
        blank=True,
        null=True,
        help_text="Parent message for threaded replies",
    )
    content = models.TextField(
        help_text="The textual content of the chat message",
    )
    data = NullableJSONField(
        default=jsonfield_default_value,
        null=True,
        blank=True,
        help_text="Additional data associated with the chat message (stored as JSON)",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the chat message was created",
    )
    deleted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the message was soft-deleted",
    )

    source_document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        related_name="chat_messages",
        help_text="A document that this chat message is based on",
        blank=True,
        null=True,
    )
    source_annotations = models.ManyToManyField(
        Annotation,
        related_name="chat_messages",
        help_text="Annotations that this chat message is based on",
        blank=True,
    )
    created_annotations = models.ManyToManyField(
        Annotation,
        related_name="created_by_chat_message",
        help_text="Annotations that this chat message created",
        blank=True,
    )

    state = models.CharField(
        max_length=32,
        choices=MessageStateChoices.choices,
        default=MessageStateChoices.COMPLETED,
        help_text="Lifecycle state of the message for quick filtering",
    )

    # Managers
    objects = SoftDeleteManager()  # Default manager excludes soft-deleted
    all_objects = models.Manager()  # Access all objects including soft-deleted

    def __str__(self) -> str:
        return (
            f"ChatMessage {self.pk} - {self.msg_type} "
            f"in conversation {self.conversation.pk}"
        )

    # (compatibility alias added below, outside the class body)


class ChatMessageUserObjectPermission(UserObjectPermissionBase):
    """
    Permissions for ChatMessage objects at the user level.
    """

    content_object = django.db.models.ForeignKey(
        "ChatMessage", on_delete=django.db.models.CASCADE
    )


class ChatMessageGroupObjectPermission(GroupObjectPermissionBase):
    """
    Permissions for ChatMessage objects at the group level.
    """

    content_object = django.db.models.ForeignKey(
        "ChatMessage", on_delete=django.db.models.CASCADE
    )


# --------------------------------------------------------------------------- #
# Backwards-compatibility: older code expects ``ChatMessage.MessageStateChoices``
# as an attribute on the model *after* import.  We expose the alias after the
# class is fully defined to avoid NameError during class construction.
# --------------------------------------------------------------------------- #

ChatMessage.MessageStateChoices = MessageStateChoices  # type: ignore[attr-defined]
