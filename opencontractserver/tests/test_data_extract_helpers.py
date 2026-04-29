"""Targeted unit tests for the small helpers introduced alongside the
benchmark harness: retrieval-citation linking and the
``result is None`` failure-mode classifier.

These are pure-Python helpers that don't go through the agent runtime,
so they can be exercised with mocked message logs and lightweight
fixtures without spinning up a full extraction.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import (
    SPAN_LABEL,
    Annotation,
    AnnotationLabel,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import (
    Column,
    Datacell,
    Extract,
    Fieldset,
)
from opencontractserver.tasks.data_extract_tasks import _classify_none_result

User = get_user_model()


def _build_datacell_with_annotations(test):
    """Return a ``(datacell, annotation_ids)`` tuple wired up minimally."""
    user = User.objects.create_user(
        username="extract_helpers_user", password="testpass"
    )
    corpus = Corpus.objects.create(title="ExtractHelpers Corpus", creator=user)
    document = Document.objects.create(
        title="ExtractHelpers Doc",
        creator=user,
        file_type="text/plain",
    )
    corpus.add_document(document=document, user=user)

    label = AnnotationLabel.objects.create(
        text="ExtractHelpersLabel", creator=user, label_type=SPAN_LABEL
    )

    annotations = [
        Annotation.objects.create(
            document=document,
            corpus=corpus,
            annotation_label=label,
            annotation_type=SPAN_LABEL,
            raw_text=f"hit {i}",
            json={"start": i, "end": i + 4},
            creator=user,
            page=1,
        )
        for i in range(3)
    ]

    fieldset = Fieldset.objects.create(name="ExtractHelpers FS", creator=user)
    column = Column.objects.create(
        fieldset=fieldset,
        name="Hits",
        query="anything",
        output_type="str",
        creator=user,
    )
    extract = Extract.objects.create(
        name="ExtractHelpers Extract",
        corpus=corpus,
        fieldset=fieldset,
        creator=user,
    )
    datacell = Datacell.objects.create(
        extract=extract,
        column=column,
        document=document,
        creator=user,
        data={"data": "anything"},
    )
    return datacell, [a.id for a in annotations]


class LinkRetrievalCitationsTests(TestCase):
    """Cover ``_link_retrieval_citations``'s defensive filtering path."""

    def test_real_ids_are_linked_to_sources(self) -> None:
        from asgiref.sync import async_to_sync

        from opencontractserver.tasks.data_extract_tasks import (
            _link_retrieval_citations,
        )

        datacell, annotation_ids = _build_datacell_with_annotations(self)

        async_to_sync(_link_retrieval_citations)(datacell, annotation_ids)

        datacell.refresh_from_db()
        self.assertEqual(
            set(datacell.sources.values_list("id", flat=True)),
            set(annotation_ids),
        )

    def test_non_int_and_negative_ids_are_dropped(self) -> None:
        from asgiref.sync import async_to_sync

        from opencontractserver.tasks.data_extract_tasks import (
            _link_retrieval_citations,
        )

        datacell, annotation_ids = _build_datacell_with_annotations(self)

        # Inject a hostile mix: floats, negative ints, strings, valid ids
        async_to_sync(_link_retrieval_citations)(
            datacell,
            [None, -1, 0, "5", 1.5, *annotation_ids],
        )

        datacell.refresh_from_db()
        # Only the real positive ints survive the filter
        self.assertEqual(
            set(datacell.sources.values_list("id", flat=True)),
            set(annotation_ids),
        )

    def test_missing_ids_silently_ignored(self) -> None:
        """A row deleted between retrieval and link must not blow up."""
        from asgiref.sync import async_to_sync

        from opencontractserver.tasks.data_extract_tasks import (
            _link_retrieval_citations,
        )

        datacell, annotation_ids = _build_datacell_with_annotations(self)
        # Reference an annotation id that doesn't exist plus the real ones
        bogus_id = max(annotation_ids) + 9999

        async_to_sync(_link_retrieval_citations)(datacell, [bogus_id, *annotation_ids])

        datacell.refresh_from_db()
        # The bogus id is silently filtered; real ids still link
        self.assertEqual(
            set(datacell.sources.values_list("id", flat=True)),
            set(annotation_ids),
        )

    def test_empty_input_is_a_noop(self) -> None:
        from asgiref.sync import async_to_sync

        from opencontractserver.tasks.data_extract_tasks import (
            _link_retrieval_citations,
        )

        datacell, _ = _build_datacell_with_annotations(self)

        async_to_sync(_link_retrieval_citations)(datacell, [])
        async_to_sync(_link_retrieval_citations)(datacell, [None, "abc", -1])

        datacell.refresh_from_db()
        self.assertEqual(datacell.sources.count(), 0)


def _response_msg(part_kinds):
    """Build a minimal duck-typed ``response``-kind message.

    The classifier only reads ``msg.kind`` and ``msg.parts[i].part_kind``,
    so a ``SimpleNamespace`` is enough — no need to drag in pydantic-ai's
    real ``ModelResponse`` and its strict validation.
    """
    parts = [SimpleNamespace(part_kind=kind) for kind in part_kinds]
    return SimpleNamespace(kind="response", parts=parts)


class ClassifyNoneResultTests(TestCase):
    """Cover the four failure-mode classifications the agent emits."""

    def test_no_messages_is_empty_history(self) -> None:
        mode, detail = _classify_none_result(None)
        self.assertEqual(mode, "empty_history")
        self.assertIn("no messages", detail)

        mode, detail = _classify_none_result([])
        self.assertEqual(mode, "empty_history")

    def test_no_response_messages_is_empty_history(self) -> None:
        """Messages exist, but none of them are ``response``-kind."""
        request_only = [SimpleNamespace(kind="request", parts=[])]
        mode, detail = _classify_none_result(request_only)
        self.assertEqual(mode, "empty_history")
        self.assertIn("no response messages", detail)

    def test_text_only_response_is_committed_none(self) -> None:
        """Last response carries a text part → model committed."""
        msg = _response_msg(["text"])
        mode, _ = _classify_none_result([msg])
        self.assertEqual(mode, "agent_committed_none")

    def test_output_tool_part_is_committed_none(self) -> None:
        """``output_tool`` parts (final structured response) → committed."""
        msg = _response_msg(["output_tool"])
        mode, _ = _classify_none_result([msg])
        self.assertEqual(mode, "agent_committed_none")

    def test_single_tool_call_only_is_no_final(self) -> None:
        """One response that ends on a tool call never reached final."""
        msg = _response_msg(["tool-call"])
        mode, _ = _classify_none_result([msg])
        self.assertEqual(mode, "no_final_response")

    def test_repeated_tool_call_only_is_tool_loop(self) -> None:
        """Multiple response messages, all tool-call parts, no final."""
        msgs = [
            _response_msg(["tool-call"]),
            _response_msg(["tool-call"]),
            _response_msg(["tool-call"]),
        ]
        mode, _ = _classify_none_result(msgs)
        self.assertEqual(mode, "tool_loop_no_output")

    def test_thinking_only_is_no_final_response(self) -> None:
        """``thinking`` parts don't count as final output (they're internal)."""
        msg = _response_msg(["thinking"])
        mode, _ = _classify_none_result([msg])
        self.assertEqual(mode, "no_final_response")

    def test_text_after_tool_loop_is_committed(self) -> None:
        """If the *last* response has a text part, that's commitment."""
        msgs = [
            _response_msg(["tool-call"]),
            _response_msg(["tool-call"]),
            _response_msg(["text"]),
        ]
        mode, _ = _classify_none_result(msgs)
        self.assertEqual(mode, "agent_committed_none")


class CrossEncoderRerankerTests(TestCase):
    """Light coverage for ``CrossEncoderReranker._rerank_impl``.

    The cross-encoder weights are large and we don't want to download
    them in CI, so this exercises the scoring/ranking logic with a
    mocked ``CrossEncoder`` backend.
    """

    def test_scores_sort_passages_by_relevance(self) -> None:
        from opencontractserver.pipeline.rerankers import cross_encoder_reranker

        # Mock the loader so the reranker doesn't try to download weights
        fake_model = MagicMock()
        # Simulate scores: passage 0 (hit), 1 (miss), 2 (best hit)
        fake_model.predict.return_value = [0.4, 0.05, 0.95]

        original_loader = cross_encoder_reranker._load_cross_encoder
        cross_encoder_reranker._load_cross_encoder = (
            lambda model_name, device: fake_model
        )  # noqa: E731
        try:
            reranker = cross_encoder_reranker.CrossEncoderReranker()
            results = reranker._rerank_impl(
                query="capital of france",
                passages=["paris is the capital", "lyon", "paris france capital"],
            )
        finally:
            cross_encoder_reranker._load_cross_encoder = original_loader

        # Result indices preserve input ordering; caller sorts by score.
        scores = {r.index: r.score for r in results}
        self.assertEqual(scores[0], 0.4)
        self.assertEqual(scores[1], 0.05)
        self.assertEqual(scores[2], 0.95)

    def test_scalar_score_response_is_normalized(self) -> None:
        """Single-pair scoring may come back as a numpy scalar — handle it."""
        from opencontractserver.pipeline.rerankers import cross_encoder_reranker

        fake_model = MagicMock()
        # Some backends return a 0-d scalar instead of a length-1 list
        fake_model.predict.return_value = 0.7

        original_loader = cross_encoder_reranker._load_cross_encoder
        cross_encoder_reranker._load_cross_encoder = (
            lambda model_name, device: fake_model
        )  # noqa: E731
        try:
            reranker = cross_encoder_reranker.CrossEncoderReranker()
            results = reranker._rerank_impl(
                query="anything", passages=["only one passage"]
            )
        finally:
            cross_encoder_reranker._load_cross_encoder = original_loader

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].score, 0.7)

    def test_score_count_mismatch_pads_with_neg_inf(self) -> None:
        """If predict returns fewer scores than passages, pad defensively."""
        from opencontractserver.pipeline.rerankers import cross_encoder_reranker

        fake_model = MagicMock()
        # Only one score for two passages
        fake_model.predict.return_value = [0.5]

        original_loader = cross_encoder_reranker._load_cross_encoder
        cross_encoder_reranker._load_cross_encoder = (
            lambda model_name, device: fake_model
        )  # noqa: E731
        try:
            reranker = cross_encoder_reranker.CrossEncoderReranker()
            results = reranker._rerank_impl(query="anything", passages=["one", "two"])
        finally:
            cross_encoder_reranker._load_cross_encoder = original_loader

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0].score, 0.5)
        # Padded entries land at -inf so they sort to the bottom
        self.assertEqual(results[1].score, float("-inf"))


# Suppress unused-import warning for the SimpleNamespace shim used elsewhere
_ = SimpleNamespace
