import { useQuery, useReactiveVar } from "@apollo/client";

import { Label, DropdownItemProps } from "semantic-ui-react";
import DropdownNoStrictMode from "../../common/DropdownNoStrictMode";

import _ from "lodash";

import { filterToLabelsetId, userObj } from "../../../graphql/cache";
import {
  GetLabelsetOutputs,
  GetLabelsetInputs,
  GET_LABELSETS,
} from "../../../graphql/queries";
import { LabelSetType } from "../../../types/graphql-api";
import { useEffect } from "react";
import { LooseObject } from "../../types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface FilterToLabelsetSelectorProps {
  style?: Record<string, any>;
  fixed_labelset_id?: string;
}

export const FilterToLabelsetSelector = ({
  style,
  fixed_labelset_id,
}: FilterToLabelsetSelectorProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const filtered_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const user_obj = useReactiveVar(userObj);

  let labelset_variables: LooseObject = {};
  if (fixed_labelset_id) {
    labelset_variables["labelsetId"] = fixed_labelset_id;
  }

  const { refetch, loading, data, error } = useQuery<
    GetLabelsetOutputs,
    GetLabelsetInputs
  >(GET_LABELSETS, {
    variables: labelset_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    refetch();
  }, []);

  useEffect(() => {
    if (!fixed_labelset_id) {
      refetch();
    }
  }, [filtered_to_labelset_id]);

  useEffect(() => {
    refetch();
  }, [fixed_labelset_id]);

  useEffect(() => {
    refetch();
  }, [user_obj]);

  const labelset_edges = data?.labelsets?.edges ? data.labelsets.edges : [];
  const labelset_items = labelset_edges
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is LabelSetType => !!item);

  let label_options: DropdownItemProps[] = [];
  if (labelset_items) {
    label_options = labelset_items
      .filter((item): item is LabelSetType => !!item)
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
          background: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
          color: "white",
          fontWeight: "600",
          fontSize: "0.75rem",
          padding: "0.375rem 0.625rem",
          borderRadius: "8px",
          border: "none",
          letterSpacing: "0.025em",
          textTransform: "uppercase",
          boxShadow: "0 2px 4px rgba(250, 112, 154, 0.2)",
        }}
      >
        Filter by Labelset
      </Label>
      <div style={{ position: "relative", zIndex: 10 }}>
        <DropdownNoStrictMode
          fluid
          loading={loading}
          selection
          clearable
          search
          upward={false}
          selectOnBlur={false}
          selectOnNavigation={true}
          disabled={Boolean(fixed_labelset_id)}
          options={label_options}
          onChange={(e: any, { value }: { value: any }) => {
            filterToLabelsetId(String(value));
          }}
          placeholder="Select a labelset to filter..."
          value={
            fixed_labelset_id
              ? fixed_labelset_id
              : filtered_to_labelset_id
              ? filtered_to_labelset_id
              : ""
          }
          style={{
            margin: "0",
            minWidth: "260px",
            fontSize: "0.875rem",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
            opacity: fixed_labelset_id ? 0.7 : 1,
          }}
        />
      </div>
    </div>
  );
};
