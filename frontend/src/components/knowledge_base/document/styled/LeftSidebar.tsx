import { Button, Segment } from "semantic-ui-react";
import styled, { css } from "styled-components";
import { OS_LEGAL_COLORS } from "../../../../assets/configurations/osLegalStyles";

const iconColorMap: Record<string, string> = {
  summary: "#0891b2", // Cyan
  chat: "#7c3aed", // Violet
  notes: OS_LEGAL_COLORS.folderIcon, // Amber
  document: OS_LEGAL_COLORS.greenMedium, // Emerald
  relationships: OS_LEGAL_COLORS.primaryBlue, // Blue
  annotations: "#ec4899", // Pink
  relations: "#8b5cf6", // Purple
  analyses: "#06b6d4", // Light Blue
  extracts: "#f97316", // Orange
  search: "#6366f1", // Indigo
  default: OS_LEGAL_COLORS.textSecondary, // Slate
};

export const TabsColumn = styled(Segment)<{ collapsed: boolean }>`
  &&& {
    margin: 0 !important;
    padding: 0.75rem 0 !important;
    border: none !important;
    border-right: 1px solid rgba(231, 234, 237, 0.7) !important;
    border-radius: 0 !important;
    background: rgba(250, 251, 252, 0.97) !important;
    backdrop-filter: blur(10px);
    width: ${(props) => (props.collapsed ? "72px" : "280px")};
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
    z-index: 90;
    box-shadow: 1px 0 2px rgba(0, 0, 0, 0.02);

    /* Subtle gradient background */
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.97) 0%,
      rgba(249, 250, 251, 0.97) 100%
    ) !important;

    /* Mobile optimization */
    @media (max-width: 768px) {
      width: 100%;
      height: 56px;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      white-space: nowrap;
      padding: 0.5rem !important;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(231, 234, 237, 0.7) !important;

      /* Hide scrollbar but keep functionality */
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }

      /* Center icons when in mobile mode */
      display: flex;
      justify-content: space-around;
      align-items: center;
    }
  }
`;

interface TabButtonProps {
  $collapsed: boolean;
  $tabKey: string;
  $active?: boolean;
}

export const TabButton = styled(Button)<TabButtonProps>`
  &&& {
    width: 100%;
    text-align: ${(props) => (props.$collapsed ? "center" : "left")} !important;
    border-radius: 0 !important;
    margin: 0.25rem 0 !important;
    padding: ${(props) =>
      props.$collapsed ? "1.25rem 0.75rem" : "1.25rem 2rem"} !important;
    background: transparent !important;
    border: none !important;
    position: relative;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    /* Increased icon sizes in both states */
    svg {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      width: ${(props) => (props.$collapsed ? "22px" : "28px")};
      height: ${(props) => (props.$collapsed ? "22px" : "28px")};
      color: ${(props) => iconColorMap[props.$tabKey] || iconColorMap.default};
      opacity: ${(props) => (props.$active ? 1 : 0.75)};
      flex-shrink: 0; /* Prevent icon from shrinking */
    }

    /* Improved text styling */
    span {
      font-size: 1rem; /* Slightly larger font */
      font-weight: 500;
      white-space: nowrap;
      opacity: ${(props) => (props.$collapsed ? 0 : 1)};
      transition: opacity 0.2s ease-in-out;
      color: ${(props) =>
        props.$active
          ? iconColorMap[props.$tabKey] || iconColorMap.default
          : OS_LEGAL_COLORS.textSecondary};
      margin-left: 1rem; /* Increased spacing between icon and text */
    }

    /* Active state */
    ${(props) =>
      props.$active &&
      css`
        background: ${`${iconColorMap[props.$tabKey]}10`} !important;
        &::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: ${iconColorMap[props.$tabKey] || iconColorMap.default};
          border-radius: 0 2px 2px 0;
        }
      `}

    /* Hover effects */
    &:hover {
      background: ${(props) =>
        props.$active
          ? `${iconColorMap[props.$tabKey]}15`
          : "rgba(0, 0, 0, 0.03)"} !important;

      svg {
        transform: ${(props) =>
          props.$collapsed ? "scale(1.2)" : "translateX(2px)"};
        opacity: 1;
      }
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
      padding: 0.75rem !important;
      margin: 0 0.25rem !important;
      border-radius: 8px !important;

      svg {
        width: 20px;
        height: 20px;
      }

      &:hover {
        transform: translateY(-2px);
      }
    }
  }
`;

export const TabTooltip = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;

  /* Only show on mobile */
  @media (min-width: 769px) {
    display: none;
  }
`;
