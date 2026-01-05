import React, { useState, useEffect, useMemo } from "react";
import styled from "styled-components";
import { useQuery } from "@apollo/client";

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
  const [mdContent, setMdContent] = useState<string | null>(null);

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
            <CorpusAbout
              corpus={fullCorpus}
              mdContent={mdContent}
              isLoading={corpusLoading}
              canEdit={canEdit}
              onEditDescription={onEditDescription}
              testId="corpus-home-description-card"
            />
            {/* Table of Contents based on document parent relationships */}
            <DocumentTableOfContents corpusId={corpus.id} maxDepth={4} />
          </ContentWrapper>
        </StretchWrapper>
      </MainContent>
    </Container>
  );
};
