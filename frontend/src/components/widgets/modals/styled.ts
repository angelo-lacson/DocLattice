import styled from "styled-components";
import { Form } from "semantic-ui-react";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

export const FormSection = styled.div`
  margin-bottom: 2rem;
  width: 100%;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const SectionTitle = styled.h3`
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
`;

export const StyledFormField = styled(Form.Field)`
  margin-bottom: 1rem !important;

  label {
    margin-bottom: 0.5rem !important;
    font-weight: 500 !important;
    color: #34495e !important;
  }
`;

export const StyledInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 6px;
  font-size: 1rem;
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;

  &:focus {
    border-color: ${OS_LEGAL_COLORS.primaryBlue};
    box-shadow: 0 0 0 1px ${OS_LEGAL_COLORS.primaryBlue};
  }
`;

export const TaskSelectorWrapper = styled.div`
  .ui.dropdown {
    max-width: 100%;
    word-wrap: break-word;
    white-space: normal;

    .text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .menu > .item {
      word-wrap: break-word;
      white-space: normal;
      padding: 0.5rem 1rem !important;
    }
  }
`;

export const StyledCheckbox = styled.input.attrs({ type: "checkbox" })`
  margin-bottom: 1rem;
  cursor: pointer;
`;

export const StyledTextArea = styled.textarea`
  min-height: 100px;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;

  &:focus {
    border-color: ${OS_LEGAL_COLORS.primaryBlue};
    box-shadow: 0 0 0 1px ${OS_LEGAL_COLORS.primaryBlue};
  }
`;
