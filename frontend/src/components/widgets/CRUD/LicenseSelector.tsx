import React, { useMemo } from "react";
import { Select, SelectOption } from "../../common/Select";
import { LICENSE_OPTIONS } from "../../../assets/configurations/constants";

interface LicenseSelectorProps {
  license: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const options: SelectOption[] = LICENSE_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label,
}));

export const LicenseSelector: React.FC<LicenseSelectorProps> = ({
  license,
  onChange,
  disabled = false,
}) => {
  const selectedOption = useMemo(
    () => options.find((o) => o.value === license) || options[0],
    [license]
  );

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "var(--oc-font-size-sm, 0.875rem)",
          fontWeight: 500,
          color: "var(--oc-fg-secondary, #475569)",
          marginBottom: "var(--oc-spacing-xs, 0.25rem)",
        }}
      >
        License
      </label>
      <Select
        value={selectedOption}
        options={options}
        onChange={(option) => {
          const selected = option as SelectOption | null;
          onChange(selected?.value ?? "");
        }}
        isDisabled={disabled}
        isClearable={false}
        isSearchable={false}
        placeholder="Select a license..."
      />
    </div>
  );
};
