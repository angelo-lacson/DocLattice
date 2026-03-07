from django.contrib.auth import get_user_model
from graphene_django.utils.testing import GraphQLTestCase

from opencontractserver.corpuses.models import CorpusActionTemplate, CorpusActionTrigger

User = get_user_model()


class CorpusActionTemplateGraphQLTest(GraphQLTestCase):
    GRAPHQL_URL = "/graphql/"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = User.objects.create_user(username="gqluser", password="testpass")
        CorpusActionTemplate.objects.all().delete()

    def setUp(self):
        self.client.login(username="gqluser", password="testpass")
        CorpusActionTemplate.objects.all().delete()

    def test_query_active_templates(self):
        CorpusActionTemplate.objects.create(
            name="GQL Template",
            description="Test template",
            task_instructions="Do something.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            sort_order=10,
            is_active=True,
            creator=self.user,
        )
        CorpusActionTemplate.objects.create(
            name="Inactive Template",
            task_instructions="Inactive.",
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            is_active=False,
            creator=self.user,
        )

        response = self.query("""
            query {
                corpusActionTemplates(isActive: true) {
                    edges {
                        node {
                            name
                            description
                            trigger
                            sortOrder
                            isActive
                        }
                    }
                }
            }
            """)
        self.assertResponseNoErrors(response)
        content = response.json()
        edges = content["data"]["corpusActionTemplates"]["edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["node"]["name"], "GQL Template")
        self.assertEqual(edges[0]["node"]["trigger"], "ADD_DOCUMENT")

    def test_unauthenticated_returns_error(self):
        self.client.logout()
        response = self.query("""
            query {
                corpusActionTemplates {
                    edges { node { name } }
                }
            }
            """)
        content = response.json()
        self.assertTrue(len(content.get("errors", [])) > 0)
