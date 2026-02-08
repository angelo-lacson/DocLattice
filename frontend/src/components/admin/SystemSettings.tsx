import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  memo,
} from "react";
import { useQuery, useMutation, gql } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import styled, { keyframes } from "styled-components";
import {
  Button,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
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
  Trash2,
  Check,
  CircleCheck,
  CircleAlert,
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
  overflow-x: clip;

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

// Animation keyframes
const etherealFlow = keyframes`
  0% { top: -10px; opacity: 0; transform: scale(0.6); }
  12% { opacity: 0.7; transform: scale(1); }
  80% { opacity: 0.5; transform: scale(0.8); }
  100% { top: calc(100% + 10px); opacity: 0; transform: scale(0.4); }
`;

const stageReveal = keyframes`
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
`;

const junctionPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.5); opacity: 0.1; }
`;

// Pipeline Flow Styles - Channel Layout
const PipelineFlowContainer = styled.div`
  position: relative;
  margin-bottom: 2rem;
  isolation: isolate;
`;

const ChannelTrack = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: ${PIPELINE_UI.CHANNEL_WIDTH_PX}px;
  z-index: 1;
  pointer-events: none;
`;

const ChannelGlow = styled.div`
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  width: 18px;
  background: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}08;
  border-radius: 10px;
`;

const ChannelCenterLine = styled.div`
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  width: 2px;
  background: #e0e0e0;
  border-radius: 1px;
`;

const FlowParticle = styled.div<{
  $size: number;
  $xOffset: number;
  $duration: number;
  $delay: number;
}>`
  position: absolute;
  left: ${(props) => props.$xOffset}px;
  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size * 1.8}px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}90,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}20
  );
  box-shadow: 0 0 ${(props) => props.$size * 2}px
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}30;
  animation: ${etherealFlow} ${(props) => props.$duration}s ease-in-out infinite;
  animation-delay: ${(props) => props.$delay}s;
  opacity: 0;
  filter: blur(0.5px);
`;

const PipelineContentColumn = styled.div`
  position: relative;
  z-index: 3;
`;

const StageRow = styled.div<{ $delay?: number }>`
  display: flex;
  align-items: stretch;
  animation: ${stageReveal} 0.5s ease-out both;
  animation-delay: ${(props) => `${0.1 + (props.$delay ?? 0) * 0.12}s`};
`;

const StageRowSpacer = styled.div`
  height: ${PIPELINE_UI.STAGE_SPACING_PX}px;
`;

const JunctionColumn = styled.div<{ $active?: boolean }>`
  width: ${PIPELINE_UI.CHANNEL_WIDTH_PX}px;
  flex-shrink: 0;
  position: relative;
`;

const JunctionDot = styled.div<{ $active?: boolean }>`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  width: ${PIPELINE_UI.JUNCTION_SIZE_PX}px;
  height: ${PIPELINE_UI.JUNCTION_SIZE_PX}px;
  border-radius: 50%;
  background: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#fff"};
  border: 2.5px solid
    ${(props) => (props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#D0D0D0")};
  box-shadow: ${(props) =>
    props.$active ? `0 0 12px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}40` : "none"};
  transition: all 0.4s ease;
`;

const JunctionPulseRing = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
  width: ${PIPELINE_UI.JUNCTION_SIZE_PX + 16}px;
  height: ${PIPELINE_UI.JUNCTION_SIZE_PX + 16}px;
  border-radius: 50%;
  background: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}12;
  animation: ${junctionPulse} 2.5s ease-in-out infinite;
`;

const ConnectorArm = styled.div<{ $active?: boolean }>`
  width: ${PIPELINE_UI.CONNECTOR_ARM_WIDTH_PX}px;
  position: relative;
  flex-shrink: 0;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1.5px;
    background: ${(props) =>
      props.$active
        ? `linear-gradient(90deg, ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}30, ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}15)`
        : "#E0E0E0"};
    transform: translateY(-50%);
    transition: background 0.4s;
  }
`;

const StageCardContainer = styled.div<{ $active?: boolean }>`
  flex: 1;
  background: #fff;
  border-radius: 14px;
  border: 1px solid
    ${(props) =>
      props.$active ? `${PIPELINE_UI.PRIMARY_ACCENT_COLOR}25` : "#EBEBEB"};
  box-shadow: ${(props) =>
    props.$active
      ? `0 2px 12px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}08, 0 1px 4px rgba(0, 0, 0, 0.03)`
      : "0 1px 4px rgba(0, 0, 0, 0.03)"};
  position: relative;
  transition: all 0.3s ease;
  overflow: hidden;
`;

const StageCardAccentBar = styled.div`
  position: absolute;
  top: 0;
  left: 20px;
  right: 20px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: linear-gradient(
    90deg,
    transparent,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}60,
    transparent
  );
`;

const StageCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
`;

const StageNumberBadge = styled.span<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: ${(props) =>
    props.$active ? `${PIPELINE_UI.PRIMARY_ACCENT_COLOR}10` : "#F5F5F5"};
  font-size: 0.6875rem;
  font-weight: 700;
  color: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#BBB"};
  transition: all 0.3s;
`;

const StageHeaderInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
`;

const StageTitle = styled.h2`
  font-size: 0.9375rem;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
  letter-spacing: -0.01em;
`;

const StageSubtitle = styled.p`
  font-size: 0.75rem;
  color: #999;
  margin: 0.125rem 0 0 0;
`;

const MimeSelector = styled.div`
  display: flex;
  gap: 0.3125rem;
`;

const MimeButton = styled.button<{ $active: boolean }>`
  padding: 0.1875rem 0.5625rem;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: none;
  background: ${(props) =>
    props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#F0F0F0"};
  color: ${(props) => (props.$active ? "#fff" : "#999")};
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${(props) =>
      props.$active ? PIPELINE_UI.PRIMARY_ACCENT_COLOR : "#E8E8E8"};
    color: ${(props) => (props.$active ? "#fff" : "#666")};
  }
`;

const StageCardContent = styled.div`
  padding: 0 1.25rem 1.125rem;
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

// Intake and Output Points
const IntakeCard = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 1.125rem 1.5rem;
  border-radius: 14px;
  border: 1.5px dashed #ddd;
  background: #fafafa;
  transition: all 0.25s ease;

  svg {
    width: 20px;
    height: 20px;
    color: #aaa;
  }
`;

const IntakeText = styled.span`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #888;
`;

const IntakeNode = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}50;
  background: radial-gradient(
    circle,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}20,
    transparent
  );
  display: flex;
  align-items: center;
  justify-content: center;
`;

const IntakeNodeCenter = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${PIPELINE_UI.PRIMARY_ACCENT_COLOR};
  box-shadow: 0 0 8px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}50;
`;

const OutputCheckmark = styled.div`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR},
    ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}dd
  );
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px ${PIPELINE_UI.PRIMARY_ACCENT_COLOR}35;

  svg {
    width: 12px;
    height: 12px;
    color: #fff;
  }
`;

const OutputInfo = styled.div`
  flex: 1;
  padding: 0.5rem 0;
`;

const OutputTitle = styled.span`
  font-size: 0.8125rem;
  font-weight: 700;
  color: #666;
`;

const OutputSubtitle = styled.p`
  margin: 0.125rem 0 0;
  font-size: 0.6875rem;
  color: #aaa;
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

const SecretKeyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const SecretKeyRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.8125rem;
`;

const SecretKeyName = styled.span`
  font-weight: 500;
  color: #1e293b;
  font-family: monospace;
  font-size: 0.75rem;
`;

const SecretStatusIndicator = styled.span<{ $populated: boolean }>`
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

const SecretFieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const SecretFieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const SecretFieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
// Flow Particles Subcomponent
// ============================================================================

/**
 * Animated particles flowing through the pipeline channel.
 * Uses deterministic pseudo-random values for stable rendering.
 */
const FlowParticles = memo(() => {
  const particles = useMemo(() => {
    return Array.from({ length: PIPELINE_UI.FLOW_PARTICLE_COUNT }).map(
      (_, i) => {
        const size = 3 + (((i * 7 + 3) % 11) / 11) * 4;
        const xOffset =
          8 + (((i * 13 + 5) % 17) / 17) * (PIPELINE_UI.CHANNEL_WIDTH_PX - 16);
        const duration = 3 + (((i * 11 + 7) % 13) / 13) * 2.5;
        const delay = i * (duration / PIPELINE_UI.FLOW_PARTICLE_COUNT);
        return { size, xOffset, duration, delay };
      }
    );
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: PIPELINE_UI.CHANNEL_WIDTH_PX,
        height: "100%",
        overflow: "hidden",
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {particles.map((p, i) => (
        <FlowParticle
          key={i}
          $size={p.size}
          $xOffset={p.xOffset}
          $duration={p.duration}
          $delay={p.delay}
        />
      ))}
    </div>
  );
});

FlowParticles.displayName = "FlowParticles";

// ============================================================================
// Advanced Settings Panel Subcomponent
// ============================================================================

interface AdvancedSettingsPanelProps {
  currentSelection: string;
  configSettings: ComponentSettingSchemaType[];
  secretSettings: ComponentSettingSchemaType[];
  isExpanded: boolean;
  settingsKey: string;
  saving: boolean;
  onToggle: () => void;
  onAddSecrets: (componentPath: string) => void;
  onDeleteSecrets: (componentPath: string) => void;
  onSaveConfig: (componentPath: string, values: Record<string, string>) => void;
}

/**
 * Collapsible panel showing per-key settings for a selected component.
 * Shows editable fields for required/optional settings and status indicators
 * for secret keys.
 */
const AdvancedSettingsPanel = memo<AdvancedSettingsPanelProps>(
  ({
    currentSelection,
    configSettings,
    secretSettings,
    isExpanded,
    settingsKey,
    saving,
    onToggle,
    onAddSecrets,
    onDeleteSecrets,
    onSaveConfig,
  }) => {
    const allSettings = [...configSettings, ...secretSettings];
    const anyMissing = allSettings.some((s) => s.required && !s.hasValue);
    const anySecretsConfigured = secretSettings.some((s) => s.hasValue);

    // Local editing state for non-secret settings
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [isDirty, setIsDirty] = useState(false);

    // Reset edit state when component selection changes
    useEffect(() => {
      const initial: Record<string, string> = {};
      for (const entry of configSettings) {
        initial[entry.name] =
          entry.currentValue != null ? String(entry.currentValue) : "";
      }
      setEditValues(initial);
      setIsDirty(false);
    }, [currentSelection, configSettings]);

    const handleFieldChange = useCallback((name: string, value: string) => {
      setEditValues((prev) => ({ ...prev, [name]: value }));
      setIsDirty(true);
    }, []);

    const handleSave = useCallback(() => {
      onSaveConfig(currentSelection, editValues);
      setIsDirty(false);
    }, [currentSelection, editValues, onSaveConfig]);

    const hasSettings = allSettings.length > 0;

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
          {anyMissing && (
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
            {hasSettings ? (
              <>
                {/* Non-secret (required/optional) settings */}
                {configSettings.length > 0 && (
                  <FormField>
                    <FormLabel>
                      <Settings
                        style={{ width: 14, height: 14, marginRight: 6 }}
                      />
                      Configuration
                    </FormLabel>
                    <SecretFieldGroup>
                      {configSettings.map((entry) => (
                        <SecretFieldRow key={entry.name}>
                          <SecretFieldHeader>
                            <FormLabel
                              style={{ marginBottom: 0 }}
                              htmlFor={`config-${settingsKey}-${entry.name}`}
                            >
                              {formatSettingLabel(
                                entry.name,
                                entry.description
                              )}
                            </FormLabel>
                            {entry.required && (
                              <RequiredBadge>
                                <AlertTriangle />
                                Required
                              </RequiredBadge>
                            )}
                          </SecretFieldHeader>
                          {entry.pythonType === "bool" ? (
                            <select
                              id={`config-${settingsKey}-${entry.name}`}
                              value={editValues[entry.name] ?? ""}
                              onChange={(e) =>
                                handleFieldChange(entry.name, e.target.value)
                              }
                              style={{
                                padding: "0.375rem 0.5rem",
                                borderRadius: "6px",
                                border: "1px solid #d1d5db",
                                fontSize: "0.875rem",
                                background: "white",
                              }}
                            >
                              <option value="">
                                Default
                                {entry.default != null
                                  ? ` (${entry.default})`
                                  : ""}
                              </option>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : (
                            <Input
                              id={`config-${settingsKey}-${entry.name}`}
                              value={editValues[entry.name] ?? ""}
                              onChange={(e) =>
                                handleFieldChange(entry.name, e.target.value)
                              }
                              placeholder={
                                entry.default != null
                                  ? `Default: ${entry.default}`
                                  : "Enter value..."
                              }
                              fullWidth
                            />
                          )}
                          {entry.envVar && (
                            <FormHelperText>
                              Env var: {entry.envVar}
                            </FormHelperText>
                          )}
                        </SecretFieldRow>
                      ))}
                    </SecretFieldGroup>
                    {isDirty && (
                      <div style={{ marginTop: "0.75rem" }}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSave}
                          loading={saving}
                        >
                          <Save
                            style={{ width: 14, height: 14, marginRight: 6 }}
                          />
                          Save Configuration
                        </Button>
                      </div>
                    )}
                  </FormField>
                )}

                {/* Secret settings */}
                {secretSettings.length > 0 && (
                  <FormField>
                    <FormLabel>
                      <Key style={{ width: 14, height: 14, marginRight: 6 }} />
                      Secret Keys
                    </FormLabel>
                    <SecretKeyList>
                      {secretSettings.map((entry) => (
                        <SecretKeyRow key={entry.name}>
                          <SecretKeyName>{entry.name}</SecretKeyName>
                          {entry.required && (
                            <RequiredBadge>
                              <AlertTriangle />
                              Required
                            </RequiredBadge>
                          )}
                          <SecretStatusIndicator $populated={!!entry.hasValue}>
                            {entry.hasValue ? (
                              <>
                                <CircleCheck /> Set
                              </>
                            ) : (
                              <>
                                <CircleAlert /> Not set
                              </>
                            )}
                          </SecretStatusIndicator>
                        </SecretKeyRow>
                      ))}
                    </SecretKeyList>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        marginTop: "0.75rem",
                      }}
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onAddSecrets(currentSelection)}
                      >
                        <Key
                          style={{ width: 14, height: 14, marginRight: 6 }}
                        />
                        {anySecretsConfigured
                          ? "Update Secrets"
                          : "Configure Secrets"}
                      </Button>
                      {anySecretsConfigured && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onDeleteSecrets(currentSelection)}
                        >
                          <Trash2
                            style={{ width: 14, height: 14, marginRight: 6 }}
                          />
                          Delete All
                        </Button>
                      )}
                    </div>
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
  stageIndex: number;
  config: (typeof STAGE_CONFIG)[StageType];
  mimeType: string;
  components: (PipelineComponentType & { className: string })[];
  currentSelection: string | null;
  configSettings: ComponentSettingSchemaType[];
  secretSettings: ComponentSettingSchemaType[];
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
  onSaveConfig: (componentPath: string, values: Record<string, string>) => void;
}

/**
 * Renders a complete pipeline stage with header, component grid, and settings.
 */
const PipelineStageSection = memo<PipelineStageSectionProps>(
  ({
    stage,
    stageIndex,
    config,
    mimeType,
    components,
    currentSelection,
    configSettings,
    secretSettings,
    isExpanded,
    settingsKey,
    updating,
    onMimeTypeChange,
    onSelectComponent,
    onToggleSettings,
    onAddSecrets,
    onDeleteSecrets,
    onSaveConfig,
  }) => {
    const hasSelection = currentSelection !== null;

    return (
      <StageRow $delay={stageIndex + 1}>
        <JunctionColumn $active={hasSelection}>
          {hasSelection && <JunctionPulseRing />}
          <JunctionDot $active={hasSelection} />
        </JunctionColumn>
        <ConnectorArm $active={hasSelection} />
        <StageCardContainer $active={hasSelection}>
          {hasSelection && <StageCardAccentBar />}
          <StageCardHeader>
            <StageHeaderInfo>
              <StageNumberBadge $active={hasSelection}>
                {stageIndex + 1}
              </StageNumberBadge>
              <div>
                <StageTitle>{config.title}</StageTitle>
                <StageSubtitle>{config.subtitle}</StageSubtitle>
              </div>
            </StageHeaderInfo>
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
          </StageCardHeader>
          <StageCardContent>
            {components.length > 0 ? (
              <ComponentGrid>
                {components
                  .filter(
                    (
                      comp
                    ): comp is PipelineComponentType & {
                      className: string;
                    } => Boolean(comp?.className)
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
                {SUPPORTED_MIME_TYPES.find((m) => m.value === mimeType)
                  ?.label || mimeType}
              </NoComponents>
            )}

            {/* Advanced Settings */}
            {currentSelection && (
              <AdvancedSettingsPanel
                currentSelection={currentSelection}
                configSettings={configSettings}
                secretSettings={secretSettings}
                isExpanded={isExpanded}
                settingsKey={settingsKey}
                saving={updating}
                onToggle={() => onToggleSettings(settingsKey)}
                onAddSecrets={onAddSecrets}
                onDeleteSecrets={onDeleteSecrets}
                onSaveConfig={onSaveConfig}
              />
            )}
          </StageCardContent>
        </StageCardContainer>
      </StageRow>
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
  const [secretsValues, setSecretsValues] = useState<Record<string, string>>(
    {}
  );
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

  const {
    data: componentsData,
    loading: componentsLoading,
    refetch: refetchComponents,
  } = useQuery<PipelineComponentsQueryResult>(GET_PIPELINE_COMPONENTS, {
    fetchPolicy: "cache-and-network",
  });

  // Mutations
  const [updateSettings, { loading: updating }] = useMutation(
    UPDATE_PIPELINE_SETTINGS,
    {
      onCompleted: (data) => {
        if (data.updatePipelineSettings?.ok) {
          toast.success("Settings updated successfully");
          refetchSettings();
          refetchComponents();

          // Handle pending auto-expand for components requiring configuration
          const pending = pendingAutoExpandRef.current;
          if (pending) {
            const allSettings = getComponentSettingsSchema(pending.className);
            const hasAnySettings = allSettings.length > 0;
            const hasAnyMissing = allSettings.some(
              (s) => s.required && !s.hasValue
            );

            if (hasAnySettings && hasAnyMissing) {
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
          setSecretsValues({});
          refetchSettings();
          refetchComponents();
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
          refetchComponents();
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

  const getNonSecretSettingsForComponent = useCallback(
    (className: string): SettingsSchemaEntry[] => {
      return getComponentSettingsSchema(className).filter(
        (entry) => entry.settingType !== "secret"
      );
    },
    [getComponentSettingsSchema]
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
    (componentPath: string) => {
      setSecretsComponentPath(componentPath);
      const secretSettings = getSecretSettingsForComponent(componentPath);
      const template = Object.fromEntries(
        secretSettings.map((entry) => [entry.name, ""])
      );
      setSecretsValues(template);
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

    const secretSettings = getSecretSettingsForComponent(componentPath);
    if (secretSettings.length === 0) {
      toast.error("Selected component does not accept secret settings.");
      return;
    }

    // Build secrets object from only non-empty values (empty means "don't update")
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(secretsValues)) {
      if (value.trim()) {
        secrets[key] = value;
      }
    }

    if (Object.keys(secrets).length === 0) {
      toast.error("Please provide at least one secret value.");
      return;
    }

    const secretsJson = JSON.stringify(secrets);
    const secretsBytes = new TextEncoder().encode(secretsJson).length;
    if (secretsBytes > PIPELINE_UI.MAX_SECRET_SIZE_BYTES) {
      toast.error(
        `Secrets payload exceeds ${PIPELINE_UI.MAX_SECRET_SIZE_BYTES} bytes.`
      );
      return;
    }

    // Check required fields that have no existing value and no new value
    const missingRequired = secretSettings.filter((entry) => {
      if (!entry.required) return false;
      const newValue = secretsValues[entry.name]?.trim();
      // Missing if no new value provided AND no existing value
      return !newValue && !entry.hasValue;
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
  }, [
    getSecretSettingsForComponent,
    secretsComponentPath,
    secretsValues,
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

  // Handle saving non-secret component settings
  const handleSaveComponentSettings = useCallback(
    (componentPath: string, values: Record<string, string>) => {
      // Build the component_settings update: merge with existing
      const existing = settings?.componentSettings ?? {};
      const existingForComponent =
        (existing as Record<string, Record<string, unknown>>)[componentPath] ??
        {};

      // Coerce values to proper types based on schema
      const schema = getNonSecretSettingsForComponent(componentPath);
      const coerced: Record<string, unknown> = {};
      for (const entry of schema) {
        const raw = values[entry.name];
        if (raw === undefined || raw === "") continue;
        switch (entry.pythonType) {
          case "int":
            coerced[entry.name] = parseInt(raw, 10);
            break;
          case "float":
            coerced[entry.name] = parseFloat(raw);
            break;
          case "bool":
            coerced[entry.name] = raw === "true";
            break;
          default:
            coerced[entry.name] = raw;
        }
      }

      const updatedComponentSettings = {
        ...existing,
        [componentPath]: { ...existingForComponent, ...coerced },
      };

      updateSettings({
        variables: {
          componentSettings: updatedComponentSettings,
        },
      });
    },
    [settings, getNonSecretSettingsForComponent, updateSettings]
  );

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
    (stage: StageType, stageIndex: number) => {
      const config = STAGE_CONFIG[stage];
      const mimeType = selectedMimeTypes[stage];
      const stageComponents = getComponentsForStage(stage, mimeType);
      const currentSelection = getCurrentSelection(stage, mimeType);
      const settingsKey = `${stage}-${mimeType}`;
      const isExpanded = expandedSettings[settingsKey] || false;
      const configSettings = currentSelection
        ? getNonSecretSettingsForComponent(currentSelection)
        : [];
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
          stageIndex={stageIndex}
          config={config}
          mimeType={mimeType}
          components={filteredComponents}
          currentSelection={currentSelection}
          configSettings={configSettings}
          secretSettings={secretSettings}
          isExpanded={isExpanded}
          settingsKey={settingsKey}
          updating={updating}
          onMimeTypeChange={handleMimeTypeChange}
          onSelectComponent={handleSelectComponent}
          onToggleSettings={toggleAdvancedSettings}
          onAddSecrets={handleAddSecrets}
          onDeleteSecrets={handleDeleteSecretsClick}
          onSaveConfig={handleSaveComponentSettings}
        />
      );
    },
    [
      selectedMimeTypes,
      getComponentsForStage,
      getCurrentSelection,
      expandedSettings,
      getNonSecretSettingsForComponent,
      getSecretSettingsForComponent,
      handleMimeTypeChange,
      handleSelectComponent,
      toggleAdvancedSettings,
      handleAddSecrets,
      handleDeleteSecretsClick,
      handleSaveComponentSettings,
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
      <PipelineFlowContainer>
        <ChannelTrack>
          <ChannelGlow />
          <ChannelCenterLine />
          <FlowParticles />
        </ChannelTrack>

        <PipelineContentColumn>
          <StageRow $delay={0}>
            <JunctionColumn $active>
              <IntakeNode>
                <IntakeNodeCenter />
              </IntakeNode>
            </JunctionColumn>
            <ConnectorArm $active />
            <IntakeCard>
              <Upload />
              <IntakeText>Document Upload</IntakeText>
            </IntakeCard>
          </StageRow>

          <StageRowSpacer />
          {renderStage("parsers", 0)}

          <StageRowSpacer />
          {renderStage("thumbnailers", 1)}

          <StageRowSpacer />
          {renderStage("embedders", 2)}

          <StageRowSpacer />
          <StageRow $delay={4}>
            <JunctionColumn $active>
              <OutputCheckmark>
                <Check />
              </OutputCheckmark>
            </JunctionColumn>
            <ConnectorArm />
            <OutputInfo>
              <OutputTitle>Ready for Search</OutputTitle>
              <OutputSubtitle>Pipeline complete</OutputSubtitle>
            </OutputInfo>
          </StageRow>
        </PipelineContentColumn>
      </PipelineFlowContainer>

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
        size="md"
      >
        <ModalHeader
          title={`Configure Secrets \u2014 ${getComponentDisplayNameByClassName(
            secretsComponentPath
          )}`}
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
          <SecretFieldGroup>
            {getSecretSettingsForComponent(secretsComponentPath).map(
              (entry) => (
                <SecretFieldRow key={entry.name}>
                  <SecretFieldHeader>
                    <FormLabel
                      style={{ marginBottom: 0 }}
                      htmlFor={`secret-${entry.name}`}
                    >
                      {formatSettingLabel(entry.name, entry.description)}
                    </FormLabel>
                    {entry.required && (
                      <RequiredBadge>
                        <AlertTriangle />
                        Required
                      </RequiredBadge>
                    )}
                    <SecretStatusIndicator $populated={!!entry.hasValue}>
                      {entry.hasValue ? (
                        <>
                          <CircleCheck /> Set
                        </>
                      ) : (
                        <>
                          <CircleAlert /> Not set
                        </>
                      )}
                    </SecretStatusIndicator>
                  </SecretFieldHeader>
                  <Input
                    id={`secret-${entry.name}`}
                    type="password"
                    value={secretsValues[entry.name] ?? ""}
                    onChange={(e) =>
                      setSecretsValues((prev) => ({
                        ...prev,
                        [entry.name]: e.target.value,
                      }))
                    }
                    placeholder={
                      entry.hasValue
                        ? "Leave blank to keep current value"
                        : "Enter value..."
                    }
                    fullWidth
                  />
                  {entry.envVar && (
                    <FormHelperText>
                      Can also be set via env var: {entry.envVar}
                    </FormHelperText>
                  )}
                </SecretFieldRow>
              )
            )}
          </SecretFieldGroup>
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
            disabled={
              !secretsComponentPath ||
              Object.values(secretsValues).every((v) => !v.trim())
            }
          >
            <Save style={{ width: 16, height: 16, marginRight: 8 }} />
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
