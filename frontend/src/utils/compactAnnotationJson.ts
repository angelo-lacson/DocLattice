/**
 * Compact Annotation JSON v2 format.
 *
 * Provides encode/decode between the verbose v1 annotation JSON format and
 * the compact v2 format that reduces storage by ~75%.
 *
 * v1 (legacy):
 *   { "0": { bounds: {top,left,right,bottom}, tokensJsons: [{pageIndex,tokenIndex},...], rawText: "..." } }
 *
 * v2 (compact):
 *   { v: 2, p: { "0": { b: [top,left,right,bottom], t: "35-37,40" } } }
 */

import {
  COMPACT_JSON_MAX_RANGE_SPAN,
  COMPACT_JSON_MAX_TOTAL_TOKENS,
} from "../assets/configurations/constants";
import {
  BoundingBox,
  MultipageAnnotationJson,
  SinglePageAnnotationJson,
  SpanAnnotationJson,
  TokenId,
} from "../components/types";

// ═══════════════════════════════════════════════════════════════
// Safety limits (from project constants)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Compact v2 types
// ═══════════════════════════════════════════════════════════════

/** Per-page data in compact v2 format. */
export interface CompactPageData {
  /** Bounds as array: [top, left, right, bottom] */
  b: [number, number, number, number];
  /** Token indices as range-encoded string, e.g. "35-37,40" */
  t: string;
}

/** Compact v2 multipage annotation JSON. */
export interface CompactAnnotationJson {
  /** Version marker — always 2 */
  v: 2;
  /** Pages keyed by page index string */
  p: Record<string, CompactPageData>;
}

// ═══════════════════════════════════════════════════════════════
// Range encoding (mirrors textBlockEncoding.ts logic)
// ═══════════════════════════════════════════════════════════════

/**
 * Encode sorted token indices into a compact range string.
 * [1, 2, 3, 5, 7, 8, 9] → "1-3,5,7-9"
 */
export function encodeTokenRanges(tokens: number[]): string {
  if (tokens.length === 0) return "";
  const sorted = [...new Set(tokens)]
    .filter((t) => t >= 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === rangeEnd + 1) {
      rangeEnd = sorted[i];
    } else {
      ranges.push(
        rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`
      );
      rangeStart = sorted[i];
      rangeEnd = sorted[i];
    }
  }
  ranges.push(
    rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`
  );
  return ranges.join(",");
}

/**
 * Decode a compact range string back to an array of token indices.
 * "1-3,5,7-9" → [1, 2, 3, 5, 7, 8, 9]
 */
export function decodeTokenRanges(rangeStr: string): number[] {
  if (!rangeStr) return [];
  const tokens: number[] = [];
  let total = 0;
  let truncated = false;
  const parts = rangeStr.split(",");

  for (const part of parts) {
    if (part.includes("-")) {
      const idx = part.indexOf("-");
      const startStr = part.slice(0, idx);
      const endStr = part.slice(idx + 1);
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end)) continue;
      if (end - start > COMPACT_JSON_MAX_RANGE_SPAN || end - start < 0)
        continue;
      total += end - start + 1;
      if (total > COMPACT_JSON_MAX_TOTAL_TOKENS) {
        truncated = true;
        break;
      }
      for (let i = start; i <= end; i++) {
        tokens.push(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num)) {
        total += 1;
        if (total > COMPACT_JSON_MAX_TOTAL_TOKENS) {
          truncated = true;
          break;
        }
        tokens.push(num);
      }
    }
  }
  if (truncated) {
    console.warn(
      `decodeTokenRanges truncated at ${
        tokens.length
      } tokens (limit ${COMPACT_JSON_MAX_TOTAL_TOKENS}): ${rangeStr.slice(
        0,
        80
      )}...`
    );
  }
  return tokens;
}

// ═══════════════════════════════════════════════════════════════
// Format detection
// ═══════════════════════════════════════════════════════════════

/** Check if annotation JSON uses the compact v2 format. */
export function isCompactFormat(
  json: Record<string, unknown> | CompactAnnotationJson
): json is CompactAnnotationJson {
  return (
    json != null &&
    (json as Record<string, unknown>).v === 2 &&
    typeof (json as Record<string, unknown>).p === "object" &&
    (json as Record<string, unknown>).p !== null
  );
}

/**
 * Check if annotation JSON is a span annotation ({start, end}).
 *
 * Detection is based on the presence of `start` and `end` keys with
 * numeric values — not an exact key-set check — so span annotations
 * that carry additional metadata (e.g. `confidence`, `source`) are
 * still recognised correctly.
 */
export function isSpanFormat(
  json: Record<string, unknown> | SpanAnnotationJson
): json is SpanAnnotationJson {
  if (json == null) return false;
  return (
    typeof (json as Record<string, unknown>).start === "number" &&
    typeof (json as Record<string, unknown>).end === "number"
  );
}

// ═══════════════════════════════════════════════════════════════
// Compact: v1 → v2
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a v1 MultipageAnnotationJson to compact v2 format.
 * Span annotations and already-compact data are returned as-is.
 */
export function compactAnnotationJson(
  v1Json: MultipageAnnotationJson
): CompactAnnotationJson {
  const pages: Record<string, CompactPageData> = {};

  for (const [pageKey, pageData] of Object.entries(v1Json)) {
    const data = pageData as SinglePageAnnotationJson;

    // b = [top, left, right, bottom]
    const b: [number, number, number, number] = [
      data.bounds?.top ?? 0,
      data.bounds?.left ?? 0,
      data.bounds?.right ?? 0,
      data.bounds?.bottom ?? 0,
    ];

    const indices = (data.tokensJsons ?? []).map((tok) => tok.tokenIndex);
    const t = encodeTokenRanges(indices);

    pages[pageKey] = { b, t };
  }

  return { v: 2, p: pages };
}

// ═══════════════════════════════════════════════════════════════
// Expand: v2 → v1
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize annotation JSON to canonical v1 MultipageAnnotationJson.
 * Accepts both v1 and v2 formats. If already v1, returns as-is.
 */
export function expandAnnotationJson(
  json: MultipageAnnotationJson | CompactAnnotationJson | SpanAnnotationJson,
  rawText: string = ""
): MultipageAnnotationJson | SpanAnnotationJson {
  // Type guard: not an object → return as-is
  if (!json || typeof json !== "object") {
    return json as MultipageAnnotationJson;
  }

  const record = json as Record<string, unknown>;

  // Span annotation — pass through
  if (isSpanFormat(record)) {
    return json as SpanAnnotationJson;
  }

  // Already v1 — pass through
  if (!isCompactFormat(record)) {
    return json as MultipageAnnotationJson;
  }

  // Expand v2 → v1
  const compact = json as CompactAnnotationJson;
  const v1: MultipageAnnotationJson = {};

  for (const [pageKey, pageData] of Object.entries(compact.p)) {
    const pageIdx = parseInt(pageKey, 10);
    const actualPageIdx = isNaN(pageIdx) ? 0 : pageIdx;

    // Expand bounds: b = [top, left, right, bottom]
    const b = pageData.b;
    const bounds: BoundingBox = {
      top: b?.[0] ?? 0,
      left: b?.[1] ?? 0,
      right: b?.[2] ?? 0,
      bottom: b?.[3] ?? 0,
    };

    // Expand token refs
    const indices =
      typeof pageData.t === "string"
        ? decodeTokenRanges(pageData.t)
        : Array.isArray(pageData.t)
        ? (pageData.t as number[])
        : [];
    const tokensJsons: TokenId[] = indices.map((tokenIndex) => ({
      pageIndex: actualPageIdx,
      tokenIndex,
    }));

    v1[pageKey as unknown as number] = {
      bounds,
      tokensJsons,
      rawText,
    };
  }

  return v1;
}
