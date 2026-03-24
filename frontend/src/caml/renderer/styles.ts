/**
 * Styled components for the CAML article renderer.
 *
 * Color tokens are sourced from OS_LEGAL_COLORS where they match
 * the design system, with CAML-specific tokens defined locally
 * for article-specific color needs (e.g., dark backgrounds, prose text).
 */
import styled, { css } from "styled-components";

import {
  OS_LEGAL_COLORS,
  OS_LEGAL_TYPOGRAPHY,
  accentAlpha,
} from "../../assets/configurations/osLegalStyles";

// ---------------------------------------------------------------------------
// CAML-specific color tokens (supplement OS_LEGAL_COLORS for article styles)
// ---------------------------------------------------------------------------

/** Deep dark slate — article headings and dark-mode backgrounds. */
const CAML_HEADING = "#0f172a";
/** Prose body text — slightly lighter than textPrimary for readability. */
const CAML_PROSE_TEXT = "#334155";
/** Dark-mode prose text — light gray for readability on dark backgrounds. */
const CAML_DARK_PROSE = "#cbd5e1";

// ---------------------------------------------------------------------------
// Article shell
// ---------------------------------------------------------------------------

export const ArticleContainer = styled.article`
  width: 100%;
  min-height: 100vh;
  color: ${OS_LEGAL_COLORS.textPrimary};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  line-height: 1.7;
  font-size: 1.0625rem;
  overflow-x: hidden;
`;

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export const HeroSection = styled.header`
  text-align: center;
  padding: 4rem 1.5rem 3rem;
  max-width: 800px;
  margin: 0 auto;
`;

export const HeroKicker = styled.p`
  font-size: 0.8125rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${OS_LEGAL_COLORS.textSecondary};
  margin-bottom: 1.5rem;
  font-weight: 500;
`;

export const HeroTitle = styled.h1`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 1.5rem;
  color: ${CAML_HEADING};
`;

export const HeroAccent = styled.span`
  color: ${OS_LEGAL_COLORS.accent};
`;

export const HeroSubtitle = styled.p`
  font-size: 1.1875rem;
  color: ${OS_LEGAL_COLORS.textTertiary};
  max-width: 640px;
  margin: 0 auto 2rem;
  line-height: 1.6;
`;

export const HeroStats = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
`;

export const HeroStat = styled.span`
  display: inline-flex;
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  color: ${OS_LEGAL_COLORS.textTertiary};
`;

// ---------------------------------------------------------------------------
// Chapter
// ---------------------------------------------------------------------------

export const ChapterSection = styled.section<{
  $theme?: "light" | "dark";
  $gradient?: boolean;
  $centered?: boolean;
}>`
  padding: 4rem 1.5rem;
  max-width: 800px;
  margin: 0 auto;

  ${({ $centered }) =>
    $centered &&
    css`
      text-align: center;
    `}

  ${({ $theme }) =>
    $theme === "dark" &&
    css`
      background: ${CAML_HEADING};
      color: ${OS_LEGAL_COLORS.border};
      max-width: 100%;
      padding-left: calc((100% - 800px) / 2 + 1.5rem);
      padding-right: calc((100% - 800px) / 2 + 1.5rem);
    `}

  ${({ $gradient }) =>
    $gradient &&
    css`
      background: linear-gradient(
        135deg,
        ${CAML_HEADING} 0%,
        ${OS_LEGAL_COLORS.textPrimary} 100%
      );
      color: ${OS_LEGAL_COLORS.border};
      max-width: 100%;
      padding-left: calc((100% - 800px) / 2 + 1.5rem);
      padding-right: calc((100% - 800px) / 2 + 1.5rem);
    `}
`;

export const ChapterKicker = styled.p<{ $dark?: boolean }>`
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $dark }) =>
    $dark ? OS_LEGAL_COLORS.textMuted : OS_LEGAL_COLORS.textSecondary};
  margin-bottom: 0.75rem;
  font-weight: 600;
`;

export const ChapterTitle = styled.h2<{ $dark?: boolean }>`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 1.5rem;
  color: ${({ $dark }) =>
    $dark ? OS_LEGAL_COLORS.surfaceLight : CAML_HEADING};
`;

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

export const ProseContainer = styled.div<{ $dark?: boolean }>`
  margin-bottom: 1.5rem;

  p {
    margin-bottom: 1rem;
    color: ${({ $dark }) => ($dark ? CAML_DARK_PROSE : CAML_PROSE_TEXT)};
  }

  strong {
    font-weight: 600;
  }

  a {
    color: ${OS_LEGAL_COLORS.accent};
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  code {
    background: ${({ $dark }) =>
      $dark ? OS_LEGAL_COLORS.textPrimary : OS_LEGAL_COLORS.surfaceLight};
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.9em;
  }
`;

export const Pullquote = styled.blockquote`
  border-left: 4px solid ${OS_LEGAL_COLORS.accent};
  padding: 1rem 1.5rem;
  margin: 2rem 0;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  font-size: 1.1875rem;
  font-style: italic;
  color: ${OS_LEGAL_COLORS.textPrimary};
  background: ${accentAlpha(0.04)};
  border-radius: 0 8px 8px 0;
`;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export const CardsGrid = styled.div<{ $columns?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns || 2}, 1fr);
  gap: 1rem;
  margin: 1.5rem 0;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

export const CardItem = styled.div<{ $accent?: string }>`
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 10px;
  padding: 1.25rem;
  border-left: 4px solid ${({ $accent }) => $accent || OS_LEGAL_COLORS.border};
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }
`;

export const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
`;

export const CardLabel = styled.h3`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${CAML_HEADING};
  margin: 0;
`;

export const CardMeta = styled.span`
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-family: "SF Mono", Monaco, monospace;
  white-space: nowrap;
`;

export const CardBody = styled.p`
  font-size: 0.875rem;
  color: ${OS_LEGAL_COLORS.textTertiary};
  margin: 0.5rem 0;
  line-height: 1.5;
`;

export const CardFooter = styled.div`
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid ${OS_LEGAL_COLORS.surfaceLight};
`;

// ---------------------------------------------------------------------------
// Pills
// ---------------------------------------------------------------------------

export const PillsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1.5rem 0;
`;

export const PillCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 10px;
  padding: 1rem 1.25rem;
  flex: 1 1 200px;
  min-width: 200px;
`;

export const PillBigText = styled.span`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${CAML_HEADING};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  line-height: 1;
`;

export const PillInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
`;

export const PillLabel = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${CAML_HEADING};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const PillDetail = styled.span`
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
`;

export const PillStatus = styled.span<{ $color?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: ${({ $color }) => $color || OS_LEGAL_COLORS.textSecondary};

  &::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $color }) => $color || OS_LEGAL_COLORS.textSecondary};
  }
`;

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const TabsContainer = styled.div`
  margin: 2rem 0;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 12px;
  overflow: hidden;
  background: ${OS_LEGAL_COLORS.surface};
`;

export const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

export const TabButton = styled.button<{ $active?: boolean; $color?: string }>`
  padding: 0.75rem 1.25rem;
  border: none;
  background: ${({ $active }) =>
    $active ? OS_LEGAL_COLORS.surface : OS_LEGAL_COLORS.surfaceHover};
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ $active, $color }) =>
    $active ? $color || OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid
    ${({ $active, $color }) =>
      $active ? $color || OS_LEGAL_COLORS.accent : "transparent"};
  transition: all 0.15s;

  &:hover {
    background: ${OS_LEGAL_COLORS.surface};
    color: ${({ $color }) => $color || OS_LEGAL_COLORS.accent};
  }
`;

export const TabStatus = styled.span<{ $color?: string }>`
  display: inline-block;
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  margin-left: 0.5rem;
  background: ${({ $color }) =>
    $color ? `${$color}15` : OS_LEGAL_COLORS.surfaceLight};
  color: ${({ $color }) => $color || OS_LEGAL_COLORS.textSecondary};
  font-weight: 500;
`;

export const TabPanel = styled.div`
  padding: 1.5rem;
`;

export const TabSectionHeading = styled.h4<{
  $highlight?: boolean;
  $color?: string;
}>`
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
  margin-top: 1.25rem;
  color: ${({ $highlight, $color }) =>
    $highlight
      ? $color || OS_LEGAL_COLORS.accent
      : OS_LEGAL_COLORS.textTertiary};

  ${({ $highlight, $color }) =>
    $highlight &&
    css`
      background: ${$color ? `${$color}08` : accentAlpha(0.04)};
      padding: 0.75rem 1rem;
      border-radius: 8px;
      border-left: 3px solid ${$color || OS_LEGAL_COLORS.accent};
      margin-left: -1rem;
      margin-right: -1rem;
    `}

  &:first-child {
    margin-top: 0;
  }
`;

export const TabSectionContent = styled.div`
  font-size: 0.9375rem;
  color: ${CAML_PROSE_TEXT};
  line-height: 1.65;
  margin-bottom: 0.75rem;
`;

export const TabSources = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid ${OS_LEGAL_COLORS.surfaceLight};
`;

export const TabSourceChip = styled.span`
  display: inline-flex;
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 500;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  color: ${OS_LEGAL_COLORS.textTertiary};
  white-space: nowrap;
`;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const TimelineContainer = styled.div`
  margin: 2rem 0;
  position: relative;
  padding-left: 2rem;

  &::before {
    content: "";
    position: absolute;
    left: 7px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: ${OS_LEGAL_COLORS.border};
  }
`;

export const TimelineLegend = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-left: 0;
  position: relative;
`;

export const TimelineLegendItem = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textSecondary};

  &::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
  }
`;

export const TimelineEntry = styled.div`
  position: relative;
  padding-bottom: 1.25rem;
  padding-left: 0.75rem;
`;

export const TimelineDot = styled.span<{ $color?: string }>`
  position: absolute;
  left: -2rem;
  top: 0.4rem;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ $color }) => $color || OS_LEGAL_COLORS.textMuted};
  border: 2px solid ${OS_LEGAL_COLORS.surface};
  box-shadow: 0 0 0 2px
    ${({ $color }) => ($color ? `${$color}30` : OS_LEGAL_COLORS.border)};
`;

export const TimelineDate = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.025em;
`;

export const TimelineLabel = styled.p`
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textPrimary};
  margin: 0.125rem 0 0;
`;

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

export const CtaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin: 2rem 0;
`;

export const CtaButton = styled.a<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
  cursor: pointer;

  ${({ $primary }) =>
    $primary
      ? css`
          background: ${OS_LEGAL_COLORS.accent};
          color: ${OS_LEGAL_COLORS.surface};
          border: 2px solid ${OS_LEGAL_COLORS.accent};

          &:hover {
            background: ${OS_LEGAL_COLORS.accentHover};
            border-color: ${OS_LEGAL_COLORS.accentHover};
            transform: translateY(-1px);
            box-shadow: 0 4px 12px ${accentAlpha(0.3)};
          }
        `
      : css`
          background: transparent;
          color: ${OS_LEGAL_COLORS.accent};
          border: 2px solid ${OS_LEGAL_COLORS.accent};

          &:hover {
            background: ${accentAlpha(0.05)};
            transform: translateY(-1px);
          }
        `}
`;

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export const SignupBox = styled.div`
  text-align: center;
  padding: 2.5rem 1.5rem;
  margin: 2rem 0;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 12px;
  background: ${OS_LEGAL_COLORS.surfaceHover};
`;

export const SignupTitle = styled.h3`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  font-size: 1.25rem;
  font-weight: 700;
  color: ${CAML_HEADING};
  margin-bottom: 0.75rem;
`;

export const SignupBody = styled.p`
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textTertiary};
  max-width: 480px;
  margin: 0 auto 1.5rem;
`;

export const SignupButton = styled.button`
  padding: 0.625rem 1.5rem;
  border-radius: 8px;
  background: ${OS_LEGAL_COLORS.accent};
  color: ${OS_LEGAL_COLORS.surface};
  border: none;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${OS_LEGAL_COLORS.accentHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export const FooterSection = styled.footer`
  padding: 3rem 1.5rem;
  border-top: 1px solid ${OS_LEGAL_COLORS.border};
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
`;

export const FooterNav = styled.nav`
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 1rem;
`;

export const FooterLink = styled.a`
  font-size: 0.875rem;
  color: ${OS_LEGAL_COLORS.accent};
  text-decoration: none;
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
`;

export const FooterNotice = styled.p`
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textMuted};
`;

// ---------------------------------------------------------------------------
// Corpus Stats
// ---------------------------------------------------------------------------

export const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
`;

export const StatCard = styled.div`
  text-align: center;
  padding: 1rem;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border-radius: 8px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
`;

export const StatValue = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${OS_LEGAL_COLORS.accent};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
`;

export const StatLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
`;
