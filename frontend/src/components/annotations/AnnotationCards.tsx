import React, { useEffect, useState } from "react";
import { useReactiveVar } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import _ from "lodash";
import styled from "styled-components";
import { getDocumentUrl } from "../../utils/navigationUtils";
import { LoadingOverlay } from "../common/LoadingOverlay";
import { PenLine } from "lucide-react";

import { selectedAnnotationIds } from "../../graphql/cache";
import {
  ServerAnnotationType,
  PageInfo,
  CorpusType,
  DocumentType,
} from "../../types/graphql-api";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { ModernAnnotationCard } from "./ModernAnnotationCard";

// Modern styled components matching standalone Annotations view
const Container = styled.div`
  flex: 1;
  width: 100%;
  overflow-y: auto;
  position: relative;
  padding: 1rem;
  background: #fafafa;
`;

const AnnotationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyStateWrapper = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
`;

const AnnotationIconWrapper = styled.div`
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border-radius: 16px;
  color: #94a3b8;
`;

const EmptyTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin: 24px 0 8px;
`;

const EmptyDescription = styled.p`
  font-size: 14px;
  color: #64748b;
  margin: 0;
  max-width: 300px;
`;

interface AnnotationToNavigateTo {
  selected_annotation: ServerAnnotationType;
  selected_corpus: CorpusType;
  selected_document: DocumentType;
}

interface AnnotationCardProps {
  style?: React.CSSProperties;
  items: ServerAnnotationType[];
  pageInfo: PageInfo | undefined | null;
  loading: boolean;
  loading_message: string;
  fetchMore: (args?: any) => void | any;
}

export const AnnotationCards: React.FC<AnnotationCardProps> = ({
  style,
  items,
  pageInfo,
  loading,
  loading_message,
  fetchMore,
}) => {
  const selected_annotation_ids = useReactiveVar(selectedAnnotationIds); // URL-driven highlighting
  const [targetAnnotation, setTargetAnnotation] =
    useState<AnnotationToNavigateTo>();
  const navigate = useNavigate();

  const handleUpdate = () => {
    if (!loading && pageInfo?.hasNextPage) {
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  useEffect(() => {
    if (targetAnnotation) {
      // CRITICAL: Only update URL - do NOT set reactive vars directly!
      // Flow: URL → CentralRouteManager Phase 2 → reactive vars → component updates

      // Build query params for navigation
      const queryParams: {
        annotationIds: string[];
        analysisIds?: string[];
      } = {
        annotationIds: [targetAnnotation.selected_annotation.id],
      };

      // If annotation has an associated analysis, include it in URL
      if (targetAnnotation.selected_annotation.analysis?.id) {
        queryParams.analysisIds = [
          targetAnnotation.selected_annotation.analysis.id,
        ];
      }

      // Build complete URL with all query params using navigation utility
      const url = getDocumentUrl(
        targetAnnotation.selected_document,
        targetAnnotation.selected_corpus,
        queryParams
      );

      if (url !== "#") {
        navigate(url);
        // CentralRouteManager Phase 2 will:
        // 1. Set selectedAnnotationIds([annotation.id])
        // 2. Set selectedAnalysesIds([analysis.id]) if present
        // Then components will re-render with the selections
      } else {
        console.warn("Cannot navigate - missing slugs:", targetAnnotation);
      }

      setTargetAnnotation(undefined);
    }
  }, [targetAnnotation, navigate]);

  const handleAnnotationClick = (item: ServerAnnotationType) => {
    if (item && item.document && item.corpus) {
      setTargetAnnotation({
        selected_annotation: item,
        selected_corpus: item.corpus,
        selected_document: item.document,
      });
    }
  };

  const uniqueItems = _.uniqBy(items, "id");

  return (
    <Container style={style}>
      <LoadingOverlay active={loading} content={loading_message} />

      <AnnotationsGrid>
        {uniqueItems.length > 0 ? (
          uniqueItems.map((item) => (
            <ModernAnnotationCard
              key={item.id}
              annotation={item}
              onClick={() => handleAnnotationClick(item)}
              isSelected={selected_annotation_ids.includes(item.id)}
            />
          ))
        ) : !loading ? (
          <EmptyStateWrapper>
            <AnnotationIconWrapper>
              <PenLine size={32} />
            </AnnotationIconWrapper>
            <EmptyTitle>No Matching Annotations</EmptyTitle>
            <EmptyDescription>
              Try adjusting your filters or search query to find annotations in
              this corpus.
            </EmptyDescription>
          </EmptyStateWrapper>
        ) : null}
      </AnnotationsGrid>

      <FetchMoreOnVisible fetchNextPage={handleUpdate} />
    </Container>
  );
};
