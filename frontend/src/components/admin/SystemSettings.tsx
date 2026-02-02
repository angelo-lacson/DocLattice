import React, { useState, useCallback, useRef } from "react";
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
} from "../../types/graphql-api";
import { getComponentIcon, getComponentDisplayName } from "./PipelineIcons";
import { PIPELINE_UI } from "../../assets/configurations/constants";

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
      }
      embedders {
        name
        title
        description
        className
        vectorSize
        supportedFileTypes
      }
      thumbnailers {
        name
        title
        description
        className
        supportedFileTypes
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
// Constants
// ============================================================================

const SUPPORTED_MIME_TYPES = [
  { value: "application/pdf", label: "PDF", shortLabel: "PDF" },
  { value: "text/plain", label: "Plain Text", shortLabel: "TXT" },
  {
    value:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word Document",
    shortLabel: "DOCX",
  },
];

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
  color: #6366f1;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.5rem 0;
  margin-bottom: 1rem;
  transition: color 0.15s ease;

  &:hover {
    color: #4f46e5;
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
    color: #6366f1;
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
    height: 24px;
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
  min-height: 120px;

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

// Components that require API keys or special configuration
const COMPONENTS_REQUIRING_CONFIG: Record<
  string,
  {
    fields: Array<{
      key: string;
      label: string;
      type: string;
      placeholder: string;
      required: boolean;
    }>;
  }
> = {
  llamaparse: {
    fields: [
      {
        key: "api_key",
        label: "LlamaParse API Key",
        type: "password",
        placeholder: "llx-...",
        required: true,
      },
    ],
  },
};

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
            const lowerName = pending.className.toLowerCase();
            const requiresConfig = Object.keys(
              COMPONENTS_REQUIRING_CONFIG
            ).some((key) => lowerName.includes(key));
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

  // Get current selection for a stage and MIME type
  const getCurrentSelection = useCallback(
    (stage: StageType, mimeType: string): string | null => {
      if (!settings) return null;
      const mapping = settings[STAGE_CONFIG[stage].settingsKey] as
        | Record<string, string>
        | null
        | undefined;
      return mapping?.[mimeType] ?? null;
    },
    [settings]
  );

  // Get components for a stage, filtered by MIME type support
  const getComponentsForStage = useCallback(
    (stage: StageType, mimeType: string): PipelineComponentType[] => {
      if (!components) return [];
      const stageComponents = components[stage] || [];

      // Pre-compute normalized values for comparison
      const mimeTypeLower = mimeType.toLowerCase();
      const mimeShort = mimeType.split("/")[1]?.toUpperCase();

      // Filter by supported file types if available
      return stageComponents.filter((comp): comp is PipelineComponentType => {
        if (!comp) return false;
        // If no supportedFileTypes specified, assume it supports all
        if (!comp.supportedFileTypes || comp.supportedFileTypes.length === 0) {
          return true;
        }
        // Check if the MIME type matches any supported file type
        return comp.supportedFileTypes.some((ft) => {
          if (!ft) return false;
          const ftLower = ft.toLowerCase();
          // Match either short form (e.g., "PDF") or full MIME type
          return (
            (mimeShort && ft.toUpperCase() === mimeShort) ||
            ftLower === mimeTypeLower
          );
        });
      });
    },
    [components]
  );

  // Check if a component requires configuration
  const getComponentConfig = useCallback((className: string) => {
    const lowerName = className.toLowerCase();
    for (const [key, config] of Object.entries(COMPONENTS_REQUIRING_CONFIG)) {
      if (lowerName.includes(key)) {
        return config;
      }
    }
    return null;
  }, []);

  // Check if component has secrets configured
  const hasSecrets = useCallback(
    (className: string): boolean => {
      return settings?.componentsWithSecrets?.includes(className) || false;
    },
    [settings]
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
  const handleAddSecrets = useCallback((componentPath?: string) => {
    setSecretsComponentPath(componentPath || "");
    setSecretsValue('{\n  "api_key": ""\n}');
    setShowSecretsModal(true);
  }, []);

  const handleSaveSecrets = useCallback(() => {
    try {
      const secrets = JSON.parse(secretsValue || "{}");
      updateSecrets({
        variables: {
          componentPath: secretsComponentPath,
          secrets,
          merge: true,
        },
      });
    } catch (err) {
      toast.error("Invalid JSON format for secrets");
    }
  }, [secretsComponentPath, secretsValue, updateSecrets]);

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

  // Render a pipeline stage
  const renderStage = useCallback(
    (stage: StageType) => {
      const config = STAGE_CONFIG[stage];
      const Icon = config.icon;
      const mimeType = selectedMimeTypes[stage];
      const stageComponents = getComponentsForStage(stage, mimeType);
      const currentSelection = getCurrentSelection(stage, mimeType);
      const settingsKey = `${stage}-${mimeType}`;
      const isExpanded = expandedSettings[settingsKey] || false;

      // Check if current selection requires config
      const selectedConfig = currentSelection
        ? getComponentConfig(currentSelection)
        : null;
      const needsConfig = selectedConfig && !hasSecrets(currentSelection || "");

      return (
        <PipelineStage $color={config.color} key={stage}>
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
            <MimeSelector role="group" aria-label="File type filter">
              {SUPPORTED_MIME_TYPES.map((mime) => (
                <MimeButton
                  key={mime.value}
                  $active={mimeType === mime.value}
                  onClick={() => handleMimeTypeChange(stage, mime.value)}
                  aria-pressed={mimeType === mime.value}
                  aria-label={`Filter by ${mime.label}`}
                >
                  {mime.shortLabel}
                </MimeButton>
              ))}
            </MimeSelector>
          </StageHeader>
          <StageContent>
            {stageComponents.length > 0 ? (
              <ComponentGrid>
                {stageComponents
                  .filter(
                    (
                      comp
                    ): comp is PipelineComponentType & { className: string } =>
                      Boolean(comp?.className)
                  )
                  .map((comp) => {
                    const isSelected = currentSelection === comp.className;
                    const IconComponent = getComponentIcon(comp.className);
                    const displayName = getComponentDisplayName(
                      comp.className,
                      comp.title || undefined
                    );
                    const vectorSize = (
                      comp as PipelineComponentType & { vectorSize?: number }
                    ).vectorSize;

                    return (
                      <ComponentCard
                        key={comp.className}
                        $selected={isSelected}
                        $color={config.color}
                        onClick={() =>
                          handleSelectComponent(stage, mimeType, comp.className)
                        }
                        disabled={updating}
                        aria-pressed={isSelected}
                        aria-label={`Select ${displayName} as ${config.title.toLowerCase()}`}
                      >
                        {isSelected && (
                          <SelectedBadge $color={config.color}>
                            <Check />
                          </SelectedBadge>
                        )}
                        <ComponentIconWrapper>
                          <IconComponent size={PIPELINE_UI.ICON_SIZE} />
                        </ComponentIconWrapper>
                        <ComponentName>{displayName}</ComponentName>
                        {vectorSize && (
                          <VectorBadge>{vectorSize}d vectors</VectorBadge>
                        )}
                      </ComponentCard>
                    );
                  })}
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
              <AdvancedSettingsToggle
                $expanded={isExpanded}
                onClick={() => toggleAdvancedSettings(settingsKey)}
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
            )}

            {currentSelection && isExpanded && (
              <AdvancedSettingsContent
                $expanded={isExpanded}
                id={`settings-content-${settingsKey}`}
              >
                {selectedConfig ? (
                  <>
                    {hasSecrets(currentSelection) ? (
                      <FormField>
                        <FormLabel>API Credentials</FormLabel>
                        <SecretBadge>
                          <Key />
                          Secrets configured
                          <IconButton
                            $danger
                            onClick={() =>
                              handleDeleteSecretsClick(currentSelection)
                            }
                          >
                            <Trash2 />
                          </IconButton>
                        </SecretBadge>
                        <FormHelperText>
                          Click the trash icon to remove and reconfigure
                          secrets.
                        </FormHelperText>
                      </FormField>
                    ) : (
                      <FormField>
                        <FormLabel>
                          {selectedConfig.fields[0]?.label || "API Key"}
                        </FormLabel>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAddSecrets(currentSelection)}
                        >
                          <Key
                            style={{ width: 14, height: 14, marginRight: 6 }}
                          />
                          Configure API Key
                        </Button>
                        <FormHelperText>
                          This component requires an API key to function.
                        </FormHelperText>
                      </FormField>
                    )}
                  </>
                ) : (
                  <FormField>
                    <FormLabel>Component Path</FormLabel>
                    <DefaultEmbedderPath>
                      {currentSelection}
                    </DefaultEmbedderPath>
                    <FormHelperText>
                      This component has no additional configuration options.
                    </FormHelperText>
                  </FormField>
                )}
              </AdvancedSettingsContent>
            )}
          </StageContent>
        </PipelineStage>
      );
    },
    [
      selectedMimeTypes,
      getComponentsForStage,
      getCurrentSelection,
      expandedSettings,
      getComponentConfig,
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
                  {getComponentDisplayName(componentPath)}
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
              <strong>{deleteSecretsPath}</strong>? This action cannot be
              undone.
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
