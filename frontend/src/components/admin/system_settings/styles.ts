import styled from "styled-components";
import { PIPELINE_UI } from "../../../assets/configurations/constants";

// ============================================================================
// Layout Styled Components
// ============================================================================

export const Container = styled.div`
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  min-height: 100%;
  overflow-y: auto;
  overflow-x: clip;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

export const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.5rem 0;
  margin-bottom: 1rem;
  transition: color 0.15s ease;

  &:hover {
    color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

export const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

export const PageTitle = styled.h1`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.75rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem 0;

  svg {
    width: 28px;
    height: 28px;
    color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  }

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

export const PageDescription = styled.p`
  color: #64748b;
  font-size: 1rem;
  margin: 0;
  line-height: 1.5;
`;

export const LastModified = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #94a3b8;
  font-size: 0.875rem;
  margin-top: 0.75rem;

  svg {
    width: 14px;
    height: 14px;
  }
`;

// ============================================================================
// Component Name (shared)
// ============================================================================

export const ComponentName = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: #1e293b;
  text-align: center;
  line-height: 1.3;
`;

export const NoComponents = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #94a3b8;
  font-size: 0.875rem;
  font-style: italic;
`;

// ============================================================================
// Collapsible Settings Styled Components
// ============================================================================

export const AdvancedSettingsToggle = styled.button<{ $expanded: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  margin-top: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f1f5f9;
    color: #475569;
  }

  svg {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
    transform: rotate(${(props) => (props.$expanded ? "90deg" : "0deg")});
  }
`;

export const AdvancedSettingsContent = styled.div<{ $expanded: boolean }>`
  display: ${(props) => (props.$expanded ? "block" : "none")};
  margin-top: 0.75rem;
  padding: 1rem;
  background: #fafafa;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
`;

export const RequiredBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.625rem;
  font-weight: 500;
  border-radius: 4px;
  margin-left: auto;

  svg {
    width: 10px;
    height: 10px;
  }
`;

// ============================================================================
// Section Styled Components
// ============================================================================

export const Section = styled.div`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;

  svg {
    width: 18px;
    height: 18px;
    color: #6366f1;
  }
`;

export const SecretKeyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const SecretKeyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.8125rem;
`;

export const SecretKeyName = styled.span`
  font-weight: 500;
  color: #1e293b;
  font-family: monospace;
  font-size: 0.75rem;
`;

export const SecretStatusIndicator = styled.span<{ $populated: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
  margin-left: auto;
  background: ${(props) => (props.$populated ? "#ecfdf5" : "#fef3c7")};
  color: ${(props) => (props.$populated ? "#065f46" : "#92400e")};

  svg {
    width: 10px;
    height: 10px;
  }
`;

export const EmptyValue = styled.span`
  color: #94a3b8;
  font-style: italic;
  font-size: 0.875rem;
`;

export const DefaultEmbedderDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
`;

export const DefaultEmbedderInfo = styled.div`
  flex: 1;
`;

export const DefaultEmbedderPath = styled.code`
  font-size: 0.75rem;
  color: #64748b;
  word-break: break-all;
`;

export const ActionButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
`;

// ============================================================================
// Loading / Error / Warning States
// ============================================================================

export const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 1rem;
  color: #64748b;
`;

export const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 1rem;
  padding: 2rem;
  text-align: center;

  svg {
    width: 48px;
    height: 48px;
    color: #ef4444;
  }
`;

export const ErrorMessage = styled.p`
  color: #64748b;
  font-size: 0.875rem;
  margin: 0;
`;

export const WarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  margin-bottom: 1.5rem;

  svg {
    width: 20px;
    height: 20px;
    color: #d97706;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
`;

export const WarningText = styled.div`
  font-size: 0.875rem;
  color: #92400e;
  line-height: 1.5;

  strong {
    font-weight: 600;
  }
`;

// ============================================================================
// Form / Secret Field Styled Components
// ============================================================================

export const SecretFieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const SecretFieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

export const SecretFieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const FormField = styled.div`
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.375rem;
`;

export const FormHelperText = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.375rem 0 0 0;
`;

// ============================================================================
// Component Library Styled Components
// ============================================================================

export const LibraryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const FilterBar = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
`;

export const FilterChip = styled.button<{ $active: boolean }>`
  padding: 0.375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1px solid
    ${(props) => (props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#e2e8f0")};
  background: ${(props) =>
    props.$active ? `${PIPELINE_UI.PRIMARY_ACCENT_COLOR}10` : "white"};
  color: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#64748b"};
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    border-color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
    color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  }
`;

export const SearchInputWrapper = styled.div`
  flex: 1;
  min-width: 200px;
`;

export const ComponentListItem = styled.div<{ $disabled: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  transition: all 0.2s ease;
  opacity: ${(props) => (props.$disabled ? 0.5 : 1)};

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }
`;

export const ComponentInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ComponentTitle = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
`;

export const ComponentDescription = styled.span`
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.4;
`;

export const BadgeRow = styled.div`
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-top: 0.375rem;
`;

export const StageBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 9999px;
  background: ${(props) => `${props.$color}15`};
  color: ${(props) => props.$color};
`;

export const FileTypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 500;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #64748b;
`;

// ============================================================================
// Filetype Defaults Styled Components
// ============================================================================

export const DefaultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const DefaultsHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr 1fr 1fr;
  gap: 0.75rem;
  padding: 0 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;

  @media (max-width: 768px) {
    display: none;
  }
`;

export const FiletypeRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr 1fr 1fr;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
`;

export const FiletypeLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  color: #1e293b;

  svg {
    width: 16px;
    height: 16px;
    color: #64748b;
  }
`;

export const StageDropdownLabel = styled.label`
  display: none;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 0.25rem;

  @media (max-width: 768px) {
    display: block;
  }
`;

export const StyledSelect = styled.select<{ $warning?: boolean }>`
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: #1e293b;
  background: white;
  border: 1px solid ${(props) => (props.$warning ? "#f59e0b" : "#e2e8f0")};
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s ease;
  appearance: auto;

  &:hover {
    border-color: ${(props) =>
      props.$warning ? "#d97706" : PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  }

  &:focus {
    outline: none;
    border-color: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
    box-shadow: 0 0 0 2px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}20;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
