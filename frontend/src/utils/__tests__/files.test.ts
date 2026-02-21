import { describe, it, expect } from "vitest";
import { isTextFileType, isPdfFileType } from "../files";

describe("File type utilities", () => {
  describe("isTextFileType", () => {
    it("should return true for text/plain", () => {
      expect(isTextFileType("text/plain")).toBe(true);
    });

    it("should return true for text/* variants", () => {
      expect(isTextFileType("text/html")).toBe(true);
      expect(isTextFileType("text/csv")).toBe(true);
    });

    it("should return true for application/txt (legacy)", () => {
      expect(isTextFileType("application/txt")).toBe(true);
    });

    it("should return false for PDF", () => {
      expect(isTextFileType("application/pdf")).toBe(false);
    });

    it("should return false for other MIME types", () => {
      expect(isTextFileType("application/json")).toBe(false);
      expect(isTextFileType("image/png")).toBe(false);
    });

    it("should handle null/undefined gracefully", () => {
      expect(isTextFileType(null)).toBe(false);
      expect(isTextFileType(undefined)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isTextFileType("")).toBe(false);
    });
  });

  describe("isPdfFileType", () => {
    it("should return true for application/pdf", () => {
      expect(isPdfFileType("application/pdf")).toBe(true);
    });

    it("should return false for text types", () => {
      expect(isPdfFileType("text/plain")).toBe(false);
      expect(isPdfFileType("application/txt")).toBe(false);
    });

    it("should handle null/undefined gracefully", () => {
      expect(isPdfFileType(null)).toBe(false);
      expect(isPdfFileType(undefined)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isPdfFileType("")).toBe(false);
    });
  });
});
