/**
 * Shared styled components for CorpusHome views
 * Supports both landing (centered) and details (two-column/tabbed) layouts
 */

import styled from "styled-components";
import { motion } from "framer-motion";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_SHADOWS,
  CORPUS_TRANSITIONS,
  mediaQuery,
} from "../styles/corpusDesignTokens";

// ============================================================================
// SHARED CONTAINERS
// ============================================================================

/** Base container shared by both views */
export const BaseContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
  height: 100%;
  max-height: 100%;
  min-height: 0;
`;

// ============================================================================
// LANDING VIEW STYLES
// ============================================================================

/** Landing page container - centered content */
export const LandingContainer = styled(BaseContainer)`
  align-items: center;
`;

/** Centered content wrapper for landing view */
export const LandingContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 800px;
  padding: 2rem 1.5rem;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  ${mediaQuery.tablet} {
    padding: 1.25rem 1rem;
  }
`;

/** Hero section for landing view - centered header content */
export const LandingHero = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  padding: 2rem 1rem;
  width: 100%;

  ${mediaQuery.tablet} {
    padding: 1.25rem 0.75rem;
    gap: 0.75rem;
  }
`;

/** Centered breadcrumbs for landing view */
export const CenteredBreadcrumbs = styled.nav`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${CORPUS_COLORS.slate[500]};

  a {
    color: ${CORPUS_COLORS.slate[500]};
    text-decoration: none;
    transition: color ${CORPUS_TRANSITIONS.fast};

    &:hover {
      color: ${CORPUS_COLORS.teal[700]};
    }
  }

  svg {
    width: 14px;
    height: 14px;
    color: ${CORPUS_COLORS.slate[300]};
  }

  .current {
    color: ${CORPUS_COLORS.slate[700]};
    font-weight: 500;
  }
`;

/** Corpus badge - teal background, uppercase */
export const CorpusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  border-radius: ${CORPUS_RADII.full};
  background: ${CORPUS_COLORS.teal[700]};
  color: ${CORPUS_COLORS.white};
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

/** Large serif title for landing view */
export const LandingTitle = styled.h1`
  margin: 0;
  font-family: ${CORPUS_FONTS.serif};
  font-size: 2.75rem;
  font-weight: 400;
  color: ${CORPUS_COLORS.slate[800]};
  letter-spacing: -0.02em;
  line-height: 1.15;
  text-align: center;

  ${mediaQuery.tablet} {
    font-size: 1.875rem;
  }
`;

/** Description subtitle under the title - elegant typography */
export const LandingDescription = styled.p`
  margin: 0;
  margin-top: 1rem;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 1.125rem;
  font-weight: 400;
  color: ${CORPUS_COLORS.slate[500]};
  line-height: 1.65;
  text-align: center;
  max-width: 600px;

  ${mediaQuery.tablet} {
    font-size: 1rem;
    margin-top: 0.75rem;
  }
`;

/** No description placeholder with action */
export const NoDescriptionContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
`;

export const NoDescriptionText = styled.span`
  font-size: 0.9375rem;
  color: ${CORPUS_COLORS.slate[400]};
  font-style: italic;
`;

export const AddDescriptionLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  background: none;
  border: none;
  color: ${CORPUS_COLORS.teal[700]};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  &:hover {
    color: ${CORPUS_COLORS.teal[600]};
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 2px;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

/** Centered metadata row for landing view */
export const CenteredMetadataRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;

  ${mediaQuery.tablet} {
    gap: 0.75rem;
  }
`;

/** Metadata item with icon */
export const MetadataItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: ${CORPUS_COLORS.slate[500]};

  svg {
    width: 14px;
    height: 14px;
    color: ${CORPUS_COLORS.slate[400]};
  }

  ${mediaQuery.tablet} {
    font-size: 0.75rem;

    svg {
      width: 12px;
      height: 12px;
    }
  }
`;

/** Metadata separator */
export const MetadataSeparator = styled.div`
  width: 1px;
  height: 16px;
  background: ${CORPUS_COLORS.slate[200]};

  ${mediaQuery.tablet} {
    height: 12px;
  }
`;

/** Access badge (Public/Private) */
export const AccessBadge = styled.div<{ $isPublic?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: ${CORPUS_RADII.sm};
  font-size: 0.75rem;
  font-weight: 500;
  background: ${(props) =>
    props.$isPublic ? CORPUS_COLORS.teal[50] : "#fef3c7"};
  color: ${(props) => (props.$isPublic ? CORPUS_COLORS.teal[700] : "#92400e")};

  svg {
    width: 12px;
    height: 12px;
  }
`;

/** Chat section wrapper for landing view */
export const ChatSection = styled.div`
  width: 100%;
  max-width: 600px;
  margin-top: 1.5rem;

  ${mediaQuery.tablet} {
    margin-top: 1rem;
  }
`;

/** About card wrapper for landing view - simpler styling */
export const LandingAboutCard = styled(motion.div)`
  background: ${CORPUS_COLORS.white};
  border-radius: ${CORPUS_RADII.lg};
  box-shadow: ${CORPUS_SHADOWS.card};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  width: 100%;
  margin-top: 2rem;
  overflow: hidden;

  ${mediaQuery.tablet} {
    margin-top: 1.5rem;
  }
`;

/** View Details button */
export const ViewDetailsButton = styled(motion.button)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  margin-top: 2rem;
  background: ${CORPUS_COLORS.white};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.md};
  color: ${CORPUS_COLORS.teal[700]};
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  svg {
    width: 18px;
    height: 18px;
    transition: transform ${CORPUS_TRANSITIONS.fast};
  }

  &:hover {
    background: ${CORPUS_COLORS.teal[50]};
    border-color: ${CORPUS_COLORS.teal[200]};

    svg {
      transform: translateX(4px);
    }
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 2px;
  }

  ${mediaQuery.tablet} {
    margin-top: 1.5rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
  }
`;

// ============================================================================
// DETAILS VIEW STYLES - Minimalist Typography-First Design
// ============================================================================

/** Details view container - subtle background with padding for floating page effect */
export const DetailsContainer = styled(BaseContainer)`
  background: ${CORPUS_COLORS.slate[100]};
  padding: 1.5rem;

  ${mediaQuery.tablet} {
    padding: 0;
    background: ${CORPUS_COLORS.white};
  }
`;

/** Unified page wrapper - contains header + content, max-width constrained */
export const DetailsPage = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1200px;
  height: 100%;
  min-height: 0; /* Allow flex shrinking */
  margin: 0 auto;
  background: ${CORPUS_COLORS.white};
  border-radius: ${CORPUS_RADII.lg};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05),
    0 0 0 1px ${CORPUS_COLORS.slate[200]};
  overflow: hidden; /* Contain children */

  ${mediaQuery.tablet} {
    max-width: 100%;
    border-radius: 0;
    box-shadow: none;
  }
`;

/** Header section for details view */
export const DetailsHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 2rem 2.5rem 1.5rem;
  border-bottom: 1px solid ${CORPUS_COLORS.slate[100]};
  flex-shrink: 0;

  ${mediaQuery.tablet} {
    padding: 1.5rem 1.25rem 1.25rem;
  }
`;

/** Back button - minimal, text-like */
export const BackButton = styled(motion.button)`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  margin-bottom: 1rem;
  background: transparent;
  border: none;
  color: ${CORPUS_COLORS.slate[400]};
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color ${CORPUS_TRANSITIONS.fast};
  align-self: flex-start;

  svg {
    width: 14px;
    height: 14px;
    transition: transform ${CORPUS_TRANSITIONS.fast};
  }

  &:hover {
    color: ${CORPUS_COLORS.teal[700]};

    svg {
      transform: translateX(-3px);
    }
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 4px;
  }

  ${mediaQuery.tablet} {
    margin-bottom: 0.75rem;
  }
`;

/** Title row for details header */
export const DetailsTitleRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

/** Title section for details header */
export const DetailsTitleSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

/** Title for details view - bold typography */
export const DetailsTitle = styled.h1`
  margin: 0;
  font-family: ${CORPUS_FONTS.serif};
  font-size: 2.25rem;
  font-weight: 400;
  color: ${CORPUS_COLORS.slate[900]};
  letter-spacing: -0.025em;
  line-height: 1.2;

  ${mediaQuery.tablet} {
    font-size: 1.75rem;
  }
`;

/** Main content area - fills remaining space */
export const DetailsMainContent = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  min-height: 0;
`;

/** Two-column layout - Documents sidebar + About main content */
export const TwoColumnLayout = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0; /* Allow flex shrinking */

  ${mediaQuery.tablet} {
    display: none;
  }
`;

/** Documents sidebar - percentage-based with bounds */
export const DocumentsSidebar = styled.div`
  width: 40%;
  min-width: 320px;
  max-width: 480px;
  border-right: 1px solid ${CORPUS_COLORS.slate[200]};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0; /* Allow flex shrinking */
`;

/** Sidebar header - minimal label, aligned with content */
export const SidebarLabel = styled.div`
  padding: 1.5rem 1.5rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
`;

/** Section label - uppercase, readable, muted */
export const SectionLabel = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${CORPUS_COLORS.slate[400]};
`;

/** Sidebar content - scrollable document list */
export const SidebarContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 0.5rem 1rem;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${CORPUS_COLORS.slate[200]};
    border-radius: 3px;

    &:hover {
      background: ${CORPUS_COLORS.slate[300]};
    }
  }
`;

/** About main content area */
export const AboutMainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0; /* Allow flex shrinking */
`;

/** About header - label + actions */
export const AboutHeader = styled.div`
  padding: 1.5rem 2.5rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
`;

/** About actions - inline, minimal */
export const AboutActions = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

/** Text button - minimal, link-like */
export const TextButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0;
  background: transparent;
  border: none;
  color: ${CORPUS_COLORS.slate[400]};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: color ${CORPUS_TRANSITIONS.fast};

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    color: ${CORPUS_COLORS.teal[700]};
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 4px;
  }
`;

/** Primary text button */
export const TextButtonPrimary = styled(TextButton)`
  color: ${CORPUS_COLORS.teal[700]};

  &:hover {
    color: ${CORPUS_COLORS.teal[600]};
  }
`;

/** About body - scrollable content, fills available width */
export const AboutBody = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 2.5rem 2rem;

  /* Typography for readable prose - human-sized for desktop */
  font-size: 1.3125rem;
  line-height: 1.9;
  color: ${CORPUS_COLORS.slate[600]};

  /* Paragraph spacing */
  p {
    margin-bottom: 1.5em;
    /* Optimal reading width per paragraph */
    max-width: 60ch;
  }

  /* First paragraph - lead-in */
  p:first-of-type {
    font-size: 1.4375rem;
    color: ${CORPUS_COLORS.slate[700]};
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${CORPUS_COLORS.slate[200]};
    border-radius: 3px;

    &:hover {
      background: ${CORPUS_COLORS.slate[300]};
    }
  }
`;

/** Expand button - minimal */
export const ExpandButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  background: transparent;
  border: none;
  color: ${CORPUS_COLORS.slate[400]};
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: color ${CORPUS_TRANSITIONS.fast};

  svg {
    width: 12px;
    height: 12px;
  }

  &:hover {
    color: ${CORPUS_COLORS.teal[700]};
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 4px;
  }
`;

// Keep old exports for backwards compatibility but mark as deprecated
/** @deprecated Use DocumentsSidebar instead */
export const ColumnWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
`;

/** @deprecated Use SidebarLabel/AboutHeader instead */
export const ColumnHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  flex-shrink: 0;
`;

/** @deprecated Use SectionLabel instead */
export const ColumnTitle = styled.h2`
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${CORPUS_COLORS.slate[400]};
`;

/** @deprecated Use AboutActions instead */
export const ColumnActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

/** @deprecated Use TextButton instead */
export const ColumnActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0;
  border: none;
  background: transparent;
  color: ${CORPUS_COLORS.slate[400]};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: color ${CORPUS_TRANSITIONS.fast};

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    color: ${CORPUS_COLORS.teal[700]};
  }
`;

/** @deprecated Use TextButtonPrimary instead */
export const ColumnActionButtonPrimary = styled(ColumnActionButton)`
  color: ${CORPUS_COLORS.teal[700]};

  &:hover {
    color: ${CORPUS_COLORS.teal[600]};
  }
`;

/** @deprecated Use SidebarContent/AboutBody instead */
export const ColumnContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
`;

/** @deprecated No longer used */
export const ColumnCard = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
`;

// ============================================================================
// MOBILE TAB STYLES
// ============================================================================

/** Mobile tab container - only visible on mobile */
export const MobileTabContainer = styled.div`
  display: none;

  ${mediaQuery.tablet} {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
`;

/** Mobile tab list */
export const MobileTabList = styled.div`
  display: flex;
  background: ${CORPUS_COLORS.white};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.lg} ${CORPUS_RADII.lg} 0 0;
  overflow: hidden;
  flex-shrink: 0;
`;

/** Mobile tab button */
export const MobileTab = styled.button<{ $active: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  border: none;
  background: ${(props) =>
    props.$active ? CORPUS_COLORS.white : CORPUS_COLORS.slate[50]};
  color: ${(props) =>
    props.$active ? CORPUS_COLORS.teal[700] : CORPUS_COLORS.slate[600]};
  font-size: 0.875rem;
  font-weight: ${(props) => (props.$active ? "600" : "500")};
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};
  position: relative;

  ${(props) =>
    props.$active &&
    `
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: ${CORPUS_COLORS.teal[700]};
    }
  `}

  &:hover {
    background: ${(props) =>
      props.$active ? CORPUS_COLORS.white : CORPUS_COLORS.slate[100]};
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: -2px;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  &:not(:last-child) {
    border-right: 1px solid ${CORPUS_COLORS.slate[200]};
  }
`;

/** Mobile tab content */
export const MobileTabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: ${CORPUS_COLORS.white};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-top: none;
  border-radius: 0 0 ${CORPUS_RADII.lg} ${CORPUS_RADII.lg};
  min-height: 0;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: ${CORPUS_COLORS.slate[50]};
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${CORPUS_COLORS.slate[200]};
    border-radius: 4px;

    &:hover {
      background: ${CORPUS_COLORS.slate[300]};
    }
  }
`;

// ============================================================================
// HEADER ROW (breadcrumb / back-button + mobile menu)
// ============================================================================

/** Flex row that holds breadcrumbs (or a back button) and the mobile menu
 *  button side-by-side, keeping the menu button outside the <nav> landmark. */
export const HeaderRow = styled.div<{ $justify?: string }>`
  display: flex;
  align-items: center;
  justify-content: ${(props) => props.$justify || "space-between"};
  width: 100%;
`;

// ============================================================================
// MOBILE MENU BUTTON
// ============================================================================

/** Mobile-only menu button for opening the sidebar on the home tab.
 *  Uses the same kebab-menu pattern as other tab headers for consistency. */
export const MobileMenuButton = styled.button`
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: ${CORPUS_COLORS.white};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.md};
  color: ${CORPUS_COLORS.slate[500]};
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};
  flex-shrink: 0;

  &:hover {
    background: ${CORPUS_COLORS.teal[50]};
    border-color: ${CORPUS_COLORS.teal[200]};
    color: ${CORPUS_COLORS.teal[700]};
  }

  &:active {
    transform: scale(0.95);
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 2px;
  }

  svg {
    width: 20px;
    height: 20px;
  }

  ${mediaQuery.mobile} {
    display: flex;
  }
`;

// ============================================================================
// EXPAND TOGGLE BUTTON
// ============================================================================

/** Expand/Collapse all toggle button */
export const ExpandToggleButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.sm};
  background: ${CORPUS_COLORS.white};
  color: ${CORPUS_COLORS.slate[600]};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: ${CORPUS_COLORS.slate[50]};
    border-color: ${CORPUS_COLORS.teal[200]};
    color: ${CORPUS_COLORS.teal[700]};
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 2px;
  }
`;
