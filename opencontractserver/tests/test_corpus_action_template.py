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
        templates = list(CorpusActionTemplate.objects.all())
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
