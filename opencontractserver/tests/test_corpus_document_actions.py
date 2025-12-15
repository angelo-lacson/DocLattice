"""
Tests for corpus document actions and the deferred action architecture.

Architecture Overview:
---------------------
Corpus actions (analyzers, fieldsets, agents) should only run AFTER documents
are fully processed (parsed, thumbnailed). This is achieved through an event-driven
architecture:

1. When a document is ADDED to a corpus (M2M signal):
   - If document is READY (backend_lock=False): trigger actions immediately
   - If document is PROCESSING (backend_lock=True): skip it (handled later)

2. When document processing COMPLETES (document_processing_complete signal):
   - Check all corpuses the document belongs to
   - Trigger ADD_DOCUMENT actions for each corpus

See docs/architecture/agent_corpus_actions_design.md for full details.
"""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db.models.signals import m2m_changed
from django.test import TestCase

from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusActionTrigger
from opencontractserver.corpuses.signals import (
    handle_document_added_to_corpus,
    handle_document_processing_complete,
)
from opencontractserver.documents.models import Document
from opencontractserver.documents.signals import document_processing_complete
from opencontractserver.extracts.models import Column, Extract, Fieldset
from opencontractserver.tasks.corpus_tasks import process_corpus_action

User = get_user_model()


@pytest.mark.django_db
class TestCorpusDocumentActions(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)
        self.document = Document.objects.create(
            title="Test Document", creator=self.user
        )
        self.task_based_analyzer = Analyzer.objects.create(
            description="Test Analyzer", creator=self.user, task_name="not.a.real.task"
        )
        self.gremlin_engine = GremlinEngine.objects.create(
            url="http://test-gremlin-engine.com", creator=self.user
        )
        # Create an Analyzer
        self.analyzer = Analyzer.objects.create(
            id="don't do a thing",
            description="Test Analyzer",
            creator=self.user,
            host_gremlin=self.gremlin_engine,
        )
        self.fieldset = Fieldset.objects.create(name="Test Fieldset", creator=self.user)
        self.column = Column.objects.create(
            fieldset=self.fieldset,
            name="Test Column",
            query="Test Query",
            output_type="str",
            creator=self.user,
        )

    @patch("opencontractserver.tasks.corpus_tasks.process_corpus_action.si")
    def test_add_doc_signal(self, mock_task):

        added_doc, status, doc_path = self.corpus.add_document(
            document=self.document, user=self.user
        )

        # Verify the DocumentPath was created properly
        self.assertIsNotNone(doc_path)
        self.assertEqual(doc_path.corpus, self.corpus)
        self.assertEqual(doc_path.document, added_doc)
        self.assertTrue(doc_path.is_current)
        self.assertFalse(doc_path.is_deleted)

        # The M2M signal fires automatically when corpus.add_document() is called
        # because it maintains the M2M relationship via self.documents.add().
        # This triggers the handle_document_added_to_corpus signal which calls
        # process_corpus_action.si().apply_async() automatically.
        mock_task.assert_called_once_with(
            corpus_id=self.corpus.id,
            document_ids=[added_doc.id],
            user_id=self.corpus.creator.id,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
        )
        mock_task.return_value.apply_async.assert_called_once()

    def test_process_corpus_action_with_task_based_analyzer(self):
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.task_based_analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        process_corpus_action.si(
            self.corpus.id, [self.document.id], self.user.id
        ).apply().get()

        self.assertEqual(Analysis.objects.all().count(), 1)

    def test_process_corpus_action_with_analyzer(self):
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        process_corpus_action.si(
            self.corpus.id, [self.document.id], self.user.id
        ).apply()

        analyses = Analysis.objects.all()
        self.assertEqual(1, analyses.count())
        self.assertEqual(analyses[0].analyzed_corpus.id, self.corpus.id)
        self.assertEqual(analyses[0].analyzer.id, self.analyzer.id)

    def test_multiple_corpus_actions(self):

        CorpusAction.objects.create(
            corpus=self.corpus,
            fieldset=self.fieldset,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )
        CorpusAction.objects.create(
            corpus=self.corpus,
            analyzer=self.analyzer,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
            creator=self.user,
        )

        process_corpus_action.si(
            self.corpus.id, [self.document.id], self.user.id
        ).apply()

        analyses = Analysis.objects.all()
        self.assertEqual(1, analyses.count())
        self.assertEqual(analyses[0].analyzed_corpus.id, self.corpus.id)
        self.assertEqual(analyses[0].analyzer.id, self.analyzer.id)

        extracts = Extract.objects.all()
        self.assertEqual(1, extracts.count())
        self.assertEqual(extracts[0].corpus.id, self.corpus.id)
        self.assertEqual(extracts[0].fieldset.id, self.fieldset.id)

    @patch("opencontractserver.tasks.corpus_tasks.process_corpus_action.si")
    def test_locked_document_skipped_by_m2m_signal(self, mock_task):
        """
        Test that documents still being processed (backend_lock=True) are skipped
        by the M2M signal. Actions for these docs will be triggered later when
        document_processing_complete fires.
        """
        # Create a locked document (simulating one still being parsed)
        locked_doc = Document.objects.create(
            title="Locked Document",
            creator=self.user,
            backend_lock=True,  # Still processing
        )

        # Add the locked document to corpus
        added_doc, status, doc_path = self.corpus.add_document(
            document=locked_doc, user=self.user
        )

        # The M2M signal should NOT have triggered process_corpus_action
        # because the document is still locked
        mock_task.assert_not_called()

    @patch("opencontractserver.tasks.corpus_tasks.process_corpus_action.si")
    def test_document_processing_complete_triggers_corpus_actions(self, mock_task):
        """
        Test that when document_processing_complete fires, it triggers
        corpus actions for all corpuses the document belongs to.
        """
        # Create a document and add it to corpus (bypassing the signal for setup)
        doc = Document.objects.create(
            title="Test Doc",
            creator=self.user,
            backend_lock=False,
        )

        # Manually add to M2M to avoid triggering the M2M signal
        self.corpus.documents.add(doc)
        mock_task.reset_mock()

        # Now fire the document_processing_complete signal
        document_processing_complete.send(
            sender=Document,
            document=doc,
            user_id=self.user.id,
        )

        # Should have triggered process_corpus_action for the corpus
        mock_task.assert_called_once_with(
            corpus_id=self.corpus.id,
            document_ids=[doc.id],
            user_id=self.corpus.creator.id,
            trigger=CorpusActionTrigger.ADD_DOCUMENT,
        )
        mock_task.return_value.apply_async.assert_called_once()

    @patch("opencontractserver.tasks.corpus_tasks.process_corpus_action.si")
    def test_document_processing_complete_no_corpus_no_action(self, mock_task):
        """
        Test that document_processing_complete does NOT trigger actions
        if the document is not in any corpus.
        """
        # Create a document NOT in any corpus
        doc = Document.objects.create(
            title="Orphan Doc",
            creator=self.user,
            backend_lock=False,
        )

        # Fire the document_processing_complete signal
        document_processing_complete.send(
            sender=Document,
            document=doc,
            user_id=self.user.id,
        )

        # Should NOT have triggered any corpus actions
        mock_task.assert_not_called()

    @patch("opencontractserver.tasks.corpus_tasks.process_corpus_action.si")
    def test_document_in_multiple_corpuses_triggers_all(self, mock_task):
        """
        Test that when a document is in multiple corpuses, document_processing_complete
        triggers actions for ALL of them.
        """
        # Create a second corpus
        corpus2 = Corpus.objects.create(title="Second Corpus", creator=self.user)

        # Create a document
        doc = Document.objects.create(
            title="Multi-corpus Doc",
            creator=self.user,
            backend_lock=False,
        )

        # Add to both corpuses (bypassing signal for setup)
        self.corpus.documents.add(doc)
        corpus2.documents.add(doc)
        mock_task.reset_mock()

        # Fire the document_processing_complete signal
        document_processing_complete.send(
            sender=Document,
            document=doc,
            user_id=self.user.id,
        )

        # Should have triggered process_corpus_action for BOTH corpuses
        self.assertEqual(mock_task.call_count, 2)

        # Verify both corpus IDs were called
        called_corpus_ids = {
            call.kwargs["corpus_id"] for call in mock_task.call_args_list
        }
        self.assertEqual(called_corpus_ids, {self.corpus.id, corpus2.id})

    def tearDown(self):
        m2m_changed.disconnect(
            handle_document_added_to_corpus, sender=Corpus.documents.through
        )
        document_processing_complete.disconnect(
            handle_document_processing_complete, sender=Document
        )
