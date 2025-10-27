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


# Custom manager for soft delete functionality
class SoftDeleteManager(models.Manager):
    """
    Manager that filters out soft-deleted objects by default.
    Use Model.all_objects to access soft-deleted objects.
    """

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


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

    # Voting denormalized counts for performance
    upvote_count = models.IntegerField(
        default=0,
        help_text="Cached count of upvotes for this message",
    )
    downvote_count = models.IntegerField(
        default=0,
        help_text="Cached count of downvotes for this message",
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
# Voting System Models
# --------------------------------------------------------------------------- #


class VoteType(models.TextChoices):
    """Vote type choices for upvote/downvote functionality."""

    UPVOTE = "upvote", "Upvote"
    DOWNVOTE = "downvote", "Downvote"


class MessageVote(BaseOCModel):
    """
    Tracks individual votes on chat messages.
    Users can upvote or downvote messages in discussion threads.
    One vote per user per message (can be changed from upvote to downvote).
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["message", "creator"],
                name="one_vote_per_user_per_message",
            )
        ]
        permissions = (
            ("permission_messagevote", "permission messagevote"),
            ("create_messagevote", "create messagevote"),
            ("read_messagevote", "read messagevote"),
            ("update_messagevote", "update messagevote"),
            ("remove_messagevote", "delete messagevote"),
        )
        indexes = [
            models.Index(fields=["message", "vote_type"]),
            models.Index(fields=["creator"]),
        ]

    message = models.ForeignKey(
        ChatMessage,
        on_delete=models.CASCADE,
        related_name="votes",
        help_text="The message being voted on",
    )
    vote_type = models.CharField(
        max_length=16,
        choices=VoteType.choices,
        help_text="Type of vote (upvote or downvote)",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the vote was cast",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when the vote was last changed",
    )

    def __str__(self) -> str:
        return (
            f"{self.vote_type} by {self.creator.username} "
            f"on message {self.message.pk}"
        )


class MessageVoteUserObjectPermission(UserObjectPermissionBase):
    """Permissions for MessageVote objects at the user level."""

    content_object = django.db.models.ForeignKey(
        "MessageVote", on_delete=django.db.models.CASCADE
    )


class MessageVoteGroupObjectPermission(GroupObjectPermissionBase):
    """Permissions for MessageVote objects at the group level."""

    content_object = django.db.models.ForeignKey(
        "MessageVote", on_delete=django.db.models.CASCADE
    )


class UserReputation(BaseOCModel):
    """
    Tracks user reputation scores globally and per-corpus.
    Reputation is calculated based on upvotes/downvotes received on messages.
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "corpus"],
                name="one_reputation_per_user_per_corpus",
            )
        ]
        permissions = (
            ("permission_userreputation", "permission userreputation"),
            ("create_userreputation", "create userreputation"),
            ("read_userreputation", "read userreputation"),
            ("update_userreputation", "update userreputation"),
            ("remove_userreputation", "delete userreputation"),
        )
        indexes = [
            models.Index(fields=["user", "corpus"]),
            models.Index(fields=["reputation_score"]),
        ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="reputation_scores",
        help_text="The user whose reputation is being tracked",
    )
    corpus = models.ForeignKey(
        Corpus,
        on_delete=models.CASCADE,
        related_name="user_reputations",
        blank=True,
        null=True,
        help_text="The corpus for which reputation is tracked (null = global)",
    )
    reputation_score = models.IntegerField(
        default=0,
        help_text="Current reputation score (upvotes - downvotes)",
    )
    total_upvotes_received = models.IntegerField(
        default=0,
        help_text="Total upvotes received across all messages",
    )
    total_downvotes_received = models.IntegerField(
        default=0,
        help_text="Total downvotes received across all messages",
    )
    last_calculated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when reputation was last calculated",
    )

    def __str__(self) -> str:
        corpus_name = self.corpus.title if self.corpus else "Global"
        return f"{self.user.username} - {corpus_name}: {self.reputation_score}"


class UserReputationUserObjectPermission(UserObjectPermissionBase):
    """Permissions for UserReputation objects at the user level."""

    content_object = django.db.models.ForeignKey(
        "UserReputation", on_delete=django.db.models.CASCADE
    )


class UserReputationGroupObjectPermission(GroupObjectPermissionBase):
    """Permissions for UserReputation objects at the group level."""

    content_object = django.db.models.ForeignKey(
        "UserReputation", on_delete=django.db.models.CASCADE
    )


# --------------------------------------------------------------------------- #
# Backwards-compatibility: older code expects ``ChatMessage.MessageStateChoices``
# as an attribute on the model *after* import.  We expose the alias after the
# class is fully defined to avoid NameError during class construction.
# --------------------------------------------------------------------------- #

ChatMessage.MessageStateChoices = MessageStateChoices  # type: ignore[attr-defined]
