import React from "react";
import { Popup } from "semantic-ui-react";
import { HelpCircle } from "lucide-react";
import {
  FormSection,
  StyledFormField,
  StyledTextArea,
  StyledInput,
} from "../styled";
import { SectionTitle } from "../styled";

interface AdvancedOptionsSectionProps {
  instructions: string;
  limitToLabel: string;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: any,
    fieldName: string
  ) => void;
}

export const AdvancedOptionsSection: React.FC<AdvancedOptionsSectionProps> = ({
  instructions,
  limitToLabel,
  handleChange,
}) => {
  return (
    <FormSection>
      <SectionTitle>Advanced Options</SectionTitle>
      <div style={{ display: "grid", gap: "1rem" }}>
        <StyledFormField>
          <label>Parser Instructions</label>
          <StyledTextArea
            rows={3}
            name="instructions"
            placeholder="Provide detailed instructions for extracting object properties here..."
            value={instructions}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              handleChange(e, { value: e.target.value }, "instructions")
            }
          />
        </StyledFormField>
        <StyledFormField>
          <label>
            Limit Search to Label
            <Popup
              trigger={
                <HelpCircle
                  size={14}
                  style={{
                    marginLeft: 4,
                    verticalAlign: "middle",
                    cursor: "help",
                  }}
                />
              }
              content="Specify a label name to limit the search scope"
            />
          </label>
          <StyledInput
            placeholder="Enter label name"
            name="limitToLabel"
            value={limitToLabel}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange(e, { value: e.target.value }, "limitToLabel")
            }
          />
        </StyledFormField>
      </div>
    </FormSection>
  );
};
