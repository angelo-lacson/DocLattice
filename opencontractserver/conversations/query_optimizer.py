"""
Query optimizer for conversation visibility checks.

Provides helper methods with request-level caching to efficiently check
conversation visibility and retrieve threads for corpus/document contexts.

This module implements the bifurcated permission model:
- CHAT type: Restrictive (creator + explicit permissions + public)
- THREAD type: Context-based (inherits visibility from corpus/document)
"""

from typing import Optional

from django.contrib.auth.models import AbstractUser, AnonymousUser
from django.db.models import QuerySet


class ConversationQueryOptimizer:
    """
    Helper class for optimized conversation visibility queries.

    Provides caching at the instance level for repeated visibility checks
    within a single request context. Create one instance per request and
    reuse it for all conversation visibility operations.

    Usage:
        optimizer = ConversationQueryOptimizer(user)
        if optimizer.check_conversation_visibility(conversation_id):
            # User can see this conversation
            pass
        threads = optimizer.get_threads_for_corpus(corpus_id)
    """

    def __init__(self, user: Optional[AbstractUser] = None):
        """
        Initialize optimizer with user context.

        Args:
            user: The user to check visibility for. If None, treated as anonymous.
        """
        self.user = user if user is not None else AnonymousUser()
        self._visible_conversation_ids_cache: Optional[set] = None

    @property
    def _is_superuser(self) -> bool:
        """Check if the user is a superuser."""
        return hasattr(self.user, "is_superuser") and self.user.is_superuser

    def _get_visible_conversation_ids(self) -> set:
        """
        Get set of conversation IDs visible to the user (cached).

        Note: For superusers, returns empty set. Callers should check
        _is_superuser first and bypass set membership checks entirely.

        Returns:
            Set of conversation IDs the user can see, or empty set for superusers.
        """
        if self._visible_conversation_ids_cache is None:
            from opencontractserver.conversations.models import Conversation

            if self._is_superuser:
                # Superusers see all - skip caching to avoid memory overhead
                self._visible_conversation_ids_cache = set()
            else:
                self._visible_conversation_ids_cache = set(
                    Conversation.objects.visible_to_user(self.user).values_list(
                        "id", flat=True
                    )
                )
        return self._visible_conversation_ids_cache

    def check_conversation_visibility(self, conversation_id: int) -> bool:
        """
        Check if user can see a specific conversation (IDOR-safe).

        This method is safe to use in mutation resolvers where you need
        to verify access without revealing whether the object exists.

        Args:
            conversation_id: The ID of the conversation to check.

        Returns:
            True if user can see the conversation, False otherwise.
            Returns False for both non-existent and inaccessible conversations.
        """
        from opencontractserver.conversations.models import Conversation

        if self._is_superuser:
            # Superusers see all - just check existence
            return Conversation.objects.filter(id=conversation_id).exists()
        return conversation_id in self._get_visible_conversation_ids()

    def get_threads_for_corpus(self, corpus_id: int) -> QuerySet:
        """
        Get all visible THREAD conversations for a corpus.

        Args:
            corpus_id: The corpus ID to get threads for.

        Returns:
            QuerySet of Conversation objects (THREAD type only) visible
            to the user and linked to the specified corpus.
        """
        from opencontractserver.conversations.models import (
            Conversation,
            ConversationTypeChoices,
        )

        return (
            Conversation.objects.visible_to_user(self.user)
            .filter(
                conversation_type=ConversationTypeChoices.THREAD,
                chat_with_corpus_id=corpus_id,
            )
            .order_by("-is_pinned", "-created")
        )

    def get_threads_for_document(self, document_id: int) -> QuerySet:
        """
        Get all visible THREAD conversations for a document.

        Args:
            document_id: The document ID to get threads for.

        Returns:
            QuerySet of Conversation objects (THREAD type only) visible
            to the user and linked to the specified document.
        """
        from opencontractserver.conversations.models import (
            Conversation,
            ConversationTypeChoices,
        )

        return (
            Conversation.objects.visible_to_user(self.user)
            .filter(
                conversation_type=ConversationTypeChoices.THREAD,
                chat_with_document_id=document_id,
            )
            .order_by("-is_pinned", "-created")
        )

    def get_chats_for_user(self) -> QuerySet:
        """
        Get all CHAT conversations created by or shared with the user.

        Returns:
            QuerySet of Conversation objects (CHAT type only) visible
            to the user.
        """
        from opencontractserver.conversations.models import (
            Conversation,
            ConversationTypeChoices,
        )

        return (
            Conversation.objects.visible_to_user(self.user)
            .filter(conversation_type=ConversationTypeChoices.CHAT)
            .order_by("-created")
        )

    def invalidate_caches(self) -> None:
        """
        Invalidate all cached data.

        Call this if the underlying permissions have changed during
        the request lifecycle.
        """
        self._visible_conversation_ids_cache = None


def get_request_optimizer(request) -> ConversationQueryOptimizer:
    """
    Get or create a ConversationQueryOptimizer for the current request.

    Caches the optimizer on the request object to reuse within the same
    request lifecycle.

    Args:
        request: The Django/GraphQL request object.

    Returns:
        ConversationQueryOptimizer instance for the request's user.
    """
    cache_key = "_conversation_query_optimizer"
    if not hasattr(request, cache_key):
        user = getattr(request, "user", None)
        setattr(request, cache_key, ConversationQueryOptimizer(user))
    return getattr(request, cache_key)
