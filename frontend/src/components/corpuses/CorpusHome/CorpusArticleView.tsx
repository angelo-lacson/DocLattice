/**
 * CorpusArticleView — Renders a CAML article stored as Readme.CAML
 * in the corpus documents.
 *
 * Fetches the Readme.CAML document, parses its content, and renders
 * the full scrollytelling article experience.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { ArrowLeft, FileText, Edit, Info } from "lucide-react";
import styled from "styled-components";

import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

import {
  GET_CORPUS_ARTICLE,
  GetCorpusArticleInput,
  GetCorpusArticleOutput,
} from "../../../graphql/queries";
import { CorpusType } from "../../../types/graphql-api";
import { parseCaml } from "@os-legal/caml";
import type { CamlDocument } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";
import { MarkdownMessageRenderer } from "../../threads/MarkdownMessageRenderer";
import { CAML_ARTICLE_FILENAME } from "../../../assets/configurations/constants";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const ArticleViewContainer = styled.div`
  width: 100%;
  min-height: 100vh;
  background: ${OS_LEGAL_COLORS.surface};
  overflow-x: hidden;
`;

const ArticleToolbar = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
`;

const ToolbarButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: #64748b;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    transition: transform 0.2s ease;
  }

  &:hover {
    background: #f1f5f9;
    color: #334155;
  }

  &:active {
    transform: scale(0.97);
  }
`;

const BackButtonStyled = styled(ToolbarButton)`
  &:hover svg {
    transform: translateX(-2px);
  }
`;

const EditButtonStyled = styled(ToolbarButton)`
  color: #0f766e;

  &:hover {
    background: #f0fdfa;
    color: #115e59;
  }
`;

const ToolbarTitle = styled.span`
  font-size: 0.8125rem;
  color: #94a3b8;
  font-weight: 400;
  letter-spacing: 0.01em;
`;

const ToolbarNav = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  text-align: center;
  padding: 2rem;
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${OS_LEGAL_COLORS.textMuted};
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface CorpusArticleViewProps {
  corpus: CorpusType;
  onBack: () => void;
  onEditArticle?: () => void;
  onViewDetails?: () => void;
  onViewDocuments?: () => void;
  stats?: {
    annotations?: number;
    documents?: number;
    contributors?: number;
    threads?: number;
  };
  testId?: string;
}

export const CorpusArticleView: React.FC<CorpusArticleViewProps> = ({
  corpus,
  onBack,
  onEditArticle,
  onViewDetails,
  onViewDocuments,
  stats,
  testId = "corpus-article",
}) => {
  const [camlContent, setCamlContent] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Query for Readme.CAML document in this corpus
  const queryVars = useMemo<GetCorpusArticleInput>(
    () => ({
      corpusId: corpus.id,
      title: CAML_ARTICLE_FILENAME,
    }),
    [corpus.id]
  );

  const { data, loading } = useQuery<
    GetCorpusArticleOutput,
    GetCorpusArticleInput
  >(GET_CORPUS_ARTICLE, {
    variables: queryVars,
  });

  const articleDoc = data?.documents?.edges?.[0]?.node;

  // Fetch the CAML content from the txtExtractFile URL
  useEffect(() => {
    if (!articleDoc?.txtExtractFile) {
      setCamlContent(null);
      return;
    }

    fetch(articleDoc.txtExtractFile)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setCamlContent(text);
        setFetchError(null);
      })
      .catch((err) => {
        console.error("Failed to fetch CAML content:", err);
        setFetchError(err.message);
        setCamlContent(null);
      });
  }, [articleDoc?.txtExtractFile]);

  // Parse CAML content
  const parsedDocument: CamlDocument | null = useMemo(() => {
    if (!camlContent) return null;
    try {
      return parseCaml(camlContent);
    } catch (err) {
      console.error("Failed to parse CAML:", err);
      return null;
    }
  }, [camlContent]);

  if (loading) {
    return (
      <ArticleViewContainer data-testid={testId}>
        <ArticleToolbar>
          <BackButtonStyled onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </BackButtonStyled>
        </ArticleToolbar>
        <LoadingContainer>
          <p>Loading article...</p>
        </LoadingContainer>
      </ArticleViewContainer>
    );
  }

  if (!articleDoc || fetchError) {
    return (
      <ArticleViewContainer data-testid={testId}>
        <ArticleToolbar>
          <BackButtonStyled onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </BackButtonStyled>
        </ArticleToolbar>
        <EmptyState>
          <EmptyIcon>
            <FileText size={28} />
          </EmptyIcon>
          <p>No article found for this corpus.</p>
          <p
            style={{ fontSize: "0.8125rem", color: OS_LEGAL_COLORS.textMuted }}
          >
            Upload a <code>Readme.CAML</code> document to create one.
          </p>
        </EmptyState>
      </ArticleViewContainer>
    );
  }

  if (!parsedDocument) {
    return (
      <ArticleViewContainer data-testid={testId}>
        <ArticleToolbar>
          <BackButtonStyled onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </BackButtonStyled>
        </ArticleToolbar>
        <LoadingContainer>
          <p>Parsing article...</p>
        </LoadingContainer>
      </ArticleViewContainer>
    );
  }

  return (
    <ArticleViewContainer data-testid={testId}>
      <ArticleToolbar>
        <BackButtonStyled onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </BackButtonStyled>
        <ToolbarTitle>{corpus.title}</ToolbarTitle>
        <ToolbarNav>
          {onViewDocuments && (
            <ToolbarButton onClick={onViewDocuments}>
              <FileText size={14} />
              Documents
            </ToolbarButton>
          )}
          {onViewDetails && (
            <ToolbarButton onClick={onViewDetails}>
              <Info size={14} />
              About
            </ToolbarButton>
          )}
          {onEditArticle && (
            <EditButtonStyled onClick={onEditArticle}>
              <Edit size={14} />
              Edit
            </EditButtonStyled>
          )}
        </ToolbarNav>
      </ArticleToolbar>

      <CamlThemeProvider>
        <CamlArticle
          document={parsedDocument}
          stats={stats}
          renderMarkdown={(md) => <MarkdownMessageRenderer content={md} />}
        />
      </CamlThemeProvider>
    </ArticleViewContainer>
  );
};
