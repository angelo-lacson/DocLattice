import styled from "styled-components";
import {
  DEFAULT_LABEL_COLOR,
  PRIMARY_LABEL_COLOR,
} from "../../../assets/configurations/constants";

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS FOR LABELSET DETAIL PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  background: #fafafa;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
`;

export const PageLayout = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

export const Sidebar = styled.aside`
  width: 260px;
  min-width: 260px;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;

  @media (max-width: 900px) {
    display: none;
  }
`;

export const SidebarHeader = styled.div`
  padding: 24px 20px;
  border-bottom: 1px solid #e2e8f0;
`;

export const BackLink = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  text-decoration: none;
  padding: 6px 10px 6px 6px;
  margin: -6px -10px -6px -6px;
  border-radius: 6px;
  transition: all 0.15s ease;
  cursor: pointer;
  background: none;
  border: none;

  &:hover {
    background: #f1f5f9;
    color: #1e293b;
  }
`;

export const SidebarNav = styled.nav`
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
`;

export interface NavItemProps {
  $active?: boolean;
}

export const NavItem = styled.button<NavItemProps>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.$active ? "#0f766e" : "#475569")};
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  background: ${(props) =>
    props.$active
      ? "linear-gradient(90deg, rgba(15, 118, 110, 0.08) 0%, transparent 100%)"
      : "none"};
  width: 100%;
  text-align: left;
  border-left: 2px solid
    ${(props) => (props.$active ? "#0f766e" : "transparent")};
  padding-left: ${(props) => (props.$active ? "18px" : "20px")};

  &:hover {
    background: ${(props) => (props.$active ? undefined : "#f8fafc")};
    color: ${(props) => (props.$active ? "#0f766e" : "#1e293b")};
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .nav-badge {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
    color: ${(props) => (props.$active ? "#fff" : `#${DEFAULT_LABEL_COLOR}`)};
    background: ${(props) => (props.$active ? "#0f766e" : "#f1f5f9")};
    padding: 2px 8px;
    border-radius: 10px;
  }
`;

export const SidebarFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
`;

// Mobile Navigation
export const MobileNav = styled.nav`
  display: none;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 24px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 900px) {
    display: block;
  }
`;

export const MobileNavTabs = styled.div`
  display: flex;
  gap: 4px;
  min-width: max-content;
`;

export interface MobileNavTabProps {
  $active?: boolean;
}

export const MobileNavTab = styled.button<MobileNavTabProps>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => (props.$active ? "#0f766e" : "#475569")};
  background: none;
  border: none;
  border-bottom: 2px solid
    ${(props) => (props.$active ? "#0f766e" : "transparent")};
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;

  &:first-child {
    padding-left: 0;
  }

  &:hover {
    color: ${(props) => (props.$active ? "#0f766e" : "#1e293b")};
  }

  .nav-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
  }

  .nav-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 10px;
    background: ${(props) => (props.$active ? "#0f766e" : "#f1f5f9")};
    color: ${(props) => (props.$active ? "#fff" : `#${DEFAULT_LABEL_COLOR}`)};
  }
`;

export const EditDetailsButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
`;

export const MainContainer = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const MainHeader = styled.header`
  padding: 24px 40px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;

  @media (max-width: 900px) {
    padding: 16px 24px;
  }
`;

export const MobileBackLink = styled.button`
  display: none;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  text-decoration: none;
  padding: 6px 10px 6px 6px;
  margin: -6px -10px 12px -6px;
  border-radius: 6px;
  transition: all 0.15s ease;
  cursor: pointer;
  background: none;
  border: none;

  &:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  @media (max-width: 900px) {
    display: inline-flex;
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 20px;
`;

export const HeaderContent = styled.div`
  flex: 1;
  min-width: 0;
`;

export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
`;

export const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;

  @media (max-width: 900px) {
    font-size: 20px;
  }
`;

export const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
`;

export const Meta = styled.div`
  font-size: 14px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const MetaSep = styled.span`
  color: #e2e8f0;
`;

export const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

export const ShareButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #0f766e;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #0d9488;
  }
`;

export const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;

  @media (max-width: 900px) {
    padding: 24px;
  }
`;

export const ContentInner = styled.div`
  max-width: 900px;
`;

// Overview styles
export const OverviewSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

export const OverviewHero = styled.div`
  display: flex;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 900px) {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
`;

export const OverviewIconBox = styled.div`
  width: 120px;
  height: 120px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #${DEFAULT_LABEL_COLOR};
  flex-shrink: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
  }

  @media (max-width: 900px) {
    width: 80px;
    height: 80px;
  }
`;

export const OverviewDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

export const OverviewDescription = styled.p`
  font-size: 15px;
  line-height: 1.6;
  color: #475569;
  margin: 0 0 24px 0;
  max-width: 600px;

  @media (max-width: 900px) {
    max-width: none;
  }
`;

export const OverviewStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 500px;
  margin-bottom: 24px;

  @media (max-width: 900px) {
    max-width: none;
    width: 100%;
    grid-template-columns: 1fr;
    gap: 12px;
  }
`;

export const StatCard = styled.div`
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;

  @media (max-width: 900px) {
    padding: 12px 16px;
  }
`;

export const StatValue = styled.div`
  font-size: 28px;
  font-weight: 600;
  color: #0f766e;
  line-height: 1;
  margin-bottom: 4px;

  @media (max-width: 900px) {
    font-size: 24px;
  }
`;

export const StatLabel = styled.div`
  font-size: 13px;
  color: #475569;
`;

export const OverviewActions = styled.div`
  display: flex;
  gap: 12px;

  @media (max-width: 900px) {
    flex-wrap: wrap;
    justify-content: center;
  }
`;

export const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #475569;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  &.danger {
    color: #dc2626;

    &:hover {
      background: #fef2f2;
      border-color: #fecaca;
    }
  }
`;

// Labels section styles
export const LabelsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const SearchContainer = styled.div`
  position: relative;
  max-width: 400px;
`;

export const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px 10px 40px;
  font-size: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;

  &:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }

  &::placeholder {
    color: #${DEFAULT_LABEL_COLOR};
  }
`;

export const SearchIconWrapper = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #${DEFAULT_LABEL_COLOR};
  pointer-events: none;
`;

export const LabelsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const LabelItem = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  transition: all 0.15s ease;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  &:hover .label-actions {
    opacity: 1;
  }

  @media (max-width: 900px) {
    padding: 12px 16px;

    .label-actions {
      opacity: 1;
    }
  }
`;

export const LabelGrip = styled.div`
  cursor: grab;
  color: #${DEFAULT_LABEL_COLOR};
  flex-shrink: 0;

  &:active {
    cursor: grabbing;
  }
`;

export const LabelColor = styled.div<{ $color: string }>`
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background-color: ${(props) => props.$color || `#${DEFAULT_LABEL_COLOR}`};
  flex-shrink: 0;
`;

export const LabelContent = styled.div`
  flex: 1;
  min-width: 0;
`;

export const LabelName = styled.p`
  font-size: 15px;
  font-weight: 500;
  color: #1e293b;
  margin: 0 0 2px 0;
`;

export const LabelDescription = styled.p`
  font-size: 13px;
  color: #475569;
  margin: 0;
`;

export const LabelActions = styled.div`
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
`;

export const LabelActionButton = styled.button`
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #${DEFAULT_LABEL_COLOR};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  &.danger {
    background: #fef2f2;
    color: #f87171;
    border: 1px solid #fecaca;

    &:hover {
      background: #fee2e2;
      color: #dc2626;
    }
  }

  &.success {
    background: #f0fdf4;
    color: #4ade80;
    border: 1px solid #bbf7d0;

    &:hover {
      background: #dcfce7;
      color: #16a34a;
    }
  }
`;

export const LabelEditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
  background: #fff;
  border: 2px solid #0f766e;
  border-radius: 10px;
`;

export const LabelEditRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

export const LabelEditInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #1e293b;
  outline: none;
  transition: all 0.15s ease;

  &:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }
`;

export const LabelEditTextarea = styled.textarea`
  flex: 1;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #1e293b;
  outline: none;
  resize: vertical;
  min-height: 60px;
  transition: all 0.15s ease;

  &:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
  }
`;

export const LabelEditLabel = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  min-width: 80px;
`;

export const ColorInput = styled.input`
  width: 40px;
  height: 32px;
  padding: 2px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
`;

export const LabelEditActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
`;

export const AddLabelButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #475569;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  align-self: flex-start;

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
`;

export const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
`;

export const EmptyStateIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  color: #${DEFAULT_LABEL_COLOR};
`;

export const EmptyStateTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 8px;
`;

export const EmptyStateDescription = styled.p`
  font-size: 14px;
  color: #475569;
  margin: 0 0 20px;
`;

export const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
`;

// Re-export the color constants for use in component logic
export { DEFAULT_LABEL_COLOR, PRIMARY_LABEL_COLOR };
