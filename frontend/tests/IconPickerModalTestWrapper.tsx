import React, { useState } from "react";
import { IconPickerModal } from "../src/components/widgets/icon-picker/IconPickerModal";

export const IconPickerModalInteractiveWrapper: React.FC<{
  initialValue?: string;
}> = ({ initialValue = "" }) => {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(true);
  const [lastSelected, setLastSelected] = useState("");

  return (
    <div>
      <span data-testid="selected-value">{lastSelected}</span>
      <button data-testid="reopen" onClick={() => setOpen(true)}>
        Open
      </button>
      <IconPickerModal
        open={open}
        value={value}
        onSelect={(name) => {
          setValue(name);
          setLastSelected(name);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};
