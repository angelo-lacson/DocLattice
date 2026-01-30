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
  ChatSection,
  ViewDetailsButton,
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

  // Get document count from original corpus prop (which has documents field)
  const docCount = corpus.documents?.totalCount;

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
          {/* Centered breadcrumbs */}
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
      </LandingContent>
    </LandingContainer>
  );
};
