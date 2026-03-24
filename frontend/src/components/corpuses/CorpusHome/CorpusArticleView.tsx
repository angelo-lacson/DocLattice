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

import {
  GET_CORPUS_ARTICLE,
  GetCorpusArticleInput,
  GetCorpusArticleOutput,
} from "../../../graphql/queries";
import { CorpusType } from "../../../types/graphql-api";
import { parseCaml, CamlArticle } from "../../../caml";
import type { CamlDocument } from "../../../caml";
import { CAML_ARTICLE_FILENAME } from "../../../assets/configurations/constants";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const ArticleViewContainer = styled.div`
  width: 100%;
  min-height: 100vh;
  background: #ffffff;
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
  border-bottom: 1px solid #e2e8f0;
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
`;

const ToolbarTitle = styled.span`
  font-size: 0.8125rem;
  color: #94a3b8;
  font-weight: 500;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
  color: #64748b;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
  color: #64748b;
  text-align: center;
  padding: 2rem;
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
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

  // Map corpus stats to the format CamlArticle expects
  const articleStats = useMemo(
    () =>
      stats
        ? {
            annotations: stats.annotations,
            documents: stats.documents,
            contributors: stats.contributors,
            threads: stats.threads,
          }
        : undefined,
    [stats]
  );

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
          <p style={{ fontSize: "0.8125rem", color: "#94a3b8" }}>
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

      <CamlArticle document={parsedDocument} stats={articleStats} />
    </ArticleViewContainer>
  );
};
