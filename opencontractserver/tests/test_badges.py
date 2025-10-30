"""
Tests for badge system in OpenContracts.

This module tests Epic #558: Badge System

Tests cover:
1. Creating badges (global and corpus-specific)
2. Awarding badges to users
3. Badge validation (corpus constraints)
4. UserBadge unique constraints
5. GraphQL mutations and queries
6. Auto-badge checking tasks
7. Permission checks for badge management
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase, TransactionTestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.badges.models import Badge, BadgeTypeChoices, UserBadge
from opencontractserver.conversations.models import ChatMessage, Conversation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.tasks.badge_tasks import check_auto_badges
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestBadgeModel(TestCase):
    """Test Badge model functionality."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        cls.admin_user = User.objects.create_user(
            username="admin",
            password="testpass123",
            email="admin@test.com",
            is_superuser=True,
        )

        cls.normal_user = User.objects.create_user(
            username="normal",
            password="testpass123",
            email="normal@test.com",
        )

        cls.corpus = Corpus.objects.create(
            title="Test Badge Corpus",
            description="A corpus for testing badges",
            creator=cls.admin_user,
            is_public=True,
        )

    def test_create_global_badge(self):
        """Test creating a global badge."""
        badge = Badge.objects.create(
            name="Global Champion",
            description="Awarded for excellence",
            icon="Trophy",
            badge_type=BadgeTypeChoices.GLOBAL,
            color="#FFD700",
            creator=self.admin_user,
            is_public=True,
        )

        self.assertEqual(badge.name, "Global Champion")
        self.assertEqual(badge.badge_type, BadgeTypeChoices.GLOBAL)
        self.assertIsNone(badge.corpus)
        self.assertEqual(badge.icon, "Trophy")
        self.assertEqual(badge.color, "#FFD700")

    def test_create_corpus_badge(self):
        """Test creating a corpus-specific badge."""
        badge = Badge.objects.create(
            name="Corpus Expert",
            description="Expert in this corpus",
            icon="Award",
            badge_type=BadgeTypeChoices.CORPUS,
            corpus=self.corpus,
            creator=self.admin_user,
            is_public=True,
        )

        self.assertEqual(badge.badge_type, BadgeTypeChoices.CORPUS)
        self.assertEqual(badge.corpus, self.corpus)

    def test_corpus_badge_without_corpus_validation(self):
        """Test that corpus badges must have a corpus."""
        badge = Badge(
            name="Invalid Badge",
            description="Should fail",
            icon="Star",
            badge_type=BadgeTypeChoices.CORPUS,
            corpus=None,  # Missing corpus
            creator=self.admin_user,
        )

        with self.assertRaises(ValidationError) as cm:
            badge.save()

        self.assertIn("corpus", str(cm.exception))

    def test_global_badge_with_corpus_validation(self):
        """Test that global badges cannot have a corpus."""
        badge = Badge(
            name="Invalid Global Badge",
            description="Should fail",
            icon="Star",
            badge_type=BadgeTypeChoices.GLOBAL,
            corpus=self.corpus,  # Should not have corpus
            creator=self.admin_user,
        )

        with self.assertRaises(ValidationError) as cm:
            badge.save()

        self.assertIn("corpus", str(cm.exception))

    def test_badge_auto_award_criteria(self):
        """Test badge with auto-award criteria."""
        badge = Badge.objects.create(
            name="First Post",
            description="Made your first post",
            icon="MessageSquare",
            badge_type=BadgeTypeChoices.GLOBAL,
            is_auto_awarded=True,
            criteria_config={
                "type": "first_post",
                "value": 1,
            },
            creator=self.admin_user,
            is_public=True,
        )

        self.assertTrue(badge.is_auto_awarded)
        self.assertEqual(badge.criteria_config["type"], "first_post")

    def test_badge_string_representation(self):
        """Test badge string representation."""
        global_badge = Badge.objects.create(
            name="Global Badge",
            description="Test",
            icon="Star",
            badge_type=BadgeTypeChoices.GLOBAL,
            creator=self.admin_user,
        )

        corpus_badge = Badge.objects.create(
            name="Corpus Badge",
            description="Test",
            icon="Award",
            badge_type=BadgeTypeChoices.CORPUS,
            corpus=self.corpus,
            creator=self.admin_user,
        )

        self.assertIn("Global", str(global_badge))
        self.assertIn(self.corpus.title, str(corpus_badge))


class TestUserBadgeModel(TestCase):
    """Test UserBadge model functionality."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        cls.admin_user = User.objects.create_user(
            username="admin",
            password="testpass123",
            email="admin@test.com",
            is_superuser=True,
        )

        cls.recipient = User.objects.create_user(
            username="recipient",
            password="testpass123",
            email="recipient@test.com",
        )

        cls.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test",
            creator=cls.admin_user,
            is_public=True,
        )

        cls.global_badge = Badge.objects.create(
            name="Global Award",
            description="Global badge",
            icon="Trophy",
            badge_type=BadgeTypeChoices.GLOBAL,
            creator=cls.admin_user,
            is_public=True,
        )

        cls.corpus_badge = Badge.objects.create(
            name="Corpus Award",
            description="Corpus badge",
            icon="Award",
            badge_type=BadgeTypeChoices.CORPUS,
            corpus=cls.corpus,
            creator=cls.admin_user,
            is_public=True,
        )

    def test_award_global_badge(self):
        """Test awarding a global badge."""
        user_badge = UserBadge.objects.create(
            user=self.recipient,
            badge=self.global_badge,
            awarded_by=self.admin_user,
        )

        self.assertEqual(user_badge.user, self.recipient)
        self.assertEqual(user_badge.badge, self.global_badge)
        self.assertEqual(user_badge.awarded_by, self.admin_user)
        self.assertIsNone(user_badge.corpus)

    def test_award_corpus_badge(self):
        """Test awarding a corpus-specific badge."""
        user_badge = UserBadge.objects.create(
            user=self.recipient,
            badge=self.corpus_badge,
            awarded_by=self.admin_user,
            corpus=self.corpus,
        )

        self.assertEqual(user_badge.corpus, self.corpus)
        self.assertEqual(user_badge.badge, self.corpus_badge)

    def test_auto_award_badge(self):
        """Test auto-awarding a badge (no awarded_by)."""
        user_badge = UserBadge.objects.create(
            user=self.recipient,
            badge=self.global_badge,
            awarded_by=None,  # Auto-awarded
        )

        self.assertIsNone(user_badge.awarded_by)

    def test_corpus_badge_without_corpus_validation(self):
        """Test that corpus badge awards must have corpus."""
        user_badge = UserBadge(
            user=self.recipient,
            badge=self.corpus_badge,
            awarded_by=self.admin_user,
            corpus=None,  # Missing corpus
        )

        with self.assertRaises(ValidationError) as cm:
            user_badge.save()

        self.assertIn("corpus", str(cm.exception))

    def test_corpus_badge_wrong_corpus_validation(self):
        """Test that corpus badge award must match badge's corpus."""
        other_corpus = Corpus.objects.create(
            title="Other Corpus",
            description="Different corpus",
            creator=self.admin_user,
        )

        user_badge = UserBadge(
            user=self.recipient,
            badge=self.corpus_badge,
            awarded_by=self.admin_user,
            corpus=other_corpus,  # Wrong corpus
        )

        with self.assertRaises(ValidationError) as cm:
            user_badge.save()

        self.assertIn("corpus", str(cm.exception))

    def test_global_badge_with_corpus_validation(self):
        """Test that global badge awards cannot have corpus."""
        user_badge = UserBadge(
            user=self.recipient,
            badge=self.global_badge,
            awarded_by=self.admin_user,
            corpus=self.corpus,  # Should not have corpus
        )

        with self.assertRaises(ValidationError) as cm:
            user_badge.save()

        self.assertIn("corpus", str(cm.exception))

    def test_unique_constraint(self):
        """Test that same badge can't be awarded twice to same user."""
        # Award badge first time
        UserBadge.objects.create(
            user=self.recipient,
            badge=self.global_badge,
            awarded_by=self.admin_user,
        )

        # Try to award again
        with self.assertRaises(IntegrityError):
            UserBadge.objects.create(
                user=self.recipient,
                badge=self.global_badge,
                awarded_by=self.admin_user,
            )

    def test_user_badge_string_representation(self):
        """Test user badge string representation."""
        user_badge = UserBadge.objects.create(
            user=self.recipient,
            badge=self.global_badge,
            awarded_by=self.admin_user,
        )

        badge_str = str(user_badge)
        self.assertIn(self.global_badge.name, badge_str)
        self.assertIn(self.recipient.username, badge_str)


class TestBadgeGraphQLMutations(TransactionTestCase):
    """Test GraphQL mutations for badges."""

    def setUp(self):
        """Set up test data for each test."""
        self.admin_user = User.objects.create_user(
            username="admin",
            password="testpass123",
            email="admin@test.com",
            is_superuser=True,
        )

        self.normal_user = User.objects.create_user(
            username="normal",
            password="testpass123",
            email="normal@test.com",
        )

        self.corpus_owner = User.objects.create_user(
            username="corpusowner",
            password="testpass123",
            email="corpusowner@test.com",
        )

        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test",
            creator=self.corpus_owner,
            is_public=True,
        )
        set_permissions_for_obj_to_user(
            self.corpus_owner, self.corpus, [PermissionTypes.CRUD]
        )

        self.client = Client(schema)

    def test_create_global_badge_as_admin(self):
        """Test creating a global badge as superuser."""
        mutation = """
            mutation CreateBadge {
                createBadge(
                    name: "Test Global Badge"
                    description: "A test badge"
                    icon: "Trophy"
                    badgeType: "GLOBAL"
                    color: "#FFD700"
                ) {
                    ok
                    message
                    badge {
                        name
                        badgeType
                        icon
                    }
                }
            }
        """

        result = self.client.execute(
            mutation,
            context_value=type("Request", (), {"user": self.admin_user})(),
        )

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createBadge"]["ok"])
        self.assertEqual(
            result["data"]["createBadge"]["badge"]["name"], "Test Global Badge"
        )
        self.assertEqual(
            result["data"]["createBadge"]["badge"]["badgeType"], "GLOBAL"
        )

    def test_create_corpus_badge_as_corpus_owner(self):
        """Test creating a corpus badge as corpus owner."""
        corpus_global_id = to_global_id("CorpusType", self.corpus.id)

        mutation = f"""
            mutation CreateBadge {{
                createBadge(
                    name: "Corpus Expert"
                    description: "Expert in corpus"
                    icon: "Award"
                    badgeType: "CORPUS"
                    corpusId: "{corpus_global_id}"
                ) {{
                    ok
                    message
                    badge {{
                        name
                        badgeType
                    }}
                }}
            }}
        """

        result = self.client.execute(
            mutation,
            context_value=type("Request", (), {"user": self.corpus_owner})(),
        )

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createBadge"]["ok"])

    def test_create_global_badge_as_normal_user_fails(self):
        """Test that normal users cannot create global badges."""
        mutation = """
            mutation CreateBadge {
                createBadge(
                    name: "Unauthorized Badge"
                    description: "Should fail"
                    icon: "Star"
                    badgeType: "GLOBAL"
                ) {
                    ok
                    message
                }
            }
        """

        result = self.client.execute(
            mutation,
            context_value=type("Request", (), {"user": self.normal_user})(),
        )

        # Should have GraphQL error or ok=False
        if "errors" not in result:
            self.assertFalse(result["data"]["createBadge"]["ok"])

    def test_award_badge_mutation(self):
        """Test awarding a badge via GraphQL."""
        # Create a badge first
        badge = Badge.objects.create(
            name="Test Award",
            description="Test",
            icon="Award",
            badge_type=BadgeTypeChoices.GLOBAL,
            creator=self.admin_user,
            is_public=True,
        )

        badge_global_id = to_global_id("BadgeType", badge.id)
        user_global_id = to_global_id("UserType", self.normal_user.id)

        mutation = f"""
            mutation AwardBadge {{
                awardBadge(
                    badgeId: "{badge_global_id}"
                    userId: "{user_global_id}"
                ) {{
                    ok
                    message
                    userBadge {{
                        user {{
                            username
                        }}
                        badge {{
                            name
                        }}
                    }}
                }}
            }}
        """

        result = self.client.execute(
            mutation,
            context_value=type("Request", (), {"user": self.admin_user})(),
        )

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["awardBadge"]["ok"])
        self.assertEqual(
            result["data"]["awardBadge"]["userBadge"]["user"]["username"],
            "normal",
        )


class TestBadgeGraphQLQueries(TransactionTestCase):
    """Test GraphQL queries for badges."""

    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            email="test@test.com",
        )

        self.badge = Badge.objects.create(
            name="Test Badge",
            description="Test",
            icon="Trophy",
            badge_type=BadgeTypeChoices.GLOBAL,
            creator=self.user,
            is_public=True,
        )

        self.user_badge = UserBadge.objects.create(
            user=self.user,
            badge=self.badge,
        )

        self.client = Client(schema)

    def test_query_badges(self):
        """Test querying badges."""
        query = """
            query {
                badges {
                    edges {
                        node {
                            name
                            badgeType
                            icon
                        }
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            context_value=type("Request", (), {"user": self.user})(),
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["badges"]["edges"]
        self.assertGreater(len(edges), 0)
        self.assertEqual(edges[0]["node"]["name"], "Test Badge")

    def test_query_user_badges(self):
        """Test querying user badge awards."""
        query = """
            query {
                userBadges {
                    edges {
                        node {
                            user {
                                username
                            }
                            badge {
                                name
                            }
                        }
                    }
                }
            }
        """

        result = self.client.execute(
            query,
            context_value=type("Request", (), {"user": self.user})(),
        )

        self.assertIsNone(result.get("errors"))
        edges = result["data"]["userBadges"]["edges"]
        self.assertGreater(len(edges), 0)


class TestBadgeAutoAwardTasks(TestCase):
    """Test auto-badge award tasks."""

    @classmethod
    def setUpTestData(cls):
        """Create test data."""
        cls.admin_user = User.objects.create_user(
            username="admin",
            password="testpass123",
            email="admin@test.com",
            is_superuser=True,
        )

        cls.user = User.objects.create_user(
            username="testuser",
            password="testpass123",
            email="test@test.com",
        )

        cls.corpus = Corpus.objects.create(
            title="Test Corpus",
            description="Test",
            creator=cls.admin_user,
            is_public=True,
        )

        # Create auto-award badge for first post
        cls.first_post_badge = Badge.objects.create(
            name="First Post",
            description="Made your first post",
            icon="MessageSquare",
            badge_type=BadgeTypeChoices.GLOBAL,
            is_auto_awarded=True,
            criteria_config={
                "type": "first_post",
                "value": 1,
            },
            creator=cls.admin_user,
            is_public=True,
        )

    def test_auto_award_first_post_badge(self):
        """Test auto-awarding first post badge."""
        # Create a conversation and message
        conversation = Conversation.objects.create(
            title="Test",
            creator=self.user,
        )
        ChatMessage.objects.create(
            conversation=conversation,
            msg_type="HUMAN",
            content="First post!",
            creator=self.user,
        )

        # Run auto-badge check
        result = check_auto_badges(self.user.id)

        self.assertTrue(result["ok"])
        self.assertEqual(result["awards_count"], 1)

        # Verify badge was awarded
        user_badge = UserBadge.objects.filter(
            user=self.user, badge=self.first_post_badge
        ).first()
        self.assertIsNotNone(user_badge)
        self.assertIsNone(user_badge.awarded_by)  # Auto-awarded

    def test_auto_badge_not_awarded_twice(self):
        """Test that auto-badges are not awarded multiple times."""
        # Create message
        conversation = Conversation.objects.create(
            title="Test",
            creator=self.user,
        )
        ChatMessage.objects.create(
            conversation=conversation,
            msg_type="HUMAN",
            content="First post!",
            creator=self.user,
        )

        # Run auto-badge check twice
        result1 = check_auto_badges(self.user.id)
        result2 = check_auto_badges(self.user.id)

        self.assertEqual(result1["awards_count"], 1)
        self.assertEqual(result2["awards_count"], 0)  # Already awarded

        # Verify only one badge awarded
        count = UserBadge.objects.filter(
            user=self.user, badge=self.first_post_badge
        ).count()
        self.assertEqual(count, 1)

    def test_message_count_criteria(self):
        """Test message count badge criteria."""
        # Create badge for 5 messages
        badge = Badge.objects.create(
            name="Contributor",
            description="Made 5 posts",
            icon="MessageCircle",
            badge_type=BadgeTypeChoices.GLOBAL,
            is_auto_awarded=True,
            criteria_config={
                "type": "message_count",
                "value": 5,
            },
            creator=self.admin_user,
            is_public=True,
        )

        conversation = Conversation.objects.create(
            title="Test",
            creator=self.user,
        )

        # Create 4 messages - should not award
        for i in range(4):
            ChatMessage.objects.create(
                conversation=conversation,
                msg_type="HUMAN",
                content=f"Message {i}",
                creator=self.user,
            )

        result = check_auto_badges(self.user.id)
        self.assertEqual(
            UserBadge.objects.filter(user=self.user, badge=badge).count(), 0
        )

        # Create 5th message - should award
        ChatMessage.objects.create(
            conversation=conversation,
            msg_type="HUMAN",
            content="Message 5",
            creator=self.user,
        )

        result = check_auto_badges(self.user.id)
        self.assertEqual(
            UserBadge.objects.filter(user=self.user, badge=badge).count(), 1
        )
