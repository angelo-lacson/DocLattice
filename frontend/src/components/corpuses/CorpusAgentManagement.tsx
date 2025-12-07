import React, { useState } from "react";
import { useQuery, useMutation, gql } from "@apollo/client";
import {
  Button,
  Table,
  Header,
  Message,
  Dimmer,
  Loader,
  Icon,
  Modal,
  Form,
  Input,
  TextArea,
  Checkbox,
  Label,
} from "semantic-ui-react";
import styled from "styled-components";
import { toast } from "react-toastify";
import { ConfirmModal } from "../widgets/modals/ConfirmModal";
import { BadgeConfigurator, BadgeConfig } from "../agents/BadgeConfigurator";

// GraphQL Queries and Mutations
const GET_CORPUS_AGENTS = gql`
  query GetCorpusAgents($corpusId: String!) {
    agentConfigurations(corpusId: $corpusId) {
      edges {
        node {
          id
          name
          slug
          description
          systemInstructions
          availableTools
          permissionRequiredTools
          badgeConfig
          avatarUrl
          scope
          isActive
          isPublic
          creator {
            id
            username
          }
          created
          modified
        }
      }
    }
  }
`;

const GET_AVAILABLE_TOOLS = gql`
  query GetAvailableTools {
    availableTools {
      name
      description
      category
      requiresCorpus
      requiresApproval
    }
    availableToolCategories
  }
`;

const CREATE_AGENT_CONFIGURATION = gql`
  mutation CreateAgentConfiguration(
    $name: String!
    $slug: String
    $description: String!
    $systemInstructions: String!
    $availableTools: [String]
    $permissionRequiredTools: [String]
    $badgeConfig: GenericScalar
    $avatarUrl: String
    $scope: String!
    $corpusId: ID
    $isPublic: Boolean
  ) {
    createAgentConfiguration(
      name: $name
      slug: $slug
      description: $description
      systemInstructions: $systemInstructions
      availableTools: $availableTools
      permissionRequiredTools: $permissionRequiredTools
      badgeConfig: $badgeConfig
      avatarUrl: $avatarUrl
      scope: $scope
      corpusId: $corpusId
      isPublic: $isPublic
    ) {
      ok
      message
      agent {
        id
        name
        slug
        description
        badgeConfig
        availableTools
        permissionRequiredTools
        isActive
        isPublic
      }
    }
  }
`;

const UPDATE_AGENT_CONFIGURATION = gql`
  mutation UpdateAgentConfiguration(
    $agentId: ID!
    $name: String
    $slug: String
    $description: String
    $systemInstructions: String
    $availableTools: [String]
    $permissionRequiredTools: [String]
    $badgeConfig: GenericScalar
    $avatarUrl: String
    $isActive: Boolean
    $isPublic: Boolean
  ) {
    updateAgentConfiguration(
      agentId: $agentId
      name: $name
      slug: $slug
      description: $description
      systemInstructions: $systemInstructions
      availableTools: $availableTools
      permissionRequiredTools: $permissionRequiredTools
      badgeConfig: $badgeConfig
      avatarUrl: $avatarUrl
      isActive: $isActive
      isPublic: $isPublic
    ) {
      ok
      message
      agent {
        id
        name
        slug
        description
        badgeConfig
        availableTools
        permissionRequiredTools
        isActive
        isPublic
      }
    }
  }
`;

const DELETE_AGENT_CONFIGURATION = gql`
  mutation DeleteAgentConfiguration($agentId: ID!) {
    deleteAgentConfiguration(agentId: $agentId) {
      ok
      message
    }
  }
`;

const Container = styled.div`
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled(Header)`
  &.ui.header {
    margin: 0;
    color: #1e293b;
    font-size: 1.25rem;
  }
`;

const HelperText = styled.p`
  color: #64748b;
  font-size: 0.875rem;
  margin: 0.5rem 0 1.5rem 0;
  line-height: 1.5;
`;

const StatusBadge = styled(Label)<{ $active: boolean }>`
  &.ui.label {
    background: ${(props) => (props.$active ? "#dcfce7" : "#fef3c7")};
    color: ${(props) => (props.$active ? "#166534" : "#92400e")};
    font-weight: 500;
    font-size: 0.75rem;
  }
`;

const ToolsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const ToolBadge = styled(Label)`
  &.ui.label {
    font-size: 0.7rem;
    background: #f1f5f9;
    color: #475569;
    padding: 0.25rem 0.5rem;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1.5rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #e2e8f0;
`;

const EmptyStateIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;

  i.icon {
    color: white;
    margin: 0;
  }
`;

const EmptyStateTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem 0;
`;

const EmptyStateDescription = styled.p`
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 1.5rem 0;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
`;

// Tool Selection UI Components
const ToolSelectionContainer = styled.div`
  margin-top: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  max-height: 300px;
  overflow-y: auto;
`;

const ToolCategoryHeader = styled.div`
  background: #f8fafc;
  padding: 0.5rem 1rem;
  font-weight: 600;
  font-size: 0.8rem;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 1;
`;

const ToolItem = styled.div<{ $selected: boolean }>`
  display: flex;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s ease;
  background: ${(props) => (props.$selected ? "#eff6ff" : "transparent")};

  &:hover {
    background: ${(props) => (props.$selected ? "#dbeafe" : "#f8fafc")};
  }

  &:last-child {
    border-bottom: none;
  }
`;

const ToolCheckbox = styled.div<{ $checked: boolean }>`
  width: 18px;
  height: 18px;
  border: 2px solid ${(props) => (props.$checked ? "#3b82f6" : "#cbd5e1")};
  border-radius: 4px;
  margin-right: 0.75rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => (props.$checked ? "#3b82f6" : "white")};
  transition: all 0.15s ease;

  &::after {
    content: "${(props) => (props.$checked ? "✓" : "")}";
    color: white;
    font-size: 12px;
    font-weight: bold;
  }
`;

const ToolInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ToolName = styled.div`
  font-weight: 500;
  color: #1e293b;
  font-size: 0.875rem;
  font-family: monospace;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ToolDescription = styled.div`
  font-size: 0.8rem;
  color: #64748b;
  margin-top: 0.25rem;
  line-height: 1.4;
`;

const ToolBadges = styled.div`
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
  flex-shrink: 0;
`;

const ApprovalBadge = styled.span`
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
  font-weight: 500;
`;

const CorpusBadge = styled.span`
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 500;
`;

const SelectedToolsPreview = styled.div`
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const SelectedToolPill = styled.span`
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: #e0e7ff;
  color: #3730a3;
  font-family: monospace;
`;

const ToolHelpText = styled.small`
  display: block;
  color: #64748b;
  margin-top: 0.5rem;
`;

interface CorpusAgentManagementProps {
  corpusId: string;
  canUpdate: boolean;
}

interface AvailableTool {
  name: string;
  description: string;
  category: string;
  requiresCorpus: boolean;
  requiresApproval: boolean;
}

interface AgentNode {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  systemInstructions: string;
  availableTools?: string[];
  permissionRequiredTools?: string[];
  badgeConfig?: Record<string, any>;
  avatarUrl?: string;
  scope: string;
  isActive: boolean;
  isPublic?: boolean;
  creator: { id: string; username: string };
  created: string;
  modified: string;
}

interface FormState {
  name: string;
  slug: string;
  description: string;
  systemInstructions: string;
  availableTools: string[];
  permissionRequiredTools: string[];
  badgeConfig: BadgeConfig;
  avatarUrl: string;
  isPublic: boolean;
  isActive: boolean;
}

const defaultBadgeConfig: BadgeConfig = {
  icon: "bot",
  color: "#8b5cf6",
  label: "AI",
};

const initialFormState: FormState = {
  name: "",
  slug: "",
  description: "",
  systemInstructions: "",
  availableTools: [],
  permissionRequiredTools: [],
  badgeConfig: defaultBadgeConfig,
  avatarUrl: "",
  isPublic: false,
  isActive: true,
};

export const CorpusAgentManagement: React.FC<CorpusAgentManagementProps> = ({
  corpusId,
  canUpdate,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentNode | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<AgentNode | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const { loading, error, data, refetch } = useQuery(GET_CORPUS_AGENTS, {
    variables: { corpusId },
  });

  // Fetch available tools for the selection UI
  const { data: toolsData, loading: toolsLoading } =
    useQuery(GET_AVAILABLE_TOOLS);

  const [createAgent, { loading: creating }] = useMutation(
    CREATE_AGENT_CONFIGURATION,
    {
      onCompleted: (data) => {
        if (data.createAgentConfiguration.ok) {
          toast.success("Agent created successfully");
          setShowCreateModal(false);
          setFormState(initialFormState);
          refetch();
        } else {
          toast.error(data.createAgentConfiguration.message);
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const [updateAgent, { loading: updating }] = useMutation(
    UPDATE_AGENT_CONFIGURATION,
    {
      onCompleted: (data) => {
        if (data.updateAgentConfiguration.ok) {
          toast.success("Agent updated successfully");
          setShowEditModal(false);
          setAgentToEdit(null);
          refetch();
        } else {
          toast.error(data.updateAgentConfiguration.message);
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const [deleteAgent, { loading: deleting }] = useMutation(
    DELETE_AGENT_CONFIGURATION,
    {
      onCompleted: (data) => {
        if (data.deleteAgentConfiguration.ok) {
          toast.success("Agent deleted successfully");
          setDeleteModalOpen(false);
          setAgentToDelete(null);
          refetch();
        } else {
          toast.error(data.deleteAgentConfiguration.message);
        }
      },
      onError: (err) => toast.error(err.message),
    }
  );

  const handleCreate = () => {
    createAgent({
      variables: {
        name: formState.name,
        slug: formState.slug || null, // null triggers auto-generation
        description: formState.description,
        systemInstructions: formState.systemInstructions,
        availableTools:
          formState.availableTools.length > 0 ? formState.availableTools : null,
        permissionRequiredTools:
          formState.permissionRequiredTools.length > 0
            ? formState.permissionRequiredTools
            : null,
        badgeConfig: formState.badgeConfig,
        avatarUrl: formState.avatarUrl || null,
        scope: "CORPUS",
        corpusId: corpusId,
        isPublic: formState.isPublic,
      },
    });
  };

  const handleUpdate = () => {
    if (!agentToEdit) return;

    updateAgent({
      variables: {
        agentId: agentToEdit.id,
        name: formState.name,
        slug: formState.slug || null,
        description: formState.description,
        systemInstructions: formState.systemInstructions,
        availableTools: formState.availableTools,
        permissionRequiredTools: formState.permissionRequiredTools,
        badgeConfig: formState.badgeConfig,
        avatarUrl: formState.avatarUrl || null,
        isActive: formState.isActive,
        isPublic: formState.isPublic,
      },
    });
  };

  // Toggle a tool in the available tools list
  const toggleAvailableTool = (toolName: string) => {
    setFormState((prev) => ({
      ...prev,
      availableTools: prev.availableTools.includes(toolName)
        ? prev.availableTools.filter((t) => t !== toolName)
        : [...prev.availableTools, toolName],
    }));
  };

  // Toggle a tool in the permission-required tools list
  const togglePermissionTool = (toolName: string) => {
    setFormState((prev) => ({
      ...prev,
      permissionRequiredTools: prev.permissionRequiredTools.includes(toolName)
        ? prev.permissionRequiredTools.filter((t) => t !== toolName)
        : [...prev.permissionRequiredTools, toolName],
    }));
  };

  // Group tools by category for display
  const groupedTools = React.useMemo(() => {
    const tools: AvailableTool[] = toolsData?.availableTools || [];
    const groups: Record<string, AvailableTool[]> = {};
    for (const tool of tools) {
      if (!groups[tool.category]) {
        groups[tool.category] = [];
      }
      groups[tool.category].push(tool);
    }
    return groups;
  }, [toolsData?.availableTools]);

  const openEditModal = (agent: AgentNode) => {
    setAgentToEdit(agent);
    // Parse badge config from API or use defaults
    const parsedBadgeConfig: BadgeConfig = {
      icon: agent.badgeConfig?.icon || defaultBadgeConfig.icon,
      color: agent.badgeConfig?.color || defaultBadgeConfig.color,
      label: agent.badgeConfig?.label || defaultBadgeConfig.label,
    };
    setFormState({
      name: agent.name,
      slug: agent.slug || "",
      description: agent.description || "",
      systemInstructions: agent.systemInstructions,
      availableTools: Array.isArray(agent.availableTools)
        ? agent.availableTools
        : [],
      permissionRequiredTools: Array.isArray(agent.permissionRequiredTools)
        ? agent.permissionRequiredTools
        : [],
      badgeConfig: parsedBadgeConfig,
      avatarUrl: agent.avatarUrl || "",
      isPublic: agent.isPublic ?? false,
      isActive: agent.isActive,
    });
    setShowEditModal(true);
  };

  if (!canUpdate) {
    return (
      <Container>
        <Message info>
          You do not have permission to manage agents for this corpus.
        </Message>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <Dimmer active inverted>
          <Loader>Loading agents...</Loader>
        </Dimmer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Message negative>
          <Message.Header>Error loading agents</Message.Header>
          <p>{error.message}</p>
        </Message>
      </Container>
    );
  }

  const agents: AgentNode[] =
    data?.agentConfigurations?.edges?.map((e: any) => e.node) || [];

  return (
    <Container>
      <SectionHeader>
        <SectionTitle as="h3">
          <Icon name="microchip" /> Corpus Agents
        </SectionTitle>
        <Button
          primary
          size="small"
          icon
          labelPosition="left"
          onClick={() => {
            setFormState(initialFormState);
            setShowCreateModal(true);
          }}
        >
          <Icon name="plus" />
          Create Agent
        </Button>
      </SectionHeader>

      <HelperText>
        Create custom AI agents specifically for this corpus. Corpus agents can
        be tailored with specialized instructions and tools for analyzing
        documents in this collection.
      </HelperText>

      {agents.length === 0 ? (
        <EmptyState>
          <EmptyStateIcon>
            <Icon name="microchip" size="large" />
          </EmptyStateIcon>
          <EmptyStateTitle>No Corpus Agents</EmptyStateTitle>
          <EmptyStateDescription>
            Create your first corpus-specific agent to provide specialized AI
            assistance for documents in this corpus.
          </EmptyStateDescription>
          <Button
            primary
            icon
            labelPosition="left"
            onClick={() => {
              setFormState(initialFormState);
              setShowCreateModal(true);
            }}
          >
            <Icon name="plus" />
            Create Agent
          </Button>
        </EmptyState>
      ) : (
        <Table basic="very" celled compact>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Description</Table.HeaderCell>
              <Table.HeaderCell>Tools</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {agents.map((agent) => (
              <Table.Row key={agent.id}>
                <Table.Cell>
                  <strong>{agent.name}</strong>
                  {agent.slug && (
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      <code>{agent.slug}</code>
                    </div>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <span style={{ fontSize: "0.875rem" }}>
                    {agent.description?.substring(0, 80)}
                    {(agent.description?.length || 0) > 80 ? "..." : ""}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <ToolsList>
                    {(Array.isArray(agent.availableTools)
                      ? agent.availableTools
                      : []
                    )
                      .slice(0, 2)
                      .map((tool) => (
                        <ToolBadge key={tool} size="tiny">
                          {tool}
                        </ToolBadge>
                      ))}
                    {(Array.isArray(agent.availableTools)
                      ? agent.availableTools
                      : []
                    ).length > 2 && (
                      <ToolBadge size="tiny">
                        +
                        {(Array.isArray(agent.availableTools)
                          ? agent.availableTools
                          : []
                        ).length - 2}
                      </ToolBadge>
                    )}
                  </ToolsList>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge $active={agent.isActive}>
                    {agent.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <Button icon size="tiny" onClick={() => openEditModal(agent)}>
                    <Icon name="edit" />
                  </Button>
                  <Button
                    icon
                    size="tiny"
                    negative
                    onClick={() => {
                      setAgentToDelete(agent);
                      setDeleteModalOpen(true);
                    }}
                  >
                    <Icon name="trash" />
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="large"
      >
        <Modal.Header>Create Corpus Agent</Modal.Header>
        <Modal.Content scrolling>
          <Form>
            <Form.Field required>
              <label>Name</label>
              <Input
                placeholder="Agent name"
                value={formState.name}
                onChange={(e) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Slug (for @mentions)</label>
              <Input
                placeholder="my-agent (auto-generated from name if empty)"
                value={formState.slug}
                onChange={(e) =>
                  setFormState({ ...formState, slug: e.target.value })
                }
              />
              <small style={{ color: "#64748b" }}>
                URL-friendly identifier used in @mentions (e.g.,
                @agent:my-agent)
              </small>
            </Form.Field>
            <Form.Field required>
              <label>Description</label>
              <TextArea
                placeholder="Brief description of what this agent does"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={2}
              />
            </Form.Field>
            <Form.Field required>
              <label>System Instructions</label>
              <TextArea
                placeholder="System prompt for the agent..."
                value={formState.systemInstructions}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    systemInstructions: e.target.value,
                  })
                }
                rows={6}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Available Tools</label>
              {toolsLoading ? (
                <Loader active inline size="small" />
              ) : (
                <>
                  <ToolSelectionContainer>
                    {Object.entries(groupedTools).map(([category, tools]) => (
                      <React.Fragment key={category}>
                        <ToolCategoryHeader>
                          {category.replace(/_/g, " ")}
                        </ToolCategoryHeader>
                        {tools.map((tool) => (
                          <ToolItem
                            key={tool.name}
                            $selected={formState.availableTools.includes(
                              tool.name
                            )}
                            onClick={() => toggleAvailableTool(tool.name)}
                          >
                            <ToolCheckbox
                              $checked={formState.availableTools.includes(
                                tool.name
                              )}
                            />
                            <ToolInfo>
                              <ToolName>{tool.name}</ToolName>
                              <ToolDescription>
                                {tool.description}
                              </ToolDescription>
                            </ToolInfo>
                            <ToolBadges>
                              {tool.requiresApproval && (
                                <ApprovalBadge>Needs Approval</ApprovalBadge>
                              )}
                              {tool.requiresCorpus && (
                                <CorpusBadge>Corpus</CorpusBadge>
                              )}
                            </ToolBadges>
                          </ToolItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </ToolSelectionContainer>
                  {formState.availableTools.length > 0 && (
                    <SelectedToolsPreview>
                      {formState.availableTools.map((tool) => (
                        <SelectedToolPill key={tool}>{tool}</SelectedToolPill>
                      ))}
                    </SelectedToolsPreview>
                  )}
                  <ToolHelpText>
                    Select the tools this agent can use. Tools marked "Needs
                    Approval" will prompt users before execution.
                  </ToolHelpText>
                </>
              )}
            </Form.Field>
            <Form.Field>
              <label>Permission Required Tools</label>
              <ToolHelpText style={{ marginTop: 0, marginBottom: "0.5rem" }}>
                Select tools that should require explicit user permission before
                the agent can use them. Only tools selected above can be marked
                as permission-required.
              </ToolHelpText>
              {formState.availableTools.length === 0 ? (
                <Message size="small" info>
                  Select available tools first to configure permission
                  requirements.
                </Message>
              ) : (
                <ToolSelectionContainer style={{ maxHeight: "150px" }}>
                  {formState.availableTools.map((toolName) => {
                    const tool = toolsData?.availableTools?.find(
                      (t: AvailableTool) => t.name === toolName
                    );
                    return (
                      <ToolItem
                        key={toolName}
                        $selected={formState.permissionRequiredTools.includes(
                          toolName
                        )}
                        onClick={() => togglePermissionTool(toolName)}
                      >
                        <ToolCheckbox
                          $checked={formState.permissionRequiredTools.includes(
                            toolName
                          )}
                        />
                        <ToolInfo>
                          <ToolName>{toolName}</ToolName>
                          {tool?.description && (
                            <ToolDescription>
                              {tool.description.substring(0, 80)}...
                            </ToolDescription>
                          )}
                        </ToolInfo>
                      </ToolItem>
                    );
                  })}
                </ToolSelectionContainer>
              )}
            </Form.Field>
            <Form.Field>
              <label>Badge Appearance</label>
              <BadgeConfigurator
                value={formState.badgeConfig}
                onChange={(config) =>
                  setFormState({ ...formState, badgeConfig: config })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Avatar URL (optional)</label>
              <Input
                placeholder="https://example.com/avatar.png"
                value={formState.avatarUrl}
                onChange={(e) =>
                  setFormState({ ...formState, avatarUrl: e.target.value })
                }
              />
              <small
                style={{
                  color: "#64748b",
                  marginTop: "0.25rem",
                  display: "block",
                }}
              >
                Custom avatar image URL. If not provided, the badge icon will be
                used.
              </small>
            </Form.Field>
            <Form.Field>
              <Checkbox
                label="Publicly visible (visible to users with corpus access)"
                checked={formState.isPublic}
                onChange={(_, data) =>
                  setFormState({ ...formState, isPublic: !!data.checked })
                }
              />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button
            primary
            loading={creating}
            disabled={
              !formState.name ||
              !formState.description ||
              !formState.systemInstructions
            }
            onClick={handleCreate}
          >
            Create Agent
          </Button>
        </Modal.Actions>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        size="large"
      >
        <Modal.Header>Edit Agent: {agentToEdit?.name}</Modal.Header>
        <Modal.Content scrolling>
          <Form>
            <Form.Field required>
              <label>Name</label>
              <Input
                placeholder="Agent name"
                value={formState.name}
                onChange={(e) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Slug (for @mentions)</label>
              <Input
                placeholder="my-agent"
                value={formState.slug}
                onChange={(e) =>
                  setFormState({ ...formState, slug: e.target.value })
                }
              />
              <small style={{ color: "#64748b" }}>
                URL-friendly identifier used in @mentions (e.g.,
                @agent:my-agent)
              </small>
            </Form.Field>
            <Form.Field required>
              <label>Description</label>
              <TextArea
                placeholder="Brief description of what this agent does"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={2}
              />
            </Form.Field>
            <Form.Field required>
              <label>System Instructions</label>
              <TextArea
                placeholder="System prompt for the agent..."
                value={formState.systemInstructions}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    systemInstructions: e.target.value,
                  })
                }
                rows={6}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Available Tools</label>
              {toolsLoading ? (
                <Loader active inline size="small" />
              ) : (
                <>
                  <ToolSelectionContainer>
                    {Object.entries(groupedTools).map(([category, tools]) => (
                      <React.Fragment key={category}>
                        <ToolCategoryHeader>
                          {category.replace(/_/g, " ")}
                        </ToolCategoryHeader>
                        {tools.map((tool) => (
                          <ToolItem
                            key={tool.name}
                            $selected={formState.availableTools.includes(
                              tool.name
                            )}
                            onClick={() => toggleAvailableTool(tool.name)}
                          >
                            <ToolCheckbox
                              $checked={formState.availableTools.includes(
                                tool.name
                              )}
                            />
                            <ToolInfo>
                              <ToolName>{tool.name}</ToolName>
                              <ToolDescription>
                                {tool.description}
                              </ToolDescription>
                            </ToolInfo>
                            <ToolBadges>
                              {tool.requiresApproval && (
                                <ApprovalBadge>Needs Approval</ApprovalBadge>
                              )}
                              {tool.requiresCorpus && (
                                <CorpusBadge>Corpus</CorpusBadge>
                              )}
                            </ToolBadges>
                          </ToolItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </ToolSelectionContainer>
                  {formState.availableTools.length > 0 && (
                    <SelectedToolsPreview>
                      {formState.availableTools.map((tool) => (
                        <SelectedToolPill key={tool}>{tool}</SelectedToolPill>
                      ))}
                    </SelectedToolsPreview>
                  )}
                  <ToolHelpText>
                    Select the tools this agent can use. Tools marked "Needs
                    Approval" will prompt users before execution.
                  </ToolHelpText>
                </>
              )}
            </Form.Field>
            <Form.Field>
              <label>Permission Required Tools</label>
              <ToolHelpText style={{ marginTop: 0, marginBottom: "0.5rem" }}>
                Select tools that should require explicit user permission before
                the agent can use them. Only tools selected above can be marked
                as permission-required.
              </ToolHelpText>
              {formState.availableTools.length === 0 ? (
                <Message size="small" info>
                  Select available tools first to configure permission
                  requirements.
                </Message>
              ) : (
                <ToolSelectionContainer style={{ maxHeight: "150px" }}>
                  {formState.availableTools.map((toolName) => {
                    const tool = toolsData?.availableTools?.find(
                      (t: AvailableTool) => t.name === toolName
                    );
                    return (
                      <ToolItem
                        key={toolName}
                        $selected={formState.permissionRequiredTools.includes(
                          toolName
                        )}
                        onClick={() => togglePermissionTool(toolName)}
                      >
                        <ToolCheckbox
                          $checked={formState.permissionRequiredTools.includes(
                            toolName
                          )}
                        />
                        <ToolInfo>
                          <ToolName>{toolName}</ToolName>
                          {tool?.description && (
                            <ToolDescription>
                              {tool.description.substring(0, 80)}...
                            </ToolDescription>
                          )}
                        </ToolInfo>
                      </ToolItem>
                    );
                  })}
                </ToolSelectionContainer>
              )}
            </Form.Field>
            <Form.Field>
              <label>Badge Appearance</label>
              <BadgeConfigurator
                value={formState.badgeConfig}
                onChange={(config) =>
                  setFormState({ ...formState, badgeConfig: config })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Avatar URL (optional)</label>
              <Input
                placeholder="https://example.com/avatar.png"
                value={formState.avatarUrl}
                onChange={(e) =>
                  setFormState({ ...formState, avatarUrl: e.target.value })
                }
              />
              <small
                style={{
                  color: "#64748b",
                  marginTop: "0.25rem",
                  display: "block",
                }}
              >
                Custom avatar image URL. If not provided, the badge icon will be
                used.
              </small>
            </Form.Field>
            <Form.Group>
              <Form.Field>
                <Checkbox
                  label="Active"
                  checked={formState.isActive}
                  onChange={(_, data) =>
                    setFormState({ ...formState, isActive: !!data.checked })
                  }
                />
              </Form.Field>
              <Form.Field>
                <Checkbox
                  label="Publicly visible"
                  checked={formState.isPublic}
                  onChange={(_, data) =>
                    setFormState({ ...formState, isPublic: !!data.checked })
                  }
                />
              </Form.Field>
            </Form.Group>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button
            primary
            loading={updating}
            disabled={
              !formState.name ||
              !formState.description ||
              !formState.systemInstructions
            }
            onClick={handleUpdate}
          >
            Save Changes
          </Button>
        </Modal.Actions>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        visible={deleteModalOpen}
        message={`Are you sure you want to delete the agent "${agentToDelete?.name}"? This action cannot be undone.`}
        yesAction={() => {
          if (agentToDelete) {
            deleteAgent({ variables: { agentId: agentToDelete.id } });
          }
        }}
        noAction={() => {
          setDeleteModalOpen(false);
          setAgentToDelete(null);
        }}
        toggleModal={() => setDeleteModalOpen(false)}
      />
    </Container>
  );
};

export default CorpusAgentManagement;
