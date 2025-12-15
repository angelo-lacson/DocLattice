from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.agents.models import AgentConfiguration
from opencontractserver.analyzer.models import Analyzer
from opencontractserver.corpuses.models import Corpus, CorpusAction
from opencontractserver.extracts.models import Fieldset
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class CorpusActionMutationTestCase(TestCase):
    def setUp(self):
        # Create test user
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

        # Create test corpus
        self.corpus = Corpus.objects.create(
            title="Test Corpus", description="Test Description", creator=self.user
        )
        set_permissions_for_obj_to_user(self.user, self.corpus, [PermissionTypes.CRUD])

        # Create test fieldset
        self.fieldset = Fieldset.objects.create(
            name="Test Fieldset", description="Test Description", creator=self.user
        )
        set_permissions_for_obj_to_user(
            self.user, self.fieldset, [PermissionTypes.CRUD]
        )

        # Create test analyzer
        self.analyzer = Analyzer.objects.create(
            id="Test Analyzer",
            description="Test Description",
            creator=self.user,
            task_name="totally.not.a.real.task",
        )

        # Create test agent configuration
        self.agent_config = AgentConfiguration.objects.create(
            name="Test Agent Config",
            description="Test agent configuration",
            system_instructions="You are a helpful assistant",
            is_active=True,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, self.agent_config, [PermissionTypes.CRUD]
        )

    def test_create_corpus_action_with_fieldset(self):
        mutation = """
            mutation CreateCorpusAction(
                $corpusId: ID!,
                $name: String,
                $trigger: String!,
                $fieldsetId: ID,
                $disabled: Boolean,
                $runOnAllCorpuses: Boolean
            ) {
                createCorpusAction(
                    corpusId: $corpusId,
                    name: $name,
                    trigger: $trigger,
                    fieldsetId: $fieldsetId,
                    disabled: $disabled,
                    runOnAllCorpuses: $runOnAllCorpuses
                ) {
                    ok
                    message
                    obj {
                        id
                        name
                        trigger
                        disabled
                        runOnAllCorpuses
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "name": "Test Action",
            "trigger": "add_document",
            "fieldsetId": to_global_id("FieldsetType", self.fieldset.id),
            "disabled": False,
            "runOnAllCorpuses": False,
        }

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpusAction"]["ok"])
        self.assertEqual(
            result["data"]["createCorpusAction"]["message"],
            "Successfully created corpus action",
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["name"], "Test Action"
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["trigger"], "ADD_DOCUMENT"
        )

    def test_create_corpus_action_with_analyzer(self):
        mutation = """
            mutation CreateCorpusAction(
                $corpusId: ID!,
                $name: String,
                $trigger: String!,
                $analyzerId: ID,
                $disabled: Boolean,
                $runOnAllCorpuses: Boolean
            ) {
                createCorpusAction(
                    corpusId: $corpusId,
                    name: $name,
                    trigger: $trigger,
                    analyzerId: $analyzerId,
                    disabled: $disabled,
                    runOnAllCorpuses: $runOnAllCorpuses
                ) {
                    ok
                    message
                    obj {
                        id
                        name
                        trigger
                        disabled
                        runOnAllCorpuses
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "name": "Test Analyzer Action",
            "trigger": "edit_document",
            "analyzerId": to_global_id("AnalyzerType", self.analyzer.id),
            "disabled": False,
            "runOnAllCorpuses": False,
        }

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpusAction"]["ok"])
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["name"], "Test Analyzer Action"
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["trigger"], "EDIT_DOCUMENT"
        )

    def test_create_corpus_action_validation_error(self):
        """Test that providing both fieldset and analyzer IDs fails"""
        mutation = """
            mutation CreateCorpusAction(
                $corpusId: ID!,
                $fieldsetId: ID,
                $analyzerId: ID,
                $trigger: String!
            ) {
                createCorpusAction(
                    corpusId: $corpusId,
                    fieldsetId: $fieldsetId,
                    analyzerId: $analyzerId,
                    trigger: $trigger
                ) {
                    ok
                    message
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "fieldsetId": to_global_id("FieldsetType", self.fieldset.id),
            "analyzerId": to_global_id("AnalyzerType", self.analyzer.id),
            "trigger": "add_document",
        }

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["createCorpusAction"]["ok"])
        self.assertEqual(
            result["data"]["createCorpusAction"]["message"],
            "Exactly one of fieldset_id, analyzer_id, or agent_config_id must be provided",
        )

    def test_delete_corpus_action(self):
        # First create a corpus action
        corpus_action = CorpusAction.objects.create(
            name="Action to Delete",
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger="add_document",
            creator=self.user,
        )
        set_permissions_for_obj_to_user(
            self.user, corpus_action, [PermissionTypes.CRUD]
        )
        action_id = to_global_id("CorpusActionType", corpus_action.id)

        mutation = """
            mutation DeleteCorpusAction($id: String!) {
                deleteCorpusAction(id: $id) {
                    ok
                    message
                }
            }
        """

        variables = {"id": action_id}

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["deleteCorpusAction"]["ok"])
        self.assertEqual(result["data"]["deleteCorpusAction"]["message"], "Success!")

        # Verify the action was actually deleted
        with self.assertRaises(CorpusAction.DoesNotExist):
            CorpusAction.objects.get(id=corpus_action.id)

    def test_query_corpus_actions(self):
        # Create some test actions
        action1 = CorpusAction.objects.create(
            name="Test Action 1",
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger="add_document",
            creator=self.user,
        )
        action2 = CorpusAction.objects.create(
            name="Test Action 2",
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger="edit_document",
            disabled=True,
            creator=self.user,
        )
        set_permissions_for_obj_to_user(self.user, action1, [PermissionTypes.CRUD])
        set_permissions_for_obj_to_user(self.user, action2, [PermissionTypes.CRUD])

        query = """
            query GetCorpusActions($corpusId: ID, $trigger: String, $disabled: Boolean) {
                corpusActions(corpusId: $corpusId, trigger: $trigger, disabled: $disabled) {
                    edges {
                        node {
                            id
                            name
                            trigger
                            disabled
                            runOnAllCorpuses
                        }
                    }
                }
            }
        """

        # Test filtering by corpus
        variables = {"corpusId": to_global_id("CorpusType", self.corpus.id)}
        result = self.client.execute(query, variables=variables)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(len(result["data"]["corpusActions"]["edges"]), 2)

        # Test filtering by trigger
        variables["trigger"] = "add_document"
        result = self.client.execute(query, variables=variables)
        self.assertEqual(len(result["data"]["corpusActions"]["edges"]), 1)
        self.assertEqual(
            result["data"]["corpusActions"]["edges"][0]["node"]["name"], "Test Action 1"
        )

        # Test filtering by disabled status
        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "disabled": True,
        }
        result = self.client.execute(query, variables=variables)
        self.assertEqual(len(result["data"]["corpusActions"]["edges"]), 1)
        self.assertEqual(
            result["data"]["corpusActions"]["edges"][0]["node"]["name"], "Test Action 2"
        )

    def test_create_corpus_action_with_agent_config(self):
        """Test creating a corpus action with an agent configuration."""
        mutation = """
            mutation CreateCorpusAction(
                $corpusId: ID!,
                $name: String,
                $trigger: String!,
                $agentConfigId: ID,
                $agentPrompt: String,
                $preAuthorizedTools: [String],
                $disabled: Boolean
            ) {
                createCorpusAction(
                    corpusId: $corpusId,
                    name: $name,
                    trigger: $trigger,
                    agentConfigId: $agentConfigId,
                    agentPrompt: $agentPrompt,
                    preAuthorizedTools: $preAuthorizedTools,
                    disabled: $disabled
                ) {
                    ok
                    message
                    obj {
                        id
                        name
                        trigger
                        disabled
                        agentPrompt
                        preAuthorizedTools
                    }
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "name": "Test Agent Action",
            "trigger": "add_document",
            "agentConfigId": to_global_id(
                "AgentConfigurationType", self.agent_config.id
            ),
            "agentPrompt": "Summarize this document and update its description",
            "preAuthorizedTools": ["update_document_description", "search_annotations"],
            "disabled": False,
        }

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["createCorpusAction"]["ok"])
        self.assertEqual(
            result["data"]["createCorpusAction"]["message"],
            "Successfully created corpus action",
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["name"], "Test Agent Action"
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["trigger"], "ADD_DOCUMENT"
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["agentPrompt"],
            "Summarize this document and update its description",
        )
        self.assertEqual(
            result["data"]["createCorpusAction"]["obj"]["preAuthorizedTools"],
            ["update_document_description", "search_annotations"],
        )

    def test_create_corpus_action_with_agent_config_missing_prompt(self):
        """Test that creating an agent action without a prompt fails."""
        mutation = """
            mutation CreateCorpusAction(
                $corpusId: ID!,
                $trigger: String!,
                $agentConfigId: ID
            ) {
                createCorpusAction(
                    corpusId: $corpusId,
                    trigger: $trigger,
                    agentConfigId: $agentConfigId
                ) {
                    ok
                    message
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "trigger": "add_document",
            "agentConfigId": to_global_id(
                "AgentConfigurationType", self.agent_config.id
            ),
        }

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["createCorpusAction"]["ok"])
        self.assertEqual(
            result["data"]["createCorpusAction"]["message"],
            "agent_prompt is required when agent_config_id is provided",
        )

    def test_create_corpus_action_with_agent_and_fieldset_fails(self):
        """Test that providing both agent_config and fieldset fails."""
        mutation = """
            mutation CreateCorpusAction(
                $corpusId: ID!,
                $trigger: String!,
                $agentConfigId: ID,
                $agentPrompt: String,
                $fieldsetId: ID
            ) {
                createCorpusAction(
                    corpusId: $corpusId,
                    trigger: $trigger,
                    agentConfigId: $agentConfigId,
                    agentPrompt: $agentPrompt,
                    fieldsetId: $fieldsetId
                ) {
                    ok
                    message
                }
            }
        """

        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "trigger": "add_document",
            "agentConfigId": to_global_id(
                "AgentConfigurationType", self.agent_config.id
            ),
            "agentPrompt": "Test prompt",
            "fieldsetId": to_global_id("FieldsetType", self.fieldset.id),
        }

        result = self.client.execute(mutation, variables=variables)

        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["createCorpusAction"]["ok"])
        self.assertEqual(
            result["data"]["createCorpusAction"]["message"],
            "Exactly one of fieldset_id, analyzer_id, or agent_config_id must be provided",
        )
