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
