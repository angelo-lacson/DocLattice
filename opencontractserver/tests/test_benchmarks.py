"""Tests for the benchmark harness (``opencontractserver.benchmarks``).

Covers:

* Pure unit tests for the metrics module (no DB, no Celery).
* Adapter unit tests against the shipped micro fixture.
* A lightweight end-to-end runner test that mocks the structured-response
  agent so CI does not hit real LLMs.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest import TestCase as PyUnitTestCase
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from django.test.utils import override_settings

from opencontractserver.benchmarks.adapters.base import BenchmarkTask
from opencontractserver.benchmarks.adapters.legalbench_rag import (
    LEGALBENCH_RAG_SUBSETS,
    LegalBenchRAGAdapter,
)
from opencontractserver.benchmarks.loader import load_benchmark_into_corpus
from opencontractserver.benchmarks.metrics import (
    char_f1,
    char_iou,
    char_precision,
    char_precision_cross_doc,
    char_recall,
    char_recall_cross_doc,
    exact_match,
    normalize_answer,
    precision_at_k,
    recall_at_k,
    token_f1,
)
from opencontractserver.benchmarks.report import (
    BenchmarkReport,
    TaskResult,
    extract_usage_from_llm_log,
)
from opencontractserver.benchmarks.runner import run_benchmark
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Datacell
from opencontractserver.llms.api import AgentAPI

User = get_user_model()

MICRO_FIXTURE = (
    Path(__file__).resolve().parent.parent.parent
    / "fixtures"
    / "benchmarks"
    / "legalbench_rag_micro"
)


# --------------------------------------------------------------------------- #
# Pure-unit metric tests (no Django)
# --------------------------------------------------------------------------- #


class MetricsTestCase(PyUnitTestCase):
    """SQuAD + span metric sanity checks."""

    def test_normalize_answer_strips_articles_and_punctuation(self):
        self.assertEqual(normalize_answer("The Quick, Brown Fox!"), "quick brown fox")
        self.assertEqual(normalize_answer(None), "")

    def test_exact_match_is_normalization_aware(self):
        self.assertEqual(exact_match("The answer.", "answer"), 1.0)
        self.assertEqual(exact_match("different", "answer"), 0.0)

    def test_token_f1_perfect_and_zero(self):
        self.assertEqual(token_f1("hello world", "hello world"), 1.0)
        self.assertEqual(token_f1("hello world", "goodbye mars"), 0.0)

    def test_token_f1_partial_overlap(self):
        # Prediction = 3 tokens, gold = 3 tokens, 2 overlap
        # precision = 2/3, recall = 2/3, F1 = 2/3
        score = token_f1("hello brave world", "hello brave mars")
        self.assertAlmostEqual(score, 2 / 3, places=4)

    def test_token_f1_symmetric_empty(self):
        self.assertEqual(token_f1("", ""), 1.0)
        self.assertEqual(token_f1("", "something"), 0.0)

    def test_recall_at_k_and_precision_at_k(self):
        predicted = [(0, 10), (50, 60), (100, 110)]
        gold = [(5, 15), (200, 220)]
        # Top-2 predicted contains (0,10) which overlaps (5,15), and (50,60)
        # which overlaps nothing.  One of two gold is covered → recall 0.5.
        self.assertAlmostEqual(recall_at_k(predicted, gold, k=2), 0.5)
        # One of two top-2 predicted hits gold → precision 0.5.
        self.assertAlmostEqual(precision_at_k(predicted, gold, k=2), 0.5)

    def test_recall_at_k_zero_when_no_gold(self):
        self.assertEqual(recall_at_k([(0, 10)], [], k=5), 0.0)

    def test_char_iou(self):
        # Predicted union = {0..9}, gold union = {5..14}, intersection = {5..9}
        # |intersection| / |union| = 5 / 15
        self.assertAlmostEqual(char_iou([(0, 10)], [(5, 15)]), 5 / 15, places=4)
        self.assertEqual(char_iou([], []), 0.0)


# --------------------------------------------------------------------------- #
# LegalBench-RAG char-level metrics
# --------------------------------------------------------------------------- #


class LegalBenchCharMetricsTestCase(PyUnitTestCase):
    """Verify ``char_recall`` / ``char_precision`` match LB-RAG's formulas.

    Reference: ``legalbenchrag/run_benchmark.py`` lines 20-54 — precision is
    ``chars(retrieved ∩ gold) / chars(retrieved)`` and recall is
    ``chars(retrieved ∩ gold) / chars(gold)``.  These tests lock in that
    behaviour so a refactor can't silently drift.
    """

    def test_perfect_match_is_one_on_both(self):
        self.assertEqual(char_recall([(0, 100)], [(0, 100)]), 1.0)
        self.assertEqual(char_precision([(0, 100)], [(0, 100)]), 1.0)
        self.assertEqual(char_f1([(0, 100)], [(0, 100)]), 1.0)

    def test_no_overlap_is_zero(self):
        self.assertEqual(char_recall([(0, 50)], [(100, 200)]), 0.0)
        self.assertEqual(char_precision([(0, 50)], [(100, 200)]), 0.0)
        self.assertEqual(char_f1([(0, 50)], [(100, 200)]), 0.0)

    def test_partial_overlap_recall_uses_gold_denominator(self):
        # retrieved 100 chars, gold 200 chars, overlap 50 chars
        # recall = 50 / 200 = 0.25, precision = 50 / 100 = 0.5
        self.assertAlmostEqual(char_recall([(0, 100)], [(50, 250)]), 0.25)
        self.assertAlmostEqual(char_precision([(0, 100)], [(50, 250)]), 0.5)

    def test_overlapping_predictions_are_merged(self):
        # Two overlapping retrieved spans must not double-count intersection
        preds = [(0, 100), (50, 150)]  # merged → (0, 150), 150 chars
        gold = [(0, 200)]  # 200 chars, intersection with merged = 150
        self.assertAlmostEqual(char_recall(preds, gold), 150 / 200)
        self.assertAlmostEqual(char_precision(preds, gold), 150 / 150)

    def test_empty_gold_returns_zero_recall(self):
        # LB-RAG returns 0 when there is no gold — see line 54 of their code.
        self.assertEqual(char_recall([(0, 100)], []), 0.0)

    def test_empty_prediction_returns_zero_precision(self):
        # Mirrors LB-RAG line 35-36: precision of an empty retrieval is 0.
        self.assertEqual(char_precision([], [(0, 100)]), 0.0)

    def test_iou_is_not_same_as_recall_precision(self):
        # Sanity: IoU is symmetric, but recall/precision are not.
        preds = [(0, 100)]
        gold = [(50, 250)]  # overlap 50
        self.assertAlmostEqual(char_iou(preds, gold), 50 / 250)  # 200 + 100 - 50
        self.assertAlmostEqual(char_recall(preds, gold), 50 / 200)
        self.assertAlmostEqual(char_precision(preds, gold), 50 / 100)


class CrossDocCharMetricsTestCase(PyUnitTestCase):
    """``char_*_cross_doc`` honors LB-RAG's ``file_path`` equality rule."""

    def test_same_doc_collapses_to_single_doc_formulas(self):
        spans = [(0, 100), (200, 300)]
        docs = [7, 7]
        gold = [(50, 150)]
        self.assertEqual(
            char_recall_cross_doc(spans, docs, 7, gold),
            char_recall(spans, gold),
        )
        self.assertEqual(
            char_precision_cross_doc(spans, docs, 7, gold),
            char_precision(spans, gold),
        )

    def test_wrong_doc_contributes_to_precision_denom_only(self):
        # 100 chars from target doc (overlap 50 with gold)
        # + 100 chars from wrong doc (no contribution to intersection)
        # recall = 50/200 = 0.25 (unchanged — wrong-doc spans ignored)
        # precision = 50 / (100 + 100) = 0.25 (wrong-doc counted in denom)
        spans = [(0, 100), (500, 600)]
        docs = [7, 99]  # target=7, 99 is wrong doc
        gold = [(50, 250)]
        self.assertAlmostEqual(char_recall_cross_doc(spans, docs, 7, gold), 0.25)
        self.assertAlmostEqual(
            char_precision_cross_doc(spans, docs, 7, gold), 50 / 200
        )

    def test_all_wrong_doc_yields_zero_on_both(self):
        spans = [(0, 100)]
        docs = [99]
        gold = [(0, 100)]
        self.assertEqual(char_recall_cross_doc(spans, docs, 7, gold), 0.0)
        self.assertEqual(char_precision_cross_doc(spans, docs, 7, gold), 0.0)

    def test_parallel_list_mismatch_raises(self):
        with self.assertRaises(ValueError):
            char_recall_cross_doc([(0, 10)], [], 7, [(0, 10)])


class PerSubsetAggregateTestCase(PyUnitTestCase):
    """``BenchmarkReport.aggregates['per_subset']`` mirrors LB-RAG weighting."""

    def _make(self, subset: str, pr: float, pp: float) -> TaskResult:
        return TaskResult(
            datacell_id=0,
            task_id="t",
            document_key="doc",
            query="q",
            prediction="",
            gold_answer="",
            retrieved_spans=[],
            retrieved_annotation_ids=[],
            gold_spans=[],
            probe_char_recall=pr,
            probe_char_precision=pp,
            tags=[subset],
            extraction_ok=True,
        )

    def test_macro_avg_equal_weights_even_when_subset_counts_differ(self):
        # Two subsets, one with 3 tasks, one with 1 task — subset-level
        # means should still be weighted equally in the macro avg.
        from opencontractserver.benchmarks.report import BenchmarkReport

        results = [
            self._make("cuad", 0.9, 0.8),
            self._make("cuad", 0.9, 0.8),
            self._make("cuad", 0.9, 0.8),
            self._make("privacy_qa", 0.3, 0.1),
        ]
        report = BenchmarkReport(
            adapter={}, config={}, corpus_id=0, extract_id=0, task_results=results
        )
        per_subset = report.aggregates["per_subset"]
        self.assertAlmostEqual(per_subset["cuad"]["probe_char_recall"], 0.9)
        self.assertAlmostEqual(per_subset["privacy_qa"]["probe_char_recall"], 0.3)
        # Macro avg: (0.9 + 0.3) / 2 = 0.6 — NOT weighted by task count.
        self.assertAlmostEqual(per_subset["_macro_avg"]["probe_char_recall"], 0.6)
        self.assertEqual(per_subset["_macro_avg"]["subset_count"], 2)

    def test_macro_avg_omitted_when_all_untagged(self):
        from opencontractserver.benchmarks.report import BenchmarkReport

        r = TaskResult(
            datacell_id=0,
            task_id="t",
            document_key="d",
            query="q",
            prediction="",
            gold_answer="",
            retrieved_spans=[],
            retrieved_annotation_ids=[],
            gold_spans=[],
            tags=[],
        )
        report = BenchmarkReport(
            adapter={}, config={}, corpus_id=0, extract_id=0, task_results=[r]
        )
        per_subset = report.aggregates["per_subset"]
        self.assertIn("_untagged", per_subset)
        self.assertNotIn("_macro_avg", per_subset)


# --------------------------------------------------------------------------- #
# LLM usage extraction (parser for ``Datacell.llm_call_log``)
# --------------------------------------------------------------------------- #


class LLMUsageExtractionTestCase(PyUnitTestCase):
    """Verify token totals are summed correctly across pydantic-ai messages."""

    def test_returns_empty_on_none_or_blank(self):
        for value in (None, "", "   "):
            usage = extract_usage_from_llm_log(value)
            self.assertEqual(
                usage,
                {
                    "input_tokens": None,
                    "output_tokens": None,
                    "total_tokens": None,
                    "llm_requests": 0,
                },
            )

    def test_returns_empty_on_malformed_json(self):
        usage = extract_usage_from_llm_log("{not json")
        self.assertEqual(usage["llm_requests"], 0)
        self.assertIsNone(usage["total_tokens"])

    def test_sums_across_multiple_responses(self):
        log = json.dumps(
            [
                {"kind": "request", "parts": []},
                {
                    "kind": "response",
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 20,
                        "total_tokens": 120,
                    },
                },
                {"kind": "request", "parts": []},
                {
                    "kind": "response",
                    "usage": {
                        "input_tokens": 50,
                        "output_tokens": 10,
                        "total_tokens": 60,
                    },
                },
            ]
        )
        usage = extract_usage_from_llm_log(log)
        self.assertEqual(usage["input_tokens"], 150)
        self.assertEqual(usage["output_tokens"], 30)
        self.assertEqual(usage["total_tokens"], 180)
        self.assertEqual(usage["llm_requests"], 2)

    def test_accepts_legacy_field_names(self):
        # Older pydantic-ai releases spell the fields ``request_tokens`` /
        # ``response_tokens``; the parser must accept both to keep working
        # across version pins.
        log = json.dumps(
            [
                {
                    "kind": "response",
                    "usage": {"request_tokens": 40, "response_tokens": 5},
                }
            ]
        )
        usage = extract_usage_from_llm_log(log)
        self.assertEqual(usage["input_tokens"], 40)
        self.assertEqual(usage["output_tokens"], 5)
        # total_tokens derived from in+out when provider omits it.
        self.assertEqual(usage["total_tokens"], 45)
        self.assertEqual(usage["llm_requests"], 1)

    def test_response_without_usage_still_counts_as_request(self):
        log = json.dumps([{"kind": "response"}])
        usage = extract_usage_from_llm_log(log)
        self.assertEqual(usage["llm_requests"], 1)
        self.assertIsNone(usage["input_tokens"])


class BenchmarkReportUsageAggregateTestCase(PyUnitTestCase):
    """``BenchmarkReport.compute_aggregates`` surfaces usage totals."""

    def _make_task(
        self,
        datacell_id: int,
        tokens_in: int | None,
        tokens_out: int | None,
        tokens_total: int | None,
        requests: int,
        extraction_ok: bool = True,
    ) -> TaskResult:
        return TaskResult(
            datacell_id=datacell_id,
            task_id=f"t{datacell_id}",
            document_key="doc",
            query="q",
            prediction="p",
            gold_answer="g",
            retrieved_spans=[],
            retrieved_annotation_ids=[],
            gold_spans=[],
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            total_tokens=tokens_total,
            llm_requests=requests,
            extraction_ok=extraction_ok,
        )

    def test_sums_and_means_computed_only_over_reported(self):
        report = BenchmarkReport(
            adapter={},
            config={},
            corpus_id=0,
            extract_id=0,
            task_results=[
                self._make_task(1, 100, 20, 120, requests=2),
                self._make_task(2, None, None, None, requests=0),
                self._make_task(3, 50, 10, 60, requests=1),
            ],
        )
        agg = report.aggregates
        self.assertEqual(agg["input_tokens_sum"], 150)
        self.assertEqual(agg["output_tokens_sum"], 30)
        self.assertEqual(agg["total_tokens_sum"], 180)
        self.assertEqual(agg["llm_requests_sum"], 3)
        # Mean excludes the None-report task (so 150/2, not 150/3).
        self.assertEqual(agg["input_tokens_mean"], 75.0)
        self.assertEqual(agg["total_tokens_mean"], 90.0)
        # Request mean counts every task (including the zero-request one).
        self.assertEqual(agg["llm_requests_mean"], 1.0)

    def test_empty_results_yields_zero_usage(self):
        report = BenchmarkReport(
            adapter={}, config={}, corpus_id=0, extract_id=0, task_results=[]
        )
        self.assertEqual(report.aggregates["total_tokens_sum"], 0)
        self.assertEqual(report.aggregates["total_tokens_mean"], 0.0)


# --------------------------------------------------------------------------- #
# Adapter unit tests
# --------------------------------------------------------------------------- #


class LegalBenchRAGAdapterTestCase(PyUnitTestCase):
    """Verify the adapter reads the micro fixture into the expected shape."""

    def test_adapter_yields_expected_documents_and_tasks(self):
        adapter = LegalBenchRAGAdapter(root=MICRO_FIXTURE)

        documents = list(adapter.iter_documents())
        tasks = list(adapter.iter_tasks())

        self.assertEqual(len(documents), 2)
        doc_keys = {doc.document_key for doc in documents}
        self.assertEqual(doc_keys, {"micro/contract.txt", "micro/privacy.txt"})

        self.assertEqual(len(tasks), 4)
        task_ids = [t.task_id for t in tasks]
        # Every task_id is prefixed with the subset stem.
        self.assertTrue(all(tid.startswith("micro::") for tid in task_ids))

        # One of the tasks should carry the termination-clause gold span.
        termination = next(t for t in tasks if "terminat" in t.query.lower())
        self.assertEqual(termination.document_keys, ("micro/contract.txt",))
        spans = termination.gold_spans["micro/contract.txt"]
        self.assertEqual(len(spans), 1)
        start, end = spans[0]
        self.assertGreater(end, start)
        # The slice must look like an actual termination clause.
        document = next(d for d in documents if d.document_key == "micro/contract.txt")
        self.assertIn("terminat", document.text[start:end].lower())
        # The adapter pre-computes the gold answer string.
        self.assertEqual(termination.gold_answer, document.text[start:end])

    def test_adapter_subset_filter_rejects_unknown(self):
        with self.assertRaises(ValueError):
            LegalBenchRAGAdapter(root=MICRO_FIXTURE, subsets=["does_not_exist"])

    def test_adapter_limit_caps_task_count(self):
        adapter = LegalBenchRAGAdapter(root=MICRO_FIXTURE, limit=2)
        self.assertEqual(len(list(adapter.iter_tasks())), 2)

    def test_known_subsets_are_the_official_four(self):
        self.assertEqual(
            set(LEGALBENCH_RAG_SUBSETS),
            {"contractnli", "cuad", "maud", "privacy_qa"},
        )


# --------------------------------------------------------------------------- #
# Integration test: loader + runner with mocked LLM
# --------------------------------------------------------------------------- #


def _make_fake_get_structured_response(answers_by_query: dict[str, str]):
    """Return a pair of async fakes mimicking the two extract API methods.

    Returns ``(fake_result_only, fake_result_and_sources)`` matching
    ``AgentAPI.get_structured_response_from_document`` and
    ``AgentAPI.get_structured_response_and_sources_from_document``
    respectively.  The sources variant returns an empty citation list so
    tests don't need real Annotation rows to pass.
    """

    # Accept arbitrary kwargs so these fakes don't break when new parameters
    # (e.g. ``embedder=``) are added to the real extract-API signatures — the
    # test only cares about mapping ``prompt`` to a canned answer.
    async def _fake_result_only(*, prompt, **kwargs):
        return answers_by_query.get(prompt, "")

    async def _fake_result_and_sources(*, prompt, **kwargs):
        return answers_by_query.get(prompt, ""), []

    return _fake_result_only, _fake_result_and_sources


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class BenchmarkRunnerIntegrationTestCase(TransactionTestCase):
    """End-to-end: fixture → loader → mocked extraction → evaluator → report."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="benchmark_user", password="testpass"
        )
        self.adapter = LegalBenchRAGAdapter(root=MICRO_FIXTURE)
        # Build a prompt -> canned answer map from the adapter so the
        # mocked agent "knows" the gold answer and we can sanity-check F1.
        self._canned_by_prompt = {
            task.query: task.gold_answer for task in self.adapter.iter_tasks()
        }

    def test_loader_materializes_corpus_fieldset_extract_and_datacells(self):
        loaded = load_benchmark_into_corpus(
            self.adapter, user=self.user, use_eager_ingestion=True
        )

        self.assertEqual(len(loaded.documents_by_key), 2)
        self.assertEqual(len(loaded.columns_by_task_id), 4)
        self.assertEqual(len(loaded.datacells), 4)
        # Every datacell has associated gold data ready for evaluation.
        for cell in loaded.datacells:
            self.assertIn(cell.id, loaded.gold_by_datacell_id)

        # Documents should exist in the database.
        for document in loaded.documents_by_key.values():
            document.refresh_from_db()
            self.assertTrue(Document.objects.filter(pk=document.pk).exists())

    def test_run_benchmark_produces_report_with_perfect_answer_metrics(self):
        fake_result_only, fake_with_sources = _make_fake_get_structured_response(
            self._canned_by_prompt
        )

        # Patch both APIs so this test is resilient to whichever entry point
        # the extract task uses.
        with patch.object(
            AgentAPI,
            "get_structured_response_from_document",
            staticmethod(fake_result_only),
        ), patch.object(
            AgentAPI,
            "get_structured_response_and_sources_from_document",
            staticmethod(fake_with_sources),
        ):
            report = run_benchmark(
                self.adapter,
                user=self.user,
                model="test:fake",
                top_k=5,
                write_report=False,
            )

        self.assertEqual(int(report.aggregates["task_count"]), 4)
        self.assertEqual(
            int(report.aggregates["extraction_success_count"]),
            4,
            "All four mocked extractions should have succeeded",
        )
        # Because the fake agent returns gold_answer, exact match and F1
        # should both be 1.0 on every task.
        self.assertAlmostEqual(report.aggregates["answer_exact_match"], 1.0, places=4)
        self.assertAlmostEqual(report.aggregates["answer_token_f1"], 1.0, places=4)
        # Retrieval recall is harder to assert deterministically because
        # the vector store depends on embeddings and sentence segmentation,
        # but it must be in [0, 1].
        self.assertGreaterEqual(report.aggregates["probe_recall_at_k"], 0.0)
        self.assertLessEqual(report.aggregates["probe_recall_at_k"], 1.0)

        # Every task result should have a populated prediction and the
        # datacell should have ``completed`` set.
        for result in report.task_results:
            cell = Datacell.objects.get(pk=result.datacell_id)
            self.assertIsNotNone(cell.completed)
            self.assertTrue(result.extraction_ok)
            self.assertEqual(result.prediction, result.gold_answer)

    def test_run_benchmark_writes_report_files_when_requested(self):
        fake_result_only, fake_with_sources = _make_fake_get_structured_response(
            self._canned_by_prompt
        )
        run_dir = Path(self._make_tmp_run_dir())

        with patch.object(
            AgentAPI,
            "get_structured_response_from_document",
            staticmethod(fake_result_only),
        ), patch.object(
            AgentAPI,
            "get_structured_response_and_sources_from_document",
            staticmethod(fake_with_sources),
        ):
            run_benchmark(
                self.adapter,
                user=self.user,
                model="test:fake",
                top_k=5,
                run_dir=run_dir,
                write_report=True,
            )

        self.assertTrue((run_dir / "report.json").exists())
        self.assertTrue((run_dir / "report.csv").exists())
        self.assertTrue((run_dir / "config.json").exists())
        self.assertTrue((run_dir / "gold.json").exists())

        report_data = json.loads((run_dir / "report.json").read_text())
        self.assertIn("aggregates", report_data)
        self.assertIn("task_results", report_data)
        self.assertEqual(len(report_data["task_results"]), 4)

    def _make_tmp_run_dir(self) -> str:
        import tempfile

        tmp = tempfile.mkdtemp(prefix="benchmark_run_")
        self.addCleanup(self._rmtree, tmp)
        return tmp

    @staticmethod
    def _rmtree(path: str) -> None:
        import shutil

        shutil.rmtree(path, ignore_errors=True)


class BenchmarkTaskDataclassTestCase(PyUnitTestCase):
    """Guard against accidental changes to the public BenchmarkTask shape."""

    def test_benchmark_task_is_frozen(self):
        task = BenchmarkTask(
            task_id="t1",
            query="q",
            document_keys=("d1",),
            gold_spans={"d1": ((0, 3),)},
            gold_answer="abc",
        )
        with self.assertRaises(Exception):
            task.query = "changed"  # type: ignore[misc]
