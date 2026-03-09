import { describe, it, expect } from "vitest";
import { normalizeTokensToPdfViewport } from "../transform";
import { PageTokens, Token } from "../../components/types";

describe("normalizeTokensToPdfViewport", () => {
  const makePageTokens = (
    pageWidth: number,
    pageHeight: number,
    tokens: Token[]
  ): PageTokens => ({
    page: { index: 0, width: pageWidth, height: pageHeight },
    tokens,
  });

  const sampleTokens: Token[] = [
    { x: 100, y: 200, width: 50, height: 10, text: "hello" },
    { x: 300, y: 400, width: 80, height: 12, text: "world" },
  ];

  it("returns original tokens when dimensions match within epsilon", () => {
    const pageData = makePageTokens(612, 792, sampleTokens);
    const result = normalizeTokensToPdfViewport(pageData, 612, 792);
    // Should return the exact same array reference (no copy)
    expect(result).toBe(sampleTokens);
  });

  it("returns original tokens when dimensions differ by less than 0.5", () => {
    const pageData = makePageTokens(612, 792, sampleTokens);
    const result = normalizeTokensToPdfViewport(pageData, 612.3, 792.4);
    expect(result).toBe(sampleTokens);
  });

  it("rescales tokens when PAWLs width differs from viewport", () => {
    // PAWLs reports 612x792 but PDF.js viewport is 595x842
    const pageData = makePageTokens(612, 792, sampleTokens);
    const result = normalizeTokensToPdfViewport(pageData, 595, 842);

    const scaleX = 595 / 612;
    const scaleY = 842 / 792;

    expect(result).toHaveLength(2);
    expect(result[0].x).toBeCloseTo(100 * scaleX);
    expect(result[0].y).toBeCloseTo(200 * scaleY);
    expect(result[0].width).toBeCloseTo(50 * scaleX);
    expect(result[0].height).toBeCloseTo(10 * scaleY);
    expect(result[0].text).toBe("hello");

    expect(result[1].x).toBeCloseTo(300 * scaleX);
    expect(result[1].y).toBeCloseTo(400 * scaleY);
    expect(result[1].width).toBeCloseTo(80 * scaleX);
    expect(result[1].height).toBeCloseTo(12 * scaleY);
    expect(result[1].text).toBe("world");
  });

  it("preserves image token fields during rescaling", () => {
    const imageTokens: Token[] = [
      {
        x: 50,
        y: 100,
        width: 200,
        height: 150,
        text: "",
        is_image: true,
        image_path: "/images/fig1.jpg",
        format: "jpeg",
        original_width: 1024,
        original_height: 768,
      },
    ];
    const pageData = makePageTokens(612, 792, imageTokens);
    const result = normalizeTokensToPdfViewport(pageData, 600, 800);

    const scaleX = 600 / 612;
    const scaleY = 800 / 792;

    expect(result[0].x).toBeCloseTo(50 * scaleX);
    expect(result[0].y).toBeCloseTo(100 * scaleY);
    expect(result[0].width).toBeCloseTo(200 * scaleX);
    expect(result[0].height).toBeCloseTo(150 * scaleY);
    expect(result[0].is_image).toBe(true);
    expect(result[0].image_path).toBe("/images/fig1.jpg");
    expect(result[0].format).toBe("jpeg");
    // original_width/original_height are image pixel dimensions, not PDF
    // coordinates — they must NOT be rescaled.
    expect(result[0].original_width).toBe(1024);
    expect(result[0].original_height).toBe(768);
  });

  it("returns tokens as-is when PAWLs page dimensions are zero", () => {
    const pageData = makePageTokens(0, 0, sampleTokens);
    const result = normalizeTokensToPdfViewport(pageData, 612, 792);
    // Cannot rescale with zero dimensions — return original tokens untouched
    expect(result).toBe(sampleTokens);
  });

  it("returns tokens as-is when only one PAWLs dimension is zero", () => {
    const pageData = makePageTokens(612, 0, sampleTokens);
    const result = normalizeTokensToPdfViewport(pageData, 612, 792);
    expect(result).toBe(sampleTokens);
  });

  it("handles empty token arrays", () => {
    const pageData = makePageTokens(612, 792, []);
    const result = normalizeTokensToPdfViewport(pageData, 595, 842);
    expect(result).toHaveLength(0);
  });
});
