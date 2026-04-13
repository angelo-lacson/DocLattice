from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from graphene.test import Client
from graphql_relay import to_global_id

from config.graphql.schema import schema
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tests.fixtures import SAMPLE_PDF_FILE_TWO_PATH
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class ExtractsQueryTestCase(TestCase):
    def setUp(self):

        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))
        self.fieldset = Fieldset.objects.create(
            name="TestFieldset",
            description="Test description",
            creator=self.user,
        )
        self.column = Column.objects.create(
            creator=self.user,
            fieldset=self.fieldset,
            query="TestQuery",
            output_type="str",
        )
        self.corpus = Corpus.objects.create(title="TestCorpus", creator=self.user)
        self.extract = Extract.objects.create(
            corpus=self.corpus,
            name="TestExtract",
            fieldset=self.fieldset,
            creator=self.user,
        )

        pdf_file = ContentFile(
            SAMPLE_PDF_FILE_TWO_PATH.open("rb").read(), name="test.pdf"
        )

        # We're going to manually process three docs
        self.doc = Document.objects.create(
            creator=self.user,
            title="Rando Doc",
            description="RANDO DOC!",
            custom_meta={},
            pdf_file=pdf_file,
            backend_lock=True,
        )

        # Associate the document with the extract and grant the user read
        # permission so that the permission-aware datacell resolver returns
        # results for non-superuser queries.
        self.extract.documents.add(self.doc)
        set_permissions_for_obj_to_user(self.user, self.doc, [PermissionTypes.READ])

        self.row = Datacell.objects.create(
            extract=self.extract,
            column=self.column,
            data={"data": "TestData"},
            data_definition="str",
            creator=self.user,
            document=self.doc,
        )

    def test_fieldset_query(self):
        query = """
            query {
                fieldset(id: "%s") {
                    id
                    name
                    description
                }
            }
        """ % to_global_id("FieldsetType", self.fieldset.id)

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["fieldset"]["id"],
            to_global_id("FieldsetType", self.fieldset.id),
        )
        self.assertEqual(result["data"]["fieldset"]["name"], "TestFieldset")
        self.assertEqual(result["data"]["fieldset"]["description"], "Test description")

    def test_column_query(self):
        query = """
            query {
                column(id: "%s") {
                    id
                    query
                    outputType
                }
            }
        """ % to_global_id("ColumnType", self.column.id)

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["column"]["id"], to_global_id("ColumnType", self.column.id)
        )
        self.assertEqual(result["data"]["column"]["query"], "TestQuery")
        self.assertEqual(result["data"]["column"]["outputType"], "str")

    def test_extract_query(self):
        query = """
            query {
                extract(id: "%s") {
                    id
                    name
                }
            }
        """ % to_global_id("ExtractType", self.extract.id)

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["extract"]["id"],
            to_global_id("ExtractType", self.extract.id),
        )
        self.assertEqual(result["data"]["extract"]["name"], "TestExtract")

    def test_datacell_query(self):
        query = """
            query {
                datacell(id: "%s") {
                    id
                    data
                    dataDefinition
                }
            }
        """ % to_global_id("DatacellType", self.row.id)

        result = self.client.execute(query)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(
            result["data"]["datacell"]["id"], to_global_id("DatacellType", self.row.id)
        )
        self.assertEqual(result["data"]["datacell"]["data"], {"data": "TestData"})
        self.assertEqual(result["data"]["datacell"]["dataDefinition"], "str")

    def test_full_datacell_list_limit_offset_and_count(self):
        """
        Covers the ExtractType.full_datacell_list pagination arguments (`limit`,
        `offset`) and the `datacell_count` field introduced to resolve #1204.

        Scenario: create 5 datacells on the extract, then verify that
        - `fullDatacellList` with no args still returns all visible datacells
        - `fullDatacellList(limit: 2)` returns exactly 2 cells
        - `fullDatacellList(limit: 2, offset: 2)` returns the next 2 cells
          (different from the first page)
        - `datacellCount` reports the full total regardless of limit/offset
        """
        extract_id = to_global_id("ExtractType", self.extract.id)

        # The setUp already created one datacell (self.row). Add four more so
        # we have 5 cells total on the same extract+column+document (which is
        # allowed because the uniqueness constraint only applies when
        # extract is NULL).
        for i in range(4):
            Datacell.objects.create(
                extract=self.extract,
                column=self.column,
                data={"data": f"TestData{i}"},
                data_definition="str",
                creator=self.user,
                document=self.doc,
            )

        # Unbounded fetch should return all 5 cells and datacellCount=5.
        result = self.client.execute("""
            query {
                extract(id: "%s") {
                    id
                    datacellCount
                    fullDatacellList {
                        id
                    }
                }
            }
            """ % extract_id)
        self.assertIsNone(result.get("errors"))
        extract_data = result["data"]["extract"]
        self.assertEqual(extract_data["datacellCount"], 5)
        self.assertEqual(len(extract_data["fullDatacellList"]), 5)

        # First page: limit=2 → exactly 2 cells, datacellCount still 5.
        result_page1 = self.client.execute("""
            query {
                extract(id: "%s") {
                    datacellCount
                    fullDatacellList(limit: 2) {
                        id
                    }
                }
            }
            """ % extract_id)
        self.assertIsNone(result_page1.get("errors"))
        page1 = result_page1["data"]["extract"]
        self.assertEqual(page1["datacellCount"], 5)
        self.assertEqual(len(page1["fullDatacellList"]), 2)

        # Second page: limit=2, offset=2 → next 2 cells, disjoint from page 1.
        result_page2 = self.client.execute("""
            query {
                extract(id: "%s") {
                    datacellCount
                    fullDatacellList(limit: 2, offset: 2) {
                        id
                    }
                }
            }
            """ % extract_id)
        self.assertIsNone(result_page2.get("errors"))
        page2 = result_page2["data"]["extract"]
        self.assertEqual(page2["datacellCount"], 5)
        self.assertEqual(len(page2["fullDatacellList"]), 2)

        page1_ids = {cell["id"] for cell in page1["fullDatacellList"]}
        page2_ids = {cell["id"] for cell in page2["fullDatacellList"]}
        self.assertTrue(
            page1_ids.isdisjoint(page2_ids),
            "Pagination produced overlapping pages — offset is not applied.",
        )

        # Final page: limit=2, offset=4 → only 1 cell remains.
        result_page3 = self.client.execute("""
            query {
                extract(id: "%s") {
                    fullDatacellList(limit: 2, offset: 4) {
                        id
                    }
                }
            }
            """ % extract_id)
        self.assertIsNone(result_page3.get("errors"))
        self.assertEqual(
            len(result_page3["data"]["extract"]["fullDatacellList"]),
            1,
            "Expected 1 remaining cell after offset=4 on a 5-row list.",
        )

    def test_full_datacell_list_negative_offset_clamped_to_zero(self):
        """
        A negative ``offset`` must be clamped to 0 rather than crashing.
        Django does not support negative indexing on querysets; passing a
        negative offset should behave identically to offset=0.
        """
        extract_id = to_global_id("ExtractType", self.extract.id)

        result = self.client.execute("""
            query {
                extract(id: "%s") {
                    fullDatacellList(limit: 10, offset: -5) {
                        id
                    }
                }
            }
            """ % extract_id)
        self.assertIsNone(result.get("errors"))
        # With offset clamped to 0, the single existing datacell is returned.
        self.assertEqual(len(result["data"]["extract"]["fullDatacellList"]), 1)

    def test_full_datacell_list_limit_capped_at_server_max(self):
        """
        A ``limit`` exceeding ``MAX_FULL_DATACELL_LIST_LIMIT`` must be
        silently capped to the server maximum. We verify by requesting a
        limit far above the cap and checking we still get a bounded result
        (the test fixture only has 1 cell, so we just assert no error).
        """
        from opencontractserver.constants.extracts import MAX_FULL_DATACELL_LIST_LIMIT

        extract_id = to_global_id("ExtractType", self.extract.id)
        huge_limit = MAX_FULL_DATACELL_LIST_LIMIT + 9999

        result = self.client.execute("""
            query {{
                extract(id: "{}") {{
                    fullDatacellList(limit: {}) {{
                        id
                    }}
                }}
            }}
            """.format(extract_id, huge_limit))
        self.assertIsNone(result.get("errors"))
        # Only 1 cell exists; the important thing is no 500 error.
        self.assertEqual(len(result["data"]["extract"]["fullDatacellList"]), 1)
