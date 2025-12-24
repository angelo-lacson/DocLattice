import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Database, FileText, ExternalLink, Tag } from "lucide-react";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import { color } from "../../theme/colors";
import { MENTION_PREVIEW_LENGTH } from "../../assets/configurations/constants";
import {
  createAnnotationPreview,
  sanitizeForTooltip,
} from "../../utils/textSanitization";

const ChipContainer = styled.span<{
  $type: "corpus" | "document" | "annotation";
}>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: middle;
  margin: 0 2px;

  background: ${(props) => {
    switch (props.$type) {
      case "corpus":
        return "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)";
      case "document":
        return "linear-gradient(135deg, #f093fb15 0%, #f5576c15 100%)";
      case "annotation":
        return "linear-gradient(135deg, #43e97b15 0%, #38f9d715 100%)";
      default: {
        const exhaustiveCheck: never = props.$type;
        console.error(`Unhandled chip type: ${exhaustiveCheck}`);
        return "linear-gradient(135deg, #e0e0e015 0%, #c0c0c015 100%)";
      }
    }
  }};

  border: 1px solid
    ${(props) => {
      switch (props.$type) {
        case "corpus":
          return color.P4;
        case "document":
          return "#f5576c40";
        case "annotation":
          return "#38f9d780";
        default: {
          const exhaustiveCheck: never = props.$type;
          console.error(`Unhandled chip type for border: ${exhaustiveCheck}`);
          return color.N4;
        }
      }
    }};

  color: ${(props) => {
    switch (props.$type) {
      case "corpus":
        return color.P8;
      case "document":
        return "#c41e3a";
      case "annotation":
        return "#0d9488";
      default: {
        const exhaustiveCheck: never = props.$type;
        console.error(`Unhandled chip type for color: ${exhaustiveCheck}`);
        return color.N8;
      }
    }
  }};

  &:hover {
    background: ${(props) => {
      switch (props.$type) {
        case "corpus":
          return "linear-gradient(135deg, #667eea25 0%, #764ba225 100%)";
        case "document":
          return "linear-gradient(135deg, #f093fb25 0%, #f5576c25 100%)";
        case "annotation":
          return "linear-gradient(135deg, #43e97b25 0%, #38f9d725 100%)";
        default: {
          const exhaustiveCheck: never = props.$type;
          console.error(`Unhandled chip type for hover bg: ${exhaustiveCheck}`);
          return "linear-gradient(135deg, #e0e0e025 0%, #c0c0c025 100%)";
        }
      }
    }};

    border-color: ${(props) => {
      switch (props.$type) {
        case "corpus":
          return color.P6;
        case "document":
          return "#f5576c80";
        case "annotation":
          return "#38f9d7";
        default: {
          const exhaustiveCheck: never = props.$type;
          console.error(
            `Unhandled chip type for hover border: ${exhaustiveCheck}`
          );
          return color.N6;
        }
      }
    }};

    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
`;

const IconWrapper = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ChipText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;

  @media (max-width: 640px) {
    max-width: 120px;
  }
`;

const ExternalIcon = styled(ExternalLink)`
  opacity: 0.6;
  flex-shrink: 0;
`;

// Tooltip popup for annotations (Issue #689)
const TooltipContainer = styled.div<{ $show: boolean }>`
  position: absolute;
  z-index: 10000;
  background: white;
  padding: 12px 14px;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.08);
  border: 1px solid ${color.N4};
  max-width: 320px;
  min-width: 200px;
  opacity: ${(props) => (props.$show ? 1 : 0)};
  pointer-events: ${(props) => (props.$show ? "auto" : "none")};
  transition: opacity 0.15s ease;

  @media (max-width: 640px) {
    max-width: 280px;
  }
`;

const TooltipContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TooltipText = styled.div`
  font-size: 13px;
  line-height: 1.5;
  color: ${color.N10};
  word-break: break-word;
  white-space: pre-wrap;

  /* Highlight quoted text */
  &::before {
    content: '"';
    color: ${color.N6};
  }
  &::after {
    content: '"';
    color: ${color.N6};
  }
`;

const TooltipMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid ${color.N3};
  font-size: 11px;
  color: ${color.N7};
`;

const TooltipMetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;

  svg {
    flex-shrink: 0;
  }
`;

export interface MentionedResource {
  type: "CORPUS" | "DOCUMENT" | "ANNOTATION";
  id: string;
  slug: string;
  title: string;
  url: string;
  corpus?:
    | {
        slug: string;
        title: string;
      }
    | null
    | undefined;
  // Annotation-specific fields (Issue #689)
  rawText?: string | null;
  annotationLabel?: string | null;
  document?: {
    title: string;
  } | null;
}

export interface MentionChipProps {
  resource: MentionedResource;
  /** Optional callback instead of default navigation */
  onClick?: (resource: MentionedResource) => void;
}

/**
 * Clickable chip for rendering @ mentions of corpuses, documents, and annotations
 * Backend provides the URL via the mentionedResources field
 *
 * Security: URLs are generated by backend with proper permission checks
 * Navigation uses React Router for corpus (full page) or custom handler for document/annotation (sidebar)
 *
 * Part of Issue #623 - @ Mentions Feature
 * Updated for Issue #689 - Improved annotation display with ~24 char preview and rich tooltip on hover
 */
export function MentionChip({ resource, onClick }: MentionChipProps) {
  const navigate = useNavigate();
  const [showTooltip, setShowTooltip] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Position the tooltip using floating-ui
  const updateTooltipPosition = async () => {
    if (!chipRef.current || !tooltipRef.current) return;

    const { x, y } = await computePosition(
      chipRef.current,
      tooltipRef.current,
      {
        placement: "top",
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }
    );

    Object.assign(tooltipRef.current.style, {
      left: `${x}px`,
      top: `${y}px`,
    });
  };

  // Update position when tooltip shows
  useEffect(() => {
    if (showTooltip) {
      updateTooltipPosition();
    }
  }, [showTooltip]);

  // Handle both mouse click and keyboard activation
  const handleActivation = (
    e: React.MouseEvent | React.KeyboardEvent
  ): void => {
    e.preventDefault();
    e.stopPropagation();

    if (onClick) {
      onClick(resource);
      return;
    }

    // Default navigation behavior - all types use navigate with the URL
    navigate(resource.url);
  };

  // Get appropriate icon based on resource type
  const getIcon = (): React.ReactNode => {
    switch (resource.type) {
      case "CORPUS":
        return <Database size={14} />;
      case "DOCUMENT":
        return <FileText size={14} />;
      case "ANNOTATION":
        return <Tag size={14} />;
      default: {
        const exhaustiveCheck: never = resource.type;
        console.error(`Unhandled resource type for icon: ${exhaustiveCheck}`);
        return <FileText size={14} />;
      }
    }
  };

  // For annotations: compute preview text and tooltip using shared utility
  // This ensures consistent sanitization and truncation (Issue #689)
  const annotationPreview =
    resource.type === "ANNOTATION"
      ? createAnnotationPreview(
          resource.rawText,
          resource.annotationLabel || resource.title,
          MENTION_PREVIEW_LENGTH
        )
      : null;

  // Get display text for the chip
  const getDisplayText = (): string => {
    if (resource.type === "ANNOTATION" && annotationPreview) {
      return annotationPreview.displayText;
    }
    // Corpus and Document show title
    return resource.title;
  };

  // Get simple tooltip text for non-annotation types (using native title)
  const getSimpleTooltipText = (): string => {
    // Corpus and Document use simple title tooltip
    return `${resource.title}${
      resource.corpus ? ` (in ${resource.corpus.title})` : ""
    }`;
  };

  // Get aria-label for screen readers (provides full context)
  const getAriaLabel = (): string => {
    const typeLabel =
      resource.type === "CORPUS"
        ? "Corpus"
        : resource.type === "DOCUMENT"
        ? "Document"
        : "Annotation";

    if (resource.type === "ANNOTATION") {
      const textPart = annotationPreview?.tooltipText || resource.title;
      const labelPart = resource.annotationLabel
        ? `, labeled ${resource.annotationLabel}`
        : "";
      const docPart = resource.document
        ? `, in document ${resource.document.title}`
        : "";
      return `${typeLabel}: ${textPart}${labelPart}${docPart}`;
    }

    const contextPart = resource.corpus
      ? `, in corpus ${resource.corpus.title}`
      : "";
    return `${typeLabel}: ${resource.title}${contextPart}`;
  };

  // Get chip type for styling
  const getChipType = (): "corpus" | "document" | "annotation" => {
    switch (resource.type) {
      case "CORPUS":
        return "corpus";
      case "DOCUMENT":
        return "document";
      case "ANNOTATION":
        return "annotation";
      default: {
        const exhaustiveCheck: never = resource.type;
        console.error(`Unhandled resource type: ${exhaustiveCheck}`);
        return "document"; // Fallback to document styling
      }
    }
  };

  // For annotations, use rich tooltip popup; for others, use native title
  const isAnnotation = resource.type === "ANNOTATION";

  return (
    <>
      <ChipContainer
        ref={chipRef}
        $type={getChipType()}
        onClick={handleActivation}
        title={isAnnotation ? undefined : getSimpleTooltipText()}
        aria-label={getAriaLabel()}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleActivation(e);
          }
        }}
        onMouseEnter={() => isAnnotation && setShowTooltip(true)}
        onMouseLeave={() => isAnnotation && setShowTooltip(false)}
      >
        <IconWrapper>{getIcon()}</IconWrapper>
        <ChipText>{getDisplayText()}</ChipText>
        <ExternalIcon size={12} />
      </ChipContainer>

      {/* Rich tooltip for annotations showing full text */}
      {isAnnotation && (
        <TooltipContainer
          ref={tooltipRef}
          $show={showTooltip}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <TooltipContent>
            {annotationPreview?.tooltipText && (
              <TooltipText>{annotationPreview.tooltipText}</TooltipText>
            )}
            <TooltipMeta>
              {resource.annotationLabel && (
                <TooltipMetaItem>
                  <Tag size={12} />
                  {resource.annotationLabel}
                </TooltipMetaItem>
              )}
              {resource.document && (
                <TooltipMetaItem>
                  <FileText size={12} />
                  {resource.document.title}
                </TooltipMetaItem>
              )}
            </TooltipMeta>
          </TooltipContent>
        </TooltipContainer>
      )}
    </>
  );
}

/**
 * Parse message content and replace mention patterns with MentionChip components
 * Looks for patterns like @corpus:slug, @document:slug, @corpus:slug/document:slug
 *
 * @param content - HTML content from message
 * @param mentionedResources - Array of mentioned resources from backend
 * @returns React element with mentions replaced by chips
 */
export function parseMentionsInContent(
  content: string,
  mentionedResources: MentionedResource[]
): React.ReactNode {
  if (!mentionedResources || mentionedResources.length === 0) {
    // No mentions, return content as-is
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  // Create a map of mention patterns to resources
  const mentionMap = new Map<string, MentionedResource>();

  mentionedResources.forEach((resource) => {
    if (resource.type === "CORPUS") {
      mentionMap.set(`@corpus:${resource.slug}`, resource);
    } else if (resource.type === "DOCUMENT") {
      if (resource.corpus) {
        mentionMap.set(
          `@corpus:${resource.corpus.slug}/document:${resource.slug}`,
          resource
        );
      } else {
        mentionMap.set(`@document:${resource.slug}`, resource);
      }
    }
  });

  // Split content by mention patterns and rebuild with chips
  // This is a simplified version - for production, use a proper HTML parser
  const mentionRegex =
    /@(?:corpus:[a-z0-9-]+(?:\/document:[a-z0-9-]+)?|document:[a-z0-9-]+)/gi;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push(
        <span
          key={`text-${key++}`}
          dangerouslySetInnerHTML={{
            __html: content.substring(lastIndex, match.index),
          }}
        />
      );
    }

    // Add mention chip
    const mentionText = match[0];
    const resource = mentionMap.get(mentionText);

    if (resource) {
      parts.push(<MentionChip key={`mention-${key++}`} resource={resource} />);
    } else {
      // Mention not found in resources (user doesn't have permission)
      // Just render as plain text
      parts.push(<span key={`text-${key++}`}>{mentionText}</span>);
    }

    lastIndex = mentionRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <span
        key={`text-${key++}`}
        dangerouslySetInnerHTML={{ __html: content.substring(lastIndex) }}
      />
    );
  }

  return <div>{parts}</div>;
}
