import React, { useMemo } from "react";
import { useReactiveVar, useQuery } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Zap } from "lucide-react";

import { corpusDetailView } from "../../graphql/cache";
import {
  updateDetailViewParam,
  navigateToDiscussionThread,
} from "../../utils/navigationUtils";
import { CorpusType } from "../../types/graphql-api";
import {
  GET_CORPUS_ARTICLE,
  GetCorpusArticleInput,
  GetCorpusArticleOutput,
} from "../../graphql/queries";
import { CAML_ARTICLE_FILENAME } from "../../assets/configurations/constants";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";
import { CorpusLandingView } from "./CorpusHome/CorpusLandingView";
import { CorpusDetailsView } from "./CorpusHome/CorpusDetailsView";
import { CorpusDiscussionsInlineView } from "./CorpusHome/CorpusDiscussionsInlineView";
import { CorpusArticleView } from "./CorpusHome/CorpusArticleView";
import { InlineChatBar } from "./CorpusHero/InlineChatBar";
import { PillToggle, PillToggleLabel } from "./CorpusHome/styles";

/** Floating pill bar overlaid on the article landing view */
const FloatingControls = styled.div`
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  max-width: 600px;
  width: calc(100% - 3rem);
`;

export interface CorpusHomeProps {
  corpus: CorpusType;
  onEditDescription: () => void;
  onEditArticle?: () => void;
  onNavigate?: (tabIndex: number) => void;
  onBack?: () => void;
  canUpdate?: boolean;
  stats: {
    totalDocs: number;
    totalAnnotations: number;
    totalAnalyses: number;
    totalExtracts: number;
    totalThreads: number;
  };
  statsLoading: boolean;
  // Chat integration props
  chatQuery?: string;
  onChatQueryChange?: (value: string) => void;
  onChatSubmit?: (query: string) => void;
  onViewChatHistory?: () => void;
  onNavigateToCorpuses?: () => void;
  // Mobile navigation
  onOpenMobileMenu?: () => void;
  // Mode toggle
  onModeToggle?: () => void;
  isPowerUserMode?: boolean;
}

/**
 * CorpusHome - Orchestrator component that switches between landing, details, and discussions views
 *
 * Views:
 * - Landing: Centered layout with description, chat, discussion feed, and "View Details" button
 * - Details: Two-column layout (desktop) or tabbed (mobile) with TOC and About
 * - Discussions: Inline thread list and detail view
 *
 * URL State:
 * - /c/user/corpus → Landing view (default)
 * - /c/user/corpus?view=details → Details view
 * - /c/user/corpus?view=discussions → Discussions view
 * - /c/user/corpus?view=article → Article view (Readme.CAML)
 */
export const CorpusHome: React.FC<CorpusHomeProps> = ({
  corpus,
  onEditDescription,
  onEditArticle,
  stats,
  chatQuery = "",
  onChatQueryChange,
  onChatSubmit,
  onViewChatHistory,
  onNavigateToCorpuses,
  onOpenMobileMenu,
  onModeToggle,
  isPowerUserMode,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get current view from URL-driven reactive var (set by CentralRouteManager)
  const currentView = useReactiveVar(corpusDetailView);

  // Detect whether the corpus has a Readme.CAML article.
  // When it does and we're on the default landing view, the article becomes
  // the home page with floating controls overlaid.
  const articleQueryVars = useMemo<GetCorpusArticleInput>(
    () => ({
      corpusId: corpus.id,
      title: CAML_ARTICLE_FILENAME,
    }),
    [corpus.id]
  );

  const { data: articleData } = useQuery<
    GetCorpusArticleOutput,
    GetCorpusArticleInput
  >(GET_CORPUS_ARTICLE, { variables: articleQueryVars });

  const hasArticle =
    (articleData?.documents?.edges?.length ?? 0) > 0 &&
    !!articleData?.documents?.edges[0]?.node?.txtExtractFile;

  // Handle switching to details view
  const handleViewDetails = () => {
    updateDetailViewParam(location, navigate, "details");
  };

  // Handle switching back to landing view (also clears thread param to prevent stale state).
  // Clears both 'view' and 'thread' params in a single navigation.
  // Cannot use updateDetailViewParam() here because it only handles one param.
  const handleBackToLanding = () => {
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("view");
    searchParams.delete("thread");
    navigate({ search: searchParams.toString() });
  };

  // Handle switching to discussions view
  const handleViewDiscussions = () => {
    updateDetailViewParam(location, navigate, "discussions");
  };

  // Handle switching to article view
  const handleViewArticle = () => {
    updateDetailViewParam(location, navigate, "article");
  };

  // Handle clicking a specific thread from the landing page feed
  const handleThreadClick = (threadId: string) => {
    navigateToDiscussionThread(location, navigate, threadId);
  };

  // Render the appropriate view
  if (currentView === "details") {
    return (
      <CorpusDetailsView
        corpus={corpus}
        onBack={handleBackToLanding}
        onEditDescription={onEditDescription}
        onOpenMobileMenu={isPowerUserMode ? onOpenMobileMenu : undefined}
        testId="corpus-home-details"
      />
    );
  }

  if (currentView === "discussions") {
    return (
      <CorpusDiscussionsInlineView
        corpus={corpus}
        onBack={handleBackToLanding}
        testId="corpus-home-discussions"
      />
    );
  }

  if (currentView === "article") {
    return (
      <CorpusArticleView
        corpus={corpus}
        onBack={handleBackToLanding}
        onEditArticle={onEditArticle}
        stats={{
          documents: stats.totalDocs,
          annotations: stats.totalAnnotations,
          threads: stats.totalThreads,
        }}
        testId="corpus-home-article"
      />
    );
  }

  // When a Readme.CAML exists, render the article as the default landing view
  // with floating chat and mode-toggle controls overlaid at the bottom.
  if (hasArticle) {
    return (
      <div style={{ position: "relative" }}>
        <CorpusArticleView
          corpus={corpus}
          onBack={onNavigateToCorpuses || handleBackToLanding}
          onEditArticle={onEditArticle}
          stats={{
            documents: stats.totalDocs,
            annotations: stats.totalAnnotations,
            threads: stats.totalThreads,
          }}
          testId="corpus-home-article"
        />
        <FloatingControls data-testid="corpus-article-floating-controls">
          <div style={{ flex: 1 }}>
            <InlineChatBar
              value={chatQuery}
              onChange={onChatQueryChange || (() => {})}
              onSubmit={onChatSubmit || (() => {})}
              onViewHistory={onViewChatHistory || (() => {})}
              showQuickActions={false}
              autoFocus={false}
              testId="corpus-article-chat"
            />
          </div>
          {onModeToggle && (
            <PillToggle
              onClick={onModeToggle}
              title={
                isPowerUserMode
                  ? "Switch to focused view"
                  : "Switch to full corpus management view"
              }
              data-testid="article-power-user-toggle"
            >
              <PillToggleLabel $active={!isPowerUserMode}>
                Focus
              </PillToggleLabel>
              <PillToggleLabel $active={!!isPowerUserMode}>
                <Zap size={12} />
                Power
              </PillToggleLabel>
            </PillToggle>
          )}
        </FloatingControls>
      </div>
    );
  }

  return (
    <CorpusLandingView
      corpus={corpus}
      onViewDetails={handleViewDetails}
      onEditDescription={onEditDescription}
      onNavigateToCorpuses={onNavigateToCorpuses}
      chatQuery={chatQuery}
      onChatQueryChange={onChatQueryChange}
      onChatSubmit={onChatSubmit}
      onViewChatHistory={onViewChatHistory}
      onOpenMobileMenu={onOpenMobileMenu}
      onModeToggle={onModeToggle}
      isPowerUserMode={isPowerUserMode}
      onViewDiscussions={handleViewDiscussions}
      onViewArticle={handleViewArticle}
      onCreateArticle={onEditArticle}
      onThreadClick={handleThreadClick}
      testId="corpus-home-landing"
    />
  );
};
