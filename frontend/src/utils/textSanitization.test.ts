import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  sanitizeForMention,
  truncateText,
} from "./textSanitization";
import { MENTION_PREVIEW_LENGTH } from "../assets/configurations/constants";

describe("textSanitization", () => {
  describe("escapeHtml", () => {
    it("escapes HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
      );
    });

    it("escapes ampersands", () => {
      expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    it("escapes quotes", () => {
      expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles text without special characters", () => {
      expect(escapeHtml("plain text")).toBe("plain text");
    });
  });

  describe("sanitizeForMention", () => {
    it("escapes markdown link characters", () => {
      expect(sanitizeForMention("[link](url)")).toBe("\\[link\\]\\(url\\)");
    });

    it("escapes backslashes", () => {
      expect(sanitizeForMention("path\\to\\file")).toBe("path\\\\to\\\\file");
    });

    it("replaces newlines with spaces", () => {
      expect(sanitizeForMention("line1\nline2\nline3")).toBe(
        "line1 line2 line3"
      );
    });

    it("removes carriage returns", () => {
      expect(sanitizeForMention("line1\r\nline2")).toBe("line1 line2");
    });

    it("handles empty string", () => {
      expect(sanitizeForMention("")).toBe("");
    });

    it("handles text without special characters", () => {
      expect(sanitizeForMention("plain text")).toBe("plain text");
    });

    it("handles complex annotation text", () => {
      const input =
        'This clause [Section 1.2] references (see Exhibit A)\nand continues...';
      const expected =
        "This clause \\[Section 1.2\\] references \\(see Exhibit A\\) and continues...";
      expect(sanitizeForMention(input)).toBe(expected);
    });
  });

  describe("truncateText", () => {
    it("truncates text longer than maxLength", () => {
      const longText = "This is a very long piece of text that should be truncated";
      const result = truncateText(longText, MENTION_PREVIEW_LENGTH);
      expect(result.length).toBeLessThanOrEqual(MENTION_PREVIEW_LENGTH + 1); // +1 for ellipsis
      expect(result.endsWith("…")).toBe(true);
    });

    it("does not truncate text shorter than maxLength", () => {
      const shortText = "Short text";
      expect(truncateText(shortText, MENTION_PREVIEW_LENGTH)).toBe(shortText);
    });

    it("sanitizes by default", () => {
      const textWithBrackets = "[Test]";
      expect(truncateText(textWithBrackets, 50)).toBe("\\[Test\\]");
    });

    it("can skip sanitization", () => {
      const textWithBrackets = "[Test]";
      expect(truncateText(textWithBrackets, 50, false)).toBe("[Test]");
    });

    it("handles empty string", () => {
      expect(truncateText("", 10)).toBe("");
    });
  });
});
