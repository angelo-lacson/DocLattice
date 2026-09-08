"""Upgrade regressions for persisted component paths and encrypted credentials."""

import json
from importlib import import_module
from types import SimpleNamespace
from typing import ClassVar

from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.state import StateApps
from django.test import TestCase, override_settings
from django_celery_beat.models import IntervalSchedule, PeriodicTask

from doclatticeserver.analyzer.models import Analysis, Analyzer
from doclatticeserver.annotations.models import Embedding
from doclatticeserver.corpuses.models import Corpus
from doclatticeserver.documents.models import Document, PipelineSettings
from doclatticeserver.extracts.models import Column, Fieldset
from doclatticeserver.types.enums import ExportType
from doclatticeserver.users.models import User, UserExport

MIGRATION = import_module(
    "doclatticeserver.documents.migrations.0044_rebrand_component_paths"
)
# These spellings are intentional: the migration must upgrade real old data.
OLD_PARSER = "opencontractserver.pipeline.parsers.oc_text_parser.TxtParser"
OLD_EMBEDDER = "opencontractserver.pipeline.embedders.test_embedder.TestEmbedder"
OLD_TASK = "opencontractserver.tasks.data_extract_tasks.doc_extract_query_task"
OLD_POSTPROCESSOR = (
    "opencontractserver.pipeline.post_processors.pdf_redactor.PdfRedactor"
)
NEW_PARSER = "doclatticeserver.pipeline.parsers.oc_text_parser.TxtParser"
NEW_EMBEDDER = "doclatticeserver.pipeline.embedders.test_embedder.TestEmbedder"
NEW_TASK = "doclatticeserver.tasks.data_extract_tasks.doc_extract_query_task"
NEW_POSTPROCESSOR = "doclatticeserver.pipeline.post_processors.pdf_redactor.PdfRedactor"


@override_settings(PIPELINE_SETTINGS_ENCRYPTION_ITERATIONS=1000)
class ComponentPathMigrationTest(TestCase):
    historical_apps: ClassVar[StateApps]

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.historical_apps = (
            MigrationExecutor(connection)
            .loader.project_state([("documents", "0044_rebrand_component_paths")])
            .apps
        )

    def setUp(self):
        self.user = User.objects.create_user(username="rebrand-upgrade", password="x")
        self.pipeline = PipelineSettings.get_instance(use_cache=False)
        self.pipeline.preferred_parsers = {"text/plain": OLD_PARSER}
        self.pipeline.preferred_enrichers = {"application/pdf": [OLD_PARSER]}
        self.pipeline.enabled_components = [OLD_PARSER, OLD_EMBEDDER]
        self.pipeline.default_embedder = OLD_EMBEDDER
        self.pipeline.default_reranker = "vendor.reranker.CustomReranker"
        self.pipeline.parser_kwargs = {OLD_PARSER: {"api_key": OLD_TASK}}
        self.pipeline.component_settings = {OLD_PARSER: {"timeout": 37}}
        self.secrets = {
            OLD_PARSER: {"api_key": OLD_TASK, "opaque_token": "keep-exactly"},
            "external_tool": {"token": "custom-secret"},
        }
        self.pipeline.set_secrets(self.secrets)
        self.pipeline.save()

    def migrate(self, backwards=False):
        operation = MIGRATION.backwards if backwards else MIGRATION.forwards
        with transaction.atomic():
            operation(self.historical_apps, SimpleNamespace(connection=connection))

    def test_pipeline_paths_and_secret_keys_upgrade_without_changing_credentials(self):
        cache.set(PipelineSettings.CACHE_KEY, self.pipeline)
        self.migrate()
        self.pipeline.refresh_from_db()
        self.assertEqual(self.pipeline.preferred_parsers, {"text/plain": NEW_PARSER})
        self.assertEqual(
            self.pipeline.preferred_enrichers, {"application/pdf": [NEW_PARSER]}
        )
        self.assertEqual(self.pipeline.enabled_components, [NEW_PARSER, NEW_EMBEDDER])
        self.assertEqual(self.pipeline.default_embedder, NEW_EMBEDDER)
        self.assertEqual(
            self.pipeline.default_reranker, "vendor.reranker.CustomReranker"
        )
        self.assertEqual(
            self.pipeline.parser_kwargs, {NEW_PARSER: {"api_key": OLD_TASK}}
        )
        self.assertEqual(
            self.pipeline.component_settings, {NEW_PARSER: {"timeout": 37}}
        )
        self.assertEqual(
            self.pipeline.get_secrets(),
            {
                NEW_PARSER: self.secrets[OLD_PARSER],
                "external_tool": self.secrets["external_tool"],
            },
        )
        self.assertIsNone(cache.get(PipelineSettings.CACHE_KEY))
        assert self.pipeline.encrypted_secrets is not None
        self.assertNotIn(b"keep-exactly", bytes(self.pipeline.encrypted_secrets))

    def test_existing_embeddings_remain_searchable_and_keep_their_vectors(self):
        corpus = Corpus.objects.create(title="Existing corpus", creator=self.user)
        Corpus.objects.filter(pk=corpus.pk).update(
            preferred_embedder=OLD_EMBEDDER,
            created_with_embedder=OLD_EMBEDDER,
            post_processors=[OLD_POSTPROCESSOR, "vendor.custom.processor"],
        )
        document = Document.objects.create(title="Existing document", creator=self.user)
        vector = [0.25] * 384
        embedding = Embedding.objects.create(
            document=document,
            embedder_path=OLD_EMBEDDER,
            vector_384=vector,
            creator=self.user,
        )
        export = UserExport.objects.create(
            creator=self.user, post_processors=[OLD_POSTPROCESSOR]
        )
        self.migrate()
        corpus.refresh_from_db()
        embedding.refresh_from_db()
        export.refresh_from_db()
        self.assertEqual(corpus.preferred_embedder, NEW_EMBEDDER)
        self.assertEqual(corpus.created_with_embedder, NEW_EMBEDDER)
        self.assertEqual(
            corpus.post_processors, [NEW_POSTPROCESSOR, "vendor.custom.processor"]
        )
        self.assertEqual(export.post_processors, [NEW_POSTPROCESSOR])
        self.assertEqual(list(embedding.vector_384), vector)
        self.assertEqual(
            Embedding.objects.get(document=document, embedder_path=NEW_EMBEDDER).pk,
            embedding.pk,
        )

    def test_task_dispatch_updates_while_analyzer_ids_and_relationships_stay_stable(
        self,
    ):
        analyzer = Analyzer.objects.create(
            id=OLD_TASK, task_name=OLD_TASK, creator=self.user
        )
        analysis = Analysis.objects.create(analyzer=analyzer, creator=self.user)
        fieldset = Fieldset.objects.create(name="Existing fields", creator=self.user)
        column = Column.objects.create(
            fieldset=fieldset, task_name=OLD_TASK, output_type="str", creator=self.user
        )
        interval = IntervalSchedule.objects.create(every=10, period="minutes")
        periodic = PeriodicTask.objects.create(
            name="existing-component-job",
            task=OLD_TASK,
            interval=interval,
            args=json.dumps([OLD_EMBEDDER]),
            kwargs=json.dumps(
                {
                    "embedder_path": OLD_EMBEDDER,
                    "custom": "vendor.custom",
                    "prompt": OLD_EMBEDDER,
                    "api_key": OLD_TASK,
                }
            ),
        )
        self.migrate()
        analyzer.refresh_from_db()
        analysis.refresh_from_db()
        column.refresh_from_db()
        periodic.refresh_from_db()
        self.assertEqual(analyzer.pk, OLD_TASK)
        self.assertEqual(analysis.analyzer_id, OLD_TASK)
        self.assertEqual(analyzer.task_name, NEW_TASK)
        self.assertEqual(column.task_name, NEW_TASK)
        self.assertEqual(periodic.task, NEW_TASK)
        self.assertEqual(json.loads(periodic.args), [OLD_EMBEDDER])
        self.assertEqual(
            json.loads(periodic.kwargs),
            {
                "embedder_path": NEW_EMBEDDER,
                "custom": "vendor.custom",
                "prompt": OLD_EMBEDDER,
                "api_key": OLD_TASK,
            },
        )

    def test_forward_is_idempotent_and_reverse_restores_legacy_paths(self):
        self.migrate()
        self.pipeline.refresh_from_db()
        assert self.pipeline.encrypted_secrets is not None
        encrypted = bytes(self.pipeline.encrypted_secrets)
        self.migrate()
        self.pipeline.refresh_from_db()
        assert self.pipeline.encrypted_secrets is not None
        self.assertEqual(bytes(self.pipeline.encrypted_secrets), encrypted)
        self.migrate(backwards=True)
        self.pipeline.refresh_from_db()
        self.assertEqual(self.pipeline.default_embedder, OLD_EMBEDDER)
        self.assertEqual(self.pipeline.get_secrets(), self.secrets)

    def test_export_formats_upgrade_exact_enum_values_and_reverse(self):
        original_formats = ("OPEN_CONTRACTS", "OPEN_CONTRACTS_V2", "FUNSD")
        exports = [
            UserExport.objects.create(
                creator=self.user,
                format=format_name,
                name="OPEN_CONTRACTS",
                input_kwargs={"api_key": "OPEN_CONTRACTS_V2"},
            )
            for format_name in original_formats
        ]
        self.migrate()
        for export, expected in zip(exports, ("DOCLATTICE", "DOCLATTICE_V2", "FUNSD")):
            export.refresh_from_db()
            self.assertEqual(ExportType(export.format).value, expected)
            self.assertEqual(export.name, "OPEN_CONTRACTS")
            self.assertEqual(export.input_kwargs, {"api_key": "OPEN_CONTRACTS_V2"})
        self.migrate(backwards=True)
        for export, expected in zip(exports, original_formats):
            export.refresh_from_db()
            self.assertEqual(export.format, expected)

    def test_unreadable_secrets_abort_without_discarding_them(self):
        PipelineSettings.objects.filter(pk=self.pipeline.pk).update(
            encrypted_secrets=b"unreadable"
        )
        with self.assertRaisesRegex(RuntimeError, "original DJANGO_SECRET_KEY"):
            self.migrate()
        self.pipeline.refresh_from_db()
        assert self.pipeline.encrypted_secrets is not None
        self.assertEqual(bytes(self.pipeline.encrypted_secrets), b"unreadable")
        self.assertEqual(self.pipeline.default_embedder, OLD_EMBEDDER)

    def test_conflicting_secret_keys_abort_without_overwriting_credentials(self):
        self.pipeline.set_secrets(
            {OLD_PARSER: {"api_key": "first"}, NEW_PARSER: {"api_key": "second"}}
        )
        self.pipeline.save()
        with self.assertRaisesRegex(RuntimeError, "conflicting legacy and current"):
            self.migrate()
        self.pipeline.refresh_from_db()
        self.assertEqual(self.pipeline.get_secrets()[OLD_PARSER]["api_key"], "first")
        self.assertEqual(self.pipeline.get_secrets()[NEW_PARSER]["api_key"], "second")

    def test_duplicate_embedding_identity_rolls_back_prior_configuration_changes(self):
        document = Document.objects.create(
            title="Duplicate identity", creator=self.user
        )
        for path in (OLD_EMBEDDER, NEW_EMBEDDER):
            Embedding.objects.create(
                document=document, embedder_path=path, creator=self.user
            )
        with self.assertRaises(IntegrityError):
            self.migrate()
        self.pipeline.refresh_from_db()
        self.assertEqual(self.pipeline.default_embedder, OLD_EMBEDDER)
        self.assertEqual(Embedding.objects.filter(document=document).count(), 2)
