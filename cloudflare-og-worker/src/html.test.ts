/**
 * Tests for HTML generation utilities
 *
 * These tests verify XSS prevention and proper HTML escaping.
 */

import { describe, it, expect } from "vitest";
import { generateOGHtml, generateGenericOGHtml } from "./html";
import type { OGMetadata, Env } from "./types";

// Mock environment for tests
const mockEnv: Env = {
  SITE_URL: "https://contracts.example.com",
  API_URL: "https://contracts.example.com",
  OG_IMAGE_BASE: "https://contracts.example.com/static/og-images",
};

describe("generateOGHtml", () => {
  const baseMetadata: OGMetadata = {
    type: "corpus",
    title: "Test Corpus",
    description: "A test description",
    creatorName: "TestUser",
  };

  it("generates valid HTML with OG meta tags", () => {
    const html = generateOGHtml(
      baseMetadata,
      "https://contracts.example.com/c/user/corpus",
      mockEnv
    );

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:url"');
    expect(html).toContain('<meta property="og:image"');
    expect(html).toContain('<meta name="twitter:card"');
  });

  it("escapes HTML special characters in title", () => {
    const metadata: OGMetadata = {
      ...baseMetadata,
      title: '<script>alert("XSS")</script>',
    };
    const html = generateOGHtml(metadata, "https://example.com/test", mockEnv);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML special characters in description", () => {
    const metadata: OGMetadata = {
      ...baseMetadata,
      description: 'Test <b>bold</b> & "quoted"',
    };
    const html = generateOGHtml(metadata, "https://example.com/test", mockEnv);

    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("escapes HTML special characters in creator name", () => {
    const metadata: OGMetadata = {
      ...baseMetadata,
      creatorName: "User<script>hack</script>",
    };
    const html = generateOGHtml(metadata, "https://example.com/test", mockEnv);

    expect(html).not.toContain("<script>hack");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML special characters in URL", () => {
    const html = generateOGHtml(
      baseMetadata,
      'https://example.com/test?foo="bar"&baz=1',
      mockEnv
    );

    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("escapes HTML special characters in image URL", () => {
    const metadata: OGMetadata = {
      ...baseMetadata,
      image: 'https://example.com/image.png?x="test"',
    };
    const html = generateOGHtml(metadata, "https://example.com/test", mockEnv);

    expect(html).toContain("&quot;test&quot;");
  });

  it("truncates description to 200 characters", () => {
    const longDescription = "A".repeat(300);
    const metadata: OGMetadata = {
      ...baseMetadata,
      description: longDescription,
    };
    const html = generateOGHtml(metadata, "https://example.com/test", mockEnv);

    // Description should be truncated with ellipsis
    expect(html).not.toContain("A".repeat(300));
    expect(html).toContain("...");
  });

  it("uses default OG image when none provided", () => {
    const html = generateOGHtml(baseMetadata, "https://example.com/test", mockEnv);

    expect(html).toContain(`${mockEnv.OG_IMAGE_BASE}/default-og.png`);
  });

  it("uses custom image when provided", () => {
    const metadata: OGMetadata = {
      ...baseMetadata,
      image: "https://example.com/custom-image.png",
    };
    const html = generateOGHtml(metadata, "https://example.com/test", mockEnv);

    expect(html).toContain("https://example.com/custom-image.png");
  });

  it("includes entity type label in title", () => {
    const html = generateOGHtml(baseMetadata, "https://example.com/test", mockEnv);

    expect(html).toContain("Corpus");
  });

  it("includes meta refresh redirect", () => {
    const html = generateOGHtml(
      baseMetadata,
      "https://contracts.example.com/c/user/corpus",
      mockEnv
    );

    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("url=https://contracts.example.com/c/user/corpus");
  });
});

describe("generateGenericOGHtml", () => {
  it("generates valid HTML with generic OG meta tags", () => {
    const html = generateGenericOGHtml("https://contracts.example.com", mockEnv);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<meta property="og:title" content="OpenContracts"');
    expect(html).toContain('<meta property="og:url"');
    expect(html).toContain('<meta property="og:image"');
  });

  it("escapes HTML special characters in URL", () => {
    const html = generateGenericOGHtml(
      'https://example.com/?x="test"&y=1',
      mockEnv
    );

    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
  });

  it("uses default OG image", () => {
    const html = generateGenericOGHtml("https://example.com", mockEnv);

    expect(html).toContain(`${mockEnv.OG_IMAGE_BASE}/default-og.png`);
  });

  it("includes meta refresh redirect", () => {
    const html = generateGenericOGHtml("https://contracts.example.com/about", mockEnv);

    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("url=https://contracts.example.com/about");
  });
});

describe("XSS prevention", () => {
  it("prevents script injection via title", () => {
    const metadata: OGMetadata = {
      type: "corpus",
      title: '"><script>alert(1)</script><meta name="',
      description: "Test",
      creatorName: "User",
    };
    const html = generateOGHtml(metadata, "https://example.com", mockEnv);

    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("prevents event handler injection", () => {
    const metadata: OGMetadata = {
      type: "corpus",
      title: '" onload="alert(1)',
      description: "Test",
      creatorName: "User",
    };
    const html = generateOGHtml(metadata, "https://example.com", mockEnv);

    expect(html).not.toContain('onload="alert(1)');
  });

  it("prevents URL-based XSS in canonical URL", () => {
    const html = generateOGHtml(
      {
        type: "corpus",
        title: "Test",
        description: "Test",
        creatorName: "User",
      },
      'javascript:alert("XSS")',
      mockEnv
    );

    // The URL should be escaped, not executed
    expect(html).not.toContain('javascript:alert("XSS")');
    expect(html).toContain("javascript:alert(&quot;XSS&quot;)");
  });

  it("escapes single quotes to prevent attribute escaping", () => {
    const metadata: OGMetadata = {
      type: "corpus",
      title: "Test's Title",
      description: "Test",
      creatorName: "User",
    };
    const html = generateOGHtml(metadata, "https://example.com", mockEnv);

    expect(html).toContain("&#039;");
  });

  it("escapes ampersands", () => {
    const metadata: OGMetadata = {
      type: "corpus",
      title: "Test & Title",
      description: "Test",
      creatorName: "User",
    };
    const html = generateOGHtml(metadata, "https://example.com", mockEnv);

    expect(html).toContain("&amp;");
  });
});
