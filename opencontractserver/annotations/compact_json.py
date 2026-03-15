"""
Compact Annotation JSON v2 format.

Provides encode/decode between the verbose v1 annotation JSON format and
the compact v2 format. The v2 format reduces storage by:

1. Removing redundant ``pageIndex`` from token references (implicit from page key).
2. Range-encoding consecutive token indices (e.g. ``"35-37,40"`` vs three objects).
3. Compacting bounds from ``{top, left, right, bottom}`` to ``[top, left, right, bottom]``.
4. Dropping ``rawText`` from the JSON (already stored on ``Annotation.raw_text``).

Format spec::

    v1 (legacy):
    {
      "<pageIndex>": {
        "bounds": {"top": ..., "left": ..., "right": ..., "bottom": ...},
        "tokensJsons": [{"pageIndex": N, "tokenIndex": M}, ...],
        "rawText": "..."
      }
    }

    v2 (compact):
    {
      "v": 2,
      "p": {
        "<pageIndex>": {
          "b": [top, left, right, bottom],
          "t": "35-37,40,42-50"
        }
      }
    }

Both formats are accepted everywhere; v1 is returned from
:func:`expand_annotation_json` for internal processing.
"""

from __future__ import annotations

import logging
from typing import Any

from opencontractserver.constants.annotations import (
    COMPACT_JSON_MAX_RANGE_SPAN as MAX_RANGE_SPAN,
)
from opencontractserver.constants.annotations import (
    COMPACT_JSON_MAX_TOTAL_TOKENS as MAX_TOTAL_TOKENS,
)

logger = logging.getLogger(__name__)

# ── Range encoding ──────────────────────────────────────────────


def encode_token_ranges(indices: list[int]) -> str:
    """Encode a sorted list of token indices into a compact range string.

    Examples::

        [1, 2, 3, 5, 7, 8, 9] → "1-3,5,7-9"
        [42]                   → "42"
        []                     → ""
    """
    if not indices:
        return ""
    sorted_idx = sorted(i for i in set(indices) if i >= 0)
    if not sorted_idx:
        return ""
    ranges: list[str] = []
    start = end = sorted_idx[0]
    for i in range(1, len(sorted_idx)):
        if sorted_idx[i] == end + 1:
            end = sorted_idx[i]
        else:
            ranges.append(str(start) if start == end else f"{start}-{end}")
            start = end = sorted_idx[i]
    ranges.append(str(start) if start == end else f"{start}-{end}")
    return ",".join(ranges)


def decode_token_ranges(range_str: str) -> list[int]:
    """Decode a compact range string back to a list of token indices.

    Examples::

        "1-3,5,7-9" → [1, 2, 3, 5, 7, 8, 9]
        "42"         → [42]
        ""           → []
    """
    if not range_str:
        return []
    tokens: list[int] = []
    total = 0
    truncated = False
    for part in range_str.split(","):
        if "-" in part:
            pieces = part.split("-", 1)
            try:
                start, end = int(pieces[0]), int(pieces[1])
            except (ValueError, IndexError):
                continue
            span = end - start
            if span < 0 or span > MAX_RANGE_SPAN:
                continue
            total += span + 1
            if total > MAX_TOTAL_TOKENS:
                truncated = True
                break
            tokens.extend(range(start, end + 1))
        else:
            try:
                val = int(part)
            except ValueError:
                continue
            total += 1
            if total > MAX_TOTAL_TOKENS:
                truncated = True
                break
            tokens.append(val)
    if truncated:
        logger.warning(
            "decode_token_ranges truncated at %d tokens (limit %d): %s...",
            len(tokens),
            MAX_TOTAL_TOKENS,
            range_str[:80],
        )
    return tokens


# ── Format detection ────────────────────────────────────────────


def is_compact_format(json_data: Any) -> bool:
    """Return ``True`` if *json_data* uses the v2 compact layout."""
    return (
        isinstance(json_data, dict)
        and json_data.get("v") == 2
        and isinstance(json_data.get("p"), dict)
    )


def is_span_format(json_data: Any) -> bool:
    """Return ``True`` if *json_data* is a span annotation (``{start, end}``).

    Detection is based on the presence of ``start`` and ``end`` keys with
    integer values — not an exact key-set check — so span annotations that
    carry additional metadata (e.g. ``confidence``, ``source``) are still
    recognised correctly.
    """
    return (
        isinstance(json_data, dict)
        and isinstance(json_data.get("start"), int)
        and isinstance(json_data.get("end"), int)
    )


# ── Compact (v1 → v2) ──────────────────────────────────────────


def compact_annotation_json(
    v1_json: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Convert a v1 multipage annotation JSON to v2 compact format.

    Span annotations (``{start, end}``) are returned unchanged.
    Already-compact v2 data is returned unchanged.

    Args:
        v1_json: The annotation JSON in v1 format (page-keyed dict),
            or ``None``/falsy (returned as-is).

    Returns:
        The annotation JSON in v2 compact format, or ``None`` if input
        was ``None``.
    """
    if not v1_json or not isinstance(v1_json, dict):
        return v1_json

    # Already compact
    if is_compact_format(v1_json):
        return v1_json

    # Span annotations are already minimal
    if is_span_format(v1_json):
        return v1_json

    pages: dict[str, dict[str, Any]] = {}
    for page_key, page_data in v1_json.items():
        if not isinstance(page_data, dict):
            continue

        compact_page: dict[str, Any] = {}

        # Compact bounds: {top, left, right, bottom} → [top, left, right, bottom]
        # Index mapping: b = [top, left, right, bottom]
        bounds = page_data.get("bounds")
        if isinstance(bounds, dict):
            compact_page["b"] = [
                bounds.get("top", 0),
                bounds.get("left", 0),
                bounds.get("right", 0),
                bounds.get("bottom", 0),
            ]
        else:
            compact_page["b"] = [0, 0, 0, 0]

        # Compact token refs: [{pageIndex, tokenIndex}, ...] → range string
        tokens_jsons = page_data.get("tokensJsons")
        if isinstance(tokens_jsons, list):
            indices = []
            for tok in tokens_jsons:
                if isinstance(tok, dict) and "tokenIndex" in tok:
                    indices.append(tok["tokenIndex"])
                elif isinstance(tok, int):
                    indices.append(tok)
            compact_page["t"] = encode_token_ranges(indices)

        pages[str(page_key)] = compact_page

    return {"v": 2, "p": pages}


# ── Expand (v2 → v1) ───────────────────────────────────────────


def expand_annotation_json(
    json_data: Any,
    raw_text: str = "",
) -> dict[str, Any] | Any:
    """Normalize annotation JSON to canonical v1 format.

    Accepts both v1 and v2 formats. If already v1, returns as-is.
    Span annotations are returned unchanged.

    Args:
        json_data: The annotation JSON (v1 or v2).
        raw_text: The annotation's raw_text (used to populate v1's
            ``rawText`` field when expanding from v2).

    Returns:
        Annotation JSON in v1 multipage format, or the original data
        if it's a span annotation or unrecognized format.
    """
    if not isinstance(json_data, dict):
        return json_data

    # Span annotations — pass through
    if is_span_format(json_data):
        return json_data

    # Already v1 — pass through
    if not is_compact_format(json_data):
        return json_data

    # Expand v2 → v1
    pages_compact = json_data.get("p", {})
    if not isinstance(pages_compact, dict):
        return json_data

    v1: dict[str, Any] = {}
    for page_key, page_data in pages_compact.items():
        if not isinstance(page_data, dict):
            continue

        page_entry: dict[str, Any] = {}

        # Expand bounds: b = [top, left, right, bottom] → {top, left, right, bottom}
        b = page_data.get("b")
        if isinstance(b, (list, tuple)) and len(b) >= 4:
            page_entry["bounds"] = {
                "top": b[0],
                "left": b[1],
                "right": b[2],
                "bottom": b[3],
            }
        else:
            page_entry["bounds"] = {"top": 0, "left": 0, "right": 0, "bottom": 0}

        # Expand token refs: range string → [{pageIndex, tokenIndex}, ...]
        t = page_data.get("t", "")
        try:
            page_idx = int(page_key)
        except (ValueError, TypeError):
            page_idx = 0
        if isinstance(t, str):
            indices = decode_token_ranges(t)
        elif isinstance(t, list):
            indices = t
        else:
            indices = []

        page_entry["tokensJsons"] = [
            {"pageIndex": page_idx, "tokenIndex": idx} for idx in indices
        ]

        # rawText is not stored in v2; use the model-level raw_text
        page_entry["rawText"] = raw_text

        v1[str(page_key)] = page_entry

    return v1
