import React, { useState, useCallback, useRef, useMemo, memo } from "react";
import { useQuery, useMutation, gql } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  Button,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Textarea,
} from "@os-legal/ui";
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  AlertTriangle,
  FileText,
  Cpu,
  Image,
  Key,
  Info,
  Upload,
  Search,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  PipelineSettingsType,
  PipelineComponentsType,
  PipelineComponentType,
  ComponentSettingSchemaType,
} from "../../types/graphql-api";
import { getComponentIcon, getComponentDisplayName } from "./PipelineIcons";
import {
  PIPELINE_UI,
  SUPPORTED_MIME_TYPES,
  MIME_TO_SHORT_LABEL,
} from "../../assets/configurations/constants";
import { formatSettingLabel } from "../../utils/formatters";

// ============================================================================
// GraphQL Operations
// ============================================================================

const GET_PIPELINE_SETTINGS = gql`
  query GetPipelineSettings {
    pipelineSettings {
      preferredParsers
      preferredEmbedders
      preferredThumbnailers
      parserKwargs
      componentSettings
      defaultEmbedder
      componentsWithSecrets
      modified
      modifiedBy {
        id
        username
      }
    }
  }
`;

const GET_PIPELINE_COMPONENTS = gql`
  query GetPipelineComponents {
    pipelineComponents {
      parsers {
        name
        title
        description
        className
        supportedFileTypes
        settingsSchema {
          name
          settingType
          pythonType
          required
          description
          default
          envVar
          hasValue
          currentValue
        }
      }
      embedders {
        name
        title
        description
        className
        vectorSize
        supportedFileTypes
        settingsSchema {
          name
          settingType
          pythonType
          required
          description
          default
          envVar
          hasValue
          currentValue
        }
      }
      thumbnailers {
        name
        title
        description
        className
        supportedFileTypes
        settingsSchema {
          name
          settingType
          pythonType
          required
          description
          default
          envVar
          hasValue
          currentValue
        }
      }
    }
  }
`;

const UPDATE_PIPELINE_SETTINGS = gql`
  mutation UpdatePipelineSettings(
    $preferredParsers: GenericScalar
    $preferredEmbedders: GenericScalar
    $preferredThumbnailers: GenericScalar
    $parserKwargs: GenericScalar
    $componentSettings: GenericScalar
    $defaultEmbedder: String
  ) {
    updatePipelineSettings(
      preferredParsers: $preferredParsers
      preferredEmbedders: $preferredEmbedders
      preferredThumbnailers: $preferredThumbnailers
      parserKwargs: $parserKwargs
      componentSettings: $componentSettings
      defaultEmbedder: $defaultEmbedder
    ) {
      ok
      message
      pipelineSettings {
        preferredParsers
        preferredEmbedders
        preferredThumbnailers
        parserKwargs
        componentSettings
        defaultEmbedder
        componentsWithSecrets
        modified
        modifiedBy {
          id
          username
        }
      }
    }
  }
`;

const RESET_PIPELINE_SETTINGS = gql`
  mutation ResetPipelineSettings {
    resetPipelineSettings {
      ok
      message
      pipelineSettings {
        preferredParsers
        preferredEmbedders
        preferredThumbnailers
        parserKwargs
        componentSettings
        defaultEmbedder
        componentsWithSecrets
        modified
        modifiedBy {
          id
          username
        }
      }
    }
  }
`;

const UPDATE_COMPONENT_SECRETS = gql`
  mutation UpdateComponentSecrets(
    $componentPath: String!
    $secrets: GenericScalar!
    $merge: Boolean
  ) {
    updateComponentSecrets(
      componentPath: $componentPath
      secrets: $secrets
      merge: $merge
    ) {
      ok
      message
      componentsWithSecrets
    }
  }
`;

const DELETE_COMPONENT_SECRETS = gql`
  mutation DeleteComponentSecrets($componentPath: String!) {
    deleteComponentSecrets(componentPath: $componentPath) {
      ok
      message
      componentsWithSecrets
    }
  }
`;

// ============================================================================
// Styled Components
// ============================================================================

const Container = styled.div`
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  min-height: 100%;
  overflow-y: auto;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const BackButton = styled.button`
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

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const PageTitle = styled.h1`
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

const PageDescription = styled.p`
  color: #64748b;
  font-size: 1rem;
  margin: 0;
  line-height: 1.5;
`;

const LastModified = styled.div`
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

// Pipeline Flow Styles
const PipelineFlow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 2rem;
`;

const PipelineConnector = styled.div`
  display: flex;
  justify-content: center;
  padding: 0.5rem 0;

  &::after {
    content: "";
    width: 2px;
    height: ${PIPELINE_UI.CONNECTOR_HEIGHT_PX}px;
    background: linear-gradient(to bottom, #e2e8f0, #cbd5e1);
  }
`;

const PipelineStage = styled.div<{ $color: string }>`
  background: white;
  border: 2px solid ${(props) => props.$color}20;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const StageHeader = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: ${(props) => props.$color}08;
  border-bottom: 1px solid ${(props) => props.$color}15;
`;

const StageInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const StageIcon = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: ${(props) => props.$color}15;
  border-radius: 10px;

  svg {
    width: 20px;
    height: 20px;
    color: ${(props) => props.$color};
  }
`;

const StageTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
`;

const StageSubtitle = styled.p`
  font-size: 0.75rem;
  color: #64748b;
  margin: 0.125rem 0 0 0;
`;

const MimeSelector = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const MimeButton = styled.button<{ $active: boolean }>`
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid ${(props) => (props.$active ? "#6366f1" : "#e2e8f0")};
  background: ${(props) => (props.$active ? "#6366f1" : "white")};
  color: ${(props) => (props.$active ? "white" : "#64748b")};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: #6366f1;
    color: ${(props) => (props.$active ? "white" : "#6366f1")};
  }
`;

const StageContent = styled.div`
  padding: 1.25rem;
`;

const ComponentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(${PIPELINE_UI.COMPONENT_GRID_MIN_WIDTH}px, 1fr)
  );
  gap: 1rem;

  @media (max-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const ComponentCard = styled.button<{ $selected: boolean; $color: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.25rem 1rem;
  background: ${(props) => (props.$selected ? `${props.$color}10` : "#f8fafc")};
  border: 2px solid ${(props) => (props.$selected ? props.$color : "#e2e8f0")};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-height: ${PIPELINE_UI.COMPONENT_CARD_MIN_HEIGHT_PX}px;

  &:hover {
    border-color: ${(props) => props.$color};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  ${(props) =>
    props.$selected &&
    `
    box-shadow: 0 0 0 3px ${props.$color}20;
  `}
`;

const SelectedBadge = styled.div<{ $color: string }>`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: ${(props) => props.$color};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 12px;
    height: 12px;
    color: white;
  }
`;

const ComponentIconWrapper = styled.div`
  margin-bottom: 0.5rem;
`;

const ComponentName = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: #1e293b;
  text-align: center;
  line-height: 1.3;
`;

const VectorBadge = styled.span`
  font-size: 0.625rem;
  color: #64748b;
  margin-top: 0.25rem;
`;

const NoComponents = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #94a3b8;
  font-size: 0.875rem;
  font-style: italic;
`;

// Collapsible Settings
const AdvancedSettingsToggle = styled.button<{ $expanded: boolean }>`
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

const AdvancedSettingsContent = styled.div<{ $expanded: boolean }>`
  display: ${(props) => (props.$expanded ? "block" : "none")};
  margin-top: 0.75rem;
  padding: 1rem;
  background: #fafafa;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
`;

const RequiredBadge = styled.span`
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

// Start/End Stages
const BookendStage = styled.div<{ $variant: "start" | "end" }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: ${(props) =>
    props.$variant === "start"
      ? "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)"
      : "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)"};
  border: 2px dashed
    ${(props) => (props.$variant === "start" ? "#cbd5e1" : "#6ee7b7")};
  border-radius: 12px;

  svg {
    width: 24px;
    height: 24px;
    color: ${(props) => (props.$variant === "start" ? "#64748b" : "#10b981")};
  }
`;

const BookendText = styled.span<{ $variant: "start" | "end" }>`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${(props) => (props.$variant === "start" ? "#64748b" : "#059669")};
`;

// Bottom sections
const Section = styled.div`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const SectionTitle = styled.h2`
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

const SectionDescription = styled.p`
  color: #64748b;
  font-size: 0.875rem;
  margin: 0 0 1rem 0;
`;

const SecretsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const SecretBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 6px;

  svg {
    width: 12px;
    height: 12px;
  }
`;

const IconButton = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: ${(props) => (props.$danger ? "#fef2f2" : "transparent")};
  color: ${(props) => (props.$danger ? "#dc2626" : "#475569")};

  &:hover {
    background: ${(props) => (props.$danger ? "#fee2e2" : "#e2e8f0")};
    color: ${(props) => (props.$danger ? "#b91c1c" : "#1e293b")};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const EmptyValue = styled.span`
  color: #94a3b8;
  font-style: italic;
  font-size: 0.875rem;
`;

const DefaultEmbedderDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
`;

const DefaultEmbedderInfo = styled.div`
  flex: 1;
`;

const DefaultEmbedderPath = styled.code`
  font-size: 0.75rem;
  color: #64748b;
  word-break: break-all;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 1rem;
  color: #64748b;
`;

const ErrorContainer = styled.div`
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

const ErrorMessage = styled.p`
  color: #64748b;
  font-size: 0.875rem;
  margin: 0;
`;

const WarningBanner = styled.div`
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

const WarningText = styled.div`
  font-size: 0.875rem;
  color: #92400e;
  line-height: 1.5;

  strong {
    font-weight: 600;
  }
`;

const JsonEditor = styled.div`
  margin-bottom: 1rem;
`;

const FormField = styled.div`
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const FormLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.375rem;
`;

const FormHelperText = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.375rem 0 0 0;
`;

// ============================================================================
// Types
// ============================================================================

interface PipelineSettingsQueryResult {
  pipelineSettings: PipelineSettingsType;
}

interface PipelineComponentsQueryResult {
  pipelineComponents: PipelineComponentsType;
}

type StageType = "parsers" | "embedders" | "thumbnailers";

// Type for pipeline settings keys that hold MIME-type mappings
type PipelineMappingKey =
  | "preferredParsers"
  | "preferredEmbedders"
  | "preferredThumbnailers";

type SettingsSchemaEntry = ComponentSettingSchemaType;

// Stage configuration with properly typed settings keys
const STAGE_CONFIG: Record<
  StageType,
  {
    color: string;
    icon: React.FC;
    title: string;
    subtitle: string;
    settingsKey: PipelineMappingKey;
  }
> = {
  parsers: {
    color: "#3B82F6",
    icon: FileText,
    title: "Parser",
    subtitle: "Extract text and structure",
    settingsKey: "preferredParsers",
  },
  thumbnailers: {
    color: "#EC4899",
    icon: Image,
    title: "Thumbnailer",
    subtitle: "Generate document previews",
    settingsKey: "preferredThumbnailers",
  },
  embedders: {
    color: "#10B981",
    icon: Cpu,
    title: "Embedder",
    subtitle: "Create vector embeddings",
    settingsKey: "preferredEmbedders",
  },
};

// ============================================================================
// Memoized Sub-components
// ============================================================================

interface PipelineComponentCardProps {
  component: PipelineComponentType & { className: string };
  isSelected: boolean;
  color: string;
  stageTitle: string;
  disabled: boolean;
  onSelect: () => void;
}

/**
 * Memoized component card to prevent unnecessary re-renders.
 * Only re-renders when its specific props change.
 */
const PipelineComponentCard = memo<PipelineComponentCardProps>(
  ({ component, isSelected, color, stageTitle, disabled, onSelect }) => {
    const IconComponent = getComponentIcon(component.className);
    const displayName = getComponentDisplayName(
      component.className,
      component.title || undefined
    );
    const vectorSize = (
      component as PipelineComponentType & { vectorSize?: number }
    ).vectorSize;

    return (
      <ComponentCard
        $selected={isSelected}
        $color={color}
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={isSelected}
        aria-label={`Select ${displayName} as ${stageTitle.toLowerCase()}`}
      >
        {isSelected && (
          <SelectedBadge $color={color}>
            <Check />
          </SelectedBadge>
        )}
        <ComponentIconWrapper>
          <IconComponent size={PIPELINE_UI.ICON_SIZE} />
        </ComponentIconWrapper>
        <ComponentName>{displayName}</ComponentName>
        {vectorSize && <VectorBadge>{vectorSize}d vectors</VectorBadge>}
      </ComponentCard>
    );
  }
);

PipelineComponentCard.displayName = "PipelineComponentCard";

// ============================================================================
// Advanced Settings Panel Subcomponent
// ============================================================================

interface AdvancedSettingsPanelProps {
  currentSelection: string;
  secretSettings: ComponentSettingSchemaType[];
  hasSecretsConfigured: boolean;
  isExpanded: boolean;
  settingsKey: string;
  onToggle: () => void;
  onAddSecrets: (componentPath: string) => void;
  onDeleteSecrets: (componentPath: string) => void;
}

/**
 * Collapsible panel showing advanced settings for a selected component.
 * Handles both components requiring secrets and those without configuration.
 */
const AdvancedSettingsPanel = memo<AdvancedSettingsPanelProps>(
  ({
    currentSelection,
    secretSettings,
    hasSecretsConfigured,
    isExpanded,
    settingsKey,
    onToggle,
    onAddSecrets,
    onDeleteSecrets,
  }) => {
    const needsConfig = secretSettings.length > 0 && !hasSecretsConfigured;
    const secretLabel =
      secretSettings.length === 1
        ? formatSettingLabel(
            secretSettings[0].name,
            secretSettings[0].description
          )
        : "Secrets";

    return (
      <>
        <AdvancedSettingsToggle
          $expanded={isExpanded}
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`settings-content-${settingsKey}`}
        >
          <ChevronRight />
          Advanced Settings
          {needsConfig && (
            <RequiredBadge>
              <AlertTriangle />
              Config Required
            </RequiredBadge>
          )}
        </AdvancedSettingsToggle>

        {isExpanded && (
          <AdvancedSettingsContent
            $expanded={isExpanded}
            id={`settings-content-${settingsKey}`}
          >
            {secretSettings.length > 0 ? (
              <>
                {hasSecretsConfigured ? (
                  <FormField>
                    <FormLabel>API Credentials</FormLabel>
                    <SecretBadge>
                      <Key />
                      Secrets configured
                      <IconButton
                        $danger
                        onClick={() => onDeleteSecrets(currentSelection)}
                      >
                        <Trash2 />
                      </IconButton>
                    </SecretBadge>
                    <FormHelperText>
                      Click the trash icon to remove and reconfigure secrets.
                    </FormHelperText>
                  </FormField>
                ) : (
                  <FormField>
                    <FormLabel>{secretLabel}</FormLabel>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onAddSecrets(currentSelection)}
                    >
                      <Key style={{ width: 14, height: 14, marginRight: 6 }} />
                      {secretSettings.length === 1
                        ? `Configure ${secretLabel}`
                        : "Configure Secrets"}
                    </Button>
                    <FormHelperText>
                      This component requires secrets to function.
                    </FormHelperText>
                  </FormField>
                )}
              </>
            ) : (
              <FormField>
                <FormLabel>Component Path</FormLabel>
                <DefaultEmbedderPath>{currentSelection}</DefaultEmbedderPath>
                <FormHelperText>
                  This component has no additional configuration options.
                </FormHelperText>
              </FormField>
            )}
          </AdvancedSettingsContent>
        )}
      </>
    );
  }
);

AdvancedSettingsPanel.displayName = "AdvancedSettingsPanel";

// ============================================================================
// Pipeline Stage Section Subcomponent
// ============================================================================

interface PipelineStageSectionProps {
  stage: StageType;
  config: (typeof STAGE_CONFIG)[StageType];
  mimeType: string;
  components: (PipelineComponentType & { className: string })[];
  currentSelection: string | null;
  secretSettings: ComponentSettingSchemaType[];
  hasSecretsConfigured: boolean;
  isExpanded: boolean;
  settingsKey: string;
  updating: boolean;
  onMimeTypeChange: (stage: StageType, mimeType: string) => void;
  onSelectComponent: (
    stage: StageType,
    mimeType: string,
    className: string
  ) => void;
  onToggleSettings: (key: string) => void;
  onAddSecrets: (componentPath: string) => void;
  onDeleteSecrets: (componentPath: string) => void;
}

/**
 * Renders a complete pipeline stage with header, component grid, and settings.
 */
const PipelineStageSection = memo<PipelineStageSectionProps>(
  ({
    stage,
    config,
    mimeType,
    components,
    currentSelection,
    secretSettings,
    hasSecretsConfigured,
    isExpanded,
    settingsKey,
    updating,
    onMimeTypeChange,
    onSelectComponent,
    onToggleSettings,
    onAddSecrets,
    onDeleteSecrets,
  }) => {
    const Icon = config.icon;

    return (
      <PipelineStage $color={config.color}>
        <StageHeader $color={config.color}>
          <StageInfo>
            <StageIcon $color={config.color}>
              <Icon />
            </StageIcon>
            <div>
              <StageTitle>{config.title}</StageTitle>
              <StageSubtitle>{config.subtitle}</StageSubtitle>
            </div>
          </StageInfo>
          <MimeSelector
            role="group"
            aria-label={`${config.title} file type filter`}
          >
            {SUPPORTED_MIME_TYPES.map((mime) => (
              <MimeButton
                key={mime.value}
                $active={mimeType === mime.value}
                onClick={() => onMimeTypeChange(stage, mime.value)}
                aria-pressed={mimeType === mime.value}
                aria-label={`Filter ${config.title} by ${mime.label}`}
              >
                {mime.shortLabel}
              </MimeButton>
            ))}
          </MimeSelector>
        </StageHeader>
        <StageContent>
          {components.length > 0 ? (
            <ComponentGrid>
              {components
                .filter(
                  (
                    comp
                  ): comp is PipelineComponentType & { className: string } =>
                    Boolean(comp?.className)
                )
                .map((comp) => (
                  <PipelineComponentCard
                    key={comp.className}
                    component={comp}
                    isSelected={currentSelection === comp.className}
                    color={config.color}
                    stageTitle={config.title}
                    disabled={updating}
                    onSelect={() =>
                      onSelectComponent(stage, mimeType, comp.className)
                    }
                  />
                ))}
            </ComponentGrid>
          ) : (
            <NoComponents>
              No components available for{" "}
              {SUPPORTED_MIME_TYPES.find((m) => m.value === mimeType)?.label ||
                mimeType}
            </NoComponents>
          )}

          {/* Advanced Settings */}
          {currentSelection && (
            <AdvancedSettingsPanel
              currentSelection={currentSelection}
              secretSettings={secretSettings}
              hasSecretsConfigured={hasSecretsConfigured}
              isExpanded={isExpanded}
              settingsKey={settingsKey}
              onToggle={() => onToggleSettings(settingsKey)}
              onAddSecrets={onAddSecrets}
              onDeleteSecrets={onDeleteSecrets}
            />
          )}
        </StageContent>
      </PipelineStage>
    );
  }
);

PipelineStageSection.displayName = "PipelineStageSection";

// ============================================================================
// Component
// ============================================================================

export const SystemSettings: React.FC = () => {
  const navigate = useNavigate();

  // Per-stage MIME type selection
  const [selectedMimeTypes, setSelectedMimeTypes] = useState<
    Record<StageType, string>
  >({
    parsers: "application/pdf",
    embedders: "application/pdf",
    thumbnailers: "application/pdf",
  });

  // Advanced settings expansion state
  const [expandedSettings, setExpandedSettings] = useState<
    Record<string, boolean>
  >({});

  // Modal states
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSecretsModal, setShowSecretsModal] = useState(false);
  const [secretsComponentPath, setSecretsComponentPath] = useState("");
  const [secretsValue, setSecretsValue] = useState("");
  const [showDefaultEmbedderModal, setShowDefaultEmbedderModal] =
    useState(false);
  const [defaultEmbedderValue, setDefaultEmbedderValue] = useState("");
  const [showDeleteSecretsConfirm, setShowDeleteSecretsConfirm] =
    useState(false);
  const [deleteSecretsPath, setDeleteSecretsPath] = useState("");

  // Ref for tracking pending auto-expand after component selection
  // This ensures auto-expand only happens after mutation succeeds
  const pendingAutoExpandRef = useRef<{
    stage: StageType;
    mimeType: string;
    className: string;
  } | null>(null);

  // GraphQL queries
  const {
    data: settingsData,
    loading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useQuery<PipelineSettingsQueryResult>(GET_PIPELINE_SETTINGS, {
    fetchPolicy: "network-only",
  });

  const { data: componentsData, loading: componentsLoading } =
    useQuery<PipelineComponentsQueryResult>(GET_PIPELINE_COMPONENTS, {
      fetchPolicy: "cache-first",
    });

  // Mutations
  const [updateSettings, { loading: updating }] = useMutation(
    UPDATE_PIPELINE_SETTINGS,
    {
      onCompleted: (data) => {
        if (data.updatePipelineSettings?.ok) {
          toast.success("Settings updated successfully");
          refetchSettings();

          // Handle pending auto-expand for components requiring configuration
          const pending = pendingAutoExpandRef.current;
          if (pending) {
            const requiresConfig =
              getSecretSettingsForComponent(pending.className).length > 0;
            const hasSecretsConfigured =
              data.updatePipelineSettings.pipelineSettings?.componentsWithSecrets?.includes(
                pending.className
              ) ?? false;

            if (requiresConfig && !hasSecretsConfigured) {
              setExpandedSettings((prev) => ({
                ...prev,
                [`${pending.stage}-${pending.mimeType}`]: true,
              }));
            }
            pendingAutoExpandRef.current = null;
          }
        } else {
          toast.error(
            data.updatePipelineSettings?.message || "Failed to update settings"
          );
          pendingAutoExpandRef.current = null;
        }
      },
      onError: (err) => {
        toast.error(`Error updating settings: ${err.message}`);
        pendingAutoExpandRef.current = null;
      },
    }
  );

  const [resetSettings, { loading: resetting }] = useMutation(
    RESET_PIPELINE_SETTINGS,
    {
      onCompleted: (data) => {
        if (data.resetPipelineSettings?.ok) {
          toast.success("Settings reset to defaults");
          setShowResetConfirm(false);
          refetchSettings();
        } else {
          toast.error(
            data.resetPipelineSettings?.message || "Failed to reset settings"
          );
        }
      },
      onError: (err) => {
        toast.error(`Error resetting settings: ${err.message}`);
      },
    }
  );

  const [updateSecrets, { loading: updatingSecrets }] = useMutation(
    UPDATE_COMPONENT_SECRETS,
    {
      onCompleted: (data) => {
        if (data.updateComponentSecrets?.ok) {
          toast.success("Secrets updated successfully");
          setShowSecretsModal(false);
          setSecretsComponentPath("");
          setSecretsValue("");
          refetchSettings();
        } else {
          toast.error(
            data.updateComponentSecrets?.message || "Failed to update secrets"
          );
        }
      },
      onError: (err) => {
        toast.error(`Error updating secrets: ${err.message}`);
      },
    }
  );

  const [deleteSecrets, { loading: deletingSecrets }] = useMutation(
    DELETE_COMPONENT_SECRETS,
    {
      onCompleted: (data) => {
        if (data.deleteComponentSecrets?.ok) {
          toast.success("Secrets deleted successfully");
          refetchSettings();
        } else {
          toast.error(
            data.deleteComponentSecrets?.message || "Failed to delete secrets"
          );
        }
      },
      onError: (err) => {
        toast.error(`Error deleting secrets: ${err.message}`);
      },
    }
  );

  const settings = settingsData?.pipelineSettings;
  const components = componentsData?.pipelineComponents;

  const componentsByStage = useMemo(() => {
    const parsers = (components?.parsers || []).filter(
      (comp): comp is PipelineComponentType & { className: string } =>
        Boolean(comp?.className)
    );
    const embedders = (components?.embedders || []).filter(
      (comp): comp is PipelineComponentType & { className: string } =>
        Boolean(comp?.className)
    );
    const thumbnailers = (components?.thumbnailers || []).filter(
      (comp): comp is PipelineComponentType & { className: string } =>
        Boolean(comp?.className)
    );

    return { parsers, embedders, thumbnailers };
  }, [components]);

  const componentByClassName = useMemo(() => {
    const map = new Map<
      string,
      PipelineComponentType & { className: string }
    >();
    for (const comp of [
      ...componentsByStage.parsers,
      ...componentsByStage.embedders,
      ...componentsByStage.thumbnailers,
    ]) {
      map.set(comp.className, comp);
    }
    return map;
  }, [componentsByStage]);

  const normalizedSupportedFileTypes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const comp of componentByClassName.values()) {
      const fileTypes = (comp.supportedFileTypes || [])
        .filter((ft): ft is NonNullable<typeof ft> => Boolean(ft))
        .map((ft) => String(ft).toLowerCase());
      map.set(comp.className, fileTypes);
    }
    return map;
  }, [componentByClassName]);

  // Memoize all current selections to avoid repeated lookups during render
  const currentSelections = useMemo(() => {
    if (!settings) return {};
    const selections: Record<string, Record<string, string | null>> = {};
    for (const stage of Object.keys(STAGE_CONFIG) as StageType[]) {
      const mapping = settings[STAGE_CONFIG[stage].settingsKey] as
        | Record<string, string>
        | null
        | undefined;
      selections[stage] = {};
      for (const mime of SUPPORTED_MIME_TYPES) {
        selections[stage][mime.value] = mapping?.[mime.value] ?? null;
      }
    }
    return selections;
  }, [settings]);

  // Get current selection for a stage and MIME type (uses memoized cache)
  const getCurrentSelection = useCallback(
    (stage: StageType, mimeType: string): string | null => {
      return currentSelections[stage]?.[mimeType] ?? null;
    },
    [currentSelections]
  );

  // Get components for a stage, filtered by MIME type support
  const getComponentsForStage = useCallback(
    (stage: StageType, mimeType: string): PipelineComponentType[] => {
      const stageComponents = componentsByStage[stage] || [];

      // Pre-compute normalized values for comparison
      const mimeTypeLower = mimeType.toLowerCase();
      // Use lookup map to get short label (e.g., "text/plain" → "TXT")
      const mimeShortLower = MIME_TO_SHORT_LABEL[mimeType]?.toLowerCase();

      // Filter by supported file types if available
      return stageComponents.filter((comp) => {
        // If no supportedFileTypes specified, assume it supports all
        const fileTypes =
          normalizedSupportedFileTypes.get(comp.className) || [];
        if (fileTypes.length === 0) {
          return true;
        }
        // If MIME type is unknown (no short label mapping), exclude component
        if (!mimeShortLower) {
          return false;
        }
        // Check if the MIME type matches any supported file type
        return fileTypes.some(
          (ft) => ft === mimeShortLower || ft === mimeTypeLower
        );
      });
    },
    [componentsByStage, normalizedSupportedFileTypes]
  );

  const getComponentSettingsSchema = useCallback(
    (className: string): SettingsSchemaEntry[] => {
      const component = componentByClassName.get(className);
      return (component?.settingsSchema || []).filter(
        (entry): entry is SettingsSchemaEntry => Boolean(entry)
      );
    },
    [componentByClassName]
  );

  const getSecretSettingsForComponent = useCallback(
    (className: string): SettingsSchemaEntry[] => {
      return getComponentSettingsSchema(className).filter(
        (entry) => entry.settingType === "secret"
      );
    },
    [getComponentSettingsSchema]
  );

  // Check if component has secrets configured
  const hasSecrets = useCallback(
    (className: string): boolean => {
      return settings?.componentsWithSecrets?.includes(className) || false;
    },
    [settings]
  );

  // Look up a component's display name by className from loaded components data
  const getComponentDisplayNameByClassName = useCallback(
    (className: string): string => {
      const component = componentByClassName.get(className);
      return getComponentDisplayName(className, component?.title || undefined);
    },
    [componentByClassName]
  );

  // Handle component selection
  const handleSelectComponent = useCallback(
    (stage: StageType, mimeType: string, className: string) => {
      const currentMapping =
        (settings?.[STAGE_CONFIG[stage].settingsKey] as
          | Record<string, string>
          | undefined) ?? {};
      const newMapping = {
        ...currentMapping,
        [mimeType]: className,
      };

      // Store pending auto-expand info (will be processed in mutation onCompleted)
      pendingAutoExpandRef.current = { stage, mimeType, className };

      updateSettings({
        variables: {
          [STAGE_CONFIG[stage].settingsKey]: newMapping,
        },
      });
    },
    [settings, updateSettings]
  );

  // Handle MIME type change for a stage
  const handleMimeTypeChange = useCallback(
    (stage: StageType, mimeType: string) => {
      setSelectedMimeTypes((prev) => ({
        ...prev,
        [stage]: mimeType,
      }));
    },
    []
  );

  // Toggle advanced settings
  const toggleAdvancedSettings = useCallback((key: string) => {
    setExpandedSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // Handle secrets modal
  const handleAddSecrets = useCallback(
    (componentPath?: string) => {
      const path = componentPath || "";
      setSecretsComponentPath(path);

      const secretSettings = path ? getSecretSettingsForComponent(path) : [];
      const template =
        secretSettings.length > 0
          ? Object.fromEntries(secretSettings.map((entry) => [entry.name, ""]))
          : { api_key: "" };
      setSecretsValue(JSON.stringify(template, null, 2));
      setShowSecretsModal(true);
    },
    [getSecretSettingsForComponent]
  );

  const handleSaveSecrets = useCallback(() => {
    const componentPath = secretsComponentPath.trim();
    if (!componentPath) {
      toast.error("Please select a component before saving secrets.");
      return;
    }

    const component = componentByClassName.get(componentPath);
    if (!component) {
      toast.error("Selected component is not available.");
      return;
    }

    const secretSettings = getSecretSettingsForComponent(componentPath);
    if (secretSettings.length === 0) {
      toast.error("Selected component does not accept secret settings.");
      return;
    }

    try {
      const secrets = JSON.parse(secretsValue || "{}");
      const secretsJson = JSON.stringify(secrets);
      const secretsBytes = new TextEncoder().encode(secretsJson).length;
      if (secretsBytes > PIPELINE_UI.MAX_SECRET_SIZE_BYTES) {
        toast.error(
          `Secrets payload exceeds ${PIPELINE_UI.MAX_SECRET_SIZE_BYTES} bytes.`
        );
        return;
      }

      const missingRequired = secretSettings.filter((entry) => {
        if (!entry.required) return false;
        const value = secrets?.[entry.name];
        return value === undefined || value === null || value === "";
      });
      if (missingRequired.length > 0) {
        const missingLabels = missingRequired.map((entry) =>
          formatSettingLabel(entry.name, entry.description)
        );
        toast.error(`Missing required secrets: ${missingLabels.join(", ")}`);
        return;
      }

      updateSecrets({
        variables: {
          componentPath,
          secrets,
          merge: true,
        },
      });
    } catch (err) {
      toast.error("Secrets must be valid JSON.");
    }
  }, [
    componentByClassName,
    getSecretSettingsForComponent,
    secretsComponentPath,
    secretsValue,
    updateSecrets,
  ]);

  const handleDeleteSecretsClick = useCallback((componentPath: string) => {
    setDeleteSecretsPath(componentPath);
    setShowDeleteSecretsConfirm(true);
  }, []);

  const handleConfirmDeleteSecrets = useCallback(() => {
    deleteSecrets({
      variables: {
        componentPath: deleteSecretsPath,
      },
    });
    setShowDeleteSecretsConfirm(false);
    setDeleteSecretsPath("");
  }, [deleteSecrets, deleteSecretsPath]);

  // Handle default embedder
  const handleEditDefaultEmbedder = useCallback(() => {
    setDefaultEmbedderValue(settings?.defaultEmbedder || "");
    setShowDefaultEmbedderModal(true);
  }, [settings]);

  const handleSaveDefaultEmbedder = useCallback(() => {
    updateSettings({
      variables: {
        defaultEmbedder: defaultEmbedderValue || null,
      },
    });
    setShowDefaultEmbedderModal(false);
  }, [defaultEmbedderValue, updateSettings]);

  // Format date
  const formatDate = useCallback((dateStr: string | null | undefined) => {
    if (!dateStr) return "Never";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  }, []);

  // Render a pipeline stage using the extracted subcomponent
  const renderStage = useCallback(
    (stage: StageType) => {
      const config = STAGE_CONFIG[stage];
      const mimeType = selectedMimeTypes[stage];
      const stageComponents = getComponentsForStage(stage, mimeType);
      const currentSelection = getCurrentSelection(stage, mimeType);
      const settingsKey = `${stage}-${mimeType}`;
      const isExpanded = expandedSettings[settingsKey] || false;
      const secretSettings = currentSelection
        ? getSecretSettingsForComponent(currentSelection)
        : [];

      // Filter to ensure components have className defined
      const filteredComponents = stageComponents.filter(
        (comp): comp is PipelineComponentType & { className: string } =>
          Boolean(comp?.className)
      );

      return (
        <PipelineStageSection
          key={stage}
          stage={stage}
          config={config}
          mimeType={mimeType}
          components={filteredComponents}
          currentSelection={currentSelection}
          secretSettings={secretSettings}
          hasSecretsConfigured={hasSecrets(currentSelection || "")}
          isExpanded={isExpanded}
          settingsKey={settingsKey}
          updating={updating}
          onMimeTypeChange={handleMimeTypeChange}
          onSelectComponent={handleSelectComponent}
          onToggleSettings={toggleAdvancedSettings}
          onAddSecrets={handleAddSecrets}
          onDeleteSecrets={handleDeleteSecretsClick}
        />
      );
    },
    [
      selectedMimeTypes,
      getComponentsForStage,
      getCurrentSelection,
      expandedSettings,
      getSecretSettingsForComponent,
      hasSecrets,
      handleMimeTypeChange,
      handleSelectComponent,
      toggleAdvancedSettings,
      handleAddSecrets,
      handleDeleteSecretsClick,
      updating,
    ]
  );

  // Loading state
  if (settingsLoading || componentsLoading) {
    return (
      <Container>
        <LoadingContainer>
          <Spinner size="lg" />
          <span>Loading pipeline settings...</span>
        </LoadingContainer>
      </Container>
    );
  }

  // Error state
  if (settingsError) {
    return (
      <Container>
        <BackButton onClick={() => navigate("/admin/settings")}>
          <ChevronLeft />
          Back to Admin Settings
        </BackButton>
        <ErrorContainer>
          <AlertTriangle />
          <h3>Error Loading Settings</h3>
          <ErrorMessage>
            {settingsError.message ||
              "Unable to load pipeline settings. You may not have permission to view this page."}
          </ErrorMessage>
          <Button variant="primary" onClick={() => refetchSettings()}>
            Try Again
          </Button>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <BackButton onClick={() => navigate("/admin/settings")}>
        <ChevronLeft />
        Back to Admin Settings
      </BackButton>

      <PageHeader>
        <PageTitle>
          <Settings />
          Pipeline Configuration
        </PageTitle>
        <PageDescription>
          Configure how documents are processed through the ingestion pipeline.
          Select components for each stage based on file type.
        </PageDescription>
        {settings?.modified && (
          <LastModified>
            <Info />
            Last modified: {formatDate(settings.modified)}
            {settings.modifiedBy?.username &&
              ` by ${settings.modifiedBy.username}`}
          </LastModified>
        )}
      </PageHeader>

      <WarningBanner>
        <AlertTriangle />
        <WarningText>
          <strong>Superuser Only:</strong> Changes affect all users and take
          effect immediately for new uploads. Existing documents are not
          reprocessed.
        </WarningText>
      </WarningBanner>

      {/* Pipeline Flow */}
      <PipelineFlow>
        <BookendStage $variant="start">
          <Upload />
          <BookendText $variant="start">Document Upload</BookendText>
        </BookendStage>

        <PipelineConnector />
        {renderStage("parsers")}

        <PipelineConnector />
        {renderStage("thumbnailers")}

        <PipelineConnector />
        {renderStage("embedders")}

        <PipelineConnector />
        <BookendStage $variant="end">
          <Search />
          <BookendText $variant="end">Ready for Search</BookendText>
        </BookendStage>
      </PipelineFlow>

      {/* Default Embedder Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Cpu />
            Default Embedder
          </SectionTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEditDefaultEmbedder}
          >
            Edit
          </Button>
        </SectionHeader>
        <SectionDescription>
          Fallback embedder when no MIME-type-specific embedder is configured.
        </SectionDescription>
        <DefaultEmbedderDisplay>
          {settings?.defaultEmbedder ? (
            <DefaultEmbedderInfo>
              <ComponentName>
                {getComponentDisplayName(settings.defaultEmbedder)}
              </ComponentName>
              <DefaultEmbedderPath>
                {settings.defaultEmbedder}
              </DefaultEmbedderPath>
            </DefaultEmbedderInfo>
          ) : (
            <EmptyValue>Using system default</EmptyValue>
          )}
        </DefaultEmbedderDisplay>
      </Section>

      {/* Component Secrets Section */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Key />
            Component Secrets
          </SectionTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAddSecrets()}
          >
            Add Secrets
          </Button>
        </SectionHeader>
        <SectionDescription>
          Encrypted API keys and credentials for pipeline components.
        </SectionDescription>
        <SecretsList>
          {settings?.componentsWithSecrets &&
          settings.componentsWithSecrets.length > 0 ? (
            settings.componentsWithSecrets
              .filter((path): path is string => Boolean(path))
              .map((componentPath) => (
                <SecretBadge key={componentPath}>
                  <Key />
                  {getComponentDisplayNameByClassName(componentPath)}
                  <IconButton
                    $danger
                    onClick={() => handleDeleteSecretsClick(componentPath)}
                    title="Delete secrets"
                  >
                    <Trash2 />
                  </IconButton>
                </SecretBadge>
              ))
          ) : (
            <EmptyValue>No component secrets configured</EmptyValue>
          )}
        </SecretsList>
      </Section>

      {/* Reset to Defaults */}
      <ActionButtons>
        <Button
          variant="secondary"
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
        >
          <RotateCcw style={{ width: 16, height: 16, marginRight: 8 }} />
          Reset to Defaults
        </Button>
      </ActionButtons>

      {/* Reset Confirmation Modal */}
      <Modal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        size="sm"
      >
        <ModalHeader
          title="Reset to Defaults"
          onClose={() => setShowResetConfirm(false)}
        />
        <ModalBody>
          <WarningBanner>
            <AlertTriangle />
            <WarningText>
              This will reset all pipeline settings to their Django
              configuration defaults. This action cannot be undone.
            </WarningText>
          </WarningBanner>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setShowResetConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => resetSettings()}
            loading={resetting}
          >
            <RotateCcw style={{ width: 16, height: 16, marginRight: 8 }} />
            Reset Settings
          </Button>
        </ModalFooter>
      </Modal>

      {/* Secrets Modal */}
      <Modal
        open={showSecretsModal}
        onClose={() => setShowSecretsModal(false)}
        size="lg"
      >
        <ModalHeader
          title="Configure Component Secrets"
          onClose={() => setShowSecretsModal(false)}
        />
        <ModalBody>
          <WarningBanner>
            <AlertTriangle />
            <WarningText>
              <strong>Security Notice:</strong> Secrets are encrypted and stored
              securely. They will never be displayed again after saving.
            </WarningText>
          </WarningBanner>
          <FormField>
            <FormLabel>Component Class Path</FormLabel>
            <Input
              id="secrets-component-path"
              value={secretsComponentPath}
              onChange={(e) => setSecretsComponentPath(e.target.value)}
              placeholder="e.g., opencontractserver.pipeline.parsers.llamaparse_parser.LlamaParseParser"
              fullWidth
            />
            <FormHelperText>
              Full Python class path for the component.
            </FormHelperText>
          </FormField>
          <JsonEditor>
            <FormLabel>Secrets (JSON)</FormLabel>
            <Textarea
              id="secrets-value"
              value={secretsValue}
              onChange={(e) => setSecretsValue(e.target.value)}
              placeholder='{"api_key": "..."}'
              fullWidth
              autoResize
              maxRows={10}
              style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
            />
            <FormHelperText>
              JSON object with secret key-value pairs.
            </FormHelperText>
          </JsonEditor>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setShowSecretsModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveSecrets}
            loading={updatingSecrets}
            disabled={!secretsComponentPath || !secretsValue}
          >
            <Key style={{ width: 16, height: 16, marginRight: 8 }} />
            Save Secrets
          </Button>
        </ModalFooter>
      </Modal>

      {/* Default Embedder Modal */}
      <Modal
        open={showDefaultEmbedderModal}
        onClose={() => setShowDefaultEmbedderModal(false)}
        size="md"
      >
        <ModalHeader
          title="Edit Default Embedder"
          onClose={() => setShowDefaultEmbedderModal(false)}
        />
        <ModalBody>
          <FormField>
            <FormLabel>Default Embedder Class Path</FormLabel>
            <Input
              id="default-embedder"
              value={defaultEmbedderValue}
              onChange={(e) => setDefaultEmbedderValue(e.target.value)}
              placeholder="e.g., opencontractserver.pipeline.embedders.modern_bert_embedder.ModernBERTEmbedder"
              fullWidth
            />
            <FormHelperText>
              Full Python class path. Leave empty to use system default.
            </FormHelperText>
          </FormField>
          {components?.embedders && components.embedders.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <FormLabel>Available Embedders:</FormLabel>
              {components.embedders
                .filter(
                  (e): e is PipelineComponentType & { className: string } =>
                    Boolean(e?.className)
                )
                .map((e) => (
                  <div
                    key={e.className}
                    style={{
                      padding: "0.75rem",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      borderRadius: "8px",
                      marginBottom: "0.5rem",
                      background:
                        defaultEmbedderValue === e.className
                          ? "#e0e7ff"
                          : "#f8fafc",
                      border: `1px solid ${
                        defaultEmbedderValue === e.className
                          ? "#6366f1"
                          : "#e2e8f0"
                      }`,
                    }}
                    onClick={() => setDefaultEmbedderValue(e.className)}
                  >
                    <strong>{e.title || e.name}</strong>
                    {e.vectorSize && (
                      <span style={{ color: "#64748b", marginLeft: "0.5rem" }}>
                        ({e.vectorSize}d)
                      </span>
                    )}
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        fontFamily: "monospace",
                        marginTop: "0.25rem",
                      }}
                    >
                      {e.className}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setShowDefaultEmbedderModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveDefaultEmbedder}
            loading={updating}
          >
            <Save style={{ width: 16, height: 16, marginRight: 8 }} />
            Save
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Secrets Confirmation Modal */}
      <Modal
        open={showDeleteSecretsConfirm}
        onClose={() => setShowDeleteSecretsConfirm(false)}
        size="sm"
      >
        <ModalHeader
          title="Delete Component Secrets"
          onClose={() => setShowDeleteSecretsConfirm(false)}
        />
        <ModalBody>
          <WarningBanner>
            <AlertTriangle />
            <WarningText>
              Are you sure you want to delete secrets for{" "}
              <strong>
                {getComponentDisplayNameByClassName(deleteSecretsPath)}
              </strong>
              ? This action cannot be undone.
            </WarningText>
          </WarningBanner>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setShowDeleteSecretsConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmDeleteSecrets}
            loading={deletingSecrets}
          >
            <Trash2 style={{ width: 16, height: 16, marginRight: 8 }} />
            Delete Secrets
          </Button>
        </ModalFooter>
      </Modal>
    </Container>
  );
};

export default SystemSettings;
