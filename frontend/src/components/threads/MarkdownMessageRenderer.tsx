import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Database, FileText, Tag, User } from "lucide-react";
import { color } from "../../theme/colors";
import { MentionedResourceType } from "../../types/graphql-api";
import { sanitizeForTooltip } from "../../utils/textSanitization";

const MarkdownContainer = styled.div`
  p {
    margin: 0 0 8px 0;
  }

  code {
    background: ${color.N3};
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: monospace;
  }

  pre {
    background: ${color.N3};
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
  }

  ul,
  ol {
    padding-left: 24px;
    margin: 8px 0;
  }

  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }

  blockquote {
    border-left: 3px solid ${color.B5};
    padding-left: 12px;
    margin: 8px 0;
    color: ${color.N7};
  }
`;

const MentionLink = styled.a<{ $type: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  text-decoration: none;
  vertical-align: middle;
  margin: 0 2px;
  font-size: 0.9em;

  background: ${(props) => {
    if (props.$type === "user")
      return "linear-gradient(135deg, #06b6d415 0%, #10b98115 100%)";
    if (props.$type === "corpus")
      return "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)";
    if (props.$type === "document")
      return "linear-gradient(135deg, #f093fb15 0%, #f5576c15 100%)";
    if (props.$type === "annotation")
      return "linear-gradient(135deg, #43e97b15 0%, #38f9d715 100%)";
    return "linear-gradient(135deg, #e0e0e015 0%, #c0c0c015 100%)";
  }};

  border: 1px solid
    ${(props) => {
      if (props.$type === "user") return "#10b98160";
      if (props.$type === "corpus") return color.P4;
      if (props.$type === "document") return "#f5576c40";
      if (props.$type === "annotation") return "#38f9d780";
      return color.N4;
    }};

  color: ${(props) => {
    if (props.$type === "user") return "#0d9488";
    if (props.$type === "corpus") return color.P8;
    if (props.$type === "document") return "#c41e3a";
    if (props.$type === "annotation") return "#0d9488";
    return color.N8;
  }};

  &:hover {
    background: ${(props) => {
      if (props.$type === "user")
        return "linear-gradient(135deg, #06b6d425 0%, #10b98125 100%)";
      if (props.$type === "corpus")
        return "linear-gradient(135deg, #667eea25 0%, #764ba225 100%)";
      if (props.$type === "document")
        return "linear-gradient(135deg, #f093fb25 0%, #f5576c25 100%)";
      if (props.$type === "annotation")
        return "linear-gradient(135deg, #43e97b25 0%, #38f9d725 100%)";
      return "linear-gradient(135deg, #e0e0e025 0%, #c0c0c025 100%)";
    }};

    border-color: ${(props) => {
      if (props.$type === "user") return "#10b981";
      if (props.$type === "corpus") return color.P6;
      if (props.$type === "document") return "#f5576c80";
      if (props.$type === "annotation") return "#38f9d7";
      return color.N6;
    }};

    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
`;

const MentionIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const RegularLink = styled.a`
  color: ${color.B7};
  text-decoration: underline;

  &:hover {
    color: ${color.B8};
  }
`;

interface MarkdownMessageRendererProps {
  content: string;
  /**
   * Optional mentioned resources from backend (Issue #689)
   * Provides full metadata for rich tooltips on annotation mentions
   */
  mentionedResources?: MentionedResourceType[];
}

/**
 * Render markdown message content with styled mentions
 * Detects mention links by their URL pattern and styles them differently
 *
 * Part of Issue #623 - @ Mentions Feature (Extended)
 * Updated for Issue #689 - Rich tooltips for annotation mentions
 */
export function MarkdownMessageRenderer({
  content,
  mentionedResources = [],
}: MarkdownMessageRendererProps) {
  const navigate = useNavigate();

  // Build URL → Resource lookup map for rich tooltips (Issue #689)
  const resourceByUrl = useMemo(() => {
    const map = new Map<string, MentionedResourceType>();
    mentionedResources.forEach((r) => map.set(r.url, r));
    return map;
  }, [mentionedResources]);

  /**
   * Detect mention type from URL pattern
   */
  const detectMentionType = (href: string): string | null => {
    if (!href) return null;

    // User: /users/{slug}
    if (href.startsWith("/users/")) return "user";

    // Corpus: /c/{creator}/{slug}
    if (href.startsWith("/c/")) return "corpus";

    // Document: /d/{creator}/{corpus}/{doc}
    if (href.startsWith("/d/")) {
      // Annotation has query param ?ann=
      if (href.includes("?ann=") || href.includes("&ann=")) {
        return "annotation";
      }
      return "document";
    }

    return null;
  };

  /**
   * Get icon component for mention type (Issue #689)
   */
  const getMentionIcon = (type: string): React.ReactNode => {
    switch (type) {
      case "user":
        return <User size={14} />;
      case "corpus":
        return <Database size={14} />;
      case "document":
        return <FileText size={14} />;
      case "annotation":
        return <Tag size={14} />;
      default:
        return null;
    }
  };

  /**
   * Get tooltip text for mention (Issue #689)
   * Uses rich metadata from mentionedResources when available
   * Sanitizes all user-generated text to prevent XSS and normalize whitespace
   */
  const getMentionTooltip = (
    type: string,
    text: string,
    resource?: MentionedResourceType
  ): string => {
    // For annotations with rich metadata, build a detailed tooltip
    if (type === "annotation" && resource?.rawText) {
      const parts: string[] = [];

      // Show full annotation text (truncated if very long), sanitized for tooltip
      const sanitizedText = sanitizeForTooltip(resource.rawText);
      const truncatedText =
        sanitizedText.length > 200
          ? `${sanitizedText.slice(0, 200)}...`
          : sanitizedText;
      parts.push(`"${truncatedText}"`);

      // Add label if available (sanitize user content)
      if (resource.annotationLabel) {
        parts.push(`Label: ${sanitizeForTooltip(resource.annotationLabel)}`);
      }

      // Add document context if available (sanitize user content)
      if (resource.document?.title) {
        parts.push(`Document: ${sanitizeForTooltip(resource.document.title)}`);
      }

      return parts.join("\n");
    }

    // Fallback to simple tooltips for other types (sanitize all user content)
    switch (type) {
      case "user":
        return `User: ${sanitizeForTooltip(text)}`;
      case "corpus":
        return `Corpus: ${sanitizeForTooltip(resource?.title || text)}`;
      case "document":
        return `Document: ${sanitizeForTooltip(resource?.title || text)}`;
      case "annotation":
        return `Annotation: ${sanitizeForTooltip(text)}`;
      default:
        return sanitizeForTooltip(text);
    }
  };

  return (
    <MarkdownContainer>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          // Custom link renderer to style mentions
          a: ({ node, href, children, ...props }) => {
            const mentionType = detectMentionType(href || "");

            if (mentionType) {
              // Extract text content for tooltip fallback
              const textContent =
                typeof children === "string"
                  ? children
                  : Array.isArray(children)
                  ? children.join("")
                  : String(children);

              // Look up rich metadata from mentionedResources (Issue #689)
              const resource = href ? resourceByUrl.get(href) : undefined;

              // This is a mention link - style it specially with icon (Issue #689)
              return (
                <MentionLink
                  href={href}
                  $type={mentionType}
                  title={getMentionTooltip(mentionType, textContent, resource)}
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) {
                      navigate(href);
                    }
                  }}
                  {...props}
                >
                  <MentionIcon>{getMentionIcon(mentionType)}</MentionIcon>
                  {children}
                </MentionLink>
              );
            }

            // Regular link
            return (
              <RegularLink
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </RegularLink>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </MarkdownContainer>
  );
}
