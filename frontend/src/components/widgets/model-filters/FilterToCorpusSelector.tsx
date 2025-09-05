import { useQuery, useReactiveVar } from "@apollo/client";

import { Label, DropdownItemProps } from "semantic-ui-react";
import DropdownNoStrictMode from "../../common/DropdownNoStrictMode";

import _ from "lodash";

import { filterToCorpus, userObj } from "../../../graphql/cache";
import {
  GetCorpusesOutputs,
  GetCorpusesInputs,
  GET_CORPUSES,
} from "../../../graphql/queries";
import { CorpusType } from "../../../types/graphql-api";
import { useEffect } from "react";
import { LooseObject } from "../../types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface FilterToCorpusSelector {
  style?: Record<string, any>;
  uses_labelset_id?: string | null;
}

export const FilterToCorpusSelector = ({
  style,
  uses_labelset_id,
}: FilterToCorpusSelector) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const user_obj = useReactiveVar(userObj);

  let corpus_variables: LooseObject = [];
  if (uses_labelset_id) {
    corpus_variables["usesLabelsetId"] = uses_labelset_id;
  }

  const { refetch, loading, data, error } = useQuery<
    GetCorpusesOutputs,
    GetCorpusesInputs
  >(GET_CORPUSES, {
    variables: corpus_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    refetch();
  }, []);

  useEffect(() => {
    refetch();
  }, [user_obj]);

  const corpus_edges = data?.corpuses?.edges ? data.corpuses.edges : [];
  const corpus_items = corpus_edges
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is CorpusType => !!item);

  let label_options: DropdownItemProps[] = [];
  if (corpus_items) {
    label_options = corpus_items
      .filter((item): item is CorpusType => !!item)
      .map((label) => ({
        key: label.id,
        text: label?.title ? label.title : "",
        value: label.id,
        image: { avatar: true, src: label.icon },
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
          background: "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
          color: "white",
          fontWeight: "600",
          fontSize: "0.75rem",
          padding: "0.375rem 0.625rem",
          borderRadius: "8px",
          border: "none",
          letterSpacing: "0.025em",
          textTransform: "uppercase",
          boxShadow: "0 2px 4px rgba(102, 166, 255, 0.2)",
        }}
      >
        Filter by Corpus
      </Label>
      <div style={{ position: "relative", zIndex: 10 }}>
        <DropdownNoStrictMode
          fluid
          selection
          clearable
          search
          upward={false}
          selectOnBlur={false}
          selectOnNavigation={true}
          loading={loading}
          options={label_options}
          onChange={(e: any, { value }: { value: any }) => {
            if (value === "") {
              filterToCorpus(null);
            } else {
              let matching_corpuses = corpus_items.filter(
                (item) => item.id === value
              );
              if (matching_corpuses.length === 1) {
                filterToCorpus(matching_corpuses[0]);
              }
            }
          }}
          placeholder="Select a corpus to filter..."
          value={filtered_to_corpus ? filtered_to_corpus.id : ""}
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
