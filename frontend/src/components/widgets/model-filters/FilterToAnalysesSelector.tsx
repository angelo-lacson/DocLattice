import { useQuery, useReactiveVar } from "@apollo/client";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { DropdownItemProps, DropdownProps, Label } from "semantic-ui-react";
import DropdownNoStrictMode from "../../common/DropdownNoStrictMode";
import {
  authToken,
  selectedAnalyses,
  selectedAnalysesIds,
} from "../../../graphql/cache";
import {
  GetAnalysesInputs,
  GetAnalysesOutputs,
  GET_ANALYSES,
} from "../../../graphql/queries";
import { AnalysisType, CorpusType } from "../../../types/graphql-api";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface FilterToAnalysesSelectorProps {
  corpus: CorpusType;
  style?: Record<string, any>;
}

export const FilterToAnalysesSelector = ({
  corpus,
  style,
}: FilterToAnalysesSelectorProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const auth_token = useReactiveVar(authToken);
  const selected_analyses = useReactiveVar(selectedAnalyses);

  const analysis_ids_to_display = selected_analyses.map(
    (analysis) => analysis.id
  ) as string[];

  const handleChange = (
    event: React.SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    // console.log("Handle analysis slection", data.value);

    let selected_analyses: AnalysisType[] = [];

    if (data.value !== undefined && Array.isArray(data.value)) {
      for (let analysis_id of data.value) {
        let analysis_to_add = analyses_response?.analyses.edges
          .filter((analysis_edge) => analysis_edge.node.id === analysis_id)
          .map((edge) => edge.node);

        if (analysis_to_add !== undefined) {
          selected_analyses = [...selected_analyses, ...analysis_to_add];
        }
      }
      console.log("Set selected analyses", selected_analyses);
      selectedAnalyses(selected_analyses);
      selectedAnalysesIds(selected_analyses.map((analysis) => analysis.id));
    } else {
      selectedAnalyses([]);
      selectedAnalysesIds([]);
    }
  };

  ///////////////////////////////////////////////////////////////////////////////
  const {
    refetch: refetchAnalyses,
    loading: loading_analyses,
    error: analyses_load_error,
    data: analyses_response,
    fetchMore: fetchMoreAnalyses,
  } = useQuery<GetAnalysesOutputs, GetAnalysesInputs>(GET_ANALYSES, {
    variables: {
      corpusId: corpus.id,
    },
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });
  if (analyses_load_error) {
    toast.error("ERROR\nCould not fetch analyses for multiselector.");
    console.error(analyses_load_error);
  }

  useEffect(() => {
    refetchAnalyses();
  }, [auth_token]);

  useEffect(() => {
    refetchAnalyses();
  }, [corpus]);

  ///////////////////////////////////////////////////////////////////////////////
  let analysis_options: DropdownItemProps[] = [];
  if (analyses_response?.analyses?.edges) {
    analysis_options = analyses_response?.analyses?.edges.map((edge) => ({
      key: edge.node.id,
      text: `${edge.node.id}: ${edge.node.analyzer.analyzerId}`,
      value: edge.node.id,
    }));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        width: "100%",
        position: "relative",
        ...style,
      }}
    >
      <Label
        style={{
          margin: "0",
          background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
          color: "white",
          fontWeight: "600",
          fontSize: "0.75rem",
          padding: "0.375rem 0.625rem",
          borderRadius: "8px",
          border: "none",
          letterSpacing: "0.025em",
          textTransform: "uppercase",
          boxShadow: "0 2px 4px rgba(245, 87, 108, 0.2)",
        }}
      >
        Created by Analysis
      </Label>
      <div style={{ position: "relative", zIndex: 10 }}>
        <DropdownNoStrictMode
          placeholder="Select analyses..."
          fluid
          multiple
          selection
          clearable
          upward={false}
          selectOnBlur={false}
          selectOnNavigation={true}
          options={analysis_options}
          onChange={handleChange}
          value={analysis_ids_to_display}
          style={{
            margin: "0",
            minWidth: "260px",
            fontSize: "0.875rem",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
          }}
        />
      </div>
    </div>
  );
};
