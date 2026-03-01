import React from "react";
import { useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";

import { corpusDetailView } from "../../graphql/cache";
import {
  updateDetailViewParam,
  navigateToDiscussionThread,
} from "../../utils/navigationUtils";
import { CorpusType } from "../../types/graphql-api";
import { CorpusLandingView } from "./CorpusHome/CorpusLandingView";
import { CorpusDetailsView } from "./CorpusHome/CorpusDetailsView";
import { CorpusDiscussionsInlineView } from "./CorpusHome/CorpusDiscussionsInlineView";

export interface CorpusHomeProps {
  corpus: CorpusType;
  onEditDescription: () => void;
  onNavigate?: (tabIndex: number) => void;
  onBack?: () => void;
  canUpdate?: boolean;
  stats: {
    totalDocs: number;
    totalAnnotations: number;
    totalAnalyses: number;
    totalExtracts: number;
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
 */
export const CorpusHome: React.FC<CorpusHomeProps> = ({
  corpus,
  onEditDescription,
  chatQuery = "",
  onChatQueryChange,
  onChatSubmit,
  onViewChatHistory,
  onNavigateToCorpuses,
  onOpenMobileMenu,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get current view from URL-driven reactive var (set by CentralRouteManager)
  const currentView = useReactiveVar(corpusDetailView);

  // Handle switching to details view
  const handleViewDetails = () => {
    updateDetailViewParam(location, navigate, "details");
  };

  // Handle switching back to landing view (also clears thread param to prevent stale state)
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
        onOpenMobileMenu={onOpenMobileMenu}
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
      onViewDiscussions={handleViewDiscussions}
      onThreadClick={handleThreadClick}
      testId="corpus-home-landing"
    />
  );
};
