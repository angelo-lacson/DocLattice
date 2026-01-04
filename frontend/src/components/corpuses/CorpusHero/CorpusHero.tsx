import React from "react";
import styled from "styled-components";
import {
  ChevronRight,
  Users,
  Calendar,
  Hash,
  Globe,
  Shield,
  MoreVertical,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { InlineChatBar } from "./InlineChatBar";
import {
  HeroContainer,
  Breadcrumbs,
  HeroTitleRow,
  TitleSection,
  HeroTitle,
  MetadataRow,
  MetadataItem,
  MetadataSeparator,
  AccessBadge,
} from "./styles";

// Mobile menu button (kebab) - only visible on mobile, positioned inline with title
const MobileMenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  margin-right: 6px;

  &:hover {
    background: #f0fdfa;
    color: #0f766e;
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: 768px) {
    display: flex;
  }
`;

// Wrapper to keep title and mobile menu button inline
const TitleWithMenu = styled.div`
  display: flex;
  align-items: center;
`;

/** Minimal corpus data required for CorpusHero */
export interface CorpusHeroData {
  id: string;
  title?: string;
  isPublic?: boolean;
  created?: string | null;
  creator?: {
    email?: string | null;
  } | null;
  labelSet?: {
    title?: string;
  } | null;
}

export interface CorpusHeroProps {
  /** The corpus object (only requires minimal fields) */
  corpus: CorpusHeroData;
  /** Current chat query value */
  chatQuery: string;
  /** Callback when chat query changes */
  onChatQueryChange: (value: string) => void;
  /** Callback when chat is submitted */
  onChatSubmit: (query: string) => void;
  /** Callback to view chat history */
  onViewChatHistory: () => void;
  /** Callback to navigate back to corpus list */
  onNavigateToCorpuses?: () => void;
  /** Callback to open mobile sidebar menu */
  onOpenMobileMenu?: () => void;
  /** Whether to auto-focus the chat input */
  autoFocusChat?: boolean;
  /** Whether to show quick action chips */
  showQuickActions?: boolean;
  /** Test ID for the component */
  testId?: string;
}

/**
 * CorpusHero - Hero section for the corpus detail page
 *
 * Features:
 * - Breadcrumb navigation (Corpuses / {corpus name})
 * - Large serif title with teal "Corpus" accent
 * - Corpus metadata (creator, date, label set)
 * - Public/Private access badge
 * - Integrated InlineChatBar for querying
 */
export const CorpusHero: React.FC<CorpusHeroProps> = ({
  corpus,
  chatQuery,
  onChatQueryChange,
  onChatSubmit,
  onViewChatHistory,
  onNavigateToCorpuses,
  onOpenMobileMenu,
  autoFocusChat = false,
  showQuickActions = true,
  testId = "corpus-hero",
}) => {
  const creatorName = corpus.creator?.email?.split("@")[0] || "Unknown";
  const createdDate = corpus.created
    ? formatDistanceToNow(new Date(corpus.created), { addSuffix: true })
    : "recently";

  return (
    <HeroContainer data-testid={testId}>
      <Breadcrumbs
        aria-label="Breadcrumb navigation"
        data-testid={`${testId}-breadcrumbs`}
      >
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onNavigateToCorpuses?.();
          }}
        >
          Corpuses
        </a>
        <ChevronRight aria-hidden="true" />
        <span className="current">{corpus.title || "Untitled Corpus"}</span>
      </Breadcrumbs>

      <HeroTitleRow>
        <TitleSection>
          <TitleWithMenu>
            {/* Mobile menu button - only visible on mobile, inline with title */}
            {onOpenMobileMenu && (
              <MobileMenuButton
                onClick={onOpenMobileMenu}
                aria-label="Open navigation menu"
                data-testid={`${testId}-mobile-menu`}
              >
                <MoreVertical />
              </MobileMenuButton>
            )}
            <HeroTitle data-testid={`${testId}-title`}>
              <span className="accent">Corpus</span>{" "}
              {corpus.title || "Untitled"}
            </HeroTitle>
          </TitleWithMenu>

          <MetadataRow data-testid={`${testId}-metadata`}>
            <AccessBadge $isPublic={corpus.isPublic}>
              {corpus.isPublic ? (
                <>
                  <Globe aria-hidden="true" />
                  Public
                </>
              ) : (
                <>
                  <Shield aria-hidden="true" />
                  Private
                </>
              )}
            </AccessBadge>

            <MetadataSeparator />

            <MetadataItem>
              <Users aria-hidden="true" />
              <span>{creatorName}</span>
            </MetadataItem>

            <MetadataSeparator />

            <MetadataItem>
              <Calendar aria-hidden="true" />
              <span>{createdDate}</span>
            </MetadataItem>

            {corpus.labelSet && (
              <>
                <MetadataSeparator />
                <MetadataItem>
                  <Hash aria-hidden="true" />
                  <span>{corpus.labelSet.title}</span>
                </MetadataItem>
              </>
            )}
          </MetadataRow>
        </TitleSection>
      </HeroTitleRow>

      <InlineChatBar
        value={chatQuery}
        onChange={onChatQueryChange}
        onSubmit={onChatSubmit}
        onViewHistory={onViewChatHistory}
        autoFocus={autoFocusChat}
        showQuickActions={showQuickActions}
        testId={`${testId}-chat`}
      />
    </HeroContainer>
  );
};
