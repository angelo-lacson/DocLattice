/**
 * Styled components for the CAML article renderer.
 */
import styled, { css } from "styled-components";

// ---------------------------------------------------------------------------
// Article shell
// ---------------------------------------------------------------------------

export const ArticleContainer = styled.article`
  width: 100%;
  min-height: 100vh;
  color: #1e293b;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
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
  color: #64748b;
  margin-bottom: 1.5rem;
  font-weight: 500;
`;

export const HeroTitle = styled.h1`
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 1.5rem;
  color: #0f172a;
`;

export const HeroAccent = styled.span`
  color: #0f766e;
`;

export const HeroSubtitle = styled.p`
  font-size: 1.1875rem;
  color: #475569;
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
  background: #f1f5f9;
  color: #475569;
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
      background: #0f172a;
      color: #e2e8f0;
      max-width: 100%;
      padding-left: calc((100% - 800px) / 2 + 1.5rem);
      padding-right: calc((100% - 800px) / 2 + 1.5rem);
    `}

  ${({ $gradient }) =>
    $gradient &&
    css`
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      max-width: 100%;
      padding-left: calc((100% - 800px) / 2 + 1.5rem);
      padding-right: calc((100% - 800px) / 2 + 1.5rem);
    `}
`;

export const ChapterKicker = styled.p<{ $dark?: boolean }>`
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ $dark }) => ($dark ? "#94a3b8" : "#64748b")};
  margin-bottom: 0.75rem;
  font-weight: 600;
`;

export const ChapterTitle = styled.h2<{ $dark?: boolean }>`
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 1.5rem;
  color: ${({ $dark }) => ($dark ? "#f1f5f9" : "#0f172a")};
`;

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

export const ProseContainer = styled.div<{ $dark?: boolean }>`
  margin-bottom: 1.5rem;

  p {
    margin-bottom: 1rem;
    color: ${({ $dark }) => ($dark ? "#cbd5e1" : "#334155")};
  }

  strong {
    font-weight: 600;
  }

  a {
    color: #0f766e;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  code {
    background: ${({ $dark }) => ($dark ? "#1e293b" : "#f1f5f9")};
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.9em;
  }
`;

export const Pullquote = styled.blockquote`
  border-left: 4px solid #0f766e;
  padding: 1rem 1.5rem;
  margin: 2rem 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.1875rem;
  font-style: italic;
  color: #1e293b;
  background: rgba(15, 118, 110, 0.04);
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.25rem;
  border-left: 4px solid ${({ $accent }) => $accent || "#e2e8f0"};
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
  color: #0f172a;
  margin: 0;
`;

export const CardMeta = styled.span`
  font-size: 0.75rem;
  color: #64748b;
  font-family: "SF Mono", Monaco, monospace;
  white-space: nowrap;
`;

export const CardBody = styled.p`
  font-size: 0.875rem;
  color: #475569;
  margin: 0.5rem 0;
  line-height: 1.5;
`;

export const CardFooter = styled.div`
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid #f1f5f9;
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem 1.25rem;
  flex: 1 1 200px;
  min-width: 200px;
`;

export const PillBigText = styled.span`
  font-size: 1.75rem;
  font-weight: 700;
  color: #0f172a;
  font-family: Georgia, "Times New Roman", serif;
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
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const PillDetail = styled.span`
  font-size: 0.75rem;
  color: #64748b;
`;

export const PillStatus = styled.span<{ $color?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: ${({ $color }) => $color || "#64748b"};

  &::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $color }) => $color || "#64748b"};
  }
`;

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export const TabsContainer = styled.div`
  margin: 2rem 0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
`;

export const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
`;

export const TabButton = styled.button<{ $active?: boolean; $color?: string }>`
  padding: 0.75rem 1.25rem;
  border: none;
  background: ${({ $active }) => ($active ? "#ffffff" : "#f8fafc")};
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ $active, $color }) =>
    $active ? $color || "#0f766e" : "#64748b"};
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid
    ${({ $active, $color }) => ($active ? $color || "#0f766e" : "transparent")};
  transition: all 0.15s;

  &:hover {
    background: #ffffff;
    color: ${({ $color }) => $color || "#0f766e"};
  }
`;

export const TabStatus = styled.span<{ $color?: string }>`
  display: inline-block;
  font-size: 0.6875rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  margin-left: 0.5rem;
  background: ${({ $color }) => ($color ? `${$color}15` : "#f1f5f9")};
  color: ${({ $color }) => $color || "#64748b"};
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
    $highlight ? $color || "#0f766e" : "#475569"};

  ${({ $highlight, $color }) =>
    $highlight &&
    css`
      background: ${$color ? `${$color}08` : "rgba(15, 118, 110, 0.04)"};
      padding: 0.75rem 1rem;
      border-radius: 8px;
      border-left: 3px solid ${$color || "#0f766e"};
      margin-left: -1rem;
      margin-right: -1rem;
    `}

  &:first-child {
    margin-top: 0;
  }
`;

export const TabSectionContent = styled.div`
  font-size: 0.9375rem;
  color: #334155;
  line-height: 1.65;
  margin-bottom: 0.75rem;
`;

export const TabSources = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
`;

export const TabSourceChip = styled.span`
  display: inline-flex;
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 500;
  background: #f1f5f9;
  color: #475569;
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
    background: #e2e8f0;
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
  color: #64748b;

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
  background: ${({ $color }) => $color || "#94a3b8"};
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px ${({ $color }) => ($color ? `${$color}30` : "#e2e8f0")};
`;

export const TimelineDate = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.025em;
`;

export const TimelineLabel = styled.p`
  font-size: 0.9375rem;
  color: #1e293b;
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
          background: #0f766e;
          color: #ffffff;
          border: 2px solid #0f766e;

          &:hover {
            background: #0d6860;
            border-color: #0d6860;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3);
          }
        `
      : css`
          background: transparent;
          color: #0f766e;
          border: 2px solid #0f766e;

          &:hover {
            background: rgba(15, 118, 110, 0.05);
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
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
`;

export const SignupTitle = styled.h3`
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.75rem;
`;

export const SignupBody = styled.p`
  font-size: 0.9375rem;
  color: #475569;
  max-width: 480px;
  margin: 0 auto 1.5rem;
`;

export const SignupButton = styled.button`
  padding: 0.625rem 1.5rem;
  border-radius: 8px;
  background: #0f766e;
  color: #ffffff;
  border: none;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #0d6860;
  }
`;

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export const FooterSection = styled.footer`
  padding: 3rem 1.5rem;
  border-top: 1px solid #e2e8f0;
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
  color: #0f766e;
  text-decoration: none;
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
`;

export const FooterNotice = styled.p`
  font-size: 0.75rem;
  color: #94a3b8;
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
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
`;

export const StatValue = styled.div`
  font-size: 1.75rem;
  font-weight: 700;
  color: #0f766e;
  font-family: Georgia, "Times New Roman", serif;
`;

export const StatLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
`;
