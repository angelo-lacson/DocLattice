"""
Comprehensive tests for the moderation system (Epic #555).

Tests cover:
- CorpusModerator model and permissions
- Conversation moderation (lock/unlock, pin/unpin, soft delete/restore)
- ChatMessage moderation (soft delete/restore)
- Permission checks for corpus owners and moderators
- ModerationAction audit trail
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.conversations.models import (
    ChatMessage,
    Conversation,
    ConversationTypeChoices,
    CorpusModerator,
    ModerationAction,
    ModerationActionType,
    ModeratorPermissionChoices,
)
from opencontractserver.corpuses.models import Corpus

User = get_user_model()


class CorpusModeratorModelTest(TestCase):
    """Test the CorpusModerator model."""

    def setUp(self):
        """Create test users and corpus."""
        self.owner = User.objects.create_user(
            username="owner", password="testpass123"
        )
        self.moderator_user = User.objects.create_user(
            username="moderator", password="testpass123"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="testpass123"
        )
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test corpus for moderation",
            creator=self.owner,
        )

    def test_create_moderator(self):
        """Test creating a corpus moderator with permissions."""
        moderator = CorpusModerator.objects.create(
            corpus=self.corpus,
            user=self.moderator_user,
            permissions=[
                ModeratorPermissionChoices.LOCK_THREADS,
                ModeratorPermissionChoices.PIN_THREADS,
            ],
            assigned_by=self.owner,
            creator=self.owner,
        )

        self.assertEqual(moderator.corpus, self.corpus)
        self.assertEqual(moderator.user, self.moderator_user)
        self.assertEqual(len(moderator.permissions), 2)
        self.assertEqual(moderator.assigned_by, self.owner)

    def test_has_permission_method(self):
        """Test the has_permission helper method."""
        moderator = CorpusModerator.objects.create(
            corpus=self.corpus,
            user=self.moderator_user,
            permissions=[
                ModeratorPermissionChoices.LOCK_THREADS,
                ModeratorPermissionChoices.PIN_THREADS,
            ],
            creator=self.owner,
        )

        self.assertTrue(
            moderator.has_permission(ModeratorPermissionChoices.LOCK_THREADS)
        )
        self.assertTrue(
            moderator.has_permission(ModeratorPermissionChoices.PIN_THREADS)
        )
        self.assertFalse(
            moderator.has_permission(ModeratorPermissionChoices.DELETE_MESSAGES)
        )
        self.assertFalse(
            moderator.has_permission(ModeratorPermissionChoices.DELETE_THREADS)
        )

    def test_unique_constraint_one_moderator_per_user_per_corpus(self):
        """Test that a user can only have one moderator record per corpus."""
        CorpusModerator.objects.create(
            corpus=self.corpus,
            user=self.moderator_user,
            permissions=[ModeratorPermissionChoices.LOCK_THREADS],
            creator=self.owner,
        )

        # Attempting to create another moderator record for the same user/corpus should fail
        with self.assertRaises(Exception):  # IntegrityError
            CorpusModerator.objects.create(
                corpus=self.corpus,
                user=self.moderator_user,
                permissions=[ModeratorPermissionChoices.PIN_THREADS],
                creator=self.owner,
            )

    def test_moderator_str_representation(self):
        """Test the string representation of CorpusModerator."""
        moderator = CorpusModerator.objects.create(
            corpus=self.corpus,
            user=self.moderator_user,
            permissions=[ModeratorPermissionChoices.LOCK_THREADS],
            creator=self.owner,
        )

        expected = f"{self.moderator_user.username} - Moderator of {self.corpus.title}"
        self.assertEqual(str(moderator), expected)


class ConversationModerationTest(TestCase):
    """Test moderation actions on Conversation model."""

    def setUp(self):
        """Create test users, corpus, and conversation."""
        self.owner = User.objects.create_user(
            username="owner", password="testpass123"
        )
        self.moderator_user = User.objects.create_user(
            username="moderator", password="testpass123"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="testpass123"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test corpus for moderation",
            creator=self.owner,
        )

        self.conversation = Conversation.objects.create(
            title="Test Thread",
            description="A discussion thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.owner,
        )

        # Create a moderator with lock and pin permissions
        self.moderator = CorpusModerator.objects.create(
            corpus=self.corpus,
            user=self.moderator_user,
            permissions=[
                ModeratorPermissionChoices.LOCK_THREADS,
                ModeratorPermissionChoices.PIN_THREADS,
                ModeratorPermissionChoices.DELETE_THREADS,
            ],
            creator=self.owner,
        )

    def test_can_moderate_corpus_owner(self):
        """Test that corpus owner can moderate conversations."""
        self.assertTrue(self.conversation.can_moderate(self.owner))

    def test_can_moderate_designated_moderator(self):
        """Test that designated moderators can moderate conversations."""
        self.assertTrue(self.conversation.can_moderate(self.moderator_user))

    def test_can_moderate_regular_user_cannot(self):
        """Test that regular users cannot moderate conversations."""
        self.assertFalse(self.conversation.can_moderate(self.regular_user))

    def test_lock_conversation(self):
        """Test locking a conversation."""
        self.assertFalse(self.conversation.is_locked)
        self.assertIsNone(self.conversation.locked_at)
        self.assertIsNone(self.conversation.locked_by)

        self.conversation.lock(
            self.moderator_user, reason="Violates community guidelines"
        )

        self.conversation.refresh_from_db()
        self.assertTrue(self.conversation.is_locked)
        self.assertIsNotNone(self.conversation.locked_at)
        self.assertEqual(self.conversation.locked_by, self.moderator_user)

        # Check audit trail
        actions = ModerationAction.objects.filter(conversation=self.conversation)
        self.assertEqual(actions.count(), 1)
        action = actions.first()
        self.assertEqual(action.action_type, ModerationActionType.LOCK_THREAD)
        self.assertEqual(action.moderator, self.moderator_user)
        self.assertEqual(action.reason, "Violates community guidelines")

    def test_unlock_conversation(self):
        """Test unlocking a conversation."""
        # First lock it
        self.conversation.lock(self.moderator_user)
        self.assertTrue(self.conversation.is_locked)

        # Now unlock it
        self.conversation.unlock(self.owner, reason="Issue resolved")

        self.conversation.refresh_from_db()
        self.assertFalse(self.conversation.is_locked)
        self.assertIsNone(self.conversation.locked_at)
        self.assertIsNone(self.conversation.locked_by)

        # Check audit trail shows both actions
        actions = ModerationAction.objects.filter(
            conversation=self.conversation
        ).order_by("created_at")
        self.assertEqual(actions.count(), 2)
        self.assertEqual(actions[0].action_type, ModerationActionType.LOCK_THREAD)
        self.assertEqual(actions[1].action_type, ModerationActionType.UNLOCK_THREAD)
        self.assertEqual(actions[1].reason, "Issue resolved")

    def test_lock_permission_denied(self):
        """Test that non-moderators cannot lock conversations."""
        with self.assertRaises(PermissionError) as context:
            self.conversation.lock(self.regular_user)

        self.assertIn("does not have permission to lock", str(context.exception))
        self.assertFalse(self.conversation.is_locked)

    def test_pin_conversation(self):
        """Test pinning a conversation."""
        self.assertFalse(self.conversation.is_pinned)
        self.assertIsNone(self.conversation.pinned_at)
        self.assertIsNone(self.conversation.pinned_by)

        self.conversation.pin(
            self.moderator_user, reason="Important announcement"
        )

        self.conversation.refresh_from_db()
        self.assertTrue(self.conversation.is_pinned)
        self.assertIsNotNone(self.conversation.pinned_at)
        self.assertEqual(self.conversation.pinned_by, self.moderator_user)

        # Check audit trail
        action = ModerationAction.objects.get(conversation=self.conversation)
        self.assertEqual(action.action_type, ModerationActionType.PIN_THREAD)
        self.assertEqual(action.moderator, self.moderator_user)
        self.assertEqual(action.reason, "Important announcement")

    def test_unpin_conversation(self):
        """Test unpinning a conversation."""
        # First pin it
        self.conversation.pin(self.moderator_user)
        self.assertTrue(self.conversation.is_pinned)

        # Now unpin it
        self.conversation.unpin(self.owner)

        self.conversation.refresh_from_db()
        self.assertFalse(self.conversation.is_pinned)
        self.assertIsNone(self.conversation.pinned_at)
        self.assertIsNone(self.conversation.pinned_by)

        # Check audit trail shows both actions
        actions = ModerationAction.objects.filter(
            conversation=self.conversation
        ).order_by("created_at")
        self.assertEqual(actions.count(), 2)
        self.assertEqual(actions[0].action_type, ModerationActionType.PIN_THREAD)
        self.assertEqual(actions[1].action_type, ModerationActionType.UNPIN_THREAD)

    def test_pin_permission_denied(self):
        """Test that non-moderators cannot pin conversations."""
        with self.assertRaises(PermissionError) as context:
            self.conversation.pin(self.regular_user)

        self.assertIn("does not have permission to pin", str(context.exception))
        self.assertFalse(self.conversation.is_pinned)

    def test_soft_delete_thread(self):
        """Test soft-deleting a conversation."""
        self.assertIsNone(self.conversation.deleted_at)

        self.conversation.soft_delete_thread(
            self.moderator_user, reason="Spam content"
        )

        self.conversation.refresh_from_db()
        self.assertIsNotNone(self.conversation.deleted_at)

        # Check audit trail
        action = ModerationAction.objects.get(conversation=self.conversation)
        self.assertEqual(action.action_type, ModerationActionType.DELETE_THREAD)
        self.assertEqual(action.moderator, self.moderator_user)
        self.assertEqual(action.reason, "Spam content")

        # Conversation should not appear in default queryset
        self.assertFalse(
            Conversation.objects.filter(pk=self.conversation.pk).exists()
        )
        # But should appear in all_objects queryset
        self.assertTrue(
            Conversation.all_objects.filter(pk=self.conversation.pk).exists()
        )

    def test_restore_thread(self):
        """Test restoring a soft-deleted conversation."""
        # First soft delete it
        self.conversation.soft_delete_thread(self.moderator_user)
        self.assertIsNotNone(self.conversation.deleted_at)

        # Now restore it
        self.conversation.restore_thread(self.owner, reason="False positive")

        self.conversation.refresh_from_db()
        self.assertIsNone(self.conversation.deleted_at)

        # Check audit trail shows both actions
        actions = ModerationAction.objects.filter(
            conversation=self.conversation
        ).order_by("created_at")
        self.assertEqual(actions.count(), 2)
        self.assertEqual(actions[0].action_type, ModerationActionType.DELETE_THREAD)
        self.assertEqual(actions[1].action_type, ModerationActionType.RESTORE_THREAD)
        self.assertEqual(actions[1].reason, "False positive")

        # Conversation should appear in default queryset again
        self.assertTrue(
            Conversation.objects.filter(pk=self.conversation.pk).exists()
        )

    def test_delete_thread_permission_denied(self):
        """Test that non-moderators cannot delete conversations."""
        with self.assertRaises(PermissionError) as context:
            self.conversation.soft_delete_thread(self.regular_user)

        self.assertIn("does not have permission to delete", str(context.exception))
        self.assertIsNone(self.conversation.deleted_at)

    def test_lock_and_pin_together(self):
        """Test that a conversation can be both locked and pinned."""
        self.conversation.lock(self.moderator_user, reason="Rule violation")
        self.conversation.pin(self.owner, reason="Visibility")

        self.conversation.refresh_from_db()
        self.assertTrue(self.conversation.is_locked)
        self.assertTrue(self.conversation.is_pinned)

        # Check audit trail shows both actions
        actions = ModerationAction.objects.filter(
            conversation=self.conversation
        ).order_by("created_at")
        self.assertEqual(actions.count(), 2)


class ChatMessageModerationTest(TestCase):
    """Test moderation actions on ChatMessage model."""

    def setUp(self):
        """Create test users, corpus, conversation, and message."""
        self.owner = User.objects.create_user(
            username="owner", password="testpass123"
        )
        self.moderator_user = User.objects.create_user(
            username="moderator", password="testpass123"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="testpass123"
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test corpus for moderation",
            creator=self.owner,
        )

        self.conversation = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.owner,
        )

        self.message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="Test message content",
            creator=self.regular_user,
        )

        # Create a moderator with delete permissions
        self.moderator = CorpusModerator.objects.create(
            corpus=self.corpus,
            user=self.moderator_user,
            permissions=[
                ModeratorPermissionChoices.DELETE_MESSAGES,
            ],
            creator=self.owner,
        )

    def test_soft_delete_message(self):
        """Test soft-deleting a message."""
        self.assertIsNone(self.message.deleted_at)

        self.message.soft_delete_message(
            self.moderator_user, reason="Inappropriate content"
        )

        self.message.refresh_from_db()
        self.assertIsNotNone(self.message.deleted_at)

        # Check audit trail
        action = ModerationAction.objects.get(message=self.message)
        self.assertEqual(action.action_type, ModerationActionType.DELETE_MESSAGE)
        self.assertEqual(action.moderator, self.moderator_user)
        self.assertEqual(action.conversation, self.conversation)
        self.assertEqual(action.reason, "Inappropriate content")

        # Message should not appear in default queryset
        self.assertFalse(ChatMessage.objects.filter(pk=self.message.pk).exists())
        # But should appear in all_objects queryset
        self.assertTrue(
            ChatMessage.all_objects.filter(pk=self.message.pk).exists()
        )

    def test_restore_message(self):
        """Test restoring a soft-deleted message."""
        # First soft delete it
        self.message.soft_delete_message(self.moderator_user)
        self.assertIsNotNone(self.message.deleted_at)

        # Now restore it
        self.message.restore_message(self.owner, reason="Reinstated")

        self.message.refresh_from_db()
        self.assertIsNone(self.message.deleted_at)

        # Check audit trail shows both actions
        actions = ModerationAction.objects.filter(message=self.message).order_by(
            "created_at"
        )
        self.assertEqual(actions.count(), 2)
        self.assertEqual(actions[0].action_type, ModerationActionType.DELETE_MESSAGE)
        self.assertEqual(actions[1].action_type, ModerationActionType.RESTORE_MESSAGE)
        self.assertEqual(actions[1].reason, "Reinstated")

        # Message should appear in default queryset again
        self.assertTrue(ChatMessage.objects.filter(pk=self.message.pk).exists())

    def test_delete_message_permission_denied(self):
        """Test that non-moderators cannot delete messages."""
        with self.assertRaises(PermissionError) as context:
            self.message.soft_delete_message(self.regular_user)

        self.assertIn("does not have permission to delete", str(context.exception))
        self.assertIsNone(self.message.deleted_at)

    def test_restore_message_permission_denied(self):
        """Test that non-moderators cannot restore messages."""
        # First delete as moderator
        self.message.soft_delete_message(self.moderator_user)

        # Regular user tries to restore
        with self.assertRaises(PermissionError) as context:
            self.message.restore_message(self.regular_user)

        self.assertIn("does not have permission to restore", str(context.exception))
        self.assertIsNotNone(self.message.deleted_at)

    def test_corpus_owner_can_delete_messages(self):
        """Test that corpus owner can delete messages even without CorpusModerator record."""
        self.message.soft_delete_message(self.owner, reason="Owner moderation")

        self.message.refresh_from_db()
        self.assertIsNotNone(self.message.deleted_at)

        # Check audit trail
        action = ModerationAction.objects.get(message=self.message)
        self.assertEqual(action.moderator, self.owner)


class ModerationActionModelTest(TestCase):
    """Test the ModerationAction model and audit trail."""

    def setUp(self):
        """Create test users, corpus, and conversation."""
        self.owner = User.objects.create_user(
            username="owner", password="testpass123"
        )
        self.corpus = Corpus.objects.create(
            title="Test Corpus", creator=self.owner
        )
        self.conversation = Conversation.objects.create(
            title="Test Thread",
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=self.corpus,
            creator=self.owner,
        )

    def test_moderation_action_str_representation(self):
        """Test the string representation of ModerationAction."""
        action = ModerationAction.objects.create(
            conversation=self.conversation,
            action_type=ModerationActionType.LOCK_THREAD,
            moderator=self.owner,
            reason="Test reason",
            creator=self.owner,
        )

        expected = f"lock_thread on conversation {self.conversation.pk} by {self.owner.username}"
        self.assertEqual(str(action), expected)

    def test_moderation_action_ordering(self):
        """Test that moderation actions are ordered by created_at descending."""
        # Create multiple actions
        action1 = ModerationAction.objects.create(
            conversation=self.conversation,
            action_type=ModerationActionType.LOCK_THREAD,
            moderator=self.owner,
            creator=self.owner,
        )

        action2 = ModerationAction.objects.create(
            conversation=self.conversation,
            action_type=ModerationActionType.PIN_THREAD,
            moderator=self.owner,
            creator=self.owner,
        )

        # Default ordering should be newest first
        actions = ModerationAction.objects.filter(conversation=self.conversation)
        self.assertEqual(actions[0].pk, action2.pk)  # Newest first
        self.assertEqual(actions[1].pk, action1.pk)  # Oldest last

    def test_moderation_action_audit_trail_immutable(self):
        """Test that moderation actions serve as immutable audit trail."""
        ModerationAction.objects.create(
            conversation=self.conversation,
            action_type=ModerationActionType.LOCK_THREAD,
            moderator=self.owner,
            reason="Original reason",
            creator=self.owner,
        )

        # Even if we unlock the conversation, the lock action remains in history
        self.conversation.unlock(self.owner)

        # Both actions should exist
        actions = ModerationAction.objects.filter(
            conversation=self.conversation
        ).order_by("created_at")
        self.assertEqual(actions.count(), 2)
        self.assertEqual(actions[0].action_type, ModerationActionType.LOCK_THREAD)
        self.assertEqual(actions[1].action_type, ModerationActionType.UNLOCK_THREAD)


class NonCorpusConversationModerationTest(TestCase):
    """Test moderation for conversations not associated with a corpus."""

    def setUp(self):
        """Create test users and document-based conversation."""
        self.creator = User.objects.create_user(
            username="creator", password="testpass123"
        )
        self.other_user = User.objects.create_user(
            username="other", password="testpass123"
        )

        # Create a conversation without a corpus (e.g., document-based chat)
        self.conversation = Conversation.objects.create(
            title="Document Chat",
            conversation_type=ConversationTypeChoices.CHAT,
            creator=self.creator,
        )

    def test_creator_can_moderate_non_corpus_conversation(self):
        """Test that conversation creator can moderate non-corpus conversations."""
        self.assertTrue(self.conversation.can_moderate(self.creator))

    def test_non_creator_cannot_moderate_non_corpus_conversation(self):
        """Test that non-creators cannot moderate non-corpus conversations."""
        self.assertFalse(self.conversation.can_moderate(self.other_user))

    def test_creator_can_lock_non_corpus_conversation(self):
        """Test that creator can lock their own conversation."""
        self.conversation.lock(self.creator, reason="Personal lock")

        self.conversation.refresh_from_db()
        self.assertTrue(self.conversation.is_locked)

        # Check audit trail
        action = ModerationAction.objects.get(conversation=self.conversation)
        self.assertEqual(action.action_type, ModerationActionType.LOCK_THREAD)
        self.assertEqual(action.moderator, self.creator)
