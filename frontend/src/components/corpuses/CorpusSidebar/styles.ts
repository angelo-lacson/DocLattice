import styled from "styled-components";
import { motion } from "framer-motion";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_TRANSITIONS,
  CORPUS_BREAKPOINTS,
} from "../styles/corpusDesignTokens";

// Main sidebar container
export const SidebarContainer = styled(motion.div)<{ $isExpanded: boolean }>`
  position: relative;
  width: ${(props) => (props.$isExpanded ? "280px" : "72px")};
  background: ${CORPUS_COLORS.white};
  border-right: 1px solid ${CORPUS_COLORS.slate[200]};
  z-index: 100;
  transition: width ${CORPUS_TRANSITIONS.normal};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  height: 100%;

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    position: fixed;
    left: 50%;
    bottom: 0;
    width: 100%;
    max-width: min(480px, 95vw);
    height: ${(props) => (props.$isExpanded ? "70vh" : "0")};
    max-height: min(600px, 70vh);
    border-right: none;
    border-top: 1px solid ${CORPUS_COLORS.slate[200]};
    border-radius: ${CORPUS_RADII.xl} ${CORPUS_RADII.xl} 0 0;
    box-shadow: ${(props) =>
      props.$isExpanded ? "0 -8px 32px rgba(0, 0, 0, 0.12)" : "none"};
    transform: translate(
      -50%,
      ${(props) => (props.$isExpanded ? "0" : "100%")}
    );
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
      height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 200;
  }
`;

// Mobile bottom sheet handle
export const BottomSheetHandle = styled.div`
  display: none;

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    display: flex;
    justify-content: center;
    padding: 0.75rem 0;
    cursor: grab;

    &::after {
      content: "";
      width: 40px;
      height: 4px;
      background: ${CORPUS_COLORS.slate[300]};
      border-radius: 2px;
      transition: background ${CORPUS_TRANSITIONS.fast};
    }

    &:active {
      cursor: grabbing;

      &::after {
        background: ${CORPUS_COLORS.slate[400]};
      }
    }
  }
`;

// Header section with corpus info
export const HeaderSection = styled.div<{ $isExpanded: boolean }>`
  padding: ${(props) => (props.$isExpanded ? "1.5rem" : "1rem")};
  border-bottom: 1px solid ${CORPUS_COLORS.slate[100]};
  background: ${CORPUS_COLORS.slate[50]};
  display: flex;
  flex-direction: column;
  align-items: ${(props) => (props.$isExpanded ? "flex-start" : "center")};
  gap: 0.75rem;
  flex-shrink: 0;

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    padding: 1rem 1.5rem;
    flex-direction: row;
    align-items: center;
  }
`;

export const AvatarWrapper = styled.div<{ $size?: "sm" | "md" | "lg" }>`
  width: ${(props) =>
    props.$size === "sm" ? "32px" : props.$size === "lg" ? "56px" : "44px"};
  height: ${(props) =>
    props.$size === "sm" ? "32px" : props.$size === "lg" ? "56px" : "44px"};
  border-radius: ${CORPUS_RADII.md};
  background: linear-gradient(
    135deg,
    ${CORPUS_COLORS.teal[600]} 0%,
    ${CORPUS_COLORS.teal[700]} 100%
  );
  color: ${CORPUS_COLORS.white};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${CORPUS_FONTS.serif};
  font-size: ${(props) =>
    props.$size === "sm"
      ? "0.875rem"
      : props.$size === "lg"
      ? "1.5rem"
      : "1.125rem"};
  font-weight: 400;
  letter-spacing: -0.02em;
  flex-shrink: 0;
`;

export const HeaderInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
`;

export const CorpusTitle = styled.h2`
  margin: 0;
  font-family: ${CORPUS_FONTS.serif};
  font-size: 1rem;
  font-weight: 500;
  color: ${CORPUS_COLORS.slate[800]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const AccessChip = styled.span<{ $isPublic?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: ${CORPUS_RADII.full};
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: ${(props) =>
    props.$isPublic ? CORPUS_COLORS.teal[50] : "#fef3c7"};
  color: ${(props) => (props.$isPublic ? CORPUS_COLORS.teal[700] : "#92400e")};

  svg {
    width: 10px;
    height: 10px;
  }
`;

// Toggle button
export const ToggleButton = styled(motion.button)`
  width: 36px;
  height: 36px;
  border-radius: ${CORPUS_RADII.md};
  background: ${CORPUS_COLORS.white};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  color: ${CORPUS_COLORS.slate[500]};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};
  flex-shrink: 0;

  &:hover {
    background: ${CORPUS_COLORS.teal[50]};
    border-color: ${CORPUS_COLORS.teal[200]};
    color: ${CORPUS_COLORS.teal[700]};
  }

  svg {
    width: 18px;
    height: 18px;
    transition: transform ${CORPUS_TRANSITIONS.fast};
  }
`;

// Navigation sections
export const NavSection = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.75rem 0;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${CORPUS_COLORS.slate[200]};
    border-radius: 2px;

    &:hover {
      background: ${CORPUS_COLORS.slate[300]};
    }
  }
`;

export const NavGroup = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
`;

export const NavGroupLabel = styled.span<{ $isExpanded: boolean }>`
  display: ${(props) => (props.$isExpanded ? "block" : "none")};
  padding: 0.5rem 1.25rem 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${CORPUS_COLORS.slate[400]};

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    display: block;
    padding: 0.5rem 1.5rem 0.375rem;
  }
`;

export const NavItem = styled(motion.button)<{
  $isActive: boolean;
  $isExpanded: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: ${(props) =>
    props.$isExpanded ? "0.625rem 1.25rem" : "0.625rem 0"};
  justify-content: ${(props) => (props.$isExpanded ? "flex-start" : "center")};
  background: ${(props) =>
    props.$isActive ? CORPUS_COLORS.teal[50] : "transparent"};
  border: none;
  border-left: 3px solid
    ${(props) => (props.$isActive ? CORPUS_COLORS.teal[700] : "transparent")};
  color: ${(props) =>
    props.$isActive ? CORPUS_COLORS.teal[700] : CORPUS_COLORS.slate[600]};
  font-size: 0.875rem;
  font-weight: ${(props) => (props.$isActive ? 500 : 400)};
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};
  text-align: left;

  &:hover {
    background: ${(props) =>
      props.$isActive ? CORPUS_COLORS.teal[50] : CORPUS_COLORS.slate[50]};
    color: ${(props) =>
      props.$isActive ? CORPUS_COLORS.teal[700] : CORPUS_COLORS.slate[800]};
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    opacity: ${(props) => (props.$isActive ? 1 : 0.75)};
  }

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    padding: 0.75rem 1.5rem;
    justify-content: flex-start;
  }
`;

export const NavItemLabel = styled.span<{ $isExpanded: boolean }>`
  display: ${(props) => (props.$isExpanded ? "block" : "none")};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    display: block;
  }
`;

export const NavItemBadge = styled.span<{ $isExpanded: boolean }>`
  display: ${(props) => (props.$isExpanded ? "flex" : "none")};
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  border-radius: ${CORPUS_RADII.full};
  background: ${CORPUS_COLORS.slate[100]};
  color: ${CORPUS_COLORS.slate[600]};
  font-size: 0.75rem;
  font-weight: 500;
  min-width: 1.5rem;
  justify-content: center;

  @media (max-width: ${CORPUS_BREAKPOINTS.mobile}px) {
    display: flex;
  }
`;
