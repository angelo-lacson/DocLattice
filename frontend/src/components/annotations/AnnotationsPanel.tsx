import React from "react";
import styled from "styled-components";
import _ from "lodash";
import { useReactiveVar } from "@apollo/client";
import { SearchBox, FilterTabs } from "@os-legal/ui";
import type { FilterTabItem } from "@os-legal/ui";
import { Loader2, PenLine, Sparkles } from "lucide-react";

import { selectedAnnotationIds } from "../../graphql/cache";
import { ServerAnnotationType, PageInfo } from "../../types/graphql-api";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { LoadingOverlay } from "../common/LoadingOverlay";
import {
  ModernAnnotationCard,
  getAnnotationSource,
  getAnnotationLabelType,
} from "./ModernAnnotationCard";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type TypeFilterValue = "all" | "doc" | "text";
export type SourceFilterValue = "all" | "human" | "agent" | "structural";

export interface AnnotationStats {
  total: number;
  docLabels: number;
  textLabels: number;
  humanAnnotated: number;
}

export interface AnnotationsPanelProps {
  // Data
  items: ServerAnnotationType[];
  loading: boolean;
  pageInfo?: PageInfo | null;

  // Filters (controlled)
  typeFilter: TypeFilterValue;
  sourceFilter: SourceFilterValue;
  searchValue: string;

  // Filter handlers
  onTypeFilterChange: (value: TypeFilterValue) => void;
  onSourceFilterChange: (value: SourceFilterValue) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit?: (value: string) => void;

  // Pagination
  onFetchMore: () => void;

  // Item interaction
  onItemClick: (annotation: ServerAnnotationType) => void;

  // Optional features
  stats?: AnnotationStats;
  showStats?: boolean;
  similarityScores?: Map<string, number>;
  searchError?: Error | null;

  // Customization
  emptyStateMessage?: string;
  loadingMessage?: string;
  isSemanticSearch?: boolean;

  // Style
  style?: React.CSSProperties;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fafafa;
`;

const FiltersSection = styled.div`
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 1rem 1rem 0;
  background: #fafafa;
`;

const FiltersRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
`;

const SearchContainer = styled.div`
  flex: 1;
  max-width: 400px;

  @media (max-width: 768px) {
    max-width: none;
    width: 100%;
  }
`;

const AnnotationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const AnnotationsListContainer = styled.section`
  flex: 1;
  overflow-y: auto;
  position: relative;
  padding: 1rem;
  min-height: 0; /* Important for flex children to allow shrinking */
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

const ErrorBanner = styled.div`
  padding: 16px 24px;
  margin-bottom: 16px;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 14px;
`;

const LoadingMoreIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: #64748b;
  font-size: 14px;

  svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER TAB CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TYPE_FILTER_TABS: FilterTabItem[] = [
  { id: "all", label: "All Types" },
  { id: "doc", label: "Doc Labels" },
  { id: "text", label: "Text Labels" },
];

const SOURCE_FILTER_TABS: FilterTabItem[] = [
  { id: "all", label: "All Sources" },
  { id: "human", label: "Human" },
  { id: "agent", label: "AI Agent" },
  { id: "structural", label: "Structural" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply client-side filtering by type and source to annotation items
 */
export function applyLocalFilters(
  items: ServerAnnotationType[],
  typeFilter: TypeFilterValue,
  sourceFilter: SourceFilterValue
): ServerAnnotationType[] {
  let filtered = items;

  // Filter by type (doc vs text)
  if (typeFilter !== "all") {
    filtered = filtered.filter((item) => {
      const labelType = getAnnotationLabelType(item);
      return labelType === typeFilter;
    });
  }

  // Filter by source (human vs agent vs structural)
  if (sourceFilter !== "all") {
    filtered = filtered.filter((item) => {
      const source = getAnnotationSource(item);
      return source === sourceFilter;
    });
  }

  return _.uniqBy(filtered, "id");
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const AnnotationsPanel: React.FC<AnnotationsPanelProps> = ({
  items,
  loading,
  pageInfo,
  typeFilter,
  sourceFilter,
  searchValue,
  onTypeFilterChange,
  onSourceFilterChange,
  onSearchChange,
  onSearchSubmit,
  onFetchMore,
  onItemClick,
  similarityScores,
  searchError,
  emptyStateMessage,
  loadingMessage = "Loading annotations...",
  isSemanticSearch = false,
  style,
}) => {
  const selected_annotation_ids = useReactiveVar(selectedAnnotationIds);

  // Apply local filters
  const filteredItems = applyLocalFilters(items, typeFilter, sourceFilter);

  return (
    <Container style={style}>
      {/* Filters Section - Always visible */}
      <FiltersSection>
        <FiltersRow>
          <SearchContainer>
            <SearchBox
              placeholder="Search annotations..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onSubmit={onSearchSubmit}
            />
          </SearchContainer>
        </FiltersRow>

        <FiltersRow>
          <FilterTabs
            items={TYPE_FILTER_TABS}
            value={typeFilter}
            onChange={(id) => onTypeFilterChange(id as TypeFilterValue)}
          />
        </FiltersRow>

        <FiltersRow>
          <FilterTabs
            items={SOURCE_FILTER_TABS}
            value={sourceFilter}
            onChange={(id) => onSourceFilterChange(id as SourceFilterValue)}
          />
        </FiltersRow>
      </FiltersSection>

      {/* Annotations Grid */}
      <AnnotationsListContainer>
        {/* Show full overlay only on initial load (no items yet) */}
        <LoadingOverlay
          active={loading && filteredItems.length === 0}
          inverted
          size="large"
          content={loadingMessage}
        />

        {/* Error display for search failures */}
        {searchError && (
          <ErrorBanner>
            <strong>Search failed:</strong>{" "}
            {searchError.message ||
              "An error occurred while searching. Please try again."}
          </ErrorBanner>
        )}

        <AnnotationsGrid>
          {filteredItems.length > 0 ? (
            filteredItems.map((annotation) => (
              <ModernAnnotationCard
                key={annotation.id}
                annotation={annotation}
                onClick={() => onItemClick(annotation)}
                isSelected={selected_annotation_ids.includes(annotation.id)}
                similarityScore={similarityScores?.get(annotation.id)}
              />
            ))
          ) : !loading ? (
            <EmptyStateWrapper>
              <AnnotationIconWrapper>
                {isSemanticSearch ? (
                  <Sparkles size={32} />
                ) : (
                  <PenLine size={32} />
                )}
              </AnnotationIconWrapper>
              <EmptyTitle>
                {isSemanticSearch
                  ? "No matching annotations found"
                  : emptyStateMessage || "No annotations found"}
              </EmptyTitle>
              <EmptyDescription>
                {isSemanticSearch
                  ? "Try a different search query or adjust your filters to find semantically similar annotations."
                  : "Try adjusting your filters or search query to find what you're looking for."}
              </EmptyDescription>
            </EmptyStateWrapper>
          ) : null}
        </AnnotationsGrid>

        {/* Loading more indicator */}
        {loading && filteredItems.length > 0 && (
          <LoadingMoreIndicator>
            <Loader2 size={20} />
            Loading more annotations...
          </LoadingMoreIndicator>
        )}

        {/* Infinite scroll trigger */}
        <FetchMoreOnVisible fetchNextPage={onFetchMore} />
      </AnnotationsListContainer>
    </Container>
  );
};

export default AnnotationsPanel;
