import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, gql } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  Button,
  Input,
  Textarea,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@os-legal/ui";
import {
  Settings,
  ChevronLeft,
  Save,
  RotateCcw,
  AlertTriangle,
  X,
  FileText,
  Cpu,
  Image,
  Key,
  Info,
  Edit2,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  PipelineSettingsType,
  PipelineComponentsType,
} from "../../types/graphql-api";

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
// Styled Components
// ============================================================================

const Container = styled.div`
  padding: 2rem;
  max-width: 1200px;
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
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;

  svg {
    width: 20px;
    height: 20px;
    color: #6366f1;
  }
`;

const SectionDescription = styled.p`
  color: #64748b;
  font-size: 0.875rem;
  margin: 0 0 1rem 0;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
`;

const SettingCard = styled.div`
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
`;

const SettingLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const SettingValue = styled.div`
  font-size: 0.875rem;
  color: #1e293b;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  word-break: break-all;
`;

const EmptyValue = styled.span`
  color: #94a3b8;
  font-style: italic;
`;

const MimeTypeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const MimeTypeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const MimeTypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 9999px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
`;

const ComponentPath = styled.span`
  flex: 1;
  font-size: 0.875rem;
  color: #1e293b;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  word-break: break-all;
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

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
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

const FormField = styled.div`
  margin-bottom: 1rem;
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

const JsonEditor = styled.div`
  margin-bottom: 1rem;
`;

const IconButton = styled.button<{ $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: ${(props) => (props.$danger ? "#fef2f2" : "#f1f5f9")};
  color: ${(props) => (props.$danger ? "#dc2626" : "#475569")};

  &:hover {
    background: ${(props) => (props.$danger ? "#fee2e2" : "#e2e8f0")};
    color: ${(props) => (props.$danger ? "#b91c1c" : "#1e293b")};
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

// ============================================================================
// Component
// ============================================================================

interface PipelineSettingsQueryResult {
  pipelineSettings: PipelineSettingsType;
}

interface PipelineComponentsQueryResult {
  pipelineComponents: PipelineComponentsType;
}

export const SystemSettings: React.FC = () => {
  const navigate = useNavigate();

  // State for edit modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSection, setEditSection] = useState<
    "parsers" | "embedders" | "thumbnailers" | "default_embedder" | null
  >(null);
  const [editValue, setEditValue] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSecretsModal, setShowSecretsModal] = useState(false);
  const [secretsComponentPath, setSecretsComponentPath] = useState("");
  const [secretsValue, setSecretsValue] = useState("");
  const [showDeleteSecretsConfirm, setShowDeleteSecretsConfirm] =
    useState(false);
  const [deleteSecretsPath, setDeleteSecretsPath] = useState("");

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
          setShowEditModal(false);
          refetchSettings();
        } else {
          toast.error(
            data.updatePipelineSettings?.message || "Failed to update settings"
          );
        }
      },
      onError: (err) => {
        toast.error(`Error updating settings: ${err.message}`);
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

  // Helper to format MIME type mappings for display
  const formatMappings = useCallback(
    (
      mappings: Record<string, string> | null | undefined
    ): Array<{ mimeType: string; component: string }> => {
      if (!mappings || typeof mappings !== "object") return [];
      return Object.entries(mappings).map(([mimeType, component]) => ({
        mimeType,
        component: String(component),
      }));
    },
    []
  );

  // Get available components for dropdowns
  const availableParsers = useMemo(() => {
    return (
      components?.parsers?.map((p) => ({
        value: p?.className || "",
        label: p?.title || p?.name || "",
      })) || []
    );
  }, [components]);

  const availableEmbedders = useMemo(() => {
    return (
      components?.embedders?.map((e) => ({
        value: e?.className || "",
        label: `${e?.title || e?.name || ""} (${e?.vectorSize || "?"} dim)`,
      })) || []
    );
  }, [components]);

  const availableThumbnailers = useMemo(() => {
    return (
      components?.thumbnailers?.map((t) => ({
        value: t?.className || "",
        label: t?.title || t?.name || "",
      })) || []
    );
  }, [components]);

  // Handle edit button click
  const handleEdit = useCallback(
    (
      section: "parsers" | "embedders" | "thumbnailers" | "default_embedder"
    ) => {
      setEditSection(section);
      if (section === "default_embedder") {
        setEditValue(settings?.defaultEmbedder || "");
      } else if (section === "parsers") {
        setEditValue(JSON.stringify(settings?.preferredParsers || {}, null, 2));
      } else if (section === "embedders") {
        setEditValue(
          JSON.stringify(settings?.preferredEmbedders || {}, null, 2)
        );
      } else if (section === "thumbnailers") {
        setEditValue(
          JSON.stringify(settings?.preferredThumbnailers || {}, null, 2)
        );
      }
      setShowEditModal(true);
    },
    [settings]
  );

  // Handle save
  const handleSave = useCallback(() => {
    try {
      if (editSection === "default_embedder") {
        updateSettings({
          variables: {
            defaultEmbedder: editValue || null,
          },
        });
      } else if (editSection === "parsers") {
        const parsed = JSON.parse(editValue || "{}");
        updateSettings({
          variables: {
            preferredParsers: parsed,
          },
        });
      } else if (editSection === "embedders") {
        const parsed = JSON.parse(editValue || "{}");
        updateSettings({
          variables: {
            preferredEmbedders: parsed,
          },
        });
      } else if (editSection === "thumbnailers") {
        const parsed = JSON.parse(editValue || "{}");
        updateSettings({
          variables: {
            preferredThumbnailers: parsed,
          },
        });
      }
    } catch (err) {
      toast.error("Invalid JSON format");
    }
  }, [editSection, editValue, updateSettings]);

  // Handle secrets
  const handleAddSecrets = useCallback(() => {
    setSecretsComponentPath("");
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

  // Format date
  const formatDate = useCallback((dateStr: string | null | undefined) => {
    if (!dateStr) return "Never";
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  }, []);

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
          System Settings
        </PageTitle>
        <PageDescription>
          Configure system-wide document processing pipeline settings. Changes
          take effect immediately for new document processing tasks.
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
          <strong>Superuser Only:</strong> These settings affect all users and
          document processing across the entire system. Changes take effect
          immediately for new uploads. Existing documents are not affected.
        </WarningText>
      </WarningBanner>

      {/* Preferred Parsers */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <FileText />
            Preferred Parsers
          </SectionTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEdit("parsers")}
          >
            <Edit2 style={{ width: 14, height: 14, marginRight: 6 }} />
            Edit
          </Button>
        </SectionHeader>
        <SectionDescription>
          Configure which parser to use for each document MIME type.
        </SectionDescription>
        <MimeTypeList>
          {formatMappings(settings?.preferredParsers).length > 0 ? (
            formatMappings(settings?.preferredParsers).map(
              ({ mimeType, component }) => (
                <MimeTypeRow key={mimeType}>
                  <MimeTypeBadge>{mimeType}</MimeTypeBadge>
                  <ComponentPath>{component}</ComponentPath>
                </MimeTypeRow>
              )
            )
          ) : (
            <EmptyValue>No custom parser mappings configured</EmptyValue>
          )}
        </MimeTypeList>
      </Section>

      {/* Preferred Embedders */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Cpu />
            Preferred Embedders
          </SectionTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEdit("embedders")}
          >
            <Edit2 style={{ width: 14, height: 14, marginRight: 6 }} />
            Edit
          </Button>
        </SectionHeader>
        <SectionDescription>
          Configure which embedder to use for generating vector embeddings per
          MIME type.
        </SectionDescription>
        <MimeTypeList>
          {formatMappings(settings?.preferredEmbedders).length > 0 ? (
            formatMappings(settings?.preferredEmbedders).map(
              ({ mimeType, component }) => (
                <MimeTypeRow key={mimeType}>
                  <MimeTypeBadge>{mimeType}</MimeTypeBadge>
                  <ComponentPath>{component}</ComponentPath>
                </MimeTypeRow>
              )
            )
          ) : (
            <EmptyValue>No custom embedder mappings configured</EmptyValue>
          )}
        </MimeTypeList>
      </Section>

      {/* Default Embedder */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Cpu />
            Default Embedder
          </SectionTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEdit("default_embedder")}
          >
            <Edit2 style={{ width: 14, height: 14, marginRight: 6 }} />
            Edit
          </Button>
        </SectionHeader>
        <SectionDescription>
          The default embedder used when no MIME-type-specific embedder is
          configured.
        </SectionDescription>
        <SettingsGrid>
          <SettingCard>
            <SettingLabel>Current Default</SettingLabel>
            <SettingValue>
              {settings?.defaultEmbedder || (
                <EmptyValue>Using system default</EmptyValue>
              )}
            </SettingValue>
          </SettingCard>
        </SettingsGrid>
      </Section>

      {/* Preferred Thumbnailers */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Image />
            Preferred Thumbnailers
          </SectionTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleEdit("thumbnailers")}
          >
            <Edit2 style={{ width: 14, height: 14, marginRight: 6 }} />
            Edit
          </Button>
        </SectionHeader>
        <SectionDescription>
          Configure which thumbnailer to use for generating document previews
          per MIME type.
        </SectionDescription>
        <MimeTypeList>
          {formatMappings(settings?.preferredThumbnailers).length > 0 ? (
            formatMappings(settings?.preferredThumbnailers).map(
              ({ mimeType, component }) => (
                <MimeTypeRow key={mimeType}>
                  <MimeTypeBadge>{mimeType}</MimeTypeBadge>
                  <ComponentPath>{component}</ComponentPath>
                </MimeTypeRow>
              )
            )
          ) : (
            <EmptyValue>No custom thumbnailer mappings configured</EmptyValue>
          )}
        </MimeTypeList>
      </Section>

      {/* Component Secrets */}
      <Section>
        <SectionHeader>
          <SectionTitle>
            <Key />
            Component Secrets
          </SectionTitle>
          <Button variant="secondary" size="sm" onClick={handleAddSecrets}>
            <Key style={{ width: 14, height: 14, marginRight: 6 }} />
            Add Secrets
          </Button>
        </SectionHeader>
        <SectionDescription>
          Encrypted secrets (API keys, credentials) for pipeline components.
          Actual secret values are never exposed.
        </SectionDescription>
        <SecretsList>
          {settings?.componentsWithSecrets &&
          settings.componentsWithSecrets.length > 0 ? (
            settings.componentsWithSecrets.map((componentPath) =>
              componentPath ? (
                <SecretBadge key={componentPath}>
                  <Key />
                  {componentPath}
                  <IconButton
                    $danger
                    onClick={() => handleDeleteSecretsClick(componentPath)}
                    title="Delete secrets"
                  >
                    <Trash2 />
                  </IconButton>
                </SecretBadge>
              ) : null
            )
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

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        size="lg"
      >
        <ModalHeader
          title={`Edit ${
            editSection === "default_embedder"
              ? "Default Embedder"
              : editSection === "parsers"
              ? "Preferred Parsers"
              : editSection === "embedders"
              ? "Preferred Embedders"
              : "Preferred Thumbnailers"
          }`}
          onClose={() => setShowEditModal(false)}
        />
        <ModalBody>
          {editSection === "default_embedder" ? (
            <FormField>
              <FormLabel>Default Embedder Class Path</FormLabel>
              <Input
                id="default-embedder"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="e.g., opencontractserver.pipeline.embedders.openai_ada_embedder.OpenAIAdaEmbedder"
                fullWidth
              />
              <FormHelperText>
                Full Python class path for the default embedder. Leave empty to
                use system default.
              </FormHelperText>
              {availableEmbedders.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <FormLabel>Available Embedders:</FormLabel>
                  {availableEmbedders.map((e) => (
                    <div
                      key={e.value}
                      style={{
                        padding: "0.5rem",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                        borderRadius: "4px",
                        background:
                          editValue === e.value ? "#e0e7ff" : "transparent",
                      }}
                      onClick={() => setEditValue(e.value)}
                    >
                      <strong>{e.label}</strong>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#64748b",
                          fontFamily: "monospace",
                        }}
                      >
                        {e.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FormField>
          ) : (
            <JsonEditor>
              <FormLabel>
                {editSection === "parsers"
                  ? "Parser Mappings (MIME Type → Class Path)"
                  : editSection === "embedders"
                  ? "Embedder Mappings (MIME Type → Class Path)"
                  : "Thumbnailer Mappings (MIME Type → Class Path)"}
              </FormLabel>
              <Textarea
                id={`edit-${editSection}`}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder='{"application/pdf": "opencontractserver.pipeline..."}'
                fullWidth
                autoResize
                maxRows={15}
                style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
              />
              <FormHelperText>
                JSON object mapping MIME types to component class paths.
              </FormHelperText>
            </JsonEditor>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            <X style={{ width: 16, height: 16, marginRight: 8 }} />
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} loading={updating}>
            <Save style={{ width: 16, height: 16, marginRight: 8 }} />
            Save Changes
          </Button>
        </ModalFooter>
      </Modal>

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
          title="Add Component Secrets"
          onClose={() => setShowSecretsModal(false)}
        />
        <ModalBody>
          <WarningBanner>
            <AlertTriangle />
            <WarningText>
              <strong>Security Notice:</strong> Secrets are encrypted using
              Fernet symmetric encryption tied to Django's SECRET_KEY. If the
              SECRET_KEY is rotated, all secrets will become unrecoverable.
            </WarningText>
          </WarningBanner>
          <FormField>
            <FormLabel>Component Class Path</FormLabel>
            <Input
              id="secrets-component-path"
              value={secretsComponentPath}
              onChange={(e) => setSecretsComponentPath(e.target.value)}
              placeholder="e.g., opencontractserver.pipeline.embedders.openai_ada_embedder.OpenAIAdaEmbedder"
              fullWidth
            />
            <FormHelperText>
              Full Python class path for the component that needs secrets.
            </FormHelperText>
          </FormField>
          <JsonEditor>
            <FormLabel>Secrets (JSON)</FormLabel>
            <Textarea
              id="secrets-value"
              value={secretsValue}
              onChange={(e) => setSecretsValue(e.target.value)}
              placeholder='{"api_key": "sk-...", "secret_key": "..."}'
              fullWidth
              autoResize
              maxRows={10}
              style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
            />
            <FormHelperText>
              JSON object with secret key-value pairs. Values must be primitive
              types (strings, numbers, booleans).
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
