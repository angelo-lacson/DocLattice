import styled from "styled-components";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";

/**
 * Card-like segment with plain white background.
 * Use for admin panels, tables, and general content containers.
 */
export const CardSegment = styled.div`
  padding: 1rem;
  border-radius: 12px;
  background: white;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

/**
 * Card-like segment with subtle gradient background.
 * Use for feature cards, leaderboards, and badge displays.
 */
export const GradientSegment = styled.div`
  padding: 1rem;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    #ffffff 0%,
    ${OS_LEGAL_COLORS.surfaceHover} 100%
  );
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;
