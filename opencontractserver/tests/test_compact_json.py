"""
Tests for annotations/compact_json.py encode/decode, format detection,
and v1↔v2 conversion helpers.

Includes pure unit tests for the codec functions and integration tests
for the Annotation model's ``save()`` auto-compact behaviour.
"""

from unittest.mock import patch

from django.test import TestCase, override_settings

from opencontractserver.annotations.compact_json import (
    compact_annotation_json,
    decode_token_ranges,
    encode_token_ranges,
    expand_annotation_json,
    is_compact_format,
    is_span_format,
)
from opencontractserver.constants.annotations import (
    COMPACT_JSON_MAX_RANGE_SPAN,
    COMPACT_JSON_MAX_TOTAL_TOKENS,
)
from opencontractserver.tests.factories import AnnotationFactory

# ── helpers ──────────────────────────────────────────────────────


def _v1_page(bounds, token_indices, raw_text="hello"):
    """Build a single v1 page entry."""
    return {
        "bounds": bounds,
        "tokensJsons": [{"pageIndex": 0, "tokenIndex": i} for i in token_indices],
        "rawText": raw_text,
    }


# ── encode_token_ranges ─────────────────────────────────────────


class TestEncodeTokenRanges(TestCase):
    """Tests for encode_token_ranges."""

    def test_empty_list(self):
        self.assertEqual(encode_token_ranges([]), "")

    def test_single_item(self):
        self.assertEqual(encode_token_ranges([42]), "42")

    def test_consecutive_range(self):
        self.assertEqual(encode_token_ranges([1, 2, 3, 4, 5]), "1-5")

    def test_multiple_ranges(self):
        self.assertEqual(
            encode_token_ranges([1, 2, 3, 5, 7, 8, 9]),
            "1-3,5,7-9",
        )

    def test_duplicates_are_deduplicated(self):
        # Duplicates are removed before encoding.
        result = encode_token_ranges([3, 3, 3, 5, 5])
        self.assertEqual(result, "3,5")

    def test_unsorted_input_is_sorted(self):
        self.assertEqual(encode_token_ranges([5, 3, 1, 2, 4]), "1-5")

    def test_two_separate_items(self):
        self.assertEqual(encode_token_ranges([10, 20]), "10,20")

    def test_pair_range(self):
        self.assertEqual(encode_token_ranges([7, 8]), "7-8")


# ── decode_token_ranges ─────────────────────────────────────────


class TestDecodeTokenRanges(TestCase):
    """Tests for decode_token_ranges."""

    def test_empty_string(self):
        self.assertEqual(decode_token_ranges(""), [])

    def test_single_number(self):
        self.assertEqual(decode_token_ranges("42"), [42])

    def test_range(self):
        self.assertEqual(decode_token_ranges("1-3"), [1, 2, 3])

    def test_multiple_ranges(self):
        self.assertEqual(
            decode_token_ranges("1-3,5,7-9"),
            [1, 2, 3, 5, 7, 8, 9],
        )

    def test_malformed_non_numeric_skipped(self):
        # Non-numeric parts are silently skipped.
        self.assertEqual(decode_token_ranges("abc,5,x-y"), [5])

    def test_malformed_empty_parts_skipped(self):
        # Leading/trailing commas produce empty strings — skipped.
        self.assertEqual(decode_token_ranges(",5,"), [5])

    def test_negative_span_skipped(self):
        # "10-5" has a negative span → skipped.
        self.assertEqual(decode_token_ranges("10-5,42"), [42])

    def test_boundary_at_max_range_span(self):
        # A range exactly at MAX_RANGE_SPAN should be accepted.
        start = 0
        end = COMPACT_JSON_MAX_RANGE_SPAN  # span == MAX_RANGE_SPAN
        result = decode_token_ranges(f"{start}-{end}")
        self.assertEqual(len(result), COMPACT_JSON_MAX_RANGE_SPAN + 1)
        self.assertEqual(result[0], start)
        self.assertEqual(result[-1], end)

    def test_range_exceeding_max_span_skipped(self):
        start = 0
        end = COMPACT_JSON_MAX_RANGE_SPAN + 1
        result = decode_token_ranges(f"{start}-{end}")
        self.assertEqual(result, [])

    def test_truncation_at_max_total_tokens(self):
        # Build a range string that would produce more than the limit.
        range_str = encode_token_ranges(
            list(range(COMPACT_JSON_MAX_TOTAL_TOKENS + 100))
        )
        result = decode_token_ranges(range_str)
        self.assertLessEqual(len(result), COMPACT_JSON_MAX_TOTAL_TOKENS)


# ── roundtrip ────────────────────────────────────────────────────


class TestRoundtrip(TestCase):
    """encode → decode and decode → encode roundtrips."""

    def _assert_roundtrip_indices(self, indices):
        """Assert encode(indices) → decode → same sorted unique list."""
        encoded = encode_token_ranges(indices)
        decoded = decode_token_ranges(encoded)
        self.assertEqual(decoded, sorted(set(indices)))

    def test_roundtrip_empty(self):
        self._assert_roundtrip_indices([])

    def test_roundtrip_single(self):
        self._assert_roundtrip_indices([7])

    def test_roundtrip_consecutive(self):
        self._assert_roundtrip_indices([10, 11, 12, 13])

    def test_roundtrip_mixed(self):
        self._assert_roundtrip_indices([1, 2, 3, 10, 20, 21, 22, 50])

    def _assert_roundtrip_string(self, range_str):
        """Assert decode(range_str) → encode → same string."""
        decoded = decode_token_ranges(range_str)
        re_encoded = encode_token_ranges(decoded)
        self.assertEqual(re_encoded, range_str)

    def test_roundtrip_string_empty(self):
        self._assert_roundtrip_string("")

    def test_roundtrip_string_single(self):
        self._assert_roundtrip_string("42")

    def test_roundtrip_string_range(self):
        self._assert_roundtrip_string("1-5")

    def test_roundtrip_string_mixed(self):
        self._assert_roundtrip_string("1-3,5,7-9")


# ── is_compact_format ────────────────────────────────────────────


class TestIsCompactFormat(TestCase):
    """Tests for is_compact_format."""

    def test_v2_data(self):
        self.assertTrue(is_compact_format({"v": 2, "p": {}}))

    def test_v1_data(self):
        self.assertFalse(
            is_compact_format({"0": {"bounds": {}, "tokensJsons": [], "rawText": ""}})
        )

    def test_wrong_version(self):
        self.assertFalse(is_compact_format({"v": 1}))

    def test_none(self):
        self.assertFalse(is_compact_format(None))

    def test_non_dict(self):
        self.assertFalse(is_compact_format("not a dict"))
        self.assertFalse(is_compact_format(42))
        self.assertFalse(is_compact_format([1, 2]))


# ── is_span_format ───────────────────────────────────────────────


class TestIsSpanFormat(TestCase):
    """Tests for is_span_format."""

    def test_valid_span(self):
        self.assertTrue(is_span_format({"start": 0, "end": 10}))

    def test_valid_span_with_text(self):
        self.assertTrue(is_span_format({"start": 0, "end": 10, "text": "hi"}))

    def test_span_with_extra_metadata_keys(self):
        # Span annotations with extra metadata (e.g. from future parsers)
        # should still be detected as spans.
        self.assertTrue(is_span_format({"start": 0, "end": 10, "confidence": 0.95}))
        self.assertTrue(
            is_span_format({"start": 0, "end": 10, "text": "hi", "source": "parser_v2"})
        )

    def test_missing_start(self):
        self.assertFalse(is_span_format({"end": 10}))

    def test_missing_end(self):
        self.assertFalse(is_span_format({"start": 0}))

    def test_non_int_start_end_not_span(self):
        # Values must be ints to distinguish from page-keyed dicts.
        self.assertFalse(is_span_format({"start": "foo", "end": "bar"}))
        self.assertFalse(is_span_format({"start": {}, "end": {}}))

    def test_page_keyed_dict_not_span(self):
        # A v1 page-keyed dict has numeric string keys with dict values —
        # should NOT be detected as a span.
        self.assertFalse(
            is_span_format({"0": {"bounds": {}, "tokensJsons": [], "rawText": ""}})
        )

    def test_non_dict(self):
        self.assertFalse(is_span_format("not a dict"))
        self.assertFalse(is_span_format(None))
        self.assertFalse(is_span_format(42))

    def test_empty_dict(self):
        self.assertFalse(is_span_format({}))


# ── compact_annotation_json ──────────────────────────────────────


class TestCompactAnnotationJson(TestCase):
    """Tests for compact_annotation_json (v1 → v2 conversion)."""

    def test_none_returns_none(self):
        self.assertIsNone(compact_annotation_json(None))

    def test_empty_dict_returns_as_is(self):
        # Empty dict is falsy → returned as-is.
        self.assertEqual(compact_annotation_json({}), {})

    def test_non_dict_returns_as_is(self):
        self.assertEqual(compact_annotation_json("string"), "string")

    def test_already_compact_passthrough(self):
        v2 = {"v": 2, "p": {"0": {"b": [1, 2, 3, 4], "t": "0-5"}}}
        result = compact_annotation_json(v2)
        self.assertIs(result, v2)

    def test_span_passthrough(self):
        span = {"start": 5, "end": 20, "text": "hello"}
        result = compact_annotation_json(span)
        self.assertIs(result, span)

    def test_v1_to_v2_conversion(self):
        v1 = {
            "0": {
                "bounds": {"top": 10, "left": 20, "right": 30, "bottom": 40},
                "tokensJsons": [
                    {"pageIndex": 0, "tokenIndex": 1},
                    {"pageIndex": 0, "tokenIndex": 2},
                    {"pageIndex": 0, "tokenIndex": 3},
                    {"pageIndex": 0, "tokenIndex": 5},
                ],
                "rawText": "some text",
            }
        }
        result = compact_annotation_json(v1)

        self.assertEqual(result["v"], 2)
        self.assertIn("0", result["p"])

        page = result["p"]["0"]
        self.assertEqual(page["b"], [10, 20, 30, 40])
        self.assertEqual(page["t"], "1-3,5")

    def test_v1_multipage_conversion(self):
        v1 = {
            "0": _v1_page({"top": 1, "left": 2, "right": 3, "bottom": 4}, [10, 11]),
            "1": _v1_page({"top": 5, "left": 6, "right": 7, "bottom": 8}, [20]),
        }
        result = compact_annotation_json(v1)

        self.assertEqual(result["v"], 2)
        self.assertEqual(result["p"]["0"]["b"], [1, 2, 3, 4])
        self.assertEqual(result["p"]["0"]["t"], "10-11")
        self.assertEqual(result["p"]["1"]["b"], [5, 6, 7, 8])
        self.assertEqual(result["p"]["1"]["t"], "20")

    def test_missing_bounds_keys_default_to_zero(self):
        v1 = {"0": {"bounds": {}, "tokensJsons": []}}
        result = compact_annotation_json(v1)
        self.assertEqual(result["p"]["0"]["b"], [0, 0, 0, 0])

    def test_non_dict_page_data_skipped(self):
        v1 = {"0": "invalid"}
        result = compact_annotation_json(v1)
        self.assertEqual(result, {"v": 2, "p": {}})

    def test_integer_token_indices_accepted(self):
        # tokensJsons can contain bare integers instead of dicts.
        v1 = {"0": {"tokensJsons": [3, 4, 5]}}
        result = compact_annotation_json(v1)
        self.assertEqual(result["p"]["0"]["t"], "3-5")


# ── expand_annotation_json ───────────────────────────────────────


class TestExpandAnnotationJson(TestCase):
    """Tests for expand_annotation_json (v2 → v1 conversion)."""

    def test_non_dict_passthrough(self):
        self.assertIsNone(expand_annotation_json(None))
        self.assertEqual(expand_annotation_json("string"), "string")
        self.assertEqual(expand_annotation_json(42), 42)

    def test_span_passthrough(self):
        span = {"start": 0, "end": 10}
        result = expand_annotation_json(span)
        self.assertIs(result, span)

    def test_already_v1_passthrough(self):
        v1 = {
            "0": {
                "bounds": {"top": 1, "left": 2, "right": 3, "bottom": 4},
                "tokensJsons": [{"pageIndex": 0, "tokenIndex": 1}],
                "rawText": "text",
            }
        }
        result = expand_annotation_json(v1)
        self.assertIs(result, v1)

    def test_v2_to_v1_conversion(self):
        v2 = {
            "v": 2,
            "p": {
                "0": {"b": [10, 20, 30, 40], "t": "1-3,5"},
            },
        }
        result = expand_annotation_json(v2, raw_text="hello world")

        self.assertIn("0", result)
        page = result["0"]
        self.assertEqual(
            page["bounds"],
            {"top": 10, "left": 20, "right": 30, "bottom": 40},
        )
        expected_tokens = [
            {"pageIndex": 0, "tokenIndex": 1},
            {"pageIndex": 0, "tokenIndex": 2},
            {"pageIndex": 0, "tokenIndex": 3},
            {"pageIndex": 0, "tokenIndex": 5},
        ]
        self.assertEqual(page["tokensJsons"], expected_tokens)
        self.assertEqual(page["rawText"], "hello world")

    def test_v2_multipage_expansion(self):
        v2 = {
            "v": 2,
            "p": {
                "0": {"b": [1, 2, 3, 4], "t": "10-11"},
                "3": {"b": [5, 6, 7, 8], "t": "20"},
            },
        }
        result = expand_annotation_json(v2, raw_text="txt")

        self.assertIn("0", result)
        self.assertIn("3", result)
        # Page 0 tokens have pageIndex=0
        self.assertEqual(result["0"]["tokensJsons"][0]["pageIndex"], 0)
        # Page 3 tokens have pageIndex=3
        self.assertEqual(result["3"]["tokensJsons"][0]["pageIndex"], 3)

    def test_v2_missing_bounds_defaults_to_zeros(self):
        v2 = {"v": 2, "p": {"0": {"t": "1"}}}
        result = expand_annotation_json(v2)
        self.assertEqual(
            result["0"]["bounds"],
            {"top": 0, "left": 0, "right": 0, "bottom": 0},
        )

    def test_v2_empty_token_string(self):
        v2 = {"v": 2, "p": {"0": {"b": [0, 0, 0, 0], "t": ""}}}
        result = expand_annotation_json(v2)
        self.assertEqual(result["0"]["tokensJsons"], [])

    def test_v2_token_list_fallback(self):
        # "t" can be a list of ints instead of a range string.
        v2 = {"v": 2, "p": {"0": {"b": [0, 0, 0, 0], "t": [5, 6]}}}
        result = expand_annotation_json(v2)
        self.assertEqual(len(result["0"]["tokensJsons"]), 2)
        self.assertEqual(result["0"]["tokensJsons"][0]["tokenIndex"], 5)

    def test_v2_non_dict_pages_passthrough(self):
        v2 = {"v": 2, "p": "bad"}
        result = expand_annotation_json(v2)
        # Cannot iterate "bad" as a dict → returns original.
        self.assertIs(result, v2)

    def test_v2_non_dict_page_data_skipped(self):
        v2 = {"v": 2, "p": {"0": "invalid", "1": {"b": [0, 0, 0, 0], "t": "1"}}}
        result = expand_annotation_json(v2)
        self.assertNotIn("0", result)
        self.assertIn("1", result)


# ── full v1 → v2 → v1 roundtrip ─────────────────────────────────


class TestFullConversionRoundtrip(TestCase):
    """Test that compact(expand(data)) and expand(compact(data)) are stable."""

    def test_v1_compact_then_expand(self):
        v1 = {
            "0": {
                "bounds": {"top": 10, "left": 20, "right": 30, "bottom": 40},
                "tokensJsons": [
                    {"pageIndex": 0, "tokenIndex": 1},
                    {"pageIndex": 0, "tokenIndex": 2},
                    {"pageIndex": 0, "tokenIndex": 5},
                ],
                "rawText": "hello",
            }
        }
        v2 = compact_annotation_json(v1)
        restored = expand_annotation_json(v2, raw_text="hello")

        self.assertEqual(restored["0"]["bounds"], v1["0"]["bounds"])
        self.assertEqual(restored["0"]["tokensJsons"], v1["0"]["tokensJsons"])
        self.assertEqual(restored["0"]["rawText"], "hello")

    def test_v2_expand_then_compact(self):
        v2 = {
            "v": 2,
            "p": {
                "0": {"b": [10, 20, 30, 40], "t": "1-3,5"},
            },
        }
        v1 = expand_annotation_json(v2, raw_text="")
        re_compacted = compact_annotation_json(v1)

        self.assertEqual(re_compacted["v"], 2)
        self.assertEqual(re_compacted["p"]["0"]["b"], v2["p"]["0"]["b"])
        self.assertEqual(re_compacted["p"]["0"]["t"], v2["p"]["0"]["t"])


# ── save() auto-compact integration tests ────────────────────────


class TestAnnotationSaveAutoCompact(TestCase):
    """Integration tests for the Annotation.save() auto-compact path."""

    def test_save_compacts_v1_json_to_v2(self):
        """Saving a TOKEN_LABEL annotation with v1 JSON auto-compacts to v2."""
        v1_json = {
            "0": {
                "bounds": {"top": 10, "left": 20, "right": 30, "bottom": 40},
                "tokensJsons": [
                    {"pageIndex": 0, "tokenIndex": 1},
                    {"pageIndex": 0, "tokenIndex": 2},
                    {"pageIndex": 0, "tokenIndex": 3},
                ],
                "rawText": "hello world",
            }
        }
        annot = AnnotationFactory(json=v1_json)

        # After save the stored JSON must be v2 compact format.
        annot.refresh_from_db()
        self.assertTrue(is_compact_format(annot.json))
        self.assertEqual(annot.json["v"], 2)
        self.assertEqual(annot.json["p"]["0"]["t"], "1-3")
        self.assertEqual(annot.json["p"]["0"]["b"], [10, 20, 30, 40])

    def test_save_does_not_recompact_v2(self):
        """Saving an already-v2 annotation does not mutate the JSON."""
        v2_json = {"v": 2, "p": {"0": {"b": [1, 2, 3, 4], "t": "5-10"}}}
        annot = AnnotationFactory(json=v2_json)

        annot.refresh_from_db()
        self.assertEqual(annot.json, v2_json)

    @override_settings(VALIDATE_ANNOTATION_JSON=False)
    def test_save_does_not_compact_span(self):
        """Span annotations are left unchanged by the auto-compact path.

        Validation is disabled because this deliberately assigns span JSON
        to a TOKEN_LABEL annotation to exercise the span-detection guard
        in the auto-compact path.
        """
        span_json = {"start": 0, "end": 100}
        annot = AnnotationFactory(json=span_json)

        annot.refresh_from_db()
        self.assertEqual(annot.json, span_json)

    @patch(
        "opencontractserver.annotations.models.compact_annotation_json",
        side_effect=ValueError("boom"),
    )
    def test_save_exception_guard_logs_and_stores_as_is(self, mock_compact):
        """If compact_annotation_json raises, save() succeeds with original JSON."""
        v1_json = {
            "0": {
                "bounds": {"top": 0, "left": 0, "right": 0, "bottom": 0},
                "tokensJsons": [{"pageIndex": 0, "tokenIndex": 1}],
                "rawText": "",
            }
        }
        # Should not raise — exception is caught and logged.
        annot = AnnotationFactory(json=v1_json)

        annot.refresh_from_db()
        # v1 JSON stored as-is since compaction failed.
        self.assertFalse(is_compact_format(annot.json))
        self.assertIn("0", annot.json)


# ── clean() validation integration tests ─────────────────────────


@override_settings(VALIDATE_ANNOTATION_JSON=True)
class TestAnnotationCleanValidation(TestCase):
    """Integration tests for the Annotation.clean() JSON validation."""

    def test_clean_accepts_valid_v2_compact_json(self):
        """clean() passes for a well-formed v2 compact annotation."""
        v2_json = {"v": 2, "p": {"0": {"b": [1, 2, 3, 4], "t": "5-10"}}}
        annot = AnnotationFactory(json=v2_json)
        # clean() should not raise
        annot.clean()

    def test_clean_accepts_valid_v1_legacy_json(self):
        """clean() passes for a well-formed v1 legacy annotation."""
        v1_json = {
            "0": {
                "bounds": {"top": 1, "left": 2, "right": 3, "bottom": 4},
                "tokensJsons": [{"pageIndex": 0, "tokenIndex": 0}],
                "rawText": "hello",
            }
        }
        # save() auto-compacts, so build the annotation then set JSON directly
        annot = AnnotationFactory()
        annot.json = v1_json
        annot.clean()

    def test_clean_rejects_v2_with_non_dict_page_entry(self):
        """clean() raises when a v2 page entry is not a dict."""
        bad_json = {"v": 2, "p": {"0": "not_a_dict"}}
        annot = AnnotationFactory()
        annot.json = bad_json
        with self.assertRaises(ValueError, msg="v2 page entries must be dicts"):
            annot.clean()

    def test_clean_rejects_v2_missing_b_or_t(self):
        """clean() raises when a v2 page entry is missing 'b' or 't'."""
        bad_json = {"v": 2, "p": {"0": {"b": [0, 0, 0, 0]}}}
        annot = AnnotationFactory()
        annot.json = bad_json
        with self.assertRaises(ValueError, msg="must contain 'b' (bounds) and 't'"):
            annot.clean()

    def test_clean_rejects_v1_missing_required_keys(self):
        """clean() raises when a v1 page entry is missing required keys."""
        bad_json = {"0": {"bounds": {"top": 0, "left": 0, "right": 0, "bottom": 0}}}
        annot = AnnotationFactory()
        annot.json = bad_json
        with self.assertRaises(ValueError, msg="must contain 'bounds', 'tokensJsons'"):
            annot.clean()


# ── bulk_update bypass documentation test ─────────────────────────


class TestBulkUpdateBypassesAutoCompact(TestCase):
    """Document that QuerySet.update() bypasses save() auto-compaction.

    This is an inherent Django limitation: ``QuerySet.update()`` and
    ``bulk_update()`` write directly to the database without calling
    ``save()``.  v1 JSON written via these paths stays v1.
    """

    def test_queryset_update_does_not_compact_v1(self):
        """Annotation.objects.filter().update(json=v1) stores v1 as-is."""
        from opencontractserver.annotations.models import Annotation

        annot = AnnotationFactory()
        v1_json = {
            "0": {
                "bounds": {"top": 1, "left": 2, "right": 3, "bottom": 4},
                "tokensJsons": [{"pageIndex": 0, "tokenIndex": 1}],
                "rawText": "test",
            }
        }
        Annotation.objects.filter(pk=annot.pk).update(json=v1_json)

        annot.refresh_from_db()
        # The JSON should remain v1 because update() bypasses save().
        self.assertFalse(is_compact_format(annot.json))
        self.assertIn("0", annot.json)
        self.assertIn("bounds", annot.json["0"])
