/**
 * CorpusArticleView — Renders a CAML article stored as Readme.CAML
 * in the corpus documents.
 *
 * Fetches the Readme.CAML document, parses its content, and renders
 * the full scrollytelling article experience.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { ArrowLeft, FileText, Edit } from "lucide-react";
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
`;

const ArticleToolbar = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 6px;
  background: ${OS_LEGAL_COLORS.surface};
  color: ${OS_LEGAL_COLORS.textTertiary};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.borderHover};
  }
`;

const ToolbarTitle = styled.span`
  font-size: 0.8125rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  font-weight: 500;
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
          <BackButton onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </BackButton>
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
          <BackButton onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </BackButton>
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
          <BackButton onClick={onBack}>
            <ArrowLeft size={14} />
            Back
          </BackButton>
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
        <BackButton onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </BackButton>
        <ToolbarTitle>{corpus.title}</ToolbarTitle>
        {onEditArticle && (
          <BackButton onClick={onEditArticle} style={{ marginLeft: "auto" }}>
            <Edit size={14} />
            Edit
          </BackButton>
        )}
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
