import React from "react";
import { useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";

import { corpusDetailView } from "../../graphql/cache";
import { updateDetailViewParam } from "../../utils/navigationUtils";
import { CorpusType } from "../../types/graphql-api";
import { CorpusLandingView } from "./CorpusHome/CorpusLandingView";
import { CorpusDetailsView } from "./CorpusHome/CorpusDetailsView";

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
 * CorpusHome - Orchestrator component that switches between landing and details views
 *
 * Views:
 * - Landing: Centered layout with description and "View Details" button
 * - Details: Two-column layout (desktop) or tabbed (mobile) with TOC and About
 *
 * URL State:
 * - /c/user/corpus → Landing view (default)
 * - /c/user/corpus?view=details → Details view
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

  // Handle switching back to landing view
  const handleBackToLanding = () => {
    updateDetailViewParam(location, navigate, "landing");
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
      testId="corpus-home-landing"
    />
  );
};
