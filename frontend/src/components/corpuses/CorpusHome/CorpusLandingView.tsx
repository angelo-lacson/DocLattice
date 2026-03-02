import React, { useEffect, useMemo } from "react";
import { useQuery } from "@apollo/client";
import {
  ChevronRight,
  Users,
  Calendar,
  Globe,
  Shield,
  FileText,
  ArrowRight,
  Plus,
  MoreVertical,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  GET_CORPUS_WITH_HISTORY,
  GetCorpusWithHistoryQuery,
  GetCorpusWithHistoryQueryVariables,
} from "../../../graphql/queries";
import { CorpusType } from "../../../types/graphql-api";
import { PermissionTypes } from "../../types";
import { getPermissions } from "../../../utils/transform";
import { InlineChatBar } from "../CorpusHero/InlineChatBar";
import { MCPShareButton } from "../../common/MCPShareButton";
import { RecentDiscussions } from "./RecentDiscussions";

import {
  LandingContainer,
  LandingContent,
  LandingHero,
  CenteredBreadcrumbs,
  CorpusBadge,
  LandingTitle,
  LandingDescription,
  NoDescriptionContainer,
  NoDescriptionText,
  AddDescriptionLink,
  CenteredMetadataRow,
  MetadataItem,
  MetadataSeparator,
  AccessBadge,
  PowerUserMetaButton,
  ChatSection,
  ViewDetailsButton,
  HeaderRow,
  MobileMenuButton,
} from "./styles";

export interface CorpusLandingViewProps {
  /** The corpus object */
  corpus: CorpusType;
  /** Callback when "View Details" is clicked */
  onViewDetails: () => void;
  /** Callback when edit description is clicked */
  onEditDescription: () => void;
  /** Callback to navigate back to corpus list */
  onNavigateToCorpuses?: () => void;
  /** Chat integration props */
  chatQuery?: string;
  onChatQueryChange?: (value: string) => void;
  onChatSubmit?: (query: string) => void;
  onViewChatHistory?: () => void;
  /** Callback to open mobile navigation menu */
  onOpenMobileMenu?: () => void;
  /** Callback when "View All Discussions" is clicked */
  onViewDiscussions?: () => void;
  /** Callback when a specific thread is clicked from the feed */
  onThreadClick?: (threadId: string) => void;
  /** Callback when mode toggle is clicked (only shown when present) */
  onModeToggle?: () => void;
  /**
   * Whether the view is rendered from the power-user sidebar's home tab
   * (true) vs the clean/focus landing mode (false). Controls the toggle
   * button label ("Focus Mode" vs "Power User").
   */
  isPowerUserMode?: boolean;
  /** Test ID for the component */
  testId?: string;
}

/**
 * CorpusLandingView - Centered landing page for corpus
 *
 * Features:
 * - Centered layout with max-width constraint
 * - CORPUS badge above title
 * - Large serif title
 * - Description as subtitle (or "no description" with add action)
 * - Metadata row (access badge, creator, date, doc count)
 * - InlineChatBar for querying
 * - "View Details" button to switch to details view
 */
export const CorpusLandingView: React.FC<CorpusLandingViewProps> = ({
  corpus,
  onViewDetails,
  onEditDescription,
  onNavigateToCorpuses,
  chatQuery = "",
  onChatQueryChange,
  onChatSubmit,
  onViewChatHistory,
  onOpenMobileMenu,
  onViewDiscussions,
  onThreadClick,
  onModeToggle,
  isPowerUserMode = false,
  testId = "corpus-landing",
}) => {
  const [mdContent, setMdContent] = React.useState<string | null>(null);

  // CRITICAL: Memoize variables object to prevent Apollo refetch on every render
  const historyVariables = useMemo(() => ({ id: corpus.id }), [corpus.id]);

  // Fetch corpus with description history
  const { data: corpusData } = useQuery<
    GetCorpusWithHistoryQuery,
    GetCorpusWithHistoryQueryVariables
  >(GET_CORPUS_WITH_HISTORY, {
    variables: historyVariables,
  });

  // Fetch markdown content from URL
  useEffect(() => {
    if (corpusData?.corpus?.mdDescription) {
      fetch(corpusData.corpus.mdDescription)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.text();
        })
        .then((text) => setMdContent(text))
        .catch((err) => {
          console.error("Error fetching corpus description:", err);
          setMdContent(null);
        });
    }
  }, [corpusData]);

  // Use the fetched corpus data instead of the prop for description/history
  const fullCorpus = corpusData?.corpus || corpus;

  const canEdit = getPermissions(fullCorpus.myPermissions || []).includes(
    PermissionTypes.CAN_UPDATE
  );

  const creatorName = fullCorpus.creator?.email?.split("@")[0] || "Unknown";
  const createdDate = fullCorpus.created
    ? formatDistanceToNow(new Date(fullCorpus.created), { addSuffix: true })
    : "recently";

  // Get document count from corpus prop
  const docCount = corpus.documentCount;

  // Get plain text description - prefer markdown content, fallback to plain description
  // For hero subtitle, we use plain text only (no markdown rendering)
  const descriptionText = mdContent
    ? mdContent.split("\n")[0].slice(0, 200) // First line, max 200 chars
    : fullCorpus.description;

  const hasDescription = Boolean(descriptionText);

  return (
    <LandingContainer data-testid={testId}>
      <LandingContent>
        <LandingHero>
          {/* Centered breadcrumbs with mobile menu button as sibling */}
          <HeaderRow $justify="center">
            <CenteredBreadcrumbs
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
              <span className="current">
                {fullCorpus.title || "Untitled Corpus"}
              </span>
            </CenteredBreadcrumbs>
            {onOpenMobileMenu && (
              <MobileMenuButton
                onClick={onOpenMobileMenu}
                aria-label="Open navigation menu"
                data-testid={`${testId}-mobile-menu`}
              >
                <MoreVertical />
              </MobileMenuButton>
            )}
          </HeaderRow>

          {/* Corpus badge */}
          <CorpusBadge>CORPUS</CorpusBadge>

          {/* Large title */}
          <LandingTitle data-testid={`${testId}-title`}>
            {fullCorpus.title || "Untitled Corpus"}
          </LandingTitle>

          {/* Description as subtitle or "no description" with action */}
          {hasDescription ? (
            <LandingDescription data-testid={`${testId}-description`}>
              {descriptionText}
            </LandingDescription>
          ) : (
            <NoDescriptionContainer data-testid={`${testId}-no-description`}>
              <NoDescriptionText>No description yet.</NoDescriptionText>
              {canEdit && (
                <AddDescriptionLink
                  onClick={onEditDescription}
                  data-testid={`${testId}-add-description-btn`}
                >
                  <Plus size={14} />
                  Add one now
                </AddDescriptionLink>
              )}
            </NoDescriptionContainer>
          )}

          {/* Metadata row */}
          <CenteredMetadataRow data-testid={`${testId}-metadata`}>
            <AccessBadge $isPublic={fullCorpus.isPublic}>
              {fullCorpus.isPublic ? (
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

            {/* MCP Share button - only shown for public corpuses */}
            {fullCorpus.isPublic && fullCorpus.slug && (
              <>
                <MetadataSeparator />
                <MCPShareButton
                  corpusSlug={fullCorpus.slug}
                  size="sm"
                  testId={`${testId}-mcp-share`}
                />
              </>
            )}

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

            {docCount != null && docCount > 0 && (
              <>
                <MetadataSeparator />
                <MetadataItem>
                  <FileText aria-hidden="true" />
                  <span>
                    {docCount} {docCount === 1 ? "document" : "documents"}
                  </span>
                </MetadataItem>
              </>
            )}

            {onModeToggle && (
              <>
                <MetadataSeparator />
                <PowerUserMetaButton
                  onClick={onModeToggle}
                  title={
                    isPowerUserMode
                      ? "Switch to focused view"
                      : "Switch to full corpus management view"
                  }
                  data-testid="power-user-toggle"
                >
                  <Zap aria-hidden="true" />
                  {isPowerUserMode ? "Focus Mode" : "Power User"}
                </PowerUserMetaButton>
              </>
            )}
          </CenteredMetadataRow>
        </LandingHero>

        {/* Chat section */}
        <ChatSection>
          <InlineChatBar
            value={chatQuery}
            onChange={onChatQueryChange || (() => {})}
            onSubmit={onChatSubmit || (() => {})}
            onViewHistory={onViewChatHistory || (() => {})}
            autoFocus={true}
            showQuickActions={true}
            testId={`${testId}-chat`}
          />
        </ChatSection>

        {/* View Details button */}
        <ViewDetailsButton
          onClick={onViewDetails}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          data-testid={`${testId}-view-details-btn`}
        >
          View Details
          <ArrowRight />
        </ViewDetailsButton>

        {/* Recent discussions feed */}
        <RecentDiscussions
          corpusId={corpus.id}
          onThreadClick={onThreadClick}
          onViewAll={onViewDiscussions}
          testId={`${testId}-discussions`}
        />
      </LandingContent>
    </LandingContainer>
  );
};
