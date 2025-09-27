import { useReactiveVar } from "@apollo/client";
import { Label, DropdownItemProps } from "semantic-ui-react";
import DropdownNoStrictMode from "../../common/DropdownNoStrictMode";
import { filterToStructuralAnnotations } from "../../../graphql/cache";

interface FilterToStructuralAnnotationsSelectorProps {
  style?: Record<string, any>;
}

export const FilterToStructuralAnnotationsSelector = ({
  style,
}: FilterToStructuralAnnotationsSelectorProps) => {
  // Get the current value of the reactive variable
  const structural_filter = useReactiveVar(filterToStructuralAnnotations);

  // Options for the dropdown
  const structuralOptions: DropdownItemProps[] = [
    { key: "ONLY", text: "Only Structural", value: "ONLY" },
    { key: "EXCLUDE", text: "Exclude Structural", value: "EXCLUDE" },
    { key: "INCLUDE", text: "Include Structural", value: "INCLUDE" },
  ];

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
          background: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
          color: "white",
          fontWeight: "600",
          fontSize: "0.75rem",
          padding: "0.375rem 0.625rem",
          borderRadius: "8px",
          border: "none",
          letterSpacing: "0.025em",
          textTransform: "uppercase",
          boxShadow: "0 2px 4px rgba(168, 237, 234, 0.3)",
        }}
      >
        Structural Annotations
      </Label>
      <div style={{ position: "relative", zIndex: 10 }}>
        <DropdownNoStrictMode
          fluid
          selection
          upward={false}
          selectOnBlur={false}
          selectOnNavigation={true}
          options={structuralOptions}
          onChange={(e: any, { value }: { value: any }) => {
            // Update the reactive variable when a selection is made
            if (value !== undefined) {
              filterToStructuralAnnotations(
                value as "ONLY" | "INCLUDE" | "EXCLUDE" | undefined
              );
            }
          }}
          placeholder="Filter structural annotations..."
          value={structural_filter}
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
