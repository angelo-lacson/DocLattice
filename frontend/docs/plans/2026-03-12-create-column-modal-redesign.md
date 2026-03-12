# CreateColumnModal Redesign — OS Legal Design System Migration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite CreateColumnModal and its four section components to match the OS Legal design language established by CreateExtractModal — eliminate all Semantic UI dependencies, use OS_LEGAL_COLORS, add motion animations, and produce a polished modal.

**Architecture:** Inline the four section components directly into CreateColumnModal (they're single-use and thin). Replace `styled.ts` shared styles with local styled-components following CreateExtractModal patterns. Replace SUI Grid/Form.Radio/Form.Checkbox/Form.Select/Popup with native HTML + @os-legal/ui Dropdown. Use `createPortal` + framer-motion for the modal shell.

**Tech Stack:** React, styled-components, framer-motion, @os-legal/ui (Dropdown, Button, IconButton), lucide-react icons, OS_LEGAL_COLORS design tokens.

---

## Reference: Design Language (from CreateExtractModal)

These patterns MUST be followed exactly:

- **Overlay**: `position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); z-index: 1000`
- **Container**: `motion.div`, `border-radius: 16px`, `max-height: 85vh`, subtle box-shadow, scale+opacity entrance animation
- **Header**: Gradient background (`#fbfcfd → gray50`), `ModalTitle` at 1.625rem/700, `ModalSubtitle` for description, `X` close button as `motion.button` with hover scale
- **Body**: `padding: 2rem 2.5rem`, `overflow-y: auto`, white background
- **Footer**: Gradient background (reverse), `FooterInfo` left + `ButtonGroup` right, `@os-legal/ui Button` for Cancel/Submit
- **Form fields**: `Label` at 0.875rem/600 with `.required` span, `StyledInput` with 1.5px border/10px radius/hover+focus states, `HelperText` at 0.8125rem
- **Portal**: `createPortal(content, document.body)`

## Reference: Files to read

- `src/components/widgets/modals/CreateExtractModal.tsx` — the gold standard modal
- `src/assets/configurations/osLegalStyles.ts` — OS_LEGAL_COLORS tokens
- `src/components/widgets/ModelFieldBuilder.tsx` — already migrated, keep as-is
- `src/components/widgets/selectors/ExtractTaskDropdown.tsx` — already uses @os-legal/ui Dropdown, keep as-is

---

### Task 1: Rewrite CreateColumnModal shell and inline BasicConfigSection

**Files:**

- Rewrite: `src/components/widgets/modals/CreateColumnModal.tsx`
- Reference: `src/components/widgets/modals/CreateExtractModal.tsx` (copy the styled-component patterns)

**Step 1: Replace imports and styled components**

Remove all SUI imports. Replace `ModalWrapper`/`ModalDialog`/`ModalHeaderStyled`/`ModalBodyStyled`/`ModalFooterStyled`/`CloseButton` with the OS Legal pattern components copied from CreateExtractModal:

```tsx
import React, { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { motion } from "framer-motion";
import { X, Check, HelpCircle, Plus } from "lucide-react";
import { Button, Dropdown, IconButton } from "@os-legal/ui";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";
import { ColumnType } from "../../../types/graphql-api";
import { LooseObject } from "../../types";
import { ExtractTaskDropdown } from "../selectors/ExtractTaskDropdown";
import { FieldType, ModelFieldBuilder } from "../ModelFieldBuilder";
import { parsePydanticModel } from "../../../utils/parseOutputType";
```

Key styled components to create (match CreateExtractModal exactly):

- `ModalOverlay` — fixed overlay with blur
- `ModalContainer` — motion.div, 900px max-width (wider than CreateExtractModal's 720px for the 2-col layout)
- `ModalHeader` — gradient header with title, subtitle, close button
- `ModalTitle`, `ModalSubtitle`, `CloseButton` — exact copies
- `ModalBody` — scrollable body
- `ModalFooter` — gradient footer with info + button group
- `FormSection`, `Label`, `StyledInput`, `StyledTextArea`, `HelperText` — form field primitives
- `SectionDivider` — styled h3 for section headers (replaces SUI section titles)

**Step 2: Inline BasicConfigSection**

Replace the `<BasicConfigSection>` component call with inline JSX:

```tsx
<SectionDivider>Basic Configuration</SectionDivider>
<FormRow>
  <FormSection>
    <Label>Name <span className="required">*</span></Label>
    <StyledInput
      placeholder="Enter column name"
      value={formData.name || ""}
      onChange={(e) => handleFieldChange("name", e.target.value)}
    />
    <HelperText>A short, descriptive name for this column</HelperText>
  </FormSection>
  <FormSection>
    <Label>Extract Task <span className="required">*</span></Label>
    <ExtractTaskDropdown
      onChange={(taskName) => {
        if (taskName) setFormData((prev) => ({ ...prev, taskName }));
      }}
      taskName={formData.taskName || ""}
    />
    <HelperText>The extraction task that processes this column</HelperText>
  </FormSection>
</FormRow>
```

Where `FormRow` is a new 2-column grid styled component:

```tsx
const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;
```

**Step 3: Simplify handleChange**

Replace the SUI-style `handleChange(event, data, fieldName)` signature with a simple `handleFieldChange(fieldName, value)`:

```tsx
const handleFieldChange = useCallback((field: string, value: any) => {
  setFormData((prev) => ({ ...prev, [field]: value }));
}, []);
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: No errors

**Step 5: Commit**

```
git add src/components/widgets/modals/CreateColumnModal.tsx
git commit -m "Rewrite CreateColumnModal shell with OS Legal design system"
```

---

### Task 2: Inline OutputTypeSection — replace SUI Radio/Checkbox/Select

**Files:**

- Modify: `src/components/widgets/modals/CreateColumnModal.tsx` (add output type section inline)
- Delete: `src/components/widgets/modals/sections/OutputTypeSection.tsx` (after inlining)

**Step 1: Create styled radio and checkbox components**

```tsx
const RadioGroup = styled.div`
  display: flex;
  gap: 1.25rem;
  align-items: center;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textPrimary};
  cursor: pointer;
`;

const RadioInput = styled.input`
  accent-color: ${OS_LEGAL_COLORS.primaryBlue};
  width: 18px;
  height: 18px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textPrimary};
  cursor: pointer;
`;

const CheckboxInput = styled.input`
  accent-color: ${OS_LEGAL_COLORS.primaryBlue};
  width: 18px;
  height: 18px;
  cursor: pointer;
`;
```

**Step 2: Inline OutputTypeSection JSX**

Replace `<OutputTypeSection ... />` with inline JSX:

```tsx
<SectionDivider>Output Type</SectionDivider>
<FormRow>
  <FormSection>
    <Label>Select Type</Label>
    <RadioGroup>
      <RadioLabel>
        <RadioInput
          type="radio"
          name="outputType"
          value="primitive"
          checked={outputTypeOption === "primitive"}
          onChange={() => {
            setOutputTypeOption("primitive");
            setFormData((prev) => ({ ...prev, outputType: primitiveType }));
          }}
        />
        Primitive Type
      </RadioLabel>
      <RadioLabel>
        <RadioInput
          type="radio"
          name="outputType"
          value="custom"
          checked={outputTypeOption === "custom"}
          onChange={() => {
            setOutputTypeOption("custom");
            setFormData((prev) => ({ ...prev, outputType: "" }));
          }}
        />
        Custom Model
      </RadioLabel>
    </RadioGroup>
  </FormSection>
  <FormSection>
    <CheckboxLabel>
      <CheckboxInput
        type="checkbox"
        checked={extractIsList}
        onChange={(e) => {
          setExtractIsList(e.target.checked);
          setFormData((prev) => ({ ...prev, extractIsList: e.target.checked }));
        }}
      />
      List of Values
    </CheckboxLabel>
    <HelperText>Extract multiple values instead of a single value</HelperText>
  </FormSection>
</FormRow>

{outputTypeOption === "primitive" && (
  <FormSection>
    <Label>Primitive Type</Label>
    <Dropdown
      mode="select"
      fluid
      options={PRIMITIVE_TYPE_OPTIONS}
      value={primitiveType}
      onChange={(value) => {
        const v = value as string;
        setPrimitiveType(v);
        setFormData((prev) => ({ ...prev, outputType: v }));
      }}
      placeholder="Select type"
      clearable={false}
    />
  </FormSection>
)}

{outputTypeOption === "custom" && (
  <FormSection>
    <Label>Model Fields</Label>
    <ModelFieldBuilder
      onFieldsChange={handleFieldsChange}
      initialFields={initialFields}
    />
  </FormSection>
)}
```

Where `PRIMITIVE_TYPE_OPTIONS` is a module-level constant:

```tsx
const PRIMITIVE_TYPE_OPTIONS = [
  { value: "str", label: "String" },
  { value: "int", label: "Integer" },
  { value: "float", label: "Float" },
  { value: "bool", label: "Boolean" },
];
```

**Step 3: Move `generateOutputType` helper into CreateColumnModal**

Copy the helper function from OutputTypeSection:

```tsx
const generateOutputType = (
  option: string,
  primitive: string,
  fields: FieldType[]
): string => {
  if (option === "primitive") return primitive;
  const fieldLines = fields
    .map((f) => `    ${f.fieldName}: ${f.fieldType}`)
    .join("\n");
  return `class CustomModel(BaseModel):\n${fieldLines}`;
};
```

**Step 4: Delete OutputTypeSection.tsx**

```bash
rm src/components/widgets/modals/sections/OutputTypeSection.tsx
```

**Step 5: Verify TypeScript compiles and commit**

Run: `npx tsc --noEmit --project tsconfig.json`

```
git add -A
git commit -m "Inline OutputTypeSection, replace SUI Radio/Checkbox/Select with native + @os-legal/ui"
```

---

### Task 3: Inline ExtractionConfigSection and AdvancedOptionsSection — replace SUI Popup

**Files:**

- Modify: `src/components/widgets/modals/CreateColumnModal.tsx`
- Delete: `src/components/widgets/modals/sections/ExtractionConfigSection.tsx`
- Delete: `src/components/widgets/modals/sections/AdvancedOptionsSection.tsx`

**Step 1: Create a Tooltip styled component**

Replace SUI Popup with a simple CSS tooltip:

```tsx
const Tooltip = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: help;
  color: ${OS_LEGAL_COLORS.textMuted};

  &:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: ${OS_LEGAL_COLORS.textPrimary};
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 400;
    white-space: nowrap;
    max-width: 280px;
    white-space: normal;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: none;
  }
`;
```

**Step 2: Inline ExtractionConfigSection**

```tsx
<SectionDivider>Extraction Configuration</SectionDivider>
<FormSection>
  <Label>Query <span className="required">*</span></Label>
  <StyledTextArea
    rows={3}
    placeholder="What query shall we use to guide the LLM extraction?"
    value={formData.query || ""}
    onChange={(e) => handleFieldChange("query", e.target.value)}
  />
</FormSection>
<FormRow>
  <FormSection>
    <Label>Must Contain Text</Label>
    <StyledTextArea
      rows={3}
      placeholder="Only look in annotations that contain this string (case insensitive)"
      value={formData.mustContainText || ""}
      onChange={(e) => handleFieldChange("mustContainText", e.target.value)}
    />
    <HelperText>Narrows the search to matching annotations</HelperText>
  </FormSection>
  <FormSection>
    <Label>
      Representative Example
      <Tooltip data-tooltip="Find text that is semantically similar to this example FIRST if provided.">
        <HelpCircle size={14} style={{ marginLeft: 4 }} />
      </Tooltip>
    </Label>
    <StyledTextArea
      rows={3}
      placeholder="Place example of text containing relevant data here"
      value={formData.matchText || ""}
      onChange={(e) => handleFieldChange("matchText", e.target.value)}
    />
  </FormSection>
</FormRow>
```

**Step 3: Inline AdvancedOptionsSection**

```tsx
<SectionDivider>Advanced Options</SectionDivider>
<FormRow>
  <FormSection>
    <Label>Parser Instructions</Label>
    <StyledTextArea
      rows={3}
      placeholder="Provide detailed instructions for extracting object properties..."
      value={formData.instructions || ""}
      onChange={(e) => handleFieldChange("instructions", e.target.value)}
    />
    <HelperText>Additional LLM guidance for complex extractions</HelperText>
  </FormSection>
  <FormSection>
    <Label>
      Limit Search to Label
      <Tooltip data-tooltip="Specify a label name to limit the search scope">
        <HelpCircle size={14} style={{ marginLeft: 4 }} />
      </Tooltip>
    </Label>
    <StyledInput
      placeholder="Enter label name"
      value={formData.limitToLabel || ""}
      onChange={(e) => handleFieldChange("limitToLabel", e.target.value)}
    />
    <HelperText><strong>Optional:</strong> Only search annotations with this label</HelperText>
  </FormSection>
</FormRow>
```

**Step 4: Delete section files**

```bash
rm src/components/widgets/modals/sections/ExtractionConfigSection.tsx
rm src/components/widgets/modals/sections/AdvancedOptionsSection.tsx
```

**Step 5: Verify TypeScript compiles and commit**

Run: `npx tsc --noEmit --project tsconfig.json`

```
git add -A
git commit -m "Inline ExtractionConfig + AdvancedOptions sections, replace SUI Popup with CSS tooltip"
```

---

### Task 4: Delete BasicConfigSection and styled.ts, clean up dead code

**Files:**

- Delete: `src/components/widgets/modals/sections/BasicConfigSection.tsx`
- Modify or Delete: `src/components/widgets/modals/styled.ts` (check for remaining consumers)

**Step 1: Check if styled.ts has other consumers**

```bash
grep -r "from.*modals/styled" src/ --include="*.tsx" --include="*.ts"
```

If only the deleted section files imported it, delete `styled.ts`. If other files import it, leave it and just note the remaining consumers.

**Step 2: Delete BasicConfigSection.tsx**

```bash
rm src/components/widgets/modals/sections/BasicConfigSection.tsx
```

**Step 3: Delete styled.ts if orphaned**

```bash
rm src/components/widgets/modals/styled.ts
```

**Step 4: Check if the sections/ directory is empty, remove it**

```bash
rmdir src/components/widgets/modals/sections/ 2>/dev/null || true
```

**Step 5: Verify TypeScript compiles and run tests**

```bash
npx tsc --noEmit --project tsconfig.json
yarn test:ct --reporter=list -g "Extracts|Extract"
```

**Step 6: Commit**

```
git add -A
git commit -m "Remove dead section components and shared styled.ts after inlining"
```

---

### Task 5: Final verification and single squash commit

**Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.json
```

**Step 2: Run related component tests**

```bash
yarn test:ct --reporter=list -g "Extract"
```

**Step 3: Run lint/prettier**

```bash
yarn run prettier --write src/components/widgets/modals/CreateColumnModal.tsx
yarn lint
```

**Step 4: Visual check (manual)**

Open the app, navigate to a corpus → Extracts tab → create extract → add fieldset → add column. Verify the modal matches CreateExtractModal's design language. Check:

- Gradient header/footer
- Smooth entrance animation
- Input focus states (blue ring)
- Radio buttons and checkbox styling
- Dropdown works for primitive type and task selection
- Custom model builder still works
- Cancel/Submit buttons match OS Legal style
- Tooltips appear on hover for HelpCircle icons
- Responsive 1-column layout at narrow widths
