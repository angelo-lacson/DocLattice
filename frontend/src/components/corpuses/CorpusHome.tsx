import React, { useEffect, useMemo } from "react";
import styled from "styled-components";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ListTree,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react";
import {
  corpusHomeView,
  CorpusHomeViewType,
  tocExpandAll,
} from "../../graphql/cache";
import {
  updateHomeViewParam,
  updateTocExpandedParam,
} from "../../utils/navigationUtils";

import {
  GET_CORPUS_WITH_HISTORY,
  GetCorpusWithHistoryQuery,
  GetCorpusWithHistoryQueryVariables,
} from "../../graphql/queries";
import { CorpusType } from "../../types/graphql-api";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";
import { CorpusAbout } from "./CorpusAbout";
import { CorpusHero } from "./CorpusHero";
import { DocumentTableOfContents } from "./DocumentTableOfContents";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_SPACING,
} from "../../assets/configurations/osLegalStyles";

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
  height: 100%;
  max-height: 100%;
  min-height: 0;
`;

const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 0.25rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;

  @media (max-width: 768px) {
    padding: clamp(0.5rem, 1.5vh, 0.75rem) clamp(0.5rem, 2vw, 0.75rem);
  }
`;

const StretchWrapper = styled.div`
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: stretch;
  width: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
`;

const ContentWrapper = styled.div`
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
`;

const TabContainer = styled.div`
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
  box-shadow: ${OS_LEGAL_SPACING.shadowCard};
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
`;

const TabHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard}
    ${OS_LEGAL_SPACING.borderRadiusCard} 0 0;
`;

const TabList = styled.div`
  display: flex;
`;

const TabActions = styled.div`
  display: flex;
  align-items: center;
  padding-right: 16px;
`;

const ExpandToggleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 6px;
  background: ${OS_LEGAL_COLORS.surface};
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.accent};
    color: ${OS_LEGAL_COLORS.accent};
  }

  &:focus-visible {
    outline: 2px solid ${OS_LEGAL_COLORS.accent};
    outline-offset: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 28px;
  border: none;
  background: ${(props) =>
    props.$active ? OS_LEGAL_COLORS.surface : "transparent"};
  color: ${(props) =>
    props.$active ? OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.textSecondary};
  font-size: 1rem;
  font-weight: ${(props) => (props.$active ? "600" : "500")};
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;

  ${(props) =>
    props.$active &&
    `
    &::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 3px;
      background: ${OS_LEGAL_COLORS.accent};
    }
  `}

  &:hover {
    color: ${(props) =>
      props.$active ? OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.textPrimary};
    background: ${(props) =>
      props.$active ? OS_LEGAL_COLORS.surface : "rgba(0,0,0,0.02)"};
  }

  &:focus-visible {
    outline: 2px solid ${OS_LEGAL_COLORS.accent};
    outline-offset: -2px;
  }

  svg {
    opacity: ${(props) => (props.$active ? 1 : 0.7)};
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }
  &::-webkit-scrollbar-thumb {
    background: ${OS_LEGAL_COLORS.border};
    border-radius: 4px;
    &:hover {
      background: ${OS_LEGAL_COLORS.borderHover};
    }
  }
`;

interface CorpusHomeProps {
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
  const [mdContent, setMdContent] = React.useState<string | null>(null);

  // Get active tab from URL-driven reactive var (default to "about")
  const homeViewFromUrl = useReactiveVar(corpusHomeView);
  const activeTab: CorpusHomeViewType = homeViewFromUrl ?? "about";

  // Get TOC expand state from URL-driven reactive var
  const isTocExpanded = useReactiveVar(tocExpandAll);

  // Update tab via URL (CentralRouteManager Phase 2 will set the reactive var)
  const setActiveTab = (tab: CorpusHomeViewType) => {
    updateHomeViewParam(location, navigate, tab);
  };

  // Toggle TOC expand state via URL
  const handleToggleExpandAll = () => {
    updateTocExpandedParam(location, navigate, !isTocExpanded);
  };

  // CRITICAL: Memoize variables object to prevent Apollo refetch on every render
  // Parent passes new corpus object reference on every render (reactive var issue)
  // Apollo refetches queries when variables object changes, so we must stabilize it
  // Note: corpus.id is already a primitive, so we only need to memoize the object
  const historyVariables = useMemo(() => ({ id: corpus.id }), [corpus.id]);

  // Fetch corpus with description history
  const { data: corpusData, loading: corpusLoading } = useQuery<
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

  // Use the fetched corpus data instead of the prop
  const fullCorpus = corpusData?.corpus || corpus;

  const canEdit = getPermissions(fullCorpus.myPermissions || []).includes(
    PermissionTypes.CAN_UPDATE
  );

  return (
    <Container id="corpus-home-container">
      <CorpusHero
        corpus={fullCorpus}
        chatQuery={chatQuery}
        onChatQueryChange={onChatQueryChange || (() => {})}
        onChatSubmit={onChatSubmit || (() => {})}
        onViewChatHistory={onViewChatHistory || (() => {})}
        onNavigateToCorpuses={onNavigateToCorpuses}
        onOpenMobileMenu={onOpenMobileMenu}
        autoFocusChat={true}
        showQuickActions={true}
        testId="corpus-home-hero"
      />

      <MainContent id="corpus-home-main-content">
        <StretchWrapper>
          <ContentWrapper id="corpus-home-content">
            <TabContainer>
              <TabHeader>
                <TabList role="tablist" aria-label="Corpus information tabs">
                  <Tab
                    role="tab"
                    $active={activeTab === "about"}
                    onClick={() => setActiveTab("about")}
                    aria-selected={activeTab === "about"}
                    aria-controls="about-panel"
                    id="about-tab"
                  >
                    <BookOpen size={20} />
                    About
                  </Tab>
                  <Tab
                    role="tab"
                    $active={activeTab === "toc"}
                    onClick={() => setActiveTab("toc")}
                    aria-selected={activeTab === "toc"}
                    aria-controls="toc-panel"
                    id="toc-tab"
                  >
                    <ListTree size={20} />
                    Table of Contents
                  </Tab>
                </TabList>
                {activeTab === "toc" && (
                  <TabActions>
                    <ExpandToggleButton
                      onClick={handleToggleExpandAll}
                      aria-label={isTocExpanded ? "Collapse all" : "Expand all"}
                    >
                      {isTocExpanded ? (
                        <>
                          <ChevronsDownUp size={16} />
                          Collapse All
                        </>
                      ) : (
                        <>
                          <ChevronsUpDown size={16} />
                          Expand All
                        </>
                      )}
                    </ExpandToggleButton>
                  </TabActions>
                )}
              </TabHeader>
              <TabContent
                role="tabpanel"
                id={activeTab === "about" ? "about-panel" : "toc-panel"}
                aria-labelledby={
                  activeTab === "about" ? "about-tab" : "toc-tab"
                }
              >
                {activeTab === "about" ? (
                  <CorpusAbout
                    corpus={fullCorpus}
                    mdContent={mdContent}
                    isLoading={corpusLoading}
                    canEdit={canEdit}
                    onEditDescription={onEditDescription}
                    testId="corpus-home-description-card"
                  />
                ) : (
                  <DocumentTableOfContents
                    corpusId={corpus.id}
                    maxDepth={4}
                    embedded={true}
                  />
                )}
              </TabContent>
            </TabContainer>
          </ContentWrapper>
        </StretchWrapper>
      </MainContent>
    </Container>
  );
};
