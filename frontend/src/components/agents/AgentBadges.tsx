import styled from "styled-components";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";

export const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 0.2em 0.6em;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 4px;
  background: ${(props) =>
    props.$active
      ? OS_LEGAL_COLORS.successSurface
      : OS_LEGAL_COLORS.warningSurface};
  color: ${(props) =>
    props.$active ? OS_LEGAL_COLORS.successText : OS_LEGAL_COLORS.warningText};
`;

export const ToolBadge = styled.span`
  display: inline-block;
  padding: 0.15em 0.4em;
  font-size: 0.75rem;
  background: #f1f5f9;
  color: ${OS_LEGAL_COLORS.textSecondary};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 4px;
`;

export const ToolsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;
