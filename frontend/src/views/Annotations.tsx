import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import _ from "lodash";

import { useQuery, useLazyQuery, useReactiveVar } from "@apollo/client";
import {
  SearchBox,
  FilterTabs,
  StatBlock,
  StatGrid,
  Button,
  EmptyState,
} from "@os-legal/ui";
import type { FilterTabItem } from "@os-legal/ui";
import {
  FileText,
  AlignLeft,
  User,
  Bot,
  Settings,
  ChevronDown,
  Globe,
  Users,
  Lock,
  PenLine,
  Sparkles,
} from "lucide-react";

import {
  authToken,
  annotationContentSearchTerm,
  filterToLabelsetId,
  openedCorpus,
  filterToCorpus,
  filterToLabelId,
  filterToStructuralAnnotations,
  selectedAnnotationIds,
} from "../graphql/cache";
import {
  GetAnnotationsInputs,
  GetAnnotationsOutputs,
  GetCorpusLabelsetAndLabelsInputs,
  GetCorpusLabelsetAndLabelsOutputs,
  GET_ANNOTATIONS,
  GET_CORPUS_LABELSET_AND_LABELS,
  SemanticSearchInput,
  SemanticSearchOutput,
  SemanticSearchResult,
  SEMANTIC_SEARCH_ANNOTATIONS,
} from "../graphql/queries";
import { ServerAnnotationType, PageInfo } from "../types/graphql-api";
import { FetchMoreOnVisible } from "../components/widgets/infinite_scroll/FetchMoreOnVisible";
import { LoadingOverlay } from "../components/common/LoadingOverlay";
import { getDocumentUrl } from "../utils/navigationUtils";
import {
  ModernAnnotationCard,
  getAnnotationSource,
  getAnnotationLabelType,
  AnnotationSourceType,
  AnnotationLabelTypeFilter,
} from "../components/annotations/ModernAnnotationCard";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface LooseObject {
  [key: string]: any;
}

type TypeFilterValue = "all" | "doc" | "text";
type SourceFilterValue = "all" | "human" | "agent" | "structural";

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const PageContainer = styled.div`
  height: 100%;
  background: #fafafa;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  overflow-y: auto;
  overflow-x: hidden;
`;

const ContentContainer = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 24px 80px;

  @media (max-width: 768px) {
    padding: 32px 16px 60px;
  }
`;

const HeroSection = styled.section`
  margin-bottom: 40px;
`;

const HeroHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const HeroTitle = styled.h1`
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 42px;
  font-weight: 400;
  line-height: 1.2;
  color: #1e293b;
  margin: 0 0 12px;

  span {
    color: #0f766e;
  }

  @media (max-width: 768px) {
    font-size: 32px;
  }
`;

const HeroSubtitle = styled.p`
  font-size: 17px;
  line-height: 1.6;
  color: #64748b;
  margin: 0;
  max-width: 500px;
`;

const StatsContainer = styled.div`
  margin-bottom: 32px;
  padding: 20px 24px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;

  /* Override stat value size */
  [class*="StatBlock"] > *:first-child,
  [data-testid="stat-value"] {
    font-size: 24px !important;
  }
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  @media (max-width: 768px) {
    padding: 12px;
    background: #f8fafc;
    border-radius: 8px;
  }
`;

const StatIcon = styled.div`
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0fdfa;
  border-radius: 10px;
  color: #0f766e;
`;

const StatContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1;
`;

const StatLabel = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const StatDivider = styled.div`
  width: 1px;
  height: 40px;
  background: #e2e8f0;

  @media (max-width: 768px) {
    display: none;
  }
`;

const FiltersSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
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

const DropdownsContainer = styled.div`
  display: flex;
  gap: 8px;

  @media (max-width: 768px) {
    width: 100%;
    overflow-x: auto;
    padding-bottom: 4px;
  }
`;

const FilterDropdown = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 500;
  color: ${(props) => (props.$active ? "#0f766e" : "#64748b")};
  background: ${(props) => (props.$active ? "#f0fdfa" : "white")};
  border: 1px solid ${(props) => (props.$active ? "#0f766e" : "#e2e8f0")};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    border-color: ${(props) => (props.$active ? "#0f766e" : "#cbd5e1")};
    color: ${(props) => (props.$active ? "#0f766e" : "#1e293b")};
  }
`;

const AdvancedFiltersContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
`;

const FilterWidgetWrapper = styled.div`
  flex: 1;
  min-width: 200px;
  max-width: 300px;

  @media (max-width: 768px) {
    min-width: 100%;
    max-width: none;
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
  position: relative;
  min-height: 200px;
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

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER COMPONENTS (inline versions for cleaner integration)
// ═══════════════════════════════════════════════════════════════════════════════

import { FilterToStructuralAnnotationsSelector } from "../components/widgets/model-filters/FilterStructuralAnnotations";
import { FilterToLabelsetSelector } from "../components/widgets/model-filters/FilterToLabelsetSelector";
import { FilterToCorpusSelector } from "../components/widgets/model-filters/FilterToCorpusSelector";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import { LabelType } from "../types/graphql-api";

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const Annotations = () => {
  const navigate = useNavigate();

  // Reactive vars for existing filtering
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);
  const filter_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const filter_to_label_id = useReactiveVar(filterToLabelId);
  const opened_corpus = useReactiveVar(openedCorpus);
  const auth_token = useReactiveVar(authToken);
  const exclude_structural_annotations = useReactiveVar(
    filterToStructuralAnnotations
  );
  const selected_annotation_ids = useReactiveVar(selectedAnnotationIds);

  // Local state for new filters
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("all");
  const [searchValue, setSearchValue] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Semantic search state
  const [semanticSearchOffset, setSemanticSearchOffset] = useState(0);
  const [semanticSearchResults, setSemanticSearchResults] = useState<
    SemanticSearchResult[]
  >([]);
  const [hasMoreSemanticResults, setHasMoreSemanticResults] = useState(true);
  const SEMANTIC_SEARCH_LIMIT = 20;

  // Build query variables
  let annotation_variables: LooseObject = {
    label_Type: "TEXT_LABEL",
  };

  if (exclude_structural_annotations === "EXCLUDE") {
    annotation_variables["structural"] = false;
  } else if (exclude_structural_annotations === "ONLY") {
    annotation_variables["structural"] = true;
  }

  if (annotation_search_term) {
    annotation_variables["rawText_Contains"] = annotation_search_term;
  }
  if (filter_to_labelset_id) {
    annotation_variables["usesLabelFromLabelsetId"] = filter_to_labelset_id;
  }
  if (filtered_to_corpus) {
    annotation_variables["corpusId"] = filtered_to_corpus.id;
  }
  if (filter_to_label_id) {
    annotation_variables["annotationLabelId"] = filter_to_label_id;
  }

  // GraphQL queries
  const {
    refetch: refetch_annotations,
    loading: annotation_loading,
    error: annotation_error,
    data: annotation_data,
    fetchMore: fetchMoreAnnotations,
  } = useQuery<GetAnnotationsOutputs, GetAnnotationsInputs>(GET_ANNOTATIONS, {
    variables: annotation_variables,
    notifyOnNetworkStatusChange: true,
  });

  const {
    refetch: refetch_corpus,
    loading: corpus_loading,
    data: corpus_data,
    error: corpus_error,
  } = useQuery<
    GetCorpusLabelsetAndLabelsOutputs,
    GetCorpusLabelsetAndLabelsInputs
  >(GET_CORPUS_LABELSET_AND_LABELS, {
    variables: {
      corpusId: filtered_to_corpus?.id || opened_corpus?.id || "",
    },
    skip: !filtered_to_corpus?.id && !opened_corpus?.id,
    notifyOnNetworkStatusChange: true,
  });

  // Semantic search query (lazy - triggered when user searches)
  const [
    executeSemanticSearch,
    { loading: semanticSearchLoading, error: semanticSearchError },
  ] = useLazyQuery<SemanticSearchOutput, SemanticSearchInput>(
    SEMANTIC_SEARCH_ANNOTATIONS,
    {
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
      onCompleted: (data) => {
        if (data?.semanticSearch) {
          const newResults = data.semanticSearch;
          if (semanticSearchOffset === 0) {
            // Fresh search - replace results
            setSemanticSearchResults(newResults);
          } else {
            // Load more - append results
            setSemanticSearchResults((prev) => [...prev, ...newResults]);
          }
          // Check if there are more results
          setHasMoreSemanticResults(
            newResults.length === SEMANTIC_SEARCH_LIMIT
          );
        }
      },
    }
  );

  // Determine if we're in semantic search mode (user has entered a search query)
  const isSemanticSearchActive = searchValue.trim().length > 0;

  // Consolidated effect for refetching annotations on filter changes
  // This prevents race conditions from multiple simultaneous filter changes
  useEffect(() => {
    refetch_annotations();
  }, [
    filter_to_label_id,
    filter_to_labelset_id,
    filtered_to_corpus,
    annotation_search_term,
    exclude_structural_annotations,
    auth_token,
    refetch_annotations,
  ]);

  // Separate effect for opened_corpus since it also needs to refetch corpus data
  useEffect(() => {
    if (opened_corpus) {
      refetch_annotations();
      refetch_corpus();
    }
  }, [opened_corpus, refetch_annotations, refetch_corpus]);

  // Sync source filter with structural annotations reactive var
  useEffect(() => {
    if (sourceFilter === "structural") {
      filterToStructuralAnnotations("ONLY");
    } else if (
      sourceFilter === "human" ||
      sourceFilter === "agent" ||
      sourceFilter === "all"
    ) {
      // For human/agent/all, we need structural annotations included or excluded
      if (sourceFilter !== "all") {
        filterToStructuralAnnotations("EXCLUDE");
      } else {
        filterToStructuralAnnotations("INCLUDE");
      }
    }
  }, [sourceFilter]);

  // Get raw items from query - handles both browse mode and semantic search
  const rawItems: ServerAnnotationType[] = useMemo(() => {
    if (isSemanticSearchActive) {
      // In semantic search mode, extract annotations from search results
      return semanticSearchResults.map((result) => result.annotation);
    }
    // In browse mode, use the regular annotations query
    if (annotation_data?.annotations) {
      return annotation_data.annotations.edges.map((edge) => edge.node);
    }
    return [];
  }, [annotation_data, isSemanticSearchActive, semanticSearchResults]);

  // Create a map of annotation ID to similarity score for display
  const similarityScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    if (isSemanticSearchActive) {
      semanticSearchResults.forEach((result) => {
        map.set(result.annotation.id, result.similarityScore);
      });
    }
    return map;
  }, [isSemanticSearchActive, semanticSearchResults]);

  // Apply local filters (type and source)
  const filteredItems = useMemo(() => {
    let items = rawItems;

    // Filter by type (doc vs text)
    if (typeFilter !== "all") {
      items = items.filter((item) => {
        const labelType = getAnnotationLabelType(item);
        return labelType === typeFilter;
      });
    }

    // Filter by source (human vs agent vs structural)
    if (sourceFilter !== "all") {
      items = items.filter((item) => {
        const source = getAnnotationSource(item);
        return source === sourceFilter;
      });
    }

    return _.uniqBy(items, "id");
  }, [rawItems, typeFilter, sourceFilter]);

  // Calculate stats - use totalCount from backend for accurate total
  const stats = useMemo(() => {
    // Use backend totalCount for accurate total count, fallback to loaded items
    const total = annotation_data?.annotations?.totalCount ?? rawItems.length;
    const docLabels = rawItems.filter(
      (item) => getAnnotationLabelType(item) === "doc"
    ).length;
    const textLabels = rawItems.filter(
      (item) => getAnnotationLabelType(item) === "text"
    ).length;
    const humanAnnotated = rawItems.filter(
      (item) => getAnnotationSource(item) === "human"
    ).length;

    return { total, docLabels, textLabels, humanAnnotated };
  }, [rawItems, annotation_data?.annotations?.totalCount]);

  // Execute semantic search with current filters
  const performSemanticSearch = useCallback(
    (query: string, offset: number = 0) => {
      if (!query.trim()) return;

      const variables: SemanticSearchInput = {
        query: query.trim(),
        limit: SEMANTIC_SEARCH_LIMIT,
        offset,
      };

      // Add corpus filter if set
      if (filtered_to_corpus?.id) {
        variables.corpusId = filtered_to_corpus.id;
      }

      // Add modalities filter based on source filter (semantic search uses modalities)
      // Note: structural filtering is handled server-side differently
      if (sourceFilter === "structural") {
        // For structural, we don't filter by modalities as structural annotations
        // can have any modality
      }

      executeSemanticSearch({ variables });
    },
    [executeSemanticSearch, filtered_to_corpus, sourceFilter]
  );

  // Debounced semantic search
  const debouncedSearch = useRef(
    _.debounce((searchTerm: string) => {
      if (searchTerm.trim()) {
        // Reset pagination for new search
        setSemanticSearchOffset(0);
        setSemanticSearchResults([]);
        setHasMoreSemanticResults(true);
        performSemanticSearch(searchTerm, 0);
      } else {
        // Clear search - return to browse mode
        setSemanticSearchResults([]);
        setSemanticSearchOffset(0);
        setHasMoreSemanticResults(true);
      }
    }, 500)
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      debouncedSearch.current(value);
    },
    [debouncedSearch]
  );

  const handleSearchSubmit = useCallback(
    (value: string) => {
      // Cancel any pending debounced search
      debouncedSearch.current.cancel();
      setSearchValue(value);

      if (value.trim()) {
        // Reset pagination and execute search immediately
        setSemanticSearchOffset(0);
        setSemanticSearchResults([]);
        setHasMoreSemanticResults(true);
        performSemanticSearch(value, 0);
      } else {
        // Clear search - return to browse mode
        setSemanticSearchResults([]);
        setSemanticSearchOffset(0);
        setHasMoreSemanticResults(true);
      }
    },
    [performSemanticSearch, debouncedSearch]
  );

  // Handle infinite scroll - supports both browse mode and semantic search
  const handleFetchMore = useCallback(() => {
    if (isSemanticSearchActive) {
      // Semantic search pagination (offset-based)
      if (!semanticSearchLoading && hasMoreSemanticResults) {
        const newOffset = semanticSearchOffset + SEMANTIC_SEARCH_LIMIT;
        setSemanticSearchOffset(newOffset);
        performSemanticSearch(searchValue, newOffset);
      }
    } else {
      // Browse mode pagination (cursor-based)
      const pageInfo = annotation_data?.annotations?.pageInfo;
      if (!annotation_loading && pageInfo?.hasNextPage) {
        fetchMoreAnnotations({
          variables: {
            limit: 20,
            cursor: pageInfo.endCursor,
          },
        });
      }
    }
  }, [
    isSemanticSearchActive,
    semanticSearchLoading,
    hasMoreSemanticResults,
    semanticSearchOffset,
    searchValue,
    performSemanticSearch,
    annotation_loading,
    annotation_data,
    fetchMoreAnnotations,
  ]);

  // Handle annotation click - navigate to document
  // Supports both corpus-linked and standalone documents (e.g., structural annotations)
  const handleAnnotationClick = useCallback(
    (annotation: ServerAnnotationType) => {
      try {
        if (!annotation) {
          toast.error("Unable to open annotation: Invalid annotation data");
          return;
        }

        if (!annotation.document) {
          toast.error("Unable to open annotation: Document not available");
          return;
        }

        const queryParams: {
          annotationIds: string[];
          analysisIds?: string[];
        } = {
          annotationIds: [annotation.id],
        };

        if (annotation.analysis?.id) {
          queryParams.analysisIds = [annotation.analysis.id];
        }

        // getDocumentUrl handles null corpus by generating standalone document URL
        const url = getDocumentUrl(
          annotation.document,
          annotation.corpus ?? null,
          queryParams
        );

        if (url !== "#") {
          navigate(url);
        } else {
          toast.warning(
            "Unable to navigate: Document is missing required information"
          );
        }
      } catch (error) {
        console.error("Error navigating to annotation:", error);
        toast.error("An error occurred while opening the annotation");
      }
    },
    [navigate]
  );

  // Filter tab configurations
  const typeFilterTabs: FilterTabItem[] = [
    { id: "all", label: "All Types" },
    { id: "doc", label: "Doc Labels" },
    { id: "text", label: "Text Labels" },
  ];

  const sourceFilterTabs: FilterTabItem[] = [
    { id: "all", label: "All Sources" },
    { id: "human", label: "Human" },
    { id: "agent", label: "AI Agent" },
    { id: "structural", label: "Structural" },
  ];

  const pageInfo = annotation_data?.annotations?.pageInfo;

  return (
    <PageContainer>
      <ContentContainer>
        {/* Hero Section */}
        <HeroSection>
          <HeroHeader>
            <div>
              <HeroTitle>
                Browse <span>annotations</span>
              </HeroTitle>
              <HeroSubtitle>
                Explore and discover annotations across your documents. Filter
                by type, source, or visibility.
              </HeroSubtitle>
            </div>
          </HeroHeader>
        </HeroSection>

        {/* Stats Bar */}
        <StatsContainer>
          <StatsRow>
            <StatItem>
              <StatIcon>
                <PenLine size={20} />
              </StatIcon>
              <StatContent>
                <StatValue>{stats.total.toLocaleString()}</StatValue>
                <StatLabel>Total Annotations</StatLabel>
              </StatContent>
            </StatItem>
            <StatDivider />
            <StatItem>
              <StatIcon>
                <FileText size={20} />
              </StatIcon>
              <StatContent>
                <StatValue>{stats.docLabels}</StatValue>
                <StatLabel>Doc Labels</StatLabel>
              </StatContent>
            </StatItem>
            <StatDivider />
            <StatItem>
              <StatIcon>
                <AlignLeft size={20} />
              </StatIcon>
              <StatContent>
                <StatValue>{stats.textLabels}</StatValue>
                <StatLabel>Text Labels</StatLabel>
              </StatContent>
            </StatItem>
            <StatDivider />
            <StatItem>
              <StatIcon>
                <User size={20} />
              </StatIcon>
              <StatContent>
                <StatValue>{stats.humanAnnotated}</StatValue>
                <StatLabel>Human Annotated</StatLabel>
              </StatContent>
            </StatItem>
          </StatsRow>
        </StatsContainer>

        {/* Filters */}
        <FiltersSection>
          <FiltersRow>
            <SearchContainer>
              <SearchBox
                placeholder="Search annotations by label, text, or document..."
                value={searchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                onSubmit={handleSearchSubmit}
              />
            </SearchContainer>
            <DropdownsContainer>
              <FilterDropdown
                $active={showAdvancedFilters}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                Advanced Filters
                <ChevronDown size={14} />
              </FilterDropdown>
            </DropdownsContainer>
          </FiltersRow>

          <FiltersRow>
            <FilterTabs
              items={typeFilterTabs}
              value={typeFilter}
              onChange={(id) => setTypeFilter(id as TypeFilterValue)}
            />
          </FiltersRow>

          <FiltersRow>
            <FilterTabs
              items={sourceFilterTabs}
              value={sourceFilter}
              onChange={(id) => setSourceFilter(id as SourceFilterValue)}
            />
          </FiltersRow>

          {/* Advanced Filters (collapsible) */}
          {showAdvancedFilters && (
            <AdvancedFiltersContainer>
              <FilterWidgetWrapper>
                <FilterToLabelsetSelector
                  fixed_labelset_id={
                    filtered_to_corpus?.labelSet?.id
                      ? filtered_to_corpus.labelSet.id
                      : undefined
                  }
                />
              </FilterWidgetWrapper>
              <FilterWidgetWrapper>
                <FilterToCorpusSelector
                  uses_labelset_id={filter_to_labelset_id}
                />
              </FilterWidgetWrapper>
              {(filter_to_labelset_id || filtered_to_corpus?.labelSet?.id) && (
                <FilterWidgetWrapper>
                  <FilterToLabelSelector
                    label_type={LabelType.TokenLabel}
                    only_labels_for_labelset_id={
                      filter_to_labelset_id
                        ? filter_to_labelset_id
                        : filtered_to_corpus?.labelSet?.id
                        ? filtered_to_corpus.labelSet.id
                        : undefined
                    }
                  />
                </FilterWidgetWrapper>
              )}
            </AdvancedFiltersContainer>
          )}
        </FiltersSection>

        {/* Annotations Grid */}
        <AnnotationsListContainer>
          <LoadingOverlay
            active={
              isSemanticSearchActive
                ? semanticSearchLoading
                : annotation_loading
            }
            inverted
            size="large"
            content={
              isSemanticSearchActive
                ? "Searching annotations..."
                : "Loading Annotations..."
            }
          />

          <AnnotationsGrid>
            {filteredItems.length > 0 ? (
              filteredItems.map((annotation) => (
                <ModernAnnotationCard
                  key={annotation.id}
                  annotation={annotation}
                  onClick={() => handleAnnotationClick(annotation)}
                  isSelected={selected_annotation_ids.includes(annotation.id)}
                  similarityScore={similarityScoreMap.get(annotation.id)}
                />
              ))
            ) : !(isSemanticSearchActive
                ? semanticSearchLoading
                : annotation_loading) ? (
              <EmptyStateWrapper>
                <AnnotationIconWrapper>
                  {isSemanticSearchActive ? (
                    <Sparkles size={32} />
                  ) : (
                    <PenLine size={32} />
                  )}
                </AnnotationIconWrapper>
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "#1e293b",
                    margin: "24px 0 8px",
                  }}
                >
                  {isSemanticSearchActive
                    ? "No matching annotations found"
                    : "No annotations found"}
                </h3>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#64748b",
                    margin: 0,
                    maxWidth: "300px",
                  }}
                >
                  {isSemanticSearchActive
                    ? "Try a different search query or adjust your filters to find semantically similar annotations."
                    : "Try adjusting your filters or search query to find what you're looking for."}
                </p>
              </EmptyStateWrapper>
            ) : null}
          </AnnotationsGrid>

          {/* Infinite scroll trigger */}
          <FetchMoreOnVisible fetchNextPage={handleFetchMore} />
        </AnnotationsListContainer>
      </ContentContainer>
    </PageContainer>
  );
};

export default Annotations;
