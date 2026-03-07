import importlib

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from opencontractserver.agents.models import AgentConfiguration
from opencontractserver.corpuses.models import (
    Corpus,
    CorpusAction,
    CorpusActionTemplate,
    CorpusActionTrigger,
)

# Migration module name starts with a digit, so we must use importlib.
_migration_mod = importlib.import_module(
    "opencontractserver.agents.migrations.0010_create_default_action_templates"
)
_create_default_action_templates = _migration_mod.create_default_action_templates

# Shared across test classes that verify default template seeding
DEFAULT_TEMPLATE_NAMES = [
    "Document Description Updater",
    "Corpus Description Updater",
    "Document Summary Generator",
    "Key Terms Annotator",
    "Document Notes Generator",
]

User = get_user_model()


class CorpusActionTemplateModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="templateuser", password="testpass"
        )
        self.agent_config = AgentConfiguration.objects.create(
            name="Template Agent",
            description="Agent for template tests",
            system_instructions="You are a test agent.",
            available_tools=["load_document_text", "update_document_description"],
            is_active=True,
            creator=self.user,
        )

    def test_create_template_with_agent_config(self):
        template = CorpusActionTemplate.objects.create(
            name="Test Template",
            description="A test template",
            agent_config=self.agent_config,
            task_instructions="Do something useful.",
            pre_authorized_tools=["load_document_text"],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        self.assertIsNotNone(template.pk)
        self.assertEqual(template.trigger, CorpusActionTrigger.ADD_DOCUMENT)
        self.assertTrue(template.is_active)
        self.assertTrue(template.disabled_on_clone)

    def test_create_lightweight_template_no_agent_config(self):
        template = CorpusActionTemplate.objects.create(
            name="Lightweight Template",
            task_instructions="Just do it.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        self.assertIsNotNone(template.pk)
        self.assertIsNone(template.agent_config)

    def test_empty_task_instructions_raises(self):
        with self.assertRaises(ValidationError):
            CorpusActionTemplate.objects.create(
                name="Bad Template",
                task_instructions="",
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                creator=self.user,
            )

    def test_str_representation(self):
        template = CorpusActionTemplate.objects.create(
            name="Desc Updater",
            task_instructions="Update description.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        self.assertIn("Desc Updater", str(template))
        self.assertIn("Add Document", str(template))

    def test_clone_to_corpus(self):
        template = CorpusActionTemplate.objects.create(
            name="Clone Test",
            agent_config=self.agent_config,
            task_instructions="Clone me.",
            pre_authorized_tools=["load_document_text"],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            disabled_on_clone=True,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Clone Target", creator=self.user)
        # Clear any auto-cloned actions from the signal
        CorpusAction.objects.filter(corpus=corpus).delete()

        action = template.clone_to_corpus(corpus)
        self.assertEqual(action.name, "Clone Test")
        self.assertEqual(action.corpus, corpus)
        self.assertEqual(action.agent_config, self.agent_config)
        self.assertEqual(action.task_instructions, "Clone me.")
        self.assertEqual(action.pre_authorized_tools, ["load_document_text"])
        self.assertEqual(action.trigger, CorpusActionTrigger.ADD_DOCUMENT)
        self.assertTrue(action.disabled)
        self.assertEqual(action.creator, self.user)

    def test_clone_to_corpus_sets_source_template(self):
        template = CorpusActionTemplate.objects.create(
            name="Source Test",
            agent_config=self.agent_config,
            task_instructions="Test source tracking.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Source Target", creator=self.user)
        CorpusAction.objects.filter(corpus=corpus).delete()

        action = template.clone_to_corpus(corpus)
        self.assertEqual(action.source_template, template)

    def test_source_template_survives_template_deletion(self):
        template = CorpusActionTemplate.objects.create(
            name="Delete Test",
            agent_config=self.agent_config,
            task_instructions="Test SET_NULL.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Delete Target", creator=self.user)
        CorpusAction.objects.filter(corpus=corpus).delete()

        action = template.clone_to_corpus(corpus)
        action_pk = action.pk
        template.delete()

        action.refresh_from_db()
        self.assertEqual(action.pk, action_pk)
        self.assertIsNone(action.source_template)

    def test_ordering_by_sort_order(self):
        t1 = CorpusActionTemplate.objects.create(
            name="Second",
            task_instructions="B",
            sort_order=2,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        t2 = CorpusActionTemplate.objects.create(
            name="First",
            task_instructions="A",
            sort_order=1,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        templates = list(
            CorpusActionTemplate.objects.filter(name__in=["First", "Second"]).order_by(
                "sort_order"
            )
        )
        self.assertEqual(templates[0].pk, t2.pk)
        self.assertEqual(templates[1].pk, t1.pk)


class CorpusActionTemplateCloneSignalTest(TestCase):
    """Test that creating a corpus auto-clones active templates."""

    def setUp(self):
        self.user = User.objects.create_user(username="signaluser", password="testpass")
        self.agent_config = AgentConfiguration.objects.create(
            name="Signal Agent",
            description="Agent for signal tests",
            system_instructions="You are a test agent.",
            available_tools=["load_document_text"],
            is_active=True,
            creator=self.user,
        )
        # Clear any existing templates from data migrations
        CorpusActionTemplate.objects.all().delete()

    def test_new_corpus_gets_cloned_actions(self):
        CorpusActionTemplate.objects.create(
            name="Auto Clone",
            agent_config=self.agent_config,
            task_instructions="Do it automatically.",
            pre_authorized_tools=["load_document_text"],
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            disabled_on_clone=True,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Signal Test Corpus", creator=self.user)

        actions = CorpusAction.objects.filter(corpus=corpus)
        self.assertEqual(actions.count(), 1)

        action = actions.first()
        self.assertEqual(action.name, "Auto Clone")
        self.assertEqual(action.task_instructions, "Do it automatically.")
        self.assertTrue(action.disabled)
        self.assertEqual(action.trigger, CorpusActionTrigger.ADD_DOCUMENT)
        self.assertEqual(action.creator, self.user)

    def test_inactive_templates_not_cloned(self):
        CorpusActionTemplate.objects.create(
            name="Inactive",
            task_instructions="Should not clone.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            is_active=False,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Inactive Test", creator=self.user)
        self.assertEqual(CorpusAction.objects.filter(corpus=corpus).count(), 0)

    def test_skip_signals_prevents_cloning(self):
        CorpusActionTemplate.objects.create(
            name="Skip Me",
            task_instructions="Should not clone.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        corpus = Corpus(title="Skip Test", creator=self.user)
        corpus._skip_signals = True
        corpus.save()
        self.assertEqual(CorpusAction.objects.filter(corpus=corpus).count(), 0)

    def test_multiple_templates_cloned(self):
        for i in range(3):
            CorpusActionTemplate.objects.create(
                name=f"Template {i}",
                task_instructions=f"Instructions {i}.",
                trigger=CorpusActionTrigger.ADD_DOCUMENT,
                sort_order=i,
                creator=self.user,
            )
        corpus = Corpus.objects.create(title="Multi Test", creator=self.user)
        self.assertEqual(CorpusAction.objects.filter(corpus=corpus).count(), 3)

    def test_signal_clone_sets_source_template(self):
        template = CorpusActionTemplate.objects.create(
            name="Signal Source",
            agent_config=self.agent_config,
            task_instructions="Signal tracking.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Signal Source Test", creator=self.user)
        action = CorpusAction.objects.get(corpus=corpus, name="Signal Source")
        self.assertEqual(action.source_template, template)

    def test_corpus_update_does_not_clone(self):
        CorpusActionTemplate.objects.create(
            name="No Re-Clone",
            task_instructions="Only once.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        corpus = Corpus.objects.create(title="Update Test", creator=self.user)
        initial_count = CorpusAction.objects.filter(corpus=corpus).count()
        self.assertEqual(initial_count, 1)

        corpus.title = "Updated Title"
        corpus.save()
        self.assertEqual(CorpusAction.objects.filter(corpus=corpus).count(), 1)


class DefaultTemplatesMigrationTest(TestCase):
    """Verify the data migration created the expected default templates.

    The data migration (agents/0010) requires a superuser to run. In test
    databases that start empty we call the migration function directly to
    exercise the same code path.
    """

    EXPECTED_NAMES = DEFAULT_TEMPLATE_NAMES

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Ensure a superuser exists so the migration function can run,
        # then invoke the migration logic if templates are missing.
        # Guard with existence check for --keepdb compatibility.
        from django.apps import apps

        cls._superuser, _ = User.objects.get_or_create(
            username="migration_admin",
            defaults={
                "password": "testpass",
                "email": "admin@test.com",
                "is_superuser": True,
                "is_staff": True,
            },
        )
        _create_default_action_templates(apps, None)

    def test_default_templates_exist(self):
        """All 5 default templates should exist after migration."""
        for name in self.EXPECTED_NAMES:
            self.assertTrue(
                CorpusActionTemplate.objects.filter(name=name).exists(),
                f"Default template '{name}' not found",
            )

    def test_default_templates_have_agent_configs(self):
        """Each default template should have a linked AgentConfiguration."""
        for template in CorpusActionTemplate.objects.filter(
            name__in=self.EXPECTED_NAMES
        ):
            self.assertIsNotNone(
                template.agent_config,
                f"Template '{template.name}' has no agent_config",
            )
            self.assertTrue(
                template.agent_config.is_active,
                f"Agent config for '{template.name}' is not active",
            )

    def test_default_templates_are_active_but_disabled_on_clone(self):
        """Default templates should be active (used for new corpuses)
        but cloned actions should start disabled."""
        for template in CorpusActionTemplate.objects.filter(
            name__in=self.EXPECTED_NAMES
        ):
            self.assertTrue(template.is_active)
            self.assertTrue(template.disabled_on_clone)

    def test_default_templates_all_add_document_trigger(self):
        """All default templates should trigger on ADD_DOCUMENT."""
        for template in CorpusActionTemplate.objects.filter(
            name__in=self.EXPECTED_NAMES
        ):
            self.assertEqual(template.trigger, CorpusActionTrigger.ADD_DOCUMENT)

    def test_default_templates_have_pre_authorized_tools(self):
        """Each template should have pre-authorized tools matching its config."""
        for template in CorpusActionTemplate.objects.filter(
            name__in=self.EXPECTED_NAMES
        ):
            self.assertTrue(
                len(template.pre_authorized_tools) > 0,
                f"Template '{template.name}' has no pre-authorized tools",
            )


class CorpusActionTemplateIntegrationTest(TestCase):
    """End-to-end test: creating a corpus clones default templates."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from django.apps import apps

        cls.EXPECTED_NAMES = DEFAULT_TEMPLATE_NAMES
        if not User.objects.filter(is_superuser=True).exists():
            User.objects.create_superuser(
                username="integration_admin",
                password="testpass",
                email="intadmin@test.com",
            )
        _create_default_action_templates(apps, None)

    def setUp(self):
        self.user = User.objects.create_user(
            username="integrationuser", password="testpass"
        )

    def test_new_corpus_gets_default_actions(self):
        """A new corpus should get cloned CorpusActions from all active templates."""
        active_template_count = CorpusActionTemplate.objects.filter(
            is_active=True
        ).count()

        corpus = Corpus.objects.create(title="Integration Corpus", creator=self.user)
        actions = CorpusAction.objects.filter(corpus=corpus)
        self.assertEqual(actions.count(), active_template_count)

        # All cloned actions should be disabled
        for action in actions:
            self.assertTrue(
                action.disabled,
                f"Cloned action '{action.name}' should be disabled",
            )
            self.assertTrue(action.is_agent_action)
            self.assertEqual(action.creator, self.user)
