import React, { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Button, Table, Modal, Form } from "semantic-ui-react";
import styled from "styled-components";
import { gql } from "@apollo/client";
import { toast } from "react-toastify";
import { Plus, Edit, Trash2, Cpu } from "lucide-react";
import { Input } from "@os-legal/ui";
import { ConfirmModal } from "../widgets/modals/ConfirmModal";
import { StyledTextArea } from "../widgets/modals/styled";
import { ErrorMessage, InfoMessage, LoadingState } from "../widgets/feedback";
import { AgentConfigurationType } from "../../types/graphql-api";

// GraphQL Queries and Mutations
const GET_GLOBAL_AGENTS = gql`
  query GetGlobalAgents {
    agentConfigurations(scope: "GLOBAL") {
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

const CREATE_AGENT_CONFIGURATION = gql`
  mutation CreateAgentConfiguration(
    $name: String!
    $description: String!
    $systemInstructions: String!
    $availableTools: [String]
    $permissionRequiredTools: [String]
    $badgeConfig: JSONString
    $avatarUrl: String
    $scope: String!
    $isPublic: Boolean
  ) {
    createAgentConfiguration(
      name: $name
      description: $description
      systemInstructions: $systemInstructions
      availableTools: $availableTools
      permissionRequiredTools: $permissionRequiredTools
      badgeConfig: $badgeConfig
      avatarUrl: $avatarUrl
      scope: $scope
      isPublic: $isPublic
    ) {
      ok
      message
      agent {
        id
        name
        slug
        description
      }
    }
  }
`;

const UPDATE_AGENT_CONFIGURATION = gql`
  mutation UpdateAgentConfiguration(
    $agentId: ID!
    $name: String
    $description: String
    $systemInstructions: String
    $availableTools: [String]
    $permissionRequiredTools: [String]
    $badgeConfig: JSONString
    $avatarUrl: String
    $isActive: Boolean
    $isPublic: Boolean
  ) {
    updateAgentConfiguration(
      agentId: $agentId
      name: $name
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
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
`;

const PageTitle = styled.h1`
  margin: 0;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StyledSegment = styled.div`
  padding: 1rem;
  border-radius: 12px;
  background: white;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 0.2em 0.6em;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 4px;
  background: ${(props) => (props.$active ? "#dcfce7" : "#fef3c7")};
  color: ${(props) => (props.$active ? "#166534" : "#92400e")};
`;

const ToolsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const ToolBadge = styled.span`
  display: inline-block;
  padding: 0.15em 0.4em;
  font-size: 0.75rem;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
`;

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
  description: string;
  systemInstructions: string;
  availableTools: string;
  permissionRequiredTools: string;
  badgeConfig: string;
  avatarUrl: string;
  isPublic: boolean;
  isActive: boolean;
}

const initialFormState: FormState = {
  name: "",
  description: "",
  systemInstructions: "",
  availableTools: "",
  permissionRequiredTools: "",
  badgeConfig: '{"icon": "robot", "color": "#6366f1", "label": "AI"}',
  avatarUrl: "",
  isPublic: true,
  isActive: true,
};

export const GlobalAgentManagement: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AgentNode | null>(null);
  const [agentToEdit, setAgentToEdit] = useState<AgentNode | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const { loading, error, data, refetch } = useQuery(GET_GLOBAL_AGENTS);

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
    const tools = formState.availableTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const permTools = formState.permissionRequiredTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    let badgeConfig = {};
    try {
      badgeConfig = JSON.parse(formState.badgeConfig || "{}");
    } catch (e) {
      toast.error("Invalid badge config JSON");
      return;
    }

    createAgent({
      variables: {
        name: formState.name,
        description: formState.description,
        systemInstructions: formState.systemInstructions,
        availableTools: tools.length > 0 ? tools : null,
        permissionRequiredTools: permTools.length > 0 ? permTools : null,
        badgeConfig: JSON.stringify(badgeConfig),
        avatarUrl: formState.avatarUrl || null,
        scope: "GLOBAL",
        isPublic: formState.isPublic,
      },
    });
  };

  const handleUpdate = () => {
    if (!agentToEdit) return;

    const tools = formState.availableTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const permTools = formState.permissionRequiredTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    let badgeConfig = {};
    try {
      badgeConfig = JSON.parse(formState.badgeConfig || "{}");
    } catch (e) {
      toast.error("Invalid badge config JSON");
      return;
    }

    updateAgent({
      variables: {
        agentId: agentToEdit.id,
        name: formState.name,
        description: formState.description,
        systemInstructions: formState.systemInstructions,
        availableTools: tools,
        permissionRequiredTools: permTools,
        badgeConfig: JSON.stringify(badgeConfig),
        avatarUrl: formState.avatarUrl || null,
        isActive: formState.isActive,
        isPublic: formState.isPublic,
      },
    });
  };

  const openEditModal = (agent: AgentNode) => {
    setAgentToEdit(agent);
    setFormState({
      name: agent.name,
      description: agent.description || "",
      systemInstructions: agent.systemInstructions,
      availableTools: (Array.isArray(agent.availableTools)
        ? agent.availableTools
        : []
      ).join(", "),
      permissionRequiredTools: (Array.isArray(agent.permissionRequiredTools)
        ? agent.permissionRequiredTools
        : []
      ).join(", "),
      badgeConfig: JSON.stringify(agent.badgeConfig || {}, null, 2),
      avatarUrl: agent.avatarUrl || "",
      isPublic: agent.isPublic ?? true,
      isActive: agent.isActive,
    });
    setShowEditModal(true);
  };

  const agents: AgentNode[] =
    data?.agentConfigurations?.edges?.map((e: any) => e.node) || [];

  if (loading) {
    return (
      <Container>
        <LoadingState message="Loading agents..." />
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorMessage title="Error loading agents">
          {error.message}
        </ErrorMessage>
      </Container>
    );
  }

  return (
    <Container>
      <PageHeader>
        <PageTitle>
          <Cpu size={24} /> Global Agent Management
        </PageTitle>
        <Button
          primary
          icon
          labelPosition="left"
          onClick={() => {
            setFormState(initialFormState);
            setShowCreateModal(true);
          }}
        >
          <Plus size={14} />
          Create Agent
        </Button>
      </PageHeader>

      <StyledSegment>
        {agents.length === 0 ? (
          <InfoMessage title="No Global Agents">
            Create your first global agent to make it available across all
            corpuses.
          </InfoMessage>
        ) : (
          <Table basic="very" celled>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Slug</Table.HeaderCell>
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
                  </Table.Cell>
                  <Table.Cell>
                    <code>{agent.slug || "-"}</code>
                  </Table.Cell>
                  <Table.Cell>
                    {agent.description?.substring(0, 100)}
                    {(agent.description?.length || 0) > 100 ? "..." : ""}
                  </Table.Cell>
                  <Table.Cell>
                    <ToolsList>
                      {(Array.isArray(agent.availableTools)
                        ? agent.availableTools
                        : []
                      )
                        .slice(0, 3)
                        .map((tool) => (
                          <ToolBadge key={tool}>{tool}</ToolBadge>
                        ))}
                      {(Array.isArray(agent.availableTools)
                        ? agent.availableTools
                        : []
                      ).length > 3 && (
                        <ToolBadge>
                          +
                          {(Array.isArray(agent.availableTools)
                            ? agent.availableTools
                            : []
                          ).length - 3}
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
                    <Button
                      icon
                      size="tiny"
                      onClick={() => openEditModal(agent)}
                    >
                      <Edit size={14} />
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
                      <Trash2 size={14} />
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </StyledSegment>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="large"
      >
        <Modal.Header>Create Global Agent</Modal.Header>
        <Modal.Content scrolling>
          <Form>
            <Form.Field required>
              <label>Name</label>
              <Input
                fullWidth
                placeholder="Agent name"
                value={formState.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field required>
              <label>Description</label>
              <StyledTextArea
                placeholder="Brief description of what this agent does"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={2}
                style={{ minHeight: "auto" }}
              />
            </Form.Field>
            <Form.Field required>
              <label>System Instructions</label>
              <StyledTextArea
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
              <label>Available Tools (comma-separated)</label>
              <Input
                fullWidth
                placeholder="similarity_search, load_document_text, search_exact_text"
                value={formState.availableTools}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({ ...formState, availableTools: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Permission Required Tools (comma-separated)</label>
              <Input
                fullWidth
                placeholder="Tools that require explicit permission"
                value={formState.permissionRequiredTools}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({
                    ...formState,
                    permissionRequiredTools: e.target.value,
                  })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Badge Config (JSON)</label>
              <StyledTextArea
                placeholder='{"icon": "robot", "color": "#6366f1", "label": "AI"}'
                value={formState.badgeConfig}
                onChange={(e) =>
                  setFormState({ ...formState, badgeConfig: e.target.value })
                }
                rows={3}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Avatar URL</label>
              <Input
                fullWidth
                placeholder="https://example.com/avatar.png"
                value={formState.avatarUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({ ...formState, avatarUrl: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={formState.isPublic}
                  onChange={(e) =>
                    setFormState({ ...formState, isPublic: e.target.checked })
                  }
                />
                Publicly visible
              </label>
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
                fullWidth
                placeholder="Agent name"
                value={formState.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({ ...formState, name: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field required>
              <label>Description</label>
              <StyledTextArea
                placeholder="Brief description of what this agent does"
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                rows={2}
                style={{ minHeight: "auto" }}
              />
            </Form.Field>
            <Form.Field required>
              <label>System Instructions</label>
              <StyledTextArea
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
              <label>Available Tools (comma-separated)</label>
              <Input
                fullWidth
                placeholder="similarity_search, load_document_text, search_exact_text"
                value={formState.availableTools}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({ ...formState, availableTools: e.target.value })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Permission Required Tools (comma-separated)</label>
              <Input
                fullWidth
                placeholder="Tools that require explicit permission"
                value={formState.permissionRequiredTools}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({
                    ...formState,
                    permissionRequiredTools: e.target.value,
                  })
                }
              />
            </Form.Field>
            <Form.Field>
              <label>Badge Config (JSON)</label>
              <StyledTextArea
                placeholder='{"icon": "robot", "color": "#6366f1", "label": "AI"}'
                value={formState.badgeConfig}
                onChange={(e) =>
                  setFormState({ ...formState, badgeConfig: e.target.value })
                }
                rows={3}
                style={{ fontFamily: "monospace" }}
              />
            </Form.Field>
            <Form.Field>
              <label>Avatar URL</label>
              <Input
                fullWidth
                placeholder="https://example.com/avatar.png"
                value={formState.avatarUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormState({ ...formState, avatarUrl: e.target.value })
                }
              />
            </Form.Field>
            <Form.Group>
              <Form.Field>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formState.isActive}
                    onChange={(e) =>
                      setFormState({ ...formState, isActive: e.target.checked })
                    }
                  />
                  Active
                </label>
              </Form.Field>
              <Form.Field>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formState.isPublic}
                    onChange={(e) =>
                      setFormState({ ...formState, isPublic: e.target.checked })
                    }
                  />
                  Publicly visible
                </label>
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

export default GlobalAgentManagement;
