"""
GraphQL mutations for thread support in conversations.

This module provides mutations for creating and managing discussion threads:
- CreateThreadMutation: Create new thread conversation
- CreateThreadMessageMutation: Post message to thread
- ReplyToMessageMutation: Create nested reply
- DeleteConversationMutation: Soft delete thread
- DeleteMessageMutation: Soft delete message
"""

import logging

import graphene
from django.utils import timezone
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.graphene_types import ConversationType, MessageType
from config.graphql.ratelimits import RateLimits, graphql_ratelimit
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import (
    set_permissions_for_obj_to_user,
    user_has_permission_for_obj,
)

logger = logging.getLogger(__name__)


class CreateThreadMutation(graphene.Mutation):
    """Create a new discussion thread in a corpus."""

    class Arguments:
        corpus_id = graphene.String(
            required=True, description="ID of the corpus for this thread"
        )
        title = graphene.String(required=True, description="Title of the thread")
        description = graphene.String(
            required=False, description="Optional description"
        )
        initial_message = graphene.String(
            required=True, description="Initial message content"
        )

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(ConversationType)

    @login_required
    @graphql_ratelimit(rate="10/h")
    def mutate(root, info, corpus_id, title, initial_message, description=None):
        ok = False
        obj = None
        message = ""

        try:
            user = info.context.user
            corpus_pk = from_global_id(corpus_id)[1]
            corpus = Corpus.objects.get(pk=corpus_pk)

            # Check if user has permission to access the corpus
            if not user_has_permission_for_obj(user, corpus, PermissionTypes.READ):
                return CreateThreadMutation(
                    ok=False,
                    message="You do not have permission to create threads in this corpus",
                    obj=None,
                )

            # Create the conversation with THREAD type
            conversation = Conversation.objects.create(
                title=title,
                description=description or "",
                conversation_type="thread",
                chat_with_corpus=corpus,
                creator=user,
            )

            # Set permissions for the creator
            set_permissions_for_obj_to_user(user, conversation, [PermissionTypes.CRUD])

            # Create the initial message
            ChatMessage.objects.create(
                conversation=conversation,
                msg_type="HUMAN",
                content=initial_message,
                creator=user,
            )

            ok = True
            message = "Thread created successfully"
            obj = conversation

        except Corpus.DoesNotExist:
            message = "Corpus not found"
        except Exception as e:
            logger.error(f"Error creating thread: {e}")
            message = f"Failed to create thread: {str(e)}"

        return CreateThreadMutation(ok=ok, message=message, obj=obj)


class CreateThreadMessageMutation(graphene.Mutation):
    """Post a new message to an existing thread."""

    class Arguments:
        conversation_id = graphene.String(
            required=True, description="ID of the conversation/thread"
        )
        content = graphene.String(required=True, description="Message content")

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(MessageType)

    @login_required
    @graphql_ratelimit(rate="30/m")
    def mutate(root, info, conversation_id, content):
        ok = False
        obj = None
        message = ""

        try:
            user = info.context.user
            conversation_pk = from_global_id(conversation_id)[1]
            conversation = Conversation.objects.get(pk=conversation_pk)

            # Check if conversation is locked
            if conversation.is_locked:
                return CreateThreadMessageMutation(
                    ok=False,
                    message="This thread is locked and cannot accept new messages",
                    obj=None,
                )

            # Check if user has permission to read the conversation (can post if can read)
            if not user_has_permission_for_obj(
                user, conversation, PermissionTypes.READ
            ):
                return CreateThreadMessageMutation(
                    ok=False,
                    message="You do not have permission to post in this thread",
                    obj=None,
                )

            # Create the message
            chat_message = ChatMessage.objects.create(
                conversation=conversation,
                msg_type="HUMAN",
                content=content,
                creator=user,
            )

            # Set permissions for the creator
            set_permissions_for_obj_to_user(user, chat_message, [PermissionTypes.CRUD])

            ok = True
            message = "Message posted successfully"
            obj = chat_message

        except Conversation.DoesNotExist:
            message = "Conversation not found"
        except Exception as e:
            logger.error(f"Error creating message: {e}")
            message = f"Failed to create message: {str(e)}"

        return CreateThreadMessageMutation(ok=ok, message=message, obj=obj)


class ReplyToMessageMutation(graphene.Mutation):
    """Create a nested reply to an existing message."""

    class Arguments:
        parent_message_id = graphene.String(
            required=True, description="ID of the parent message"
        )
        content = graphene.String(required=True, description="Reply content")

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(MessageType)

    @login_required
    @graphql_ratelimit(rate="30/m")
    def mutate(root, info, parent_message_id, content):
        ok = False
        obj = None
        message = ""

        try:
            user = info.context.user
            parent_pk = from_global_id(parent_message_id)[1]
            parent_message = ChatMessage.objects.get(pk=parent_pk)
            conversation = parent_message.conversation

            # Check if conversation is locked
            if conversation.is_locked:
                return ReplyToMessageMutation(
                    ok=False,
                    message="This thread is locked and cannot accept new messages",
                    obj=None,
                )

            # Check if user has permission to read the conversation
            if not user_has_permission_for_obj(
                user, conversation, PermissionTypes.READ
            ):
                return ReplyToMessageMutation(
                    ok=False,
                    message="You do not have permission to reply in this thread",
                    obj=None,
                )

            # Create the reply message
            reply_message = ChatMessage.objects.create(
                conversation=conversation,
                msg_type="HUMAN",
                content=content,
                parent_message=parent_message,
                creator=user,
            )

            # Set permissions for the creator
            set_permissions_for_obj_to_user(user, reply_message, [PermissionTypes.CRUD])

            ok = True
            message = "Reply posted successfully"
            obj = reply_message

        except ChatMessage.DoesNotExist:
            message = "Parent message not found"
        except Exception as e:
            logger.error(f"Error creating reply: {e}")
            message = f"Failed to create reply: {str(e)}"

        return ReplyToMessageMutation(ok=ok, message=message, obj=obj)


class DeleteConversationMutation(graphene.Mutation):
    """Soft delete a conversation/thread."""

    class Arguments:
        conversation_id = graphene.String(
            required=True, description="ID of the conversation to delete"
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    @graphql_ratelimit(rate=RateLimits.WRITE_LIGHT)
    def mutate(root, info, conversation_id):
        ok = False
        message = ""

        try:
            user = info.context.user
            conversation_pk = from_global_id(conversation_id)[1]
            conversation = Conversation.objects.get(pk=conversation_pk)

            # Check if user has permission to delete
            # Either the creator or someone with delete permission can delete
            if not user_has_permission_for_obj(
                user, conversation, PermissionTypes.DELETE
            ):
                # Also allow moderators to delete
                if not conversation.can_moderate(user):
                    return DeleteConversationMutation(
                        ok=False,
                        message="You do not have permission to delete this conversation",
                    )

            # Soft delete the conversation
            conversation.deleted_at = timezone.now()
            conversation.save(update_fields=["deleted_at"])

            ok = True
            message = "Conversation deleted successfully"

        except Conversation.DoesNotExist:
            message = "Conversation not found"
        except Exception as e:
            logger.error(f"Error deleting conversation: {e}")
            message = f"Failed to delete conversation: {str(e)}"

        return DeleteConversationMutation(ok=ok, message=message)


class DeleteMessageMutation(graphene.Mutation):
    """Soft delete a message."""

    class Arguments:
        message_id = graphene.String(
            required=True, description="ID of the message to delete"
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    @graphql_ratelimit(rate=RateLimits.WRITE_LIGHT)
    def mutate(root, info, message_id):
        ok = False
        message = ""

        try:
            user = info.context.user
            message_pk = from_global_id(message_id)[1]
            chat_message = ChatMessage.objects.get(pk=message_pk)
            conversation = chat_message.conversation

            # Check if user has permission to delete
            # Either the creator or someone with delete permission can delete
            if not user_has_permission_for_obj(
                user, chat_message, PermissionTypes.DELETE
            ):
                # Also allow moderators to delete
                if not conversation.can_moderate(user):
                    return DeleteMessageMutation(
                        ok=False,
                        message="You do not have permission to delete this message",
                    )

            # Soft delete the message
            chat_message.deleted_at = timezone.now()
            chat_message.save(update_fields=["deleted_at"])

            ok = True
            message = "Message deleted successfully"

        except ChatMessage.DoesNotExist:
            message = "Message not found"
        except Exception as e:
            logger.error(f"Error deleting message: {e}")
            message = f"Failed to delete message: {str(e)}"

        return DeleteMessageMutation(ok=ok, message=message)
