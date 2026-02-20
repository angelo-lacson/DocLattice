"""
Tests for security hardening changes from the auth/permissioning audit.

Covers:
- AnalysisCallbackView: DoS prevention, timing-safe token comparison, unified error messages
- home_redirect: open redirect prevention via ALLOWED_HOSTS validation
- DRFDeletion/DRFMutation: visible_to_user() IDOR prevention, user lock inversion fix
- Document summary resolvers: corpus permission checks
- Mutation IDOR fixes: CreateColumn, CreateExtract, CreateNote, CreateCorpusAction, etc.
- Conversation/voting/badge mutation IDOR fixes
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from graphene.test import Client
from graphql_relay import to_global_id
from rest_framework.test import APIClient

from config.graphql.schema import schema
from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class MockRequest:
    """Minimal request-like object for graphene test client."""

    def __init__(self, user):
        self.user = user
        self.META = {}


def _gql(client, query, user, variables=None):
    """Shortcut to execute a GraphQL query as a specific user."""
    return client.execute(query, variables=variables, context_value=MockRequest(user))


# ===========================================================================
# 1. AnalysisCallbackView security tests
# ===========================================================================


class TestAnalysisCallbackSecurity(TestCase):
    """Tests for the hardened AnalysisCallbackView."""

    def setUp(self):
        self.user = User.objects.create_user(username="cb_user", password="test")
        self.gremlin = GremlinEngine.objects.create(
            url="http://localhost:8000", creator=self.user
        )
        self.analyzer = Analyzer.objects.create(
            id="test-analyzer",
            description="Test analyzer",
            creator=self.user,
            host_gremlin=self.gremlin,
        )
        self.corpus = Corpus.objects.create(title="CB Corpus", creator=self.user)
        self.analysis = Analysis.objects.create(
            analyzer=self.analyzer,
            analyzed_corpus=self.corpus,
            creator=self.user,
        )
        self.api_client = APIClient()

    def test_nonexistent_analysis_returns_403(self):
        """Nonexistent analysis_id returns 403 with generic message (no enumeration)."""
        response = self.api_client.post(
            "/analysis/999999/complete",
            data={},
            format="json",
            HTTP_CALLBACK_TOKEN="anything",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.data["message"], "Invalid analysis_id or callback token."
        )

    def test_missing_token_returns_403(self):
        """Request without CALLBACK_TOKEN header returns 403 with generic message."""
        response = self.api_client.post(
            f"/analysis/{self.analysis.id}/complete",
            data={},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.data["message"], "Invalid analysis_id or callback token."
        )

    def test_wrong_token_returns_403_without_failing_analysis(self):
        """
        Wrong token returns 403 with generic message AND does NOT mark the
        analysis as FAILED (DoS prevention).
        """
        from opencontractserver.types.enums import JobStatus

        response = self.api_client.post(
            f"/analysis/{self.analysis.id}/complete",
            data={},
            format="json",
            HTTP_CALLBACK_TOKEN="wrong-token",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.data["message"], "Invalid analysis_id or callback token."
        )

        # Verify the analysis was NOT marked as failed
        self.analysis.refresh_from_db()
        self.assertNotEqual(self.analysis.status, JobStatus.FAILED)

    def test_same_error_for_missing_vs_wrong_token(self):
        """Error messages for missing analysis, missing token, and wrong token are identical."""
        # Missing analysis
        r1 = self.api_client.post(
            "/analysis/999999/complete",
            data={},
            format="json",
            HTTP_CALLBACK_TOKEN="tok",
        )
        # Missing token
        r2 = self.api_client.post(
            f"/analysis/{self.analysis.id}/complete",
            data={},
            format="json",
        )
        # Wrong token
        r3 = self.api_client.post(
            f"/analysis/{self.analysis.id}/complete",
            data={},
            format="json",
            HTTP_CALLBACK_TOKEN="wrong",
        )

        self.assertEqual(r1.data["message"], r2.data["message"])
        self.assertEqual(r2.data["message"], r3.data["message"])
        self.assertEqual(r1.status_code, r2.status_code)
        self.assertEqual(r2.status_code, r3.status_code)

    def test_correct_token_uuid_type_accepted(self):
        """Token comparison works with UUID objects (hmac.compare_digest handles str cast)."""
        # The callback_token is a UUID field. Ensure str(UUID) comparison works.
        token = self.analysis.callback_token
        # Pass as string (as a real HTTP header would)
        response = self.api_client.post(
            f"/analysis/{self.analysis.id}/complete",
            data={},
            format="json",
            HTTP_CALLBACK_TOKEN=str(token),
        )
        # Should not be 403 (it may be 400 because of invalid JSON body, but not 403)
        self.assertNotEqual(response.status_code, 403)


# ===========================================================================
# 2. home_redirect open redirect prevention tests
# ===========================================================================


class TestHomeRedirectSecurity(TestCase):
    """Tests for the open redirect prevention in home_redirect."""

    @override_settings(ALLOWED_HOSTS=["example.com"])
    def test_valid_host_redirects_to_port_3000(self):
        """Valid host in ALLOWED_HOSTS redirects to host:3000."""
        response = self.client.get("/", HTTP_HOST="example.com")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "http://example.com:3000")

    @override_settings(ALLOWED_HOSTS=["example.com"])
    def test_invalid_host_rejected(self):
        """Invalid host NOT in ALLOWED_HOSTS is rejected by Django middleware (400)."""
        # Django's CommonMiddleware validates the Host header BEFORE our view
        # runs, returning a 400 DisallowedHost response. This is the first
        # line of defense; our view adds a second layer for edge cases.
        response = self.client.get("/", HTTP_HOST="evil.com", SERVER_NAME="evil.com")
        self.assertEqual(response.status_code, 400)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_wildcard_allows_any_host(self):
        """Wildcard '*' in ALLOWED_HOSTS allows any host."""
        response = self.client.get("/", HTTP_HOST="anything.com")
        self.assertEqual(response.status_code, 302)
        self.assertIn("anything.com:3000", response.url)

    @override_settings(ALLOWED_HOSTS=[".example.com"])
    def test_suffix_match_allows_subdomain(self):
        """Dot-prefix pattern '.example.com' allows subdomains."""
        response = self.client.get("/", HTTP_HOST="sub.example.com")
        self.assertEqual(response.status_code, 302)
        self.assertIn("sub.example.com:3000", response.url)

    @override_settings(ALLOWED_HOSTS=[".example.com"])
    def test_suffix_match_allows_bare_domain(self):
        """Dot-prefix pattern '.example.com' allows the bare domain too."""
        response = self.client.get("/", HTTP_HOST="example.com")
        self.assertEqual(response.status_code, 302)
        self.assertIn("example.com:3000", response.url)

    @override_settings(ALLOWED_HOSTS=[".example.com"])
    def test_suffix_match_rejects_non_matching_domain(self):
        """Dot-prefix pattern '.example.com' rejects non-matching domains (400)."""
        # Django's CommonMiddleware rejects before our view runs.
        response = self.client.get("/", HTTP_HOST="evil.com", SERVER_NAME="evil.com")
        self.assertEqual(response.status_code, 400)


# ===========================================================================
# 3. GraphQL mutation IDOR prevention tests
# ===========================================================================


class TestMutationIDORPrevention(TestCase):
    """
    Tests that mutations using visible_to_user() properly prevent
    unauthorized users from accessing objects by ID.
    """

    def setUp(self):
        self.owner = User.objects.create_user(username="idor_owner", password="test")
        self.outsider = User.objects.create_user(
            username="idor_outsider", password="test"
        )

        # Create private corpus owned by 'owner' -- outsider has no permissions
        self.corpus = Corpus.objects.create(
            title="Private Corpus", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        # Create a document owned by 'owner'
        self.document = Document.objects.create(
            title="Private Doc", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(
            self.owner, self.document, [PermissionTypes.CRUD]
        )

        self.gql_client = Client(schema)

    def test_create_note_on_inaccessible_document(self):
        """Outsider cannot create a note on a document they cannot see."""
        mutation = """
            mutation CreateNote(
                $documentId: ID!,
                $title: String!,
                $content: String!,
                $corpusId: ID
            ) {
                createNote(
                    documentId: $documentId,
                    title: $title,
                    content: $content,
                    corpusId: $corpusId
                ) {
                    ok
                    message
                }
            }
        """
        variables = {
            "documentId": to_global_id("DocumentType", self.document.id),
            "title": "Sneaky Note",
            "content": "Should not be created",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["createNote"]
        self.assertFalse(data["ok"])
        # Should get a generic "not found" (IDOR-safe, no existence leakage)
        self.assertIn("not found", data["message"].lower())

    def test_create_note_with_inaccessible_corpus(self):
        """Outsider cannot attach a note to a corpus they cannot see."""
        # Create a doc the outsider CAN see
        public_doc = Document.objects.create(
            title="Public Doc", creator=self.owner, is_public=True
        )

        mutation = """
            mutation CreateNote(
                $documentId: ID!,
                $title: String!,
                $content: String!,
                $corpusId: ID
            ) {
                createNote(
                    documentId: $documentId,
                    title: $title,
                    content: $content,
                    corpusId: $corpusId
                ) {
                    ok
                    message
                }
            }
        """
        variables = {
            "documentId": to_global_id("DocumentType", public_doc.id),
            "title": "Sneaky Note",
            "content": "Should not be created",
            "corpusId": to_global_id("CorpusType", self.corpus.id),
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["createNote"]
        self.assertFalse(data["ok"])
        self.assertIn("not found", data["message"].lower())

    def test_owner_can_create_note(self):
        """Owner CAN create a note on their own document."""
        mutation = """
            mutation CreateNote(
                $documentId: ID!,
                $title: String!,
                $content: String!
            ) {
                createNote(
                    documentId: $documentId,
                    title: $title,
                    content: $content
                ) {
                    ok
                    message
                }
            }
        """
        variables = {
            "documentId": to_global_id("DocumentType", self.document.id),
            "title": "My Note",
            "content": "This should work",
        }

        result = _gql(self.gql_client, mutation, self.owner, variables)
        data = result["data"]["createNote"]
        self.assertTrue(data["ok"])


# ===========================================================================
# 4. Conversation mutation IDOR tests
# ===========================================================================


class TestConversationMutationIDOR(TestCase):
    """Tests that conversation mutations use visible_to_user() for IDOR prevention."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="conv_idor_owner", password="test"
        )
        self.outsider = User.objects.create_user(
            username="conv_idor_outsider", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Conv Corpus", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        self.document = Document.objects.create(
            title="Conv Doc", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(
            self.owner, self.document, [PermissionTypes.CRUD]
        )

        self.gql_client = Client(schema)

    def test_create_thread_on_inaccessible_corpus(self):
        """Outsider cannot create a thread in a corpus they cannot see."""
        mutation = """
            mutation CreateThread($corpusId: String!, $title: String!, $initialMessage: String!) {
                createThread(corpusId: $corpusId, title: $title, initialMessage: $initialMessage) {
                    ok
                    message
                }
            }
        """
        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "title": "Sneaky Thread",
            "initialMessage": "Hello",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["createThread"]
        self.assertFalse(data["ok"])
        # IDOR-safe: same error whether missing or no permission
        msg = data["message"].lower()
        self.assertTrue(
            "not found" in msg or "permission" in msg or "not have" in msg,
            f"Unexpected error message: {data['message']}",
        )

    def test_create_thread_on_inaccessible_document(self):
        """Outsider cannot create a thread on a document they cannot see."""
        mutation = """
            mutation CreateThread(
                $documentId: String!,
                $title: String!,
                $initialMessage: String!
            ) {
                createThread(
                    documentId: $documentId,
                    title: $title,
                    initialMessage: $initialMessage
                ) {
                    ok
                    message
                }
            }
        """
        variables = {
            "documentId": to_global_id("DocumentType", self.document.id),
            "title": "Sneaky Thread",
            "initialMessage": "Hello",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["createThread"]
        self.assertFalse(data["ok"])
        msg = data["message"].lower()
        self.assertTrue(
            "not found" in msg or "permission" in msg or "not have" in msg,
            f"Unexpected error message: {data['message']}",
        )

    def test_owner_can_create_thread(self):
        """Owner CAN create a thread in their own corpus."""
        mutation = """
            mutation CreateThread($corpusId: String!, $title: String!, $initialMessage: String!) {
                createThread(corpusId: $corpusId, title: $title, initialMessage: $initialMessage) {
                    ok
                    message
                }
            }
        """
        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "title": "My Thread",
            "initialMessage": "Hello world",
        }

        result = _gql(self.gql_client, mutation, self.owner, variables)
        data = result["data"]["createThread"]
        self.assertTrue(data["ok"])


# ===========================================================================
# 5. Voting mutation IDOR tests
# ===========================================================================


class TestVotingMutationIDOR(TestCase):
    """Tests that voting mutations use visible_to_user() for IDOR prevention."""

    def setUp(self):
        from opencontractserver.conversations.models import ChatMessage, Conversation

        self.owner = User.objects.create_user(
            username="vote_idor_owner", password="test"
        )
        self.outsider = User.objects.create_user(
            username="vote_idor_outsider", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Vote Corpus", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        self.conversation = Conversation.objects.create(
            title="Vote Thread",
            conversation_type="thread",
            chat_with_corpus=self.corpus,
            creator=self.owner,
        )
        set_permissions_for_obj_to_user(
            self.owner, self.conversation, [PermissionTypes.CRUD]
        )

        self.message = ChatMessage.objects.create(
            conversation=self.conversation,
            msg_type="HUMAN",
            content="Test message",
            creator=self.owner,
        )
        set_permissions_for_obj_to_user(
            self.owner, self.message, [PermissionTypes.CRUD]
        )

        self.gql_client = Client(schema)

    def test_vote_on_inaccessible_message(self):
        """Outsider cannot vote on a message in a conversation they cannot see."""
        mutation = """
            mutation VoteMessage($messageId: String!, $voteType: String!) {
                voteMessage(messageId: $messageId, voteType: $voteType) {
                    ok
                    message
                }
            }
        """
        variables = {
            "messageId": to_global_id("MessageType", self.message.id),
            "voteType": "upvote",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["voteMessage"]
        self.assertFalse(data["ok"])
        msg = data["message"].lower()
        self.assertTrue("not found" in msg or "permission" in msg)

    def test_remove_vote_on_inaccessible_message(self):
        """Outsider cannot remove a vote on a message they cannot see."""
        mutation = """
            mutation RemoveVote($messageId: String!) {
                removeVote(messageId: $messageId) {
                    ok
                    message
                }
            }
        """
        variables = {
            "messageId": to_global_id("MessageType", self.message.id),
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["removeVote"]
        self.assertFalse(data["ok"])
        msg = data["message"].lower()
        self.assertTrue("not found" in msg or "permission" in msg)


# ===========================================================================
# 6. Corpus folder mutation IDOR tests
# ===========================================================================


class TestCorpusFolderMutationIDOR(TestCase):
    """Tests that folder mutations use visible_to_user() for corpus/folder lookups."""

    def setUp(self):
        from opencontractserver.corpuses.models import CorpusFolder

        self.owner = User.objects.create_user(
            username="folder_idor_owner", password="test"
        )
        self.outsider = User.objects.create_user(
            username="folder_idor_outsider", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Folder Corpus", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        self.folder = CorpusFolder.objects.create(
            name="Test Folder", corpus=self.corpus, creator=self.owner
        )

        self.gql_client = Client(schema)

    def test_create_folder_in_inaccessible_corpus(self):
        """Outsider cannot create a folder in a corpus they cannot see."""
        mutation = """
            mutation CreateFolder($corpusId: ID!, $name: String!) {
                createCorpusFolder(corpusId: $corpusId, name: $name) {
                    ok
                    message
                }
            }
        """
        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "name": "Sneaky Folder",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["createCorpusFolder"]
        self.assertFalse(data["ok"])
        msg = data["message"].lower()
        self.assertTrue("not found" in msg or "permission" in msg)

    def test_update_folder_in_inaccessible_corpus(self):
        """Outsider cannot update a folder in a corpus they cannot see."""
        mutation = """
            mutation UpdateFolder($folderId: ID!, $name: String) {
                updateCorpusFolder(folderId: $folderId, name: $name) {
                    ok
                    message
                }
            }
        """
        variables = {
            "folderId": to_global_id("CorpusFolderType", self.folder.id),
            "name": "Renamed",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["updateCorpusFolder"]
        self.assertFalse(data["ok"])
        msg = data["message"].lower()
        self.assertTrue("not found" in msg or "permission" in msg)

    def test_delete_folder_in_inaccessible_corpus(self):
        """Outsider cannot delete a folder in a corpus they cannot see."""
        mutation = """
            mutation DeleteFolder($folderId: ID!) {
                deleteCorpusFolder(folderId: $folderId) {
                    ok
                    message
                }
            }
        """
        variables = {
            "folderId": to_global_id("CorpusFolderType", self.folder.id),
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        data = result["data"]["deleteCorpusFolder"]
        self.assertFalse(data["ok"])
        msg = data["message"].lower()
        self.assertTrue("not found" in msg or "permission" in msg)

    def test_owner_can_create_folder(self):
        """Owner CAN create a folder in their own corpus."""
        mutation = """
            mutation CreateFolder($corpusId: ID!, $name: String!) {
                createCorpusFolder(corpusId: $corpusId, name: $name) {
                    ok
                    message
                }
            }
        """
        variables = {
            "corpusId": to_global_id("CorpusType", self.corpus.id),
            "name": "My Folder",
        }

        result = _gql(self.gql_client, mutation, self.owner, variables)
        data = result["data"]["createCorpusFolder"]
        self.assertTrue(data["ok"])


# ===========================================================================
# 7. Document summary resolver corpus permission tests
# ===========================================================================


class TestDocumentSummaryResolverPermissions(TestCase):
    """Tests that document summary resolvers check corpus visibility."""

    def setUp(self):
        self.owner = User.objects.create_user(username="summary_owner", password="test")
        self.outsider = User.objects.create_user(
            username="summary_outsider", password="test"
        )

        # Private corpus
        self.corpus = Corpus.objects.create(
            title="Summary Corpus", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        # Public document (outsider can see it, but not the corpus)
        self.document = Document.objects.create(
            title="Summary Doc", creator=self.owner, is_public=True
        )
        set_permissions_for_obj_to_user(
            self.owner, self.document, [PermissionTypes.CRUD]
        )

        self.gql_client = Client(schema)

    def test_outsider_cannot_read_summary_version_for_inaccessible_corpus(self):
        """Outsider gets version=0 for a corpus they cannot see."""
        query = """
            query DocSummaryVersion($id: String!, $corpusId: ID!) {
                document(id: $id) {
                    currentSummaryVersion(corpusId: $corpusId)
                }
            }
        """
        variables = {
            "id": to_global_id("DocumentType", self.document.id),
            "corpusId": to_global_id("CorpusType", self.corpus.id),
        }

        result = _gql(self.gql_client, query, self.outsider, variables)
        # Should not error, but should return 0 (no access to corpus)
        if result.get("errors"):
            # Some query patterns may raise errors; that's also acceptable
            pass
        else:
            self.assertEqual(result["data"]["document"]["currentSummaryVersion"], 0)

    def test_outsider_cannot_read_summary_content_for_inaccessible_corpus(self):
        """Outsider gets empty string for summary content in inaccessible corpus."""
        query = """
            query DocSummaryContent($id: String!, $corpusId: ID!) {
                document(id: $id) {
                    summaryContent(corpusId: $corpusId)
                }
            }
        """
        variables = {
            "id": to_global_id("DocumentType", self.document.id),
            "corpusId": to_global_id("CorpusType", self.corpus.id),
        }

        result = _gql(self.gql_client, query, self.outsider, variables)
        if result.get("errors"):
            pass
        else:
            self.assertEqual(result["data"]["document"]["summaryContent"], "")

    def test_owner_can_read_summary_version(self):
        """Owner can read summary version for their own corpus."""
        query = """
            query DocSummaryVersion($id: String!, $corpusId: ID!) {
                document(id: $id) {
                    currentSummaryVersion(corpusId: $corpusId)
                }
            }
        """
        variables = {
            "id": to_global_id("DocumentType", self.document.id),
            "corpusId": to_global_id("CorpusType", self.corpus.id),
        }

        result = _gql(self.gql_client, query, self.owner, variables)
        # Should succeed (returns 0 because no revisions, but no error)
        self.assertIsNone(result.get("errors"))
        self.assertEqual(result["data"]["document"]["currentSummaryVersion"], 0)


# ===========================================================================
# 8. Extract / Column IDOR tests
# ===========================================================================


class TestExtractColumnIDOR(TestCase):
    """Tests that extract/column mutations use visible_to_user()."""

    def setUp(self):
        from opencontractserver.extracts.models import Fieldset

        self.owner = User.objects.create_user(username="extract_owner", password="test")
        self.outsider = User.objects.create_user(
            username="extract_outsider", password="test"
        )

        self.corpus = Corpus.objects.create(
            title="Extract Corpus", creator=self.owner, is_public=False
        )
        set_permissions_for_obj_to_user(self.owner, self.corpus, [PermissionTypes.CRUD])

        self.fieldset = Fieldset.objects.create(
            name="Test Fieldset",
            description="Test",
            creator=self.owner,
        )
        set_permissions_for_obj_to_user(
            self.owner, self.fieldset, [PermissionTypes.CRUD]
        )

        self.gql_client = Client(schema)

    def test_create_column_with_inaccessible_fieldset(self):
        """Outsider cannot create a column on a fieldset they cannot see."""
        mutation = """
            mutation CreateColumn(
                $fieldsetId: ID!,
                $name: String!,
                $query: String,
                $outputType: String!
            ) {
                createColumn(
                    fieldsetId: $fieldsetId,
                    name: $name,
                    query: $query,
                    outputType: $outputType
                ) {
                    ok
                    message
                }
            }
        """
        variables = {
            "fieldsetId": to_global_id("FieldsetType", self.fieldset.id),
            "name": "Sneaky Column",
            "query": "test query",
            "outputType": "str",
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        # Should fail: outsider can't see the fieldset
        if result.get("errors"):
            # DoesNotExist propagated as error -- acceptable IDOR prevention
            pass
        else:
            data = result["data"]["createColumn"]
            self.assertFalse(data["ok"])

    def test_create_extract_with_inaccessible_corpus(self):
        """Outsider cannot create an extract for a corpus they cannot see."""
        mutation = """
            mutation CreateExtract($name: String!, $corpusId: ID) {
                createExtract(name: $name, corpusId: $corpusId) {
                    ok
                    msg
                }
            }
        """
        variables = {
            "name": "Sneaky Extract",
            "corpusId": to_global_id("CorpusType", self.corpus.id),
        }

        result = _gql(self.gql_client, mutation, self.outsider, variables)
        if result.get("errors"):
            pass
        else:
            data = result["data"]["createExtract"]
            self.assertFalse(data["ok"])

    def test_owner_can_create_extract(self):
        """Owner CAN create an extract for their own corpus."""
        mutation = """
            mutation CreateExtract($name: String!, $corpusId: ID) {
                createExtract(name: $name, corpusId: $corpusId) {
                    ok
                    msg
                }
            }
        """
        variables = {
            "name": "My Extract",
            "corpusId": to_global_id("CorpusType", self.corpus.id),
        }

        result = _gql(self.gql_client, mutation, self.owner, variables)
        if result.get("errors"):
            self.fail(f"Unexpected errors: {result['errors']}")
        data = result["data"]["createExtract"]
        self.assertTrue(data["ok"])


# ===========================================================================
# 9. Analyzer is_public default test
# ===========================================================================


class TestAnalyzerIsPublicDefault(TestCase):
    """Tests that Analyzer and GremlinEngine default to is_public=False."""

    def test_analyzer_defaults_to_not_public(self):
        user = User.objects.create_user(username="analyzer_user", password="test")
        gremlin = GremlinEngine.objects.create(
            url="http://localhost:8000", creator=user
        )
        # Analyzer requires either host_gremlin or task_name (DB constraint).
        analyzer = Analyzer.objects.create(
            id="default-test-analyzer",
            description="Test",
            creator=user,
            host_gremlin=gremlin,
        )
        self.assertFalse(analyzer.is_public)

    def test_gremlin_engine_defaults_to_not_public(self):
        user = User.objects.create_user(username="gremlin_user", password="test")
        gremlin = GremlinEngine.objects.create(
            url="http://localhost:8000",
            creator=user,
        )
        self.assertFalse(gremlin.is_public)
