/**
 * Regression net for textBlockEncoding — pins down the URL-safe encoding
 * contract used by the PDF annotator's deep-linking feature (?tb= param).
 *
 * These round-trip tests become the behavioral baseline for the PdfAnnotator
 * package extraction: if any of them fail after the move, the encoding
 * surface has drifted silently.
 */
import { describe, it, expect } from "vitest";
import {
  encodeTextBlock,
  decodeTextBlock,
  textBlockFromSpan,
  textBlockFromMultipageJson,
  textBlockFromTokensByPage,
  textBlockToTokenIds,
  textBlockToBounds,
  type PdfTokenBlock,
  type TextSpanBlock,
} from "../textBlockEncoding";
import type {
  BoundingBox,
  MultipageAnnotationJson,
  TokenId,
} from "../../components/types";

describe("textBlockEncoding — span blocks", () => {
  it("encodes a span block as s{start}-{end}", () => {
    const block: TextSpanBlock = { type: "span", start: 100, end: 500 };
    expect(encodeTextBlock(block)).toBe("s100-500");
  });

  it("encodes a zero-start span", () => {
    const block: TextSpanBlock = { type: "span", start: 0, end: 10 };
    expect(encodeTextBlock(block)).toBe("s0-10");
  });

  it("encodes a zero-length span", () => {
    const block: TextSpanBlock = { type: "span", start: 42, end: 42 };
    expect(encodeTextBlock(block)).toBe("s42-42");
  });

  it("decodes a valid span string", () => {
    expect(decodeTextBlock("s100-500")).toEqual({
      type: "span",
      start: 100,
      end: 500,
    });
  });

  it("round-trips a span block", () => {
    const original: TextSpanBlock = { type: "span", start: 7, end: 1234 };
    const encoded = encodeTextBlock(original);
    const decoded = decodeTextBlock(encoded);
    expect(decoded).toEqual(original);
  });

  it("rejects a span where start > end", () => {
    expect(decodeTextBlock("s500-100")).toBeNull();
  });

  it("rejects a malformed span missing the hyphen", () => {
    expect(decodeTextBlock("s100")).toBeNull();
  });

  it("rejects a span with non-numeric parts", () => {
    expect(decodeTextBlock("sabc-def")).toBeNull();
  });
});

describe("textBlockEncoding — pdf token blocks", () => {
  it("encodes a single page with a consecutive range", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [1, 2, 3, 4] },
    };
    expect(encodeTextBlock(block)).toBe("p0:1-4");
  });

  it("encodes a single page with mixed singletons and ranges", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [1, 2, 3, 5, 7, 8, 9] },
    };
    expect(encodeTextBlock(block)).toBe("p0:1-3,5,7-9");
  });

  it("encodes a single-token page as a bare index, not a range", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [42] },
    };
    expect(encodeTextBlock(block)).toBe("p0:42");
  });

  it("sorts tokens before encoding so unordered input round-trips", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [5, 1, 3, 2, 4] },
    };
    expect(encodeTextBlock(block)).toBe("p0:1-5");
  });

  it("encodes multiple pages separated by semicolons", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [45, 46, 47, 48, 49, 50], 1: [0, 1, 2] },
    };
    expect(encodeTextBlock(block)).toBe("p0:45-50;p1:0-2");
  });

  it("skips pages with empty token arrays during encoding", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [1, 2, 3], 1: [] },
    };
    expect(encodeTextBlock(block)).toBe("p0:1-3");
  });

  it("decodes a single-page pdf token string", () => {
    expect(decodeTextBlock("p0:1-4")).toEqual({
      type: "pdf",
      tokensByPage: { 0: [1, 2, 3, 4] },
    });
  });

  it("decodes a multi-page pdf token string", () => {
    expect(decodeTextBlock("p0:45-50;p1:0-2")).toEqual({
      type: "pdf",
      tokensByPage: { 0: [45, 46, 47, 48, 49, 50], 1: [0, 1, 2] },
    });
  });

  it("decodes mixed singletons and ranges on a single page", () => {
    expect(decodeTextBlock("p0:1-3,5,7-9")).toEqual({
      type: "pdf",
      tokensByPage: { 0: [1, 2, 3, 5, 7, 8, 9] },
    });
  });

  it("round-trips a complex multi-page pdf block", () => {
    const original: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: {
        0: [0, 1, 2, 10, 11, 20],
        5: [100],
        12: [5, 6, 7, 8, 9, 12],
      },
    };
    const encoded = encodeTextBlock(original);
    const decoded = decodeTextBlock(encoded);
    expect(decoded).toEqual(original);
  });

  it("returns null for a pdf string with no parseable segments", () => {
    expect(decodeTextBlock("pZ:abc")).toBeNull();
  });

  it("skips malformed segments but keeps valid ones", () => {
    expect(decodeTextBlock("p0:1-3;garbage;p1:5")).toEqual({
      type: "pdf",
      tokensByPage: { 0: [1, 2, 3], 1: [5] },
    });
  });
});

describe("textBlockEncoding — security / DoS guards", () => {
  it("skips a single range whose span exceeds MAX_RANGE_SPAN (10000)", () => {
    // A malicious URL like "p0:0-9999999" must not allocate a huge array.
    const decoded = decodeTextBlock("p0:0-9999999") as PdfTokenBlock | null;
    // Either the segment is dropped entirely and the result is null,
    // or it falls through without exploding. Current behavior: null (the
    // only segment was rejected, leaving tokensByPage empty).
    expect(decoded).toBeNull();
  });

  it("accepts a range of exactly MAX_RANGE_SPAN (10000)", () => {
    // Range span of 10000 means end - start === 10000, inclusive → 10001 tokens.
    // Implementation uses `end - start > MAX_RANGE_SPAN`, so equal is allowed.
    const decoded = decodeTextBlock("p0:0-10000") as PdfTokenBlock;
    expect(decoded).not.toBeNull();
    expect(decoded.tokensByPage[0].length).toBe(10001);
  });

  it("enforces MAX_TOTAL_TOKENS (50000) across many page segments", () => {
    // Six segments of 10000 tokens each = 60000 total. The decoder should
    // stop accumulating once it crosses 50000, dropping trailing segments.
    const segments = [0, 1, 2, 3, 4, 5].map((p) => `p${p}:0-10000`).join(";");
    const decoded = decodeTextBlock(segments) as PdfTokenBlock;
    expect(decoded).not.toBeNull();
    const totalTokens = Object.values(decoded.tokensByPage).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    // Should not exceed 50000 by more than one page (the one that tipped
    // the scale gets added before the check; after, nothing else is).
    expect(totalTokens).toBeLessThanOrEqual(60001);
    // But at least one trailing page should have been dropped.
    expect(Object.keys(decoded.tokensByPage).length).toBeLessThan(6);
  });
});

describe("textBlockEncoding — constructors", () => {
  it("textBlockFromSpan builds a TextSpanBlock", () => {
    expect(textBlockFromSpan(10, 50)).toEqual({
      type: "span",
      start: 10,
      end: 50,
    });
  });

  it("textBlockFromMultipageJson extracts token indices per page", () => {
    const json: MultipageAnnotationJson = {
      0: {
        bounds: { top: 0, bottom: 10, left: 0, right: 10 },
        rawText: "hello",
        tokensJsons: [
          { pageIndex: 0, tokenIndex: 5 },
          { pageIndex: 0, tokenIndex: 6 },
          { pageIndex: 0, tokenIndex: 7 },
        ],
      },
      2: {
        bounds: { top: 0, bottom: 10, left: 0, right: 10 },
        rawText: "world",
        tokensJsons: [{ pageIndex: 2, tokenIndex: 0 }],
      },
    };
    expect(textBlockFromMultipageJson(json)).toEqual({
      type: "pdf",
      tokensByPage: { 0: [5, 6, 7], 2: [0] },
    });
  });

  it("textBlockFromMultipageJson skips pages with no tokens", () => {
    const json: MultipageAnnotationJson = {
      0: {
        bounds: { top: 0, bottom: 10, left: 0, right: 10 },
        rawText: "",
        tokensJsons: [],
      },
    };
    expect(textBlockFromMultipageJson(json)).toEqual({
      type: "pdf",
      tokensByPage: {},
    });
  });

  it("textBlockFromTokensByPage extracts indices from TokenId arrays", () => {
    const tokensByPage: Record<number, TokenId[]> = {
      0: [
        { pageIndex: 0, tokenIndex: 1 },
        { pageIndex: 0, tokenIndex: 2 },
      ],
      3: [{ pageIndex: 3, tokenIndex: 42 }],
    };
    expect(textBlockFromTokensByPage(tokensByPage)).toEqual({
      type: "pdf",
      tokensByPage: { 0: [1, 2], 3: [42] },
    });
  });

  it("textBlockFromTokensByPage skips pages with empty arrays", () => {
    expect(
      textBlockFromTokensByPage({ 0: [], 1: [{ pageIndex: 1, tokenIndex: 5 }] })
    ).toEqual({
      type: "pdf",
      tokensByPage: { 1: [5] },
    });
  });
});

describe("textBlockEncoding — renderers", () => {
  it("textBlockToTokenIds expands indices back to TokenId objects", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [1, 2], 5: [10] },
    };
    expect(textBlockToTokenIds(block)).toEqual({
      0: [
        { pageIndex: 0, tokenIndex: 1 },
        { pageIndex: 0, tokenIndex: 2 },
      ],
      5: [{ pageIndex: 5, tokenIndex: 10 }],
    });
  });

  it("textBlockToBounds computes the union bounding box per page", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [0, 1, 2] },
    };
    const pageTokens = {
      0: [
        { x: 10, y: 20, width: 50, height: 10 },
        { x: 100, y: 20, width: 30, height: 10 },
        { x: 10, y: 40, width: 120, height: 10 },
      ],
    };
    const bounds = textBlockToBounds(block, pageTokens);
    expect(bounds[0]).toEqual<BoundingBox>({
      top: 20,
      left: 10,
      bottom: 50,
      right: 130,
    });
  });

  it("textBlockToBounds skips pages that are not in pageTokens", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [0], 1: [0] },
    };
    const pageTokens = {
      0: [{ x: 0, y: 0, width: 10, height: 10 }],
    };
    const bounds = textBlockToBounds(block, pageTokens);
    expect(Object.keys(bounds)).toEqual(["0"]);
  });

  it("textBlockToBounds tolerates missing token indices", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [0, 99] }, // token 99 does not exist
    };
    const pageTokens = {
      0: [{ x: 10, y: 20, width: 50, height: 10 }],
    };
    const bounds = textBlockToBounds(block, pageTokens);
    expect(bounds[0]).toEqual<BoundingBox>({
      top: 20,
      left: 10,
      bottom: 30,
      right: 60,
    });
  });

  it("textBlockToBounds omits the page when no token index resolves", () => {
    const block: PdfTokenBlock = {
      type: "pdf",
      tokensByPage: { 0: [99, 100] },
    };
    const pageTokens = {
      0: [{ x: 10, y: 20, width: 50, height: 10 }],
    };
    expect(textBlockToBounds(block, pageTokens)).toEqual({});
  });
});

describe("textBlockEncoding — general decode rules", () => {
  it("returns null for empty string", () => {
    expect(decodeTextBlock("")).toBeNull();
  });

  it("returns null for strings that don't start with 's' or 'p'", () => {
    expect(decodeTextBlock("x100-200")).toBeNull();
    expect(decodeTextBlock("100-200")).toBeNull();
  });
});
