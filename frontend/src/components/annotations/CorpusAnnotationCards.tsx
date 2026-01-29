import { useCallback, useEffect, useMemo, useState } from "react";

import { toast } from "react-toastify";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";

import {
  AnnotationsPanel,
  TypeFilterValue,
  SourceFilterValue,
} from "./AnnotationsPanel";

import {
  authToken,
  annotationContentSearchTerm,
  filterToLabelsetId,
  filterToLabelId,
  selectedAnalysesIds,
  showCorpusActionOutputs,
  filterToAnnotationType,
} from "../../graphql/cache";

import {
  GetAnnotationsInputs,
  GetAnnotationsOutputs,
  GET_ANNOTATIONS_FOR_CARDS,
} from "../../graphql/queries";
import { ServerAnnotationType } from "../../types/graphql-api";
import { getDocumentUrl } from "../../utils/navigationUtils";

// Number of annotations to load per page
const ANNOTATIONS_PAGE_SIZE = 20;

export const CorpusAnnotationCards = ({
  opened_corpus_id,
}: {
  opened_corpus_id: string | null;
}) => {
  /**
   * This component wraps the AnnotationsPanel component with query logic
   * for a given corpus_id. It includes source filter controls that allow
   * users to toggle between Human, AI Agent, and Structural annotations.
   */

  const navigate = useNavigate();
  const auth_token = useReactiveVar(authToken);
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);
  const filter_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filter_to_label_id = useReactiveVar(filterToLabelId);
  const selected_analysis_ids = useReactiveVar(selectedAnalysesIds);
  const show_action_annotations = useReactiveVar(showCorpusActionOutputs);
  const filter_to_annotation_type = useReactiveVar(filterToAnnotationType);
  const location = useLocation();

  // Local filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("all");
  const [searchValue, setSearchValue] = useState("");

  // Convert array of IDs to comma-separated string for GraphQL query
  const selected_analysis_id_string = selected_analysis_ids.join(",");

  // Build query variables based on sourceFilter
  const queryVariables = useMemo(() => {
    const vars: GetAnnotationsInputs = {};

    if (opened_corpus_id) {
      vars.corpusId = opened_corpus_id;
    }

    // Source filter determines structural and analysis_Isnull variables
    if (sourceFilter === "structural") {
      vars.structural = true;
    } else if (sourceFilter === "human") {
      vars.structural = false;
      vars.analysis_Isnull = true;
    } else if (sourceFilter === "agent") {
      vars.structural = false;
      vars.analysis_Isnull = false;
    } else {
      // "all" - use the show_action_annotations setting
      vars.analysis_Isnull = !show_action_annotations;
    }

    // Apply other filters
    if (selected_analysis_id_string) {
      vars.createdByAnalysisIds = selected_analysis_id_string;
    }
    if (filter_to_annotation_type) {
      vars.annotationLabel_Type = filter_to_annotation_type;
    }
    if (filter_to_label_id) {
      vars.annotationLabelId = filter_to_label_id;
    }
    if (filter_to_labelset_id) {
      vars.usesLabelFromLabelsetId = filter_to_labelset_id;
    }
    if (annotation_search_term || searchValue) {
      vars.rawText_Contains = searchValue || annotation_search_term;
    }

    // Always set a limit for pagination
    vars.limit = ANNOTATIONS_PAGE_SIZE;

    return vars;
  }, [
    opened_corpus_id,
    sourceFilter,
    show_action_annotations,
    selected_analysis_id_string,
    filter_to_annotation_type,
    filter_to_label_id,
    filter_to_labelset_id,
    annotation_search_term,
    searchValue,
  ]);

  const {
    refetch: refetchAnnotations,
    loading: annotation_loading,
    error: annotation_error,
    data: annotation_response,
    fetchMore: fetchMoreAnnotations,
  } = useQuery<GetAnnotationsOutputs, GetAnnotationsInputs>(
    GET_ANNOTATIONS_FOR_CARDS,
    {
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
      skip: !opened_corpus_id,
      variables: queryVariables,
    }
  );

  if (annotation_error) {
    toast.error("ERROR\nCould not fetch annotations for corpus.");
  }

  const handleFetchMore = useCallback(() => {
    if (
      !annotation_loading &&
      annotation_response?.annotations.pageInfo?.hasNextPage
    ) {
      fetchMoreAnnotations({
        variables: {
          limit: ANNOTATIONS_PAGE_SIZE,
          cursor: annotation_response.annotations.pageInfo.endCursor,
        },
      });
    }
  }, [annotation_loading, annotation_response, fetchMoreAnnotations]);

  // Effects to reload data on certain changes
  useEffect(() => {
    if (auth_token && opened_corpus_id) {
      refetchAnnotations();
    }
  }, [auth_token, opened_corpus_id, refetchAnnotations]);

  useEffect(() => {
    if (filter_to_label_id && opened_corpus_id) {
      refetchAnnotations();
    }
  }, [filter_to_label_id, opened_corpus_id, refetchAnnotations]);

  useEffect(() => {
    if (opened_corpus_id) {
      refetchAnnotations();
    }
  }, [selected_analysis_ids, opened_corpus_id, refetchAnnotations]);

  useEffect(() => {
    if (opened_corpus_id) {
      refetchAnnotations();
    }
  }, [show_action_annotations, opened_corpus_id, refetchAnnotations]);

  useEffect(() => {
    if (opened_corpus_id && location.pathname === "/corpuses") {
      refetchAnnotations();
    }
  }, [location, opened_corpus_id, refetchAnnotations]);

  useEffect(() => {
    if (opened_corpus_id) {
      refetchAnnotations();
    }
  }, [opened_corpus_id, refetchAnnotations]);

  // Shape data for the panel
  const annotation_items = useMemo(() => {
    const edges = annotation_response?.annotations?.edges || [];
    return edges
      .map((edge) => (edge ? edge.node : undefined))
      .filter((item): item is ServerAnnotationType => !!item);
  }, [annotation_response]);

  // Handle annotation click - navigate to document
  const handleAnnotationClick = useCallback(
    (annotation: ServerAnnotationType) => {
      if (!annotation?.document) {
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
    },
    [navigate]
  );

  // Handle search
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleSearchSubmit = useCallback(
    (value: string) => {
      setSearchValue(value);
      refetchAnnotations();
    },
    [refetchAnnotations]
  );

  return (
    <AnnotationsPanel
      items={annotation_items}
      loading={annotation_loading}
      loadingMessage="Loading annotations..."
      pageInfo={annotation_response?.annotations?.pageInfo}
      typeFilter={typeFilter}
      sourceFilter={sourceFilter}
      searchValue={searchValue}
      onTypeFilterChange={setTypeFilter}
      onSourceFilterChange={setSourceFilter}
      onSearchChange={handleSearchChange}
      onSearchSubmit={handleSearchSubmit}
      onFetchMore={handleFetchMore}
      onItemClick={handleAnnotationClick}
      style={{ minHeight: "70vh" }}
      emptyStateMessage="No annotations found in this corpus"
    />
  );
};
