import React, { useState, useRef, useEffect, useCallback } from "react";
import styled from "styled-components";
import { Cable, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "react-toastify";

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const Container = styled.div`
  position: relative;
  display: inline-flex;
`;

const TriggerButton = styled.button<{ $size: "sm" | "md" }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: ${(props) => (props.$size === "sm" ? "4px 8px" : "6px 12px")};
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #64748b;
  font-size: ${(props) => (props.$size === "sm" ? "12px" : "13px")};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    background: #f0fdfa;
    border-color: #0f766e;
    color: #0f766e;
  }

  &:active {
    transform: scale(0.98);
  }

  svg {
    width: ${(props) => (props.$size === "sm" ? "14px" : "16px")};
    height: ${(props) => (props.$size === "sm" ? "14px" : "16px")};
  }
`;

const Popover = styled.div<{ $visible: boolean }>`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 1000;
  width: 340px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  visibility: ${(props) => (props.$visible ? "visible" : "hidden")};
  transform: ${(props) =>
    props.$visible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.95)"};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 480px) {
    width: calc(100vw - 32px);
    right: -16px;
  }
`;

const PopoverHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
`;

const PopoverTitle = styled.h4`
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 8px;

  svg {
    width: 16px;
    height: 16px;
    color: #0f766e;
  }
`;

const PopoverDescription = styled.p`
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.4;
`;

const PopoverContent = styled.div`
  padding: 16px;
`;

const UrlLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 6px;
`;

const UrlContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const UrlInput = styled.input`
  flex: 1;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 13px;
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  color: #334155;
  min-width: 0;

  &:focus {
    outline: none;
    border-color: #0f766e;
    background: white;
  }
`;

const CopyButton = styled.button<{ $copied: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: ${(props) => (props.$copied ? "#10b981" : "#0f766e")};
  border: none;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover {
    background: ${(props) => (props.$copied ? "#059669" : "#0d6560")};
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const SetupHint = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: #f0fdfa;
  border-radius: 8px;
  font-size: 12px;
  color: #0f766e;
  line-height: 1.5;

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const SetupLink = styled.a`
  color: #0f766e;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    color: #0d6560;
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface MCPShareButtonProps {
  /** Corpus slug used to construct the MCP endpoint URL */
  corpusSlug: string;
  /** Whether to show the button label (default: true) */
  showLabel?: boolean;
  /** Button size variant */
  size?: "sm" | "md";
  /** Test ID for the component */
  testId?: string;
}

/**
 * MCPShareButton - Button with popover for sharing corpus MCP endpoint
 *
 * Displays a button that, when clicked, shows a popover with:
 * - The MCP endpoint URL for the corpus
 * - Copy-to-clipboard functionality
 * - Brief setup instructions with link to docs
 *
 * Only intended for use with public corpuses.
 */
export const MCPShareButton: React.FC<MCPShareButtonProps> = ({
  corpusSlug,
  showLabel = true,
  size = "md",
  testId = "mcp-share-button",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Construct the MCP endpoint URL
  const mcpUrl = `${window.location.origin}/mcp/corpus/${corpusSlug}`;

  // Handle click outside to close popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Delay to prevent immediate close from the click that opened it
      const timer = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [isOpen]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  // Reset copied state when popover closes
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      toast.success("MCP endpoint URL copied to clipboard");

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      if (inputRef.current) {
        inputRef.current.select();
        document.execCommand("copy");
        setCopied(true);
        toast.success("MCP endpoint URL copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [mcpUrl]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <Container ref={containerRef} data-testid={testId}>
      <TriggerButton
        $size={size}
        onClick={handleToggle}
        aria-label="Share MCP endpoint"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        data-testid={`${testId}-trigger`}
      >
        <Cable />
        {showLabel && "MCP"}
      </TriggerButton>

      <Popover
        $visible={isOpen}
        role="dialog"
        aria-label="MCP endpoint sharing"
        data-testid={`${testId}-popover`}
      >
        <PopoverHeader>
          <PopoverTitle>
            <Cable />
            MCP Endpoint
          </PopoverTitle>
          <PopoverDescription>
            Connect AI assistants to this corpus using the Model Context
            Protocol.
          </PopoverDescription>
        </PopoverHeader>

        <PopoverContent>
          <UrlLabel htmlFor={`${testId}-url-input`}>Endpoint URL</UrlLabel>
          <UrlContainer>
            <UrlInput
              id={`${testId}-url-input`}
              ref={inputRef}
              type="text"
              value={mcpUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
              data-testid={`${testId}-url-input`}
            />
            <CopyButton
              $copied={copied}
              onClick={handleCopy}
              aria-label={copied ? "Copied" : "Copy URL"}
              data-testid={`${testId}-copy-button`}
            >
              {copied ? <Check /> : <Copy />}
            </CopyButton>
          </UrlContainer>

          <SetupHint>
            <ExternalLink />
            <span>
              Add this URL to your MCP client configuration.{" "}
              <SetupLink
                href="https://modelcontextprotocol.io/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more about MCP
              </SetupLink>
            </span>
          </SetupHint>
        </PopoverContent>
      </Popover>
    </Container>
  );
};

export default MCPShareButton;
